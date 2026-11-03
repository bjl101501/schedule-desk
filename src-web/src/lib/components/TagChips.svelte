<script lang="ts">
  /* 标签 chip：列表 / 卡片 / 看板 / 象限 / 详情共用同一套取色与写法。
     颜色从 domain/palette 的传统色里按名字取，同一标签在任何位置同色。 */
  import { tagColorFor } from '$lib/store/palette.svelte';

  let { tags, prefix = '#' }: { tags: readonly string[]; prefix?: string } = $props();
</script>

{#each tags as g (g)}
  {@const c = tagColorFor(g)}
  <span class="tag-chip" style="--tc:{c.hex}" title={'标签：' + g + ' · ' + c.name}>{prefix}{g}</span>
{/each}
