<script lang="ts">
  import { addDays, dayDiff, parseYmd, stampDay, startOfWeek, today0, ymd } from '$lib/domain/date';
  import { calcStreak } from '$lib/domain/selectors';
  import { taskState } from '$lib/domain/window';
  import { clock } from '$lib/store/clock.svelte';
  import { data } from '$lib/store/data.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  const tick = $derived(clock.now);

  const s = $derived.by(() => {
    void tick;
    const t0 = today0();
    const t0s = ymd(t0);
    const doneAll = data.tasks.filter((t) => t.done);
    const doneToday = doneAll.filter((t) => stampDay(t.doneAt) === t0s).length;
    const ws = startOfWeek(t0);
    const doneWeek = doneAll.filter((t) => {
      const d = parseYmd(t.doneAt);
      return d && dayDiff(ws, d) >= 0 && dayDiff(ws, d) < 7;
    }).length;
    const live = data.tasks.filter((t) => !t.done).length;
    const overdue = data.tasks.filter((t) => taskState(t, tick).key === 'overdue').length;

    const monthAgo = addDays(t0, -29);
    const inMonth = data.tasks.filter((t) => {
      if (!t.date) return false;
      const d = parseYmd(t.date);
      if (!d) return false;
      const diff = dayDiff(monthAgo, d);
      return diff >= 0 && diff <= 29;
    });
    const doneMonth = inMonth.filter((t) => t.done).length;
    const rate = inMonth.length ? Math.round((doneMonth / inMonth.length) * 100) : 0;

    const weekPomos = data.pomodoros.filter((p) => {
      const d = parseYmd(p.date);
      return p.type === '专注' && d && dayDiff(ws, d) >= 0 && dayDiff(ws, d) < 7;
    });
    const weekFocusMin = weekPomos.reduce((a, b) => a + b.duration, 0);

    let maxDone = 1;
    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(t0, -(6 - i));
      const ds = ymd(d);
      const dn = doneAll.filter((t) => stampDay(t.doneAt) === ds).length;
      const created = data.tasks.filter((t) => t.date === ds).length;
      if (dn > maxDone) maxDone = dn;
      if (created > maxDone) maxDone = created;
      return { d, done: dn, total: created };
    });

    const tagMap: Record<string, number> = {};
    data.tasks.forEach((t) => t.tags.forEach((g) => (tagMap[g] = (tagMap[g] || 0) + 1)));
    const tagKeys = Object.keys(tagMap).sort((a, b) => tagMap[b] - tagMap[a]).slice(0, 6);
    const tagTotal = tagKeys.reduce((a, k) => a + tagMap[k], 0) || 1;
    const colors = ['#177CB0', '#7A4E63', '#5E8C6A', '#C8892B', '#0ea5b7', '#C3272B'];
    const ringC = 2 * Math.PI * 52;
    let offset = 0;
    const ringSegs = tagKeys.map((k, i) => {
      const frac = tagMap[k] / tagTotal;
      const seg = { color: colors[i % colors.length], dash: frac * ringC + ' ' + ringC, off: -offset * ringC };
      offset += frac;
      return seg;
    });

    const heatStart = addDays(startOfWeek(t0), -17 * 7);
    const heat = Array.from({ length: 18 }, (_, w2) =>
      Array.from({ length: 7 }, (_, k2) => {
        const dds = ymd(addDays(heatStart, w2 * 7 + k2));
        const n = doneAll.filter((t) => stampDay(t.doneAt) === dds).length;
        return { ds: dds, lv: n === 0 ? '' : n <= 1 ? 'l1' : n <= 2 ? 'l2' : n <= 4 ? 'l3' : 'l4', n };
      })
    );

    const habits = data.habits.map((h) => {
      let last30 = 0;
      for (let q = 0; q < 30; q++) if (h.log.indexOf(ymd(addDays(t0, -q))) > -1) last30++;
      return { name: h.name, color: h.color, last30, streak: calcStreak(h, t0) };
    });

    return {
      live, overdue, doneToday, doneWeek, rate, doneMonth, inMonthCount: inMonth.length,
      weekFocusMin, weekPomoCount: weekPomos.length, maxDone, weekDays, tagMap, tagKeys, colors, ringSegs, heat, habits
    };
  });
</script>

