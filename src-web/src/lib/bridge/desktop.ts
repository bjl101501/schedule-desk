/* 桌面专属命令：数据目录、WebDAV、更新、通知。全部走 invokeSafe，错误折成 {__error} */
import { invokeSafe, errText } from './invoke';
import type { SyncStatus } from '../domain/types';

export interface WebDavForm {
  url: string;
  username: string;
  password: string;
}

export interface UpdateInfo {
  available?: boolean;
  version?: string;
  url?: string;
  notes?: string;
  error?: string;
}

export async function syncStatus(): Promise<SyncStatus> {
  const r = await invokeSafe<SyncStatus>('sync_status');
  if (errText(r)) return { mode: 'local', text: '本地模式', detail: errText(r) };
  return r as SyncStatus;
}

export async function defaultDataDir(): Promise<string> {
  const r = await invokeSafe<string>('default_data_dir');
  return typeof r === 'string' ? r : '';
}

export async function chooseDataDir(): Promise<{ ok?: boolean; dir?: string; error?: string; __error?: string }> {
  return (await invokeSafe('choose_data_dir')) as { ok?: boolean; dir?: string; error?: string };
}

export async function chooseDataDirQuiet(): Promise<{ ok?: boolean; dir?: string; error?: string }> {
  return (await invokeSafe('choose_data_dir_quiet')) as { ok?: boolean; dir?: string; error?: string };
}

export async function finishOnboarding(dir: string): Promise<{ ok?: boolean; error?: string; __error?: string }> {
  return (await invokeSafe('finish_onboarding', { dir })) as { ok?: boolean; error?: string };
}

export async function openDataDir(): Promise<void> {
  await invokeSafe('open_data_dir');
}

export async function restartApp(): Promise<void> {
  await invokeSafe('restart_app');
}

export async function webdavTest(f: WebDavForm): Promise<{ ok?: boolean; text?: string; error?: string; __error?: string }> {
  return (await invokeSafe('webdav_test', { ...f })) as { ok?: boolean; text?: string; error?: string };
}

export async function webdavSave(f: WebDavForm): Promise<{ ok?: boolean; text?: string; lastSync?: number; error?: string; __error?: string }> {
  return (await invokeSafe('webdav_save_and_sync', { ...f })) as { ok?: boolean; text?: string; lastSync?: number; error?: string };
}

export async function updateCheck(): Promise<UpdateInfo> {
  const r = await invokeSafe<UpdateInfo>('update_check');
  if (errText(r)) return { available: false, error: errText(r) };
  return r as UpdateInfo;
}

export async function updateInstall(): Promise<{ ok?: boolean; error?: string; __error?: string }> {
  return (await invokeSafe('update_install')) as { ok?: boolean; error?: string };
}

export async function setCloseToTray(on: boolean): Promise<{ __error?: string }> {
  return (await invokeSafe('set_close_to_tray', { on })) as { __error?: string };
}

export interface DiskSnapMeta {
  day: string;
  count: number;
}

export async function snapshotsList(): Promise<DiskSnapMeta[]> {
  const r = await invokeSafe<DiskSnapMeta[]>('snapshots_list');
  return Array.isArray(r) ? r : [];
}

export async function snapshotLoad(day: string): Promise<{ ok?: boolean; tables?: Record<string, unknown>; __error?: string }> {
  return (await invokeSafe('snapshot_load', { day })) as { ok?: boolean; tables?: Record<string, unknown>; __error?: string };
}
