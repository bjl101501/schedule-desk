<script lang="ts">
  /*
    日 / 多日时间栅格。只吃「列数据 + 拖拽动作」，自己不管游标、模式。
    外层滚动容器由这里带，滚动定位仍在 CalendarView（它知道当前看的是不是今天）。
  */
  import type { Task } from '$lib/domain/types';
  import { weekdayName } from '$lib/domain/date';
  import { prioCls, taskSpan } from '$lib/domain/task';
  import { openTaskDetail } from '$lib/store/ui.svelte';
  import { isSuppressed } from '$lib/actions/suppress';
  import { pointerDrag, type PointerDragOpts } from '$lib/actions/drag';
  import type { CalBlock } from '$lib/domain/calendar';

  interface Col {
    d: Date;
    ds: string;
    isToday: boolean;
    allday: { t: Task; dayN: number }[];
    blocks: CalBlock[];
    nowTop: number;
  }

  let { cols, hasAllDay, hourH, drag }: { cols: Col[]; hasAllDay: boolean; hourH: number; drag: PointerDragOpts } = $props();

  function openTask(id: string): void {
    if (isSuppressed()) return;
    openTaskDetail(id);
  }
</script>

<div class="md-wrap" style="--hour-h:{hourH}px">
  <div class="md-grid" data-n={cols.length} use:pointerDrag={drag}>
    <div class="md-corner"></div>
    {#each cols as c (c.ds + 'h')}
      <div class="md-colhead{c.isToday ? ' today' : ''}">
        <div class="md-wd">{weekdayName(c.d)}</div>
        <div class="md-dn">{c.d.getDate()}</div>
      </div>
    {/each}
    {#if hasAllDay}
      <div class="md-allday-lbl">全天</div>
      {#each cols as c (c.ds + 'a')}
        <div class="md-allday" data-cdate={c.ds}>
          {#each c.allday as x (x.t.id)}
            <span class="md-adchip {prioCls(x.t)}{x.dayN ? ' cont' : ''}" data-tid={x.t.id} title="{x.t.title}{x.dayN ? ' · 第 ' + x.dayN + '/' + taskSpan(x.t) + ' 天' : ''}" onclick={() => openTask(x.t.id)}>
              {#if x.dayN}<i class="sub-br">├</i><i class="ad-day">第{x.dayN}天</i>{/if}{x.t.title}
            </span>
          {/each}
        </div>
      {/each}
    {/if}
    <div class="md-axis">
      <div class="md-axis-in">
        {#each Array.from({ length: 24 }, (_, h) => h) as h (h)}
          <div class="md-tick" style="top:{h * hourH}px">{String(h).padStart(2, '0')}:00</div>
        {/each}
      </div>
    </div>
    {#each cols as c (c.ds + 'd')}
      <div class="md-day" data-cdate={c.ds}>
        {#each c.blocks as b (b.t.id)}
          <div
            class="md-ev2 {prioCls(b.t)}{b.t.done ? ' done' : ''}{b.hgt < 34 ? ' tiny' : ''}{b.hgt < 46 ? ' short' : ''}"
            style="top:{b.top.toFixed(1)}px;height:{b.hgt.toFixed(1)}px;left:calc({b.leftPct.toFixed(3)}% + 3px);width:calc({b.wPct.toFixed(3)}% - 6px)"
            data-tid={b.t.id}
            title="{b.t.title} · {b.t.time}-{b.endT}"
            onclick={() => openTask(b.t.id)}
          >
            {#if b.hgt >= 34}<div class="md-ev2-t">{b.t.time} – {b.endT}{b.subTxt}</div>{/if}
            <div class="md-ev2-n">{b.t.title}</div>
            {#if b.segTitle}<div class="md-ev2-s"><i class="md-ev2-br">{b.segDays > 1 ? '├' : '└'}</i>{b.segTitle}</div>{/if}
            {#if b.hasSubs}<span class="md-ev2-p"><i style="width:{b.subPct}%"></i></span>{/if}
          </div>
        {/each}
        {#if c.isToday}<div class="md-now" style="top:{c.nowTop.toFixed(1)}px"></div>{/if}
      </div>
    {/each}
  </div>
</div>
