<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { app, hydratePrefs } from '$lib/store/app.svelte';
  import { escapeLayer, overlay } from '$lib/store/overlay.svelte';
  import { openQuickAdd, uiState } from '$lib/store/ui.svelte';
  import { loadAll, redo, undo } from '$lib/store/data.svelte';
  import { toastState } from '$lib/store/toast.svelte';
  import { bindTips } from '$lib/store/tip.svelte';
  import { goView, closeDrawer } from '$lib/store/nav.svelte';
  import { hydrateMeta, meta } from '$lib/store/meta.svelte';
  import { data } from '$lib/store/data.svelte';
  import { dbIsFirstRun } from '$lib/bridge/db';
  import { SPEC } from '$lib/ui/overlay/spec';
  import OverlayHost from '$lib/ui/overlay/OverlayHost.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import Topbar from '$lib/components/Topbar.svelte';
  import Tabbar from '$lib/components/Tabbar.svelte';
  import TasksView from '$lib/views/TasksView.svelte';
  import CalendarView from '$lib/views/CalendarView.svelte';
  import QuadrantView from '$lib/views/QuadrantView.svelte';
  import HabitView from '$lib/views/HabitView.svelte';
  import CountdownView from '$lib/views/CountdownView.svelte';
  import FocusView from '$lib/views/FocusView.svelte';
  import StatsView from '$lib/views/StatsView.svelte';
  import Onboarding from '$lib/views/editors/Onboarding.svelte';
  import MiniMenu from '$lib/ui/MiniMenu.svelte';
  import ColorPick from '$lib/ui/ColorPick.svelte';
  import { ensureColors } from '$lib/store/palette.svelte';
  import TipLayer from '$lib/ui/TipLayer.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  let mainEl: HTMLElement;
  let width = $state(1200);
  // 面板模式必须按窗口宽度判断：用 .main 的宽度会形成反馈环
  // （开面板 → main 变窄 → 判定不再需要面板 → 关面板 → main 变宽 …）
  let vw = $state(typeof window === 'undefined' ? 1200 : window.innerWidth);
  // 系统开了「减少动态效果」时动画会被压到一帧。此时挤压没有过渡、只剩一次瞬变，
  // 比覆盖更刺眼 —— 所以这种情况下不做挤压，直接盖在内容上。
  let reduceMotion = $state(false);
  // 读不到数据时别一直转圈：9 秒后给一个「重新加载」
  let slow = $state(false);

  const condensed = $derived(width < 860);
  const tight = $derived(width < 700);
  // 三种状态分开：wide 决定面板长什么样，panelShown 决定有没有面板，push 决定要不要给内容让位。
  // 宽度不够让位时（约 1290px 以下）面板直接盖在内容上，硬挤会把日历压到不能用。
  const wide = $derived(vw >= 1000);
  const panelShown = $derived(
    [...overlay.stack, ...overlay.closing].some((o) => SPEC[o.kind].panel)
  );
  const panelOpen = $derived(wide && panelShown);
  const panelNow = $derived(Math.min(meta.panelW, vw * 0.4));
  const push = $derived(panelOpen && !reduceMotion && vw - 248 - 40 - panelNow >= 560);
  const isTaskView = $derived(
    app.view === 'today' || app.view === 'next7' || app.view === 'inbox' || !!app.selectedList || !!app.selectedTag
  );
  const firstRun = $derived(dbIsFirstRun());

  // 清单 / 标签一有增减就补一次颜色。ensureColors 幂等（没缺色就不写），
  // 用 untrack 隔开，避免「写颜色 → 触发 effect → 再写」的自激。
  $effect(() => {
    if (!meta.ready) return;
    void data.tasks.length;
    void meta.customLists.length;
    void meta.customTags.length;
    void meta.listOrder.length;
    void meta.tagOrder.length;
    untrack(() => ensureColors());
  });

  onMount(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion = (): void => {
      reduceMotion = mq.matches;
    };
    onMotion();
    mq.addEventListener('change', onMotion);
    const ro = new ResizeObserver((es) => {
      for (const e of es) width = Math.round(e.contentRect.width);
    });
    ro.observe(mainEl);
    const onResize = () => (vw = window.innerWidth);
    window.addEventListener('resize', onResize);
    bindTips();
    hydratePrefs();
    hydrateMeta();
    const slowTimer = setTimeout(() => {
      if (!app.loaded) slow = true;
    }, 9000);

    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = String(el?.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || !!el?.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === 'Escape') {
        // 浮层 → 栈顶 → 抽屉，一次只剥一层
        if (escapeLayer() || app.drawer) {
          if (app.drawer) closeDrawer();
          e.preventDefault();
        }
        return;
      }
      // 下面三条必须在 typing 判断之前：输入框里也要生效
      if (mod && (e.key === 'k' || e.key === 'K' || e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        openQuickAdd();
        return;
      }
      if (mod && (e.key === 's' || e.key === 'S')) {
        if (uiState.editorId) {
          e.preventDefault();
          (document.getElementById('edSave') as HTMLButtonElement | null)?.click();
        }
        return;
      }
      if (typing) return;
      // 撤销 / 重做：编辑器打开时不接，否则回放会把表单里的对象换掉
      if (mod && (e.key === 'z' || e.key === 'Z')) {
        if (uiState.editorId) return;
        e.preventDefault();
        if (e.shiftKey) void redo();
        else void undo();
        return;
      }
      if (mod && (e.key === 'y' || e.key === 'Y')) {
        if (uiState.editorId) return;
        e.preventDefault();
        void redo();
        return;
      }
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        uiState.shortcuts = !uiState.shortcuts;
        return;
      }
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        openQuickAdd();
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        uiState.search = true;
        return;
      }
      if (e.key >= '1' && e.key <= '7') {
        const map = ['today', 'calendar', 'quadrant', 'habit', 'countdown', 'focus', 'stats'] as const;
        e.preventDefault();
        goView(map[Number(e.key) - 1]);
        return;
      }
      if (e.key === 't' || e.key === 'T') {
        goView('today');
        return;
      }
      if (e.key === 'q' || e.key === 'Q') {
        goView('quadrant');
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        goView('habit');
        return;
      }
      if (e.key === 'c' || e.key === 'C') {
        goView('calendar');
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      clearTimeout(slowTimer);
      ro.disconnect();
      mq.removeEventListener('change', onMotion);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('keydown', onKey);
    };
  });
