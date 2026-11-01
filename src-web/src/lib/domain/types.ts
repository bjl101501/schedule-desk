/* 领域类型：与 schedule.json 的 properties（中文列名）一一对应 */

export type ViewKey = 'today' | 'next7' | 'inbox' | 'calendar' | 'quadrant' | 'habit' | 'countdown' | 'focus' | 'stats';
export type VMode = 'list' | 'card' | 'kanban' | 'timeline';
export type CalMode = 'year' | 'month' | 'week' | 'multiweek' | 'day' | 'multiday';
export type KanbanGroup = 'priority' | 'list' | 'tags' | 'status' | 'date';
export type Prio = '' | 'P0' | 'P1' | 'P2' | 'P3';
export type SortMode = 'time' | 'manual';

export interface Sub {
  id: string;
  title: string;
  min: number;
  days: number;
  done: boolean;
  doneAt: string;
}

/**
 * 打开任务编辑器时携带的意图。之前是 Record<string, unknown>，下游一路 as 到底。
 */
export interface EditorPreset {
  /** 从详情进编辑器：保存 / 返回后回到详情 */
  fromDetail?: boolean;
  /** 快速添加带过来的初值 */
  initial?: { title?: string; date?: string; time?: string; tags?: string[]; prio?: string };
  /** 看板列头「+」：按当前分组维度预填（kind 与 KanbanGroup 同名） */
  group?: { kind: string; key: string };
  /** 清单 / 优先级快捷新建 */
  presetGroup?: string;
  value?: string;
  /** 直接落到指定清单 */
  list?: string;
}

export interface RemindCfg {
  anchor: string;
  /** 相对 anchor 的提前量（分钟），0 = 到点 */
  offsets: number[];
  /** 已确认的节点下标；不写回这里，铃铛就永远清不掉 */
  read: number[];
  snooze?: number;
  /** 1 = 结束时刻再提醒一次。Rust 侧 remind.rs 会读这个键，别改名 */
  end?: number;
}

export interface Task {
  id: string;
  title: string;
  note: string;
  list: string;
  tags: string[];
  prio: Prio | string;
  important: boolean;
  urgent: boolean;
  done: boolean;
  remindMode: string;
  remindCfg: RemindCfg | null;
  date: string;
  time: string;
  estimate: number;
  doneAt: string;
  sort: number;
  subs: Sub[];
  repeat: string;
  plan: boolean;
  endDate: string;
  endTime: string;
  span: number;
  createdAt: string;
  _new?: boolean;
}

export interface Habit {
  id: string;
  name: string;
  icon: string;
  color: string;
  target: number;
  streak: number;
  total: number;
  log: string[];
  createdAt: string;
}

export interface Countdown {
  id: string;
  name: string;
  type: string;
  date: string;
  note: string;
  color: string;
  group: string;
  sys: string;
  createdAt: string;
}

export interface Pomodoro {
  id: string;
  task: string;
  type: string;
  duration: number;
  start: string;
  date: string;
  sub: string;
  pauseCount: number;
  pauseSec: number;
}

export type PropValue =
  | { text: string }
  | { date: string }
  | { number: number }
  | { select: string }
  | { checkbox: boolean };

export type Props = Record<string, PropValue>;

/** 云端返回的已解包行：id + 中文列名 → 标量 */
export type DbRow = Record<string, unknown> & { id?: string; record_id?: string; _id?: string };

export interface TaskWindow {
  start: Date;
  end: Date;
  allDay: boolean;
  span: number;
  hasEstimate: boolean;
  hasEnd: boolean;
}

export type TaskStateKey =
  | 'none' | 'done' | 'unscheduled' | 'planned' | 'upcoming' | 'remindSoon' | 'ongoing' | 'overdue';

export interface TaskState {
  key: TaskStateKey;
  label: string;
  tone: '' | 'cyan' | 'orange' | 'brand' | 'red';
}

export interface ReminderState {
  at: number;
  idx: number;
  offset: number;
  overdue: boolean;
  mode: string;
}

export interface Filters {
  prio: string[];
  tags: string[];
  status: 'todo' | 'done' | 'all';
  from: string;
  to: string;
  kw: string;
}

export interface Seg {
  i: number;
  title: string;
  days: number;
  done: boolean;
  start: Date | null;
  end: Date | null;
  dayFrom: number;
}

export interface SubStat {
  n: number;
  done: number;
  min: number;
  pct: number;
  all: boolean;
}

export interface QuickDraft {
  title: string;
  date: string;
  time: string;
  tags: string[];
  prio: string;
}

export interface DbResult {
  results: DbRow[];
  hasMore: boolean;
  nextCursor: string | null;
}

/** 前端 ↔ Rust 的 16 条命令的返回形状（只写用到字段，其余宽松） */
export interface SyncStatus {
  mode?: string;
  text?: string;
  detail?: string;
  lastSync?: string;
  [k: string]: unknown;
}
