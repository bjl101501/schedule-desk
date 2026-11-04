<script lang="ts">
  import type { Countdown } from '$lib/domain/types';
  import { dayDiff, pad2, parseYmd } from '$lib/domain/date';
  import { cdGroupOf } from '$lib/domain/task';
  import { orderNames } from '$lib/domain/selectors';
  import { todayD } from '$lib/store/clock.svelte';
  import { data } from '$lib/store/data.svelte';
  import { meta } from '$lib/store/meta.svelte';
  import { uiState } from '$lib/store/ui.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { pointerDrag, hitAt } from '$lib/actions/drag';
  import { beginDrag, type DragFx } from '$lib/actions/dragFx';
  import { setCdGroupOrder } from '$lib/store/meta.svelte';
  import { beginDragSession, endDragSession } from '$lib/store/dragSession.svelte';

  const t0 = $derived(todayD());

  function nextOccur(cd: Countdown, now: Date = t0): Date {
    const d = parseYmd(cd.date);
    if (!d) return new Date();
    if (cd.type === '倒数日') return d;
    let cand = new Date(now.getFullYear(), d.getMonth(), d.getDate());
    if (cand < now) cand = new Date(now.getFullYear() + 1, d.getMonth(), d.getDate());
    return cand;
  }

  let fx: DragFx | null = null;

  function onGroupEnd(el: HTMLElement, e: PointerEvent, moved: boolean): void {
    endDragSession();
    el.closest('.cdgroup')?.classList.remove('dragging');
    fx?.end();
    fx = null;
    if (!moved) return;
    const hit = hitAt(e, '[data-cdgh]');
    const from = el.getAttribute('data-cdgh') || '';
    const to = hit?.getAttribute('data-cdgh') || '';
    if (!hit || !from || !to || from === to) return;
    const order = groups.groups.map((g) => g.name);
    const a = order.indexOf(from);
    const b = order.indexOf(to);
    if (a < 0 || b < 0) return;
    order.splice(a, 1);
    order.splice(b, 0, from);
    setCdGroupOrder(order);
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
    const now = t0;
    const all = data.countdowns.slice().sort((a, b) => nextOccur(a, now).getTime() - nextOccur(b, now).getTime());
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
    const firstDiff = first ? dayDiff(now, nextOccur(first, now)) : 0;
    return {
      all,
      t0: now,
      first,
      firstDiff,
      groups: ordered.map((g) => {
        const list = map[g].slice().sort((a, b) => nextOccur(a, now).getTime() - nextOccur(b, now).getTime());
        const soon = list[0];
        const sdiff = soon ? dayDiff(now, nextOccur(soon, now)) : 0;
        return { name: g, list, sdiff, hasSoon: !!soon };
      })
    };
  });

  function edit(id: string): void {
    uiState.cdEditor = { id };
  }
</script>

{#if !data.countdowns.length}
  <EmptyState icon="heart" title="还没有纪念日" text="生日、纪念日、旅行出发日… 把重要的日子放进来，不再错过。">
    {#snippet action()}
      <button data-cdadd onclick={() => edit('')}>+ 添加纪念日</button>
    {/snippet}
  </EmptyState>
{:else}
  <div class="view-bar">
    <button class="btn btn-pri view-add" data-cdadd onclick={() => edit('')}><Icon name="plus" />添加纪念日</button>
    <div class="view-note">
      {#if groups.first}
        共 <b>{groups.all.length}</b> 个日子 · 最近「{groups.first.name}」{#if groups.firstDiff === 0}就是今天{:else if groups.firstDiff > 0}还有 <b>{groups.firstDiff}</b> 天{:else}已过去 {Math.abs(groups.firstDiff)} 天{/if} · 拖动分组标题可调整顺序
      {:else}
        共 {groups.all.length} 个日子 · 拖动分组标题可调整顺序
      {/if}
    </div>
  </div>
  <div
  class="cd-grid cd-flat"
  use:pointerDrag={{
    handle: '[data-cdgh]',
    slop: 8,
    holdMs: 160,
    onStart: (el, _e, origin) => {
      beginDragSession();
      el.closest('.cdgroup')?.classList.add('dragging');
      fx = beginDrag({ source: el.closest('.cdgroup') as HTMLElement, at: origin, scrollEl: () => document.getElementById('content') });
    },
    onMove: (el, e) => {
      if (!fx) return;
      const hit = hitAt(e, '[data-cdgh]');
      const same = hit && hit !== el;
      fx.move(e);
      fx.mark(same ? (hit.closest('.cdgroup') as HTMLElement) : null, 'insert-l', same ? '松手放到「' + (hit.textContent || '').trim().slice(0, 8) + '」之前' : '');
      if (same) hit.closest('.cdgroup')?.classList.add('drop-before');
    },
    onEnd: onGroupEnd
  }}
>
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
          >
            {#if cd.sys === 'holiday'}
              <span class="cd-ribbon">{(cd.note || '').indexOf('预估') > -1 ? '预估' : 'API'}</span>
            {/if}
            <div class="cdn">
              <span class="cdn-name">{cd.name}<button class="cd-edit" data-cdedit={cd.id || (cd.sys ? 'sys:' + cd.sys : '')} title="编辑纪念日" onclick={() => edit(cd.id)}><Icon name="edit" /></button></span>
              <small>{cd.type}{isRepeat ? ' · 每年' : ''}</small>
            </div>
            <div class="cdv"><b>{Math.abs(diff)}</b><span>天 · {label}</span></div>
            <div class="cdfoot">{next.getFullYear()}-{pad2(next.getMonth() + 1)}-{pad2(next.getDate())}{cd.note ? ' · ' + cd.note : ''}</div>
          </div>
        {/each}
      </div>
    {/each}
  </div>
{/if}
