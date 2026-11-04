"""生成 README 配图用的演示数据（不是测试数据）。

和 make-test-data.py 的区别：那个要覆盖状态矩阵的六种边界，任务名是「已逾期 · 定时无时长」
这种用例名；这里只求像一个人真实在用 —— 会议、周报、读书、给家里打电话。

时间按「现在」相对生成：一条进行中、一条逾期未完成、三条已完成，
这样顶栏时钟是当下时间，画面里的状态也自洽。

用法：
    python build/make-demo-data.py <目标目录>
"""

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

TASKS = "RBTQ4jwngkyjWiZE7VqCJZ"
HABIT = "xaX0HSTIH0O7cXXvPnbsR2"
COUNT = "gVxrxS4S2Zb2xddhphNdjT"
POMO = "6ny2WVjivlBujxY3ICpYGT"


def ymd(d):
    return d.strftime("%Y-%m-%d")


def hm(d):
    return d.strftime("%H:%M")


def rel(minutes):
    return (datetime.now() + timedelta(minutes=minutes)).replace(second=0, microsecond=0)


def day(n):
    return datetime.now() + timedelta(days=n)


def task(tid, title, date, time="", estimate=0, *, prio="P2", lst="工作", tags="",
         important=False, urgent=False, done=False, note="", subs=None,
         plan=False, end_date="", sort=0):
    span = 1
    if plan and end_date:
        d0 = datetime.strptime(date, "%Y-%m-%d").date()
        d1 = datetime.strptime(end_date, "%Y-%m-%d").date()
        span = max(1, (d1 - d0).days + 1)
    props = {
        "标题": {"text": title},
        "备注": {"text": note},
        "清单": {"text": lst},
        "标签": {"text": tags},
        "优先级": {"select": prio},
        "重要": {"checkbox": important},
        "紧急": {"checkbox": urgent},
        "已完成": {"checkbox": done},
        "提醒模式": {"select": "不提醒"},
        "提醒设置": {"text": ""},
        "日期": {"date": date},
        "时间": {"text": time},
        "预计时长": {"number": estimate},
        "完成时间": {"date": date if done else ""},
        "拆分": {"text": json.dumps(subs, ensure_ascii=False) if subs else ""},
        "重复": {"text": ""},
        "计划": {"checkbox": bool(plan)},
        "结束日期": {"date": end_date if plan else ""},
        "结束时间": {"text": ""},
        "持续": {"number": span},
        "排序": {"number": sort},
        "创建时间": {"date": ymd(day(-3))},
    }
    return {"id": tid, "properties": props, "createdAt": 1, "updatedAt": 1, "deleted": False}


def rows():
    today = ymd(day(0))
    tomorrow = ymd(day(1))
    after = ymd(day(2))
    yesterday = ymd(day(-1))

    # 正在开的那场会：1 小时前开始，2 小时时长 → 现在处于「进行中」
    meeting = rel(-60)
    review = rel(30)
    out = [
        task("d1", "产品评审会：日程台二期", today, hm(meeting), 120, prio="P0",
             tags="会议", important=True, urgent=True,
             subs=[
                 {"t": "过一遍上周的用户反馈", "dy": 1, "d": True, "m": 30},
                 {"t": "确认卡片视图的分组口径", "dy": 0, "d": False, "m": 45},
                 {"t": "排下一轮的优先级", "dy": 0, "d": False, "m": 30},
             ]),
        task("d2", "整理本周项目周报", today, hm(review), 45, prio="P2", tags="周报",
             subs=[
                 {"t": "汇总各条线的进度", "dy": 1, "d": False, "m": 20},
                 {"t": "写一段风险说明", "dy": 0, "d": False, "m": 15},
             ]),
        # 上午已经做完的三件
        task("d3", "回复客户邮件：合同附件", today, "11:20", 20, prio="P1", tags="沟通", done=True),
        task("d4", "晨会：同步昨日进度", today, "09:30", 30, prio="P2", tags="会议", done=True),
        task("d5", "读书 30 分钟", today, "08:00", 30, prio="P3", lst="学习", tags="阅读", done=True),
        # 一条没做完的（真实感，也给「逾期」状态一个样本）
        task("d6", "读完《深度工作》第 3 章", today, "21:00", 40, prio="P2", lst="学习",
             tags="阅读", subs=[
                 {"t": "精读正文", "dy": 1, "d": False, "m": 25},
                 {"t": "做读书笔记", "dy": 0, "d": False, "m": 15},
             ]),
        # 明天 / 后天
        task("d7", "提交季度总结", tomorrow, "09:30", 0, prio="P1", tags="周报",
             important=True, plan=True, end_date=ymd(day(3))),
        task("d8", "客户电话：二期验收范围", tomorrow, "14:00", 30, prio="P1", tags="沟通"),
        task("d9", "给妈妈打个电话", tomorrow, "20:30", 15, prio="P2", lst="生活"),
        task("d10", "预约体检", after, "10:00", 15, prio="P3", lst="生活"),
        # 未安排
        task("d11", "整理读书笔记成一篇短文", "", "", 0, prio="P3", lst="学习", tags="阅读"),
        # 昨天已完成
        task("d12", "产品评审会：需求初稿", yesterday, "10:00", 90, prio="P0", tags="会议", done=True),
        task("d13", "买猫粮", yesterday, "19:30", 15, prio="P3", lst="生活", done=True),
    ]
    return out


def habit_rows():
    today = datetime.now().date()
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


def pomo_rows():
    out = []
    for i, name in enumerate(["整理会议记录", "写周报", "看论文", "画原型", "复盘"]):
        d = day(-i)
        out.append({
            "id": f"p{i + 1}",
            "properties": {
                "任务": {"text": name},
                "类型": {"select": "专注"},
                "时长": {"number": 25},
                "开始时间": {"date": d.replace(hour=10, minute=0, second=0, microsecond=0).strftime("%Y-%m-%d %H:%M")},
                "日期": {"date": ymd(d)},
                "子项": {"text": ""},
                "暂停次数": {"number": 0},
                "暂停时长": {"number": 0},
            },
            "createdAt": 1, "updatedAt": 1, "deleted": False,
        })
    return out


def main():
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "dist/demo-data")
    target.mkdir(parents=True, exist_ok=True)
    rs = rows()
    store = {
        "schemaVersion": 2,
        "revision": 1,
        "deviceId": "demo",
        "updatedAt": int(datetime.now().timestamp() * 1000),
        "tables": {
            TASKS: rs,
            HABIT: habit_rows(),
            POMO: pomo_rows(),
            COUNT: [{
                "id": "c1",
                "properties": {
                    "名称": {"text": "项目上线"},
                    "类型": {"select": "倒数日"},
                    "日期": {"date": ymd(day(30))},
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
    print(f"wrote {len(rs)} tasks -> {target / 'schedule.json'}")


if __name__ == "__main__":
    main()
