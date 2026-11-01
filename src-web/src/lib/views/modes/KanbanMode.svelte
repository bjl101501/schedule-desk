<script lang="ts">
  import type { Task, KanbanGroup } from '$lib/domain/types';
  import { LIST_COLORS } from '$lib/domain/constants';
  import { dayDiff, parseYmd, shortDate, tagColor as tagColorOf } from '$lib/domain/date';
  import { allLists, allTags } from '$lib/domain/selectors';
  import { subStats } from '$lib/domain/task';
  import { taskState } from '$lib/domain/window';
  import { app } from '$lib/store/app.svelte';
  import { clock, todayD } from '$lib/store/clock.svelte';
  import { data } from '$lib/store/data.svelte';
  import { meta } from '$lib/store/meta.svelte';
  import { toggleTaskDetail, openTaskEditor } from '$lib/store/ui.svelte';
  import { setKanbanGroup } from '$lib/store/nav.svelte';
  import { isDetailOpen } from '$lib/store/overlay.svelte';
  import { isSuppressed } from '$lib/actions/suppress';
  import Icon from '$lib/ui/Icon.svelte';
  import Flags from '$lib/components/Flags.svelte';
  import { pointerDrag, hitAt } from '$lib/actions/drag';
  import { dropKanban } from '$lib/store/dndActions.svelte';
  import { beginDragSession, endDragSession } from '$lib/store/dragSession.svelte';

  let { rows }: { rows: Task[] } = $props();

  const tick = $derived(clock.now);
  const today = $derived(todayD());

  const groups = $derived.by(() => {
    const g = app.kanbanGroup;
    const map: { key: string; title: string; color: string; items: Task[] }[] = [];
    void tick;

    if (g === 'priority') {
      map.push({ key: 'P0', title: 'P0 · 最高', color: 'var(--red)', items: [] });
      map.push({ key: 'P1', title: 'P1 · 高', color: 'var(--orange)', items: [] });
      map.push({ key: 'P2', title: 'P2 · 中', color: 'var(--brand)', items: [] });
      map.push({ key: 'P3', title: 'P3 · 低', color: 'var(--text-3)', items: [] });
      map.push({ key: 'none', title: '未分级', color: 'var(--text-3)', items: [] });
      rows.forEach((t) => {
        const k = String(t.prio || '').toUpperCase() || 'none';
        const col = map.filter((c) => c.key === k)[0];
        if (col) col.items.push(t);
        else map[4].items.push(t);
      });
    } else if (g === 'list') {
      allLists(data.tasks, meta.customLists, meta.listOrder).forEach((nm, i) =>
        map.push({ key: nm, title: nm, color: LIST_COLORS[i % LIST_COLORS.length], items: [] })
      );
      rows.forEach((t) => {
        const nm = t.list || '收集箱';
        const col = map.filter((c) => c.key === nm)[0];
        if (col) col.items.push(t);
      });
    } else if (g === 'tags') {
      let tags = allTags(data.tasks, meta.customTags, meta.tagOrder);
      if (!tags.length) tags = ['无标签'];
      tags.forEach((nm, i) => map.push({ key: nm, title: '#' + nm, color: LIST_COLORS[i % LIST_COLORS.length], items: [] }));
      map.push({ key: '__none', title: '无标签', color: 'var(--text-3)', items: [] });
      rows.forEach((t) => {
        if (!t.tags.length) {
          map[map.length - 1].items.push(t);
          return;
        }
        t.tags.forEach((g2) => {
          const col = map.filter((c) => c.key === g2)[0];
          if (col && col.items.indexOf(t) === -1) col.items.push(t);
        });
      });
    } else if (g === 'status') {
      map.push({ key: 'todo', title: '未开始', color: 'var(--brand)', items: [] });
      map.push({ key: 'doing', title: '今天', color: 'var(--cyan)', items: [] });
      map.push({ key: 'over', title: '已逾期', color: 'var(--red)', items: [] });
      map.push({ key: 'done', title: '已完成', color: 'var(--green)', items: [] });
      rows.forEach((t) => {
        const st = taskState(t, tick);
        if (st.key === 'done') map[3].items.push(t);
        else if (st.key === 'overdue') map[2].items.push(t);
        else if (st.key === 'ongoing' || st.key === 'upcoming' || st.key === 'remindSoon') map[1].items.push(t);
        else map[0].items.push(t);
      });
    } else {
      map.push({ key: 'over', title: '已逾期', color: 'var(--red)', items: [] });
      map.push({ key: 'today', title: '今天', color: 'var(--brand)', items: [] });
      map.push({ key: 'week', title: '本周内', color: 'var(--green)', items: [] });
      map.push({ key: 'later', title: '更晚', color: 'var(--purple)', items: [] });
      map.push({ key: 'none', title: '未安排', color: 'var(--text-3)', items: [] });
      rows.forEach((t) => {
        if (!t.date) {
          map[4].items.push(t);
          return;
        }
        const st = taskState(t, tick);
        if (st.key === 'overdue') {
          map[0].items.push(t);
          return;
        }
        const d = dayDiff(today, parseYmd(t.date));
        if (d === 0) map[1].items.push(t);
        else if (d > 0 && d <= 7) map[2].items.push(t);
        else map[3].items.push(t);
      });
    }
    return map;
  });

  const opts: { k: KanbanGroup; t: string }[] = [
    { k: 'priority', t: '按优先级' },
    { k: 'list', t: '按清单' },
    { k: 'tags', t: '按标签' },
    { k: 'status', t: '按状态' },
    { k: 'date', t: '按日期' }
  ];

  function dateCls(t: Task): string {
    if (!t.date) return '';
    const diff = dayDiff(today, parseYmd(t.date));
    return diff < 0 ? 'over' : diff === 0 ? 'today' : '';
  }

  function open(t: Task): void {
    if (isSuppressed()) return;
    toggleTaskDetail(t.id);
  }

  function addIn(key: string): void {
    openTaskEditor('', { group: { kind: app.kanbanGroup, key } });
  }
