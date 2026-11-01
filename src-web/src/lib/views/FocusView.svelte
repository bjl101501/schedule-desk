<script lang="ts">
  import { dayDiff, parseYmd, startOfWeek, today0, ymd } from '$lib/domain/date';
  import { FOCUS_MODES, type FocusMode } from '$lib/domain/constants';
  import { data } from '$lib/store/data.svelte';
  import { clock } from '$lib/store/clock.svelte';
  import { focus, resetFocus, setMode, skipFocus, toggleFocus } from '$lib/store/focus.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  const mode = $derived(FOCUS_MODES[focus.mode]);
  const leftSec = $derived(focus.left);
  const totalSec = $derived(focus.total);
  const R = 96;
  const C = 2 * Math.PI * R;
  const dash = $derived((leftSec / totalSec) * C);

  const stats = $derived.by(() => {
    void clock.now;
    const t0 = today0();
    const t0s = ymd(t0);
    const todayPomos = data.pomodoros.filter((p) => p.date === t0s && p.type === '专注');
    const todayMin = todayPomos.reduce((a, b) => a + b.duration, 0);
    const ws = startOfWeek(t0);
    const weekMin = data.pomodoros
      .filter((p) => {
        const d = parseYmd(p.date);
        return p.type === '专注' && d && dayDiff(ws, d) >= 0 && dayDiff(ws, d) < 7;
      })
      .reduce((a, b) => a + b.duration, 0);
    const recent = data.pomodoros.filter((p) => p.type === '专注').slice(-6).reverse();
    return { todayPomos, todayMin, weekMin, recent };
  });

  const tasks = $derived(data.tasks.filter((t) => !t.done).slice(0, 40));
  const curTask = $derived(data.tasks.find((t) => t.id === focus.taskId));

  function onTaskChange(e: Event): void {
    const id = (e.currentTarget as HTMLSelectElement).value;
    const t = data.tasks.find((x) => x.id === id);
    focus.taskId = id;
    focus.taskTitle = t ? t.title : '';
    focus.subIndex = '';
    focus.subTitle = '';
  }

  function onSubChange(e: Event): void {
    const idx = (e.currentTarget as HTMLSelectElement).value;
    const t = curTask;
    focus.subIndex = idx;
    focus.subTitle = t && idx !== '' ? (t.subs[Number(idx)]?.title || '') : '';
  }

  const fmt = (s: number) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
</script>

<div class="focus-wrap">
  <div class="focus-card">
    <div class="focus-modes">
      {#each Object.keys(FOCUS_MODES) as k (k)}
        <button data-fmode={k} class={focus.mode === k ? 'on' : ''} onclick={() => setMode(k as FocusMode)}>
          {FOCUS_MODES[k as FocusMode].name} {FOCUS_MODES[k as FocusMode].min}'
        </button>
      {/each}
    </div>

    <div class="focus-ring">
      <svg width="216" height="216" viewBox="0 0 216 216">
        <circle class="fr-bg" cx="108" cy="108" r={R} />
        <circle
          class="fr-fg"
          cx="108"
          cy="108"
          r={R}
          stroke-dasharray="{dash} {C}"
          stroke-dashoffset="0"
          transform="rotate(-90 108 108)"
        />
      </svg>
      <div class="focus-time-wrap">
        <div class="focus-time">{fmt(leftSec)}</div>
        <div class="focus-state">
          {focus.running ? mode.name + '中 · 第 ' + focus.round + ' 轮' : leftSec === totalSec ? '准备开始' : '已暂停'}
        </div>
      </div>
    </div>

    <select class="focus-task" id="focusTaskSel" value={focus.taskId} onchange={onTaskChange}>
      <option value="">不关联事项</option>
      {#each tasks as t (t.id)}
        <option value={t.id}>{t.title}</option>
      {/each}
    </select>

    {#if curTask && curTask.subs.length}
      <select class="focus-task" id="focusSubSel" value={focus.subIndex} onchange={onSubChange}>
        <option value="">不指定子项（整条日程）</option>
        {#each curTask.subs as x, i (i)}
          <option value={i}>{x.title}</option>
        {/each}
      </select>
    {/if}

    {#if focus.pauseCount}
      <div class="focus-pause"><Icon name="clock" />已暂停 {focus.pauseCount} 次 · 合计 {Math.round(focus.pauseSec / 60)} 分钟</div>
    {/if}

    <div class="focus-ctrl">
      <button class="fbtn fbtn-main" data-ftoggle onclick={toggleFocus}>
        <Icon name={focus.running ? 'pause' : 'play'} />{focus.running ? '暂停' : leftSec === totalSec ? '开始专注' : '继续'}
      </button>
      <button class="fbtn fbtn-ghost" data-freset title="重置" onclick={resetFocus}><Icon name="reset" /></button>
      <button class="fbtn fbtn-ghost" data-fskip title="跳过本轮" onclick={skipFocus}>跳过</button>
    </div>

    <div style="font-size:11.5px;color:var(--text-3);text-align:center;line-height:1.7;max-width:330px">
      专注结束会写一条记录；切到其他视图也会继续计时。暂停次数与时长会一起记下来。
    </div>
  </div>

  <div class="focus-side">
    <div class="fside-card">
      <h4><Icon name="target" />今日专注</h4>
      <div class="pomo-stat">
        <div><b>{stats.todayPomos.length}</b><span>番茄数</span></div>
        <div><b>{stats.todayMin}</b><span>分钟</span></div>
        <div><b>{Math.round(stats.weekMin / 60)}</b><span>本周小时</span></div>
      </div>
      {#if stats.todayPomos.some((p) => p.pauseCount)}
        <div class="pomo-pause">
          今日暂停 {stats.todayPomos.reduce((a, b) => a + (b.pauseCount || 0), 0)} 次 ·
          {Math.round(stats.todayPomos.reduce((a, b) => a + (b.pauseSec || 0), 0) / 60)} 分钟
        </div>
      {/if}
    </div>

    <div class="fside-card">
      <h4><Icon name="clock" />最近专注</h4>
      <div class="pomo-list">
        {#if stats.recent.length}
          {#each stats.recent as p (p.id || p.date + p.task + p.duration)}
            <div class="pomo-item">
              <span class="pi-dot"></span>
              <span class="pi-t">{p.task || '未命名专注'}</span>
              <span class="pi-m">{p.date || ''} · {p.duration} 分{p.sub ? ' · ' + p.sub : ''}</span>
            </div>
          {/each}
        {:else}
          <div style="font-size:12px;color:var(--text-3)">今天还没开始专注，先来一个 25 分钟吧</div>
        {/if}
      </div>
    </div>

    <div class="fside-card">
      <h4><Icon name="bulb" />专注小贴士</h4>
      <div style="font-size:12px;color:var(--text-2);line-height:1.8">
        25 分钟只做一件事，结束后站起来走两步。四个番茄可以换一次长休，注意力是靠节奏撑住的。
      </div>
    </div>
  </div>
</div>
