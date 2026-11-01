<script lang="ts">
  import type { Task } from '$lib/domain/types';
  import { dayDiff, doneText, durText, parseYmd, shortDate, tagColor as tagColorOf } from '$lib/domain/date';
  import { TAG_COLORS } from '$lib/domain/constants';
  import { subStats, timeRangeText } from '$lib/domain/task';
  import { taskState } from '$lib/domain/window';
  import { PAGE, app } from '$lib/store/app.svelte';
  import { loadMore } from '$lib/store/nav.svelte';
  import { clock, todayD } from '$lib/store/clock.svelte';
  import { toggleDone } from '$lib/store/data.svelte';
  import { openTaskDetail } from '$lib/store/ui.svelte';
  import { isSuppressed } from '$lib/actions/suppress';
  import Icon from '$lib/ui/Icon.svelte';
  import Flags from '$lib/components/Flags.svelte';
  import SubRows from '$lib/components/SubRows.svelte';
  import StateChip from '$lib/components/StateChip.svelte';

  let { rows }: { rows: Task[] } = $props();
  const today = $derived(todayD());
  const tick = $derived(clock.now);
  const part = $derived(rows.slice(0, app.listLimit || PAGE));

  function cls(t: Task): string {
    return 'tcard ' + (t.prio ? String(t.prio).toLowerCase() : '') + (t.done ? ' done' : '') + (app.detailId === t.id ? ' active' : '');
  }

  function dateCls(t: Task): string {
    if (!t.date) return '';
    const diff = dayDiff(today, parseYmd(t.date));
    const st = taskState(t, tick);
    return st.key === 'overdue' ? 'over' : diff === 0 ? 'today' : '';
  }

  function open(t: Task): void {
    if (isSuppressed()) return;
    openTaskDetail(t.id);
  }
</script>

<div class="card-grid">
  {#each part as t (t.id)}
    {@const st = subStats(t)}
    <div class={cls(t)} data-tid={t.id} onclick={() => open(t)}>
      <div class="tcard-top">
        <div class="chk" data-done={t.id} onclick={(e) => { e.stopPropagation(); toggleDone(t.id); }}><Icon name="check" /></div>
        <Flags {t} />
        <div class="tcard-title">{t.title}</div>
        {#if st.n}<span class="sub-count{st.all ? ' full' : ''}">{st.done}/{st.n}</span>{/if}
      </div>
      <SubRows {t} />
      {#if t.note}<div class="tcard-note">{t.note}</div>{/if}
      <div class="tcard-foot">
        <StateChip {t} />
        {#each t.tags as g (g)}
          <span class="tag-chip {tagColorOf(g, TAG_COLORS)}">#{g}</span>
        {/each}
        {#if t.estimate}<span class="est-badge">{durText(t.estimate)}</span>{/if}
        {#if t.time}<span class="tcard-time"><Icon name="clock" />{timeRangeText(t)}</span>{/if}
        {#if t.date}
          <span class="tcard-date {dateCls(t)}"><Icon name="calendar" />{shortDate(parseYmd(t.date), today)}</span>
        {/if}
        {#if t.done && t.doneAt}
          <span class="tcard-date"><Icon name="check" />完成于 {doneText(t.doneAt)}</span>
        {/if}
      </div>
    </div>
  {/each}
</div>

{#if rows.length > part.length}
  <button class="load-more" data-loadmore onclick={() => loadMore(rows.length - part.length)}>
    再显示 {Math.min(PAGE, rows.length - part.length)} 张
    <span class="lm-sub">还有 {rows.length - part.length} 张没显示 / 共 {rows.length} 张</span>
  </button>
{/if}
