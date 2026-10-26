#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod remind;
mod store;
mod sync;
mod update;

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_notification::NotificationExt;

use config::Config;
use store::{Op, Store};

const APP_TITLE: &str = "日程台 · 个人日程工作台";
const MAIN_WINDOW: &str = "main";
const DB_FILE: &str = "schedule.json";
const NOTIFIED_FILE: &str = "notified.json";
const SNAPSHOT_DIR: &str = "snapshots";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub mode: String,
    pub text: String,
    #[serde(default)]
    pub detail: String,
}

impl Default for SyncStatus {
    fn default() -> Self {
        Self {
            mode: "local".into(),
            text: "本地模式".into(),
            detail: "数据只保存在本机".into(),
        }
    }
}

pub struct AppState {
    pub config: Mutex<Config>,
    pub store: Mutex<Store>,
    pub sync: Mutex<SyncStatus>,
    pub data_dir: PathBuf,
}

fn data_dir_of(app: &AppHandle) -> PathBuf {
    app.state::<AppState>().data_dir.clone()
}

// ---------------------------------------------------------------- commands

/// 页面启动时主动拉取：数据、配置、是否首次运行。
#[tauri::command]
fn db_bootstrap(app: AppHandle, state: State<'_, AppState>) -> serde_json::Value {
    let dir = data_dir_of(&app);
    let store = match state.store.lock() {
        Ok(s) => s,
        Err(_) => return serde_json::json!({ "tables": {}, "config": {}, "firstRun": false }),
    };
    let cfg = match state.config.lock() {
        Ok(c) => c,
        Err(_) => return serde_json::json!({ "tables": {}, "config": {}, "firstRun": false }),
    };
    serde_json::json!({
        "tables": store.tables,
        "config": cfg.to_public_json(&dir),
        "firstRun": !cfg.first_run_done,
        "version": env!("CARGO_PKG_VERSION"),
    })
}

#[tauri::command]
fn db_apply(app: AppHandle, state: State<'_, AppState>, ops: Vec<Op>) -> Result<(), String> {
    if ops.is_empty() {
        return Ok(());
    }
    let dir = data_dir_of(&app);
    let mut store = state.store.lock().map_err(|e| e.to_string())?;
    store.apply(ops);
    store.save(&dir).map_err(|e| e.to_string())?;
    store.snapshot_daily(&dir);
    Ok(())
}

#[tauri::command]
fn db_import_legacy(
    app: AppHandle,
    state: State<'_, AppState>,
    tables: serde_json::Value,
) -> Result<(), String> {
    let dir = data_dir_of(&app);
    let mut store = state.store.lock().map_err(|e| e.to_string())?;
    if let Some(map) = tables.as_object() {
        for (table_id, rows) in map {
            if let Some(list) = rows.as_array() {
                let bucket = store.table_mut(table_id);
                for row in list {
                    let id = row.get("id").and_then(|v| v.as_str()).unwrap_or("");
                    if id.is_empty() || bucket.iter().any(|r| r.id == id) {
                        continue;
                    }
                    bucket.push(store::Record {
                        id: id.to_string(),
                        properties: row.get("properties").cloned().unwrap_or_default(),
                        created_at: row.get("createdAt").and_then(|v| v.as_i64()).unwrap_or(1),
                        updated_at: row.get("updatedAt").and_then(|v| v.as_i64()).unwrap_or(1),
                        deleted: false,
                    });
                }
            }
        }
    }
    store.revision += 1;
    store.save(&dir).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn sync_status(state: State<'_, AppState>) -> SyncStatus {
    state.sync.lock().map(|s| s.clone()).unwrap_or_default()
}

#[tauri::command]
fn default_data_dir() -> String {
    config::default_data_dir().to_string_lossy().to_string()
}

#[tauri::command]
async fn choose_data_dir_quiet(app: AppHandle) -> Result<serde_json::Value, String> {
    match pick_folder(&app).await {
        Some(path) => Ok(serde_json::json!({ "ok": true, "dir": path })),
        None => Ok(serde_json::json!({ "ok": false })),
    }
}

#[tauri::command]
async fn choose_data_dir(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let picked = match pick_folder(&app).await {
        Some(p) => PathBuf::from(p),
        None => return Ok(serde_json::json!({ "ok": false })),
    };
    let target = picked.join("ScheduleDeskData");
    let current = data_dir_of(&app);
    if target == current {
        return Ok(serde_json::json!({ "ok": false, "error": "已经是当前目录" }));
    }
    if let Err(err) = migrate_dir(&current, &target) {
        return Ok(serde_json::json!({ "ok": false, "error": err }));
    }
    let mut cfg = state.config.lock().map_err(|e| e.to_string())?;
    cfg.data_dir = target.to_string_lossy().to_string();
    cfg.save().map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "ok": true, "dir": target.to_string_lossy() }))
}

