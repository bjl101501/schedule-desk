<script lang="ts">
  import { PRIOS } from '$lib/domain/constants';
  import { allTags } from '$lib/domain/selectors';
  import { app, setFilters } from '$lib/store/app.svelte';
  import { data } from '$lib/store/data.svelte';
  import { meta } from '$lib/store/meta.svelte';
  import { uiState } from '$lib/store/ui.svelte';
  import DateField from '$lib/ui/DateField.svelte';
  import ModalHead from '$lib/ui/ModalHead.svelte';
  import { prepareForm } from '$lib/actions/prepare-form';

  let prio = $state<string[]>([...app.filters.prio]);
  let tags = $state<string[]>([...app.filters.tags]);
  let status = $state(app.filters.status);
  let from = $state(app.filters.from);
  let to = $state(app.filters.to);
  let kw = $state(app.filters.kw);

  const all = $derived(allTags(data.tasks, meta.customTags, meta.tagOrder));

  function togglePrio(p: string): void {
    prio = prio.indexOf(p) > -1 ? prio.filter((x) => x !== p) : [...prio, p];
  }

  function toggleTag(g: string): void {
    tags = tags.indexOf(g) > -1 ? tags.filter((x) => x !== g) : [...tags, g];
  }

  function close(): void {
    uiState.filter = false;
  }

  function apply(): void {
    setFilters({ prio, tags, status, from, to, kw });
    close();
  }

  function reset(): void {
    prio = [];
    tags = [];
    status = 'todo';
    from = '';
    to = '';
    kw = '';
  }
</script>

<ModalHead title="筛选" onclose={close} />
<div class="m-body">
  <div class="field">
    <label>优先级</label>
    <div class="chip-pick">
      {#each PRIOS as p (p)}
        <button class="chip-p{prio.indexOf(p) > -1 ? ' on' : ''}" data-fprio={p} onclick={() => togglePrio(p)}>{p}</button>
      {/each}
      <button class="chip-p{prio.indexOf('none') > -1 ? ' on' : ''}" onclick={() => togglePrio('none')}>无</button>
    </div>
  </div>
  <div class="field">
    <label>标签</label>
    <div class="chip-pick">
      {#if all.length}
        {#each all as g (g)}
          <button class="chip-p{tags.indexOf(g) > -1 ? ' on' : ''}" data-ftag={g} onclick={() => toggleTag(g)}>#{g}</button>
        {/each}
      {:else}
        <span class="hint">还没有标签</span>
      {/if}
    </div>
  </div>
  <div class="field">
    <label>状态</label>
    <div class="seg" id="stStatus">
      <button class={status === 'todo' ? 'on' : ''} onclick={() => (status = 'todo')}>未完成</button>
      <button class={status === 'done' ? 'on' : ''} onclick={() => (status = 'done')}>已完成</button>
      <button class={status === 'all' ? 'on' : ''} onclick={() => (status = 'all')}>全部</button>
    </div>
  </div>
  <div class="field">
    <label>关键词<span class="hint">标题 / 备注 / 标签 / 子项</span></label>
    <input class="inp" id="ftKw" bind:value={kw} placeholder="输入关键词" use:prepareForm />
  </div>
  <div class="row2">
    <div class="field"><label>起始日期</label><DateField fieldId="fFrom" bind:value={from} placeholder="不限" /></div>
    <div class="field"><label>截止日期</label><DateField fieldId="fTo" bind:value={to} placeholder="不限" /></div>
  </div>
</div>
<div class="m-foot">
  <button class="btn btn-sec btn-sm" onclick={reset}>重置</button>
  <div class="spacer"></div>
  <button class="btn btn-sec" onclick={close}>取消</button>
  <button class="btn btn-pri" id="filterApply" onclick={apply}>应用筛选</button>
</div>
