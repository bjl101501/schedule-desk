//! 统一的 HTTP 客户端入口。
//!
//! ureq 2.x 的 `native-tls` 特性只是把 `ureq::native_tls` 模块暴露出来，
//! 注释里写得很明确：it is never picked up as a default。
//! 也就是说关掉默认特性（rustls）之后，必须在 AgentBuilder 上显式注入连接器，
//! 否则所有 https 请求都会报 “no TLS backend is configured”。
//!
//! 这里用 Windows 自带的 schannel：读系统证书库、跟随系统代理，体积也最小。

use std::sync::Arc;
use std::time::Duration;

use ureq::{Agent, AgentBuilder};

/// 建一个带 native-tls 的 agent。`timeout_secs` 是整次请求的总超时。
pub fn agent(timeout_secs: u64) -> Agent {
    let tls = ureq::native_tls::TlsConnector::builder()
        .build()
        .expect("初始化系统 TLS 失败");
    AgentBuilder::new()
        .tls_connector(Arc::new(tls))
        .timeout_connect(Duration::from_secs(10))
        .timeout(Duration::from_secs(timeout_secs))
        .build()
}

/// 把底层英文错误翻成人话，原始信息留在括号里方便排查。
pub fn describe(err: &ureq::Error) -> String {
    match err {
        ureq::Error::Status(code, _) => match *code {
            401 | 403 => "服务器拒绝访问（401/403）。GitHub 接口未登录时每小时限 60 次，稍后再试".into(),
            404 => "目标不存在（404），请检查地址或仓库标识".into(),
            429 => "请求过于频繁（429），请稍后再试".into(),
            c if c >= 500 => format!("服务器出错（{c}），稍后再试"),
            c => format!("服务器返回 {c}"),
        },
        ureq::Error::Transport(t) => {
            let raw = t.to_string();
            let lower = raw.to_lowercase();
            let hint = if lower.contains("certificate") || lower.contains("tls") || lower.contains("handshake") {
                "TLS 握手失败，可能是证书或代理拦截"
            } else if lower.contains("dns") || lower.contains("resolve") {
                "域名解析失败，请检查网络或 DNS"
            } else if lower.contains("timed out") || lower.contains("timeout") {
                "连接超时，请检查网络"
            } else if lower.contains("connection refused") || lower.contains("connection failed") {
                "无法建立连接，请检查网络或代理"
            } else {
                "网络请求失败"
            };
            format!("{hint}（{raw}）")
        }
    }
}