#[tauri::command]
fn finish_onboarding(
    app: AppHandle,
    state: State<'_, AppState>,
    dir: String,
) -> Result<serde_json::Value, String> {
    let current = data_dir_of(&app);
    let mut cfg = state.config.lock().map_err(|e| e.to_string())?;
    if !dir.trim().is_empty() {
        let target = PathBuf::from(dir.trim()).join("ScheduleDeskData");
        if target != current {
            migrate_dir(&current, &target)?;
            cfg.data_dir = target.to_string_lossy().to_string();
        }
    }
    cfg.first_run_done = true;
    cfg.save().map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
fn data_dir_info(app: AppHandle) -> serde_json::Value {
    let dir = data_dir_of(&app);
    serde_json::json!({
        "dataDir": dir.to_string_lossy(),
        "version": env!("CARGO_PKG_VERSION"),
    })
}

#[tauri::command]
fn open_data_dir(app: AppHandle) {
    let dir = data_dir_of(&app);
    let _ = fs::create_dir_all(&dir);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("explorer")
            .arg(dir)
            .creation_flags(0x0800_0000)
            .spawn();
    }
}

#[tauri::command]
fn restart_app(app: AppHandle) {
    // 直接 spawn 会和单实例互斥体撞车：旧进程还没退出，新进程就被判定为重复实例。
    // 交给一个延迟脚本，等本进程真正退出后再拉起。
    if let Ok(exe) = std::env::current_exe() {
        let bat = std::env::temp_dir().join("ScheduleDesk_restart.bat");
        let script = format!(
            "@echo off\r\ntimeout /t 2 /nobreak >nul\r\nstart \"\" \"{}\"\r\ndel \"%~f0\"\r\n",
            exe.display()
        );
        if fs::write(&bat, script).is_ok() {
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                let _ = std::process::Command::new("cmd")
                    .args(["/C", &bat.to_string_lossy()])
                    .creation_flags(0x0800_0000)
                    .spawn();
            }
        }
    }
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(150));
        app.exit(0);
    });
}

#[tauri::command]
fn webdav_test(url: String, username: String, password: String) -> serde_json::Value {
    let cfg = config::WebDav {
        url,
        username,
        password,
    };
    match sync::test(&cfg) {
        Ok(()) => serde_json::json!({ "ok": true }),
        Err(e) => serde_json::json!({ "ok": false, "error": e }),
    }
}

#[tauri::command]
fn webdav_save_and_sync(
    app: AppHandle,
    state: State<'_, AppState>,
    url: String,
    username: String,
    password: String,
) -> serde_json::Value {
    {
        let mut cfg = match state.config.lock() {
            Ok(c) => c,
            Err(e) => return serde_json::json!({ "ok": false, "error": e.to_string() }),
        };
        cfg.webdav = config::WebDav {
            url,
            username,
            password,
        };
        if let Err(e) = cfg.save() {
            return serde_json::json!({ "ok": false, "error": e.to_string() });
        }
    }
    run_sync(&app)
}

