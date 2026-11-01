#!/usr/bin/env bash
# 本机一键构建：拼前端 → 打 exe → 落到 dist/
#
# 两个必须记住的点：
#   1. 前端产物是编译期被 tauri::generate_context! 嵌进 exe 的，
#      tauri-build 不对 frontendDist 发 rerun-if-changed。
#      只改前端时 cargo 会判定「无变更」并静默复用旧 exe —— 所以必须先 touch main.rs。
#   2. 主机是 x86_64-pc-windows-gnu，tauri-winres 编资源时要 windres。
#      scoop 已把 MinGW 的 bin 写进用户 PATH，但已开着的终端继承的是旧环境。
set -e
cd "$(dirname "$0")/.."

export PATH="/c/Users/bjl10/scoop/apps/mingw/current/bin:$PATH"
CARGO="/c/Users/bjl10/.cargo/bin/cargo.exe"
TARGET_DIR="D:/DevBuild/sd-target"

bun install --frozen-lockfile
bun run build

# 关键：让嵌入资源重新生成
touch src-tauri/src/main.rs

( cd src-tauri && CARGO_TARGET_DIR="$TARGET_DIR" "$CARGO" build --release )
cp "$TARGET_DIR/release/schedule-desk.exe" dist/ScheduleDesk.exe
echo "dist/ScheduleDesk.exe updated"
