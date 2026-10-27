//! 系统通知出口。
//!
//! 统一走 notify-rust：它在 Windows 上把 `Urgency::Critical` 映射为 toast 的
//! `Scenario::Reminder`，通知会一直留在屏幕上，直到用户点关闭。
//! tauri-plugin-notification 没有暴露 urgency，做不到这一点。

use notify_rust::{Notification, Timeout, Urgency};

/// `critical = true` 时使用提醒场景（常驻）。
/// 返回错误而不是吞掉：通知通道失败时，用户至少能在诊断命令里看到原因。
pub fn send(app_id: &str, title: &str, body: &str, critical: bool) -> Result<(), String> {
    let mut n = Notification::new();
    n.app_id(app_id).summary(title).body(body);
    // Windows 上 duration=long；配合 reminder 场景常驻，避免一闪而过
    n.timeout(Timeout::Never);
    if critical {
        n.urgency(Urgency::Critical);
    }
    n.show().map(|_| ()).map_err(|e| e.to_string())
}
