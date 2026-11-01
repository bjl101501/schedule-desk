"""生成「稍后提醒」文案的测试数据。

用法：python build/make-snooze-data.py <目标目录>

三条会在一次扫描里各发一条稍后提醒：
  1 未到结束   → 「稍后提醒 · 预计 HH:MM 结束，还剩 N 分钟」
  2 已过结束   → 「稍后提醒 · 原定 HH:MM 结束，还没完成吗」
  3 定时无时长 → 「稍后提醒 · 原定 HH:MM 截止，还没完成吗」
"""
import json
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

TASKS = "RBTQ4jwngkyjWiZE7VqCJZ"


def ymd(d):
    return d.strftime("%Y-%m-%d")


def hm(d):
    return d.strftime("%H:%M")


def task(tid, title, start, est, offsets, snooze=1):
    props = {
        "标题": {"text": title}, "备注": {"text": ""}, "清单": {"text": "通知测试"},
        "标签": {"text": ""}, "优先级": {"select": "P2"}, "重要": {"checkbox": False},
        "紧急": {"checkbox": False}, "已完成": {"checkbox": False},
        "提醒模式": {"select": "单次提醒"},
        "提醒设置": {"text": json.dumps({
            "anchor": start.strftime("%Y-%m-%d %H:%M"),
            "offsets": list(offsets), "read": [], "snooze": snooze,
        }, ensure_ascii=False)},
        "日期": {"date": ymd(start)}, "时间": {"text": hm(start)},
        "预计时长": {"number": est}, "完成时间": {"date": ""}, "拆分": {"text": ""},
        "重复": {"text": ""}, "计划": {"checkbox": False}, "结束日期": {"date": ""},
        "结束时间": {"text": ""}, "持续": {"number": 1}, "排序": {"number": 0},
        "创建时间": {"date": ymd(datetime.now().date())},
    }
    return {"id": tid, "properties": props, "createdAt": 1, "updatedAt": 1, "deleted": False}


def main():
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "dist/test-snooze")
    target.mkdir(parents=True, exist_ok=True)
    now = datetime.now().replace(second=0, microsecond=0)

    rows = [
        task("s1", "【验证】稍后·未到结束", now - timedelta(minutes=20), 60, [-30]),
        task("s2", "【验证】稍后·已过结束", now - timedelta(minutes=90), 30, [-120]),
        task("s3", "【验证】稍后·定时无时长", now - timedelta(minutes=10), 0, [0]),
    ]
    store = {
        "schemaVersion": 2, "revision": 1, "deviceId": "snooze-test",
        "updatedAt": int(time.time() * 1000),
        "tables": {TASKS: rows},
    }
    (target / "schedule.json").write_text(json.dumps(store, ensure_ascii=False, indent=2), encoding="utf-8")

    two_min_ago = int(time.time() * 1000) - 2 * 60 * 1000
    noted = {"sent": {f"{r['id']}:0": two_min_ago for r in rows}}
    (target / "notified.json").write_text(json.dumps(noted, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {len(rows)} tasks -> {target}")


if __name__ == "__main__":
    main()