fn run_sync(app: &AppHandle) -> serde_json::Value {
    let state = app.state::<AppState>();
    let dir = state.data_dir.clone();
    let cfg = match state.config.lock() {
        Ok(c) => c.webdav.clone(),
        Err(e) => return serde_json::json!({ "ok": false, "error": e.to_string() }),
    };
    if let Ok(mut st) = state.sync.lock() {
        *st = SyncStatus {
            mode: "syncing".into(),
            text: "同步中".into(),
            detail: String::new(),
        };
    }
    let outcome = {
        let mut store = match state.store.lock() {
            Ok(s) => s,
            Err(e) => return serde_json::json!({ "ok": false, "error": e.to_string() }),
        };
        match sync::sync(&mut store, &cfg) {
            Ok(o) => {
                let _ = store.save(&dir);
                Ok(o)
            }
            Err(e) => Err(e),
        }
    };

    match outcome {
        Ok(o) => {
            let text = format!("已同步 · 合并远端 {} 条", o.merged_remote);
            if let Ok(mut st) = state.sync.lock() {
                *st = SyncStatus {
                    mode: "synced".into(),
                    text: "已同步".into(),
                    detail: text.clone(),
                };
            }
            if let Ok(mut c) = state.config.lock() {
                c.last_sync = store::now_ms();
                let _ = c.save();
            }
            serde_json::json!({ "ok": true, "text": text })
        }
        Err(e) => {
            if let Ok(mut st) = state.sync.lock() {
                *st = SyncStatus {
                    mode: "error".into(),
                    text: "同步失败".into(),
                    detail: e.clone(),
                };
            }
            serde_json::json!({ "ok": false, "error": e })
        }
    }
}

#[tauri::command]
fn export_file(app: AppHandle, name: String, content: String) -> Result<String, String> {
    let dir = app
        .path()
        .download_dir()
        .or_else(|_| app.path().home_dir().map(|p| p.join("Downloads")))
        .map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let target = unique_path(&dir, &sanitize(&name));
    fs::write(&target, content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
fn update_check(state: State<'_, AppState>) -> serde_json::Value {
    let repo = state
        .config
        .lock()
        .map(|c| c.repo.clone())
        .unwrap_or_default();
    match update::check(&repo, env!("CARGO_PKG_VERSION")) {
        Ok(info) => serde_json::to_value(info)
            .unwrap_or_else(|_| serde_json::json!({ "available": false })),
        Err(e) => serde_json::json!({ "available": false, "error": e }),
    }
}

#[tauri::command]
fn update_install(app: AppHandle, state: State<'_, AppState>) -> serde_json::Value {
    let repo = state
        .config
        .lock()
        .map(|c| c.repo.clone())
        .unwrap_or_default();
    let info = match update::check(&repo, env!("CARGO_PKG_VERSION")) {
        Ok(i) => i,
        Err(e) => return serde_json::json!({ "ok": false, "error": e }),
    };
    if !info.available {
        return serde_json::json!({ "ok": false, "error": "已是最新版本" });
    }
    match update::install(&info.url, &info.asset) {
        Ok(()) => {
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(400));
                app.exit(0);
            });
            serde_json::json!({ "ok": true })
        }
        Err(e) => serde_json::json!({ "ok": false, "error": e }),
    }
}

#[tauri::command]
fn notify_now(app: AppHandle, title: String, body: String) {
    let _ = app.notification().builder().title(title).body(body).show();
}

// ---------------------------------------------------------------- helpers

async fn pick_folder(app: &AppHandle) -> Option<String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog().file().pick_folder(move |path| {
        let _ = tx.send(path.map(|p| p.to_string()));
    });
    rx.recv_timeout(Duration::from_secs(300)).ok().flatten()
}

/// v1 桌面版把数据写在 `%APPDATA%\com.scheduledesk.app\data.json`，
/// 结构是 `{ tableId: [ {id, properties, createdAt, updatedAt} ] }`。
/// 新目录为空时把它整体搬过来，避免升级后看起来"数据没了"。
fn import_legacy_v1(target_dir: &PathBuf) -> bool {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    let legacy = base.join("com.scheduledesk.app").join("data.json");
    if !legacy.exists() {
        return false;
    }
    if target_dir.join(DB_FILE).exists() {
        return false;
    }
    let text = match fs::read_to_string(&legacy) {
        Ok(t) => t,
        Err(_) => return false,
    };
    let tables: std::collections::BTreeMap<String, Vec<store::Record>> =
        match serde_json::from_str(&text) {
            Ok(t) => t,
            Err(_) => return false,
        };
    if tables.values().all(|rows| rows.is_empty()) {
        return false;
    }
    let mut store = Store::default();
    store.tables = tables;
    store.revision = 1;
    store.updated_at = store::now_ms();
    let _ = fs::create_dir_all(target_dir);
    if store.save(target_dir).is_ok() {
        let _ = fs::rename(&legacy, legacy.with_extension("json.migrated"));
        return true;
    }
    false
}

