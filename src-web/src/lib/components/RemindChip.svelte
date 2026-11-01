<script lang="ts">
  import type { Task } from '$lib/domain/types';
  import { remindChip } from '$lib/domain/chips';
  import { clock } from '$lib/store/clock.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  let { t }: { t: Task } = $props();
  const chip = $derived(remindChip(t, clock.now));
</script>

{#if chip}
  <span class="m due-remind {chip.cls}" data-remind-id={t.id}><Icon name="bell" />{chip.text}</span>
{/if}
