<script lang="ts">
  import type { Countdown } from '$lib/domain/types';
  import { dayDiff, pad2, parseYmd, today0 } from '$lib/domain/date';
  import { cdGroupOf } from '$lib/domain/task';
  import { orderNames } from '$lib/domain/selectors';
  import { clock } from '$lib/store/clock.svelte';
  import { data } from '$lib/store/data.svelte';
  import { meta } from '$lib/store/meta.svelte';
  import { uiState } from '$lib/store/ui.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  const tick = $derived(clock.now);

  function nextOccur(cd: Countdown): Date {
    const d = parseYmd(cd.date);
    if (!d) return new Date();
    if (cd.type === '倒数日') return d;
    const now = today0();
    let cand = new Date(now.getFullYear(), d.getMonth(), d.getDate());
    if (cand < now) cand = new Date(now.getFullYear() + 1, d.getMonth(), d.getDate());
    return cand;
  }

  function darken(hex: string): string {
    let h = String(hex || '#177CB0').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const r = Math.max(0, parseInt(h.slice(0, 2), 16) - 42);
    const g = Math.max(0, parseInt(h.slice(2, 4), 16) - 42);
    const b = Math.max(0, parseInt(h.slice(4, 6), 16) - 42);
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  const groups = $derived.by(() => {
    void tick;
    const t0 = today0();
    const all = data.countdowns.slice().sort((a, b) => nextOccur(a).getTime() - nextOccur(b).getTime());
    const map: Record<string, Countdown[]> = {};
    const names: string[] = [];
    all.forEach((cd) => {
      const g = cdGroupOf(cd);
      if (!map[g]) {
        map[g] = [];
        names.push(g);
      }
      map[g].push(cd);
    });
    const ordered = orderNames(names, meta.cdGroupOrder);
    const first = all[0];
    return {
      all,
      t0,
      note: first
        ? '共 <b>' + all.length + '</b> 个日子 · 最近「' + first.name + '」' +
          (dayDiff(t0, nextOccur(first)) === 0
            ? '就是今天'
            : dayDiff(t0, nextOccur(first)) > 0
              ? '还有 <b>' + dayDiff(t0, nextOccur(first)) + '</b> 天'
              : '已过去 ' + Math.abs(dayDiff(t0, nextOccur(first))) + ' 天')
        : '共 ' + all.length + ' 个日子',
      groups: ordered.map((g) => {
        const list = map[g].slice().sort((a, b) => nextOccur(a).getTime() - nextOccur(b).getTime());
        const soon = list[0];
        const sdiff = soon ? dayDiff(t0, nextOccur(soon)) : 0;
        return { name: g, list, sdiff, hasSoon: !!soon };
      })
    };
  });

  function edit(id: string): void {
    uiState.cdEditor = { id };
  }
</script>

{#if !data.countdowns.length}
  <div class="empty">
    <div class="empty-ico"><Icon name="heart" /></div>
    <h4>还没有纪念日</h4>
    <p>生日、纪念日、旅行出发日… 把重要的日子放进来，不再错过。</p>
    <button data-cdadd onclick={() => edit('')}>+ 添加纪念日</button>
  </div>
{:else}
  <div class="view-bar">
    <button class="btn btn-pri view-add" data-cdadd onclick={() => edit('')}><Icon name="plus" />添加纪念日</button>
    <div class="view-note">{@html groups.note} · 拖动分组标题可调整顺序</div>
  </div>
  <div class="cd-grid cd-flat">
    {#each groups.groups as g (g.name)}
      <div class="cdgroup" data-cdgroup={g.name}>
        <div class="cdgroup-head" data-cdgh={g.name}>
          <span class="cdg-drag"><Icon name="drag" /></span>
          <h3>{g.name}</h3>
          <span class="cdg-cnt">{g.list.length}</span>
          <span class="cdg-line"></span>
          {#if g.hasSoon}
            <span class="cdg-next">{g.sdiff >= 0 ? '还有 ' + g.sdiff + ' 天' : '已过 ' + Math.abs(g.sdiff) + ' 天'}</span>
          {/if}
        </div>
        {#each g.list as cd (cd.id || cd.sys)}
          {@const next = nextOccur(cd)}
          {@const diff = dayDiff(groups.t0, next)}
          {@const isRepeat = cd.type !== '倒数日'}
          {@const label = diff === 0 ? '就是今天' : diff > 0 ? '还有' : '已过去'}
          <div
            class="cdcard{cd.sys === 'holiday' ? ' cd-holiday' : ''}"
            data-cid={cd.id || (cd.sys ? 'sys:' + cd.sys : '')}
            style="background:linear-gradient(135deg,{cd.color},{darken(cd.color)})"
            onclick={() => edit(cd.id)}
          >
            {#if cd.sys === 'holiday'}
              <span class="cd-ribbon">{(cd.note || '').indexOf('预估') > -1 ? '预估' : 'API'}</span>
            {/if}
            <div class="cdn">{cd.name}<small>{cd.type}{isRepeat ? ' · 每年' : ''}</small></div>
            <div class="cdv"><b>{Math.abs(diff)}</b><span>天 · {label}</span></div>
            <div class="cdfoot">{next.getFullYear()}-{pad2(next.getMonth() + 1)}-{pad2(next.getDate())}{cd.note ? ' · ' + cd.note : ''}</div>
          </div>
        {/each}
      </div>
    {/each}
  </div>
{/if}
