<script lang="ts">
  import { modalState, closeModal, isPanelWanted } from '$lib/store/modal.svelte';
</script>

{#each modalState.stack as entry (entry.id)}
  {@const panel = isPanelWanted(entry.wide)}
  {@const Comp = entry.comp}
  <div
    class="modal-mask{panel ? ' panel' : ''}{entry.stacked ? ' stacked' : ''}{entry.closing ? '' : ' in'}"
    onclick={(e) => {
      if (e.target === e.currentTarget && entry.maskClose) closeModal(entry.id);
    }}
  >
    <div class="modal{entry.wide ? ' wide' : ''}{entry.cls ? ' ' + entry.cls : ''}">
      <Comp {...entry.props} />
    </div>
  </div>
{/each}
