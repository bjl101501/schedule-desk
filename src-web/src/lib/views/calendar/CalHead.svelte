<script lang="ts">
  /* 日历工具条：返回键 / 标题 / 前后翻 / 今天 / 图例 / 显示范围 / 模式 */
  import type { CalMode } from '$lib/domain/types';
  import { app } from '$lib/store/app.svelte';
  import { calBack, calNav, calToday, setCalDays, setCalMode, setCalWeeks } from '$lib/store/calendarActions.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  let { title }: { title: string } = $props();

  const modes: { k: CalMode; t: string }[] = [
    { k: 'year', t: '年' },
    { k: 'month', t: '月' },
    { k: 'week', t: '周' },
    { k: 'multiweek', t: '多周' },
    { k: 'day', t: '日' },
    { k: 'multiday', t: '多日' }
  ];

  // 从周 / 多周 / 多日点进日视图后，按钮原来一律写「返回月视图」，点了却回周视图
  const backModeText: Record<string, string> = {
    year: '年',
    month: '月',
    week: '周',
    multiweek: '多周',
    day: '日',
    multiday: '多日'
  };
  const backText = $derived('返回' + (backModeText[app.calReturn?.mode || ''] || '上一') + '视图');
</script>

<div class="cal-head">
  {#if app.calReturn && (app.calMode === 'day' || app.calMode === 'month')}
    <button class="cal-back" data-calback onclick={calBack}><Icon name="chevL" />{backText}</button>
  {/if}
  <span class="cal-title">{title}</span>
  <div class="cal-nav">
    <button data-calnav="-1" aria-label="上一段" title="上一段" onclick={() => calNav(-1)}><Icon name="chevL" /></button>
    <button data-calnav="1" aria-label="下一段" title="下一段" onclick={() => calNav(1)}><Icon name="chevR" /></button>
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
