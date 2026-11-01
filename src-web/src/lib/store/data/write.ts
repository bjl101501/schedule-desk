/*
  写库：所有 record 级 API 都在这里。
  失败只提示不抛出 —— 内存里的改动仍然有效，界面不该因为网络抖动回滚。
*/
import type { Countdown, Habit, Pomodoro, Task } from '$lib/domain/types';
import { DB_IDS } from '$lib/domain/constants';
import { cdToProps, habitToProps, pomoToProps, taskToProps } from '$lib/domain/props';
import { db } from '$lib/bridge/db';
import { markOffline, markSynced, markSyncing } from '../sync.svelte';
import { toast } from '../toast.svelte';

const CD_DB = 'gVxrxS4S2Zb2xddhphNdjT';

export function apiAddTask(t: Task): Promise<void> {
  markSyncing();
  return db
    .addRecord({ databaseId: DB_IDS.tasks, properties: taskToProps(t) })
    .then((r) => {
      if (r && r.id) t.id = r.id;
      markSynced();
    })
    .catch((e) => {
      console.error('[database] 新增任务失败:', e);
      markOffline();
      toast.show('事项未同步，请检查网络');
    });
}

export function apiUpdateTask(t: Task, partial?: string[]): Promise<void> {
  if (!t.id) return Promise.resolve();
  markSyncing();
  return db
    .updateRecord({ databaseId: DB_IDS.tasks, recordId: t.id, properties: taskToProps(t, partial) })
    .then(() => { markSynced(); })
    .catch((e) => {
      console.error('[database] 更新任务失败:', e);
      markOffline();
      toast.show('修改未同步，请检查网络');
    });
}

export function apiDeleteTask(id: string): Promise<void> {
  if (!id) return Promise.resolve();
  return db.deleteRecord({ databaseId: DB_IDS.tasks, recordId: id }).then(() => {}).catch((e) => {
    console.error('[database] 删除失败:', e);
    toast.show('删除未同步');
  });
}

export function apiAddHabit(h: Habit): Promise<void> {
  return db
    .addRecord({ databaseId: DB_IDS.habits, properties: habitToProps(h) })
    .then((r) => {
      if (r && r.id) h.id = r.id;
    })
    .catch((e) => {
      console.error('[database] 习惯新增失败:', e);
      toast.show('习惯未同步');
    });
}

export function apiUpdateHabit(h: Habit): Promise<void> {
  if (!h.id) return Promise.resolve();
  return db
    .updateRecord({ databaseId: DB_IDS.habits, recordId: h.id, properties: habitToProps(h) })
    .then(() => {})
    .catch((e) => {
      console.error('[database] 习惯更新失败:', e);
      toast.show('习惯未同步');
    });
}

/** 兼容旧调用：id 为空 = 新增，否则更新。新建请走数据层的 saveHabit（按是否存在判断） */
export function apiSaveHabit(h: Habit): Promise<void> {
  return h.id ? apiUpdateHabit(h) : apiAddHabit(h);
}

export function apiDeleteHabit(id: string): Promise<void> {
  return db.deleteRecord({ databaseId: DB_IDS.habits, recordId: id }).then(() => {}).catch((e) => console.error(e));
}

export function apiAddCountdown(c: Countdown): Promise<void> {
  return db
    .addRecord({ databaseId: CD_DB, properties: cdToProps(c) })
    .then((r) => {
      if (r && r.id) c.id = r.id;
    })
    .catch((e) => {
      console.error('[database] 纪念日新增失败:', e);
      toast.show('纪念日未同步');
    });
}

export function apiUpdateCountdown(c: Countdown): Promise<void> {
  if (!c.id) return Promise.resolve();
  return db
    .updateRecord({ databaseId: CD_DB, recordId: c.id, properties: cdToProps(c) })
    .then(() => {})
    .catch((e) => {
      console.error(e);
      toast.show('纪念日未同步');
    });
}

/** 兼容旧调用：id 为空 = 新增，否则更新。新建请走数据层的 saveCountdown */
export function apiSaveCountdown(c: Countdown): Promise<void> {
  return c.id ? apiUpdateCountdown(c) : apiAddCountdown(c);
}

export function apiDeleteCountdown(id: string): Promise<void> {
  return db.deleteRecord({ databaseId: CD_DB, recordId: id }).then(() => {}).catch((e) => console.error(e));
}

/** 删一条专注记录；旧版只清内存，导致「清空」后重启又冒出来 */
export function apiDeletePomo(id: string): Promise<void> {
  if (!id) return Promise.resolve();
  return db.deleteRecord({ databaseId: DB_IDS.pomodoros, recordId: id }).then(() => {}).catch((e) => console.error(e));
}

export function apiAddPomo(p: Pomodoro): Promise<void> {
  return db
    .addRecord({ databaseId: DB_IDS.pomodoros, properties: pomoToProps(p) })
    .then((r) => {
      if (r && r.id) p.id = r.id;
    })
    .catch((e) => {
      console.error('[database] 专注记录保存失败:', e);
      toast.show('专注记录未同步');
    });
}
