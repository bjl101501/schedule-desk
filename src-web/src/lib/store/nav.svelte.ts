/* 视图切换与抽屉：与旧 09-app.js 的 goView / openDrawer / closeDrawer 对应 */
import type { KanbanGroup, VMode, ViewKey } from '$lib/domain/types';
import { PAGE, app, resetFilters, scrollContentTop } from './app.svelte';

export function goView(v: ViewKey): void {
  app.view = v;
  app.selectedList = null;
  app.selectedTag = null;
  resetFilters();
  app.drawer = false;
  if (v === 'calendar' && !app.cursor) app.cursor = new Date();
  scrollContentTop();
}

export function selectList(name: string | null): void {
  app.selectedList = name;
  app.selectedTag = null;
  resetFilters();
  app.drawer = false;
  scrollContentTop();
}

export function selectTag(name: string | null): void {
  app.selectedTag = name;
  app.selectedList = null;
  resetFilters();
  app.drawer = false;
  scrollContentTop();
}

export function openDrawer(): void {
  app.drawer = true;
}

export function closeDrawer(): void {
  app.drawer = false;
}

export function loadMore(rowsLeft: number): void {
  app.listLimit += Math.min(PAGE, Math.max(rowsLeft, 1));
}

/** 布局模式：切换后回到第一屏（否则列表可能停在空白页） */
export function setVMode(k: VMode): void {
  app.vmode = k;
  app.listLimit = PAGE;
}

export function setKanbanGroup(k: KanbanGroup): void {
  app.kanbanGroup = k;
}

export function setHabitMode(k: 'cards' | 'cal'): void {
  app.habitMode = k;
}

/** 习惯日历按月翻页 */
export function habitNav(step: number): void {
  const cur = app.habitCursor instanceof Date ? app.habitCursor : new Date();
  app.habitCursor = new Date(cur.getFullYear(), cur.getMonth() + step, 1);
}

export function habitToday(): void {
  app.habitCursor = new Date();
}
