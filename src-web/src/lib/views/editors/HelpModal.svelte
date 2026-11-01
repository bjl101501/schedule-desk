<script lang="ts">
  import { uiState } from '$lib/store/ui.svelte';
  import ModalHead from '$lib/ui/ModalHead.svelte';
</script>

<ModalHead title="使用说明" onclose={() => (uiState.help = false)} />
<div class="m-body">
  <div class="field">
    <label>数据放在哪</label>
    <div style="font-size:13px;color:var(--text-2);line-height:1.9">
      所有内容只写在本机的 <b>schedule.json</b>，另有每日快照（最多 7 份）。
      换机器时把整个数据目录拷走即可；也可以在「备份」里导出 JSON。
    </div>
  </div>
  <div class="field">
    <label>提醒怎么响</label>
    <div style="font-size:13px;color:var(--text-2);line-height:1.9">
      到点由 Windows 原生通知弹出，默认常驻不自动消失；开「专注助手」时可能只进通知中心。
      关闭窗口是最小化到托盘，真正退出用托盘菜单。
    </div>
  </div>
  <div class="field">
    <label>跨天日程</label>
    <div style="font-size:13px;color:var(--text-2);line-height:1.9">
      勾「计划」并选结束日期即可。结束时间留空表示到结束日 24:00；
      逾期从结束时刻算起，不是从开始时间算。
    </div>
  </div>
  <div class="field">
    <label>更新</label>
    <div style="font-size:13px;color:var(--text-2);line-height:1.9">
      在「设置 → 软件更新」里检查；发现新版本会直接替换程序文件并重启。
    </div>
  </div>
</div>
<div class="m-foot">
  <div class="spacer"></div>
  <button class="btn btn-sec" onclick={() => (uiState.help = false)}>关闭</button>
</div>