</script>

<div class="sec-head"><h3>看板</h3><span class="meta">{groups.length} 列</span><span class="line"></span></div>
<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:12px">
  {#each opts as o (o.k)}
    <button class="chip-p{app.kanbanGroup === o.k ? ' on' : ''}" data-kgroup={o.k} onclick={() => setKanbanGroup(o.k)}>{o.t}</button>
  {/each}
</div>

<div
  class="kanban"
  use:pointerDrag={{
    handle: '[data-tid]',
    onStart: (el) => {
      beginDragSession();
      el.classList.add('dragging');
    },
    onEnd: (el, e, moved) => {
      endDragSession();
      el.classList.remove('dragging');
      if (!moved) return;
      const col = hitAt(e, '[data-kkey]');
      const id = el.getAttribute('data-tid') || '';
      const key = col?.getAttribute('data-kkey') || '';
      if (id && key) dropKanban(id, key, app.kanbanGroup);
    }
  }}
>
  {#each groups as g (g.key)}
    <div class="kcol" data-kkey={g.key}>
      <div class="kcol-head">
        <span class="kdot" style="background:{g.color}"></span>{g.title}
        <span class="kcnt">{g.items.length}</span>
        <button class="kadd" data-kadd={g.key} title="在此分组新建" onclick={() => addIn(g.key)}><Icon name="plus" /></button>
      </div>
      <div class="kcol-body">
        {#if g.items.length}
          {#each g.items as t (t.id)}
            {@const st = subStats(t)}
            <div class="kcard{t.done ? ' done' : ''}{isDetailOpen(t.id) ? ' active' : ''}" data-tid={t.id} onclick={() => open(t)}>
              <div class="kcard-title"><Flags {t} />{t.title}</div>
              {#if st.n}
                <div class="sub-inline">
                  <span class="sub-bar{st.all ? ' full' : ''}"><i style="width:{st.pct}%"></i></span>
                  <span class="sub-txt">{st.done}/{st.n}</span>
                </div>
              {/if}
              <div class="kcard-foot">
                {#each t.tags.slice(0, 2) as gg (gg)}
                  <span class="tag-chip {tagColorOf(gg, ['c0', 'c1', 'c2', 'c3', 'c4'])}">#{gg}</span>
                {/each}
                {#if t.date}<span class="kcard-date {dateCls(t)}">{shortDate(parseYmd(t.date), today)}</span>{/if}
              </div>
            </div>
          {/each}
        {:else}
          <div class="kempty">暂无事项</div>
        {/if}
      </div>
    </div>
  {/each}
</div>
