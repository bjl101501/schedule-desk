<script lang="ts">
  import type { TypedReq } from '$lib/store/overlay.svelte';
  import { pop } from '$lib/store/overlay.svelte';
  import Icon from './Icon.svelte';

  let { req }: { req: TypedReq } = $props();

  let input = $state<HTMLInputElement | null>(null);
  let val = $state('');
  const hit = $derived(val.trim() === req.word);

  $effect(() => {
    const id = setTimeout(() => input?.focus(), 80);
    return () => clearTimeout(id);
  });

  function ok(): void {
    if (!hit) return;
    const fn = req.onOk;
    pop();
    setTimeout(fn, 160);
  }
</script>

<div class="m-head">
  <h3>{req.title}</h3>
  <button class="m-close" onclick={() => pop()}><Icon name="close" /></button>
</div>
<div class="m-body">
  <div style="font-size:13px;color:var(--text-2);line-height:1.75">{@html req.desc}</div>
  <div class="field">
    <label>输入「{req.word}」确认<span class="hint">此操作无法撤销</span></label>
    <input class="inp" id="tcInput" bind:this={input} bind:value={val} placeholder={req.word} style="height:40px;font-size:15px" />
  </div>
</div>
<div class="m-foot">
  <div class="spacer"></div>
  <button class="btn btn-sec" id="tcCancel" onclick={() => pop()}>取消</button>
  <button class="btn btn-danger" id="tcOk" disabled={!hit} style="opacity:{hit ? 1 : 0.5}" onclick={ok}>确认删除</button>
</div>
