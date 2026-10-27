// 换图标后必须让 Windows 资源重新编译，否则链接会沿用旧的 libresource.a。
// tauri-build 只监听 tauri.conf.json，图标不在监听范围，这里补上。
fn main() {
    for name in [
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/128x128@2x.png",
        "icons/icon.png",
        "icons/icon.ico",
    ] {
        println!("cargo:rerun-if-changed={name}");
    }
    tauri_build::build()
}
