import './styles.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { hasHost } from '$lib/bridge/invoke';
import { installMockBridge } from '$lib/bridge/mock';
import { dbReady, emitUpdated, onUpdated } from '$lib/bridge/db';
import { hydrateMeta } from '$lib/store/meta.svelte';
import { loadAll } from '$lib/store/data.svelte';
import { startClock } from '$lib/store/clock.svelte';
import { applyStatus } from '$lib/store/sync.svelte';
import { uiState } from '$lib/store/ui.svelte';
import { isDragging } from '$lib/store/dragSession.svelte';
import { syncStatus } from '$lib/bridge/desktop';
import { installTestFacade } from '$lib/test/facade.svelte';

// 没有 Tauri 宿主时（浏览器预览）装一个内存桥，界面与真机走同一套代码
if (!hasHost()) installMockBridge();

// 开发期把未捕获异常贴到页面上，浏览器预览时不用开控制台也能看到
if (import.meta.env.DEV) {
  const show = (m: string) => {
    const d = document.createElement('pre');
    d.style.cssText =
      'position:fixed;left:0;top:0;z-index:99999;background:#c00;color:#fff;font:11px monospace;padding:6px;max-height:70%;overflow:auto;white-space:pre-wrap;max-width:100%';
    d.textContent = m.slice(0, 1600);
    document.body.appendChild(d);
  };
  window.addEventListener('error', (e) => show('ERR ' + (e.error && e.error.stack ? e.error.stack : e.message)));
  window.addEventListener('unhandledrejection', (e) => show('REJ ' + String((e.reason && e.reason.stack) || e.reason)));
}

hydrateMeta();

const target = document.getElementById('app');
if (target) mount(App, { target });

// 浮层（日期 / 时间面板、pick 菜单、拖拽幽灵）统一挂这里：
// .modal 有 transform，留在弹窗里会让 position:fixed 的坐标全错
if (!document.getElementById('float-root')) {
  const fr = document.createElement('div');
  fr.id = 'float-root';
  document.body.appendChild(fr);
}

// 数据先到再挂时钟，避免首屏用空数据算状态
dbReady()
  .then(() => loadAll())
  .catch((e) => console.error('[boot] 初始化失败', e));


let lastSync = '';
startClock(() => {
  syncStatus().then((st) => {
    applyStatus(st);
    // 远端有新版本 → 通知一次，让界面在安全时机重载
    const mark = String(st?.lastSync || '');
    if (mark && lastSync && mark !== lastSync) emitUpdated();
    if (mark) lastSync = mark;
  });
});

/* 外部变更（WebDAV 拉取 / 托盘「立即同步」）后重载。
   320ms 去抖与旧版一致；正在编辑或拖拽时跳过，避免把输入冲掉。 */
let reloadTimer: ReturnType<typeof setTimeout> | null = null;
onUpdated(() => {
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    reloadTimer = null;
    if (uiState.editorId || isDragging()) return;
    void loadAll();
  }, 320);
});

installTestFacade();
