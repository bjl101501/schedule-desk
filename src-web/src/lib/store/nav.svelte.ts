/* 视图切换与抽屉：与旧 09-app.js 的 goView / openDrawer / closeDrawer 对应 */
import type { ViewKey } from '$lib/domain/types';
import { PAGE, app, scrollContentTop } from './app.svelte';

export function goView(v: ViewKey): void {
  app.view = v;
  app.selectedList = null;
  app.selectedTag = null;
  app.listLimit = PAGE;
  app.drawer = false;
  if (v === 'calendar' && !app.cursor) app.cursor = new Date();
  scrollContentTop();
}

export function selectList(name: string | null): void {
  app.selectedList = name;
  app.selectedTag = null;
  app.listLimit = PAGE;
  app.drawer = false;
  scrollContentTop();
}

export function selectTag(name: string | null): void {
  app.selectedTag = name;
  app.selectedList = null;
  app.listLimit = PAGE;
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
