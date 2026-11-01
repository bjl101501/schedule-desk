/* 任务领域逻辑：拆分、排期、重复、归一化。全部纯函数 */
import type { Countdown, DbRow, Habit, Pomodoro, Seg, Sub, SubStat, Task } from './types';
import {
  addDays, coarseSpan, dayDiff, hmStr, isoToYmd, mdShort, parseHM, parseJson, parseYmd, stampDay, stampNow, stampTime,
  today0, ymd
} from './date';
import { QUAD_LABEL, themedColor } from './constants';

/* ---------- 拆分 / 子项 ---------- */
export function unpackSubs(raw: unknown): Sub[] {
  const arr = parseJson<unknown[]>(raw);
  if (!arr || Object.prototype.toString.call(arr) !== '[object Array]') return [];
  return (arr as Record<string, unknown>[])
    .map((x, i) => ({
      id: 's' + i,
      title: String(x.t || x.title || ''),
      min: Number(x.m || x.min) || 0,
      // 有 days 的子项会按顺序排进日期，0 表示只当时长拆分，不占日子
      days: Math.max(0, Number(x.dy || x.days) || 0),
      done: !!(x.d || x.done),
      doneAt: String(x.dt || '')
    }))
    .filter((x) => !!x.title);
}

export function packSubs(subs: Sub[] | undefined): string {
  if (!subs || !subs.length) return '';
  return JSON.stringify(
    subs
      .map((x) => ({
        t: String(x.title || '').trim(),
        m: Number(x.min) || 0,
        dy: Math.max(0, Number(x.days) || 0),
        d: !!x.done,
        dt: x.doneAt || ''
      }))
      .filter((x) => !!x.t)
  );
}

export function subDoneText(t: Task | null, x: Sub, seg?: Seg | null): string {
  if (!x || !x.done || !x.doneAt) return '';
  const day = stampDay(x.doneAt);
  const hm = stampTime(x.doneAt);
  const doneD = parseYmd(day);
  if (!doneD) return '';
  const start = seg && seg.start ? seg.start : t && t.date ? parseYmd(t.date) : null;
  const end = seg && seg.end ? seg.end : start;
  if (!start || !end) return hm || day;
  const doneMs = doneD.getTime() + (parseHM(hm) || 0) * 60000;
  const startMs = start.getTime();
  const endMs = addDays(end, 1).getTime();
  if (doneMs < startMs) return '提前 ' + coarseSpan(startMs - doneMs) + '完成';
  if (doneMs > endMs) return '逾期 ' + coarseSpan(doneMs - endMs) + '后完成';
  return dayDiff(end, doneD) === 0 ? hm : mdShort(doneD) + ' ' + hm;
}

export function subStats(t: Task | null): SubStat {
  const subs = (t && t.subs) || [];
  const n = subs.length;
  let done = 0;
  let min = 0;
  subs.forEach((x) => {
    if (x.done) done++;
    min += Number(x.min) || 0;
  });
  return { n, done, min, pct: n ? Math.round((done / n) * 100) : 0, all: n > 0 && done === n };
}

/* ---------- 跨天 / 阶段排期 ---------- */
export function taskSpan(t: Task | null | undefined): number {
  if (t && t.plan && t.endDate) {
    const a = parseYmd(t.date);
    const b = parseYmd(t.endDate);
    if (a && b) return Math.max(1, dayDiff(a, b) + 1);
  }
  return 1;
}

export function isMultiDay(t: Task): boolean {
  return taskSpan(t) > 1;
}

/** 改开始日期时计划区间整体平移；改成「未安排」则收起计划 */
export function shiftPlanTo(t: Task, newDate: string): boolean {
  if (!t) return false;
  const old = t.date || '';
  if (old === newDate) return false;
  if (!newDate) {
    t.plan = false;
    t.endDate = '';
    t.endTime = '';
  } else if (t.plan && t.endDate && old) {
    const oldD = parseYmd(old);
    const newD = parseYmd(newDate);
    const endD = parseYmd(t.endDate);
    if (oldD && newD && endD) {
      const delta = dayDiff(oldD, newD);
      if (delta) t.endDate = ymd(addDays(endD, delta));
    }
  }
  t.date = newDate;
  return true;
}

export function segDateText(seg: Seg | null | undefined): string {
  if (!seg || !seg.start) return '';
  const a = mdShort(seg.start);
  const b = mdShort(seg.end);
  return a === b ? a : a + '–' + b;
}

