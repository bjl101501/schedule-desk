<script lang="ts">
  /* 子项：逐条录入 + 一键套用模板 + 合计校验 */
  import type { TaskForm } from './form.svelte';
  import { durText } from '$lib/domain/date';
  import { SUB_TPLS } from './form.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { prepareForm } from '$lib/actions/prepare-form';

  let { form }: { form: TaskForm } = $props();

  const named = $derived(form.subs.filter((x) => String(x.title || '').trim()).length);

  // 没有子项时收起，省掉一整屏空行；一旦有内容（含「用已有日程填充」套进来的）就自动展开
  let open = $state(false);
  $effect(() => {
    if (form.subs.length > 0) open = true;
  });

  function addFirst(): void {
    open = true;
    form.addSub();
  }
</script>

<section class="ed-sec">
  <div class="field">
    <label><Icon name="split" />子项<span class="hint" id="edSubHint">{form.planOn ? '拆成几段分别勾选；填「天」会自动按顺序排进计划' : '拆成几段分别勾选'}</span><span class="tip-i" tabindex="0" role="note" data-tip="把一件事拆成几个子项分别勾选；子项可以各自占用天数，逾期单独判定。">?</span></label>
    {#if !open}
      <div class="sub-edit-foot">
        <button class="chip-p" id="edSubAdd" onclick={addFirst}>＋ 添加子项</button>
        <span class="hint">还没添加子项</span>
      </div>
    {:else}
    <div class="sub-edit{form.planOn ? ' has-span' : ''}" id="edSubs">
      {#each form.subs as x, i (i)}
        <div class="sub-edit-row">
          <input class="inp sub-name" data-subt={i} bind:value={x.title} placeholder="子项名称，如 调研" use:prepareForm />
          <div class="sub-num">
            <input class="inp sub-minin" type="number" min="0" step="5" data-subm={i} bind:value={x.min} placeholder="分钟" title="这一项大概要花多少分钟，可留空" use:prepareForm />
            <span class="sub-unit">分</span>
          </div>
          <div class="sub-num">
            <input class="inp sub-dayin" type="number" min="0" max="365" step="1" data-subd={i} bind:value={x.days} placeholder="天" title="这一项排几天，可留空" use:prepareForm />
            <span class="sub-unit">天</span>
          </div>
          <button class="sub-del" data-subdel={i} title="删除这个子项" onclick={() => form.delSub(i)}><Icon name="close" /></button>
        </div>
      {/each}
    </div>
    <div class="sub-edit-foot">
      <button class="chip-p" id="edSubAdd" onclick={() => form.addSub()}>＋ 添加子项</button>
      <span class="hint" id="edSubSum">
        {#if named}
          共 <b>{named}</b> 项
          {#if form.subSum}· 合计 <b>{durText(form.subSum)}</b>{/if}
          {#if form.subDays}· 排期 <b>{form.subDays} 天</b>{/if}
        {:else}
          还没添加子项
        {/if}
      </span>
      <button class="chip-p{form.estMin !== form.subSum && form.subSum > 0 ? ' on' : ''}" id="edSubUseEst" style="display:{form.subSum > 0 && form.estMin !== form.subSum ? '' : 'none'}" onclick={() => form.useEst()}>同步为 {durText(form.subSum)}</button>
    </div>
    <div class="chip-pick" style="margin-top:3px">
      <span class="hint" style="align-self:center;margin-right:2px">模板</span>
      {#each SUB_TPLS as tp (tp.k)}
        <button class="chip-p" data-subtpl={tp.k} style="border-style:dashed" onclick={() => form.applyTpl(tp.k)}>{tp.t}</button>
      {/each}
    </div>
    {/if}
  </div>
</section>
