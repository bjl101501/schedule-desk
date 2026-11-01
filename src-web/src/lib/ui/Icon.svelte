<script lang="ts">
  import { ICONS } from '$lib/domain/constants';

  let { name, cls = '', size }: { name: string; cls?: string; size?: number | string } = $props();
  const body = $derived(ICONS[name] || '');
  const box = $derived(size ? (typeof size === 'number' ? size + 'px' : size) : '1em');
</script>

<svg viewBox="0 0 24 24" width={box} height={box} class={cls} aria-hidden="true">{@html body}</svg>
