<script lang="ts">
  import type { Task } from '$lib/domain/types';
  import { dateLabel, dayDiff, doneText, durText, parseYmd, shortDate } from '$lib/domain/date';
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
  import { applyDateChange } from '$lib/store/taskActions.svelte';
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

  /** 按日期分组：和列表视图同一套口径（已完成 / 某一天 / 未安排），组内再排 */
  const view = $derived.by(() => {
    void today;
    const groups: Record<string, { ds: string; items: Task[] }> = {};
    const order: string[] = [];
    part.forEach((t) => {
      const k = t.done ? '已完成' : t.date ? dateLabel(parseYmd(t.date), today) : '未安排';
      if (!groups[k]) {
        groups[k] = { ds: t.done ? 'done' : t.date || '', items: [] };
        order.push(k);
      }
      groups[k].items.push(t);
    });
    return order.map((k) => ({ key: k, ds: groups[k].ds, items: groups[k].items }));
  });

  /** 组内 id 顺序（含被拖的那张，隐藏但仍在 DOM 里） */
  const idsOf = (host: Element | null): string[] =>
    Array.from(host?.querySelectorAll('[data-tid]') || [])
      .map((n) => n.getAttribute('data-tid') || '')
      .filter(Boolean);

  const groupDate = (host: Element | null): string => host?.getAttribute('data-gdate') || '';

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

    const home = el.closest('.card-grid');
    const ds = groupDate(at.host);
    // 已完成 / 未安排不能当落点
    if (!ds || ds === 'done') {
      toast.show('这条只能拖到有日期的分组');
      return;
    }

    // 落到别的日期分组 = 改日期（和列表 / 日历同一套动作）
    if (at.host !== home) {
      const task = rows.find((t) => t.id === dragId);
      if (!task || ds === task.date) return;
      applyDateChange(task, { date: ds }, { toast: '已改到「' + dateLabel(parseYmd(ds), today) + '」' });
      return;
    }

    // 组内：按占位前后是哪两张重排
    const ids = idsOf(at.host);
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

{#each view as g (g.key)}
  <div class="sec-head"><h3>{g.key}</h3><span class="meta">{g.items.length} 张</span><span class="line"></span></div>
  <div
    class="card-grid"
    data-gdate={g.ds}
    use:pointerDrag={{
      handle: '[data-tid]',
      onStart: (el, _e, origin) => {
        beginDragSession();
        // 先拍快照，再隐藏源卡
        snaps = snapGroups(Array.from(document.querySelectorAll<HTMLElement>('.card-grid')), '[data-tid]');
        el.classList.add('dragging');
        fx = beginDrag({ source: el, at: origin, scrollEl: () => document.getElementById('content') });
      },
      onMove: (el, e) => {
        if (!fx) return;
        fx.move(e);
        const at = pickDrop(e.clientX, e.clientY, snaps, 'x');
        if (!at) {
          fx.slot(null, null);
          fx.mark(null, 'box', '');
          return;
        }
        const ds = groupDate(at.host);
        if (!ds || ds === 'done') {
          fx.slot(null, null);
          fx.mark(at.host, 'box', '这条只能拖到有日期的分组');
          return;
        }
        fx.slot(at.host, at.el, at.after ? 'after' : 'before');
        if (at.host === el.closest('.card-grid')) {
          fx.mark(null, 'box', at.el ? (at.after ? '松手放到这张卡后面' : '松手放到这张卡前面') : '松手调到最后');
        } else {
          const label = at.host.previousElementSibling?.querySelector('h3')?.textContent || '另一天';
          fx.mark(null, 'box', '松手改到「' + label + '」');
        }
      },
      onEnd: onDragEnd
    }}
  >
    {#each g.items as t (t.id)}
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
{/each}

{#if rows.length > part.length}
  <button class="load-more" data-loadmore onclick={() => loadMore(rows.length - part.length)}>
    再显示 {Math.min(PAGE, rows.length - part.length)} 张
    <span class="lm-sub">还有 {rows.length - part.length} 张没显示 / 共 {rows.length} 张</span>
  </button>
{/if}
