<script lang="ts">
  import type { Task } from '$lib/domain/types';
  import { quadKey, quadLabel } from '$lib/domain/task';
  import { quadGlyph } from '$lib/ui/glyph';

  let { t }: { t: Task } = $props();
  const q = $derived(quadKey(t));
</script>

<span class="flags">
  {#if t.prio}<span class="flag-p {String(t.prio).toLowerCase()}">{String(t.prio).toUpperCase()}</span>{/if}
  <span class="flag-q {q}" title={quadLabel(q)}>{@html quadGlyph(q)}</span>
</span>
