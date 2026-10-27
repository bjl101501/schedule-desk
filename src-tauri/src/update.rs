//! GitHub release based updater: check, download, swap, restart.

use std::fs;
use std::path::PathBuf;

use serde::Serialize;

use crate::net;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseInfo {
    pub available: bool,
    pub version: String,
    pub current: String,
    pub notes: String,
    pub url: String,
    pub asset: String,
}

fn parse_version(v: &str) -> (u64, u64, u64) {
    let cleaned = v.trim().trim_start_matches(['v', 'V']);
    let mut parts = cleaned.split(['.', '-', '+']);
    let major = parts.next().and_then(|x| x.parse().ok()).unwrap_or(0);
    let minor = parts.next().and_then(|x| x.parse().ok()).unwrap_or(0);
    let patch = parts.next().and_then(|x| x.parse().ok()).unwrap_or(0);
    (major, minor, patch)
}

pub fn check(repo: &str, current: &str) -> Result<ReleaseInfo, String> {
    if repo.trim().is_empty() {
        return Err("尚未配置更新仓库（设置 → 软件更新 → 仓库标识 owner/repo）".into());
    }
    let url = format!("https://api.github.com/repos/{}/releases/latest", repo.trim());
    let resp = net::agent(120)
        .get(&url)
        .set("User-Agent", "ScheduleDesk-Updater")
        .set("Accept", "application/vnd.github+json")
        .call()
        .map_err(|e| format!("查询失败：{}", net::describe(&e)))?;
    let json: serde_json::Value = resp.into_json().map_err(|e| format!("解析失败：{e}"))?;

    let tag = json
        .get("tag_name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let notes = json
        .get("body")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let mut asset_url = String::new();
    let mut asset_name = String::new();
    if let Some(list) = json.get("assets").and_then(|v| v.as_array()) {
        for item in list {
            let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let lower = name.to_lowercase();
            if lower.ends_with(".exe") {
                asset_name = name.to_string();
                asset_url = item
                    .get("browser_download_url")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                break;
            }
        }
    }
    if asset_url.is_empty() {
        return Err("该版本没有可下载的 exe 文件".into());
    }

    let latest = parse_version(&tag);
    let mine = parse_version(current);
    Ok(ReleaseInfo {
        available: latest > mine,
        version: tag,
        current: current.to_string(),
        notes,
        url: asset_url,
        asset: asset_name,
    })
}

/// Download the new binary and schedule a swap after this process exits.
pub fn install(url: &str, asset: &str) -> Result<(), String> {
    let current_exe = std::env::current_exe().map_err(|e| format!("定位程序失败：{e}"))?;
    let work = std::env::temp_dir().join("ScheduleDesk_update");
    let _ = fs::create_dir_all(&work);
    let new_exe = work.join(if asset.is_empty() {
        "ScheduleDesk.new.exe"
    } else {
        asset
    });

    let resp = net::agent(120)
        .get(url)
        .set("User-Agent", "ScheduleDesk-Updater")
        .call()
        .map_err(|e| format!("下载失败：{}", net::describe(&e)))?;
    let mut file = fs::File::create(&new_exe).map_err(|e| format!("写入失败：{e}"))?;
    std::io::copy(&mut resp.into_reader(), &mut file).map_err(|e| format!("保存失败：{e}"))?;
    drop(file);

    if new_exe.metadata().map(|m| m.len()).unwrap_or(0) < 100_000 {
        return Err("下载的文件不完整".into());
    }

    let bat = work.join("apply_update.bat");
    let script = format!(
        "@echo off\r\n\
         chcp 65001 >nul\r\n\
         :wait\r\n\
         timeout /t 2 /nobreak >nul\r\n\
         copy /y \"{new}\" \"{cur}\" >nul 2>&1\r\n\
         if errorlevel 1 goto wait\r\n\
         start \"\" \"{cur}\"\r\n\
         timeout /t 1 /nobreak >nul\r\n\
         del \"%~f0\"\r\n",
        new = new_exe.display(),
        cur = current_exe.display()
    );
    fs::write(&bat, script).map_err(|e| format!("准备更新脚本失败：{e}"))?;

    spawn_hidden(&bat)?;
    Ok(())
}

#[cfg(windows)]
fn spawn_hidden(bat: &PathBuf) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    Command::new("cmd")
        .args(["/C", &bat.to_string_lossy()])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("启动更新进程失败：{e}"))
}

#[cfg(not(windows))]
fn spawn_hidden(_bat: &PathBuf) -> Result<(), String> {
    Err("仅支持 Windows".into())
}
