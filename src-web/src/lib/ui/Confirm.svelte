<script lang="ts">
  import type { ConfirmReq } from '$lib/store/overlay.svelte';
  import { pop } from '$lib/store/overlay.svelte';
  import Icon from './Icon.svelte';

  let { req }: { req: ConfirmReq } = $props();

  function ok(): void {
    const fn = req.onOk;
    pop();
    fn();
  }
</script>

<div class="m-head">
  <h3>{req.title}</h3>
  <button class="m-close" onclick={() => pop()}><Icon name="close" /></button>
</div>
<div class="m-body">
  <div style="font-size:13px;color:var(--text-2);line-height:1.75">{@html req.desc}</div>
</div>
<div class="m-foot">
  <div class="spacer"></div>
  <button class="btn btn-sec" onclick={() => pop()}>取消</button>
  <button class="btn {req.danger ? 'btn-danger' : 'btn-pri'}" onclick={ok}>{req.okText}</button>
</div>
