/*
  数据层：唯一数据源 + 落库。命令式刷新（refreshAll 重绘整个 #content）在这里退场，
  组件靠 $state 代理数组自动失效；refreshAll 只留给调试与测试门面。
*/
import type { Countdown, DbRow, Habit, Pomodoro, Task } from '$lib/domain/types';
import { DB_IDS } from '$lib/domain/constants';
import { stampNow, today0, uid, ymd } from '$lib/domain/date';
import {
  cloneNextRepeat, normCountdown, normHabit, normPomo, normTask, subStats, syncDoneFromSubs
} from '$lib/domain/task';
import { calcStreak } from '$lib/domain/selectors';
import { cdToProps, habitToProps, pomoToProps, taskToProps } from '$lib/domain/props';
import { buildSeed } from '$lib/domain/seed';
import { cleanHolidayName, fallbackHoliday, HOLIDAY_API, type HolidayInfo } from '$lib/domain/holiday';
import { db, dbAvailable, flushNow } from '$lib/bridge/db';
import { STORAGE_KEYS, readJson, readRaw, writeJson, writeRaw } from './storage';
import type { Bundle } from '$lib/domain/backup';
import { app } from './app.svelte';
import { markOffline, markSynced, markSyncing } from './sync.svelte';
import { toast } from './toast.svelte';

export const data = $state({
  tasks: [] as Task[],
  habits: [] as Habit[],
  countdowns: [] as Countdown[],
  pomodoros: [] as Pomodoro[]
});

export function findTask(id: string): Task | undefined {
  return data.tasks.find((t) => t.id === id);
}

/*
  $state 的数组会把元素包成代理并缓存读到的值：
  先 push 再改原始对象的 id，代理视图读到的仍是空串。
  所以凡是「推入后还要写 id」的地方，都必须拿数组里那个代理元素再写。
*/
function pushProxied<T extends object>(arr: T[], item: T): T {
  arr.push(item);
  return arr[arr.length - 1];
}

/* ---------- 读取 ---------- */
function loadAllRows(which: 'tasks' | 'habits' | 'countdowns' | 'pomodoros', guard = 0, cursor: string | null = null, acc: DbRow[] = []): Promise<DbRow[]> {
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

const SNAP_KEY = STORAGE_KEYS.snapshot;

/** 删除前的安全快照：与备份弹窗的「恢复上次快照」共用同一个键 */
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

export { SNAP_KEY };

type TableKey = 'tasks' | 'habits' | 'countdowns' | 'pomodoros';

const TABLE_DELETE: Record<TableKey, (id: string) => Promise<void>> = {
  tasks: apiDeleteTask,
  habits: apiDeleteHabit,
  countdowns: apiDeleteCountdown,
  pomodoros: apiDeletePomo
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

  try {
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
    dataJob.on = false;
  }
  return total;
}

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

/* ---------- 写库 ---------- */
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

export function apiSaveHabit(h: Habit): Promise<void> {
  if (!h.id) {
    return db
      .addRecord({ databaseId: DB_IDS.habits, properties: habitToProps(h) })
      .then((r) => {
        if (r && r.id) h.id = r.id;
      })
      .catch((e) => {
        console.error('[database] 习惯保存失败:', e);
        toast.show('习惯未同步');
      });
  }
  return db
    .updateRecord({ databaseId: DB_IDS.habits, recordId: h.id, properties: habitToProps(h) })
    .then(() => {})
    .catch((e) => {
      console.error('[database] 习惯更新失败:', e);
      toast.show('习惯未同步');
    });
}

export function apiDeleteHabit(id: string): Promise<void> {
  return db.deleteRecord({ databaseId: DB_IDS.habits, recordId: id }).then(() => {}).catch((e) => console.error(e));
}

export function apiSaveCountdown(c: Countdown): Promise<void> {
  if (!c.id) {
    return db
      .addRecord({ databaseId: 'gVxrxS4S2Zb2xddhphNdjT', properties: cdToProps(c) })
      .then((r) => {
        if (r && r.id) c.id = r.id;
      })
      .catch((e) => {
        console.error('[database] 纪念日保存失败:', e);
        toast.show('纪念日未同步');
      });
  }
  return db
    .updateRecord({ databaseId: 'gVxrxS4S2Zb2xddhphNdjT', recordId: c.id, properties: cdToProps(c) })
    .then(() => {})
    .catch((e) => {
      console.error(e);
      toast.show('纪念日未同步');
    });
}

export function apiDeleteCountdown(id: string): Promise<void> {
  return db.deleteRecord({ databaseId: 'gVxrxS4S2Zb2xddhphNdjT', recordId: id }).then(() => {}).catch((e) => console.error(e));
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

/* ---------- 任务操作 ---------- */
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

/* ---------- 示例数据 ---------- */
function seededFlag(): boolean {
  try {
    return readRaw(STORAGE_KEYS.seeded) === '1';
  } catch {
    return false;
  }
}
function markSeeded(): void {
  // 必须写裸 '1'：Rust 侧第一次启动的判断就是 seeded === '1'，
  // 写成 JSON（"1"）会被当成「没种过」，清空后重启又把示例数据种回来
  writeRaw(STORAGE_KEYS.seeded, '1');
}

export async function seedDemo(): Promise<void> {
  const bundle = buildSeed();
  markSeeded();
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
  cacheLocal();
  toast.show('已预置示例数据，可在「备份」里一键清空');
}

/* ---------- 下一个假期 ---------- */
const HOLIDAY_CACHE = STORAGE_KEYS.holiday;
let holidayBusy = false;

function fetchNextHoliday(cb: (h: HolidayInfo) => void): void {
  const today = ymd(today0());
  let cache = readJson<HolidayInfo | null>(HOLIDAY_CACHE, null);
  if (cache && cache.date && cache.date >= today && cache.at && Date.now() - cache.at < 2 * 3600 * 1000) {
    cb(cache);
    return;
  }
  let done = false;
  const finish = (v: HolidayInfo) => {
    if (done) return;
    done = true;
    writeJson(HOLIDAY_CACHE, v);
    cb(v);
  };
  const giveUp = () => finish(fallbackHoliday(today));
  const timer = setTimeout(giveUp, 7000);

  const tryNext = () =>
    fetch(HOLIDAY_API + today + '?type=Y', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        const h = j && j.holiday;
        if (h && h.date && String(h.date) >= today) {
          clearTimeout(timer);
          finish({ date: String(h.date), name: cleanHolidayName(h.name), at: Date.now(), est: false, src: 'next' });
          return true;
        }
        return false;
      })
      .catch(() => false);

  const fromYear = (y: number) =>
    fetch(HOLIDAY_API.replace('/next/', '/year/') + y, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        const map = (j && j.holiday) || {};
        for (const k of Object.keys(map).sort()) {
          const it = map[k];
          if (it && it.holiday && it.date && String(it.date) >= today) {
            clearTimeout(timer);
            finish({ date: String(it.date), name: cleanHolidayName(it.name || it.extra_info), at: Date.now(), est: false, src: 'year' });
            return true;
          }
        }
        return false;
      })
      .catch(() => false);

  tryNext().then((hit) => {
    if (hit) return;
    const y = today0().getFullYear();
    fromYear(y).then((ok) => {
      if (ok) return;
      fromYear(y + 1).then((ok2) => {
        if (!ok2) giveUp();
      });
    });
  });
}

