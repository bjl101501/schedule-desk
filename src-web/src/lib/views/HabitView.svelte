<script lang="ts">
  import type { Habit } from '$lib/domain/types';
  import { addDays, dayDiff, parseYmd, sameDay, startOfWeek, today0, ymd } from '$lib/domain/date';
  import { calcStreak } from '$lib/domain/selectors';
  import { app } from '$lib/store/app.svelte';
  import { clock, todayD } from '$lib/store/clock.svelte';
  import { toast } from '$lib/store/toast.svelte';
  import { apiSaveHabit, cacheLocal, data } from '$lib/store/data.svelte';
  import { uiState } from '$lib/store/ui.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  const tick = $derived(clock.now);
  const today = $derived(todayD());
  const t0s = $derived(ymd(today));

  function hexSoft(hex: string): string {
    let h = String(hex || '#177CB0').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',.12)';
  }

  function toggle(h: Habit, ds: string): void {
    // 还没到的日子不给打卡，否则「连续天数」会被未来的勾预先占掉
    if (ds > t0s) {
      toast.show('还没到那天');
      return;
    }
    const i = h.log.indexOf(ds);
    if (i > -1) h.log.splice(i, 1);
    else h.log.push(ds);
    h.log.sort();
    h.total = h.log.length;
    h.streak = calcStreak(h, today);
    cacheLocal();
    apiSaveHabit(h);
    toast.show(i > -1 ? '已取消打卡' : '已打卡 ' + ds.slice(5));
  }

  const doneToday = $derived.by(() => {
    void tick;
    return data.habits.filter((h) => h.log.indexOf(t0s) > -1).length;
  });

  // 卡片视图：本周 7 天 + 近 18 周热力
  const weekNames = ['一', '二', '三', '四', '五', '六', '日'];

  function weekOf(h: Habit) {
    const ws = startOfWeek(today);
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(ws, i);
      const ds = ymd(d);
      return { ds, day: d.getDate(), on: h.log.indexOf(ds) > -1, today: sameDay(d, today) };
    });
  }

  function heatOf(h: Habit) {
    const ws = startOfWeek(today);
    return Array.from({ length: 18 }, (_, col) => {
      const colStart = addDays(ws, -(17 - col) * 7);
      return Array.from({ length: 7 }, (_, k) => {
        const ds = ymd(addDays(colStart, k));
        const hit = h.log.indexOf(ds) > -1;
        return { ds, lv: hit ? (h.target >= 7 ? 'l3' : 'l4') : '' };
      });
    });
  }

  function weekDone(h: Habit): number {
    const ws = startOfWeek(today);
    return h.log.filter((x) => {
      const d2 = parseYmd(x);
      return d2 && dayDiff(ws, d2) >= 0 && dayDiff(ws, d2) < 7;
    }).length;
  }

  // 日历总览
  const cur = $derived(app.habitCursor || today0());
  const calCells = $derived.by(() => {
    void tick;
    const y = cur.getFullYear();
    const m = cur.getMonth();
    const start = startOfWeek(new Date(y, m, 1));
    const futureLimit = t0s;
    return Array.from({ length: 42 }, (_, i) => {
      const d = addDays(start, i);
      const ds = ymd(d);
      return {
        ds,
        day: d.getDate(),
        out: d.getMonth() !== m,
        today: ds === t0s,
        future: ds > futureLimit,
        cnt: data.habits.filter((h) => h.log.indexOf(ds) > -1).length,
        dots: data.habits.map((h) => ({ id: h.id, color: h.color, name: h.name, on: h.log.indexOf(ds) > -1 }))
      };
    });
  });

  function navCal(step: number): void {
    app.habitCursor = new Date(cur.getFullYear(), cur.getMonth() + step, 1);
  }

  function editHabit(id: string): void {
    uiState.habitEditor = { id };
  }
</script>

