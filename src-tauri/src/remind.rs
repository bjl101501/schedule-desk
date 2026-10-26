//! Reminder scheduler: scans tasks and raises native Windows notifications.

use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::store::{now_ms, Store};

const NOTIFIED_FILE: &str = "notified.json";

#[derive(Default, Serialize, Deserialize)]
struct Notified {
    sent: BTreeMap<String, i64>,
}

fn notified_path(dir: &PathBuf) -> PathBuf {
    dir.join(NOTIFIED_FILE)
}

fn load_notified(dir: &PathBuf) -> Notified {
    std::fs::read_to_string(notified_path(dir))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn save_notified(dir: &PathBuf, data: &Notified) {
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

fn bool_of(props: &Value, key: &str) -> bool {
    props
        .get(key)
        .and_then(|v| v.get("checkbox"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

/// Returns the list of notifications that should fire right now.
pub fn due_notifications(store: &Store, dir: &PathBuf) -> Vec<(String, String)> {
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
        let anchor = cfg.get("anchor").and_then(|v| v.as_str()).unwrap_or("");
        if anchor.is_empty() {
            continue;
        }
        let anchor_ms = match parse_anchor(anchor) {
            Some(v) => v,
            None => continue,
        };
        let offsets: Vec<i64> = cfg
            .get("offsets")
            .and_then(|v| v.as_array())
            .map(|a| a.iter().filter_map(|x| x.as_i64()).collect())
            .unwrap_or_else(|| vec![0, 5, 30, 720, 1440]);
        let read: Vec<i64> = cfg
            .get("read")
            .and_then(|v| v.as_array())
            .map(|a| a.iter().filter_map(|x| x.as_i64()).collect())
            .unwrap_or_default();

        let title = text_of(&rec.properties, "标题");
        for (idx, off) in offsets.iter().enumerate() {
            if read.contains(&(idx as i64)) {
                continue;
            }
            let trigger = anchor_ms + off * 60_000;
            if trigger > now {
                continue;
            }
            // 超过 12 小时的旧提醒不再补发，避免开机时刷屏
            if now - trigger > 12 * 3600 * 1000 {
                continue;
            }
            let key = format!("{}:{}", rec.id, idx);
            if noted.sent.contains_key(&key) {
                continue;
            }
            let when = chrono::Local::now().format("%H:%M").to_string();
            let body = if *off == 0 {
                format!("{title} · 现在该开始了（{when}）")
            } else {
                format!("{title} · 这是第 {} 次复习提醒", idx + 1)
            };
            out.push((title.clone(), body));
            noted.sent.insert(key, now);
            changed = true;
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
