"""Win32 窗口探针，用于验证「关闭到托盘后二次启动能唤起」。

用法：
    python build/win-probe.py list
    python build/win-probe.py close <pid>
"""

import ctypes
import ctypes.wintypes as wt
import sys

user32 = ctypes.WinDLL("user32", use_last_error=True)


def windows():
    found = []

    @ctypes.WINFUNCTYPE(wt.BOOL, wt.HWND, wt.LPARAM)
    def cb(hwnd, _):
        length = user32.GetWindowTextLengthW(hwnd)
        if length:
            buf = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, buf, length + 1)
            title = buf.value
            if "日程台" in title:
                pid = wt.DWORD()
                user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
                found.append({
                    "hwnd": hwnd,
                    "title": title,
                    "pid": pid.value,
                    "visible": bool(user32.IsWindowVisible(hwnd)),
                    "iconic": bool(user32.IsIconic(hwnd)),
                })
        return True

    user32.EnumWindows(cb, 0)
    return found


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "list"
    if cmd == "list":
        for w in windows():
            print(f"pid={w['pid']} visible={w['visible']} iconic={w['iconic']} hwnd={w['hwnd']} {w['title']}")
        if not windows():
            print("NO_WINDOW")
    elif cmd == "resize":
        # 用法：resize <pid> <宽> <高> —— 用于验证窄窗口/移动端布局
        pid = int(sys.argv[2]); w = int(sys.argv[3]); h = int(sys.argv[4])
        hits = [x for x in windows() if x["pid"] == pid and x["visible"]]
        if not hits:
            print("NO_WINDOW")
            return 1
        for x in hits:
            user32.MoveWindow(x["hwnd"], 30, 30, w, h, True)
        print(f"resized {len(hits)} window(s) to {w}x{h}")
    elif cmd == "size":
        for x in windows():
            r = wt.RECT()
            user32.GetWindowRect(x["hwnd"], ctypes.byref(r))
            print(f"{r.right - r.left}x{r.bottom - r.top} at ({r.left},{r.top}) pid={x['pid']}")
    elif cmd == "close":
        pid = int(sys.argv[2])
        hits = [w for w in windows() if w["pid"] == pid]
        if not hits:
            print("NO_WINDOW")
            return 1
        WM_CLOSE = 0x0010
        for w in hits:
            user32.PostMessageW(w["hwnd"], WM_CLOSE, 0, 0)
        print(f"posted WM_CLOSE to {len(hits)} window(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
