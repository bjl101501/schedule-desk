<script lang="ts">
  /*
    颜色圆点单选。attr 是测试脚本认的属性后缀（cdcolor / hcolor），
    保持和旧版 DOM 一致，样式内联不落地到全局表。
  */
  import { LIST_COLORS } from '$lib/domain/constants';

  let {
    value = $bindable(),
    attr,
    colors = LIST_COLORS
  }: { value: string; attr: string; colors?: readonly string[] } = $props();
</script>

<div class="chip-pick">
  {#each colors as c (c)}
    <button
      {...{ ['data-' + attr]: c }}
      style="width:28px;height:28px;border-radius:50%;background:{c};border:3px solid {value === c ? 'var(--panel)' : 'transparent'};box-shadow:0 0 0 {value === c ? '2px ' + c : '0 transparent'}"
      onclick={() => (value = c)}
    ></button>
  {/each}
</div>
