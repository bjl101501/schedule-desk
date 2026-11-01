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
from datetime import datetime, time as dtime, timedelta
from pathlib import Path

TASKS = "RBTQ4jwngkyjWiZE7VqCJZ"
HABIT = "xaX0HSTIH0O7cXXvPnbsR2"
# 磁盘上的真实表 id 是双 x 的那个；DB_IDS 里的短 id 由 bridge/db.ts 的 ALIAS 映射过来
COUNT = "gVxrxS4S2Zb2xddhphNdjT"
POMO = "6ny2WVjivlBujxY3ICpYGT"


def at(day_offset, hour, minute=0):
    d = datetime.now() + timedelta(days=day_offset)
    return d.replace(hour=hour, minute=minute, second=0, microsecond=0)


def fmt(d):
    return d.strftime("%Y-%m-%d %H:%M")


def rel(minutes):
    return (datetime.now() + timedelta(minutes=minutes)).replace(second=0, microsecond=0)


def ymd(d):
    return d.strftime("%Y-%m-%d")


def ts(d):
    """时间戳 → (日期, 时刻)。

    rel() 以「现在」为基准，23 点后跑就会跨到次日；若日期仍写死 t_str，
    会造出「今天 00:01」这种已过去 23 小时的数据（t04 被判逾期而非即将逾期）。
    所以日期一律从时间戳自己取。
    """
    return ymd(d), d.strftime("%H:%M")


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


def habit_rows(today):
    """两个习惯：一个连续打卡、一个断过；习惯视图与统计都靠它。"""
    run_log = [ymd(today - timedelta(days=i)) for i in range(0, 6)]
    read_log = [ymd(today - timedelta(days=d)) for d in (0, 2, 3)]
    out = []
    for hid, name, icon, color, target, streak, total, log in [
        ("h1", "晨跑 3 公里", "sun", "#177CB0", 5, 6, 24, run_log),
        ("h2", "读书 30 分钟", "book", "#B4894A", 7, 1, 11, read_log),
    ]:
        out.append({
            "id": hid,
            "properties": {
                "名称": {"text": name},
                "图标": {"text": icon},
                "颜色": {"text": color},
                "每周目标": {"number": target},
                "连续天数": {"number": streak},
                "总打卡": {"number": total},
                "打卡记录": {"text": json.dumps(log)},
                "创建时间": {"date": ymd(today - timedelta(days=40))},
            },
            "createdAt": 1, "updatedAt": 1, "deleted": False,
        })
    return out


def pomo_rows(today):
    """近一周的番茄记录，统计视图的「本周专注」与热力图要用。"""
    out = []
    for i in range(0, 5):
        d = today - timedelta(days=i)
        out.append({
            "id": f"p{i + 1}",
            "properties": {
                "任务": {"text": ["整理会议记录", "写周报", "看论文", "画原型", "复盘"][i]},
                "类型": {"select": "专注"},
                "时长": {"number": 25},
                "开始时间": {"date": fmt(datetime.combine(d, datetime.min.time()).replace(hour=10))},
                "日期": {"date": ymd(d)},
                "子项": {"text": ""},
                "暂停次数": {"number": 0},
                "暂停时长": {"number": 0},
            },
            "createdAt": 1, "updatedAt": 1, "deleted": False,
        })
    return out


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
    h70 = rel(-70)  # 艾宾浩斯基准，1 小时 10 分钟前
    m1 = rel(-1)    # 1 分钟后
    e60 = rel(-60)  # 1 小时前（t08 的计划结束时刻，必须永远是「已过去」）

    # 晚上 22 点后跑，+120 分钟会跨到明天；end_date 还是今天，
    # 这个 00:0x 就成了「今天凌晨」→ t15 被误判逾期。压到当天 23:59。
    if g.date() != today:
        g = datetime.combine(today, dtime(23, 59))

    rows = [
        # 3 无计划 + 时间 + 用时 → 开始 + 60 分钟，已过 20 分钟
        task("t01", "进行中 · 开始+时长", *ts(a), 60),
        # 3 同上，已过 90 分钟 → 逾期
        task("t02", "已逾期 · 超过预计时长", *ts(b), 60),
        # 4 无计划 + 时间 + 无用时 → 到点即逾期
        task("t03", "已逾期 · 定时无时长", *ts(c), 0),
        # 4 未开始，但提前提醒已到点 → 即将逾期
        task("t04", "即将逾期 · 提前提醒已触发", *ts(d), 0,
             remind={"anchor": fmt(d), "offsets": [-60], "read": []}, mode="单次提醒"),
        # 5 全天
        task("t05", "全天 · 进行中", t_str, "", 0),
        # 5 全天，昨天 → 逾期一天
        task("t06", "全天 · 已逾期一天", y1, "", 0),
        # 2 计划 + 无结束时间 → 结束日 24:00，今天还在窗口内
        task("t07", "计划 · 结束日24点 · 进行中", y2, "09:00", 0,
             plan=True, end_date=t_str),
        # 1 计划 + 结束时间，已过 → 逾期
        # 结束时刻用「1 小时前」而不是写死 01:00：凌晨 0 点跑时 01:00 还没到，会被判成「进行中」
        task("t08", "计划 · 结束时间已过", y1, "09:00", 0,
             plan=True, end_date=ymd(e60), end_time=e60.strftime("%H:%M")),
        # 3 未开始，有时长，提前提醒到点 → 即将开始
        task("t09", "即将开始 · 提前提醒已触发", *ts(e), 30,
             remind={"anchor": fmt(e), "offsets": [-60], "read": []}, mode="单次提醒"),
        # 未开始
        task("t10", "明天 · 普通日程", str(today + timedelta(days=1)), "10:00", 0),
        task("t11", "已完成", t_str, "08:00", 30, done=True),
        # 5 全天 + 预计时长，仍然按全天算
        task("t12", "全天 · 有预计时长仍全天", t_str, "", 120),
        task("t13", "艾宾浩斯 · 待复习", *ts(h70), 0,
             remind={"anchor": fmt(h70), "offsets": [0, 5, 30], "read": []}, mode="艾宾浩斯"),
        # 用于验证提醒链路：启动 1 分钟后扫描时应弹一条「现在开始，预计 45 分钟」
        task("t14", "提醒测试 · 定时任务", *ts(m1), 45,
             remind={"anchor": fmt(m1), "offsets": [0], "read": []}, mode="单次提醒"),
        # 6 计划与用时都有，取更晚：用时 30 分钟早于计划结束 → 以计划为准
        task("t15", "计划 · 与用时取更晚", *ts(f), 30,
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
            HABIT: habit_rows(today),
            POMO: pomo_rows(today),
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
