<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '$lib/store/app.svelte';
  import { closeTopLayer, openQuickAdd, uiState } from '$lib/store/ui.svelte';
  import { hydratePrefs } from '$lib/store/app.svelte';
  import { loadAll } from '$lib/store/data.svelte';
  import { toastState } from '$lib/store/toast.svelte';
  import { bindTips } from '$lib/store/tip.svelte';
  import { goView } from '$lib/store/nav.svelte';
  import { dbIsFirstRun } from '$lib/bridge/db';
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
  import TaskEditor from '$lib/views/editors/TaskEditor.svelte';
  import TaskDetail from '$lib/views/editors/TaskDetail.svelte';
  import QuickAdd from '$lib/views/editors/QuickAdd.svelte';
  import SearchModal from '$lib/views/editors/SearchModal.svelte';
  import FilterPanel from '$lib/views/editors/FilterPanel.svelte';
  import ReminderCenter from '$lib/views/editors/ReminderCenter.svelte';
  import SettingsModal from '$lib/views/editors/SettingsModal.svelte';
  import BackupModal from '$lib/views/editors/BackupModal.svelte';
  import HelpModal from '$lib/views/editors/HelpModal.svelte';
  import ShortcutsModal from '$lib/views/editors/ShortcutsModal.svelte';
  import HabitEditor from '$lib/views/editors/HabitEditor.svelte';
  import CountdownEditor from '$lib/views/editors/CountdownEditor.svelte';
  import Onboarding from '$lib/views/editors/Onboarding.svelte';
  import Confirm from '$lib/ui/Confirm.svelte';
  import Prompt from '$lib/ui/Prompt.svelte';
  import TypedConfirm from '$lib/ui/TypedConfirm.svelte';
  import MiniMenu from '$lib/ui/MiniMenu.svelte';
  import TipLayer from '$lib/ui/TipLayer.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { panelResize } from '$lib/actions/panelResize';
  import { modalShell } from '$lib/actions/modalShell';

  let mainEl: HTMLElement;
  let width = $state(1200);
  // 面板模式必须按窗口宽度判断：用 .main 的宽度会形成反馈环
  // （开面板 → main 变窄 → 判定不再需要面板 → 关面板 → main 变宽 …）
  let vw = $state(typeof window === 'undefined' ? 1200 : window.innerWidth);
  // 读不到数据时别一直转圈：9 秒后给一个「重新加载」
  let slow = $state(false);

  const condensed = $derived(width < 860);
  const tight = $derived(width < 700);
  const panelOpen = $derived(!!(uiState.detailId || uiState.editorId) && vw >= 1000);
  const isTaskView = $derived(
    app.view === 'today' || app.view === 'next7' || app.view === 'inbox' || !!app.selectedList || !!app.selectedTag
  );
  const firstRun = $derived(dbIsFirstRun());

  onMount(() => {
    const ro = new ResizeObserver((es) => {
      for (const e of es) width = Math.round(e.contentRect.width);
    });
    ro.observe(mainEl);
    const onResize = () => (vw = window.innerWidth);
    window.addEventListener('resize', onResize);
    bindTips();
    hydratePrefs();
    const slowTimer = setTimeout(() => {
      if (!app.loaded) slow = true;
    }, 9000);

    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = String(el?.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || !!el?.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === 'Escape') {
        if (closeTopLayer()) e.preventDefault();
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
      window.removeEventListener('resize', onResize);
      document.removeEventListener('keydown', onKey);
    };
  });

  // 桌面层：把「打开使用说明」留给注入的脚本
  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__SD_SHOW_HELP__ = () => (uiState.help = true);
  }
</script>

<div class="drawer-mask{app.drawer ? ' in' : ''}" id="drawerMask" onclick={() => (app.drawer = false)}></div>

<div class="app{panelOpen ? ' panel-open' : ''}">
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
            <button data-reload onclick={() => { slow = false; void loadAll(); }}>重新加载</button>
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

<div class="modal-root" id="modalRoot" use:modalShell>
  {#if uiState.detailId && !uiState.editorId}
    <div class="modal-mask in{panelOpen ? ' panel' : ''}" data-task={uiState.detailId}>
      <div class="modal wide">{#if panelOpen}<div class="panel-grip" data-panelgrip use:panelResize></div>{/if}<TaskDetail /></div>
    </div>
  {/if}

  {#if uiState.editorId}
    <div class="modal-mask in{panelOpen ? ' panel' : ''}">
      <div class="modal wide">{#if panelOpen}<div class="panel-grip" data-panelgrip use:panelResize></div>{/if}<TaskEditor /></div>
    </div>
  {/if}

  {#if uiState.quickAdd}
    <div class="modal-mask in">
      <div class="modal"><QuickAdd /></div>
    </div>
  {/if}

  {#if uiState.search}
    <div class="modal-mask in">
      <div class="modal"><SearchModal /></div>
    </div>
  {/if}

  {#if uiState.filter}
    <div class="modal-mask in">
      <div class="modal"><FilterPanel /></div>
    </div>
  {/if}

  {#if uiState.reminder}
    <div class="modal-mask in">
      <div class="modal"><ReminderCenter /></div>
    </div>
  {/if}

  {#if uiState.settings}
    <div class="modal-mask in">
      <div class="modal settings"><SettingsModal /></div>
    </div>
  {/if}

  {#if uiState.backup}
    <div class="modal-mask in">
      <div class="modal"><BackupModal /></div>
    </div>
  {/if}

  {#if uiState.help}
    <div class="modal-mask in">
      <div class="modal"><HelpModal /></div>
    </div>
  {/if}

  {#if uiState.shortcuts}
    <div class="modal-mask in">
      <div class="modal shortcuts"><ShortcutsModal /></div>
    </div>
  {/if}

  {#if uiState.habitEditor}
    <div class="modal-mask in">
      <div class="modal"><HabitEditor /></div>
    </div>
  {/if}

  {#if uiState.cdEditor}
    <div class="modal-mask in">
      <div class="modal"><CountdownEditor /></div>
    </div>
  {/if}

  <Confirm />
  <Prompt />
  <TypedConfirm />

  <Confirm />
  <Prompt />
  <TypedConfirm />
</div>

{#if firstRun && app.loaded}
  <Onboarding />
{/if}

<MiniMenu />
<TipLayer />

<div class="toast{toastState.on ? ' in' : ''}" id="toast">{toastState.text}</div>