</script>

<div class="drawer-mask{app.drawer ? ' in' : ''}" id="drawerMask" onclick={closeDrawer}></div>

<div class="app{panelOpen ? ' panel-open' : ''}{push ? ' panel-push' : ''}">
  <Sidebar />

  <main class="main{condensed ? ' condensed' : ''}{tight ? ' tight' : ''}" bind:this={mainEl}>
    <Topbar />

    <div class="content" id="content">
      {#if !app.loaded}
        <div class="empty">
          <div class="empty-ico"><Icon name="clock" /></div>
          <h4>{slow ? '暂时读不到数据' : '正在加载你的日程…'}</h4>
          <p>{slow ? '数据目录可能被占用或文件损坏。可以重试，或检查设置里的数据目录。' : '本地数据文件读取中，通常一秒内完成'}</p>
          {#if slow}
            <button
              data-reload
              onclick={() => {
                slow = false;
                void loadAll();
              }}
            >重新加载</button>
          {/if}
        </div>
      {:else if isTaskView}
        <TasksView />
      {:else if app.view === 'calendar'}
        <CalendarView />
      {:else if app.view === 'quadrant'}
        <QuadrantView />
      {:else if app.view === 'habit'}
        <HabitView />
      {:else if app.view === 'countdown'}
        <CountdownView />
      {:else if app.view === 'focus'}
        <FocusView />
      {:else if app.view === 'stats'}
        <StatsView />
      {/if}
    </div>
  </main>

  <Tabbar />
</div>

<OverlayHost panel={panelOpen} />

{#if firstRun && app.loaded}
  <Onboarding />
{/if}

<MiniMenu />
<ColorPick />
<TipLayer />

<div class="toast{toastState.on ? ' in' : ''}" id="toast">{toastState.text}</div>
