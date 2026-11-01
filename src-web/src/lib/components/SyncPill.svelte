<script lang="ts">
  import { sync } from '$lib/store/sync.svelte';

  const cls = $derived('sync-pill' + (sync.mode === 'syncing' ? ' syncing' : sync.mode === 'offline' ? ' offline' : ''));
</script>

<div class={cls} id="syncPill" title={sync.text}>
  <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" /></svg>
  <span id="syncText">{sync.text}</span>
</div>
