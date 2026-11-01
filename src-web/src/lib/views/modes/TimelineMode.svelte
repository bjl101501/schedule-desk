<script lang="ts">
  import type { Task } from '$lib/domain/types';
  import { addDays, dayDiff, hmStr, mdShort, parseHM, parseYmd, ymd } from '$lib/domain/date';
  import { prioCls, segDateText, subPlan, subStats, taskSpan } from '$lib/domain/task';
  import { todayD } from '$lib/store/clock.svelte';
  import { toggleTaskDetail } from '$lib/store/ui.svelte';
  import { isDetailOpen } from '$lib/store/overlay.svelte';
  import { isSuppressed } from '$lib/actions/suppress';
  import Icon from '$lib/ui/Icon.svelte';
  import TaskRow from '$lib/components/TaskRow.svelte';
  import { pointerDrag } from '$lib/actions/drag';
  import { beginDrag, type DragFx } from '$lib/actions/dragFx';
  import { dropTimeline } from '$lib/store/dndActions.svelte';
  import { toast } from '$lib/store/toast.svelte';
  import { taskById } from '$lib/store/taskActions.svelte';
  import { beginDragSession, endDragSession } from '$lib/store/dragSession.svelte';

  let { rows }: { rows: Task[] } = $props();

  const today = $derived(todayD());

  // 拖拽：按住条体改开始日，按住右手柄改天数（按实际列宽换算）
  /** 抓点相对色带左边界的像素：算「拖到第几天」时要用位移，不能用绝对天数 */
  let grabPx = 0;
  let resizing = false;
  let dragStart = new Date();
  let fx: DragFx | null = null;
  /** 拖动中的落点预览：off = 起点偏移，span = 天数 */
  let drop = $state<{ off: number; span: number } | null>(null);

  /** 日期轴至少铺三周，否则清单里只有一条今天的任务时，整条轴只有一格，没地方可拖 */
  const WIN_DAYS = 21;

  const view = $derived.by(() => {
    const t0s = ymd(today);
    // 时间线跟着当前清单/视图走：今天视图只有今天的任务，范围自然就窄
    const live = rows.filter((t) => !t.done);
    const dated = live.filter((t) => !!t.date);
    const undated = live.filter((t) => !t.date);

    let minD: Date | null = null;
    let maxD: Date | null = null;
    // 用 for 而不是 forEach：闭包里赋值会让 TS 在循环外把变量窄化成 null
    for (const t of dated) {
      const d = parseYmd(t.date);
      if (!d) continue;
      const e = addDays(d, taskSpan(t) - 1);
      if (!minD || d < minD) minD = d;
      if (!maxD || e > maxD) maxD = e;
    }
    if (!minD || !maxD) {
      return {
        empty: true, undated, t0s,
        start: new Date(), maxD: new Date(), days: 0,
        head: [] as { ds: string; today: boolean; we: boolean; month: string; day: number; wd: string }[],
        items: [] as { t: Task; off: number; span: number; end: number; lane: number }[],
        lanes: [] as { t: Task; off: number; span: number; end: number; lane: number }[][]
      };
    }

    // 起点：最早的任务日与「今天前 3 天」取早者 —— 留一点历史上下文
    const start = minD < addDays(today, -3) ? minD : addDays(today, -3);
    const floor = addDays(start, WIN_DAYS - 1);
    const end = maxD > floor ? maxD : floor;
    const days = dayDiff(start, end) + 1;
    const head = Array.from({ length: days }, (_, i) => {
      const d = addDays(start, i);
      const ds = ymd(d);
      const wd = d.getDay();
      return {
        ds,
        today: ds === t0s,
        we: wd === 0 || wd === 6,
        month: i === 0 || d.getDate() === 1 ? d.getMonth() + 1 + ' 月' : '',
        day: d.getDate(),
        wd: ['日', '一', '二', '三', '四', '五', '六'][wd]
      };
    });

    const items = dated
      .map((t) => {
        const off = dayDiff(start, parseYmd(t.date));
        const span = taskSpan(t);
        return { t, off, span, end: off + span, lane: 0 };
      })
      .sort((a, b) => a.off - b.off || b.span - a.span);

    // 不重叠的任务共用一行（泳道）
    const laneEnd: number[] = [];
    items.forEach((it) => {
      let lane = 0;
      while (laneEnd[lane] !== undefined && laneEnd[lane] > it.off) lane++;
      laneEnd[lane] = it.end;
      it.lane = lane;
    });

    const lanes = Array.from({ length: laneEnd.length }, (_, L) => items.filter((x) => x.lane === L));
    return { empty: false, t0s, start, maxD: end, days, head, items, lanes, undated };
  });

  function fmtRange(a: Date, b: Date): string {
    const s = a.getMonth() + 1 + '/' + a.getDate();
    const e = b.getMonth() + 1 + '/' + b.getDate();
    if (a.getFullYear() !== b.getFullYear()) return a.getFullYear() + '/' + s + ' – ' + b.getFullYear() + '/' + e;
    return s + ' – ' + e + ' · ' + a.getFullYear();
  }

  function meta2Of(t: Task, span: number): string {
    const segs = subPlan(t).filter((g) => g.days > 0);
    if (segs.length > 1) return segs.length + ' 段 · ' + span + ' 天';
    const sMin = parseHM(t.time);
    const eMin = sMin !== null && t.estimate ? sMin + Number(t.estimate) : null;
    return t.time ? (eMin !== null ? t.time + '–' + hmStr(eMin) : t.time) : '全天';
  }

  function tipOf(t: Task, span: number): string {
    const stt = subStats(t);
    const sMin = parseHM(t.time);
    const eMin = sMin !== null && t.estimate ? sMin + Number(t.estimate) : null;
    const timeTxt = t.time ? (eMin !== null ? t.time + '–' + hmStr(eMin) : t.time) : '全天';
    return t.title + '\n' + timeTxt + ' · ' + span + ' 天' + (stt.n ? ' · 子项 ' + stt.done + '/' + stt.n : '') + '\n' + t.date + ' 起';
  }

  function open(id: string): void {
    if (isSuppressed()) return;
    toggleTaskDetail(id);
  }

  function barStyle(off: number, span: number, days: number) {
    const left = ((off / days) * 100).toFixed(4);
    const width = ((span / days) * 100).toFixed(4);
    // 左右各留 2px：贴到最左 / 最右的那条不会被容器圆角切掉
    return `left:calc(${left}% + 2px);width:calc(${width}% - 4px)`;
  }
