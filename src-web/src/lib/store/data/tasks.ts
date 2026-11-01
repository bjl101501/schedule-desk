/*
  单条任务的动作：勾选、子项、重复生成、删除、保存。
  共同套路 = 改内存 → cacheLocal() → 按字段白名单落库。
*/
import type { Task } from '$lib/domain/types';
import { stampNow, uid } from '$lib/domain/date';
import { cloneNextRepeat, subStats, syncDoneFromSubs } from '$lib/domain/task';
import { cacheLocal } from './cache.svelte';
import { data, findTask, pushProxied } from './state.svelte';
import { toast } from '../toast.svelte';
import { apiAddTask, apiDeleteTask, apiUpdateTask } from './write';

export function toggleDone(id: string): void {
  const t = findTask(id);
  if (!t) return;
  t.done = !t.done;
  t.doneAt = t.done ? stampNow() : '';
  const fields = ['已完成', '完成时间'];
  // 勾掉父任务时，把还没勾的子项一并勾上，保持「进度 100%」一致
  if (t.done && t.subs && t.subs.length && subStats(t).done < t.subs.length) {
    t.subs.forEach((x) => {
      if (!x.done) {
        x.done = true;
        x.doneAt = t.doneAt;
      }
    });
    fields.push('拆分');
  }
  cacheLocal();
  if (t.done) spawnNextRepeat(t);
  apiUpdateTask(t, fields);
}

export function toggleSubAt(t: Task, idx: number): boolean {
  if (!t || !t.subs || !t.subs[idx]) return false;
  const s = t.subs[idx];
  s.done = !s.done;
  s.doneAt = s.done ? stampNow() : '';
  const flipped = syncDoneFromSubs(t);
  cacheLocal();
  const fields = ['拆分'];
  if (flipped) fields.push('已完成', '完成时间');
  apiUpdateTask(t, fields);
  if (flipped && t.done) {
    spawnNextRepeat(t);
    toast.show('子项全部完成，日程已标记完成');
  }
  return flipped;
}

export function spawnNextRepeat(t: Task): Task | null {
  if (!t || !t.repeat || t.repeat === '不重复' || !t.date) return null;
  const nt = cloneNextRepeat(t);
  if (!nt) return null;
  const dup = data.tasks.some((x) => x.id !== t.id && x.title === nt.title && x.date === nt.date && !x.done);
  if (dup) return null;
  const stored = pushProxied(data.tasks, nt);
  apiAddTask(stored);
  cacheLocal();
  return nt;
}

export function deleteTask(id: string): void {
  data.tasks = data.tasks.filter((x) => x.id !== id);
  cacheLocal();
  apiDeleteTask(id);
}

export function saveTask(t: Task): Promise<void> {
  cacheLocal();
  if (!t.id) {
    // 先给一个本地 id 占位：列表是 keyed each，空键会直接报错
    t.id = uid();
    const stored = pushProxied(data.tasks, t);
    return apiAddTask(stored);
  }
  return apiUpdateTask(t);
}
