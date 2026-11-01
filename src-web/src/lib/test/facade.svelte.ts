/*
  测试门面：旧 ui-check.mjs 依赖一批全局函数，Svelte 里不该把它们再挂回 window。
  这里只暴露「读状态 + 触发动作」的最小面，脚本改调用路径即可，DOM 选择器一律不动。
*/
import { flushSync } from 'svelte';
import { taskState, taskWindow, reminderState } from '$lib/domain/window';
import { subStats } from '$lib/domain/task';
import { today0, ymd } from '$lib/domain/date';
import { alertSummary, sortTasks, visibleTasks } from '$lib/domain/selectors';
import { app, refreshAll } from '$lib/store/app.svelte';
import { sync as syncState } from '$lib/store/sync.svelte';
import { clock, clockRunning, todayD } from '$lib/store/clock.svelte';
import { data } from '$lib/store/data.svelte';
import { openQuickAdd, openTaskDetail, openTaskEditor, uiState } from '$lib/store/ui.svelte';
import { pop } from '$lib/store/overlay.svelte';
import { isDragging } from '$lib/store/dragSession.svelte';
import { clearTables, dataJob, importBundle } from '$lib/store/data.svelte';
import { completeFromReminder, markRemindRead } from '$lib/store/remind.svelte';
import { parseBundleText } from '$lib/domain/backup';
import { setTheme } from '$lib/store/theme.svelte';
import { goView } from '$lib/store/nav.svelte';
import { showTip, hideTip } from '$lib/store/tip.svelte';

export function installTestFacade(): void {
  // 旧版是同步 innerHTML 渲染，脚本习惯了「调用完就能查到 DOM」。
  // Svelte 默认在微任务里提交，这里替测试补一次同步刷新。
  const sync =
    <A extends unknown[]>(fn: (...a: A) => void) =>
    (...a: A): void => {
      flushSync(() => fn(...a));
    };

  /** 只关最上层：与 Esc 的语义一致，脚本按「调用一次关一层」使用 */
  function closeModal(): void {
    if (!pop()) {
      // 栈空时兜底：浮层菜单也一起收掉
      uiState.miniMenu = null;
    }
  }

  const api = {
    taskState,
    taskWindow,
    reminderState,
    subStats,
    sortTasks,
    today0,
    get tasks() {
      return $state.snapshot(data.tasks);
    },
    get states() {
      return data.tasks.map((t) => ({ id: t.id, title: t.title, ...taskState(t, clock.now) }));
    },
    get counts() {
      return {
        tasks: data.tasks.length,
        habits: data.habits.length,
        countdowns: data.countdowns.length,
        pomodoros: data.pomodoros.length,
        online: syncState.online,
        loaded: app.loaded,
        view: app.view
      };
    },
    goView: sync(goView),
    openTaskEditor: sync((id = '') => openTaskEditor(id as string)),
    openTaskDetail: sync(openTaskDetail),
    openQuickAdd: sync(openQuickAdd),
    closeModal: () => flushSync(() => closeModal()),
    setTheme: sync(setTheme),
    refreshAll,
    showTip,
    hideTip,
    setCal(patch: Record<string, unknown>) {
      flushSync(() => Object.assign(app, patch));
    },
    fieldValue(sel: string) {
      return document.querySelector(sel)?.getAttribute('data-value') ?? '';
    },
    schedulerRunning: () => clockRunning(),
    isDragging: () => isDragging(),
    nowTick: () => clock.now,
    visibleTasks: () =>
      visibleTasks(
        data.tasks,
        { view: app.view, selectedList: app.selectedList, selectedTag: app.selectedTag },
        app.filters,
        app.sortMode,
        todayD()
      ),
    todayStr: () => ymd(todayD()),
    /* 收口轮新增：危险操作与提醒闭环的验收入口（只给 build/remedy-check.mjs 用） */
    uiState,
    dataJob,
    clearAll: () => clearTables(['tasks', 'habits', 'countdowns', 'pomodoros'], '正在清空全部数据'),
    importText: (text: string, mode: 'append' | 'replace' = 'append') =>
      importBundle(parseBundleText(text), mode),
    markRead: (id: string, idx: number) => markRemindRead(id, idx),
    completeRemind: (id: string) => completeFromReminder(id),
    alertCount: () => alertSummary(data.tasks, clock.now).total
  };
  window.__SD_TEST__ = api as unknown as Record<string, unknown>;
}
