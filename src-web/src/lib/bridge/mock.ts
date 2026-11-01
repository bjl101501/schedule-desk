/*
  浏览器预览用的假宿主：只在没有 __TAURI_INTERNALS__ 时启用。
  真机行为与这里共用同一个 db.ts 门面，差别只在文件落盘。
*/
import { setTransport, type Transport } from './invoke';
import { RESET_KEYS, STORAGE_KEYS, readRaw, removeKey, writeRaw } from '$lib/store/storage';

const KEY = STORAGE_KEYS.mockDb;
const VERSION = '2.3.0-mock';

interface Rec {
  id: string;
  properties: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

function load(): Record<string, Rec[]> {
  try {
    const raw = readRaw(KEY);
    return raw ? (JSON.parse(raw) as Record<string, Rec[]>) : {};
  } catch {
    return {};
  }
}

function save(tables: Record<string, Rec[]>): void {
  try {
    const raw = JSON.stringify(tables);
    writeRaw(KEY, raw);
    console.info('[mock] save', raw.length, 'bytes');
  } catch (e) {
    console.info('[mock] save failed', String(e));
  }
}

export function installMockBridge(): void {
  // ?reset=1：清空预览数据，等价于「第一次打开」
  if (new URLSearchParams(location.search).get('reset') === '1') {
    RESET_KEYS.forEach(removeKey);
  }
  const tables = load();
  console.info('[mock] boot tables', Object.keys(tables).map((k) => k.slice(0, 4) + '=' + tables[k].length).join(','));
  // 预览默认不进引导；要测引导就加 ?onboard=1
  let firstRun = readRaw(STORAGE_KEYS.mockFirstRun) === '1';
  if (new URLSearchParams(location.search).get('onboard') === '1') firstRun = true;

  const transport: Transport = async (cmd, args) => {
    const a = (args || {}) as Record<string, unknown>;
    switch (cmd) {
      case 'db_bootstrap':
        return {
          tables,
          config: {
            version: VERSION,
            dataDir: '浏览器预览（localStorage）',
            webdav: { url: '', username: '', password: '' },
            repo: '',
            deviceId: 'mock',
            lastSync: 0,
            closeToTray: true
          },
          firstRun,
          version: VERSION
        };
      case 'db_apply': {
        const ops = (a.ops as Record<string, unknown>[] | undefined) || [];
        ops.forEach((op) => {
          const table = String(op.table || '');
          const id = String(op.id || '');
          if (!table || !id) return;
          const arr = tables[table] || (tables[table] = []);
          let hit = arr.find((r) => r.id === id);
          if (!hit) {
            hit = { id, properties: {}, createdAt: Number(op.createdAt) || Date.now(), updatedAt: Date.now() };
            arr.push(hit);
          }
          hit.properties = (op.properties as Record<string, unknown>) || {};
          hit.updatedAt = Number(op.updatedAt) || Date.now();
          hit.deleted = !!op.deleted;
        });
        save(tables);
        console.info('[mock] apply', ops.length, 'ops; tables', Object.keys(tables).map((k) => k.slice(0, 4) + '=' + tables[k].length).join(','));
        return null;
      }
      case 'sync_status':
        return { mode: 'local', text: '本地模式', detail: '浏览器预览，不写磁盘' };
      case 'default_data_dir':
        return '（浏览器预览无数据目录）';
      case 'choose_data_dir':
      case 'choose_data_dir_quiet':
        return { ok: false, error: '浏览器预览不支持选择目录' };
      case 'finish_onboarding':
        firstRun = false;
        writeRaw(STORAGE_KEYS.mockFirstRun, '0');
        return { ok: true };
      case 'open_data_dir':
        return null;
      case 'restart_app':
        location.reload();
        return null;
      case 'webdav_test':
      case 'webdav_save_and_sync':
        return { ok: false, error: '浏览器预览不支持 WebDAV' };
      case 'update_check':
        return { available: false };
      case 'update_install':
        return { ok: false, error: '浏览器预览不支持自动更新' };
      case 'export_file': {
        const name = String(a.name || 'export.json');
        const blob = new Blob([String(a.content ?? '')], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return name;
      }
      case 'notify_now':
        console.info('[mock notify]', a.title, a.body);
        return null;
      default:
        return null;
    }
  };

  setTransport(transport);
}