fn migrate_dir(from: &PathBuf, to: &PathBuf) -> Result<(), String> {
    if from == to {
        return Ok(());
    }
    fs::create_dir_all(to).map_err(|e| format!("创建目录失败：{e}"))?;
    for name in [DB_FILE, NOTIFIED_FILE] {
        let src = from.join(name);
        if src.exists() {
            fs::copy(&src, to.join(name)).map_err(|e| format!("复制 {name} 失败：{e}"))?;
        }
    }
    let snaps = from.join(SNAPSHOT_DIR);
    if snaps.exists() {
        let dest = to.join(SNAPSHOT_DIR);
        let _ = fs::create_dir_all(&dest);
        if let Ok(entries) = fs::read_dir(&snaps) {
            for entry in entries.flatten() {
                let _ = fs::copy(entry.path(), dest.join(entry.file_name()));
            }
        }
    }
    Ok(())
}

fn sanitize(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if (c as u32) < 0x20 => '_',
            c => c,
        })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.').to_string();
    if trimmed.is_empty() {
        "日程台导出.txt".to_string()
    } else {
        trimmed
    }
}

fn unique_path(dir: &std::path::Path, name: &str) -> PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let path = std::path::Path::new(name);
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "导出".into());
    let ext = path
        .extension()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    for i in 1..1000 {
        let file = if ext.is_empty() {
            format!("{stem} ({i})")
        } else {
            format!("{stem} ({i}).{ext}")
        };
        let p = dir.join(file);
        if !p.exists() {
            return p;
        }
    }
    dir.join(name)
}

#[cfg(windows)]
fn acquire_single_instance() -> bool {
    use std::ffi::c_void;
    extern "system" {
        fn CreateMutexW(attrs: *const c_void, initial: i32, name: *const u16) -> *mut c_void;
        fn GetLastError() -> u32;
    }
    let name: Vec<u16> = "Local\\ScheduleDesk.SingleInstance\0"
        .encode_utf16()
        .collect();
    unsafe {
        let handle = CreateMutexW(std::ptr::null(), 0, name.as_ptr());
        if handle.is_null() {
            return true;
        }
        GetLastError() != 183
    }
}

#[cfg(not(windows))]
fn acquire_single_instance() -> bool {
    true
}

/// 未打包的 exe 想发 Windows 通知，必须先注册 AppUserModelID，
/// 否则 CreateToastNotifier 会直接失败（且不报错，通知静默消失）。
#[cfg(windows)]
fn register_aumid(app_id: &str, display: &str, icon: &str) {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    type Hkey = isize;
    const HKEY_CURRENT_USER: Hkey = 0x8000_0001u64 as Hkey;
    const KEY_WRITE: u32 = 0x2_0006;
    const REG_SZ: u32 = 1;

    extern "system" {
        fn RegCreateKeyExW(
            hkey: Hkey,
            sub_key: *const u16,
            reserved: u32,
            class: *const u16,
            options: u32,
            sam: u32,
            sa: *const u8,
            result: *mut Hkey,
            disposition: *mut u32,
        ) -> i32;
        fn RegSetValueExW(
            hkey: Hkey,
            name: *const u16,
            reserved: u32,
            typ: u32,
            data: *const u8,
            cb: u32,
        ) -> i32;
        fn RegCloseKey(hkey: Hkey) -> i32;
    }

    fn wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(Some(0)).collect()
    }

    let path = wide(&format!("Software\\Classes\\AppUserModelId\\{app_id}"));
    let mut hkey: Hkey = 0;
    let mut disposition: u32 = 0;
    unsafe {
        if RegCreateKeyExW(
            HKEY_CURRENT_USER,
            path.as_ptr(),
            0,
            std::ptr::null(),
            0,
            KEY_WRITE,
            std::ptr::null(),
            &mut hkey,
            &mut disposition,
        ) != 0
        {
            return;
        }
        for (name, value) in [("DisplayName", display), ("IconUri", icon)] {
            let n = wide(name);
            let v = wide(value);
            RegSetValueExW(
                hkey,
                n.as_ptr(),
                0,
                REG_SZ,
                v.as_ptr() as *const u8,
                (v.len() * 2) as u32,
            );
        }
        RegCloseKey(hkey);
    }
}

