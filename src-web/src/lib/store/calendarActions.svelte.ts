/*
  日历导航：游标、模式、跨度的唯一写入口。

  之前 CalendarView 里有 16 处 `app.cursor = …` / `app.calMode = …`，
  「年 → 月 → 日 → 返回」的回退栈也散在三个函数里；
  收进动作层后，视图只负责渲染，切模式不会漏掉 calReturn。
*/
import { addDays, parseYmd, today0 } from '$lib/domain/date';
import type { CalMode } from '$lib/domain/types';
import { app } from './app.svelte';

/** app.cursor 允许是 Date 或可解析字符串，统一取成 Date */
export function cursorOf(): Date {
  const c = app.cursor;
  return c instanceof Date ? c : new Date(c);
}

export function calNav(step: number): void {
  const c = cursorOf();
  switch (app.calMode) {
    case 'year':
      app.cursor = new Date(c.getFullYear() + step, c.getMonth(), 1);
      break;
    case 'month':
      app.cursor = new Date(c.getFullYear(), c.getMonth() + step, 1);
      break;
    case 'week':
      app.cursor = addDays(c, 7 * step);
      break;
    case 'multiweek':
      app.cursor = addDays(c, 7 * app.calWeeks * step);
      break;
    case 'day':
      app.cursor = addDays(c, step);
      break;
    default:
      app.cursor = addDays(c, app.calDays * step);
  }
}

export function calToday(): void {
  app.cursor = today0();
}

export function setCalMode(k: CalMode): void {
  app.calMode = k;
  if (k !== 'day') app.calReturn = null;
}

export function setCalWeeks(n: number): void {
  app.calWeeks = n;
}

export function setCalDays(n: number): void {
  app.calDays = n;
}

/** 年视图点月份卡片：进月视图，并记住从哪来 */
export function openMonthView(from: Date, month: number): void {
  app.calReturn = { mode: 'year', cursor: new Date(from) };
  app.cursor = new Date(from.getFullYear(), month, 1);
  app.calMode = 'month';
}

/** 任何格子点空白：进那天的日视图 */
export function openDayView(ds: string): void {
  const d = parseYmd(ds);
  if (!d) return;
  app.calReturn = { mode: app.calMode, cursor: cursorOf() };
  app.cursor = d;
  app.calMode = 'day';
}

/** 日视图左上角返回：回到进来时的模式与游标 */
export function calBack(): void {
  const back = app.calReturn;
  if (!back) {
    setCalMode('month');
    return;
  }
  app.calMode = back.mode;
  app.cursor = back.cursor;
  app.calReturn = null;
}
