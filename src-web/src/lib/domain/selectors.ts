/* 计算层：排序 / 范围 / 筛选 / 清单标签集合 / 连续天数。全部把状态作为参数传进来 */
import type { Filters, Habit, Task, ViewKey } from './types';
import { addDays, dayDiff, parseAnchor, parseHM, parseYmd, stampDay, ymd } from './date';
import { EB_OFFSETS, PRIOS } from './constants';
import { reminderState, taskState, taskWindow } from './window';

export interface ScopeCtx {
  view: ViewKey;
  selectedList: string | null;
  selectedTag: string | null;
}

export function taskTimeVal(t: Task): number {
  const m = parseHM(t.time);
  return m === null ? 24 * 60 + 1 : m;
}

/*
  两种排序口径：
  - time：日期优先，同一天再比时间，最后才看手动序；
  - manual：手动序优先。卡片 / 看板是跨日期的平铺列表，若还把日期排在前面，
    拖过另一张卡只改了 sort 也会被日期压回去，看起来就是「拖了没反应、位置却变了」。
  日期仍作 manual 里的第二关键字，同一天内保持稳定。
*/
export function sortTasks(arr: Task[], sortMode: 'time' | 'manual'): Task[] {
  const manual = sortMode === 'manual';
  return arr.slice().sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.done && b.done) return (b.doneAt || '').localeCompare(a.doneAt || '');
    const da = a.date || '9999-99-99';
    const db = b.date || '9999-99-99';
    const sa = Number(a.sort) || 0;
    const sb = Number(b.sort) || 0;
    const ta = taskTimeVal(a);
    const tb = taskTimeVal(b);
    if (manual) {
      if (sa !== sb) return sa - sb;
      if (da !== db) return da < db ? -1 : 1;
      if (ta !== tb) return ta - tb;
    } else {
      if (da !== db) return da < db ? -1 : 1;
      if (ta !== tb) return ta - tb;
      if (sa !== sb) return sa - sb;
    }
    let pa = PRIOS.indexOf(a.prio);
    let pb = PRIOS.indexOf(b.prio);
    if (pa < 0) pa = 99;
    if (pb < 0) pb = 99;
    return pa - pb;
  });
}

export function inScope(t: Task, ctx: ScopeCtx, today: Date): boolean {
  if (ctx.selectedList) return (t.list || '收集箱') === ctx.selectedList;
  if (ctx.selectedTag) return t.tags.indexOf(ctx.selectedTag) > -1;
  if (ctx.view === 'today') {
    const s = ymd(today);
    return t.date === s || (!!t.date && t.date < s);
  }
  if (ctx.view === 'next7') {
    if (!t.date) return false;
    const d = parseYmd(t.date);
    if (!d) return false;
    const diff = dayDiff(today, d);
    if (diff >= 0 && diff < 7) return true;
    // 跨天计划：开始日在今天之前、但结束日落在今天或之后，也属于最近 7 天要跟进的事项
    if (diff < 0 && t.plan && t.endDate) {
      const ed = parseYmd(t.endDate);
      if (ed && dayDiff(today, ed) >= 0) return true;
    }
    return false;
  }
  if (ctx.view === 'inbox') return !t.date || (t.list || '收集箱') === '收集箱';
  return true;
}

/** 搜索弹窗与筛选面板共用同一份关键词匹配：标题 + 备注 + 标签 + 清单 + 子项标题 */
export function matchTaskKw(t: Task, rawKw: string): boolean {
  const kw = String(rawKw || '').trim().toLowerCase();
  if (!kw) return true;
  const subTxt = (t.subs || []).map((x) => x.title).join(' ');
  const hay = (t.title + ' ' + t.note + ' ' + t.tags.join(' ') + ' ' + t.list + ' ' + subTxt).toLowerCase();
  return hay.indexOf(kw) > -1;
}

