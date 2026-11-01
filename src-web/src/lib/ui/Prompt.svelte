<script lang="ts">
  import { uiState } from '$lib/store/ui.svelte';
  import Icon from './Icon.svelte';

  let input = $state<HTMLInputElement | null>(null);
  let val = $state('');

  $effect(() => {
    if (uiState.prompt) {
      val = uiState.prompt.value;
      setTimeout(() => {
        try {
          input?.focus();
          input?.select();
        } catch {
          /* ignore */
        }
      }, 60);
    }
  });

  function submit(): void {
    if (!uiState.prompt) return;
    const v = val.trim();
    if (!v) {
      input?.focus();
      return;
    }
    const fn = uiState.prompt.onOk;
    uiState.prompt = null;
    fn(v);
  }
</script>

{#if uiState.prompt}
  {@const p = uiState.prompt}
  <div class="modal-mask in" onclick={(e) => { if (e.target === e.currentTarget) uiState.prompt = null; }}>
    <div class="modal sm">
      <div class="m-head">
        <h3>{p.title}</h3>
        <button class="m-close" onclick={() => (uiState.prompt = null)}><Icon name="close" /></button>
      </div>
      <div class="m-body">
        {#if p.label}<div style="font-size:12.5px;color:var(--text-2);line-height:1.7;margin-bottom:9px">{@html p.label}</div>{/if}
        <input class="inp" id="pmInput" bind:this={input} bind:value={val} placeholder={p.placeholder} style="height:42px;font-size:15px" onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }} />
      </div>
      <div class="m-foot">
        <div class="spacer"></div>
        <button class="btn btn-sec" id="pmCancel" onclick={() => (uiState.prompt = null)}>取消</button>
        <button class="btn btn-pri" id="pmOk" onclick={submit}>{p.okText}</button>
      </div>
    </div>
  </div>
{/if}
