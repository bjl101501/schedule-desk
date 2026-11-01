/*
  备份文件解析：两种形态都要认。
  1) 自家导出的 JSON —— camelCase（{app:'日程台', tasks:[{title, date, ...}]}）
  2) 数据文件 / 手动整理的 JSON —— 中文列名（{标题:{text:...}} 或 {标题:'...'}，也可能包在 properties 里）
  第三类是老版本的 {tables:{...}}，按表 id 取出记录后同样按中文列名处理。

  注意：不能用 normTask 直接吃 camelCase —— 它只读中文列名，会把自家备份导成空任务。
*/
import type { Countdown, DbRow, Habit, Pomodoro, RemindCfg, Sub, Task } from './types';
import { normCountdown, normHabit, normPomo, normTask } from './task';
import { isoToYmd, parseAnchor } from './date';
import { DB_IDS, EB_OFFSETS } from './constants';

export interface Bundle {
  tasks: Task[];
  habits: Habit[];
  countdowns: Countdown[];
  pomodoros: Pomodoro[];
}

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (v == null ? '' : String(v));
const num = (v: unknown, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

function propsOf(r: unknown): Record<string, unknown> {
  if (!r || typeof r !== 'object') return {};
  const o = r as Record<string, unknown>;
  if (o.properties && typeof o.properties === 'object') return o.properties as Record<string, unknown>;
  return o;
}

function hasChineseProps(r: unknown): boolean {
  if (!r || typeof r !== 'object') return false;
  // 列名可能直接挂在记录上，也可能包在 properties 里
  const o = propsOf(r);
  return typeof o['标题'] !== 'undefined' || typeof o['名称'] !== 'undefined';
}

/*
  中文列名在存档里是 {标题:{text:'x'}} 这种 PropValue 形态，
  而 normTask/normHabit 读的是「已展平」的行（标题:'x'）——桥接层平时做这层展平，
  导入走的是纯函数，得在这里补一次，否则标题会变成 '[object Object]'。
*/
function flatten(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  Object.keys(props).forEach((k) => {
    const v = props[k];
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if ('text' in o) out[k] = o.text;
      else if ('number' in o) out[k] = o.number;
      else if ('date' in o) out[k] = o.date;
      else if ('select' in o) out[k] = o.select;
      else if ('checkbox' in o) out[k] = o.checkbox;
      else out[k] = v;
    } else {
      out[k] = v;
    }
  });
  return out;
}


function normSubs(raw: unknown): Sub[] {
  return arr(raw)
    .map((x, i) => {
      const o = (x || {}) as Record<string, unknown>;
      return {
        id: 's' + i,
        title: str(o.title ?? o['标题'] ?? ''),
        min: Math.max(0, num(o.min ?? o['分钟'], 0)),
        days: Math.max(0, num(o.days ?? o['天'], 0)),
        done: !!o.done,
        doneAt: str(o.doneAt)
      };
    })
    .filter((s) => s.title || s.min || s.days);
}

