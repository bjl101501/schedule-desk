<script lang="ts">
  /*
    弹窗标题栏：返回键 / 标题 / 额外动作 / 关闭键。
    「能拖」这件事不在这里 —— modalShell 用事件委托认 .m-head，DOM 一致就行。
    actions 插槽用来放编辑器自己的按钮（例如「用已有日程填充」），仍在标题与关闭键之间。
  */
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  let {
    title,
    onclose,
    back,
    backId,
    actions
  }: {
    title: string;
    onclose?: () => void;
    back?: () => void;
    backId?: string;
    actions?: Snippet;
  } = $props();
</script>

<div class="m-head">
  {#if back}
    <button class="m-back" id={backId} title="返回详情" onclick={back}><Icon name="chevL" /></button>
  {/if}
  <h3>{title}</h3>
  {@render actions?.()}
  {#if onclose}
    <button class="m-close" aria-label="关闭" title="关闭" onclick={onclose}><Icon name="close" /></button>
  {/if}
</div>
