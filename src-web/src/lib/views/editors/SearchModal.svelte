<script lang="ts">
  import { data } from '$lib/store/data.svelte';
  import { matchTaskKw } from '$lib/domain/selectors';
  import { app, setFilters } from '$lib/store/app.svelte';
  import { uiState, openTaskDetail } from '$lib/store/ui.svelte';
  import ModalHead from '$lib/ui/ModalHead.svelte';
  import { prepareForm } from '$lib/actions/prepare-form';

  let kw = $state(app.filters.kw);
  let activeIdx = $state(-1);

  const rows = $derived.by(() => {
    const k = kw.trim();
    if (!k) return [];
    return data.tasks.filter((t) => matchTaskKw(t, k)).slice(0, 30);
  });

  $effect(() => {
    void kw;
    activeIdx = -1;
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
    if (e.key === 'ArrowDown' && rows.length) {
      e.preventDefault();
      activeIdx = activeIdx < rows.length - 1 ? activeIdx + 1 : 0;
      return;
    }
    if (e.key === 'ArrowUp' && rows.length) {
      e.preventDefault();
      activeIdx = activeIdx > 0 ? activeIdx - 1 : rows.length - 1;
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0 && rows[activeIdx]) {
        pick(rows[activeIdx].id);
      } else {
        applyFilter();
      }
    }
  }
</script>

<ModalHead title="搜索" onclose={close} />
<div class="m-body">
  <div class="field">
    <input class="inp" id="searchKw" bind:value={kw} onkeydown={onKey} placeholder="搜标题、备注、标签、清单、子项" autofocus use:prepareForm />
  </div>
  {#if kw.trim()}
    <div style="display:flex;gap:8px;align-items:center">
      <button class="btn btn-sec btn-sm" onclick={applyFilter}>把「{kw.trim()}」作为筛选条件</button>
      <span class="hint">{rows.length} 条结果{#if rows.length} · ↑↓ 选行回车打开{/if}</span>
    </div>
    {#if rows.length}
      {#each rows as t, i (t.id)}
        <button class="tpl-row{i === activeIdx ? ' on' : ''}" onmouseenter={() => (activeIdx = i)} onclick={() => pick(t.id)}>
          <span class="tpl-t">{t.title}</span>
          <span class="tpl-m">{t.date || '未安排'}{t.list ? ' · ' + t.list : ''}{t.done ? ' · 已完成' : ''}</span>
        </button>
      {/each}
    {:else}
      <div class="sc-empty">没有匹配「{kw.trim()}」的日程。换个词，或直接按回车把它当作筛选条件。</div>
    {/if}
  {:else}
    <div class="pick-menu-empty">输入关键词开始搜索。回车直接变成筛选条件。</div>
  {/if}
</div>
<div class="m-foot">
  <div class="spacer"></div>
  <button class="btn btn-sec" onclick={close}>关闭</button>
  <button class="btn btn-pri" onclick={applyFilter}>筛选</button>
</div>
