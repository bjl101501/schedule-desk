/*
  批量动作：整库加载、清空、导入、种示例数据。
  这些都会动「库里有的行」，所以先收集 id 再删，避免边删边翻页漏行。
*/
import type { DbRow } from '$lib/domain/types';
import { DB_IDS } from '$lib/domain/constants';
import { today0, uid } from '$lib/domain/date';
import { normCountdown, normHabit, normPomo, normTask } from '$lib/domain/task';
import { calcStreak } from '$lib/domain/selectors';
import { buildSeed } from '$lib/domain/seed';
import { db, dbAvailable, flushNow, muteJournal } from '$lib/bridge/db';
import type { Bundle } from '$lib/domain/backup';
import { app } from '../app.svelte';
import { markOffline, markSynced, markSyncing } from '../sync.svelte';
import { toast } from '../toast.svelte';
import {
  autoSnapshotDaily, cacheLocal, flushCache, loadLocalCache, markSeeded, readDailySnaps, seededFlag, writeSafetySnapshot
} from './cache.svelte';
import { data, pushProxied } from './state.svelte';
import { beginTx, endTx } from './journal.svelte';
import { ensureHolidayCountdown } from './holiday';
import {
  apiAddPomo, apiAddTask, apiDeleteCountdown, apiDeleteHabit, apiDeletePomo, apiDeleteTask, apiSaveCountdown, apiSaveHabit
} from './write';

/* ---------- 读取 ---------- */
export function loadAllRows(
  which: 'tasks' | 'habits' | 'countdowns' | 'pomodoros',
  guard = 0,
  cursor: string | null = null,
  acc: DbRow[] = []
): Promise<DbRow[]> {
  if (guard > 120) return Promise.resolve(acc);
  const id = which === 'countdowns' ? 'gVxrxS4S2Zb2xddhphNdjT' : DB_IDS[which];
  return db.query({ databaseId: id, pageSize: 200, startCursor: cursor }).then((r) => {
    const next = acc.concat(r.results || []);
    if (r.hasMore && r.nextCursor && r.nextCursor !== cursor && (r.results || []).length) {
      return loadAllRows(which, guard + 1, r.nextCursor, next);
    }
    return next;
  });
}

export async function loadAll(): Promise<void> {
  if (!dbAvailable()) {
    markOffline('离线模式');
    loadLocalCache();
    app.loaded = true;
    ensureHolidayCountdown();
    return;
  }
  markSyncing();

  try {
    const [tasks, habits, countdowns, pomodoros] = await Promise.all([
      loadAllRows('tasks'),
      loadAllRows('habits'),
      loadAllRows('countdowns'),
      loadAllRows('pomodoros')
    ]);
    data.tasks = tasks.map(normTask);
    data.habits = habits.map(normHabit);
    data.countdowns = countdowns.map(normCountdown);
    data.pomodoros = pomodoros.map(normPomo);
    app.loaded = true;

    markSynced();
    autoSnapshotDaily();
    if (!data.tasks.length && !data.habits.length && !seededFlag()) {
      await seedDemo();
    } else {
      cacheLocal();
    }
    ensureHolidayCountdown();
  } catch (err) {
    console.error('[database] 数据加载失败:', err);

    markOffline('离线模式');
    loadLocalCache();
    app.loaded = true;
  }
}

/* ---------- 长任务（清空 / 导入）进度 ---------- */
export const dataJob = $state({ on: false, label: '', done: 0, total: 0 });

export type TableKey = 'tasks' | 'habits' | 'countdowns' | 'pomodoros';

const TABLE_DELETE: Record<TableKey, (id: string) => Promise<void>> = {
  tasks: apiDeleteTask,
  habits: apiDeleteHabit,
  countdowns: apiDeleteCountdown,
  pomodoros: apiDeletePomo
};

/** 历史记录里说的「清空事项 / 习惯」用的中文名 */
const TABLE_NOUN: Record<TableKey, string> = {
  tasks: '事项',
  habits: '习惯',
  countdowns: '纪念日',
  pomodoros: '专注记录'
};

