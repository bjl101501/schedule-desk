<script lang="ts">
  import { onMount } from 'svelte';
  import { chooseDataDirQuiet, defaultDataDir, finishOnboarding, restartApp } from '$lib/bridge/desktop';
  import { toast } from '$lib/store/toast.svelte';

  let dir = $state('');
  let busy = $state(false);

  onMount(async () => {
    dir = await defaultDataDir();
  });

  async function pick(): Promise<void> {
    const r = await chooseDataDirQuiet();
    if (r.ok && r.dir) dir = r.dir;
  }

  async function start(): Promise<void> {
    if (busy) return;
    busy = true;
    const r = await finishOnboarding(dir);
    if (r.ok) {
      toast.show('正在启动…');
      setTimeout(() => restartApp(), 600);
    } else {
      busy = false;
      toast.show(r.error || r.__error || '设置失败');
    }
  }
</script>

<div class="modal-mask in" id="sdOnboard" style="z-index:99999;background:var(--bg)">
  <div class="modal" style="max-width:560px">
    <div class="m-head"><h3>欢迎使用日程台</h3></div>
    <div class="m-body">
      <div style="font-size:13.5px;color:var(--text-2);line-height:1.9">
        数据全部保存在本机一个 <b>schedule.json</b> 里，断网也能用。
        先选一个存放目录；不确定就用默认位置（`%APPDATA%\\ScheduleDesk`）。
      </div>
      <div class="field">
        <label>数据目录</label>
        <div id="sdObDir" style="font-size:13px;color:var(--text-2);word-break:break-all;background:var(--panel-2);border:1px solid var(--line);border-radius:8px;padding:9px 11px;min-height:38px">{dir || '读取中…'}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-sec btn-sm" id="sdObPick" onclick={pick}>选择目录</button>
        <button class="btn btn-sec btn-sm" id="sdObDefault" onclick={async () => { dir = await defaultDataDir(); }}>用默认位置</button>
      </div>
    </div>
    <div class="m-foot">
      <div class="spacer"></div>
      <button class="btn btn-pri" id="sdObStart" disabled={busy} onclick={start}>{busy ? '正在启动…' : '开始使用'}</button>
    </div>
  </div>
</div>
