//! 提醒调度：扫描任务，算出该发的通知。
//!
//! 时间模型与前端 `taskWindow()` 保持一致：
//!   开始 = 日期 + 时间（时间空 = 全天，9:00 作为提醒基准）
//!   结束 = 计划？结束日期 + 结束时间（留空 = 结束日 24:00）
//!                 ：有开始时间 + 预计用时？开始 + 时长
//!                 ：否则 开始时刻本身
//! 通知分四类：提前 / 开始 / 结束 / 逾期；错过窗口的聚合成一条「错过提醒」。

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use chrono::{Local, NaiveDate, TimeZone};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::store::{now_ms, Store};

const NOTIFIED_FILE: &str = "notified.json";
/// 超过这个时间的提醒不再单独弹窗，改为「错过提醒」聚合
const FRESH_MS: i64 = 5 * 60 * 1000;
/// 逾期超过一天的不再补发，避免第一次装软件时被历史任务刷屏
const LATE_WINDOW_MS: i64 = 24 * 3600 * 1000;
/// 一次扫描最多发几条逾期，避免开机时弹一屏
const LATE_LIMIT: usize = 3;

#[derive(Default, Serialize, Deserialize)]
struct Notified {
    sent: BTreeMap<String, i64>,
}

pub struct Due {
    pub title: String,
    pub body: String,
}

fn notified_path(dir: &Path) -> PathBuf {
    dir.join(NOTIFIED_FILE)
}

