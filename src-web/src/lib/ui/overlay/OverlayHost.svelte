<script lang="ts">
  /*
    #modalRoot：按层栈顺序渲染，顺序即层级。
    mask 必须是 #modalRoot 的直接子元素 —— modalShell 靠事件委托找 closest('.modal-mask')，
    测试脚本也按 '#modalRoot .modal.floating' 取节点。
  */
  import { overlay, pop } from '$lib/store/overlay.svelte';
  import { modalShell } from '$lib/actions/modalShell';
  import { panelResize } from '$lib/actions/panelResize';
  import { SPEC } from './spec';
  import LayerBody from './LayerBody.svelte';

  let { panel = false }: { panel?: boolean } = $props();
</script>

<div class="modal-root" id="modalRoot" use:modalShell>
  {#each overlay.stack as o (o.uid)}
    {@const s = SPEC[o.kind]}
    {@const isPanel = s.panel && panel}
    {@const taskId = 'id' in o ? (o as { id?: string }).id : undefined}
    <div
      class="modal-mask in{isPanel ? ' panel' : ''}{s.stacked ? ' stacked' : ''}"
      data-task={s.taskAttr ? taskId : undefined}
      onclick={s.maskClose ? (e) => { if (e.target === e.currentTarget) pop(); } : undefined}
    >
      <div class="modal {s.modal}">
        {#if s.grip && isPanel}
          <div class="panel-grip" data-panelgrip use:panelResize></div>
        {/if}
        <LayerBody layer={o} />
      </div>
    </div>
  {/each}
</div>
