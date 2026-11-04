/*
  本地数据库门面：把云表格接口（query/addRecord/updateRecord/deleteRecord）
  映射到 Rust 侧 db_bootstrap / db_apply。与旧 shim-head.js 逐段对应。

  两个不能动的地方：
  1. ALIAS：DB_IDS.countdowns 的错拼 `gVxrS4S2…` 要映射到真实表 `gVxrxS4S2…`。
  2. 80ms 合批：连续操作只发一次 db_apply，磁盘少写几次。
*/
import type { DbResult, DbRow, Props } from '../domain/types';
import { invoke, transport } from './invoke';
import { flattenProps } from '../domain/props';

const ALIAS: Record<string, string> = { gVxrS4S2Zb2xddhphNdjT: 'gVxrxS4S2Zb2xddhphNdjT' };

export interface DesktopConfig {
  version?: string;
  dataDir?: string;
  webdav?: { url?: string; username?: string; password?: string };
  repo?: string;
  deviceId?: string;
  lastSync?: number;
  closeToTray?: boolean;
}

interface DbState {
  tables: Record<string, DbRow[]>;
  config: DesktopConfig;
  firstRun: boolean;
  version: string;
}

interface Op {
  table: string;
  id: string;
  properties: Props;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
}

/**
 * 撤销日志的一条变更。
 * update 只带「被改的键」（before 是旧值、after 是新值），
 * delete / add 带整份属性 —— 复活一条记录必须原样还回去。
 */
export interface JOp {
  table: string;
  id: string;
  kind: 'add' | 'update' | 'delete';
  before: Props;
  after: Props;
  createdAt: number;
}

type JournalHook = (ops: JOp[], label: string) => void;

