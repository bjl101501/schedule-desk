<script lang="ts">
  import type { TypedReq } from '$lib/store/overlay.svelte';
  import { pop } from '$lib/store/overlay.svelte';
  import ModalHead from './ModalHead.svelte';

  let { req }: { req: TypedReq } = $props();

  let input = $state<HTMLInputElement | null>(null);
  let val = $state('');
  const hit = $derived(val.trim() === req.word);
  const okText = $derived(req.okText || '确认');
  const danger = $derived(req.danger !== false);
  const hint = $derived(req.hint || '此操作无法撤销');

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

<ModalHead title={req.title} onclose={() => pop()} />
<div class="m-body">
  <div style="font-size:13px;color:var(--text-2);line-height:1.75;white-space:pre-wrap">{req.desc}</div>
  <div class="field">
    <label>输入「{req.word}」确认<span class="hint">{hint}</span></label>
    <input class="inp" id="tcInput" bind:this={input} bind:value={val} placeholder={req.word} style="height:40px;font-size:15px" />
  </div>
</div>
<div class="m-foot">
  <div class="spacer"></div>
  <button class="btn btn-sec" id="tcCancel" onclick={() => pop()}>取消</button>
  <button class="btn {danger ? 'btn-danger' : 'btn-pri'}" id="tcOk" disabled={!hit} style="opacity:{hit ? 1 : 0.5}" onclick={ok}>{okText}</button>
</div>
