/* 视图与交互状态：替代旧全局单例 S 的「界面」部分 */
import type { CalMode, Filters, KanbanGroup, SortMode, VMode, ViewKey } from '$lib/domain/types';
import { STORAGE_KEYS, readRaw, writeRaw } from './storage';

export const PAGE = 60;

export const app = $state({
  view: 'today' as ViewKey,
  vmode: 'list' as VMode,
  kanbanGroup: 'priority' as KanbanGroup,
  calMode: 'month' as CalMode,
  calDays: 3,
  calWeeks: 3,
  calReturn: null as null | { mode: CalMode; cursor: Date },
  cursor: new Date(),
  selectedList: null as string | null,
  selectedTag: null as string | null,
  filters: { prio: [], tags: [], status: 'todo', from: '', to: '', kw: '' } as Filters,
  sortMode: 'time' as SortMode,
  subOnly: {} as Record<string, boolean>,
  habitMode: 'cards' as 'cards' | 'cal',
  habitCursor: null as Date | null,
  /** 窄屏侧栏抽屉 */
  drawer: false,
  listLimit: PAGE,
  loaded: false,
  loadedAt: 0
});

/** 排序方式存本机：旧版 boot 读 / 顶栏写 wb_schedule_sort，重写时漏了 */


export function hydratePrefs(): void {
  try {
    const v = readRaw(STORAGE_KEYS.sort);
    if (v === 'time' || v === 'manual') app.sortMode = v;
  } catch {
    /* ignore */
  }
}

export function setSortMode(v: SortMode): void {
  app.sortMode = v;
  writeRaw(STORAGE_KEYS.sort, v);
}

/** 兼容旧调用：真正的刷新靠响应式，这里只是为了让脚本有个「重算一次」的入口 */
export function refreshAll(): void {
  app.loadedAt = Date.now();
}

/** 滚动回第一屏：styles.css 有 scroll-behavior:smooth，直接赋 0 会「滑」上去 */
export function scrollContentTop(): void {
  const el = document.getElementById('content');
  if (!el) return;
  const prev = el.style.scrollBehavior;
  el.style.scrollBehavior = 'auto';
  el.scrollTop = 0;
  el.style.scrollBehavior = prev;
}

export function setFilters(patch: Partial<Filters>): void {
  Object.assign(app.filters, patch);
  app.listLimit = PAGE;
}