export function applyFilters(arr: Task[], f: Filters, today: Date): Task[] {
  const todayS = ymd(today);
  return arr.filter((t) => {
    if (f.status === 'todo') {
      if (t.done && stampDay(t.doneAt) !== todayS) return false;
    } else if (f.status === 'done') {
      if (!t.done) return false;
    }
    if (f.prio.length && f.prio.indexOf(t.prio || 'none') === -1) return false;
    if (f.tags.length && !f.tags.some((g) => t.tags.indexOf(g) > -1)) return false;
    if (f.from && (!t.date || t.date < f.from)) return false;
    if (f.to && (!t.date || t.date > f.to)) return false;
    if (f.kw && !matchTaskKw(t, f.kw)) return false;
    return true;
  });
}

export function visibleTasks(tasks: Task[], ctx: ScopeCtx, f: Filters, sortMode: 'time' | 'manual', today: Date): Task[] {
  return sortTasks(
    applyFilters(
      tasks.filter((t) => inScope(t, ctx, today)),
      f,
      today
    ),
    sortMode
  );
}

export function activeFilterCount(f: Filters): number {
  let n = 0;
  if (f.prio.length) n++;
  if (f.tags.length) n++;
  if (f.status !== 'todo') n++;
  if (f.from) n++;
  if (f.to) n++;
  if (f.kw) n++;
  return n;
}

export function orderNames(names: string[], order: string[]): string[] {
  if (!order.length) return names;
  const idx: Record<string, number> = {};
  order.forEach((n, i) => (idx[n] = i));
  const base: Record<string, number> = {};
  names.forEach((n, i) => (base[n] = i));
  return names.slice().sort((a, b) => {
    const ia = idx[a];
    const ib = idx[b];
    if (ia === undefined && ib === undefined) return base[a] - base[b];
    if (ia === undefined) return 1;
    if (ib === undefined) return -1;
    return ia - ib;
  });
}

export function allLists(tasks: Task[], custom: string[], order: string[]): string[] {
  const map: Record<string, number> = {};
  tasks.forEach((t) => {
    const k = t.list || '收集箱';
    map[k] = (map[k] || 0) + 1;
  });
  custom.forEach((n) => {
    if (!map[n]) map[n] = 0;
  });
  if (!map['收集箱']) map['收集箱'] = 0;
  const names = Object.keys(map).sort((a, b) => {
    if (a === '收集箱') return -1;
    if (b === '收集箱') return 1;
    return map[b] - map[a];
  });
  return orderNames(names, order);
}

export function allTags(tasks: Task[], custom: string[], order: string[]): string[] {
  const map: Record<string, number> = {};
  tasks.forEach((t) => t.tags.forEach((g) => (map[g] = (map[g] || 0) + 1)));
  custom.forEach((n) => {
    if (!map[n]) map[n] = 0;
  });
  const names = Object.keys(map).sort((a, b) => map[b] - map[a]);
  return orderNames(names, order);
}

export function calcStreak(h: Habit, today: Date): number {
  const set: Record<string, number> = {};
  (h.log || []).forEach((d) => (set[d] = 1));
  let cur = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let n = 0;
  if (!set[ymd(cur)]) cur = addDays(cur, -1);
  while (set[ymd(cur)]) {
    n++;
    cur = addDays(cur, -1);
  }
  return n;
}

export type AttentionKind = 'overdue' | 'remind' | 'soon';

export interface AttentionItem {
  task: Task;
  kind: AttentionKind;
  /** 排序依据：逾期用结束时刻，提醒用节点时刻 */
  at: number;
  /** 提醒节点下标；逾期项为 -1 */
  idx: number;
  offset: number;
}

/**
 * 待处理事项的唯一出口：铃铛角标与提醒中心都必须用它，别再各算一套。
 *
 * 之前分成两份判据：角标 = 提醒节点 ∪ 逾期任务，列表只认提醒节点。
 * 全天事项默认没有提醒，于是「角标 1、点开空空」。
 * 同一事项只出一条，优先级 逾期 > 已到点 > 24 小时内。
 */
