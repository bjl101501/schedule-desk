"""把 src-web/index.original.html 拆成 index.html / styles.css / app.js。

只跑一次，用于把单文件网页转成可维护的结构。之后 src-web/src/ 就是源。
"""

from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src-web"
ORIGINAL = SRC / "index.original.html"
OUT = SRC / "src"

STYLE_RE = re.compile(r"<style[^>]*>(.*?)</style>", re.S)
MAIN_SCRIPT_RE = re.compile(
    r'<script\b(?![^>]*\bsrc=)[^>]*>(?P<code>.*?)</script>', re.S
)


def main() -> int:
    html = ORIGINAL.read_text(encoding="utf-8")

    style_match = STYLE_RE.search(html)
    if not style_match:
        print("style block not found", file=sys.stderr)
        return 1
    css = style_match.group(1).strip("\n")

    # 最长的内联 script 就是应用主脚本
    scripts = [m for m in MAIN_SCRIPT_RE.finditer(html)]
    if not scripts:
        print("main script not found", file=sys.stderr)
        return 1
    main_script = max(scripts, key=lambda m: len(m.group("code")))
    js = main_script.group("code").strip("\n")

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "styles.css").write_text(css + "\n", encoding="utf-8")
    (OUT / "app.js").write_text(js + "\n", encoding="utf-8")

    head_html = html[: style_match.start()]
    between = html[style_match.end() : main_script.start()]
    tail_html = html[main_script.end() :]

    # 去掉指向资料库注入脚本的引用（桌面版没有这个文件）
    between = re.sub(
        r'\s*<script[^>]*src="/page/page_comm/inject\.js"[^>]*></script>', "", between
    )

    page = (
        head_html
        + '<link rel="stylesheet" href="styles.css">'
        + between
        + '<script src="app.js"></script>'
        + tail_html
    )
    page = re.sub(r"\n{3,}", "\n\n", page)
    (OUT / "index.html").write_text(page, encoding="utf-8")

    print(f"styles.css  {len(css.splitlines()):>5} lines  {len(css)/1024:.0f} KB")
    print(f"app.js      {len(js.splitlines()):>5} lines  {len(js)/1024:.0f} KB")
    print(f"index.html  {len(page.splitlines()):>5} lines  {len(page)/1024:.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