/*
  真清空：必须按「库里有的行」逐条删，只清内存会让 loadAll 下次把数据读回来。
  顺序不能反：deleteRecord 会把行标成 deleted，边删边翻页会漏行，所以先收集再删。
*/
export async function clearTables(which: TableKey[], label = '正在清空'): Promise<void> {
  const online = dbAvailable();
  const ids: Partial<Record<TableKey, string[]>> = {};
  let total = 0;
  for (const w of which) {
    const rows = online ? await loadAllRows(w) : [];
    const list = rows.map((r) => String(r.id || '')).filter(Boolean);
    ids[w] = list;
    total += list.length;
  }

  dataJob.on = true;
  dataJob.label = label;
  dataJob.done = 0;
  dataJob.total = total;
  // 每 40 条 flush 一次会切出多条历史，用事务合成一条「清空」
  beginTx('清空' + which.map((w) => TABLE_NOUN[w]).join('、'));
  try {
    if (online) {
      for (const w of which) {
        const list = ids[w] || [];
        for (let i = 0; i < list.length; i += 40) {
          const chunk = list.slice(i, i + 40);
          await Promise.all(chunk.map((id) => TABLE_DELETE[w](id)));
          flushNow();
          dataJob.done += chunk.length;
          await new Promise((r) => setTimeout(r, 0));
        }
      }
    }
    data.tasks = [];
    data.habits = [];
    data.countdowns = [];
    data.pomodoros = [];
    // 不标记的话，下次 loadAll 会把示例数据重新种回来
    markSeeded();
    flushCache();
  } finally {
    endTx();
    dataJob.on = false;
  }
}

/*
  导入：追加是真追加（现有数据一条不动），replace 是先清空再导入。
  两条路径共用同一段写入逻辑，保证字段清洗完全一致。
  id 必须全部重映射：沿用备份里的旧 id 会与现有记录撞 keyed each，直接白屏。
*/
export async function importBundle(
  b: Bundle,
  mode: 'append' | 'replace' = 'append',
  clearWhich: TableKey[] = ['tasks', 'habits', 'countdowns', 'pomodoros']
): Promise<number> {
  const habits = b.habits;
  // 假期条目由 ensureHolidayCountdown 自己维护，导入会让「下一个假期」出现两条
  const countdowns = b.countdowns.filter((c) => c.sys !== 'holiday');
  const total = b.tasks.length + habits.length + countdowns.length + b.pomodoros.length;

  // 事务要在 clearTables 之前开：否则「替换」会被拆成「清空」「导入」两条历史，
  // 撤销一次只回去一半
  beginTx(mode === 'replace' ? '替换全部数据' : '导入备份');
  try {
    if (mode === 'replace') {
      writeSafetySnapshot('先清空再导入前');
      await clearTables(clearWhich, '正在清空');
    }

    dataJob.on = true;
    dataJob.label = mode === 'replace' ? '正在替换' : '正在导入';
    dataJob.done = 0;
    dataJob.total = total;
    let step = 0;
    const bump = async (): Promise<void> => {
      dataJob.done++;
      if (++step % 20 === 0) await new Promise((r) => setTimeout(r, 0));
    };

    for (const t of b.tasks) {
      t.id = '';
      await apiAddTask(t);
      if (!t.id) t.id = uid();
      pushProxied(data.tasks, t);
      await bump();
    }
    for (const h of habits) {
      h.id = '';
      await apiSaveHabit(h);
      if (!h.id) h.id = uid();
      pushProxied(data.habits, h);
      await bump();
    }
    for (const c of countdowns) {
      c.id = '';
      await apiSaveCountdown(c);
      if (!c.id) c.id = uid();
      pushProxied(data.countdowns, c);
      await bump();
    }
    for (const p of b.pomodoros) {
      p.id = '';
      await apiAddPomo(p);
      if (!p.id) p.id = uid();
      pushProxied(data.pomodoros, p);
      await bump();
    }
    markSeeded();
    flushCache();
  } finally {
    endTx();
    dataJob.on = false;
  }
  return total;
}

/* ---------- 示例数据 ---------- */
export async function seedDemo(): Promise<void> {
  const bundle = buildSeed();
  markSeeded();
  // 示例数据不是用户动作，不进撤销栈（否则一路 Ctrl+Z 会被一屏示例挡住）
  muteJournal(true);
  try {
    for (const t of bundle.tasks) {
      await apiAddTask(pushProxied(data.tasks, t));
    }
    for (const h of bundle.habits) {
      h.streak = calcStreak(h, today0());
      await apiSaveHabit(pushProxied(data.habits, h));
    }
    for (const c of bundle.countdowns) {
      await apiSaveCountdown(pushProxied(data.countdowns, c));
    }
    for (const p of bundle.pomodoros) {
      await apiAddPomo(pushProxied(data.pomodoros, p));
    }
  } finally {
    muteJournal(false);
  }
  cacheLocal();
  toast.show('已预置示例数据，可在「备份」里一键清空');
}

/** 恢复每日快照：必须真写库，否则重载后被库里的旧数据盖回去 */
export async function restoreDailySnap(day: string): Promise<boolean> {
  const hit = readDailySnaps().filter((x) => x.day === day)[0];
  if (!hit) return false;
  await importBundle(
    {
      tasks: hit.tasks || [],
      habits: hit.habits || [],
      countdowns: hit.countdowns || [],
      pomodoros: []
    },
    'replace',
    ['tasks', 'habits', 'countdowns']
  );
  toast.show('已恢复到 ' + day + ' 的快照');
  return true;
}
