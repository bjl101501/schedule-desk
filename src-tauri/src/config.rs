//! Application configuration (window, data directory, WebDAV credentials).

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::store::atomic_write;

const APP_DIR: &str = "ScheduleDesk";
const CONFIG_FILE: &str = "config.json";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebDav {
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
}

impl WebDav {
    pub fn configured(&self) -> bool {
        !self.url.trim().is_empty()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    #[serde(default)]
    pub version: String,
    /// Empty means "use the default directory".
    #[serde(default)]
    pub data_dir: String,
    #[serde(default)]
    pub device_id: String,
    #[serde(default)]
    pub webdav: WebDav,
    /// "owner/repo" used by the update checker.
    #[serde(default)]
    pub repo: String,
    #[serde(default)]
    pub last_sync: i64,
    #[serde(default)]
    pub first_run_done: bool,
    #[serde(default)]
    pub close_to_tray: bool,
    #[serde(default)]
    pub theme: String,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            version: env!("CARGO_PKG_VERSION").to_string(),
            data_dir: String::new(),
            device_id: String::new(),
            webdav: WebDav::default(),
            repo: "bjl101501/schedule-desk".to_string(),
            last_sync: 0,
            first_run_done: false,
            close_to_tray: true,
            theme: String::new(),
        }
    }
}

pub fn app_dir() -> PathBuf {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::temp_dir());
    base.join(APP_DIR)
}

pub fn config_path() -> PathBuf {
    app_dir().join(CONFIG_FILE)
}

pub fn default_data_dir() -> PathBuf {
    app_dir().join("data")
}

impl Config {
    pub fn load() -> Self {
        let mut cfg = fs::read_to_string(config_path())
            .ok()
            .and_then(|t| serde_json::from_str::<Config>(&t).ok())
            .unwrap_or_default();
        if cfg.device_id.is_empty() {
            cfg.device_id = new_device_id();
        }
        cfg.version = env!("CARGO_PKG_VERSION").to_string();
        cfg
    }

    pub fn save(&self) -> std::io::Result<()> {
        let dir = app_dir();
        fs::create_dir_all(&dir)?;
        let bytes = serde_json::to_vec_pretty(self).unwrap_or_default();
        atomic_write(&config_path(), &bytes)
    }

    pub fn resolved_data_dir(&self) -> PathBuf {
        let raw = self.data_dir.trim();
        if raw.is_empty() {
            default_data_dir()
        } else {
            PathBuf::from(raw)
        }
    }

    pub fn to_public_json(&self, data_dir: &std::path::Path) -> serde_json::Value {
        serde_json::json!({
            "version": self.version,
            "dataDir": data_dir.to_string_lossy(),
            "webdav": {
                "url": self.webdav.url,
                "username": self.webdav.username,
                "password": self.webdav.password,
            },
            "repo": self.repo,
            "deviceId": self.device_id,
            "lastSync": self.last_sync,
            "closeToTray": self.close_to_tray,
        })
    }
}

fn new_device_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let pid = std::process::id();
    format!("{nanos:x}-{pid:x}")
}