export function subPlan(t: Task | null): Seg[] {
  const start = t && t.date ? parseYmd(t.date) : null;
  const out: Seg[] = [];
  if (!start || !t) return out;
  let cur = new Date(start);
  (t.subs || []).forEach((x, i) => {
    const days = Math.max(0, Number(x.days) || 0);
    const seg: Seg = { i, title: x.title, days, done: !!x.done, start: null, end: null, dayFrom: 0 };
    if (days > 0) {
      seg.dayFrom = dayDiff(start, cur);
      seg.start = new Date(cur);
      seg.end = addDays(cur, days - 1);
      cur = addDays(cur, days);
    }
    out.push(seg);
  });
  return out;
}

export function planDays(t: Task): number {
  return (t.subs || []).reduce((a, x) => a + Math.max(0, Number(x.days) || 0), 0);
}

export function plannedEnd(t: Task): Date | null {
  const start = t && t.date ? parseYmd(t.date) : null;
  if (!start) return null;
  return addDays(start, taskSpan(t) - 1);
}

export function quadKey(t: Task): string {
  if (t.important && t.urgent) return 'q2';
  if (t.important) return 'q1';
  if (t.urgent) return 'q3';
  return 'q4';
}

export function quadLabel(q: string): string {
  return QUAD_LABEL[q] || '';
}

export function prioCls(t: Task | null): string {
  const p = t && t.prio ? String(t.prio).toLowerCase() : '';
  return /^p[0-3]$/.test(p) ? p : 'p3';
}

export function timeRangeText(t: Task | null): string {
  if (!t || !t.time) return '';
  const st = parseHM(t.time);
  if (st === null) return t.time;
  if (!t.estimate) return t.time;
  return t.time + '–' + hmStr(st + t.estimate);
}

/** 子项是否逾期：过了排期最后一天还没勾才算（当天不算逾期） */
export function subLate(seg: Seg | null | undefined, done: boolean, today: Date): boolean {
  if (done || !seg || !seg.end) return false;
  return dayDiff(today, seg.end) < 0;
}

/** 子项勾选后同步父任务完成状态：全部完成即视为完成 */
export function syncDoneFromSubs(t: Task): boolean {
  const st = subStats(t);
  if (!st.n) return false;
  if (st.all && !t.done) {
    t.done = true;
    t.doneAt = stampNow();
    return true;
  }
  if (!st.all && t.done) {
    t.done = false;
    t.doneAt = '';
    return true;
  }
  return false;
}

/* ---------- 重复 ---------- */
export function repeatLabel(t: Task): string {
  return t.repeat && t.repeat !== '不重复' ? t.repeat : '';
}

export function nextRepeatDate(dateStr: string, rule: string): string {
  const d = parseYmd(dateStr);
  if (!d) return '';
  if (rule === '每天') return ymd(addDays(d, 1));
  if (rule === '每周') return ymd(addDays(d, 7));
  if (rule === '每月') {
    let nm = d.getMonth() + 1;
    let ny = d.getFullYear();
    if (nm > 11) {
      nm = 0;
      ny++;
    }
    const lastDay = new Date(ny, nm + 1, 0).getDate();
    return ymd(new Date(ny, nm, Math.min(d.getDate(), lastDay)));
  }
  if (rule === '每年') {
    const ty = d.getFullYear() + 1;
    const m0 = d.getMonth();
    const lastD = new Date(ty, m0 + 1, 0).getDate();
    return ymd(new Date(ty, m0, Math.min(d.getDate(), lastD)));
  }
  if (rule === '工作日') {
    let nd = addDays(d, 1);
    while (nd.getDay() === 0 || nd.getDay() === 6) nd = addDays(nd, 1);
    return ymd(nd);
  }
  return '';
}

export function cloneNextRepeat(t: Task, today: Date = today0()): Task | null {
  const nd = nextRepeatDate(t.date, t.repeat);
  if (!nd) return null;
  const startD = parseYmd(nd);
  const nt: Task = {
    id: '',
    title: t.title,
    note: t.note,
    list: t.list,
    tags: (t.tags || []).slice(),
    prio: t.prio,
    important: t.important,
    urgent: t.urgent,
    done: false,
    remindMode: t.remindMode,
    remindCfg: null,
    date: nd,
    time: t.time,
    estimate: t.estimate,
    subs: (t.subs || []).map((x) => ({ id: '', title: x.title, min: x.min, days: x.days || 0, done: false, doneAt: '' })),
    plan: !!t.plan,
    endDate: t.plan && t.endDate && startD ? ymd(addDays(startD, taskSpan(t) - 1)) : '',
    endTime: t.endTime || '',
    repeat: t.repeat,
    span: t.plan ? taskSpan(t) : 1,
    doneAt: '',
    sort: t.sort,
    createdAt: ymd(today)
  };
  if (t.remindCfg && t.remindCfg.offsets) {
    nt.remindCfg = { anchor: nd + ' ' + (t.time || '09:00'), offsets: t.remindCfg.offsets.slice(), read: [] };
  }
  return nt;
}