#[cfg(not(windows))]
fn register_aumid(_app_id: &str, _display: &str, _icon: &str) {}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItemBuilder::with_id("show", "打开主界面").build(app)?;
    let sync_item = MenuItemBuilder::with_id("sync", "立即同步").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "退出").build(app)?;
    let menu = MenuBuilder::new(app)
        .items(&[&show, &sync_item])
        .separator()
        .item(&quit)
        .build()?;

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .tooltip(APP_TITLE)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main(app),
            "sync" => {
                let handle = app.clone();
                std::thread::spawn(move || {
                    let _ = run_sync(&handle);
                });
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

fn show_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(MAIN_WINDOW) {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

fn start_reminder_loop(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(60));
        let state = app.state::<AppState>();
        let dir = state.data_dir.clone();
        let due = {
            let store = match state.store.lock() {
                Ok(s) => s,
                Err(_) => continue,
            };
            remind::due_notifications(&store, &dir)
        };
        for (title, body) in due {
            let _ = app.notification().builder().title(title).body(body).show();
        }
    });
}

fn main() {
    if !acquire_single_instance() {
        return;
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            db_bootstrap,
            db_apply,
            db_import_legacy,
            sync_status,
            default_data_dir,
            choose_data_dir,
            choose_data_dir_quiet,
            finish_onboarding,
            data_dir_info,
            open_data_dir,
            restart_app,
            webdav_test,
            webdav_save_and_sync,
            export_file,
            update_check,
            update_install,
            notify_now
        ])
        .setup(|app| {
            let mut cfg = Config::load();

            // --data-dir <path>：临时覆盖数据目录（隔离测试 / 便携模式），不写入配置
            let argv: Vec<String> = std::env::args().collect();
            if let Some(pos) = argv.iter().position(|a| a == "--data-dir") {
                if let Some(v) = argv.get(pos + 1) {
                    cfg.data_dir = v.clone();
                }
            }

            let dir = cfg.resolved_data_dir();
            let _ = fs::create_dir_all(&dir);
            import_legacy_v1(&dir);
            let mut store = Store::load(&dir);
            if store.device_id.is_empty() {
                store.device_id = cfg.device_id.clone();
            }
            let first_run = !cfg.first_run_done;
            let _ = first_run;
            let public_cfg = cfg.to_public_json(&dir);
            let _ = public_cfg;

            app.manage(AppState {
                config: Mutex::new(cfg),
                store: Mutex::new(store.clone()),
                sync: Mutex::new(SyncStatus::default()),
                data_dir: dir.clone(),
            });

            store.snapshot_daily(&dir);

            let mut builder =
                WebviewWindowBuilder::new(app, MAIN_WINDOW, WebviewUrl::App("index.html".into()))
                    .title(APP_TITLE)
                    .inner_size(1500.0, 950.0)
                    .min_inner_size(1000.0, 660.0)
                    .center()
                    .resizable(true);

            if let Some(icon) = app.default_window_icon() {
                builder = builder.icon(icon.clone())?;
            }

            let window = builder.build()?;
            let win_handle = window.clone();
            window.on_window_event(move |event| {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = win_handle.hide();
                }
            });

            build_tray(app.handle())?;

            // 注册通知身份，绿色版 exe 缺这一步 Toast 会静默失败
            if let Ok(exe) = std::env::current_exe() {
                let icon = exe.to_string_lossy().to_string();
                let id = app.config().identifier.clone();
                register_aumid(&id, APP_TITLE, &icon);
            }

            start_reminder_loop(app.handle().clone());

            // 诊断用：设置 SD_TEST_NOTIFY=1 启动时弹一条通知，验证系统通道。
            if std::env::var("SD_TEST_NOTIFY").ok().as_deref() == Some("1") {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(4));
                    let _ = handle
                        .notification()
                        .builder()
                        .title("日程台")
                        .body("通知通道测试：看到这条说明原生提醒可用。")
                        .show();
                });
            }

            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(3));
                let configured = handle
                    .state::<AppState>()
                    .config
                    .lock()
                    .map(|c| c.webdav.configured())
                    .unwrap_or(false);
                if configured {
                    let _ = run_sync(&handle);
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to launch schedule desk");
}
