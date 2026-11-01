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
  import ModalHead from '$lib/ui/ModalHead.svelte';
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

<ModalHead title="设置" onclose={close} />
<div class="m-body">
  <div class="field" data-sd-block="desktop">
    <label>数据存储</label>
    <div style="font-size:13.5px;color:var(--text-2);line-height:1.85">
      <div id="sdDirPath" style="word-break:break-all">{cfg.dataDir || '默认目录'}</div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-sec btn-sm" id="sdOpenDir" onclick={openDataDir}>打开目录</button>
        <button class="btn btn-sec btn-sm" id="sdChangeDir" onclick={changeDir}>更改目录</button>
      </div>
    </div>
  </div>

  <div class="field">
    <label>使用说明<span class="hint">数据放在哪 / 提醒怎么响 / 艾宾浩斯 / 跨天日程</span></label>
    <button
      class="btn btn-sec"
      id="stHelp"
      style="justify-content:flex-start;width:100%;height:40px"
      onclick={() => (uiState.help = true)}
    ><Icon name="book" /> 打开使用说明</button>
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
    <label>外观</label>
    <div class="theme-chips">
      {#each THEMES as t (t.k)}
        <button class="theme-chip{theme.key === t.k ? ' on' : ''}" data-ththeme={t.k} onclick={() => setTheme(t.k)}>{t.name}</button>
      {/each}
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

  <div class="field">
    <label>引用与致谢<span class="hint">外部依赖逐项登记</span></label>
    <div style="font-size:13.5px;color:var(--text-2);line-height:1.955">
      · <b>图标</b>：Lucide（ISC 许可），逐路径引入 42 个；另有 5 个自制 path
      （分屏 / 卡片 / 看板 / 时间线 / 趋势），因为 Lucide 没有同形图标<br>
      · <b>浮层定位</b>：@floating-ui/dom（MIT 许可），负责上下翻转、左右钳制、视口内高度与滚动跟随<br>
      · <b>图表</b>：手写 SVG / CSS 绘制，未使用图表库<br>
      · <b>数据格式</b>：沿用 WorkBuddy「资料库」的表格结构（tables / properties），本机 JSON 文件保存，可选 WebDAV 同步<br>
      · <b>配色</b>：中国传统色 —— 靛青 #177CB0（主色）、朱砂 #C3272B、杏黄 #C8892B、竹青 #5E8C6A、绛紫 #7A4E63、石青 #1685A9、宣纸 #F7F3EA（底）、玄色 #2A2925（字）；色名与色值参照 sealuo.com 传统色卡整理<br>
      · <b>字体</b>：霞鹜文楷 GB — LXGW WenKai GB，作者 LXGW，SIL Open Font License 1.1；经 jsDelivr CDN 分片加载，加载失败自动回落到系统字体。
      顶栏时钟用 Digital-7（作者 Style-7 / Sizenko Alexander），作者声明免费使用，商业分发需另行取得授权<br>
      · <b>节假日数据</b>：holiday.ailcc.com 公开接口，仅取「下一个法定节假日」，每日缓存 6 小时；接口不可用时用内置的固定日期表兜底，并标注「预估」<br>
      · <b>桌面外壳</b>：Tauri 2（MIT / Apache-2.0 双许可）
    </div>
  </div>

</div>
<div class="m-foot">
  <div style="font-size:11px;color:var(--text-3)">日程台 · 作者 workbuddy &amp; bjl101501</div>
  <div class="spacer"></div>
  <button class="btn btn-pri" onclick={close}>知道了</button>
</div>
