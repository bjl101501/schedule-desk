<script lang="ts">
  import { THEMES } from '$lib/domain/constants';
  import { clearTables, dataJob, readDailySnaps, restoreDailySnap, seedDemo, writeSafetySnapshot } from '$lib/store/data.svelte';
  import { sync } from '$lib/store/sync.svelte';
  import { setTheme, theme } from '$lib/store/theme.svelte';
  import { uiState } from '$lib/store/ui.svelte';
  import { toast } from '$lib/store/toast.svelte';
  import { dbConfig, dbVersion } from '$lib/bridge/db';
  import {
    chooseDataDir, openDataDir, restartApp, updateCheck, updateInstall, webdavSave, webdavTest
  } from '$lib/bridge/desktop';
  import Icon from '$lib/ui/Icon.svelte';
  import { prepareForm } from '$lib/actions/prepare-form';

  const cfg = $derived(dbConfig());
  const snaps = $derived(readDailySnaps());

  let davUrl = $state(cfg.webdav?.url || '');
  let davUser = $state(cfg.webdav?.username || '');
  let davPass = $state(cfg.webdav?.password || '');
  let davMsg = $state('');
  let updMsg = $state('');
  let updBusy = $state(false);

  function close(): void {
    uiState.settings = false;
  }

  async function changeDir(): Promise<void> {
    const r = await chooseDataDir();
    if (r.ok) {
      toast.show('已切换数据目录，正在重启…');
      setTimeout(() => restartApp(), 700);
    } else if (r.error) {
      toast.show(r.error);
    }
  }

  async function testDav(): Promise<void> {
    davMsg = '正在测试…';
    const r = await webdavTest({ url: davUrl.trim(), username: davUser.trim(), password: davPass });
    davMsg = r.ok ? r.text || '连接成功' : r.error || r.__error || '连接失败';
  }

  async function saveDav(): Promise<void> {
    davMsg = '正在保存并同步…';
    const r = await webdavSave({ url: davUrl.trim(), username: davUser.trim(), password: davPass });
    davMsg = r.ok ? r.text || '已保存，正在同步' : r.error || r.__error || '保存失败';
  }

  async function checkUpd(): Promise<void> {
    updBusy = true;
    updMsg = '正在检查…';
    const r = await updateCheck();
    updBusy = false;
    if (r.available && r.version) {
      updMsg = '发现新版本 ' + r.version;
      const go = confirm('发现新版本 ' + r.version + '，现在更新？');
      if (go) {
        const x = await updateInstall();
        updMsg = x.ok ? '更新已开始，应用会重启' : x.error || x.__error || '更新失败';
      }
      return;
    }
    updMsg = r.error ? '检查失败：' + r.error : '已是最新版本（' + (dbVersion() || '—') + '）';
  }

  function clearAll(): void {
    uiState.typed = {
      title: '清空全部数据',
      desc: '会删除所有事项、习惯、纪念日与专注记录，且无法撤销。<br>删除前会自动存一份快照，可在「备份」里恢复。',
      word: '清空',
      onOk: () => {
        writeSafetySnapshot('清空全部数据前');
        void clearTables(['tasks', 'habits', 'countdowns', 'pomodoros'], '正在清空全部数据').then(() => {
          toast.show('已清空，重启后会自动恢复「下一个假期」条目');
          close();
        });
      }
    };
  }

  function restore(day: string): void {
    uiState.typed = {
      title: '恢复每日快照',
      desc: '会用 ' + day + ' 的快照覆盖当前事项、习惯与纪念日。恢复前会自动再存一份当前快照。',
      word: '恢复',
      onOk: () => {
        void restoreDailySnap(day).then((ok) => {
          if (ok) close();
        });
      }
    };
  }

  function regenSeed(): void {
    seedDemo();
    close();
  }
</script>

<div class="m-head">
  <h3>设置</h3>
  <button class="m-close" onclick={close}><Icon name="close" /></button>