/* ---------- 归一化（properties 中文列名 → 业务对象） ---------- */
export function normTask(r: DbRow): Task {
  const cfg = parseJson<Record<string, unknown>>(r['提醒设置']) || {};
  // 旧数据只有「持续 N 天」：读到时换算成计划区间，持续字段此后只读
  const legacySpan = Math.max(1, Number(r['持续']) || 1);
  const startDate = isoToYmd(r['日期']);
  let endDate = isoToYmd(r['结束日期']);
  const planRaw = r['计划'];
  const plan = planRaw === undefined || planRaw === null || planRaw === '' ? legacySpan > 1 : !!planRaw;
  if (plan && !endDate && startDate) {
    const sd = parseYmd(startDate);
    endDate = sd ? ymd(addDays(sd, legacySpan - 1)) : startDate;
  }
  return {
    id: String(r._id || r.record_id || r.id || ''),
    title: String(r['标题'] || '未命名事项'),
    note: String(r['备注'] || ''),
    list: String(r['清单'] || '收集箱'),
    tags: String(r['标签'] || '')
      .split(',')
      .filter((x) => !!x),
    prio: String(r['优先级'] || '').toUpperCase().slice(0, 2),
    important: !!r['重要'],
    urgent: !!r['紧急'],
    done: !!r['已完成'],
    remindMode: String(r['提醒模式'] || '不提醒'),
    remindCfg: cfg as unknown as Task['remindCfg'],
    date: isoToYmd(r['日期']),
    time: String(r['时间'] || ''),
    estimate: Number(r['预计时长']) || 0,
    doneAt: String(r['完成时间'] || ''),
    sort: Number(r['排序']) || 0,
    subs: unpackSubs(r['拆分']),
    repeat: String(r['重复'] || ''),
    plan,
    endDate,
    endTime: String(r['结束时间'] || ''),
    span: plan ? Math.max(1, legacySpan) : 1,
    createdAt: isoToYmd(r['创建时间']),
    _new: false
  };
}

export function normHabit(r: DbRow): Habit {
  let log = parseJson<unknown>(r['打卡记录']);
  if (!log || !Array.isArray(log) || !log.length) log = [];
  return {
    id: String(r._id || r.record_id || r.id || ''),
    name: String(r['名称'] || '习惯'),
    icon: String(r['图标'] || 'target'),
    color: themedColor(r['颜色'] as string),
    target: Number(r['每周目标']) || 7,
    streak: Number(r['连续天数']) || 0,
    total: Number(r['总打卡']) || 0,
    log: log as string[],
    createdAt: isoToYmd(r['创建时间'])
  };
}

export function normCountdown(r: DbRow): Countdown {
  return {
    id: String(r._id || r.record_id || r.id || ''),
    name: String(r['名称'] || '纪念日'),
    type: String(r['类型'] || '倒数日'),
    date: isoToYmd(r['日期']),
    note: String(r['备注'] || ''),
    color: themedColor(r['颜色'] as string),
    group: String(r['分组'] || ''),
    sys: String(r['系统'] || ''),
    createdAt: isoToYmd(r['创建时间'])
  };
}

export function normPomo(r: DbRow): Pomodoro {
  return {
    id: String(r._id || r.record_id || r.id || ''),
    task: String(r['任务'] || ''),
    type: String(r['类型'] || '专注'),
    duration: Number(r['时长']) || 0,
    start: isoToYmd(r['开始时间']),
    date: isoToYmd(r['日期']),
    sub: String(r['子项'] || ''),
    pauseCount: Number(r['暂停次数']) || 0,
    pauseSec: Number(r['暂停时长']) || 0
  };
}

export function cdGroupOf(cd: Countdown): string {
  const g = String((cd && cd.group) || '').trim();
  if (g) return g;
  return (cd && cd.type) || '其他';
}
