<script lang="ts">
  import type { Task } from '$lib/domain/types';
  import { stateChip } from '$lib/domain/chips';
  import { clock } from '$lib/store/clock.svelte';

  let { t }: { t: Task } = $props();
  const chip = $derived(stateChip(t, clock.now));
</script>

{#if chip}
  <span class="m state-chip state-{chip.tone}" data-state-id={t.id}>{chip.label}</span>
{/if}
