<script lang="ts">
  import type { Task } from '$lib/domain/types';
  import { dayDiff, parseYmd, shortDate } from '$lib/domain/date';
  import { subStats } from '$lib/domain/task';
  import { sortTasks } from '$lib/domain/selectors';
  import { app } from '$lib/store/app.svelte';
  import { clock, todayD } from '$lib/store/clock.svelte';
  import { data } from '$lib/store/data.svelte';
  import { toggleTaskDetail } from '$lib/store/ui.svelte';
  import { isSuppressed } from '$lib/actions/suppress';
  import { beginDrag, type DragFx } from '$lib/actions/dragFx';
  import Icon from '$lib/ui/Icon.svelte';
  import TagChips from '$lib/components/TagChips.svelte';
  import Flags from '$lib/components/Flags.svelte';
  import { pointerDrag, hitAt } from '$lib/actions/drag';
  import { dropQuadrant } from '$lib/store/dndActions.svelte';
  import { beginDragSession, endDragSession } from '$lib/store/dragSession.svelte';

  const tick = $derived(clock.now);
  const today = $derived(todayD());

  const groups = $derived.by(() => {
    void tick;
    const live = data.tasks.filter((t) => !t.done);
    const q1: Task[] = [];
    const q2: Task[] = [];
    const q3: Task[] = [];
    const q4: Task[] = [];
    live.forEach((t) => {
      if (t.important && t.urgent) q2.push(t);
      else if (t.important) q1.push(t);
      else if (t.urgent) q3.push(t);
      else q4.push(t);
    });
    const total = live.length || 1;
    const defs = [
      { cls: 'q1', num: 'Ⅰ', name: '重要 · 不紧急', sub: '计划做，决定长期', items: q1 },
      { cls: 'q2', num: 'Ⅱ', name: '重要 · 紧急', sub: '立即做，别拖', items: q2 },
      { cls: 'q4', num: 'Ⅳ', name: '不重要 · 不紧急', sub: '不做，别沉迷', items: q4 },
      { cls: 'q3', num: 'Ⅲ', name: '不重要 · 紧急', sub: '少做或转交', items: q3 }
    ];
    return {
      live,
      total,
      defs: defs.map((d) => ({ ...d, items: sortTasks(d.items, app.sortMode), pct: Math.round((d.items.length / total) * 100) })),
      importantCount: q1.length + q2.length,
      urgentCount: q2.length + q3.length
    };
  });

  function open(t: Task): void {
    if (isSuppressed()) return;
    toggleTaskDetail(t.id);
  }

  // 一次只有一个拖拽在跑
  let fx: DragFx | null = null;
</script>

<div class="banner" style="background:var(--brand-softer);border:1px solid var(--line);color:var(--text-2)">
  <Icon name="bulb" />
  <span>横轴向右＝更紧急，纵轴向上＝更重要；右上角最该现在处理。共 {groups.live.length} 项待办，其中「重要」{groups.importantCount} 项、「紧急」{groups.urgentCount} 项。</span>
</div>

<div
  class="quad-grid"
  use:pointerDrag={{
    handle: '[data-tid]',
    onStart: (el, _e, origin) => {
      beginDragSession();
      el.classList.add('dragging');
      fx = beginDrag({ source: el, at: origin, scrollEl: () => document.getElementById('content') });
    },
    onMove: (_el, e) => {
      if (!fx) return;
      const box = hitAt(e, '.qbox');
      fx.move(e);
      fx.mark(box as HTMLElement | null, 'box', box ? '松手放到这一格' : '');
    },
    onEnd: (el, e, moved) => {
      endDragSession();
      el.classList.remove('dragging');
      fx?.end();
      fx = null;
      if (!moved) return;
      const box = hitAt(e, '.qbox');
      const id = el.getAttribute('data-tid') || '';
      const cls = box ? ['q1', 'q2', 'q3', 'q4'].find((c) => box.classList.contains(c)) : '';
      if (id && cls) dropQuadrant(id, cls);
    }
  }}
>
  {#each groups.defs as d (d.cls)}
    <div class="qbox {d.cls}">
      <div class="qhead">
        <div class="qnum">{d.num}</div>
        <div><h4>{d.name}</h4><div class="qsub">{d.sub}</div></div>
        <div class="qcnt"><b>{d.items.length}</b> 项 · {d.pct}%</div>
      </div>
      <div class="qbody" data-qdrop={d.cls}>
        {#if d.items.length}
          {#each d.items as t (t.id)}
            {@const diff = t.date ? dayDiff(today, parseYmd(t.date)) : null}
            {@const st = subStats(t)}
            <div class="kcard" data-tid={t.id} onclick={() => open(t)}>
              <div class="kcard-title"><Flags {t} />{t.title}</div>
              {#if st.n}
                <div class="sub-inline">
                  <span class="sub-bar{st.all ? ' full' : ''}"><i style="width:{st.pct}%"></i></span>
                  <span class="sub-txt">{st.done}/{st.n}</span>
                </div>
              {/if}
              <div class="kcard-foot">
                <TagChips tags={t.tags.slice(0, 2)} />
                {#if t.date}
                  <span class="kcard-date {diff !== null && diff < 0 ? 'over' : diff === 0 ? 'today' : ''}">{shortDate(parseYmd(t.date), today)}</span>
                {/if}
              </div>
            </div>
          {/each}
        {:else}
          <div class="qempty">暂无事项</div>
        {/if}
      </div>
    </div>
  {/each}
</div>
