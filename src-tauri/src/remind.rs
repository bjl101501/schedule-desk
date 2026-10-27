//! 提醒调度：扫描任务，按「开始时间 + 偏移」算出该发的通知。
//!
//! 文案不再用固定模板，而是按日程本身（标题、开始时间、预计时长、提醒类型）
//! 生成；所有时间一律以日程的开始时间为基准。

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::store::{now_ms, Store};

const NOTIFIED_FILE: &str = "notified.json";
/// 超过这个时间的旧提醒不再补发，避免开机时刷屏
const CATCHUP_MS: i64 = 12 * 3600 * 1000;

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

/// 艾宾浩斯节点名：5 分钟 / 30 分钟 / 12 小时 / 1 天…
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

fn body_for(offset: i64, node: usize, all_day: bool, time: &str, estimate: i64, lead: i64) -> String {
    if offset < 0 {
        if all_day {
            return "今天要做（全天）".into();
        }
        // 补发时按「还剩多久」写，而不是照抄当初设的提前量
        if lead > 0 {
            return format!("{}后开始（{}）", dur_text(lead), time);
        }
        return format!("已经到点了（{}）", time);
    }
    if offset == 0 {
        if all_day {
            return "今天要做（全天）".into();
        }
        if estimate > 0 {
            return format!("现在开始，预计 {}", dur_text(estimate));
        }
        return "到点了，未完成将记为逾期".into();
    }
    if all_day {
        format!("复习提醒 · 全天日程 · {}", stage_text(offset))
    } else {
        format!("复习提醒 · {}（第 {node} 个节点）", stage_text(offset))
    }
}

/// 返回此刻该发出去的通知。
pub fn due_notifications(store: &Store, dir: &Path) -> Vec<Due> {
    let mut noted = load_notified(dir);
    let now = now_ms();
    let mut out = Vec::new();
    let mut changed = false;

    for rec in store.table("RBTQ4jwngkyjWiZE7VqCJZ") {
        if rec.deleted || bool_of(&rec.properties, "已完成") {
            continue;
        }
        let raw = text_of(&rec.properties, "提醒设置");
        if raw.is_empty() {
            continue;
        }
        let cfg: Value = match serde_json::from_str(&raw) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let anchor = cfg.get("anchor").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if anchor.is_empty() {
            continue;
        }
        let anchor_ms = match parse_anchor(&anchor) {
            Some(v) => v,
            None => continue,
        };

        let title = {
            let t = text_of(&rec.properties, "标题");
            if t.trim().is_empty() {
                "未命名日程".to_string()
            } else {
                t
            }
        };
        let time = text_of(&rec.properties, "时间");
        let estimate = number_of(&rec.properties, "预计时长");
        let all_day = time.trim().is_empty();

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

        let lead = ((anchor_ms - now) as f64 / 60_000.0).round() as i64;
        for (idx, off) in offsets.iter().enumerate() {
            if read.contains(&(idx as i64)) {
                continue;
            }
            let trigger = anchor_ms + off * 60_000;
            if trigger > now || now - trigger > CATCHUP_MS {
                continue;
            }
            let key = format!("{}:{}", rec.id, idx);
            if noted.sent.contains_key(&key) {
                continue;
            }
            out.push(Due {
                title: title.clone(),
                body: body_for(*off, idx + 1, all_day, &time, estimate, lead),
            });
            noted.sent.insert(key, now);
            changed = true;
        }

        // 有预计时长的定时日程：即使只设了提前提醒，开始时刻也补一条「现在开始」。
        // 与 offset = 0 的提醒天然去重（那条已经在上面发过）。
        if estimate > 0 && !all_day && !offsets.contains(&0) {
            let key = format!("{}:start", rec.id);
            if !noted.sent.contains_key(&key) && anchor_ms <= now && now - anchor_ms <= CATCHUP_MS {
                out.push(Due {
                    title: title.clone(),
                    body: format!("现在开始，预计 {}", dur_text(estimate)),
                });
                noted.sent.insert(key, now);
                changed = true;
            }
        }
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
    let formats = ["%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M", "%Y-%m-%d"];
    for fmt in formats {
        if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, fmt) {
            return Some(dt.and_local_timezone(chrono::Local).single()?.timestamp_millis());
        }
        if let Ok(d) = chrono::NaiveDate::parse_from_str(s, fmt) {
            let dt = d.and_hms_opt(9, 0, 0)?;
            return Some(dt.and_local_timezone(chrono::Local).single()?.timestamp_millis());
        }
    }
    None
}
