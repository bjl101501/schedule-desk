/*
  操作历史与撤销。

  为什么不做整库快照：
  400 条任务整份序列化约 120KB，50 步就是 6MB，而且每次动作前都要拍一张。
  这里记的是「这一步改了哪几个字段」，单步通常不到 1KB；
  80ms 合批天然就是事务边界，一次拖拽重排 60 行也只算一条。

  捕获点在 bridge/db：那里是唯一真正落库的出口，
  且 updateRecord 合并之前还能读到旧值 —— 业务层改完内存就再也拿不到了。
*/
import type { Countdown, DbRow, Habit, Pomodoro, Task } from '$lib/domain/types';
import { DB_IDS } from '$lib/domain/constants';
import { normCountdown, normHabit, normPomo, normTask } from '$lib/domain/task';
import { db, flushNow, muteJournal, setJournalHook, setJournalLabel, type JOp } from '$lib/bridge/db';
import { toast } from '../toast.svelte';
import { cacheLocal } from './cache.svelte';
import { data } from './state.svelte';

export interface HistEntry {
  id: number;
  label: string;
  at: number;
  ops: JOp[];
}

const LIMIT = 50;
const OPS_LIMIT = 8000;

export const hist = $state({
  undo: [] as HistEntry[],
  redo: [] as HistEntry[],
  busy: false
});

let seq = 0;
/** 一次「长动作」（清空 / 导入）跨多次 flush，用事务把它们合成一条 */
let tx: { label: string; ops: JOp[] } | null = null;

const CN = 'gVxrxS4S2Zb2xddhphNdjT';

function nounOf(table: string): string {
  if (table === DB_IDS.tasks) return '事项';
  if (table === DB_IDS.habits) return '习惯';
  if (table === CN || table === DB_IDS.countdowns) return '纪念日';
  if (table === DB_IDS.pomodoros) return '专注记录';
  return '数据';
}

function inferLabel(ops: JOp[]): string {
  const noun = nounOf(ops[0]?.table || '');
  if (ops.every((o) => o.kind === 'add')) return '新增' + noun;
  if (ops.every((o) => o.kind === 'delete')) return '删除' + noun;
  return '修改' + noun;
}

function trim(): void {
  while (hist.undo.length > LIMIT) hist.undo.shift();
  let total = hist.undo.reduce((n, e) => n + e.ops.length, 0);
  // 单条就超限时也保留它，否则「清空全部数据」永远无法撤销
  while (total > OPS_LIMIT && hist.undo.length > 1) {
    const gone = hist.undo.shift();
    total -= gone ? gone.ops.length : 0;
  }
}

function pushEntry(label: string, ops: JOp[]): void {
  if (!ops.length) return;
  hist.undo.push({ id: ++seq, label: label || inferLabel(ops), at: Date.now(), ops });
  hist.redo = [];
  trim();
}

/** bridge 层每批改动落库后回调这里 */
function onOps(ops: JOp[], label: string): void {
  if (tx) {
    tx.ops.push(...ops);
    return;
  }
  pushEntry(label, ops);
}

setJournalHook(onOps);

/* ---------------- 事务 ---------------- */

let txDepth = 0;

/** 长动作开始：期间所有批次合成一条历史。允许嵌套，外层 label 优先。 */
export function beginTx(label: string): void {
  if (!tx) tx = { label, ops: [] };
  txDepth++;
}

export function endTx(): void {
  txDepth = Math.max(0, txDepth - 1);
  if (txDepth > 0) return;
  if (!tx) return;
  const { label, ops } = tx;
  tx = null;
  pushEntry(label, ops);
}

/** 给接下来的 80ms 批次贴一个动作名（普通动作够用） */
export function act<T>(label: string, fn: () => T): T {
  setJournalLabel(label);
  return fn();
}

/* ---------------- 回放 ---------------- */

interface TableCfg {
  dbId: string;
  norm: (r: DbRow) => unknown;
  read: () => unknown[];
  write: (v: unknown[]) => void;
}

const TABLES: TableCfg[] = [
  { dbId: DB_IDS.tasks, norm: (r) => normTask(r), read: () => data.tasks, write: (v) => (data.tasks = v as Task[]) },
  { dbId: DB_IDS.habits, norm: (r) => normHabit(r), read: () => data.habits, write: (v) => (data.habits = v as Habit[]) },
  { dbId: CN, norm: (r) => normCountdown(r), read: () => data.countdowns, write: (v) => (data.countdowns = v as Countdown[]) },
  { dbId: DB_IDS.pomodoros, norm: (r) => normPomo(r), read: () => data.pomodoros, write: (v) => (data.pomodoros = v as Pomodoro[]) }
];

function cfgOf(table: string): TableCfg | undefined {
  return TABLES.find((t) => t.dbId === table);
}

