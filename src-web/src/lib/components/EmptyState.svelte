<script lang="ts">
  /* 空态：图标 + 标题 + 一句说明 + 一个主操作 */
  import type { Snippet } from 'svelte';
  import Icon from '$lib/ui/Icon.svelte';

  let { icon, title, text, action }: { icon: string; title: string; text: string; action?: Snippet } = $props();
</script>

<div class="empty">
  <div class="empty-ico"><Icon name={icon} /></div>
  <h4>{title}</h4>
  <p>{text}</p>
  {@render action?.()}
</div>
