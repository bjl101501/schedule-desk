<script lang="ts">
  import type { Task } from '$lib/domain/types';
  import { addDays, hmStr, parseYmd, sameDay, startOfWeek, weekdayName, ymd } from '$lib/domain/date';
  import { prioCls } from '$lib/domain/task';
  import { app } from '$lib/store/app.svelte';
  import { clock, todayD } from '$lib/store/clock.svelte';
  import { data } from '$lib/store/data.svelte';
  import { openTaskDetail } from '$lib/store/ui.svelte';
  import { isSuppressed } from '$lib/actions/suppress';
  import { pointerDrag, hitAt } from '$lib/actions/drag';
  import { beginDrag, type DragFx } from '$lib/actions/dragFx';
  import { dropToAllDay, dropToDate, dropToDateTime } from '$lib/store/dndActions.svelte';
  import { cursorOf, openDayView, openMonthView } from '$lib/store/calendarActions.svelte';
  import { beginDragSession, endDragSession } from '$lib/store/dragSession.svelte';
  import { HOUR_H, blocksOf } from '$lib/domain/calendar';
  import CalHead from './calendar/CalHead.svelte';
  import TimeGrid from './calendar/TimeGrid.svelte';

  const tick = $derived(clock.now);
  const today = $derived(todayD());
  const cursor = $derived(app.cursor instanceof Date ? app.cursor : new Date(app.cursor));

  function tasksOn(ds: string): Task[] {
    void tick;
    return data.tasks.filter((t) => t.date === ds);
  }

  /** 跨天日程：计划区间覆盖这一天，且不是起始日 */
  function spanningOn(ds: string): Task[] {
    void tick;
    const d = parseYmd(ds);
    if (!d) return [];
    return data.tasks.filter((t) => {
      if (!t.plan || !t.date || !t.endDate) return false;
      const a = parseYmd(t.date);
      const b = parseYmd(t.endDate);
      if (!a || !b) return false;
      return d > a && d <= b;
    });
  }

  const title = $derived.by(() => {
    const cur = cursor;
    switch (app.calMode) {
      case 'year':
        return cur.getFullYear() + ' 年';
      case 'month':
        return cur.getFullYear() + ' 年 ' + (cur.getMonth() + 1) + ' 月';
      case 'week': {
        const ws = startOfWeek(cur);
        const we = addDays(ws, 6);
        return ws.getMonth() + 1 + '月' + ws.getDate() + '日 — ' + (we.getMonth() + 1) + '月' + we.getDate() + '日';
      }
      case 'multiweek': {
        const ws2 = startOfWeek(cur);
        const we2 = addDays(ws2, app.calWeeks * 7 - 1);
        return ws2.getMonth() + 1 + '月' + ws2.getDate() + '日 — ' + (we2.getMonth() + 1) + '月' + we2.getDate() + '日 · ' + app.calWeeks + ' 周';
      }
      case 'day':
        return cur.getFullYear() + ' 年 ' + (cur.getMonth() + 1) + ' 月 ' + cur.getDate() + ' 日 · ' + weekdayName(cur);
      default: {
        const de = addDays(cur, app.calDays - 1);
        return cur.getMonth() + 1 + '月' + cur.getDate() + '日 — ' + (de.getMonth() + 1) + '月' + de.getDate() + '日 · ' + app.calDays + ' 天';
      }
    }
  });

  let fx: DragFx | null = null;
  let lineEl: HTMLElement | null = null;
  let bubEl: HTMLElement | null = null;

  function showTimeCursor(day: HTMLElement, min: number): void {
    if (!lineEl) {
      lineEl = document.createElement('div');
      lineEl.className = 'cal-drag-line';
      document.getElementById('float-root')?.appendChild(lineEl) ?? document.body.appendChild(lineEl);
    }
    if (!bubEl) {
      bubEl = document.createElement('div');
      bubEl.className = 'cal-drag-tip';
      document.getElementById('float-root')?.appendChild(bubEl) ?? document.body.appendChild(bubEl);
    }
    const r = day.getBoundingClientRect();
    const top = r.top + (min / 60) * HOUR_H;
    lineEl.style.display = 'block';
    lineEl.style.left = r.left + 6 + 'px';
    lineEl.style.width = Math.max(24, r.width - 12) + 'px';
    lineEl.style.top = top + 'px';
    bubEl.style.display = 'block';
    bubEl.style.left = r.left + 8 + 'px';
    bubEl.style.top = Math.max(4, top - 26) + 'px';
    bubEl.textContent = hmStr(min);
  }

  function hideTimeCursor(): void {
    if (lineEl) lineEl.style.display = 'none';
    if (bubEl) bubEl.style.display = 'none';
  }

  /** 指针在某天列里的分钟数（按 5 分钟吸附） */
  function minuteAt(day: HTMLElement, clientY: number): number {
    const r = day.getBoundingClientRect();
    const ratio = (clientY - r.top) / Math.max(1, r.height);
    const raw = Math.round((ratio * 24 * 60) / 5) * 5;
    return Math.max(0, Math.min(23 * 60 + 55, raw));
  }

  const mdDrag = {
    handle: '.md-ev2, .md-adchip, .wev',
    onStart: (el: HTMLElement) => {
      beginDragSession();
      el.classList.add('dragging');
      fx = beginDrag({ source: el, scrollEl: () => el.closest('.md-wrap') as HTMLElement | null });
    },
    onMove: (_el: HTMLElement, e: PointerEvent) => {
      if (!fx) return;
      const day = hitAt(e, '.md-day, .md-allday, .wcol-body');
      fx.move(e);
      if (!day) {
        fx.mark(null, 'box', '');
        hideTimeCursor();
        return;
      }
      const ds = day.getAttribute('data-cdate') || '';
      if (day.classList.contains('md-allday')) {
        hideTimeCursor();
        fx.mark(day, 'box', '松手改为全天');
        return;
      }
      const min = minuteAt(day, e.clientY);
      showTimeCursor(day, min);
      fx.mark(day, 'box', '松手改到 ' + ds.slice(5) + ' ' + hmStr(min));
    },
    onEnd: (el: HTMLElement, e: PointerEvent, moved: boolean) => {
      endDragSession();
      el.classList.remove('dragging');
      hideTimeCursor();
      fx?.end();
      fx = null;
      if (!moved) return;
      const day = hitAt(e, '.md-day, .md-allday, .wcol-body');
      const ds = day?.getAttribute('data-cdate') || '';
      const id = el.getAttribute('data-tid') || '';
      if (!id || !ds) return;
      if (day!.classList.contains('md-allday')) {
        dropToAllDay(id, ds);
        return;
      }
      if (day!.classList.contains('wcol-body')) {
        dropToDate(id, ds);
        return;
      }
      dropToDateTime(id, ds, hmStr(minuteAt(day as HTMLElement, e.clientY)));
    }
  };

  function openMonth(m: number): void {
    openMonthView(cursorOf(), m);
  }

  function openDay(ds: string): void {
    if (isSuppressed()) return;
    openDayView(ds);
  }

  function openTask(id: string): void {
    if (isSuppressed()) return;
    openTaskDetail(id);
  }

  // ---------- 年 ----------
  const yearGrid = $derived.by(() => {
    const y = cursor.getFullYear();
    const out: { m: number; weeks: { ds: string; day: number; out: boolean; today: boolean; has: number; prio: string }[]; count: number }[] = [];
    for (let m = 0; m < 12; m++) {
      const first = new Date(y, m, 1);
      const start = startOfWeek(first);
      const lastDay = new Date(y, m + 1, 0);
      const weeks = Math.max(4, Math.ceil((Math.floor((lastDay.getTime() - start.getTime()) / 86400000) + 1) / 7));
      const cells: { ds: string; day: number; out: boolean; today: boolean; has: number; prio: string }[] = [];
      let count = 0;
      for (let i = 0; i < weeks * 7; i++) {
        const d = addDays(start, i);
        const ds = ymd(d);
        const outM = d.getMonth() !== m;
        const has = outM ? [] : tasksOn(ds).filter((t) => !t.done);
        if (has.length) count += has.length;
        const ranks = has.map(prioCls);
        const prio = ranks.indexOf('p0') > -1 ? 'p0' : ranks.indexOf('p1') > -1 ? 'p1' : ranks.indexOf('p2') > -1 ? 'p2' : 'p3';
        cells.push({ ds, day: d.getDate(), out: outM, today: !outM && sameDay(d, today), has: has.length, prio });
      }
      out.push({ m, weeks: cells, count });
    }
    return out;
  });

  // ---------- 月 ----------
  const monthGrid = $derived.by(() => {
    void tick;
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const start = startOfWeek(new Date(y, m, 1));
    const cells: { ds: string; day: number; out: boolean; today: boolean; evs: { id: string; title: string; time: string; cls: string; done: boolean; cont: boolean; dayN: number }[]; more: number }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = addDays(start, i);
      const ds = ymd(d);
      const list = tasksOn(ds).map((t) => ({ t, dayN: 0 }));
      const cont = spanningOn(ds).map((t) => ({ t, dayN: Math.round((d.getTime() - parseYmd(t.date)!.getTime()) / 86400000) + 1 }));
      const all = list.concat(cont);
      const evs = all.slice(0, 3).map((it) => ({
        id: it.t.id,
        title: it.t.title,
        time: it.t.time,
        cls: prioCls(it.t),
        done: it.t.done,
        cont: it.dayN > 0,
        dayN: it.dayN
      }));
      cells.push({ ds, day: d.getDate(), out: d.getMonth() !== m, today: sameDay(d, today), evs, more: Math.max(0, all.length - 3) });
    }
    return cells;
  });

  const gridCols = $derived.by(() => {
    void tick;
    let days: Date[] = [];
    if (app.calMode === 'day') days = [cursor];
    else if (app.calMode === 'multiday') days = Array.from({ length: app.calDays }, (_, i) => addDays(cursor, i));
    else days = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i));
    const todayS = ymd(today);
    return days.map((d) => {
      const ds = ymd(d);
      const all = tasksOn(ds).filter((t) => !t.time).map((t) => ({ t, dayN: 0 }))
        .concat(spanningOn(ds).map((t) => ({ t, dayN: Math.round((d.getTime() - parseYmd(t.date)!.getTime()) / 86400000) + 1 })));
      return {
        d,
        ds,
        isToday: ds === todayS,
        allday: all,
        blocks: blocksOf(tasksOn(ds), ds),
        nowTop: ((new Date(tick).getHours() * 60 + new Date(tick).getMinutes()) / 60) * HOUR_H
      };
    });
  });

  const hasAllDay = $derived(gridCols.some((c) => c.allday.length > 0));

  function scrollGrid(): void {
    const w = document.querySelector('.md-wrap') as HTMLElement | null;
    if (!w) return;
    const now = new Date(tick);
    const viewingToday =
      app.calMode === 'day' ? sameDay(cursor, now) : gridCols.some((c) => sameDay(c.d, now));
    let base = viewingToday ? now.getHours() * 60 + now.getMinutes() - 90 : 7 * 60;
    if (base < 6 * 60) base = 6 * 60 - 30;
    const adEl = document.querySelector('.md-allday') as HTMLElement | null;
    const adH = adEl ? adEl.getBoundingClientRect().height : hasAllDay ? 32 : 0;
    w.scrollTop = Math.max(0, (base / 60) * HOUR_H - (54 + adH));
  }

  $effect(() => {
    if (app.calMode === 'day' || app.calMode === 'multiday') {
      const id = setTimeout(scrollGrid, 60);
      return () => clearTimeout(id);
    }
  });

