<script lang="ts">
  import type { PromptReq } from '$lib/store/overlay.svelte';
  import { pop } from '$lib/store/overlay.svelte';
  import Icon from './Icon.svelte';

  let { req }: { req: PromptReq } = $props();

  let input = $state<HTMLInputElement | null>(null);
  let val = $state(req.value);

  $effect(() => {
    const id = setTimeout(() => {
      input?.focus();
      input?.select();
    }, 60);
    return () => clearTimeout(id);
  });

  function submit(): void {
    const v = val.trim();
    if (!v) {
      input?.focus();
      return;
    }
    const fn = req.onOk;
    pop();
    fn(v);
  }
</script>

<div class="m-head">
  <h3>{req.title}</h3>
  <button class="m-close" onclick={() => pop()}><Icon name="close" /></button>
</div>
<div class="m-body">
  {#if req.label}<div style="font-size:12.5px;color:var(--text-2);line-height:1.7;margin-bottom:9px">{@html req.label}</div>{/if}
  <input
    class="inp"
    id="pmInput"
    bind:this={input}
    bind:value={val}
    placeholder={req.placeholder}
    style="height:42px;font-size:15px"
    onkeydown={(e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    }}
  />
</div>
<div class="m-foot">
  <div class="spacer"></div>
  <button class="btn btn-sec" id="pmCancel" onclick={() => pop()}>取消</button>
  <button class="btn btn-pri" id="pmOk" onclick={submit}>{req.okText}</button>
</div>
