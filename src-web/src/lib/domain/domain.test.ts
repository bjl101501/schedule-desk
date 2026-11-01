import { describe, expect, test } from 'bun:test';
import { taskState, taskWindow, reminderState } from './window';
import { cdGroupOf, nextRepeatDate, normTask, shiftPlanTo, subPlan, taskSpan } from './task';
import { alertSummary, applyFilters, inScope, sortTasks } from './selectors';
import { parseQuick } from './quickparse';
import { parseBundleText, bundleCount } from './backup';
import { addDays, ymd } from './date';
import type { Filters, Task, TaskStateKey } from './types';

/** 固定基准：2026-11-01 15:00 本地时间，所有样例都以它为「现在」 */
const NOW_D = new Date(2026, 10, 1, 15, 0, 0);
const NOW = NOW_D.getTime();
const T = ymd(NOW_D);
const Y1 = ymd(addDays(NOW_D, -1));
const Y2 = ymd(addDays(NOW_D, -2));
const Y3 = ymd(addDays(NOW_D, -3));
const T1 = ymd(addDays(NOW_D, 1));
const T3 = ymd(addDays(NOW_D, 3));

function mk(p: Partial<Task> = {}): Task {
  return {
    id: 't', title: '样例', note: '', list: '测试', tags: [], prio: 'P2',
    important: false, urgent: false, done: false, remindMode: '不提醒', remindCfg: null,
    date: '', time: '', estimate: 0, doneAt: '', sort: 0, subs: [], repeat: '',
    plan: false, endDate: '', endTime: '', span: 1, createdAt: T,
    ...p
  };
}

