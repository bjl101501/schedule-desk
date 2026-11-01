<script lang="ts">
  import { visibleTasks } from '$lib/domain/selectors';
  import { app } from '$lib/store/app.svelte';
  import { clock, todayD } from '$lib/store/clock.svelte';
  import { data } from '$lib/store/data.svelte';
  import { isArchived, unarchiveList } from '$lib/store/meta.svelte';
  import { openQuickAdd } from '$lib/store/ui.svelte';
  import { toast } from '$lib/store/toast.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import TodayPanel from './TodayPanel.svelte';
  import FilterBar from './FilterBar.svelte';
  import ListMode from './modes/ListMode.svelte';
  import CardMode from './modes/CardMode.svelte';
  import KanbanMode from './modes/KanbanMode.svelte';
  import TimelineMode from './modes/TimelineMode.svelte';

  const ctx = $derived({ view: app.view, selectedList: app.selectedList, selectedTag: app.selectedTag });
  const today = $derived(todayD());
  // clock.now 进依赖：跨零点时「今天」这一组要重排
  const tick = $derived(clock.now);
  const rows = $derived.by(() => {
    void tick;
    return visibleTasks(data.tasks, ctx, app.filters, app.sortMode, today);
  });
  const archived = $derived(!!app.selectedList && isArchived(app.selectedList));

  function unarchive(): void {
    if (!app.selectedList) return;
    unarchiveList(app.selectedList);
    toast.show('已取消归档「' + app.selectedList + '」');
  }
</script>

{#if archived}
  <div class="banner" style="background:var(--panel-2);border-color:var(--line);color:var(--text-2);margin-bottom:10px">
    <Icon name="box" />
    <span>「{app.selectedList}」已归档。仍可查看和编辑，只是不出现在侧栏清单里。</span>
    <button class="bact" data-unarchive={app.selectedList} onclick={unarchive}>取消归档</button>
  </div>
{/if}

<TodayPanel />
<FilterBar />

{#if app.vmode === 'timeline'}
  <TimelineMode {rows} />
{:else if app.vmode === 'kanban'}
  <KanbanMode {rows} />
{:else if !rows.length}
  <EmptyState icon="inbox" title="这里很干净" text="没有符合条件的日程。换个筛选条件，或者添加一条新日程。">
    {#snippet action()}
      <button data-empty="add" onclick={() => openQuickAdd()}>+ 添加日程</button>
    {/snippet}
  </EmptyState>
{:else if app.vmode === 'card'}
  <CardMode {rows} />
{:else}
  <ListMode {rows} />
{/if}