</script>

{#if view.empty}
  <div class="sec-head"><h3>时间线</h3><span class="meta">横轴是日期，色带长度就是这件事占几天</span><span class="line"></span></div>
  <div class="gantt-wrap">
    <div class="g-empty"><Icon name="calendar" /><span>当前清单里还没有带日期的日程。加一条带日期的日程，这里就会自动铺开。</span></div>
  </div>
  {#if view.undated.length}
    <div class="sec-head"><h3>未排期</h3><span class="meta">{view.undated.length} 项</span><span class="line"></span></div>
    <div class="task-list">
      {#each view.undated.slice(0, 12) as t (t.id)}<TaskRow {t} />{/each}
    </div>
  {/if}
{:else}
  <div class="sec-head">
    <h3>时间线</h3>
    <span class="meta">横轴是日期，色带长度就是这件事占几天；拖动改开始日，拖右边缘改天数</span>
    <span class="line"></span>
  </div>
  <div class="gantt-wrap">
    <div class="gantt-bar">
      <span class="gantt-range">{fmtRange(view.start, view.maxD)}</span>
      <span class="gantt-hint">{view.items.length} 条 · {view.days} 天</span>
    </div>
    <div
      class="gantt"
      data-start={ymd(view.start)}
      style="--gdays:{view.days}"
      use:pointerDrag={{
        handle: '[data-gbar]',
        threshold: 6,
        onStart: (el, _e, origin) => {
          beginDragSession();
          dragStart = view.start;
          // 手柄命中要在隐藏源条之前算：beginDrag 会把源元素摘掉
          const under = document.elementFromPoint(origin.x, origin.y) as HTMLElement | null;
          resizing = !!under?.closest('[data-gresize]');
          const t = taskById(el.getAttribute('data-gbar') || '');
          grabPx = origin.x - el.getBoundingClientRect().left;
          if (t && t.date) {
            const off = dayDiff(dragStart, parseYmd(t.date)!);
            drop = { off, span: taskSpan(t) };
          }
          el.classList.add('dragging');
          fx = beginDrag({
            source: el,
            at: origin,
            ghost: false,
            placeholder: false,
            scrollEl: () => document.querySelector('.gantt-wrap') as HTMLElement | null
          });
        },
        onMove: (el, e) => {
          if (!fx) return;
          fx.move(e);
          const g = document.querySelector('.gantt') as HTMLElement | null;
          const t = taskById(el.getAttribute('data-gbar') || '');
          if (!g || !t || !t.date) return;
          const r = g.getBoundingClientRect();
          const dayAt = ((e.clientX - r.left) / Math.max(1, r.width)) * view.days;
          const span = taskSpan(t);
          if (resizing) {
            const off = dayDiff(dragStart, parseYmd(t.date)!);
            const next = Math.max(1, Math.min(90, Math.round(dayAt) - off + 1));
            drop = { off, span: next };
            fx.mark(null, 'box', '松手把天数改成 ' + next + ' 天');
            return;
          }
          // 抓哪儿拖哪儿：新起点 = (指针 − 抓点) 所在的那一天
          const dayW = r.width / view.days;
          const off = Math.max(0, Math.min(view.days - span, Math.round((e.clientX - grabPx - r.left) / dayW)));
          drop = { off, span };
          fx.mark(null, 'box', '松手移到 ' + mdShort(addDays(dragStart, off)) + ' 起 · 共 ' + span + ' 天');
        },
        onEnd: (el, _e, moved) => {
          endDragSession();
          el.classList.remove('dragging');
          const d = drop;
          fx?.end();
          fx = null;
          drop = null;
          if (!moved) {
            resizing = false;
            return;
          }
          const id = el.getAttribute('data-gbar') || '';
          if (!id || !d) {
            resizing = false;
            return;
          }
          if (resizing) {
            dropTimeline(id, '', d.span);
            toast.show('已延长到 ' + d.span + ' 天');
          } else {
            const next = ymd(addDays(dragStart, d.off));
            dropTimeline(id, next);
            toast.show('已改到 ' + mdShort(addDays(dragStart, d.off)) + ' 起');
          }
          resizing = false;
        }
      }}
    >
      <div class="g-head">
        {#each view.head as d, i (d.ds)}
          <div class="g-day{d.today ? ' today' : ''}{d.we ? ' we' : ''}{drop && i >= drop.off && i < drop.off + drop.span ? ' on' : ''}">
            <em>{d.month}</em><b>{d.day}</b><span>{d.wd}</span>
          </div>
        {/each}
      </div>
      {#each view.lanes as lane, li (li)}
        <div class="g-lane">
          {#each lane as x (x.t.id)}
            {@const segs = subPlan(x.t).filter((g) => g.days > 0)}
            <div
              class="g-bar {prioCls(x.t)}{segs.length > 1 ? ' has-segs' : ''}{isDetailOpen(x.t.id) ? ' active' : ''}"
              data-gbar={x.t.id}
              title={tipOf(x.t, x.span)}
              style={barStyle(x.off, x.span, view.days)}
              onclick={() => open(x.t.id)}
            >
              {#if segs.length > 1}
                <div class="g-segs">
                  {#each segs as g (g.i)}
                    <i style="width:{((g.days / x.span) * 100).toFixed(3)}%" title="{g.title} · {g.days} 天 · {segDateText(g)}"></i>
                  {/each}
                </div>
              {/if}
              <span class="g-bar-t">{x.t.title}</span>
              <span class="g-bar-m">{meta2Of(x.t, x.span)}</span>
              <i class="g-resize" data-gresize={x.t.id} title="拖我延长天数"></i>
            </div>
          {/each}
        </div>
      {/each}
      {#if drop}
        <div class="g-drop" style={barStyle(drop.off, drop.span, view.days)}></div>
      {/if}
    </div>
  </div>
  {#if view.undated.length}
    <div class="sec-head"><h3>未排期</h3><span class="meta">{view.undated.length} 项</span><span class="line"></span></div>
    <div class="task-list">
      {#each view.undated.slice(0, 12) as t (t.id)}<TaskRow {t} />{/each}
    </div>
  {/if}
{/if}
