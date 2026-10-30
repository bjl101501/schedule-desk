#!/usr/bin/env bash
# 本机一键构建：拼前端 → 打 exe → 落到 dist/
#
# 为什么要显式加 MinGW 的 bin：
#   主机是 x86_64-pc-windows-gnu，tauri-winres 编资源时要 windres。
#   scoop 已把 C:\Users\bjl10\scoop\apps\mingw\current\bin 写进用户 PATH，
#   但已经开着的终端（以及自动化会话）继承的是旧环境，读不到它。
set -e
cd "$(dirname "$0")/.."

export PATH="/c/Users/bjl10/scoop/apps/mingw/current/bin:$PATH"
CARGO="/c/Users/bjl10/.cargo/bin/cargo.exe"
TARGET_DIR="D:/DevBuild/sd-target"

python build/inject.py
( cd src-tauri && CARGO_TARGET_DIR="$TARGET_DIR" "$CARGO" build --release )
cp "$TARGET_DIR/release/schedule-desk.exe" dist/ScheduleDesk.exe
echo "dist/ScheduleDesk.exe updated"
