/*
  本地缓存与快照：260ms 合并写入、每日快照、种子标记。
  写库失败时靠这里兜底，重载后不会白屏。
*/
import type { Countdown, Habit, Pomodoro, Task } from '$lib/domain/types';
import { today0, ymd } from '$lib/domain/date';
import { hasHost } from '$lib/bridge/invoke';
import { STORAGE_KEYS, readJson, readRaw, removeKey, writeJson, writeRaw } from '../storage';
import { data } from './state.svelte';

/* ---------- 本地缓存（260ms 合并写入） ---------- */
const CACHE_KEY = STORAGE_KEYS.cache;
let cacheTimer: ReturnType<typeof setTimeout> | null = null;

export function cacheLocal(): void {
  if (cacheTimer) return;
  cacheTimer = setTimeout(() => {
    cacheTimer = null;
    flushCache();
  }, 260);
}

export function flushCache(): void {
  if (cacheTimer) {
    clearTimeout(cacheTimer);
    cacheTimer = null;
  }
  writeJson(CACHE_KEY, {
    ts: Date.now(),
    tasks: $state.snapshot(data.tasks),
    habits: $state.snapshot(data.habits),
    countdowns: $state.snapshot(data.countdowns),
    pomodoros: $state.snapshot(data.pomodoros)
  });
}

export function loadLocalCache(): void {
  try {
    const raw = readRaw(CACHE_KEY);
    if (!raw) return;
    const o = JSON.parse(raw);
    if (!o) return;
    data.tasks = o.tasks || [];
    data.habits = o.habits || [];
    data.countdowns = o.countdowns || [];
    data.pomodoros = o.pomodoros || [];
  } catch {
    /* ignore */
  }
}

/* ---------- 种子标记 ---------- */
export function seededFlag(): boolean {
  try {
    return readRaw(STORAGE_KEYS.seeded) === '1';
  } catch {
    return false;
  }
}

export function markSeeded(): void {
  // 必须写裸 '1'：Rust 侧第一次启动的判断就是 seeded === '1'，
  // 写成 JSON（"1"）会被当成「没种过」，清空后重启又把示例数据种回来
  writeRaw(STORAGE_KEYS.seeded, '1');
}

/* ---------- 删除前的安全快照 ---------- */
export const SNAP_KEY = STORAGE_KEYS.snapshot;

/** 与备份弹窗的「恢复上次快照」共用同一个键 */
export function writeSafetySnapshot(reason: string): boolean {
  return writeJson(SNAP_KEY, {
    at: Date.now(),
    reason,
    tasks: $state.snapshot(data.tasks),
    habits: $state.snapshot(data.habits),
    countdowns: $state.snapshot(data.countdowns),
    pomodoros: $state.snapshot(data.pomodoros)
  });
}

/** 读上次的安全快照原文（备份弹窗恢复时用，键名不外泄） */
export function readSafetySnapshot(): string {
  return readRaw(SNAP_KEY) || '';
}

/* ---------- 每日快照 ---------- */
const DAILY_KEY = STORAGE_KEYS.daily;

export interface DailySnap {
  day: string;
  at: number;
  tasks: Task[];
  habits: Habit[];
  countdowns: Countdown[];
  pomodoros?: Pomodoro[];
}

export function readDailySnaps(): DailySnap[] {
  const v = readJson<DailySnap[]>(DAILY_KEY, []);
  return Array.isArray(v) ? v : [];
}

export function autoSnapshotDaily(): void {
  try {
    // 桌面真机已有 Rust 磁盘快照（snapshots/YYYY-MM-DD.json），不再在 localStorage 重复存 7 份整库
    if (hasHost()) {
      removeKey(DAILY_KEY);
      return;
    }
    const day = ymd(today0());
    let arr = readDailySnaps();
    if (arr.some((x) => x.day === day)) return;
    if (!data.tasks.length && !data.habits.length && !data.countdowns.length) return;
    arr.push({
      day,
      at: Date.now(),
      tasks: $state.snapshot(data.tasks) as Task[],
      habits: $state.snapshot(data.habits) as Habit[],
      countdowns: $state.snapshot(data.countdowns) as Countdown[],
      pomodoros: $state.snapshot(data.pomodoros) as Pomodoro[]
    });
    if (arr.length > 7) arr = arr.slice(arr.length - 7);
    writeJson(DAILY_KEY, arr);
  } catch {
    /* ignore */
  }
}
