<script lang="ts">
  import { uiState } from '$lib/store/ui.svelte';
  import Icon from './Icon.svelte';
</script>

{#if uiState.confirm}
  {@const c = uiState.confirm}
  <div class="modal-mask in" onclick={(e) => { if (e.target === e.currentTarget) uiState.confirm = null; }}>
    <div class="modal sm">
      <div class="m-head">
        <h3>{c.title}</h3>
        <button class="m-close" onclick={() => (uiState.confirm = null)}><Icon name="close" /></button>
      </div>
      <div class="m-body">
        <div style="font-size:13px;color:var(--text-2);line-height:1.75">{@html c.desc}</div>
      </div>
      <div class="m-foot">
        <div class="spacer"></div>
        <button class="btn btn-sec" onclick={() => (uiState.confirm = null)}>取消</button>
        <button
          class="btn {c.danger ? 'btn-danger' : 'btn-pri'}"
          onclick={() => {
            const fn = c.onOk;
            uiState.confirm = null;
            fn();
          }}>{c.okText}</button
        >
      </div>
    </div>
  </div>
{/if}
