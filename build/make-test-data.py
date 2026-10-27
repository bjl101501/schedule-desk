"""生成状态矩阵测试数据。

用法：
    python build/make-test-data.py <目标目录>

覆盖第七节 7.4 的 8 条样本，外加全天 / 跨天 / 已完成 / 正常未来，
用来核对列表、卡片、看板、详情、提醒中心的文案是否一致。
"""

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

TASKS = "RBTQ4jwngkyjWiZE7VqCJZ"
COUNT = "gVxrxS4S2Zb2xddhphNdjT"


def at(day_offset, hour, minute=0):
    d = datetime.now() + timedelta(days=day_offset)
    return d.replace(hour=hour, minute=minute, second=0, microsecond=0)


def fmt(d):
    return d.strftime("%Y-%m-%d %H:%M")


def rel(minutes):
    return (datetime.now() + timedelta(minutes=minutes)).replace(second=0, microsecond=0)


def task(tid, title, date, time="", estimate=0, span=1, subs=None, remind=None,
         mode="不提醒", done=False, note="", tags=""):
    props = {
        "标题": {"text": title},
        "备注": {"text": note},
        "清单": {"text": "测试"},
        "标签": {"text": tags},
        "优先级": {"select": "P2"},
        "重要": {"checkbox": False},
        "紧急": {"checkbox": False},
        "已完成": {"checkbox": done},
        "提醒模式": {"select": mode},
        "提醒设置": {"text": json.dumps(remind, ensure_ascii=False) if remind else ""},
        "日期": {"date": date},
        "时间": {"text": time},
        "预计时长": {"number": estimate},
        "完成时间": {"date": date if done else ""},
        "拆分": {"text": json.dumps(subs, ensure_ascii=False) if subs else ""},
        "重复": {"text": ""},
        "持续": {"number": span},
        "排序": {"number": 0},
        "创建时间": {"date": datetime.now().strftime("%Y-%m-%d")},
    }
    return {"id": tid, "properties": props, "createdAt": 1, "updatedAt": 1, "deleted": False}


def main():
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "dist/test-matrix")
    target.mkdir(parents=True, exist_ok=True)
    today = datetime.now().date()

    a = rel(-20)
    b = rel(-90)
    c = rel(-30)
    d = rel(45)
    e = rel(40)

    rows = [
        task("t01", "进行中 · 有预计时长", str(today), a.strftime("%H:%M"), 60),
        task("t02", "已逾期 · 超过预计时长", str(today), b.strftime("%H:%M"), 60),
        task("t03", "已逾期 · 无预计时长", str(today), c.strftime("%H:%M"), 0),
        task("t04", "即将逾期 · 提前提醒已触发", str(today), d.strftime("%H:%M"), 0,
             remind={"anchor": fmt(rel(45)), "offsets": [-60], "read": []}, mode="单次提醒"),
        task("t05", "全天 · 进行中", str(today), "", 0),
        task("t06", "全天 · 已逾期一天", str(today - timedelta(days=1)), "", 0),
        task("t07", "跨天任务 · 第 3 天", str(today - timedelta(days=2)), "09:00", 0, span=5),
        task("t08", "跨天任务 · 子项逾期", str(today - timedelta(days=2)), "09:00", 0, span=5,
             subs=[{"t": "第一步", "m": 0, "dy": 1, "d": False},
                   {"t": "第二步", "m": 0, "dy": 2, "d": False}]),
        task("t09", "即将开始 · 提前提醒已触发", str(today), e.strftime("%H:%M"), 30,
             remind={"anchor": fmt(rel(40)), "offsets": [-60], "read": []}, mode="单次提醒"),
        task("t10", "明天 · 普通日程", str(today + timedelta(days=1)), "10:00", 0),
        task("t11", "已完成", str(today), "08:00", 30, done=True),
        task("t12", "全天 · 有预计时长仍然全天", str(today), "", 120),
        task("t13", "艾宾浩斯 · 待复习", str(today), rel(-70).strftime("%H:%M"), 0,
             remind={"anchor": fmt(rel(-70)), "offsets": [0, 5, 30], "read": []}, mode="艾宾浩斯"),
        # 用于验证提醒链路：启动 1 分钟后扫描时应弹一条「现在开始，预计 45 分钟」
        task("t14", "提醒测试 · 定时任务", str(today), rel(-1).strftime("%H:%M"), 45,
             remind={"anchor": fmt(rel(-1)), "offsets": [0], "read": []}, mode="单次提醒"),
    ]

    store = {
        "schemaVersion": 2,
        "revision": 1,
        "deviceId": "test",
        "updatedAt": int(datetime.now().timestamp() * 1000),
        "tables": {
            TASKS: rows,
            COUNT: [{
                "id": "c1",
                "properties": {
                    "名称": {"text": "测试纪念日"},
                    "类型": {"text": "倒数日"},
                    "日期": {"date": str(today + timedelta(days=30))},
                    "备注": {"text": ""},
                    "颜色": {"text": "#177CB0"},
                    "分组": {"text": ""},
                    "系统": {"text": ""},
                },
                "createdAt": 1, "updatedAt": 1, "deleted": False,
            }],
        },
    }
    (target / "schedule.json").write_text(
        json.dumps(store, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"wrote {len(rows)} tasks -> {target / 'schedule.json'}")


if __name__ == "__main__":
    main()
