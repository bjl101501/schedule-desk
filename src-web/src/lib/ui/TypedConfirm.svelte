<script lang="ts">
  import { uiState } from '$lib/store/ui.svelte';
  import Icon from './Icon.svelte';

  let input = $state<HTMLInputElement | null>(null);
  let val = $state('');
  const hit = $derived(!!uiState.typed && val.trim() === uiState.typed.word);

  $effect(() => {
    if (uiState.typed) {
      val = '';
      setTimeout(() => {
        try {
          input?.focus();
        } catch {
          /* ignore */
        }
      }, 80);
    }
  });

  function ok(): void {
    if (!uiState.typed || !hit) return;
    const fn = uiState.typed.onOk;
    uiState.typed = null;
    setTimeout(fn, 160);
  }
</script>

{#if uiState.typed}
  {@const t = uiState.typed}
  <div class="modal-mask in" onclick={(e) => { if (e.target === e.currentTarget) uiState.typed = null; }}>
    <div class="modal sm">
      <div class="m-head">
        <h3>{t.title}</h3>
        <button class="m-close" onclick={() => (uiState.typed = null)}><Icon name="close" /></button>
      </div>
      <div class="m-body">
        <div style="font-size:13px;color:var(--text-2);line-height:1.75">{@html t.desc}</div>
        <div class="field">
          <label>输入「{t.word}」确认<span class="hint">此操作无法撤销</span></label>
          <input class="inp" id="tcInput" bind:this={input} bind:value={val} placeholder={t.word} style="height:40px;font-size:15px" />
        </div>
      </div>
      <div class="m-foot">
        <div class="spacer"></div>
        <button class="btn btn-sec" id="tcCancel" onclick={() => (uiState.typed = null)}>取消</button>
        <button class="btn btn-danger" id="tcOk" disabled={!hit} style="opacity:{hit ? 1 : 0.5}" onclick={ok}>确认删除</button>
      </div>
    </div>
  </div>
{/if}
