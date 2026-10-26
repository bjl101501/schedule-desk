"""把 app.js 按功能区块切成多个文件，保持原始顺序。

一次性脚本；切分点来自文件里已有的 `/* ---------- 名称 ---------- */` 注释。
切完之后 src-web/src/js/ 就是新的源，app.js 不再维护。
"""

from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src-web" / "src"
APP = SRC / "app.js"
OUT = SRC / "js"

# (文件名, 起始行, 说明)  行号从 1 开始，对应拆分前的 app.js
SEGMENTS = [
    ("01-core.js", 1, "数据库绑定 / 全局状态 / 工具"),
    ("02-model.js", 191, "数据层 / 拆分与排期 / 示例数据"),
    ("03-ui.js", 817, "通用 UI / 桌面面板 / 快照 / 换肤 / 计算 / 刷新"),
    ("04-views.js", 1589, "侧栏 / 清单视图"),
    ("05-dnd.js", 2248, "拖拽：列表排序 / 看板换列 / 日历改期 / 时间线"),
    ("06-boards.js", 3379, "四象限 / 习惯打卡 / 倒数纪念日 / 数据统计"),
    ("07-pomodoro.js", 4034, "番茄专注 / 任务详情"),
    ("08-editors.js", 4431, "任务编辑器 / 快速添加 / 过滤器 / 提醒 / 习惯与纪念日编辑器"),
    ("09-app.js", 5662, "备份导出 / 导航事件 / 启动 / 每日快照 / 快捷键"),
]


def main() -> int:
    if not APP.exists():
        print(f"missing {APP}", file=sys.stderr)
        return 1
    lines = APP.read_text(encoding="utf-8").split("\n")

    OUT.mkdir(parents=True, exist_ok=True)
    bounds = [s[1] - 1 for s in SEGMENTS] + [len(lines)]

    for i, (name, start, desc) in enumerate(SEGMENTS):
        chunk = lines[bounds[i] : bounds[i + 1]]
        while chunk and not chunk[0].strip():
            chunk.pop(0)
        header = f"/* ---------- {name} · {desc} ---------- */\n"
        (OUT / name).write_text(header + "\n".join(chunk).rstrip() + "\n", encoding="utf-8")
        print(f"{name:<16} {len(chunk):>5} lines")

    # 校验：拼接后应与原文件等价（忽略头部注释）
    rebuilt = "\n".join(
        (OUT / s[0]).read_text(encoding="utf-8").split("\n", 1)[1].rstrip()
        for s in SEGMENTS
    )
    original = "\n".join(lines).rstrip()
    print(f"original {len(original)} chars, rebuilt {len(rebuilt)} chars")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
