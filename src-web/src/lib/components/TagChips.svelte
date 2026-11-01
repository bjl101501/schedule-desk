<script lang="ts">
  /* 标签 chip：列表 / 卡片 / 看板 / 象限 / 详情共用同一套取色与写法 */
  import { TAG_COLORS } from '$lib/domain/constants';
  import { tagColor as tagColorOf } from '$lib/domain/date';

  let { tags, prefix = '#' }: { tags: readonly string[]; prefix?: string } = $props();
</script>

{#each tags as g (g)}<span class="tag-chip {tagColorOf(g, TAG_COLORS)}">{prefix}{g}</span>{/each}
