<script lang="ts">
  import type { Task } from '$lib/domain/types';
  import { dayDiff, doneText, durText, parseYmd, shortDate } from '$lib/domain/date';
  import { subStats, timeRangeText } from '$lib/domain/task';
  import { taskState } from '$lib/domain/window';
  import { PAGE, app } from '$lib/store/app.svelte';
  import { loadMore } from '$lib/store/nav.svelte';
  import { clock, todayD } from '$lib/store/clock.svelte';
  import { toggleDone } from '$lib/store/data.svelte';
  import { toggleTaskDetail } from '$lib/store/ui.svelte';
  import { isDetailOpen } from '$lib/store/overlay.svelte';
  import { pointerDrag } from '$lib/actions/drag';
  import { pickDrop, snapGroups, type DropGroup } from '$lib/actions/dragSlot';
  import { beginDrag, type DragFx } from '$lib/actions/dragFx';
  import { applyVisibleOrder } from '$lib/store/dndActions.svelte';
  import { setSortMode } from '$lib/store/app.svelte';
  import { toast } from '$lib/store/toast.svelte';
  import { isSuppressed } from '$lib/actions/suppress';
  import Icon from '$lib/ui/Icon.svelte';
  import TagChips from '$lib/components/TagChips.svelte';
  import Flags from '$lib/components/Flags.svelte';
  import SubRows from '$lib/components/SubRows.svelte';
  import StateChip from '$lib/components/StateChip.svelte';
  import { beginDragSession, endDragSession } from '$lib/store/dragSession.svelte';

  let { rows }: { rows: Task[] } = $props();
  const today = $derived(todayD());
  let fx: DragFx | null = null;
  let snaps: DropGroup[] = [];
  const tick = $derived(clock.now);
  const part = $derived(rows.slice(0, app.listLimit || PAGE));

  function cls(t: Task): string {
    return 'tcard ' + (t.prio ? String(t.prio).toLowerCase() : '') + (t.done ? ' done' : '') + (isDetailOpen(t.id) ? ' active' : '');
  }

  function dateCls(t: Task): string {
    if (!t.date) return '';
    const diff = dayDiff(today, parseYmd(t.date));
    const st = taskState(t, tick);
    return st.key === 'overdue' ? 'over' : diff === 0 ? 'today' : '';
  }

  const cardIds = (): string[] =>
    Array.from(document.querySelectorAll('.card-grid [data-tid]'))
      .map((n) => n.getAttribute('data-tid') || '')
      .filter(Boolean);

  function onDragEnd(el: HTMLElement, _e: PointerEvent, moved: boolean): void {
    endDragSession();
    el.classList.remove('dragging');
    // 落点以占位实际停的位置为准
    const at = fx?.where() ?? null;
    fx?.end();
    fx = null;
    snaps = [];
    if (!moved || !at?.host) return;
    const dragId = el.getAttribute('data-tid') || '';
    if (!dragId) return;
    const ids = cardIds();
    const rest = ids.filter((id) => id !== dragId);
    const prevId = at.prev?.getAttribute('data-tid') || '';
    const nextId = at.next?.getAttribute('data-tid') || '';
    let to = rest.length;
    if (nextId && rest.indexOf(nextId) >= 0) to = rest.indexOf(nextId);
    else if (prevId && rest.indexOf(prevId) >= 0) to = rest.indexOf(prevId) + 1;
    const next = rest.slice();
    next.splice(to, 0, dragId);
    const all = rows.map((t) => t.id);
    let k = 0;
    applyVisibleOrder(all.map((id) => (ids.indexOf(id) > -1 ? next[k++] : id)));
    setSortMode('manual');
    toast.show('已调整顺序');
  }

  function open(t: Task): void {
    if (isSuppressed()) return;
    toggleTaskDetail(t.id);
  }
</script>

<div
  class="card-grid"
  use:pointerDrag={{
    handle: '[data-tid]',
    onStart: (el, _e, origin) => {
      beginDragSession();
      // 先拍快照，再隐藏源卡
      snaps = snapGroups(Array.from(document.querySelectorAll<HTMLElement>('.card-grid')), '[data-tid]');
      el.classList.add('dragging');
      fx = beginDrag({ source: el, at: origin, scrollEl: () => document.getElementById('content') });
    },
    onMove: (_el, e) => {
      if (!fx) return;
      fx.move(e);
      const at = pickDrop(e.clientX, e.clientY, snaps, 'x');
      if (!at) {
        fx.slot(null, null);
        fx.mark(null, 'box', '');
        return;
      }
      fx.slot(at.host, at.el, at.after ? 'after' : 'before');
      fx.mark(null, 'box', at.el ? (at.after ? '松手放到这张卡后面' : '松手放到这张卡前面') : '松手调到最后');
    },
    onEnd: onDragEnd
  }}
>
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
        <TagChips tags={t.tags} />
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
