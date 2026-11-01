/*
  日历时间栅格的纯布局计算：从 CalendarView 里提出来，好单独测。
  「谁和谁重叠、各占几条车道」是最容易算错又最难在界面上看清的一段，
  这里只接收任务数组和日期串，不碰 store、不碰 DOM。
*/
import type { Task } from './types';
import { hmStr, parseHM, parseYmd } from './date';
import { subPlan, subStats } from './task';

/** 每小时对应的像素高；模板里也用这个值算栅格高度 */
export const HOUR_H = 36;
export const DAY_MIN = 1440;

export interface CalBlock {
  t: Task;
  st: number;
  dur: number;
  top: number;
  hgt: number;
  lane: number;
  laneCount: number;
  endT: string;
  leftPct: number;
  wPct: number;
  subTxt: string;
  subPct: number;
  hasSubs: boolean;
  segTitle: string;
  segDays: number;
}

/** 这一天落在哪个子项分段里（跨天日程用） */
export function segOn(t: Task | null, ds: string) {
  const d = parseYmd(ds);
  if (!t || !t.date || !d) return null;
  const off = Math.round((d.getTime() - parseYmd(t.date)!.getTime()) / 86400000);
  if (off < 0) return null;
  let hit = null;
  for (const g of subPlan(t)) {
    if (g.days > 0 && off >= g.dayFrom && off < g.dayFrom + g.days) hit = g;
  }
  return hit;
}

/** 当天所有带时间的日程 → 绝对定位块（含重叠分道） */
export function blocksOf(list: Task[], ds: string, hourH = HOUR_H): CalBlock[] {
  const items = list
    .filter((t) => !!t.time)
    .map((t) => {
      const st = parseHM(t.time) || 0;
      let dur = Number(t.estimate) > 0 ? Number(t.estimate) : 30;
      if (dur > DAY_MIN) dur = DAY_MIN;
      let top = (st / 60) * hourH;
      let hgt = (dur / 60) * hourH;
      if (hgt < 22) hgt = 22;
      // 栅格总高 = 24 小时；超出就整体上移，别让块掉到可视区之外（原来拿分钟数比像素，永远不触发）
      const dayPx = (DAY_MIN / 60) * hourH;
      if (top + hgt > dayPx) top = Math.max(0, dayPx - hgt);
      return { t, st, dur, top, hgt, lane: 0, laneCount: 1 };
    })
    .sort((a, b) => a.top - b.top);

  const clusters: typeof items[] = [];
  let cur: typeof items = [];
  let curEnd = -1;
  items.forEach((it) => {
    if (cur.length && it.top >= curEnd - 1) {
      clusters.push(cur);
      cur = [];
      curEnd = -1;
    }
    cur.push(it);
    if (it.top + it.hgt > curEnd) curEnd = it.top + it.hgt;
  });
  if (cur.length) clusters.push(cur);
  clusters.forEach((group) => {
    const lanes: number[] = [];
    group.forEach((it) => {
      let lane = 0;
      // 只和「还没结束」的块共用车道
      while (lanes[lane] !== undefined && lanes[lane] > it.top + 1) lane++;
      lanes[lane] = it.top + it.hgt;
      it.lane = lane;
    });
    const cnt = Math.max(1, lanes.length);
    group.forEach((it) => (it.laneCount = cnt));
  });

  return items.map((it) => {
    const st2 = subStats(it.t);
    const seg = it.hgt >= 44 ? segOn(it.t, ds) : null;
    return {
      ...it,
      endT: hmStr(it.st + it.dur),
      leftPct: (it.lane * 100) / it.laneCount,
      wPct: 100 / it.laneCount,
      subTxt: st2.n ? ' · ' + st2.done + '/' + st2.n : '',
      subPct: st2.pct,
      hasSubs: st2.n > 0,
      segTitle: seg ? seg.title : '',
      segDays: seg ? seg.days : 0
    };
  });
}
