<script lang="ts">
  /* 清单、标签、优先级、四象限 */
  import type { TaskForm } from './form.svelte';
  import { PRIO_LABEL } from '$lib/domain/constants';
  import { quadName } from '$lib/domain/chips';
  import TagInput from '$lib/ui/TagInput.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { prepareForm } from '$lib/actions/prepare-form';

  let { form }: { form: TaskForm } = $props();
  let listMenu = $state(false);

  const suggestions = $derived.by(() => form.tagNames());
  const listOptions = $derived.by(() => form.listNames());
</script>

<section class="ed-sec">
  <div class="ed-sec-t">清单与标签</div>
  <div class="field">
    <label>清单<span class="tip-i" tabindex="0" role="note" data-tip="给日程归类。左侧清单栏可以按清单查看。">?</span></label>
    <div class="pick-row list-row">
      <input class="inp" id="edList" bind:value={form.list} placeholder="收集箱" use:prepareForm />
      <button type="button" class="inp pick-multi pick-compact{listMenu ? ' open' : ''}" id="edListPick" onclick={() => (listMenu = !listMenu)}>
        <span>选已有</span><i class="pm-c"><Icon name="chevD" /></i>
      </button>
      <button class="chip-p" data-picklist="__new" style="border-style:dashed" onclick={() => { form.list = ''; }}>＋ 新建</button>
    </div>
    {#if listMenu}
      <div class="pick-menu single" style="position:static;margin-top:6px;width:auto;box-shadow:none">
        {#if listOptions.length}
          {#each listOptions as nm (nm)}
            <button type="button" class="pick-opt{form.list === nm ? ' on' : ''}" data-pickv={nm} onclick={() => { form.list = nm; listMenu = false; }}>
              <i class="pick-box">{form.list === nm ? '✓' : ''}</i><span>{nm}</span>
            </button>
          {/each}
        {:else}
          <div class="pick-menu-empty">还没有清单。点右边的「＋ 新建」建一个。</div>
        {/if}
      </div>
    {/if}
  </div>
  <div class="field">
    <label>标签<span class="hint">空格或回车分隔</span><span class="tip-i" tabindex="0" role="note" data-tip="支持空格、回车、逗号分隔，可以一次粘贴多个标签。">?</span></label>
    <TagInput bind:value={form.tags} {suggestions} />
  </div>
</section>

<section class="ed-sec">
  <div class="ed-sec-t">优先级</div>
  <div class="field">
    <label>优先级<span class="tip-i" tabindex="0" role="note" data-tip="P0 最高、P3 最低，只影响排序和左侧色条。">?</span></label>
    <div class="chip-pick" id="edPrio">
      {#each ['P0', 'P1', 'P2', 'P3'] as p (p)}
        <button class="chip-p{p === 'P0' ? ' red' : ''}{form.prio === p ? ' on' : ''}" data-prio={p} onclick={() => (form.prio = p)}>{p} · {PRIO_LABEL[p]}</button>
      {/each}
      <button class="chip-p{!form.prio ? ' on' : ''}" data-prio="" onclick={() => (form.prio = '')}>无</button>
    </div>
  </div>
  <div class="field">
    <label>四象限<span class="tip-i" tabindex="0" role="note" data-tip="重要 × 紧急，只影响「四象限」视图的分组。">?</span></label>
    <div class="chip-pick">
      <button class="chip-p{form.important ? ' on' : ''}" data-imp="1" onclick={() => (form.important = !form.important)}>{form.important ? '✓ ' : ''}重要</button>
      <button class="chip-p{form.urgent ? ' on' : ''}" data-urg="1" onclick={() => (form.urgent = !form.urgent)}>{form.urgent ? '✓ ' : ''}紧急</button>
      <span class="hint" style="align-self:center">{quadName(form.important, form.urgent)}</span>
    </div>
  </div>
</section>
