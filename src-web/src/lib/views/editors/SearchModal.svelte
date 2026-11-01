<script lang="ts">
  import { todayD } from '$lib/store/clock.svelte';
  import { data } from '$lib/store/data.svelte';
  import { app, setFilters } from '$lib/store/app.svelte';
  import { uiState, openTaskDetail } from '$lib/store/ui.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { prepareForm } from '$lib/actions/prepare-form';

  let kw = $state(app.filters.kw);
  const today = todayD();

  const rows = $derived.by(() => {
    const k = kw.trim().toLowerCase();
    if (!k) return [];
    return data.tasks
      .filter((t) => {
        const subTxt = (t.subs || []).map((x) => x.title).join(' ');
        return (t.title + ' ' + t.note + ' ' + t.tags.join(' ') + ' ' + t.list + ' ' + subTxt).toLowerCase().indexOf(k) > -1;
      })
      .slice(0, 30);
  });

  function close(): void {
    uiState.search = false;
  }

  function pick(id: string): void {
    close();
    openTaskDetail(id);
  }

  function applyFilter(): void {
    setFilters({ kw: kw.trim() });
    close();
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyFilter();
    }
  }
</script>

<div class="m-head">
  <h3>搜索</h3>
  <button class="m-close" onclick={close}><Icon name="close" /></button>
</div>
<div class="m-body">
  <div class="field">
    <input class="inp" id="searchKw" bind:value={kw} onkeydown={onKey} placeholder="搜标题、备注、标签、清单、子项" autofocus use:prepareForm />
  </div>
  {#if kw.trim()}
    <div style="display:flex;gap:8px;align-items:center">
      <button class="btn btn-sec btn-sm" onclick={applyFilter}>把「{kw.trim()}」作为筛选条件</button>
      <span class="hint">{rows.length} 条结果</span>
    </div>
    {#each rows as t (t.id)}
      <button class="tpl-row" onclick={() => pick(t.id)}>
        <span class="tpl-t">{t.title}</span>
        <span class="tpl-m">{t.date || '未安排'}{t.list ? ' · ' + t.list : ''}{t.done ? ' · 已完成' : ''}</span>
      </button>
    {/each}
  {:else}
    <div class="pick-menu-empty">输入关键词开始搜索。回车直接变成筛选条件。</div>
  {/if}
</div>
<div class="m-foot">
  <div class="spacer"></div>
  <button class="btn btn-sec" onclick={close}>关闭</button>
  <button class="btn btn-pri" onclick={applyFilter}>筛选</button>
</div>
