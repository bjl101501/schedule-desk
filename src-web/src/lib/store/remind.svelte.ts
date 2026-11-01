/*
  提醒闭环：把「知道了 / 完成」真正落到数据里。
  read[] 存的是 remindCfg.offsets 的下标（不是偏移量），reminderState 靠它跳过已确认的节点。
  以前这里没有任何写入动作，导致铃铛角标永远清不掉、提醒永远停在「待复习」。
*/
import type { Task } from '$lib/domain/types';
import { apiUpdateTask, cacheLocal, findTask, toggleDone } from './data.svelte';
import { toast } from './toast.svelte';

/** 标记某个提醒节点已确认（艾宾浩斯只跳过一个节点，不影响后续） */
export function markRemindRead(taskId: string, idx: number): boolean {
  const t = findTask(taskId);
  if (!t || !t.remindCfg) return false;
  const cfg = t.remindCfg;
  if (idx < 0 || idx >= (cfg.offsets || []).length) return false;
  const read = Array.from(new Set([...(cfg.read || []), idx])).sort((a, b) => a - b);
  // 换对象引用，$state 才会可靠失效
  t.remindCfg = { ...cfg, read };
  cacheLocal();
  apiUpdateTask(t, ['提醒设置']);
  toast.show('已标记为已读');
  return true;
}

/** 从提醒中心直接完成任务；复用 toggleDone，才能带上完成时间、子项联动与重复实例 */
export function completeFromReminder(taskId: string): boolean {
  const t = findTask(taskId);
  if (!t) return false;
  if (!t.done) toggleDone(taskId);
  toast.show('已完成');
  return true;
}

/** 当前任务的节点总数与「第 n/N 次」前缀 */
export function remindStage(task: Task, idx: number): string {
  const total = task?.remindCfg?.offsets?.length || 0;
  if (!total) return '';
  return '第 ' + (idx + 1) + '/' + total + ' 次';
}
