//! Minimal WebDAV client + record-level merge.

use crate::config::WebDav;
use crate::net;
use crate::store::Store;

pub struct SyncOutcome {
    pub pulled: usize,
    pub pushed: usize,
    pub merged_remote: usize,
}

fn agent() -> ureq::Agent {
    net::agent(40)
}

fn auth_header(user: &str, pass: &str) -> String {
    format!("Basic {}", base64(format!("{user}:{pass}").as_bytes()))
}

fn endpoint(base: &str, name: &str) -> String {
    let trimmed = base.trim().trim_end_matches('/');
    format!("{trimmed}/{name}")
}

/// PUT an empty-ish PROPFIND to verify credentials and folder access.
pub fn test(cfg: &WebDav) -> Result<(), String> {
    if !cfg.configured() {
        return Err("请先填写 WebDAV 地址".into());
    }
    let url = endpoint(&cfg.url, "schedule.json");
    let resp = agent()
        .request("PROPFIND", &url)
        .set("Authorization", &auth_header(&cfg.username, &cfg.password))
        .set("Depth", "0")
        .call();
    match resp {
        Ok(_) => Ok(()),
        Err(ureq::Error::Status(404, _)) => Ok(()), // 文件不存在也算连通
        Err(ureq::Error::Status(code, _)) => Err(format!("服务器返回 {code}，请检查地址或账号")),
        Err(e) => Err(format!("无法连接：{}", net::describe(&e))),
    }
}

fn download(cfg: &WebDav) -> Result<Option<Store>, String> {
    let url = endpoint(&cfg.url, "schedule.json");
    match agent()
        .get(&url)
        .set("Authorization", &auth_header(&cfg.username, &cfg.password))
        .call()
    {
        Ok(resp) => {
            let text = resp.into_string().map_err(|e| format!("读取失败：{e}"))?;
            if text.trim().is_empty() {
                return Ok(None);
            }
            serde_json::from_str::<Store>(&text)
                .map(Some)
                .map_err(|e| format!("远端数据格式不对：{e}"))
        }
        Err(ureq::Error::Status(404, _)) => Ok(None),
        Err(ureq::Error::Status(code, _)) => Err(format!("下载失败，服务器返回 {code}")),
        Err(e) => Err(format!("下载失败：{}", net::describe(&e))),
    }
}

fn upload(cfg: &WebDav, store: &Store) -> Result<(), String> {
    let url = endpoint(&cfg.url, "schedule.json");
    let body = serde_json::to_vec_pretty(store).map_err(|e| e.to_string())?;
    match agent()
        .put(&url)
        .set("Authorization", &auth_header(&cfg.username, &cfg.password))
        .set("Content-Type", "application/json; charset=utf-8")
        .send_bytes(&body)
    {
        Ok(_) => Ok(()),
        Err(ureq::Error::Status(code, _)) => Err(format!("上传失败，服务器返回 {code}")),
        Err(e) => Err(format!("上传失败：{}", net::describe(&e))),
    }
}

/// Pull, merge by record timestamp, push the merged result back.
pub fn sync(store: &mut Store, cfg: &WebDav) -> Result<SyncOutcome, String> {
    if !cfg.configured() {
        return Err("未配置 WebDAV".into());
    }
    let remote = download(cfg)?;
    let mut merged_remote = 0usize;
    if let Some(remote_store) = remote {
        let (_, remote_wins) = store.merge_from(&remote_store);
        merged_remote = remote_wins;
    }
    if store.device_id.is_empty() {
        store.device_id = cfg.username.clone();
    }
    upload(cfg, store)?;
    let pushed = store.tables.values().map(|v| v.len()).sum();
    Ok(SyncOutcome {
        pulled: store.tables.values().map(|v| v.len()).sum(),
        pushed,
        merged_remote,
    })
}

fn base64(input: &[u8]) -> String {
    const T: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((input.len() + 2) / 3 * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(T[((n >> 18) & 63) as usize] as char);
        out.push(T[((n >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 {
            T[((n >> 6) & 63) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            T[(n & 63) as usize] as char
        } else {
            '='
        });
    }
    out
}