/** 提醒配置整块是 JSON 字符串（提醒设置列），解析不出来就丢弃，避免脏 anchor 让提醒永远不响 */
function normCfg(raw: unknown): RemindCfg | null {
  let o = raw;
  if (typeof o === 'string') {
    const s = o.trim();
    if (!s) return null;
    try {
      o = JSON.parse(s);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, unknown>;
  const anchor = str(r.anchor);
  if (!anchor || !parseAnchor(anchor)) return null;
  let offsets = arr(r.offsets)
    .map((n) => num(n, NaN))
    .filter((n) => Number.isFinite(n) && n >= -100000 && n <= 100000);
  if (!offsets.length) offsets = EB_OFFSETS.slice();
  const read = arr(r.read)
    .map((n) => num(n, -1))
    .filter((i) => i >= 0 && i < offsets.length);
  const out: RemindCfg = { anchor, offsets, read };
  if (r.snooze != null) out.snooze = num(r.snooze, 5);
  return out;
}

const HM = /^\d{1,2}:\d{2}$/;

function camelTask(r: unknown): Task {
  const o = (r || {}) as Record<string, unknown>;
  const tags = arr(o.tags)
    .map((x) => str(x).replace(/^#/, '').trim())
    .filter(Boolean);
  return {
    id: '',
    title: str(o.title).trim(),
    note: str(o.note),
    list: str(o.list),
    tags: Array.from(new Set(tags)),
    prio: str(o.prio),
    important: !!o.important,
    urgent: !!o.urgent,
    done: !!o.done,
    remindMode: str(o.remindMode || '不提醒'),
    remindCfg: normCfg(o.remindCfg),
    date: isoToYmd(o.date),
    time: HM.test(str(o.time)) ? str(o.time) : '',
    estimate: Math.max(0, num(o.estimate, 0)),
    doneAt: str(o.doneAt),
    sort: num(o.sort, 0),
    subs: normSubs(o.subs),
    repeat: str(o.repeat),
    plan: !!o.plan,
    endDate: isoToYmd(o.endDate),
    endTime: HM.test(str(o.endTime)) ? str(o.endTime) : '',
    span: Math.max(1, num(o.span, 1)),
    createdAt: str(o.createdAt)
  };
}

function camelHabit(r: unknown): Habit {
  const o = (r || {}) as Record<string, unknown>;
  return {
    id: '',
    name: str(o.name).trim(),
    icon: str(o.icon || 'target'),
    color: str(o.color || '#177CB0'),
    target: Math.min(7, Math.max(1, num(o.target, 7))),
    streak: Math.max(0, num(o.streak, 0)),
    total: Math.max(0, num(o.total, 0)),
    log: arr(o.log).map((x) => str(x)).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)),
    createdAt: isoToYmd(o.createdAt)
  };
}

function camelCountdown(r: unknown): Countdown {
  const o = (r || {}) as Record<string, unknown>;
  return {
    id: '',
    name: str(o.name).trim(),
    type: str(o.type || '倒数日'),
    date: isoToYmd(o.date),
    note: str(o.note),
    color: str(o.color || '#177CB0'),
    group: str(o.group),
    sys: str(o.sys),
    createdAt: isoToYmd(o.createdAt)
  };
}

function camelPomo(r: unknown): Pomodoro {
  const o = (r || {}) as Record<string, unknown>;
  return {
    id: '',
    task: str(o.task || '未命名专注'),
    type: str(o.type || '专注'),
    duration: Math.max(0, num(o.duration, 0)),
    start: str(o.start),
    date: isoToYmd(o.date),
    sub: str(o.sub),
    pauseCount: Math.max(0, num(o.pauseCount, 0)),
    pauseSec: Math.max(0, num(o.pauseSec, 0))
  };
}

function pickTasks(list: unknown[]): Task[] {
  return list
    .map((r) => (hasChineseProps(r) ? normTask(flatten(propsOf(r)) as DbRow) : camelTask(r)))
    .filter((t) => !!t.title);
}

function pickByTable(tables: Record<string, unknown>): Bundle {
  const rows = (id: string): unknown[] => {
    const v = tables[id];
    return Array.isArray(v) ? v : [];
  };
  return {
    tasks: pickTasks(rows(DB_IDS.tasks)),
    habits: rows(DB_IDS.habits)
      .map((r) => normHabit(flatten(propsOf(r)) as DbRow))
      .filter((h) => !!h.name),
    countdowns: rows('gVxrxS4S2Zb2xddhphNdjT')
      .map((r) => normCountdown(flatten(propsOf(r)) as DbRow))
      .filter((c) => !!c.name),
    pomodoros: rows(DB_IDS.pomodoros)
      .map((r) => normPomo(flatten(propsOf(r)) as DbRow))
      .filter((p) => !!p.task)
  };
}

export function parseBundleText(text: string): Bundle {
  let o: unknown;
  try {
    o = JSON.parse(text);
  } catch {
    throw new Error('不是合法的 JSON 文件');
  }
  const root = (o || {}) as Record<string, unknown>;

  if (root.tables && typeof root.tables === 'object') {
    return pickByTable(root.tables as Record<string, unknown>);
  }

  const tasksRaw = Array.isArray(o) ? (o as unknown[]) : arr(root.tasks);
  const bundle: Bundle = {
    tasks: pickTasks(tasksRaw),
    habits: arr(root.habits)
      .map((r) => (hasChineseProps(r) ? normHabit(flatten(propsOf(r)) as DbRow) : camelHabit(r)))
      .filter((h) => !!h.name),
    countdowns: arr(root.countdowns)
      .map((r) => (hasChineseProps(r) ? normCountdown(flatten(propsOf(r)) as DbRow) : camelCountdown(r)))
      .filter((c) => !!c.name),
    pomodoros: arr(root.pomodoros)
      .map((r) => (hasChineseProps(r) ? normPomo(flatten(propsOf(r)) as DbRow) : camelPomo(r)))
      .filter((p) => !!p.task)
  };

  const total = bundle.tasks.length + bundle.habits.length + bundle.countdowns.length + bundle.pomodoros.length;
  if (!total) throw new Error('这个文件里没有可导入的事项');
  return bundle;
}

export function bundleCount(b: Bundle): number {
  return b.tasks.length + b.habits.length + b.countdowns.length + b.pomodoros.length;
}