export function attention(tasks: Task[], now: number): AttentionItem[] {
  const out: AttentionItem[] = [];
  tasks.forEach((t) => {
    if (!t || t.done) return;
    if (taskState(t, now).key === 'overdue') {
      const w = taskWindow(t);
      out.push({ task: t, kind: 'overdue', at: w ? w.end.getTime() : now, idx: -1, offset: 0 });
      return;
    }
    const r = reminderState(t, now);
    if (!r) return;
    if (r.overdue) out.push({ task: t, kind: 'remind', at: r.at, idx: r.idx, offset: r.offset });
    else if (r.at - now < 86400000) out.push({ task: t, kind: 'soon', at: r.at, idx: r.idx, offset: r.offset });
  });
  return out.sort((a, b) => a.at - b.at);
}

export function pendingReminders(tasks: Task[], now: number): { task: Task; r: NonNullable<ReturnType<typeof reminderState>> }[] {
  const out: { task: Task; r: NonNullable<ReturnType<typeof reminderState>> }[] = [];
  attention(tasks, now).forEach((i) => {
    if (i.kind !== 'remind') return;
    const r = reminderState(i.task, now);
    if (r) out.push({ task: i.task, r });
  });
  return out;
}

/**
 * 改日期 / 时间之后把提醒基准一起挪过去。
 * 只改 t.date 不动 remindCfg.anchor 的话：提醒还在旧的那天响，而且一直算「逾期」。
 */
export function syncRemindAnchor(t: Task, oldTime: string): boolean {
  if (!t || !t.remindCfg) return false;
  const cfg = t.remindCfg;
  const keepExtras = (base: NonNullable<Task['remindCfg']>): NonNullable<Task['remindCfg']> => {
    if (cfg.snooze != null) base.snooze = cfg.snooze;
    if (cfg.end != null) base.end = cfg.end;
    return base;
  };
  if (!t.date) {
    if (!cfg.anchor) return false;
    t.remindCfg = keepExtras({ anchor: '', offsets: (cfg.offsets || EB_OFFSETS).slice(), read: [] });
    return true;
  }
  const a = parseAnchor(cfg.anchor);
  let hhmm: string;
  if (!a) {
    if (!cfg.offsets || !cfg.offsets.length) return false;
    hhmm = t.time || '09:00';
  } else {
    const ah = String(a.getHours()).padStart(2, '0') + ':' + String(a.getMinutes()).padStart(2, '0');
    hhmm = ah === (oldTime || '09:00') ? t.time || '09:00' : ah;
  }
  const next = t.date + ' ' + hhmm;
  const cur = String(cfg.anchor || '').replace('T', ' ').slice(0, 16);
  if (cur === next) return false;
  // 日子变了，原来的「已提醒」标记作废，但「稍后提醒 / 结束提醒」设置保留
  t.remindCfg = keepExtras({ anchor: next, offsets: (cfg.offsets || EB_OFFSETS).slice(), read: [] });
  return true;
}

/*
  铃铛角标口径（功能表 §1.1 / CHANGELOG v2.2.0）：
  = 已到点未确认的提醒 + 已逾期任务，同一条任务只算一次。
  两个都命中的任务（既逾期又有待复习）只贡献 1。

  R21 起改为从 attention() 派生：逾期但没设提醒的事项（典型是全天事项）
  以前只进角标不进列表，现在两边同源。
*/
export function alertSummary(
  tasks: Task[],
  now: number
): { total: number; remind: number; overdue: number; ids: string[] } {
  let remind = 0;
  let overdue = 0;
  const ids: string[] = [];
  attention(tasks, now).forEach((i) => {
    if (i.kind === 'soon') return;
    if (i.kind === 'overdue') overdue++;
    else remind++;
    ids.push(i.task.id);
  });
  return { total: ids.length, remind, overdue, ids };
}
