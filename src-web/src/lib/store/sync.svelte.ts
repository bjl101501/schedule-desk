/* 同步胶囊：写库前标「同步中」，成功后「已同步」，失败「同步失败」。
   15s tick 会拉一次 sync_status，与旧 shim-body 的轮询合并。 */
import type { SyncStatus } from '$lib/domain/types';

export const sync = $state({
  mode: 'local' as string,
  text: '本地模式',
  detail: '数据只保存在本机',
  online: true
});

export function markSyncing(): void {
  if (sync.mode === 'offline') return;
  sync.mode = 'syncing';
  sync.text = '同步中';
}

export function markSynced(): void {
  sync.mode = 'synced';
  sync.text = '已同步';
  sync.online = true;
}

export function markOffline(text = '同步失败'): void {
  sync.mode = 'offline';
  sync.text = text;
  sync.online = false;
}

export function applyStatus(s: SyncStatus | null): void {
  if (!s) return;
  if (s.mode) sync.mode = s.mode;
  if (s.text) sync.text = s.text;
  sync.detail = s.detail || sync.detail;
  sync.online = s.mode !== 'offline';
}
