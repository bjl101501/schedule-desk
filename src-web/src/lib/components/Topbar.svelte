<script lang="ts">
  import type { VMode } from '$lib/domain/types';
  import { addDays, shortDate, weekdayName, ymd } from '$lib/domain/date';
  import { activeFilterCount } from '$lib/domain/selectors';
  import { app, setSortMode } from '$lib/store/app.svelte';
  import { setVMode } from '$lib/store/nav.svelte';
  import { clock, todayD } from '$lib/store/clock.svelte';
  import { data } from '$lib/store/data.svelte';
  import { openDrawer } from '$lib/store/nav.svelte';
  import { uiState } from '$lib/store/ui.svelte';
    import { toast } from '$lib/store/toast.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Clock from './Clock.svelte';
  import Bell from './Bell.svelte';
  import SyncPill from './SyncPill.svelte';

  const tick = $derived(clock.now);
  const today = $derived(todayD());

  const head = $derived.by(() => {
    void tick;
    const t = today;
    if (app.selectedList) {
      const n = data.tasks.filter((x) => (x.list || '收集箱') === app.selectedList).length;
      return { title: app.selectedList, sub: '清单 · 共 ' + n + ' 项' };
    }
    if (app.selectedTag) {
      const n = data.tasks.filter((x) => x.tags.indexOf(app.selectedTag!) > -1).length;
      return { title: '# ' + app.selectedTag, sub: '标签 · 共 ' + n + ' 项' };
    }
    switch (app.view) {
      case 'today':
        return { title: '今天', sub: t.getFullYear() + ' 年 ' + (t.getMonth() + 1) + ' 月 ' + t.getDate() + ' 日 · ' + weekdayName(t) };
      case 'next7':
        return { title: '最近 7 天', sub: shortDate(t, t) + ' — ' + shortDate(addDays(t, 6), t) };
      case 'inbox':
        return { title: '收集箱', sub: '还没安排时间的事项' };
      case 'calendar':
        return { title: '日历', sub: '年 / 月 / 周 / 多周 / 日 / 多日 六种视图' };
      case 'quadrant':
        return { title: '四象限', sub: '按重要 × 紧急划分优先级' };
      case 'habit':
        return {
          title: '习惯打卡',
          sub: '共 ' + data.habits.length + ' 个习惯 · 今日待打卡 ' +
            data.habits.filter((h) => h.log.indexOf(ymd(t)) === -1).length + ' 个'
        };
      case 'countdown':
        return { title: '倒数纪念日', sub: '记住每一个重要的日子' };
      case 'focus':
        return { title: '番茄专注', sub: '25 分钟为一个专注周期' };
      case 'stats':
        return { title: '数据统计', sub: '事项 · 专注 · 习惯 全景回顾' };
      default:
        return { title: '今天', sub: '' };
    }
  });

  const showSwitch = $derived(
    app.view === 'today' || app.view === 'next7' || app.view === 'inbox' || !!app.selectedList || !!app.selectedTag
  );
  const filterCount = $derived.by(() => {
    void tick;
    return activeFilterCount(app.filters);
  });

  const vmodes: { k: VMode; tip: string; icon: string }[] = [
    { k: 'list', tip: '列表视图：一行一条，信息最全。', icon: 'list' },
    { k: 'card', tip: '卡片视图：两列排布，适合快速扫一眼。', icon: 'card' },
    { k: 'kanban', tip: '看板视图：按状态、优先级或清单分列，可拖动换列。', icon: 'kanban' },
    { k: 'timeline', tip: '时间线视图：按天排开，看跨度最直观。', icon: 'timeline' }
  ];

  function toggleSort(): void {
    setSortMode(app.sortMode === 'manual' ? 'time' : 'manual');
    toast.show(app.sortMode === 'manual' ? '已切换为手动排序，拖动事项调整顺序' : '已切换为按时间排序');
  }

  function cycleTheme(e: MouseEvent): void {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    uiState.miniMenu = { kind: 'theme', name: '', x: r.right, y: r.bottom };
  }
</script>

<header class="topbar">
  <button aria-label="菜单" class="icon-btn" id="btnMenu" style="display:none" onclick={openDrawer}>
    <Icon name="menu" />
  </button>

  <div class="title-wrap">
    <h1 id="viewTitle">{head.title}</h1>
    <div class="sub" id="viewSub">{head.sub}</div>
    <Clock />
  </div>

  <div class="view-switch" id="viewSwitch" style="display:{showSwitch ? '' : 'none'}">
    {#each vmodes as v (v.k)}
      <button class={app.vmode === v.k ? 'on' : ''} data-vmode={v.k} data-tip={v.tip} onclick={() => setVMode(v.k)}>
        <Icon name={v.icon} />
      </button>
    {/each}
  </div>

  <button
    class="tb-btn{app.sortMode === 'manual' ? ' on' : ''}"
    id="btnSort"
    style="display:{showSwitch ? '' : 'none'}"
    data-tip={app.sortMode === 'manual' ? '当前：手动排序，可拖动事项调整顺序。' : '当前：按时间排序，点一下切换。'}
    onclick={toggleSort}
  >
    <svg viewBox="0 0 24 24"><path d="M3 6h12M3 12h9M3 18h6" /><path d="M18 7v12M15 16l3 3 3-3" /></svg>
    <span class="txt">{app.sortMode === 'manual' ? '手动排序' : '按时间'}</span>
  </button>

  <button
    class="tb-btn{filterCount ? ' on' : ''}"
    id="btnFilter"
    style="display:{showSwitch ? '' : 'none'}"
    data-tip={filterCount ? '已启用 ' + filterCount + ' 个筛选条件，点开修改。' : '按优先级、标签、状态和日期筛选。'}
    onclick={() => (uiState.filter = true)}
  >
    <Icon name="filter" />
    <span class="txt">{filterCount ? '筛选 ' + filterCount : '筛选'}</span>
  </button>

  <button aria-label="换肤" class="icon-btn" id="btnTheme" data-tip="切换配色，立即生效并记住。" onclick={cycleTheme}>
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <circle cx="9" cy="9" fill="currentColor" r="1.2" stroke="none" />
      <circle cx="15" cy="9" fill="currentColor" r="1.2" stroke="none" />
      <circle cx="9.5" cy="15" fill="currentColor" r="1.2" stroke="none" />
      <circle cx="15" cy="15" fill="currentColor" r="1.2" stroke="none" />
    </svg>
  </button>

  <button aria-label="搜索" class="icon-btn" id="btnSearch" onclick={() => (uiState.search = true)}>
    <Icon name="search" />
  </button>

  <Bell />
  <SyncPill />
</header>
