/* 统一状态机：时间窗口只有这一处定义，所有视图/通知/统计都读 taskState()
     开始 = 日期 + 时间（时间空 = 全天，从 00:00 起）
     结束 = 计划？(结束日期 + 结束时间，时间空 = 结束日 24:00)
                    ：定时 + 预计时长？开始 + 时长
                    ：定时无时长？开始（到点即逾期）
                    ：全天无计划？当天 24:00
     计划与预计时长都有时，取更晚的那个作为结束点。
*/
import type { ReminderState, Task, TaskState, TaskWindow } from './types';
import { addDays, coarseSpan, parseAnchor, parseHM, parseYmd } from './date';
import { taskSpan } from './task';
import { EB_OFFSETS } from './constants';

/** 计划的结束时刻；返回 null 表示没有计划。hasEnd=false 表示只到「结束日 24:00」 */
export function planEnd(t: Task | null): { ms: number; hasEnd: boolean } | null {
  if (!t || !t.plan || !t.endDate) return null;
  const d = parseYmd(t.endDate);
  if (!d) return null;
  const hm = parseHM(t.endTime);
  if (hm === null) return { ms: addDays(d, 1).getTime(), hasEnd: false };
  return { ms: d.getTime() + hm * 60000, hasEnd: true };
}

export function taskWindow(t: Task | null): TaskWindow | null {
  if (!t || !t.date) return null;
  const d = parseYmd(t.date);
  if (!d) return null;
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const est = Math.max(0, Number(t.estimate) || 0);
  const allDay = !t.time;
  const span = taskSpan(t);
  const pe = planEnd(t);
  let start: Date;
  let end: Date;
  let hasEnd = false;

  if (allDay) {
    start = dayStart;
    if (pe) {
      end = new Date(pe.ms);
      hasEnd = !!pe.hasEnd;
    } else {
      end = addDays(dayStart, 1);
    }
  } else {
    let hm = parseHM(t.time);
    if (hm === null) hm = 0;
    start = new Date(dayStart.getTime() + hm * 60000);
    const byEst = est > 0 ? start.getTime() + est * 60000 : start.getTime();
    if (pe && pe.ms > byEst) {
      end = new Date(pe.ms);
      hasEnd = !!pe.hasEnd;
    } else {
      end = new Date(byEst);
      hasEnd = est > 0;
    }
  }

  return { start, end, allDay, span, hasEstimate: est > 0, hasEnd };
}

export function spanText(ms: number): string {
  return coarseSpan(ms);
}

/** 剩余时间：与逾期同一套口径，只取最大单位 */
export function leftText(min: number): string {
  return coarseSpan(min * 60000);
}

export function taskState(t: Task | null, at: number = Date.now()): TaskState {
  const now = at;
  if (!t) return { key: 'none', label: '', tone: '' };
  if (t.done) return { key: 'done', label: '', tone: '' };
  const w = taskWindow(t);
  if (!w) return { key: 'unscheduled', label: '', tone: '' };
  const r = reminderState(t, now);

  if (now < w.start.getTime()) {
    // 提前提醒已到点：有预计时长说「即将开始」，没有则说「即将逾期」
    if (r && r.overdue && r.offset < 0) {
      if (w.allDay) return { key: 'upcoming', label: '今天要做', tone: 'cyan' };
      if (w.hasEstimate) return { key: 'upcoming', label: '即将开始', tone: 'cyan' };
      return { key: 'remindSoon', label: '即将逾期', tone: 'orange' };
    }
    return { key: 'planned', label: '', tone: '' };
  }

  if (now <= w.end.getTime()) {
    if (w.allDay) return { key: 'ongoing', label: '全天 · 进行中', tone: 'brand' };
    if (w.end.getTime() > w.start.getTime()) {
      const left = Math.max(1, Math.round((w.end.getTime() - now) / 60000));
      return { key: 'ongoing', label: '进行中 · 剩余 ' + leftText(left), tone: 'brand' };
    }
    // 没有预计时长也没有计划：到点即逾期，交给下面
  }

  // 全天任务按天算：昨天的事今天就是「已逾期 1 天」，不用小时去吓人
  if (w.allDay) {
    const days = Math.max(1, Math.ceil((now - w.end.getTime()) / 86400000));
    return { key: 'overdue', label: '已逾期 ' + days + ' 天', tone: 'red' };
  }
  return { key: 'overdue', label: '已逾期 ' + spanText(now - w.end.getTime()), tone: 'red' };
}

/** 提醒状态：已到点未读算 overdue，否则返回下一个将到的节点 */
export function reminderState(t: Task | null, at: number = Date.now()): ReminderState | null {
  const now = at;
  if (!t || t.done || !t.remindCfg || !t.remindCfg.anchor) return null;
  const anchor = parseAnchor(t.remindCfg.anchor);
  if (!anchor) return null;
  const offs = t.remindCfg.offsets && t.remindCfg.offsets.length ? t.remindCfg.offsets : EB_OFFSETS;
  const read = t.remindCfg.read || [];
  let best: number | null = null;
  let bestIdx = -1;
  for (let i = 0; i < offs.length; i++) {
    if (read.indexOf(i) > -1) continue;
    const ms = anchor.getTime() + offs[i] * 60000;
    if (ms <= now && (best === null || ms > best)) {
      best = ms;
      bestIdx = i;
    }
  }
  if (best !== null) {
    return { at: best, idx: bestIdx, offset: offs[bestIdx], overdue: true, mode: t.remindMode || '' };
  }
  for (let j = 0; j < offs.length; j++) {
    if (read.indexOf(j) > -1) continue;
    const ms2 = anchor.getTime() + offs[j] * 60000;
    if (ms2 > now) return { at: ms2, idx: j, offset: offs[j], overdue: false, mode: t.remindMode || '' };
  }
  return null;
}