/** 只取回动过的那几条，不整库重载（整库会重建所有对象、还会碰每日快照） */
async function syncMemory(table: string, ids: string[]): Promise<void> {
  const cfg = cfgOf(table);
  if (!cfg || !ids.length) return;
  const rows = await Promise.all(ids.map((id) => db.getRecord({ databaseId: cfg.dbId, recordId: id })));
  const got = new Map<string, unknown>();
  rows.forEach((r) => {
    if (!r) return;
    const rec = cfg.norm(r) as { id: string };
    if (rec && rec.id) got.set(rec.id, rec);
  });
  const arr = cfg.read();
  // 撤销「新增」时记录已经不在库里，从内存里摘掉
  const kept = arr.filter((x) => {
    const id = (x as { id: string }).id;
    return !ids.includes(id) || got.has(id);
  });
  ids.forEach((id) => {
    const next = got.get(id);
    if (!next) return;
    const at = kept.findIndex((x) => (x as { id: string }).id === id);
    if (at > -1) kept[at] = next;
    else kept.push(next);
  });
  cfg.write(kept);
}

async function applyOps(ops: JOp[], dir: 'undo' | 'redo'): Promise<void> {
  muteJournal(true);
  try {
    // 撤销要倒着来：同一批里后面的改动依赖前面的结果
    const list = dir === 'undo' ? [...ops].reverse() : ops;
    for (const o of list) {
      const props = dir === 'undo' ? o.before : o.after;
      if (dir === 'undo') {
        if (o.kind === 'add') {
          await db.deleteRecord({ databaseId: o.table, recordId: o.id });
        } else if (o.kind === 'delete') {
          await db.restoreRecord({ databaseId: o.table, id: o.id, properties: o.before, createdAt: o.createdAt });
        } else {
          await db.updateRecord({ databaseId: o.table, recordId: o.id, properties: props });
        }
      } else if (o.kind === 'add') {
        await db.restoreRecord({ databaseId: o.table, id: o.id, properties: o.after, createdAt: o.createdAt });
      } else if (o.kind === 'delete') {
        await db.deleteRecord({ databaseId: o.table, recordId: o.id });
      } else {
        await db.updateRecord({ databaseId: o.table, recordId: o.id, properties: props });
      }
    }
    flushNow();

    const byTable = new Map<string, string[]>();
    ops.forEach((o) => {
      const list2 = byTable.get(o.table) || [];
      if (!list2.includes(o.id)) list2.push(o.id);
      byTable.set(o.table, list2);
    });
    for (const [table, ids] of byTable) await syncMemory(table, ids);
    cacheLocal();
  } finally {
    muteJournal(false);
  }
}

export async function undo(): Promise<boolean> {
  if (hist.busy) return false;
  const e = hist.undo[hist.undo.length - 1];
  if (!e) return false;
  hist.busy = true;
  try {
    await applyOps(e.ops, 'undo');
    hist.undo.pop();
    hist.redo.push(e);
    if (hist.redo.length > LIMIT) hist.redo.shift();
    toast.show('已撤销：' + e.label);
    return true;
  } catch (err) {
    toast.show('撤销失败：' + (err instanceof Error ? err.message : String(err)));
    return false;
  } finally {
    hist.busy = false;
  }
}

export async function redo(): Promise<boolean> {
  if (hist.busy) return false;
  const e = hist.redo[hist.redo.length - 1];
  if (!e) return false;
  hist.busy = true;
  try {
    await applyOps(e.ops, 'redo');
    hist.redo.pop();
    hist.undo.push(e);
    trim();
    toast.show('已重做：' + e.label);
    return true;
  } catch (err) {
    toast.show('重做失败：' + (err instanceof Error ? err.message : String(err)));
    return false;
  } finally {
    hist.busy = false;
  }
}

/** 回到某一步之前：撤销它以及它之后的所有动作 */
export async function undoTo(id: number): Promise<void> {
  if (hist.busy) return;
  const at = hist.undo.findIndex((e) => e.id === id);
  if (at < 0) return;
  const count = hist.undo.length - at;
  hist.busy = true;
  try {
    for (let i = 0; i < count; i++) {
      const e = hist.undo[hist.undo.length - 1];
      if (!e) break;
      await applyOps(e.ops, 'undo');
      hist.undo.pop();
      hist.redo.push(e);
    }
    toast.show('已回到那一步之前');
  } catch (err) {
    toast.show('回退失败：' + (err instanceof Error ? err.message : String(err)));
  } finally {
    hist.busy = false;
  }
}

/** 撤销按钮的提示文案 */
export function undoHint(): string {
  if (hist.busy) return '正在撤销…';
  const e = hist.undo[hist.undo.length - 1];
  return e ? '撤销：' + e.label + '（Ctrl+Z）' : '没有可撤销的操作';
}
