#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod net;
mod notify;
mod remind;
mod single;
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
use tauri::{AppHandle, Manager, RunEvent, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};

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
            let text = if o.local_wins == 0 && o.remote_wins == 0 {
                "已同步 · 两端一致".to_string()
            } else {
                format!("已同步 · 远端并入 {} 条 · 本机较新 {} 条", o.remote_wins, o.local_wins)
            };
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
fn notify_now(app: AppHandle, title: String, body: String) -> Result<(), String> {
    let id = app.config().identifier.clone();
    notify::send(&id, &title, &body, true)
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

    // 托盘是 16/32px 的小图，直接用 32x32 源图，别拿 256px 让系统缩（会发虚）
    let tray_icon = tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png"))
        .ok()
        .or_else(|| app.default_window_icon().cloned());
    if let Some(icon) = tray_icon {
        builder = builder.icon(icon);
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
    let app_id = app.config().identifier.clone();
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
        for item in due {
            if let Err(e) = notify::send(&app_id, &item.title, &item.body, true) {
                eprintln!("[remind] 通知失败: {e}");
            }
        }
    });
}

fn arg_value(args: &[String], key: &str) -> Option<String> {
    args.iter()
        .position(|a| a == key)
        .and_then(|i| args.get(i + 1))
        .cloned()
}

/// 窗口几何只在拖动/缩放停下来之后写一次，避免每一帧都落盘
static LAST_WIN_SAVE: Mutex<Option<std::time::Instant>> = Mutex::new(None);

fn save_window_state(win: &tauri::WebviewWindow) {
    let app = win.app_handle();
    let st = app.state::<AppState>();
    let mut cfg = match st.config.lock() {
        Ok(c) => c,
        Err(_) => return,
    };
    let scale = win.scale_factor().unwrap_or(1.0);
    if let Ok(max) = win.is_maximized() {
        cfg.window.maximized = max;
    }
    // 最大化时不覆盖原来的还原尺寸
    if !cfg.window.maximized {
        if let Ok(sz) = win.inner_size() {
            cfg.window.w = (sz.width as f64 / scale).round() as u32;
            cfg.window.h = (sz.height as f64 / scale).round() as u32;
        }
        if let Ok(pos) = win.outer_position() {
            cfg.window.x = (pos.x as f64 / scale).round() as i32;
            cfg.window.y = (pos.y as f64 / scale).round() as i32;
        }
    }
    let _ = cfg.save();
}

fn schedule_window_save(win: &tauri::WebviewWindow) {
    let now = std::time::Instant::now();
    {
        let mut guard = LAST_WIN_SAVE.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(t) = *guard {
            if now.duration_since(t) < Duration::from_millis(800) {
                return;
            }
        }
        *guard = Some(now);
    }
    save_window_state(win);
}

fn save_window_from_app(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(MAIN_WINDOW) {
        save_window_state(&win);
    }
}

/// 换过显示器或改过分辨率时，把窗口收回可视范围
fn clamp_to_screen(win: &tauri::WebviewWindow, ww: f64, wh: f64) {
    let mon = match win.current_monitor() {
        Ok(Some(m)) => m,
        _ => return,
    };
    let scale = mon.scale_factor();
    let mw = mon.size().width as f64 / scale;
    let mh = mon.size().height as f64 / scale;
    let nw = ww.min((mw * 0.96).max(420.0));
    let nh = wh.min((mh * 0.90).max(560.0));
    if (nw - ww).abs() > 1.0 || (nh - wh).abs() > 1.0 {
        let _ = win.set_size(tauri::LogicalSize::new(nw, nh));
        let _ = win.center();
    }
}

fn main() {
    let argv: Vec<String> = std::env::args().collect();
    let data_dir_arg = arg_value(&argv, "--data-dir");
    let (mutex_name, event_name) = single::names(data_dir_arg.as_deref());
    if !single::acquire(&mutex_name) {
        // 同名的实例已经在跑：唤起它的窗口，然后自己退出
        single::wake(&event_name);
        return;
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            db_bootstrap,
            db_apply,
            db_import_legacy,
            sync_status,
            default_data_dir,
            choose_data_dir,
            choose_data_dir_quiet,
            finish_onboarding,
            open_data_dir,
            restart_app,
            webdav_test,
            webdav_save_and_sync,
            export_file,
            update_check,
            update_install,
            notify_now
        ])
        .setup(move |app| {
            let mut cfg = Config::load();

            // --data-dir <path>：临时覆盖数据目录（隔离测试 / 便携模式），不写入配置
            if let Some(v) = arg_value(&argv, "--data-dir") {
                cfg.data_dir = v;
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

            // 记住上次的尺寸与位置；没有记录时用 1180×760（1366×768 的笔记本也放得下）
            let saved_win = app
                .state::<AppState>()
                .config
                .lock()
                .map(|c| c.window.clone())
                .unwrap_or_default();
            let (mut ww, mut wh) = (1180.0_f64, 760.0_f64);
            if saved_win.w >= 420 && saved_win.h >= 560 {
                ww = saved_win.w as f64;
                wh = saved_win.h as f64;
            }
            let mut builder =
                WebviewWindowBuilder::new(app, MAIN_WINDOW, WebviewUrl::App("index.html".into()))
                    .title(APP_TITLE)
                    .inner_size(ww, wh)
                    .min_inner_size(420.0, 560.0)
                    .resizable(true);
            if saved_win.x != 0 || saved_win.y != 0 {
                builder = builder.position(saved_win.x as f64, saved_win.y as f64);
            } else {
                builder = builder.center();
            }

            if let Some(icon) = app.default_window_icon() {
                builder = builder.icon(icon.clone())?;
            }

            let window = builder.build()?;
            // 夹到当前显示器范围内：换过屏幕或改过分辨率时，别让窗口跑到屏幕外
            clamp_to_screen(&window, ww, wh);
            if saved_win.maximized {
                let _ = window.maximize();
            }

            let win_handle = window.clone();
            window.on_window_event(move |event| match event {
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    save_window_state(&win_handle);
                    let _ = win_handle.hide();
                }
                WindowEvent::Resized(_) | WindowEvent::Moved(_) => {
                    schedule_window_save(&win_handle);
                }
                _ => {}
            });

            build_tray(app.handle())?;

            // 注册通知身份：IconUri 必须是图片文件路径，写成 exe 路径的话通知里没有图标
            {
                let id = app.config().identifier.clone();
                let icon_path = dir.join("icon.png");
                if !icon_path.exists() {
                    let _ = fs::write(&icon_path, include_bytes!("../icons/32x32.png"));
                }
                register_aumid(&id, APP_TITLE, &icon_path.to_string_lossy());
            }

            start_reminder_loop(app.handle().clone());

            // 二次启动（双击 exe）时把已有窗口唤到前台
            let activate_handle = app.handle().clone();
            single::listen(&event_name, move || show_main(&activate_handle));

            // 诊断用：设置 SD_TEST_NOTIFY=1 启动时弹一条通知，验证系统通道。
            if std::env::var("SD_TEST_NOTIFY").ok().as_deref() == Some("1") {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(4));
                    let id = handle.config().identifier.clone();
                    let _ = notify::send(
                        &id,
                        "日程台",
                        "通知通道测试：看到这条说明原生提醒可用。",
                        true,
                    );
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
        .build(tauri::generate_context!())
        .expect("failed to build schedule desk")
        .run(|app, event| {
            if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
                save_window_from_app(app);
            }
        });
}