function hm(d: Date): string {
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function rel(min: number): Date {
  return new Date(NOW + min * 60000);
}

describe('状态矩阵（与 ui-check 的 13 条样本同一口径）', () => {
  const cases: [string, Task, TaskStateKey][] = [
    ['t01 开始+时长，已过 20 分', mk({ date: T, time: hm(rel(-20)), estimate: 60 }), 'ongoing'],
    ['t02 开始+时长，已过 90 分', mk({ date: T, time: hm(rel(-90)), estimate: 60 }), 'overdue'],
    ['t03 定时无时长，到点即逾期', mk({ date: T, time: hm(rel(-30)) }), 'overdue'],
    ['t04 提前提醒已到点，无时长', mk({
      date: T, time: hm(rel(45)), remindMode: '单次提醒',
      remindCfg: { anchor: T + ' ' + hm(rel(45)), offsets: [-60], read: [] }
    }), 'remindSoon'],
    ['t05 全天，今天', mk({ date: T }), 'ongoing'],
    ['t06 全天，昨天', mk({ date: Y1 }), 'overdue'],
    ['t07 计划到结束日 24:00', mk({ date: Y2, time: '09:00', plan: true, endDate: T }), 'ongoing'],
    ['t08 计划 + 结束时间已过', mk({ date: Y1, time: '09:00', plan: true, endDate: T, endTime: '01:00' }), 'overdue'],
    ['t09 未开始，有时长，提前提醒到点', mk({
      date: T, time: hm(rel(40)), estimate: 30, remindMode: '单次提醒',
      remindCfg: { anchor: T + ' ' + hm(rel(40)), offsets: [-60], read: [] }
    }), 'upcoming'],
    ['t10 明天', mk({ date: T1, time: '10:00' }), 'planned'],
    ['t11 已完成', mk({ date: T, time: '08:00', estimate: 30, done: true }), 'done'],
    ['t12 全天 + 预计时长仍是全天', mk({ date: T, estimate: 120 }), 'ongoing'],
    ['t13 艾宾浩斯，基准已过', mk({
      date: T, time: hm(rel(-70)), remindMode: '艾宾浩斯',
      remindCfg: { anchor: T + ' ' + hm(rel(-70)), offsets: [0, 5, 30], read: [] }
    }), 'overdue'],
    ['t14 定时 1 分钟前开始，用时 45 分钟', mk({ date: T, time: hm(rel(-1)), estimate: 45 }), 'ongoing'],
    ['t15 计划与用时取更晚', mk({ date: T, time: hm(rel(-60)), estimate: 30, plan: true, endDate: T, endTime: hm(rel(120)) }), 'ongoing'],
    ['t17 计划结束日是昨天 24:00', mk({ date: Y3, time: '09:00', plan: true, endDate: Y1 }), 'overdue'],
    ['t18 计划跨天，还没开始', mk({ date: T1, time: '10:00', plan: true, endDate: T3 }), 'planned']
  ];

  for (const [name, task, want] of cases) {
    test(name, () => {
      expect(taskState(task, NOW).key).toBe(want);
    });
  }
});

describe('taskWindow 六种结束时刻', () => {
  test('计划 + 结束时间 → 结束日 + 结束时间', () => {
    const w = taskWindow(mk({ date: T, time: '09:00', plan: true, endDate: T, endTime: '11:30' }))!;
    expect(w.end.getTime()).toBe(new Date(2026, 10, 1, 11, 30, 0).getTime());
    expect(w.hasEnd).toBe(true);
  });
  test('计划 + 无结束时间 → 结束日 24:00', () => {
    const w = taskWindow(mk({ date: Y1, time: '09:00', plan: true, endDate: T }))!;
    expect(w.end.getTime()).toBe(new Date(2026, 10, 2, 0, 0, 0).getTime());
    expect(w.hasEnd).toBe(false);
  });
  test('无计划 + 时间 + 用时 → 开始 + 用时', () => {
    const w = taskWindow(mk({ date: T, time: '09:00', estimate: 45 }))!;
    expect(w.end.getTime()).toBe(new Date(2026, 10, 1, 9, 45, 0).getTime());
  });
  test('无计划 + 时间 + 无用时 → 到点即逾期', () => {
    const w = taskWindow(mk({ date: T, time: '09:00' }))!;
    expect(w.end.getTime()).toBe(w.start.getTime());
  });
  test('全天 → 当天 24:00', () => {
    const w = taskWindow(mk({ date: T }))!;
    expect(w.allDay).toBe(true);
    expect(w.end.getTime()).toBe(new Date(2026, 10, 2, 0, 0, 0).getTime());
  });
  test('计划与用时都有 → 取更晚', () => {
    const w = taskWindow(mk({ date: T, time: '09:00', estimate: 30, plan: true, endDate: T, endTime: '17:00' }))!;
    expect(w.end.getTime()).toBe(new Date(2026, 10, 1, 17, 0, 0).getTime());
    const w2 = taskWindow(mk({ date: T, time: '09:00', estimate: 600, plan: true, endDate: T, endTime: '17:00' }))!;
    expect(w2.end.getTime()).toBe(new Date(2026, 10, 1, 19, 0, 0).getTime());
  });
  test('没有日期 → null', () => {
    expect(taskWindow(mk({}))).toBeNull();
  });
});

describe('reminderState', () => {
  test('已到点未读 → overdue，取最近的一个节点', () => {
    const r = reminderState(mk({
      date: T, time: '09:00', remindMode: '单次提醒',
      remindCfg: { anchor: T + ' 09:00', offsets: [0, 5, 30], read: [0] }
    }), new Date(2026, 10, 1, 9, 6, 0).getTime());
    expect(r!.overdue).toBe(true);
    expect(r!.idx).toBe(1);
  });
  test('全部读完 → null', () => {
    const r = reminderState(mk({
      remindCfg: { anchor: T + ' 09:00', offsets: [0], read: [0] }
    }), NOW);
    expect(r).toBeNull();
  });
});

describe('归一化与排期', () => {
  test('旧数据只有持续 N 天 → 换算成计划区间', () => {
    const t = normTask({ id: 'x', 标题: '旧事项', 日期: '2026-11-01', 持续: 3, 计划: '' });
    expect(t.plan).toBe(true);
    expect(t.endDate).toBe('2026-11-03');
    expect(taskSpan(t)).toBe(3);
  });
  test('「拆分」JSON 还原成子项，id 按位序', () => {
    const t = normTask({
      id: 'x', 标题: '拆分', 日期: T,
      拆分: JSON.stringify([{ t: '语文', m: 30, dy: 1 }, { t: '数学', m: 45, dy: 2 }])
    });
    expect(t.subs.map((s) => s.id)).toEqual(['s0', 's1']);
    expect(t.subs[1].min).toBe(45);
  });
  test('shiftPlanTo 平移计划区间而不是重算', () => {
    const t = mk({ date: '2026-11-01', plan: true, endDate: '2026-11-03' });
    shiftPlanTo(t, '2026-11-05');
    expect(t.date).toBe('2026-11-05');
    expect(t.endDate).toBe('2026-11-07');
  });
  test('subPlan 按天数顺序排期', () => {
    const t = mk({
      date: '2026-11-01',
      subs: [
        { id: 's0', title: 'a', min: 0, days: 2, done: false, doneAt: '' },
        { id: 's1', title: 'b', min: 0, days: 1, done: false, doneAt: '' },
        { id: 's2', title: 'c', min: 0, days: 0, done: false, doneAt: '' }
      ]
    });
    const segs = subPlan(t);
    expect(ymd(segs[0].start!)).toBe('2026-11-01');
    expect(ymd(segs[0].end!)).toBe('2026-11-02');
    expect(ymd(segs[1].start!)).toBe('2026-11-03');
    expect(segs[2].start).toBeNull();
  });
});

describe('重复规则', () => {
  test('每月 1/31 → 2/28', () => {
    expect(nextRepeatDate('2026-01-31', '每月')).toBe('2026-02-28');
  });
  test('每年 2/29 → 次年 2/28', () => {
    expect(nextRepeatDate('2024-02-29', '每年')).toBe('2025-02-28');
  });
  test('工作日跳过周末', () => {
    expect(nextRepeatDate('2026-10-30', '工作日')).toBe('2026-11-02');
  });
});

describe('筛选与排序', () => {
  const f: Filters = { prio: [], tags: [], status: 'todo', from: '', to: '', kw: '' };
  test('todo 只显示未完成（今天完成的仍显示）', () => {
    const list = [
      mk({ id: 'a', date: T }),
      mk({ id: 'b', date: T, done: true, doneAt: T + ' 10:00' }),
      mk({ id: 'c', date: Y1, done: true, doneAt: Y1 + ' 10:00' })
    ];
    expect(applyFilters(list, f, NOW_D).map((t) => t.id)).toEqual(['a', 'b']);
  });
  test('关键词同时搜子项标题', () => {
    const list = [mk({ id: 'a', subs: [{ id: 's0', title: '数学作业', min: 0, days: 0, done: false, doneAt: '' }] })];
    expect(applyFilters(list, { ...f, kw: '数学' }, NOW_D).length).toBe(1);
  });
  test('时间排序：未完成在前，按日期、时间', () => {
    const list = [
      mk({ id: 'late', date: T, time: '18:00' }),
      mk({ id: 'early', date: T, time: '09:00' }),
      mk({ id: 'done', date: T, done: true, doneAt: T + ' 08:00' })
    ];
    expect(sortTasks(list, 'time').map((t) => t.id)).toEqual(['early', 'late', 'done']);
  });
  test('今日范围包含逾期未完成', () => {
    const ctx = { view: 'today' as const, selectedList: null, selectedTag: null };
    expect(inScope(mk({ date: Y2 }), ctx, NOW_D)).toBe(true);
    expect(inScope(mk({ date: T1 }), ctx, NOW_D)).toBe(false);
    expect(inScope(mk({ date: '' }), ctx, NOW_D)).toBe(false);
  });
});

describe('快速添加', () => {
  test('明天下午 3 点 + 标签 + 优先级', () => {
    const d = parseQuick('明天下午3点开会 #工作 !p1', NOW_D);
    expect(d.date).toBe(T1);
    expect(d.time).toBe('15:00');
    expect(d.tags).toEqual(['工作']);
    expect(d.prio).toBe('P1');
    expect(d.title).toBe('开会');
  });
  test('只给标题时日期落到今天', () => {
    const d = parseQuick('买菜', NOW_D);
    expect(d.date).toBe(T);
    expect(d.time).toBe('');
    expect(d.title).toBe('买菜');
  });
});

describe('纪念日分组', () => {
  test('没有分组时退到类型', () => {
    const cd = {
      id: 'c1', name: '纪念日', type: '纪念日', date: T, note: '', color: '#177CB0',
      group: '', sys: '', createdAt: T
    };
    expect(cdGroupOf(cd)).toBe('纪念日');
  });
});

describe('铃铛角标：提醒 + 逾期，按 id 去重', () => {
  test('同一条既逾期又有待复习，只算一次', () => {
    const t = mk({
      date: T, time: hm(rel(-90)), estimate: 60,
      remindMode: '单次提醒',
      remindCfg: { anchor: T + ' ' + hm(rel(-120)), offsets: [0], read: [] }
    });
    const r = alertSummary([t], NOW);
    expect(r.total).toBe(1);
    expect(r.remind).toBe(1);
    expect(r.overdue).toBe(1);
  });
  test('已完成不计入', () => {
    const t = mk({ date: Y1, time: '09:00', done: true });
    expect(alertSummary([t], NOW).total).toBe(0);
  });
  test('两条不同任务各算一次', () => {
    const a = mk({ id: 'a', date: T, time: hm(rel(-90)), estimate: 60 });
    const b = mk({ id: 'b', date: Y1, time: '09:00' });
    expect(alertSummary([a, b], NOW).total).toBe(2);
  });
});

describe('备份解析', () => {
  test('自家导出的 camelCase', () => {
    const b = parseBundleText(
      JSON.stringify({ app: '日程台', tasks: [{ title: '写周报', date: '2026-11-02', time: '09:30', estimate: 45 }] })
    );
    expect(bundleCount(b)).toBe(1);
    expect(b.tasks[0].title).toBe('写周报');
    expect(b.tasks[0].time).toBe('09:30');
    expect(b.tasks[0].estimate).toBe(45);
  });
  test('中文列名（包在 properties 里）', () => {
    const b = parseBundleText(
      JSON.stringify({ tasks: [{ properties: { 标题: { text: '交房租' }, 日期: { date: '2026-11-05' } } }] })
    );
    expect(b.tasks[0].title).toBe('交房租');
    expect(b.tasks[0].date).toBe('2026-11-05');
  });
  test('data 文件形态 tables', () => {
    const b = parseBundleText(
      JSON.stringify({ tables: { RBTQ4jwngkyjWiZE7VqCJZ: [{ properties: { 标题: { text: 'A' } } }] } })
    );
    expect(b.tasks.length).toBe(1);
  });
  test('坏 JSON 与空文件都要报错', () => {
    expect(() => parseBundleText('{oops')).toThrow();
    expect(() => parseBundleText('{"tasks":[]}')).toThrow();
  });
  test('坏提醒配置被丢弃，不写脏 anchor', () => {
    const b = parseBundleText(
      JSON.stringify({ tasks: [{ title: 'x', remindCfg: { anchor: '不是时间', offsets: [0] } }] })
    );
    expect(b.tasks[0].remindCfg).toBeNull();
  });
});
