/* 视图与交互状态：替代旧全局单例 S 的「界面」部分 */
import type { CalMode, Filters, KanbanGroup, SortMode, VMode, ViewKey } from '$lib/domain/types';

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
  detailId: '',
  subOnly: {} as Record<string, boolean>,
  habitMode: 'cards' as 'cards' | 'cal',
  habitCursor: null as Date | null,
  /** 窄屏侧栏抽屉 */
  drawer: false,
  listLimit: PAGE,
  loaded: false,
  online: true,
  busy: 0,
  /** 拖拽期间冻结时钟，避免 15s tick 把节点挪走导致抖动 */
  dragging: false,
  /** 调试用：refreshAll() 只让这里 +1，真正的失效靠响应式 */
  rev: 0
});

export function refreshAll(): void {
  app.rev++;
}

export function resetListLimit(): void {
  app.listLimit = PAGE;
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