</script>

<div class="cal-shell">
  <CalHead {title} />

  {#if app.calMode === 'year'}
    <div class="year-grid">
      {#each yearGrid as mo (mo.m)}
        <div class="ymini{mo.m === cursor.getMonth() ? ' on' : ''}" data-ymonth={mo.m} onclick={() => openMonth(mo.m)}>
          <h4>{mo.m + 1} 月{#if mo.count}<em>{mo.count} 项</em>{/if}</h4>
          <div class="yweek">
            {#each mo.weeks as c (c.ds)}
              <div
                class="yday{c.out ? ' out' : ''}{c.today ? ' today' : ''}{c.has ? ' has' : ''}{c.has > 1 ? ' multi' : ''}{c.has ? ' ' + c.prio : ''}"
                data-cdate={c.ds}
                onclick={(e) => { e.stopPropagation(); openDay(c.ds); }}
              >
                <span class="ynum" data-ynum={c.ds} title="点这里看这一天">{c.day}</span>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {:else if app.calMode === 'month'}
    <div class="mw-head">{#each ['一', '二', '三', '四', '五', '六', '日'] as d (d)}<div>{d}</div>{/each}</div>
    <div
      class="month-grid"
      use:pointerDrag={{
        handle: '[data-tid]',
        onStart: (el) => {
          beginDragSession();
          el.classList.add('dragging');
          fx = beginDrag({ source: el, scrollEl: () => document.getElementById('content') });
        },
        onMove: (_el, e) => {
          if (!fx) return;
          const cell = hitAt(e, '[data-cdate]');
          const ds = cell?.getAttribute('data-cdate') || '';
          fx.move(e);
          fx.mark(cell, 'box', ds ? '松手改到 ' + ds.slice(5) : '');
        },
        onEnd: (el, e, moved) => {
          endDragSession();
          el.classList.remove('dragging');
          if (!moved) return;
          const cell = hitAt(e, '[data-cdate]');
          const ds = cell?.getAttribute('data-cdate') || '';
          const id = el.getAttribute('data-tid') || '';
          if (id && ds) dropToDate(id, ds);
          fx?.end();
          fx = null;
        }
      }}
    >
      {#each monthGrid as c (c.ds)}
        <div class="mcell{c.out ? ' out' : ''}{c.today ? ' today' : ''}" data-cdate={c.ds} onclick={() => openDay(c.ds)}>
          <div class="mnum">
            <span>{c.day}</span>
            {#if c.today}<span class="lunar">今天</span>{/if}
          </div>
          {#each c.evs as e (e.id + e.cont + e.dayN)}
            <div class="mev {e.cls}{e.done ? ' done' : ''}{e.cont ? ' cont' : ''}" data-tid={e.id} onclick={(ev) => { ev.stopPropagation(); openTask(e.id); }}>
              {#if e.cont}<i class="sub-br">├</i><span class="mev-d">第{e.dayN}天</span>{:else if e.time}{e.time}{' '}{/if}{e.title}
            </div>
          {/each}
          {#if c.more}<div class="mmore">+{c.more} 项</div>{/if}
        </div>
      {/each}
    </div>
  {:else if app.calMode === 'week'}
    {@const ws = startOfWeek(cursor)}
    {@const wdays = Array.from({ length: 7 }, (_, i) => addDays(ws, i))}
    <div class="week-grid" use:pointerDrag={mdDrag}>
      {#each wdays as d (ymd(d))}
        <div class="wcol{sameDay(d, today) ? ' today' : ''}">
          <div class="wcol-head">
            <div class="wd">{weekdayName(d)}</div>
            <div class="dn">{d.getDate()}</div>
          </div>
          <div
            class="wcol-body"
            data-cdate={ymd(d)}
            onclick={(e) => { if ((e.target as HTMLElement).closest('[data-tid]')) return; openDay(ymd(d)); }}
          >
            {#each tasksOn(ymd(d)) as t (t.id)}
              <div class="wev {prioCls(t)}{t.done ? ' done' : ''}" data-tid={t.id} onclick={() => openTask(t.id)}>
                <div class="wt">{t.time || '全天'}</div>
                {t.title}
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {:else if app.calMode === 'multiweek'}
    {#each Array.from({ length: app.calWeeks }, (_, i) => i) as w (w)}
      {@const days = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), w * 7 + i))}
      <div class="md-wrap" style="--hour-h:{HOUR_H}px;height:auto">
        <div class="md-grid" data-n="7" use:pointerDrag={mdDrag}>
          <div class="md-corner"></div>
          {#each days as d (ymd(d))}
            <div class="md-colhead{sameDay(d, today) ? ' today' : ''}">
              <div class="md-wd">{weekdayName(d)}</div>
              <div class="md-dn">{d.getDate()}</div>
            </div>
          {/each}
          {#each days as d (ymd(d) + 'a')}
            <div class="md-allday" data-cdate={ymd(d)} onclick={(e) => { if ((e.target as HTMLElement).closest('[data-tid]')) return; openDay(ymd(d)); }}>
              {#each tasksOn(ymd(d)).filter((t) => !t.time) as t (t.id)}
                <span class="md-adchip {prioCls(t)}" data-tid={t.id} onclick={() => openTask(t.id)}>{t.title}</span>
              {/each}
            </div>
          {/each}
          {#each days as d (ymd(d) + 'b')}
            <div class="md-day" data-cdate={ymd(d)} onclick={(e) => { if ((e.target as HTMLElement).closest('[data-tid]')) return; openDay(ymd(d)); }}>
              {#each blocksOf(tasksOn(ymd(d)), ymd(d)) as b (b.t.id)}
                <div
                  class="md-ev2 {prioCls(b.t)}{b.t.done ? ' done' : ''}{b.hgt < 34 ? ' tiny' : ''}{b.hgt < 46 ? ' short' : ''}"
                  style="top:{b.top.toFixed(1)}px;height:{b.hgt.toFixed(1)}px;left:calc({b.leftPct.toFixed(3)}% + 3px);width:calc({b.wPct.toFixed(3)}% - 6px)"
                  data-tid={b.t.id}
                  title="{b.t.title} · {b.t.time}-{b.endT}"
                  onclick={() => openTask(b.t.id)}
                >
                  {#if b.hgt >= 34}<div class="md-ev2-t">{b.t.time} – {b.endT}{b.subTxt}</div>{/if}
                  <div class="md-ev2-n">{b.t.title}</div>
                </div>
              {/each}
            </div>
          {/each}
        </div>
      </div>
    {/each}
  {:else}
    <TimeGrid cols={gridCols} {hasAllDay} hourH={HOUR_H} drag={mdDrag} />
  {/if}
</div>
