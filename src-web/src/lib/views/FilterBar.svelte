<script lang="ts">
  import type { Filters } from '$lib/domain/types';
  import { app, setFilters } from '$lib/store/app.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  const chips = $derived.by(() => {
    const f = app.filters;
    const out: { k: keyof Filters | 'all'; t: string }[] = [];
    if (f.prio.length) out.push({ k: 'prio', t: '优先级 ' + f.prio.join('/') });
    if (f.tags.length) out.push({ k: 'tags', t: '标签 ' + f.tags.map((x) => '#' + x).join(' ') });
    if (f.status !== 'todo') out.push({ k: 'status', t: f.status === 'done' ? '只看已完成' : '全部事项' });
    if (f.from) out.push({ k: 'from', t: '从 ' + f.from });
    if (f.to) out.push({ k: 'to', t: '到 ' + f.to });
    if (f.kw) out.push({ k: 'kw', t: '搜索「' + f.kw + '」' });
    return out;
  });

  function clear(k: string): void {
    if (k === 'all') {
      setFilters({ prio: [], tags: [], status: 'todo', from: '', to: '', kw: '' });
      return;
    }
    if (k === 'prio') setFilters({ prio: [] });
    else if (k === 'tags') setFilters({ tags: [] });
    else if (k === 'status') setFilters({ status: 'todo' });
    else if (k === 'from') setFilters({ from: '' });
    else if (k === 'to') setFilters({ to: '' });
    else if (k === 'kw') setFilters({ kw: '' });
  }
</script>

{#if chips.length}
  <div class="filter-bar">
    {#each chips as c (c.k)}
      <span class="fchip">{c.t}<button data-clear={c.k} onclick={() => clear(c.k)}><Icon name="close" /></button></span>
    {/each}
    <button class="fchip" style="background:var(--line-2);color:var(--text-2)" data-clear="all" onclick={() => clear('all')}>
      清除全部
    </button>
  </div>
{/if}
