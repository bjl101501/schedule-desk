/* 计算层：排序 / 范围 / 筛选 / 清单标签集合 / 连续天数。全部把状态作为参数传进来 */
import type { Filters, Habit, Task, ViewKey } from './types';
import { addDays, dayDiff, parseAnchor, parseHM, parseYmd, stampDay, today0, ymd } from './date';
import { EB_OFFSETS, PRIOS } from './constants';
import { reminderState, taskState } from './window';

export interface ScopeCtx {
  view: ViewKey;
  selectedList: string | null;
  selectedTag: string | null;
}

export function taskTimeVal(t: Task): number {
  const m = parseHM(t.time);
  return m === null ? 24 * 60 + 1 : m;
}

export function sortTasks(arr: Task[], sortMode: 'time' | 'manual'): Task[] {
  const manual = sortMode === 'manual';
  return arr.slice().sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.done && b.done) return (b.doneAt || '').localeCompare(a.doneAt || '');
    const da = a.date || '9999-99-99';
    const db = b.date || '9999-99-99';
    if (da !== db) return da < db ? -1 : 1;
    const sa = Number(a.sort) || 0;
    const sb = Number(b.sort) || 0;
    const ta = taskTimeVal(a);
    const tb = taskTimeVal(b);
    if (manual) {
      if (sa !== sb) return sa - sb;
      if (ta !== tb) return ta - tb;
    } else {
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
    return diff >= 0 && diff < 7;
  }
  if (ctx.view === 'inbox') return !t.date || (t.list || '收集箱') === '收集箱';
  return true;
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
    if (f.kw) {
      const kw = f.kw.toLowerCase();
      const subTxt = (t.subs || []).map((x) => x.title).join(' ');
      const hay = (t.title + ' ' + t.note + ' ' + t.tags.join(' ') + ' ' + t.list + ' ' + subTxt).toLowerCase();
      if (hay.indexOf(kw) === -1) return false;
    }
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

export function pendingReminders(tasks: Task[], now: number): { task: Task; r: NonNullable<ReturnType<typeof reminderState>> }[] {
  const out: { task: Task; r: NonNullable<ReturnType<typeof reminderState>> }[] = [];
  tasks.forEach((t) => {
    const r = reminderState(t, now);
    if (r && r.overdue) out.push({ task: t, r });
  });
  return out.sort((a, b) => a.r.at - b.r.at);
}

/**
 * 改日期 / 时间之后把提醒基准一起挪过去。
 * 只改 t.date 不动 remindCfg.anchor 的话：提醒还在旧的那天响，而且一直算「逾期」。
 */
export function syncRemindAnchor(t: Task, oldDate: string, oldTime: string): boolean {
  if (!t || !t.remindCfg) return false;
  const cfg = t.remindCfg;
  if (!t.date) {
    if (!cfg.anchor) return false;
    t.remindCfg = { anchor: '', offsets: (cfg.offsets || EB_OFFSETS).slice(), read: [] };
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
  // 日子变了，原来的「已提醒」标记作废
  t.remindCfg = { anchor: next, offsets: (cfg.offsets || EB_OFFSETS).slice(), read: [] };
  return true;
}

/** 时段文案：给今日面板与列表用 */
export function todayStr(now: number = Date.now()): string {
  return ymd(new Date(now));
}

export function defaultToday(): Date {
  return today0();
}

/*
  铃铛角标口径（功能表 §1.1 / CHANGELOG v2.2.0）：
  = 已到点未确认的提醒 + 已逾期任务，同一条任务只算一次。
  两个都命中的任务（既逾期又有待复习）只贡献 1。
*/
export function alertSummary(
  tasks: Task[],
  now: number
): { total: number; remind: number; overdue: number; ids: string[] } {
  const ids = new Set<string>();
  let remind = 0;
  let overdue = 0;
  tasks.forEach((t) => {
    if (!t || t.done) return;
    let hit = false;
    const r = reminderState(t, now);
    if (r && r.overdue) {
      remind++;
      hit = true;
    }
    if (taskState(t, now).key === 'overdue') {
      overdue++;
      hit = true;
    }
    if (hit) ids.add(t.id);
  });
  return { total: ids.size, remind, overdue, ids: Array.from(ids) };
}
