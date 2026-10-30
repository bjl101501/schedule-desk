"""生成「一次扫描触发五类通知」的测试数据。

用法：
    python build/make-notify-data.py <目标目录>

一次启动（等 60 秒扫描）会同时发出：
    1 提前        「将在 HH:MM 开始，还有 N 分钟」
    2 开始        「现在开始，预计 45 分钟」
    3 结束前      「还有 N 分钟结束（HH:MM）」
    4 到结束      「已到结束时间（HH:MM），还没完成吗」
    5 逾期        「已在 MM-DD HH:MM 逾期，尚未完成」
    6 错过聚合    「错过 2 条提醒」
全部为 critical（duration=long + scenario=reminder），用于核对常驻与图标。
"""

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

TASKS = "RBTQ4jwngkyjWiZE7VqCJZ"


def ymd(d):
    return d.strftime("%Y-%m-%d")


def hm(d):
    return d.strftime("%H:%M")


def anchor(d):
    return d.strftime("%Y-%m-%d %H:%M")


def task(tid, title, start: datetime, est=0, offsets=(), end_remind=False, mode="单次提醒"):
    today = datetime.now().date()
    props = {
        "标题": {"text": title},
        "备注": {"text": ""},
        "清单": {"text": "通知测试"},
        "标签": {"text": ""},
        "优先级": {"select": "P2"},
        "重要": {"checkbox": False},
        "紧急": {"checkbox": False},
        "已完成": {"checkbox": False},
        "提醒模式": {"select": mode},
        "提醒设置": {"text": json.dumps({
            "anchor": anchor(start),
            "offsets": list(offsets),
            "read": [],
            **({"end": 1} if end_remind else {}),
        }, ensure_ascii=False)},
        "日期": {"date": ymd(start)},
        "时间": {"text": hm(start)},
        "预计时长": {"number": est},
        "完成时间": {"date": ""},
        "拆分": {"text": ""},
        "重复": {"text": ""},
        "计划": {"checkbox": False},
        "结束日期": {"date": ""},
        "结束时间": {"text": ""},
        "持续": {"number": 1},
        "排序": {"number": 0},
        "创建时间": {"date": ymd(today)},
    }
    return {"id": tid, "properties": props, "createdAt": 1, "updatedAt": 1, "deleted": False}


def main():
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "dist/test-notify")
    target.mkdir(parents=True, exist_ok=True)
    now = datetime.now().replace(second=0, microsecond=0)

    rows = [
        # 1 提前：3 分钟后开始，提前 5 分钟提醒 → trigger 已在 2 分钟前
        task("n1", "【验证】提前提醒", now + timedelta(minutes=3), 0, [-5]),
        # 2 开始：半分钟前开始，有预计时长 → 「现在开始，预计 45 分钟」
        task("n2", "【验证】开始提醒", now - timedelta(seconds=30), 45, [0]),
        # 3 结束前：11 分钟前开始 + 15 分钟用时 = 4 分钟后结束，提前 5 分钟提醒
        task("n3", "【验证】结束前提醒", now - timedelta(minutes=11), 15, [-5], end_remind=True),
        # 4 到结束：30 分钟前开始 + 30 分钟用时 = 此刻结束
        task("n4", "【验证】到结束点", now - timedelta(minutes=30), 30, [0], end_remind=True),
        # 5 逾期：10 分钟前开始，无用时 → 到点即逾期
        task("n5", "【验证】逾期提醒", now - timedelta(minutes=10), 0, [0]),
        # 6 错过：两小时前的提醒，超过 5 分钟新鲜窗口 → 聚合成一条
        task("n6", "【验证】错过一", now - timedelta(hours=2), 0, [0]),
        task("n7", "【验证】错过二", now - timedelta(hours=3), 0, [0]),
    ]

    store = {
        "schemaVersion": 2,
        "revision": 1,
        "deviceId": "notify-test",
        "updatedAt": int(datetime.now().timestamp() * 1000),
        "tables": {TASKS: rows},
    }
    (target / "schedule.json").write_text(
        json.dumps(store, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"wrote {len(rows)} tasks -> {target / 'schedule.json'}")
    for t in rows:
        print(" ", t["id"], t["properties"]["标题"]["text"], t["properties"]["时间"]["text"])


if __name__ == "__main__":
    main()
