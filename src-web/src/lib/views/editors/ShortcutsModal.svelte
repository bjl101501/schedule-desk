<script lang="ts">
  import { uiState } from '$lib/store/ui.svelte';
  import ModalHead from '$lib/ui/ModalHead.svelte';

  const rows: [string, string][] = [
    ['Esc', '关掉最上层的弹窗或抽屉'],
    ['?', '打开这份快捷键说明'],
    ['N', '新建日程'],
    ['Ctrl+K / Ctrl+N', '快速添加（输入框里也生效）'],
    ['Ctrl+Z', '撤销上一步（输入框内是文字撤销）'],
    ['Ctrl+Shift+Z', '重做'],
    ['/', '搜索'],
    ['1 – 7', '今天 / 日历 / 四象限 / 习惯 / 纪念日 / 番茄 / 统计'],
    ['T', '回到「今天」'],
    ['Q', '四象限'],
    ['H', '习惯打卡'],
    ['C', '日历'],
    ['Ctrl+S', '在编辑器里保存']
  ];
</script>

<ModalHead title="快捷键" onclose={() => (uiState.shortcuts = false)} />
<div class="m-body">
  {#each rows as [k, v] (k)}
    <div class="sc-row"><kbd>{k}</kbd><span>{v}</span></div>
  {/each}
</div>
<div class="m-foot">
  <div class="spacer"></div>
  <button class="btn btn-sec" onclick={() => (uiState.shortcuts = false)}>知道了</button>
</div>