const state: DbState = { tables: {}, config: {}, firstRun: false, version: '' };
let ready: Promise<DbState> | null = null;
let pending: Op[] = [];
let pendingJ: JOp[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;

/** 撤销栈挂在 store 层，bridge 只负责把「这一批改了什么」交出去 */
let journalHook: JournalHook | null = null;
/** 回放撤销/重做时关掉捕获，否则撤销本身又被记一笔 */
let journalMuted = false;
/** 业务层用 act() 标一次动作名；80ms 合批后由 flush 消费 */
let journalLabel = '';

export function setJournalHook(fn: JournalHook | null): void {
  journalHook = fn;
}

export function muteJournal(v: boolean): void {
  journalMuted = v;
}

export function setJournalLabel(v: string): void {
  journalLabel = v;
}

function bootstrap(): Promise<DbState> {
  if (ready) return ready;
  ready = invoke<{ tables?: Record<string, DbRow[]>; config?: DesktopConfig; firstRun?: boolean; version?: string }>(
    'db_bootstrap'
  )
    .then((r) => {
      if (r && typeof r === 'object') {
        state.tables = r.tables || {};
        state.config = r.config || {};
        state.firstRun = !!r.firstRun;
        state.version = r.version || '';
      }
      return state;
    })
    .catch(() => state);
  return ready;
}

function bucket(id: string): DbRow[] {
  const key = ALIAS[id] || id;
  if (!Array.isArray(state.tables[key])) state.tables[key] = [];
  return state.tables[key];
}

function flush(): void {
  flushTimer = null;
  if (!pending.length) return;
  const ops = pending;
  pending = [];
  if (pendingJ.length) {
    const batch = pendingJ;
    pendingJ = [];
    if (!journalMuted) journalHook?.(batch, journalLabel);
    journalLabel = '';
  }
  invoke('db_apply', { ops }).catch(() => {});
}

function queue(op: Op): void {
  pending.push(op);
  if (!flushTimer) flushTimer = setTimeout(flush, 80);
}

function newId(): string {
  seq += 1;
  return 'r' + Date.now().toString(36) + seq.toString(36) + Math.random().toString(36).slice(2, 6);
}

/** 把 {text/date/number/select/checkbox} 还原成标量，normTask 才能读到中文列名 */
function flatten(rec: DbRow): DbRow {
  return {
    id: rec.id,
    record_id: rec.id,
    _id: rec.id,
    ...flattenProps(rec.properties as Record<string, unknown>)
  };
}

function liveRows(id: string): DbRow[] {
  return bucket(id).filter((r) => !r.deleted);
}

export interface DbApi {
  query(opts: { databaseId: string; pageSize?: number; startCursor?: string | null }): Promise<DbResult>;
  addRecord(opts: { databaseId: string; properties: Props }): Promise<{ id: string; record_id: string }>;
  updateRecord(opts: { databaseId: string; recordId: string; properties: Props }): Promise<Record<string, never>>;
  deleteRecord(opts: { databaseId: string; recordId: string }): Promise<Record<string, never>>;
  /** 用原 id 把一条记录写回去（撤销删除） */
  restoreRecord(opts: { databaseId: string; id: string; properties: Props; createdAt?: number }): Promise<Record<string, never>>;
  /** 按 id 取一条（撤销 update 后回填内存） */
  getRecord(opts: { databaseId: string; recordId: string }): Promise<DbRow | null>;
}

export const db: DbApi = {
  query(opts) {
    return bootstrap().then(() => {
      const rows = liveRows(opts.databaseId);
      let start = 0;
      if (opts.startCursor) {
        for (let i = 0; i < rows.length; i++) {
          if (rows[i].id === opts.startCursor) {
            start = i + 1;
            break;
          }
        }
      }
      const size = opts.pageSize || 200;
      const page = rows.slice(start, start + size);
      const hasMore = start + size < rows.length;
      return {
        results: page.map(flatten),
        hasMore,
        nextCursor: hasMore && page.length ? String(page[page.length - 1].id) : null
      };
    });
  },

  addRecord(opts) {
    return bootstrap().then(() => {
      const now = Date.now();
      const rec: DbRow = { id: newId(), properties: opts.properties as unknown as DbRow['properties'], createdAt: now, updatedAt: now };
      bucket(opts.databaseId).push(rec);
      const table = ALIAS[opts.databaseId] || opts.databaseId;
      if (!journalMuted) {
        pendingJ.push({ table, id: String(rec.id), kind: 'add', before: {}, after: { ...(opts.properties as Props) }, createdAt: now });
      }
      queue({
        table,
        id: String(rec.id),
        properties: opts.properties,
        createdAt: now,
        updatedAt: now,
        deleted: false
      });
      return { id: String(rec.id), record_id: String(rec.id) };
    });
  },

  updateRecord(opts) {
    return bootstrap().then(() => {
      const rows = bucket(opts.databaseId);
      const now = Date.now();
      const table = ALIAS[opts.databaseId] || opts.databaseId;
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].id === opts.recordId) {
          const props = (rows[i].properties || (rows[i].properties = {})) as Record<string, unknown>;
          // before 必须在合并之前取：合并之后这里就只剩新值了
          const before: Props = {};
          const after: Props = {};
          for (const k in opts.properties) {
            if (!Object.prototype.hasOwnProperty.call(opts.properties, k)) continue;
            before[k] = props[k] as Props[string];
            after[k] = opts.properties[k];
            props[k] = opts.properties[k];
          }
          rows[i].updatedAt = now;
          if (!journalMuted && Object.keys(after).length) {
            pendingJ.push({ table, id: String(rows[i].id), kind: 'update', before, after, createdAt: now });
          }
          queue({
            table,
            id: String(rows[i].id),
            properties: props as Props,
            createdAt: Number(rows[i].createdAt) || now,
            updatedAt: now,
            deleted: false
          });
          break;
        }
      }
      return {};
    });
  },

  deleteRecord(opts) {
    return bootstrap().then(() => {
      const rows = bucket(opts.databaseId);
      const now = Date.now();
      const table = ALIAS[opts.databaseId] || opts.databaseId;
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].id === opts.recordId) {
          const before = { ...((rows[i].properties || {}) as Props) };
          rows[i].deleted = true;
          rows[i].updatedAt = now;
          if (!journalMuted) {
            pendingJ.push({ table, id: String(rows[i].id), kind: 'delete', before, after: {}, createdAt: now });
          }
          queue({
            table,
            id: String(rows[i].id),
            properties: (rows[i].properties || {}) as Props,
            createdAt: Number(rows[i].createdAt) || now,
            updatedAt: now,
            deleted: true
          });
          break;
        }
      }
      return {};
    });
  },

  restoreRecord(opts) {
    return bootstrap().then(() => {
      const rows = bucket(opts.databaseId);
      const now = Date.now();
      const table = ALIAS[opts.databaseId] || opts.databaseId;
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].id === opts.id) {
          rows[i].properties = opts.properties as unknown as DbRow['properties'];
          rows[i].deleted = false;
          rows[i].updatedAt = now;
          queue({
            table,
            id: String(rows[i].id),
            properties: opts.properties,
            createdAt: Number(rows[i].createdAt) || opts.createdAt || now,
            updatedAt: now,
            deleted: false
          });
          return {};
        }
      }
      // 行已经不在了（被别处清理过）：按原 id 插回去，保证详情面板的 findTask(id) 仍能命中
      const createdAt = opts.createdAt || now;
      rows.push({ id: opts.id, properties: opts.properties as unknown as DbRow['properties'], createdAt, updatedAt: now });
      queue({ table, id: opts.id, properties: opts.properties, createdAt, updatedAt: now, deleted: false });
      return {};
    });
  },

  getRecord(opts) {
    return bootstrap().then(() => {
      const hit = bucket(opts.databaseId).find((r) => r.id === opts.recordId);
      return hit ? flatten(hit) : null;
    });
  }
};

