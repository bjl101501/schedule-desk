/* 状态胶囊与提醒胶囊的文案/配色：视图只负责摆位置 */
import type { Task } from './types';
import { reminderState, taskState } from './window';

export function relTime(ts: number, now: number): string {
  const diff = Math.round((ts - now) / 60000);
  if (diff <= 0) return '已到时间';
  if (diff < 60) return diff + ' 分钟后';
  if (diff < 1440) return Math.round(diff / 60) + ' 小时后';
  return Math.round(diff / 1440) + ' 天后';
}

export interface StateChipView {
  label: string;
  tone: string;
}

export function stateChip(t: Task, now: number): StateChipView | null {
  const s = taskState(t, now);
  if (!s.label) return null;
  return { label: s.label, tone: s.tone };
}

export interface RemindChipView {
  text: string;
  cls: string;
}

export function remindChip(t: Task, now: number): RemindChipView | null {
  const r = reminderState(t, now);
  // 没设提醒也占个位：不然「没有」和「还没轮到」在列表里长得一模一样
  if (!r) {
    if (t.done) return null;
    const had = !!(t.remindCfg && t.remindCfg.anchor);
    return { text: had ? '已提醒' : '无提醒', cls: had ? 'soon none' : 'none' };
  }
  const isEb = t.remindMode === '艾宾浩斯';
  if (r.overdue) return { text: isEb ? '待复习' : '已提醒', cls: 'hit' };
  return { text: relTime(r.at, now), cls: 'soon' };
}

/** 详情 / 列表里只显示象限名，不带动作提示：括号里的「立即做」不是正式信息 */
export function quadShort(imp: boolean, urg: boolean): string {
  if (imp && urg) return '重要紧急';
  if (imp) return '重要不紧急';
  if (urg) return '不重要紧急';
  return '不重要不紧急';
}

/** 动作提示单独成一小段灰字，与象限名分层，不挤在同一串里 */
export function quadAction(imp: boolean, urg: boolean): string {
  if (imp && urg) return '立即做';
  if (imp) return '计划做';
  if (urg) return '少做';
  return '不做';
}

/**
 * 象限 → 色调类名，与四象限视图里 .qbox.q1…q4 的配色一一对应。
 * 详情、列表、象限格头必须用同一个映射，否则同一件事在两处是两个颜色。
 */
export function quadTone(imp: boolean, urg: boolean): string {
  if (imp && urg) return 'q2';
  if (imp) return 'q1';
  if (urg) return 'q3';
  return 'q4';
}

/** 优先级 → 色调类名，与列表里 .flag-p.p0…p3 共用 --tone-p* 变量 */
export function prioTone(prio: string): string {
  const p = String(prio || '').toUpperCase();
  return p === 'P0' || p === 'P1' || p === 'P2' ? 'p' + p.charAt(1) : 'p3';
}

export function ebSpan(offsets: number[]): string {
  if (!offsets.length) return '0 分钟';
  const max = Math.max(...offsets);
  if (max < 60) return max + ' 分钟';
  if (max < 1440) return Math.round(max / 60) + ' 小时';
  return Math.round(max / 1440) + ' 天';
}

export function ebStageName(off: number): string {
  if (off === 0) return '准时';
  if (off < 60) return off + ' 分钟';
  if (off < 1440) return Math.round(off / 60) + ' 小时';
  return Math.round(off / 1440) + ' 天';
}
