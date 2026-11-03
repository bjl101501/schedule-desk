<script lang="ts">
  import type { ConfirmReq } from '$lib/store/overlay.svelte';
  import { pop } from '$lib/store/overlay.svelte';
  import ModalHead from './ModalHead.svelte';

  let { req }: { req: ConfirmReq } = $props();

  function ok(): void {
    const fn = req.onOk;
    pop();
    fn();
  }
</script>

<ModalHead title={req.title} onclose={() => pop()} />
<div class="m-body">
  <!-- 纯文本：desc 里会拼事项标题 / 清单名，不能当 HTML 标签解析 -->
  <div style="font-size:13px;color:var(--text-2);line-height:1.75;white-space:pre-wrap">{req.desc}</div>
</div>
<div class="m-foot">
  <div class="spacer"></div>
  <button class="btn btn-sec" onclick={() => pop()}>取消</button>
  <button class="btn {req.danger ? 'btn-danger' : 'btn-pri'}" onclick={ok}>{req.okText}</button>
</div>