{#if !data.habits.length}
  <div class="empty">
    <div class="empty-ico"><Icon name="repeat" /></div>
    <h4>还没有习惯</h4>
    <p>每天重复的小事，才是改变的开始。添加第一个习惯吧。</p>
    <button data-habitadd onclick={() => editHabit('')}>+ 添加习惯</button>
  </div>
{:else}
  <div class="view-bar">
    <button class="btn btn-pri view-add" data-habitadd onclick={() => editHabit('')}><Icon name="plus" />添加习惯</button>
    <div class="view-note">
      今日已完成 <b>{doneToday} / {data.habits.length}</b>
      {doneToday >= data.habits.length ? ' 个，今天全部打卡完成' : ' 个 · 连续坚持的人最酷'}
    </div>
    <div class="seg" style="margin-left:auto">
      <button data-habmode="cards" class={app.habitMode !== 'cal' ? 'on' : ''} onclick={() => (app.habitMode = 'cards')}>卡片</button>
      <button data-habmode="cal" class={app.habitMode === 'cal' ? 'on' : ''} onclick={() => (app.habitMode = 'cal')}>日历总览</button>
    </div>
  </div>

  {#if app.habitMode === 'cal'}
    <div class="hcal-wrap">
      <div class="hcal-head">
        <div class="hcal-title">{cur.getFullYear()} 年 {cur.getMonth() + 1} 月</div>
        <div class="cal-nav">
          <button data-hcalnav="-1" onclick={() => navCal(-1)}><Icon name="chevL" /></button>
          <button data-hcalnav="1" onclick={() => navCal(1)}><Icon name="chevR" /></button>
        </div>
        <button class="cal-today-btn" data-hcaltoday onclick={() => (app.habitCursor = today0())}>本月</button>
      </div>
      <div class="hcal-whead">{#each weekNames as w (w)}<div>{w}</div>{/each}</div>
      <div class="hcal-grid">
        {#each calCells as c (c.ds)}
          <div class="hcal-cell{c.out ? ' out' : ''}{c.today ? ' today' : ''}{c.future ? ' future' : ''}">
            <div class="hcal-dnum">{c.day}{#if c.cnt}<em>{c.cnt}</em>{/if}</div>
            <div class="hcal-dots">
              {#each c.dots as d (d.id)}
                <button
                  class="hcal-dot{d.on ? ' on' : ''}{c.future ? ' future' : ''}"
                  style="--c:{d.color}"
                  data-hcal="{d.id}|{c.ds}"
                  title="{d.name}{d.on ? ' · 已打卡' : ' · 点一下打卡'}"
                  onclick={() => { const h = data.habits.find((x) => x.id === d.id); if (h) toggle(h, c.ds); }}
                ></button>
              {/each}
            </div>
          </div>
        {/each}
      </div>
      <div class="hcal-legend">
        {#each data.habits as h (h.id)}
          <span class="hcal-lg"><i style="background:{h.color}"></i>{h.name}<b>{h.log.filter((x) => { const d2 = parseYmd(x); return d2 && d2.getFullYear() === cur.getFullYear() && d2.getMonth() === cur.getMonth(); }).length}</b></span>
        {/each}
      </div>
    </div>
  {:else}
    <div class="habit-grid">
      {#each data.habits as h (h.id)}
        {@const checked = h.log.indexOf(t0s) > -1}
        <div class="hcard">
          <div class="hcard-top">
            <div class="hicon" style="background:{hexSoft(h.color)};color:{h.color}"><Icon name={h.icon} /></div>
            <div class="hinfo">
              <div class="hn">{h.name}<button class="h-edit" data-hedit={h.id} title="编辑习惯" onclick={() => editHabit(h.id)}><Icon name="edit" /></button></div>
              <div class="hs">连续 {calcStreak(h, today)} 天 · 本周 {weekDone(h)}/{h.target} · 累计 {h.total} 次</div>
            </div>
            <button class="hbtn{checked ? ' on' : ''}" data-hcheck={h.id} title="今日打卡" onclick={() => toggle(h, t0s)}><Icon name="check" /></button>
          </div>
          <div class="hweek">
            {#each weekOf(h) as w, i (w.ds)}
              <div class="hday">
                <span class="hdw">{weekNames[i]}</span>
                <div class="hd-dot{w.on ? ' on' : ''}{w.today ? ' today' : ''}" data-hday="{h.id}|{w.ds}" onclick={() => toggle(h, w.ds)}>
                  {#if w.on}<Icon name="check" />{:else}{w.day}{/if}
                </div>
              </div>
            {/each}
          </div>
          <div class="hheat">
            {#each heatOf(h) as col, ci (ci)}
              <div class="hh-col">
                {#each col as cell (cell.ds)}
                  <div class="hh-cell {cell.lv}" title="{cell.ds}"></div>
                {/each}
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
{/if}
