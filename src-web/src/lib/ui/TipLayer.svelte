<script lang="ts">
  import { tip } from '$lib/store/tip.svelte';
</script>

<div class="tip-layer{tip.on ? ' in' : ''}" role="tooltip" style="left:{tip.left}px;top:{tip.top}px">{tip.text}</div>