</div>
<div class="m-body">
  <div class="field" data-sd-block="desktop">
    <label>数据存储</label>
    <div style="font-size:13.5px;color:var(--text-2);line-height:1.85">
      <div id="sdDirPath" style="word-break:break-all">{cfg.dataDir || '默认目录'}</div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-sec btn-sm" id="sdOpenDir" onclick={openDataDir}>打开目录</button>
        <button class="btn btn-sec btn-sm" id="sdChangeDir" onclick={changeDir}>更改目录</button>
        <button class="btn btn-sec btn-sm" id="sdHelp" onclick={() => (uiState.help = true)}>使用说明</button>
      </div>
    </div>
  </div>

  <div class="field" data-sd-block="desktop">
    <label>同步状态</label>
    <div style="font-size:13.5px;color:var(--text-2)">{sync.text} · {sync.detail}</div>
  </div>

  <div class="field" data-sd-block="desktop">
    <label>WebDAV 同步<span class="hint">可选，留空就是纯本地</span></label>
    <div style="display:flex;flex-direction:column;gap:7px">
      <input class="inp" id="sdDavUrl" bind:value={davUrl} placeholder="https://dav.example.com/remote.php/dav/files/me/" use:prepareForm />
      <div class="row2">
        <input class="inp" id="sdDavUser" bind:value={davUser} placeholder="用户名" use:prepareForm />
        <input class="inp" id="sdDavPass" type="password" bind:value={davPass} placeholder="密码" use:prepareForm />
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-sec btn-sm" id="sdDavTest" onclick={testDav}>测试连接</button>
        <button class="btn btn-pri btn-sm" id="sdDavSave" onclick={saveDav}>保存并同步</button>
      </div>
      <div id="sdDavMsg" style="font-size:12px;color:var(--text-3)">{davMsg}</div>
    </div>
  </div>

  <div class="field" data-sd-block="desktop">
    <label>软件更新</label>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-sec btn-sm" id="sdCheckUpdate" disabled={updBusy} onclick={checkUpd}>检查更新</button>
      <span id="sdUpdMsg" style="font-size:12px;color:var(--text-3)">{updMsg}</span>
    </div>
  </div>

  <div class="field">
    <label>本地快照<span class="hint">每天首次打开自动生成，最多 7 份</span></label>
    <div style="display:flex;flex-direction:column;gap:8px">
      {#if snaps.length}
        {#each [...snaps].reverse() as s (s.day)}
          <div style="display:flex;align-items:center;gap:10px;font-size:13px">
            <span style="flex:1;color:var(--text-2)">{s.day} · {(s.tasks || []).length} 条日程 / {(s.habits || []).length} 个习惯 / {(s.countdowns || []).length} 个纪念日</span>
            <button class="btn btn-sm btn-sec" data-snaprestore={s.day} onclick={() => restore(s.day)}>恢复</button>
          </div>
        {/each}
      {:else}
        <div style="font-size:13px;color:var(--text-3)">还没有快照，明天首次打开时会自动生成一份。</div>
      {/if}
    </div>
  </div>

  <div class="field">
    <label>艾宾浩斯提醒</label>
    <div style="font-size:13px;color:var(--text-2);line-height:1.85">
      按 0 / 5 / 30 分钟、12 小时、1 / 2 / 4 / 7 / 15 天的间隔提醒复习。
      节点可以按需勾选，到点会发系统通知，同时进入顶部铃铛与「今天要处理」。
    </div>
  </div>

  <div class="field">
    <label>外观</label>
    <div class="theme-chips">
      {#each THEMES as t (t.k)}
        <button class="theme-chip{theme.key === t.k ? ' on' : ''}" data-ththeme={t.k} onclick={() => setTheme(t.k)}>{t.name}</button>
      {/each}
    </div>
  </div>

  <div class="field">
    <label>引用与致谢</label>
    <div style="font-size:12.5px;color:var(--text-3);line-height:1.85">
      表格能力来自 WorkBuddy「资料库」结构，桌面外壳使用 Tauri 2，界面为手写 CSS，
      不引入图标库与图表库。行楷字体来自 LXGW WenKai GB（CDN 加载，离线时回落系统字体）。
    </div>
  </div>

  <div class="field">
    <label>危险操作</label>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-sec btn-sm" onclick={regenSeed}>重新生成示例数据</button>
      <button class="btn btn-danger btn-sm" id="stClearAll" onclick={clearAll} disabled={dataJob.on}>清空全部数据</button>
    </div>
    {#if dataJob.on}
      <div style="margin-top:8px;font-size:12px;color:var(--text-3)" data-job>
        {dataJob.label} {dataJob.done} / {dataJob.total}
      </div>
    {/if}
  </div>
</div>
<div class="m-foot">
  <div class="spacer"></div>
  <button class="btn btn-pri" onclick={close}>知道了</button>
</div>