export function ensureHolidayCountdown(): void {
  if (holidayBusy) return;
  holidayBusy = true;
  fetchNextHoliday((h) => {
    holidayBusy = false;
    const item = data.countdowns.filter((c) => c.sys === 'holiday')[0];
    const nm = '下一个假期 · ' + h.name;
    const note = h.est ? '预估 · 官方未公布' : '官方放假安排';
    if (!item) {
      const c: Countdown = {
        id: '', name: nm, type: '倒数日', date: h.date, note, color: '#C3272B',
        group: '假期', sys: 'holiday', createdAt: ymd(today0())
      };
      data.countdowns.push(c);
      cacheLocal();
      apiSaveCountdown(c);
      return;
    }
    if (item.date !== h.date || item.name !== nm || item.note !== note || item.group !== '假期') {
      item.date = h.date;
      item.name = nm;
      item.note = note;
      item.group = '假期';
      item.sys = 'holiday';
      if (!item.color || item.color === '#177CB0') item.color = '#C3272B';
      cacheLocal();
      apiSaveCountdown(item);
    }
  });
}

/* ---------- 每日快照 ---------- */
const DAILY_KEY = STORAGE_KEYS.daily;

export interface DailySnap {
  day: string;
  at: number;
  tasks: Task[];
  habits: Habit[];
  countdowns: Countdown[];
}

export function readDailySnaps(): DailySnap[] {
  const v = readJson<DailySnap[]>(DAILY_KEY, []);
  return Array.isArray(v) ? v : [];
}

export function autoSnapshotDaily(): void {
  try {
    const day = ymd(today0());
    let arr = readDailySnaps();
    if (arr.some((x) => x.day === day)) return;
    if (!data.tasks.length && !data.habits.length && !data.countdowns.length) return;
    arr.push({
      day, at: Date.now(),
      tasks: $state.snapshot(data.tasks) as Task[],
      habits: $state.snapshot(data.habits) as Habit[],
      countdowns: $state.snapshot(data.countdowns) as Countdown[]
    });
    if (arr.length > 7) arr = arr.slice(arr.length - 7);
    writeJson(DAILY_KEY, arr);
  } catch {
    /* ignore */
  }
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

