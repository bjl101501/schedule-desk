<script lang="ts">
  import type { Task } from '$lib/domain/types';
  import { dateLabel, parseYmd } from '$lib/domain/date';
  import { PAGE, app } from '$lib/store/app.svelte';
  import { loadMore } from '$lib/store/nav.svelte';
  import { todayD } from '$lib/store/clock.svelte';
  import TaskRow from '$lib/components/TaskRow.svelte';
  import { pointerDrag, hitAt } from '$lib/actions/drag';
  import { beginDrag, type DragFx } from '$lib/actions/dragFx';
  import { applyVisibleOrder } from '$lib/store/dndActions.svelte';
  import { setSortMode } from '$lib/store/app.svelte';
  import { toast } from '$lib/store/toast.svelte';
  import { beginDragSession, endDragSession } from '$lib/store/dragSession.svelte';

  let { rows }: { rows: Task[] } = $props();
  const today = $derived(todayD());
  // 一次只会有一个拖拽在跑，fx 放组件级即可
  let fx: DragFx | null = null;

  const idsOf = (list: Element | null): string[] =>
    Array.from(list?.querySelectorAll('[data-tid]') || [])
      .map((n) => n.getAttribute('data-tid') || '')
      .filter(Boolean);

  function onDragEnd(el: HTMLElement, e: PointerEvent, moved: boolean): void {
    endDragSession();
    el.classList.remove('dragging');
    fx?.end();
    fx = null;
    if (!moved) return;
    const list = el.closest('.task-list');
    const hit = hitAt(e, '[data-tid]');
    const dragId = el.getAttribute('data-tid') || '';
    const targetId = hit?.getAttribute('data-tid') || '';
    // 只在同一日期分组内重排：跨组拖动会让人以为改了日期
    if (!list || !hit || hit === el || hit.closest('.task-list') !== list || !dragId || !targetId) return;
    const ids = idsOf(list);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = ids.slice();
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    const all = rows.map((t) => t.id);
    let k = 0;
    applyVisibleOrder(all.map((id) => (ids.indexOf(id) > -1 ? next[k++] : id)));
    setSortMode('manual');
    toast.show('已调整顺序');
  }

  const view = $derived.by(() => {
    void today;
    const groups: Record<string, Task[]> = {};
    const order: string[] = [];
    rows.forEach((t) => {
      const k = t.done ? '已完成' : t.date ? dateLabel(parseYmd(t.date), today) : '未安排';
      if (!groups[k]) {
        groups[k] = [];
        order.push(k);
      }
      groups[k].push(t);
    });

    const limit = app.listLimit || PAGE;
    let shown = 0;
    const out: { key: string; total: number; items: Task[] }[] = [];
    order.forEach((k) => {
      const list = groups[k];
      const room = Math.max(0, limit - shown);
      if (!room) return;
      const part = list.slice(0, room);
      shown += part.length;
      out.push({ key: k, total: list.length, items: part });
    });
    return { groups: out, shown, more: Math.max(0, rows.length - shown) };
  });
</script>

{#each view.groups as g, gi (g.key + '#' + gi)}
  <div class="sec-head"><h3>{g.key}</h3><span class="meta">{g.total} 项</span><span class="line"></span></div>
  <div
    class="task-list"
    use:pointerDrag={{
      handle: '[data-tid]',
      onStart: (el) => {
        beginDragSession();
        el.classList.add('dragging');
        fx = beginDrag({ source: el, scrollEl: () => document.getElementById('content') });
      },
      onMove: (el, e) => {
        if (!fx) return;
        const hit = hitAt(e, '[data-tid]');
        const same = hit && hit !== el && hit.closest('.task-list') === el.closest('.task-list');
        fx.move(e);
        fx.mark(same ? hit : null, 'insert-l', same ? '松手放到「' + (hit.querySelector('.task-title')?.textContent || '') + '」之前' : '');
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
