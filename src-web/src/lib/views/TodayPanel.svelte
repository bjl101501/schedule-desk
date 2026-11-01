<script lang="ts">
  import type { Task } from '$lib/domain/types';
  import { addDays, coarseSpan, dayDiff, ymd } from '$lib/domain/date';
  import { subPlan, subStats } from '$lib/domain/task';
  import { inScope, sortTasks } from '$lib/domain/selectors';
  import { reminderState, taskState, taskWindow } from '$lib/domain/window';
  import { app } from '$lib/store/app.svelte';
  import { clock, todayD } from '$lib/store/clock.svelte';
  import { data, toggleDone, toggleSubAt } from '$lib/store/data.svelte';
  import { openTaskDetail } from '$lib/store/ui.svelte';
  import { isSuppressed } from '$lib/actions/suppress';
  import Icon from '$lib/ui/Icon.svelte';

  const LIVE: Record<string, string> = { ongoing: '进行中', upcoming: '即将开始', remindSoon: '即将逾期' };

  const view = $derived.by(() => {
    const tick = clock.now;
    const t0 = todayD();
    const t0s = ymd(t0);
    const ctx = { view: app.view, selectedList: app.selectedList, selectedTag: app.selectedTag };

    // 只收「今天该动手」的：逾期 + 正在进行/即将开始 + 今天到期 + 今天到点的复习
    let overdue: Task[] = [];
    let live: { t: Task; label: string }[] = [];
    let todayItems: Task[] = [];
    const remind: { t: Task; at: number }[] = [];

    data.tasks.filter((t) => inScope(t, ctx, t0)).forEach((t) => {
      if (t.done) return;
      const st = taskState(t, tick);
      if (st.key === 'overdue') overdue.push(t);
      else if (LIVE[st.key]) live.push({ t, label: LIVE[st.key] });
      else if (t.date === t0s) todayItems.push(t);
      const r = reminderState(t, tick);
      if (r && r.overdue) remind.push({ t, at: r.at });
    });

    overdue = sortTasks(overdue, app.sortMode);
    todayItems = sortTasks(todayItems, app.sortMode);
    live.sort((a, b) => {
      const wa = taskWindow(a.t);
      const wb = taskWindow(b.t);
      return (wa ? wa.start.getTime() : 0) - (wb ? wb.start.getTime() : 0);
    });

    // 同一条日程可能既逾期又有待复习，计数要去重
    const seen: Record<string, number> = {};
    overdue.concat(live.map((x) => x.t)).concat(todayItems).forEach((x) => (seen[x.id] = 1));
    remind.forEach((it) => (seen[it.t.id] = 1));
    const total = Object.keys(seen).length;

    const rows: { t: Task; kind: string; label: string }[] = [];
    const rowIds: Record<string, number> = {};
    const pushRow = (t: Task, kind: string, label: string) => {
      if (!t || rowIds[t.id]) return;
      rowIds[t.id] = 1;
      rows.push({ t, kind, label });
    };
    overdue.forEach((t) => pushRow(t, 'over', '逾期'));
    live.forEach((it) => pushRow(it.t, 'live', it.label));
    todayItems.forEach((t) => pushRow(t, 'today', '今天'));
    remind.forEach((it) => pushRow(it.t, 'remind', '提醒'));

    // 行尾：逾期 / 剩余 / 全天 三态
    const tailOf = (t: Task, kind: string) => {
      if (kind === 'over') {
        const w = taskWindow(t);
        const ms = w ? tick - w.end.getTime() : 0;
        return { text: '超时 ' + coarseSpan(ms), cls: 'over' };
      }
      if (kind === 'live') {
        const w2 = taskWindow(t);
        if (!w2) return { text: '', cls: '' };
        if (w2.allDay) return { text: '全天', cls: 'allday' };
        const left = Math.max(0, w2.end.getTime() - tick);
        return { text: '剩余 ' + coarseSpan(left), cls: 'left' };
      }
      if (kind === 'today') {
        if (!t.time) return { text: '全天', cls: 'allday' };
        return { text: t.time, cls: 'time' };
      }
      return { text: '', cls: '' };
    };

    // 计划任务：今天该做的子项 + 早就该做还没勾的子项
    const daySubs = (t: Task) => {
      const out = { over: [] as ReturnType<typeof subPlan>, today: [] as ReturnType<typeof subPlan> };
      if (!t.plan || !t.subs || !t.subs.length) return out;
      const plan = subPlan(t);
      plan.forEach((g) => {
        if (g.done || !g.start || !g.end) return;
        if (dayDiff(t0, g.end) < 0) out.over.push(g);
        else if (dayDiff(g.start, t0) >= 0 && dayDiff(t0, g.end) >= 0) out.today.push(g);
      });
      const anyScheduled = plan.some((g) => !!g.start);
      if (!out.over.length && !out.today.length && !anyScheduled) {
        out.today = plan.filter((g) => !g.done).slice(0, 2);
      }
      return out;
    };

    const segsOf = (t: Task) => {
      const d = daySubs(t);
      return d.over.concat(d.today).slice(0, 4);
    };

    return { tick, t0, total, overdue, rows, remind, tailOf, segsOf };
  });

  function rowClick(id: string): void {
    if (isSuppressed()) return;
    openTaskDetail(id);
  }

  function subLabel(g: ReturnType<typeof subPlan>[number]): { text: string; over: boolean } {
    const late = g.end ? -dayDiff(view.t0, g.end) : 0;
    const over = late > 0;
    const text = over ? '逾期 ' + late + ' 天' : g.start ? (g.days > 1 ? g.days + ' 天' : '今天') : '未排期';
    return { text, over };
  }
</script>

<section class="today-panel">
  <div class="today-head">
    <h2><span class="pin"></span>今天要处理</h2>
    <span class="stat">
      {view.total ? view.total + ' 项待处理 · 逾期 ' + view.overdue.length + ' 项' : '今天没有要处理的'}
    </span>
  </div>
  <div class="today-body">
    {#if !view.rows.length}
      <div class="today-empty"><Icon name="check" />今天没有待办，享受这份清闲吧</div>
    {:else}
      {#each view.rows as r (r.t.id)}
        {@const tail = view.tailOf(r.t, r.kind)}
        {@const st = subStats(r.t)}
        {@const segs = view.segsOf(r.t)}
        <div class="today-row" data-tid={r.t.id} onclick={() => rowClick(r.t.id)}>
          <span class="tag-mini {r.kind}">{r.label}</span>
          <div class="today-main">
            <div class="today-l1">
              <span class="tt">{r.t.title}</span>
              {#if st.n}<span class="today-subchip">{st.done}/{st.n}</span>{/if}
              {#if tail.text}<span class="tdue {tail.cls}">{tail.text}</span>{/if}
            </div>
            {#if segs.length}
              <div class="today-subs">
                {#each segs as g (g.i)}
                  {@const lab = subLabel(g)}
                  <button
                    class="today-sub{lab.over ? ' over' : ''}"
                    data-subdone="{r.t.id}|{g.i}"
                    onclick={(e) => { e.stopPropagation(); toggleSubAt(r.t, g.i); }}
                  >
                    <i class="sub-dot"></i><span>{g.title}</span><em>{lab.text}</em>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
          <button
            class="go"
            data-done={r.t.id}
            title="完成"
            onclick={(e) => { e.stopPropagation(); toggleDone(r.t.id); }}
          ><Icon name="check" /></button>
        </div>
      {/each}
    {/if}
  </div>
</section>
