"""生成状态矩阵测试数据（v2.2.0 口径）。

用法：
    python build/make-test-data.py <目标目录>

覆盖 checkpoint 第四节的六种结束时刻组合：
   1. 计划 + 结束时间        → 结束后时间点
   2. 计划 + 无结束时间      → 结束日 24:00
   3. 无计划 + 时间 + 用时   → 开始 + 用时
   4. 无计划 + 时间 + 无用   → 开始时刻本身
   5. 全天                   → 计划：结束日 24:00；否则当天 24:00
   6. 计划与用时都有          → 取两者中较晚
外加已完成 / 未来 / 提醒到点 / 艾宾浩斯。
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


def ymd(d):
    return d.strftime("%Y-%m-%d")


def task(tid, title, date, time="", estimate=0, subs=None, remind=None,
         mode="不提醒", done=False, note="", tags="",
         plan=False, end_date="", end_time=""):
    """plan / end_date / end_time 走 v2.2.0 的新字段；持续只作为派生天数。"""
    span = 1
    if plan and end_date:
        d0 = datetime.strptime(date, "%Y-%m-%d").date()
        d1 = datetime.strptime(end_date, "%Y-%m-%d").date()
        span = max(1, (d1 - d0).days + 1)
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
        "计划": {"checkbox": bool(plan)},
        "结束日期": {"date": end_date if plan else ""},
        "结束时间": {"text": end_time if plan else ""},
        "持续": {"number": span},
        "排序": {"number": 0},
        "创建时间": {"date": datetime.now().strftime("%Y-%m-%d")},
    }
    return {"id": tid, "properties": props, "createdAt": 1, "updatedAt": 1, "deleted": False}


def main():
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "dist/test-matrix")
    target.mkdir(parents=True, exist_ok=True)
    today = datetime.now().date()
    t_str = str(today)
    y1 = str(today - timedelta(days=1))
    y2 = str(today - timedelta(days=2))
    y3 = str(today - timedelta(days=3))

    a = rel(-20)   # 开始 20 分钟前
    b = rel(-90)   # 开始 90 分钟前
    c = rel(-30)   # 开始 30 分钟前
    d = rel(45)    # 45 分钟后开始
    e = rel(40)    # 40 分钟后开始
    f = rel(-60)   # 1 小时前开始
    g = rel(120)   # 2 小时后结束

    rows = [
        # 3 无计划 + 时间 + 用时 → 开始 + 60 分钟，已过 20 分钟
        task("t01", "进行中 · 开始+时长", t_str, a.strftime("%H:%M"), 60),
        # 3 同上，已过 90 分钟 → 逾期
        task("t02", "已逾期 · 超过预计时长", t_str, b.strftime("%H:%M"), 60),
        # 4 无计划 + 时间 + 无用时 → 到点即逾期
        task("t03", "已逾期 · 定时无时长", t_str, c.strftime("%H:%M"), 0),
        # 4 未开始，但提前提醒已到点 → 即将逾期
        task("t04", "即将逾期 · 提前提醒已触发", t_str, d.strftime("%H:%M"), 0,
             remind={"anchor": fmt(d), "offsets": [-60], "read": []}, mode="单次提醒"),
        # 5 全天
        task("t05", "全天 · 进行中", t_str, "", 0),
        # 5 全天，昨天 → 逾期一天
        task("t06", "全天 · 已逾期一天", y1, "", 0),
        # 2 计划 + 无结束时间 → 结束日 24:00，今天还在窗口内
        task("t07", "计划 · 结束日24点 · 进行中", y2, "09:00", 0,
             plan=True, end_date=t_str),
        # 1 计划 + 结束时间，已过 → 逾期
        task("t08", "计划 · 结束时间已过", y1, "09:00", 0,
             plan=True, end_date=t_str, end_time="01:00"),
        # 3 未开始，有时长，提前提醒到点 → 即将开始
        task("t09", "即将开始 · 提前提醒已触发", t_str, e.strftime("%H:%M"), 30,
             remind={"anchor": fmt(e), "offsets": [-60], "read": []}, mode="单次提醒"),
        # 未开始
        task("t10", "明天 · 普通日程", str(today + timedelta(days=1)), "10:00", 0),
        task("t11", "已完成", t_str, "08:00", 30, done=True),
        # 5 全天 + 预计时长，仍然按全天算
        task("t12", "全天 · 有预计时长仍全天", t_str, "", 120),
        task("t13", "艾宾浩斯 · 待复习", t_str, rel(-70).strftime("%H:%M"), 0,
             remind={"anchor": fmt(rel(-70)), "offsets": [0, 5, 30], "read": []}, mode="艾宾浩斯"),
        # 用于验证提醒链路：启动 1 分钟后扫描时应弹一条「现在开始，预计 45 分钟」
        task("t14", "提醒测试 · 定时任务", t_str, rel(-1).strftime("%H:%M"), 45,
             remind={"anchor": fmt(rel(-1)), "offsets": [0], "read": []}, mode="单次提醒"),
        # 6 计划与用时都有，取更晚：用时 30 分钟早于计划结束 → 以计划为准
        task("t15", "计划 · 与用时取更晚", t_str, f.strftime("%H:%M"), 30,
             plan=True, end_date=t_str, end_time=g.strftime("%H:%M")),
        # 计划的结束日已过（昨天 24:00）→ 逾期
        task("t17", "计划 · 结束日已过", y3, "09:00", 0,
             plan=True, end_date=y1),
        # 计划跨天，还没开始
        task("t18", "计划 · 明天开始", str(today + timedelta(days=1)), "10:00", 0,
             plan=True, end_date=str(today + timedelta(days=3))),
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