fn load_notified(dir: &Path) -> Notified {
    std::fs::read_to_string(notified_path(dir))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn save_notified(dir: &Path, data: &Notified) {
    if let Ok(bytes) = serde_json::to_vec(data) {
        let _ = crate::store::atomic_write(&notified_path(dir), &bytes);
    }
}

fn text_of(props: &Value, key: &str) -> String {
    props
        .get(key)
        .and_then(|v| v.get("text"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

fn date_of(props: &Value, key: &str) -> String {
    props
        .get(key)
        .and_then(|v| v.get("date"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

fn number_of(props: &Value, key: &str) -> i64 {
    props
        .get(key)
        .and_then(|v| v.get("number"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0) as i64
}

fn bool_of(props: &Value, key: &str) -> bool {
    props
        .get(key)
        .and_then(|v| v.get("checkbox"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

/// 分钟数转人话：45 分钟 / 1 小时 30 分 / 2 小时
fn dur_text(min: i64) -> String {
    let m = min.max(0);
    if m < 60 {
        return format!("{m} 分钟");
    }
    let h = m / 60;
    let rest = m % 60;
    if rest == 0 {
        format!("{h} 小时")
    } else {
        format!("{h} 小时 {rest} 分")
    }
}

/// 只取最大单位，用于文案里的「还有 2 天 / 剩余 3 小时」
fn coarse_text(ms: i64) -> String {
    let min = (ms.max(0) / 60_000).max(1);
    if min >= 1440 {
        format!("{} 天", min / 1440)
    } else if min >= 60 {
        format!("{} 小时", min / 60)
    } else {
        format!("{min} 分钟")
    }
}

fn stage_text(offset: i64) -> String {
    if offset <= 0 {
        "准时".into()
    } else if offset < 60 {
        format!("{offset} 分钟")
    } else if offset < 1440 {
        format!("{} 小时", offset / 60)
    } else {
        format!("{} 天", offset / 1440)
    }
}

fn parse_date(s: &str) -> Option<NaiveDate> {
    let d = s.get(0..10)?;
    NaiveDate::parse_from_str(d, "%Y-%m-%d").ok()
}

fn parse_hm(s: &str) -> Option<(u32, u32)> {
    let t = s.trim();
    let mut it = t.split(':');
    let h: u32 = it.next()?.parse().ok()?;
    let m: u32 = it.next()?.parse().ok()?;
    if h > 23 || m > 59 {
        return None;
    }
    Some((h, m))
}

fn at_ms(d: NaiveDate, h: u32, m: u32) -> Option<i64> {
    Local
        .from_local_datetime(&d.and_hms_opt(h, m, 0)?)
        .single()
        .map(|x| x.timestamp_millis())
}

/// 与前端一致的窗口：开始、结束、是否全天、是否有明确结束时刻
struct Window {
    start: i64,
    end: i64,
    all_day: bool,
    has_end: bool,
}

fn window_of(props: &Value, anchor_ms: i64) -> Option<Window> {
    let time = text_of(props, "时间");
    let all_day = time.trim().is_empty();
    let est = number_of(props, "预计时长").max(0);
    let plan = bool_of(props, "计划");
    let end_date = date_of(props, "结束日期");
    let end_time = text_of(props, "结束时间");
    let start_date = date_of(props, "日期");

    let mut end = anchor_ms;
    let mut has_end = false;

    if plan {
        if let Some(ed) = parse_date(&end_date) {
            match parse_hm(&end_time) {
                Some((h, m)) => {
                    if let Some(ms) = at_ms(ed, h, m) {
                        end = ms;
                        has_end = true;
                    }
                }
                None => {
                    // 结束日 24:00
                    if let Some(next) = ed.succ_opt() {
                        if let Some(ms) = at_ms(next, 0, 0) {
                            end = ms;
                        }
                    }
                }
            }
        }
    } else if !all_day && est > 0 {
        end = anchor_ms + est * 60_000;
        has_end = true;
    } else if all_day {
        if let Some(sd) = parse_date(&start_date) {
            if let Some(next) = sd.succ_opt() {
                if let Some(ms) = at_ms(next, 0, 0) {
                    end = ms;
                }
            }
        }
    }

    if end < anchor_ms {
        end = anchor_ms;
    }
    Some(Window { start: anchor_ms, end: end, all_day: all_day, has_end: has_end })
}

fn hm_of(ms: i64) -> String {
    Local
        .timestamp_millis_opt(ms)
        .single()
        .map(|d| d.format("%H:%M").to_string())
        .unwrap_or_default()
}

fn md_hm_of(ms: i64) -> String {
    Local
        .timestamp_millis_opt(ms)
        .single()
        .map(|d| d.format("%m-%d %H:%M").to_string())
        .unwrap_or_default()
}

/// 返回此刻该发出去的通知，以及（可选）一条聚合的「错过提醒」。
pub fn due_notifications(store: &Store, dir: &Path) -> Vec<Due> {
    let mut noted = load_notified(dir);
    let now = now_ms();
    let mut out: Vec<Due> = Vec::new();
    let mut missed: Vec<String> = Vec::new();
    let mut late_sent = 0usize;
    let mut changed = false;

    for rec in store.table("RBTQ4jwngkyjWiZE7VqCJZ") {
        if rec.deleted || bool_of(&rec.properties, "已完成") {
            continue;
        }
        let props = &rec.properties;
        let raw = text_of(props, "提醒设置");
        let cfg: Value = if raw.is_empty() {
            Value::Null
        } else {
            serde_json::from_str(&raw).unwrap_or(Value::Null)
        };
        let anchor = cfg.get("anchor").and_then(|v| v.as_str()).unwrap_or("");
        let anchor_ms = match parse_anchor(anchor) {
            Some(v) => v,
            None => continue,
        };
        let win = match window_of(props, anchor_ms) {
            Some(w) => w,
            None => continue,
        };
        let title = {
            let t = text_of(props, "标题");
            if t.trim().is_empty() {
                "未命名日程".to_string()
            } else {
                t
            }
        };
        let estimate = number_of(props, "预计时长").max(0);
        let is_eb = text_of(props, "提醒模式") == "艾宾浩斯";

        let offsets: Vec<i64> = cfg
            .get("offsets")
            .and_then(|v| v.as_array())
            .map(|a| a.iter().filter_map(|x| x.as_i64()).collect())
            .unwrap_or_else(|| vec![0]);
        let read: Vec<i64> = cfg
            .get("read")
            .and_then(|v| v.as_array())
            .map(|a| a.iter().filter_map(|x| x.as_i64()).collect())
            .unwrap_or_default();
        let snooze = cfg.get("snooze").and_then(|v| v.as_i64()).unwrap_or(0);
        let end_remind = cfg.get("end").and_then(|v| v.as_i64()).unwrap_or(0) == 1;

        // ---- 开始侧：提前 / 准时 ----
        for (idx, off) in offsets.iter().enumerate() {
            if read.contains(&(idx as i64)) {
                continue;
            }
            let trigger = win.start + off * 60_000;
            if trigger > now {
                continue;
            }
            let key = format!("{}:{}", rec.id, idx);
            if noted.sent.contains_key(&key) {
                continue;
            }
            let fresh = now - trigger <= FRESH_MS;
            let body = if is_eb && *off > 0 {
                let total = offsets.len();
                if win.all_day {
                    format!("复习提醒 · 第 {}/{} 次 · 全天日程", idx + 1, total)
                } else {
                    format!("复习提醒 · 第 {}/{} 次（{}）", idx + 1, total, stage_text(*off))
                }
            } else if *off < 0 {
                if win.all_day {
                    "今天要做（全天）".to_string()
                } else if now >= win.start {
                    format!("原定 {} 开始，提醒来晚了，请查看日程", hm_of(win.start))
                } else {
                    format!("将在 {} 开始，还有 {}", hm_of(win.start), coarse_text(win.start - now))
                }
            } else if win.all_day {
                "今天要做（全天）".to_string()
            } else if estimate > 0 {
                format!("现在开始，预计 {}", dur_text(estimate))
            } else {
                format!("现在开始（{}）", hm_of(win.start))
            };
            if fresh {
                out.push(Due { title: title.clone(), body });
            } else {
                missed.push(format!(
                    "{} {} 开始",
                    title,
                    hm_of(win.start)
                ));
            }
            noted.sent.insert(key, now);
            changed = true;
        }

        // ---- 结束侧：沿用同一套提前量，勾了「结束提醒」才发 ----
        if end_remind && win.has_end && win.end > win.start {
            for (idx, off) in offsets.iter().enumerate() {
                if read.contains(&(idx as i64)) {
                    continue;
                }
                let trigger = win.end + off * 60_000;
                if trigger > now {
                    continue;
                }
                let key = format!("{}:end:{}", rec.id, idx);
                if noted.sent.contains_key(&key) {
                    continue;
                }
                let fresh = now - trigger <= FRESH_MS;
                let body = if now >= win.end {
                    format!("已到结束时间（{}），还没完成吗", hm_of(win.end))
                } else {
                    format!("还有 {} 结束（{}）", coarse_text(win.end - now), hm_of(win.end))
                };
                if fresh {
                    out.push(Due { title: title.clone(), body });
                } else {
                    missed.push(format!("{} 的结束提醒（{}）", title, hm_of(win.end)));
                }
                noted.sent.insert(key, now);
                changed = true;
            }
        }

        // ---- 逾期：跨过结束点且未完成，只发一次 ----
        if now > win.end {
            let key = format!("{}:late", rec.id);
            if !noted.sent.contains_key(&key) {
                noted.sent.insert(key, now);
                changed = true;
                if now - win.end <= LATE_WINDOW_MS && late_sent < LATE_LIMIT {
                    late_sent += 1;
                    out.push(Due {
                        title: title.clone(),
                        body: format!("已在 {} 逾期，尚未完成", md_hm_of(win.end)),
                    });
                }
            }
        }

        // ---- 稍后提醒 ----
        if snooze > 0 {
            for idx in 0..offsets.len() {
                let snz = format!("{}:{}:snz", rec.id, idx);
                if noted.sent.contains_key(&snz) {
                    continue;
                }
                let sent_at = match noted.sent.get(&format!("{}:{}", rec.id, idx)) {
                    Some(v) => *v,
                    None => continue,
                };
                if now - sent_at < snooze * 60_000 || now - sent_at > FRESH_MS * 3 {
                    continue;
                }
                let body = if win.all_day {
                    "稍后提醒 · 今天还没完成".to_string()
                } else {
                    format!("稍后提醒 · 原定 {} 开始，还没完成吗", hm_of(win.start))
                };
                out.push(Due { title: title.clone(), body });
                noted.sent.insert(snz, now);
                changed = true;
            }
        }
    }

    // 错过的一律聚合成一条，避免开机时弹一屏
    if !missed.is_empty() {
        let n = missed.len();
        let head: Vec<String> = missed.iter().take(3).cloned().collect();
        let tail = if n > 3 { format!("；等 {n} 条") } else { String::new() };
        out.push(Due {
            title: format!("错过 {n} 条提醒"),
            body: format!("{}{}。请查看您的日程", head.join("；"), tail),
        });
    }

    // 清理 7 天前的发送记录
    let cutoff = now - 7 * 24 * 3600 * 1000;
    let before = noted.sent.len();
    noted.sent.retain(|_, ts| *ts >= cutoff);
    if noted.sent.len() != before {
        changed = true;
    }
    if changed {
        save_notified(dir, &noted);
    }
    out
}

fn parse_anchor(s: &str) -> Option<i64> {
    let s = s.trim();
    if s.is_empty() {
        return None;
    }
    let (date_part, time_part) = match s.split_once(' ') {
        Some((d, t)) => (d, Some(t)),
        None => match s.split_once('T') {
            Some((d, t)) => (d, Some(t)),
            None => (s, None),
        },
    };
    let d = NaiveDate::parse_from_str(date_part.get(0..10)?, "%Y-%m-%d").ok()?;
    let (h, m) = time_part.and_then(parse_hm).unwrap_or((9, 0));
    at_ms(d, h, m)
}