<div class="stat-cards">
  <div class="scard">
    <div class="sl"><Icon name="inbox" />待办事项</div>
    <div class="sv"><b>{s.live}</b><small>项</small></div>
    <div class="sd">其中逾期 <b style="color:var(--red)">{s.overdue}</b> 项</div>
  </div>
  <div class="scard">
    <div class="sl"><Icon name="check" />今日完成</div>
    <div class="sv"><b>{s.doneToday}</b><small>项</small></div>
    <div class="sd">本周累计 <b>{s.doneWeek}</b> 项</div>
  </div>
  <div class="scard">
    <div class="sl"><Icon name="trend" />近 30 天完成率</div>
    <div class="sv"><b>{s.rate}</b><small>%</small></div>
    <div class="sd">完成 {s.doneMonth} / {s.inMonthCount} 项</div>
  </div>
  <div class="scard">
    <div class="sl"><Icon name="clock" />本周专注</div>
    <div class="sv"><b>{Math.round(s.weekFocusMin / 60)}</b><small>小时</small></div>
    <div class="sd"><b>{s.weekPomoCount}</b> 个番茄 · {s.weekFocusMin} 分钟</div>
  </div>
</div>

<div class="chart-grid">
  <div class="chart-card">
    <h4>近 7 天事项趋势</h4>
    <div class="csub">实心为已完成，浅色为当天安排的事项数</div>
    <div class="bar-chart">
      {#each s.weekDays as w (ymd(w.d))}
        <div class="bar-col">
          <div class="bar-wrap">
            <div class="bar" style="height:{Math.max(4, (w.done / s.maxDone) * 100)}%" title="完成 {w.done}"></div>
            <div class="bar alt" style="height:{Math.max(4, (w.total / s.maxDone) * 100)}%" title="安排 {w.total}"></div>
          </div>
          <span class="bar-lbl">{w.d.getMonth() + 1}/{w.d.getDate()}</span>
        </div>
      {/each}
    </div>
    <div class="legend">
      <span><i style="background:var(--brand)"></i>已完成</span>
      <span><i style="background:var(--heat-1)"></i>安排</span>
    </div>
  </div>

  <div class="chart-card">
    <h4>事项标签分布</h4>
    <div class="csub">看看你的时间都花在哪类事上 · 多标签事项会重复计数</div>
    <div class="donut-wrap">
      <div class="donut">
        <svg width="132" height="132" viewBox="0 0 132 132">
          <circle cx="66" cy="66" r="52" fill="none" stroke="#eef2f8" stroke-width="17" />
          {#each s.ringSegs as seg, i (i)}
            <circle cx="66" cy="66" r="52" fill="none" stroke={seg.color} stroke-width="17" stroke-dasharray={seg.dash} stroke-dashoffset={seg.off} />
          {/each}
        </svg>
        <div class="donut-center"><b>{data.tasks.length}</b><span>总事项</span></div>
      </div>
      <div class="donut-legend">
        {#if s.tagKeys.length}
          {#each s.tagKeys as k, i (k)}
            <div class="dl"><i style="background:{s.colors[i % s.colors.length]}"></i><span class="dn2">#{k}</span><span class="dv2">{s.tagMap[k]}</span></div>
          {/each}
        {:else}
          <div style="font-size:12px;color:var(--text-3)">还没有给事项打标签</div>
        {/if}
      </div>
    </div>
  </div>
</div>

<div class="chart-grid">
  <div class="chart-card">
    <h4>完成热力图</h4>
    <div class="csub">近 18 周 · 每格一天，颜色越深完成越多</div>
    <div class="heat-wrap">
      <div class="heat">
        {#each s.heat as col, ci (ci)}
          <div class="heat-col">
            {#each col as cell (cell.ds)}
              <div class="heat-cell {cell.lv}" title="{cell.ds} 完成 {cell.n} 项"></div>
            {/each}
          </div>
        {/each}
      </div>
    </div>
    <div class="legend">
      <span>少</span>
      <span>
        <i style="background:var(--line-2)"></i>
        {#each [1, 2, 3, 4] as i (i)}<i style="background:var(--heat-{i});margin-left:3px"></i>{/each}
      </span>
      <span>多</span>
    </div>
  </div>

  <div class="chart-card">
    <h4>习惯坚持情况</h4>
    <div class="csub">连续天数与近 30 天打卡次数</div>
    <div class="pomo-list">
      {#if s.habits.length}
        {#each s.habits as h (h.name)}
          <div class="pomo-item">
            <span class="pi-dot" style="background:{h.color}"></span>
            <span class="pi-t">{h.name}</span>
            <span class="pi-m">30 天 {h.last30} 次 · 连续 {h.streak} 天</span>
          </div>
        {/each}
      {:else}
        <div style="font-size:12px;color:var(--text-3)">还没有习惯</div>
      {/if}
    </div>
  </div>
</div>
