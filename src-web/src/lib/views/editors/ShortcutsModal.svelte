<script lang="ts">
  import { uiState } from '$lib/store/ui.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  const rows: [string, string][] = [
    ['Esc', '关掉最上层的弹窗或抽屉'],
    ['?', '打开这份快捷键说明'],
    ['N', '新建日程'],
    ['Ctrl+K / Ctrl+N', '快速添加（输入框里也生效）'],
    ['/', '搜索'],
    ['1 – 7', '清单 / 日历 / 四象限 / 习惯 / 纪念日 / 番茄 / 统计'],
    ['T', '回到「今天」'],
    ['Q', '四象限'],
    ['H', '习惯打卡'],
    ['Ctrl+S', '在编辑器里保存']
  ];
</script>

<div class="m-head">
  <h3>快捷键</h3>
  <button class="m-close" onclick={() => (uiState.shortcuts = false)}><Icon name="close" /></button>
</div>
<div class="m-body">
  {#each rows as [k, v] (k)}
    <div class="sc-row"><kbd>{k}</kbd><span>{v}</span></div>
  {/each}
</div>
<div class="m-foot">
  <div class="spacer"></div>
  <button class="btn btn-sec" onclick={() => (uiState.shortcuts = false)}>知道了</button>
</div>
