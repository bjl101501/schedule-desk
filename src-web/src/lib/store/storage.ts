/*
  localStorage 的唯一入口。

  规则：除了本文件、`bridge/mock.ts`（浏览器预览的假宿主）和 `index.html`（首帧前读主题，
  没法 import），其它地方不许直接碰 localStorage —— 键名散落会让清理与迁移漏项。
*/

export const STORAGE_KEYS = {
  /* 数据层 */
  cache: 'wb_schedule_cache',
  snapshot: 'wb_schedule_snapshot',
  daily: 'wb_schedule_daily',
  seeded: 'wb_schedule_seeded',
  holiday: 'wb_holiday_cache_v2',
  /* 视图偏好 */
  sort: 'wb_schedule_sort',
  theme: 'wb_theme',
  panelW: 'wb_schedule_panel_w',
  /* 清单 / 标签元数据 */
  lists: 'wb_schedule_custom_lists',
  tags: 'wb_schedule_custom_tags',
  archived: 'wb_schedule_archived_lists',
  listOrder: 'wb_schedule_list_order',
  tagOrder: 'wb_schedule_tag_order',
  cdGroupOrder: 'wb_schedule_cdgroup_order',
  /* 清单 / 标签的自选颜色：{ c: 名字→hex, p: [用户手动指定的名字] } */
  listColors: 'wb_schedule_list_colors',
  tagColors: 'wb_schedule_tag_colors',
  /* 浏览器预览专用 */
  mockDb: 'sd_mock_store',
  mockFirstRun: 'sd_mock_first_run'
} as const;

/** 清空时按这个顺序删，键名只此一份 */
export const RESET_KEYS: string[] = Object.values(STORAGE_KEYS);

export function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeRaw(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    // 容量满或隐私模式：调用方自己决定要不要提示
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function readJson<T>(key: string, fallback: T): T {
  const raw = readRaw(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    return writeRaw(key, JSON.stringify(value));
  } catch {
    return false;
  }
}

export function readArr(key: string): string[] {
  const v = readJson<unknown>(key, []);
  return Array.isArray(v) ? (v as string[]) : [];
}

export function writeArr(key: string, arr: string[]): boolean {
  return writeJson(key, arr);
}
