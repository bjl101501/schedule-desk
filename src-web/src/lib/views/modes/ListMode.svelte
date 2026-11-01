<script lang="ts">
  import type { Task } from '$lib/domain/types';
  import { dateLabel, parseYmd } from '$lib/domain/date';
  import { PAGE, app } from '$lib/store/app.svelte';
  import { loadMore } from '$lib/store/nav.svelte';
  import { todayD } from '$lib/store/clock.svelte';
  import TaskRow from '$lib/components/TaskRow.svelte';
  import { pointerDrag, hitAt } from '$lib/actions/drag';
  import { moveTaskBefore } from '$lib/store/dndActions.svelte';
  import { toast } from '$lib/store/toast.svelte';

  let { rows }: { rows: Task[] } = $props();
  const today = $derived(todayD());

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
  <div class="task-list">
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
