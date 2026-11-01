<script lang="ts">
  import type { Task } from '$lib/domain/types';
  import { dateLabel, parseYmd } from '$lib/domain/date';
  import { PAGE, app } from '$lib/store/app.svelte';
  import { loadMore } from '$lib/store/nav.svelte';
  import { todayD } from '$lib/store/clock.svelte';
  import TaskRow from '$lib/components/TaskRow.svelte';
  import { pointerDrag } from '$lib/actions/drag';
  import { pickDrop, snapGroups, type DropGroup } from '$lib/actions/dragSlot';
  import { beginDrag, type DragFx } from '$lib/actions/dragFx';
  import { applyVisibleOrder } from '$lib/store/dndActions.svelte';
  import { applyDateChange } from '$lib/store/taskActions.svelte';
  import { setSortMode } from '$lib/store/app.svelte';
  import { toast } from '$lib/store/toast.svelte';
  import { beginDragSession, endDragSession } from '$lib/store/dragSession.svelte';

  let { rows }: { rows: Task[] } = $props();
  const today = $derived(todayD());
  // 一次只会有一个拖拽在跑，fx 放组件级即可
  let fx: DragFx | null = null;
  // 按下那一刻的布局快照：让位会让 DOM 实时位移，实时命中会抖
  let snaps: DropGroup[] = [];

  const idsOf = (list: Element | null): string[] =>
    Array.from(list?.querySelectorAll('[data-tid]') || [])
      .map((n) => n.getAttribute('data-tid') || '')
      .filter(Boolean);

  /** 分组上挂的日期：已完成为 'done'、未安排为空串，都不能当落点日期 */
  const groupDate = (list: Element | null): string => list?.getAttribute('data-gdate') || '';

  function onDragEnd(el: HTMLElement, _e: PointerEvent, moved: boolean): void {
    endDragSession();
    el.classList.remove('dragging');
    // 落点以占位现在的实际位置为准：视觉停在哪就落在哪，不用再命中一次
    const at = fx?.where() ?? null;
    fx?.end();
    fx = null;
    snaps = [];
    if (!moved || !at?.host) return;

    const dragId = el.getAttribute('data-tid') || '';
    const task = rows.find((t) => t.id === dragId);
    const home = el.closest('.task-list');
    if (!task || !home) return;

    const ds = groupDate(at.host);
    if (!ds || ds === 'done') {
      toast.show('这条只能拖到有日期的分组');
      return;
    }

    // 落到别的日期分组 = 改日期（和日历里拖到另一天同一套动作，提醒基准会跟着挪）
    if (at.host !== home) {
      if (ds === task.date) return;
      applyDateChange(task, { date: ds }, { toast: '已改到「' + dateLabel(parseYmd(ds), today) + '」' });
      return;
    }

    // 同组内：按占位前后是哪两行重排
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

  const view = $derived.by(() => {
    void today;
    // ds 是这一组的日期（ymd）；'done' 与空串表示不能当拖拽落点
    const groups: Record<string, { ds: string; items: Task[] }> = {};
    const order: string[] = [];
    rows.forEach((t) => {
      const k = t.done ? '已完成' : t.date ? dateLabel(parseYmd(t.date), today) : '未安排';
      if (!groups[k]) {
        groups[k] = { ds: t.done ? 'done' : t.date || '', items: [] };
        order.push(k);
      }
      groups[k].items.push(t);
    });

    const limit = app.listLimit || PAGE;
    let shown = 0;
    const out: { key: string; ds: string; total: number; items: Task[] }[] = [];
    order.forEach((k) => {
      const g = groups[k];
      const room = Math.max(0, limit - shown);
      if (!room) return;
      const part = g.items.slice(0, room);
      shown += part.length;
      out.push({ key: k, ds: g.ds, total: g.items.length, items: part });
    });
    return { groups: out, shown, more: Math.max(0, rows.length - shown) };
  });
</script>

{#each view.groups as g, gi (g.key + '#' + gi)}
  <div class="sec-head"><h3>{g.key}</h3><span class="meta">{g.total} 项</span><span class="line"></span></div>
  <div
    class="task-list"
    data-gdate={g.ds}
    use:pointerDrag={{
      handle: '[data-tid]',
      onStart: (el, _e, origin) => {
        beginDragSession();
        // 快照必须在隐藏源行之前拍，否则首行的位置已经塌了
        snaps = snapGroups(Array.from(document.querySelectorAll<HTMLElement>('.task-list')), '[data-tid]');
        el.classList.add('dragging');
        fx = beginDrag({ source: el, at: origin, scrollEl: () => document.getElementById('content') });
      },
      onMove: (el, e) => {
        if (!fx) return;
        fx.move(e);
        const home = el.closest('.task-list');
        const at = pickDrop(e.clientX, e.clientY, snaps, 'y');
        if (!at) {
          fx.slot(null, null);
          fx.mark(null, 'box', '');
          return;
        }
        const ds = groupDate(at.host);
        // 已完成 / 未安排不能当落点
        if (!ds || ds === 'done') {
          fx.slot(null, null);
          fx.mark(at.host, 'box', '这条只能拖到有日期的分组');
          return;
        }
        fx.slot(at.host, at.el, at.after ? 'after' : 'before');
        if (at.host === home) {
          const name = at.el?.querySelector('.task-title')?.textContent || '';
          fx.mark(null, 'box', name ? '松手放到「' + name + '」' + (at.after ? '之后' : '之前') : '松手调到最后');
        } else {
          const label = at.host.previousElementSibling?.querySelector('h3')?.textContent || '另一天';
          fx.mark(null, 'box', '松手改到「' + label + '」');
        }
      },
      onEnd: onDragEnd
    }}
  >
    {#each g.items as t, ti (t.id || 'new-' + ti)}
      <TaskRow {t} />
    {/each}
  </div>
{/each}

{#if view.more > 0}
  <button class="load-more" data-loadmore onclick={() => loadMore(view.more)}>
    再显示 {Math.min(PAGE, view.more)} 条
    <span class="lm-sub">还有 {view.more} 条没显示 / 共 {rows.length} 条</span>
  </button>
{/if}
