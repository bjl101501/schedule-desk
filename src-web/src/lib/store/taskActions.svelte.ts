/*
  任务级动作：按 id 取任务、改日期（含计划平移与提醒基准同步）。

  「改日期 → 平移计划区间 → 同步提醒基准 → 按字段白名单落库」这套动作
  之前在 dndActions 里写了 5 遍（看板/日历/全天/时间线/日视图），
  TaskEditor 里还有第 6 遍。任何一处漏掉 endDate 或 remindCfg 都会变成
  「拖完日期，提醒还在旧的那天响」——所以收成一份。
*/
import type { Task } from '$lib/domain/types';
import { addDays, dayDiff, parseYmd, ymd } from '$lib/domain/date';
import { syncRemindAnchor } from '$lib/domain/selectors';
import { apiUpdateTask, cacheLocal, data } from './data.svelte';
import { toast } from './toast.svelte';

/** 唯一实现：按 id 取任务（原先散在 3 个文件、11 处内联） */
export function taskById(id: string): Task | undefined {
  return id ? data.tasks.find((t) => t.id === id) : undefined;
}

export interface DateChange {
  date: string;
  /** undefined = 不改时间；'' = 改成全天 */
  time?: string;
}

export interface DateChangeOpts {
  toast?: string;
}

/**
 * 改日期 / 改时间之后唯一该走的路。
 * 返回是否真的改了（没变化就不落库，避免无意义的写盘与同步）。
 */
export function applyDateChange(t: Task, next: DateChange, opts: DateChangeOpts = {}): boolean {
  if (!t) return false;
  const dateChanged = !!next.date && next.date !== t.date;
  const timeChanged = next.time !== undefined && next.time !== t.time;
  if (!dateChanged && !timeChanged) return false;

  const oldTime = t.time;

  // 计划区间整体平移：只改 date 不动 endDate 的话，跨度会被悄悄改掉
  if (dateChanged && t.plan && t.endDate && t.date) {
    const a = parseYmd(t.date);
    const b = parseYmd(next.date);
    const e = parseYmd(t.endDate);
    if (a && b && e) t.endDate = ymd(addDays(e, dayDiff(a, b)));
  }
  if (dateChanged) t.date = next.date;
  if (next.time !== undefined) t.time = next.time;

  syncRemindAnchor(t, oldTime);

  cacheLocal();
  const fields = ['日期'];
  if (next.time !== undefined) fields.push('时间');
  if (t.plan) fields.push('结束日期');
  if (t.remindCfg) fields.push('提醒设置');
  apiUpdateTask(t, fields);

  if (opts.toast) toast.show(opts.toast);
  return true;
}
