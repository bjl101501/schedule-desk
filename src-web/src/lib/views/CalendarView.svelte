<script lang="ts">
  import type { Task, CalMode } from '$lib/domain/types';
  import { addDays, hmStr, parseHM, parseYmd, sameDay, startOfWeek, weekdayName, ymd } from '$lib/domain/date';
  import { prioCls, subPlan, subStats, taskSpan } from '$lib/domain/task';
  import { app } from '$lib/store/app.svelte';
  import { clock, todayD } from '$lib/store/clock.svelte';
  import { data } from '$lib/store/data.svelte';
  import { openTaskDetail } from '$lib/store/ui.svelte';
  import { isSuppressed } from '$lib/actions/suppress';
  import Icon from '$lib/ui/Icon.svelte';
  import { pointerDrag, hitAt } from '$lib/actions/drag';
  import { beginDrag, type DragFx } from '$lib/actions/dragFx';
  import { dropToAllDay, dropToDate, dropToDateTime } from '$lib/store/dndActions.svelte';
  import { calBack, calNav, calToday, cursorOf, openDayView, openMonthView, setCalDays, setCalMode, setCalWeeks } from '$lib/store/calendarActions.svelte';
  import { beginDragSession, endDragSession } from '$lib/store/dragSession.svelte';

  const HOUR_H = 36;
  const DAY_MIN = 1440;

  const tick = $derived(clock.now);
  const today = $derived(todayD());
  const cursor = $derived(app.cursor instanceof Date ? app.cursor : new Date(app.cursor));

  const modes: { k: CalMode; t: string }[] = [
    { k: 'year', t: '年' },
    { k: 'month', t: '月' },
    { k: 'week', t: '周' },
    { k: 'multiweek', t: '多周' },
    { k: 'day', t: '日' },
    { k: 'multiday', t: '多日' }
  ];

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

  function segOn(t: Task, ds: string) {
    const d = parseYmd(ds);
    if (!t || !t.date || !d) return null;
    const off = Math.round((d.getTime() - parseYmd(t.date)!.getTime()) / 86400000);
    if (off < 0) return null;
    let hit = null;
    for (const g of subPlan(t)) {
      if (g.days > 0 && off >= g.dayFrom && off < g.dayFrom + g.days) hit = g;
    }
    return hit;
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

  function backTo(): void {
    calBack();
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

  // ---------- 时间栅格 ----------
  function blocksOf(list: Task[], ds: string) {
    const items = list
      .filter((t) => !!t.time)
      .map((t) => {
        const st = parseHM(t.time) || 0;
        let dur = Number(t.estimate) > 0 ? Number(t.estimate) : 30;
        if (dur > DAY_MIN) dur = DAY_MIN;
        let top = (st / 60) * HOUR_H;
        let hgt = (dur / 60) * HOUR_H;
        if (hgt < 22) hgt = 22;
        if (top + hgt > DAY_MIN) top = Math.max(0, DAY_MIN - hgt);
        return { t, st, dur, top, hgt, lane: 0, laneCount: 1 };
      })
      .sort((a, b) => a.top - b.top);

    const clusters: typeof items[] = [];
    let cur: typeof items = [];
    let curEnd = -1;
    items.forEach((it) => {
      if (cur.length && it.top >= curEnd - 1) {
        clusters.push(cur);
        cur = [];
        curEnd = -1;
      }
      cur.push(it);
      if (it.top + it.hgt > curEnd) curEnd = it.top + it.hgt;
    });
    if (cur.length) clusters.push(cur);
    clusters.forEach((group) => {
      const lanes: number[] = [];
      group.forEach((it) => {
        let lane = 0;
        while (lanes[lane] !== undefined && lanes[lane] > it.top + 1) lane++;
        lanes[lane] = it.top + it.hgt;
        it.lane = lane;
      });
      const cnt = Math.max(1, lanes.length);
      group.forEach((it) => (it.laneCount = cnt));
    });

    return items.map((it) => {
      const st2 = subStats(it.t);
      const seg = it.hgt >= 44 ? segOn(it.t, ds) : null;
      return {
        ...it,
        endT: hmStr(it.st + it.dur),
        leftPct: (it.lane * 100) / it.laneCount,
        wPct: 100 / it.laneCount,
        subTxt: st2.n ? ' · ' + st2.done + '/' + st2.n : '',
        subPct: st2.pct,
        hasSubs: st2.n > 0,
        segTitle: seg ? seg.title : '',
        segDays: seg ? seg.days : 0
      };
    });
  }

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
  <div class="cal-head">
    {#if app.calReturn && (app.calMode === 'day' || app.calMode === 'month')}
      <button class="cal-back" data-calback onclick={backTo}><Icon name="chevL" />返回{app.calReturn.mode === 'year' ? '年' : '月'}视图</button>
    {/if}
    <span class="cal-title">{title}</span>
    <div class="cal-nav">
      <button data-calnav="-1" onclick={() => calNav(-1)}><Icon name="chevL" /></button>
      <button data-calnav="1" onclick={() => calNav(1)}><Icon name="chevR" /></button>
    </div>
    <button class="cal-today-btn" data-caltoday onclick={calToday}>今天</button>
    <div style="margin-left:auto;display:flex;gap:5px;align-items:center;flex-wrap:wrap;justify-content:flex-end;max-width:100%;min-width:0">
      <div class="cal-legend" title="日历里日程块的底色只由优先级决定，和清单、标签无关">
        <b><i style="background:var(--red)"></i>P0</b>
        <b><i style="background:var(--orange)"></i>P1</b>
        <b><i style="background:var(--brand)"></i>P2</b>
        <b><i style="background:var(--text-3)"></i>P3</b>
      </div>
      {#if app.calMode === 'multiweek'}
        <div class="cal-views">
          {#each [2, 3, 4] as n (n)}
            <button data-calweeks={n} class={app.calWeeks === n ? 'on' : ''} onclick={() => setCalWeeks(n)}>{n} 周</button>
          {/each}
        </div>
      {:else if app.calMode === 'multiday'}
        <div class="cal-views">
          {#each [3, 5, 7] as n (n)}
            <button data-caldays={n} class={app.calDays === n ? 'on' : ''} onclick={() => setCalDays(n)}>{n} 天</button>
          {/each}
        </div>
      {/if}
      <div class="cal-views" style="margin-left:0">
        {#each modes as m (m.k)}
          <button data-calmode={m.k} class={app.calMode === m.k ? 'on' : ''} onclick={() => setCalMode(m.k)}>{m.t}</button>
        {/each}
      </div>
    </div>
  </div>

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
    <div class="md-wrap" style="--hour-h:{HOUR_H}px">
      <div class="md-grid" data-n={gridCols.length} use:pointerDrag={mdDrag}>
        <div class="md-corner"></div>
        {#each gridCols as c (c.ds + 'h')}
          <div class="md-colhead{c.isToday ? ' today' : ''}">
            <div class="md-wd">{weekdayName(c.d)}</div>
            <div class="md-dn">{c.d.getDate()}</div>
          </div>
        {/each}
        {#if hasAllDay}
          <div class="md-allday-lbl">全天</div>
          {#each gridCols as c (c.ds + 'a')}
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
              <div class="md-tick" style="top:{h * HOUR_H}px">{String(h).padStart(2, '0')}:00</div>
            {/each}
          </div>
        </div>
        {#each gridCols as c (c.ds + 'd')}
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
  {/if}
</div>