/*
  注意：这里必须按需启动。ESM 的 import 会先于 main.ts 的语句求值，
  如果在模块顶层就 bootstrap()，mock 桥还没装上，第一次 invoke 必然失败，
  ready 会被永久缓存成「空数据」。
*/
export function dbReady(): Promise<DbState> {
  const p = bootstrap();
  if (window.__SD_DESKTOP__) window.__SD_DESKTOP__.ready = p;
  return p;
}

/**
 * 外部变更（WebDAV 同步完成 / 托盘立即同步）后，强制向宿主重新拉取最新表与配置。
 * 拉取前先冲刷本地 80ms 队列，避免尚未落盘的修改被冲掉。
 */
export function reloadDb(): Promise<DbState> {
  flushNow();
  ready = null;
  return dbReady();
}

export function dbConfig(): DesktopConfig {
  return state.config;
}

export function dbIsFirstRun(): boolean {
  return state.firstRun;
}

export function dbVersion(): string {
  return state.version;
}

/* 外部变更通知：Rust 侧没有事件广播，这里只做前端内的「拉到了新数据」信号。
   WebDAV 同步成功、或 tick 发现 lastSync 变化时发出，main.ts 决定要不要重载。 */
type UpdatedFn = () => void;
const updateFns = new Set<UpdatedFn>();

export function onUpdated(fn: UpdatedFn): () => void {
  updateFns.add(fn);
  return () => {
    updateFns.delete(fn);
  };
}

export function emitUpdated(): void {
  updateFns.forEach((fn) => fn());
}

export function flushNow(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flush();
  }
}

/** 有没有宿主（真机或 mock）。没有时按离线处理，读本地缓存 */
export function dbAvailable(): boolean {
  return !!transport();
}

// 手工排障时能在控制台直接查数据；类型见 types/globals.d.ts
window.__SMART_PAGE__ = window.__SMART_PAGE__ || {};
window.__SMART_PAGE__.database = db;
window.__SD_DESKTOP__ = {
  database: db,
  ready: Promise.resolve(null),
  state,
  invoke,
  theTables: () => state.tables,
  flushNow
};
