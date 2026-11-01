/*
  本地数据库门面：把云表格接口（query/addRecord/updateRecord/deleteRecord）
  映射到 Rust 侧 db_bootstrap / db_apply。与旧 shim-head.js 逐段对应。

  两个不能动的地方：
  1. ALIAS：DB_IDS.countdowns 的错拼 `gVxrS4S2…` 要映射到真实表 `gVxrxS4S2…`。
  2. 80ms 合批：连续操作只发一次 db_apply，磁盘少写几次。
*/
import type { DbResult, DbRow, Props } from '../domain/types';
import { invoke, transport } from './invoke';

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

const state: DbState = { tables: {}, config: {}, firstRun: false, version: '' };
let ready: Promise<DbState> | null = null;
let pending: Op[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;

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
  const out: DbRow = { id: rec.id, record_id: rec.id, _id: rec.id };
  const props = (rec.properties || {}) as Record<string, unknown>;
  for (const k in props) {
    if (!Object.prototype.hasOwnProperty.call(props, k)) continue;
    const v = props[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      if ('text' in o) out[k] = o.text;
      else if ('date' in o) out[k] = o.date;
      else if ('number' in o) out[k] = o.number;
      else if ('select' in o) out[k] = o.select;
      else if ('checkbox' in o) out[k] = !!o.checkbox;
      else out[k] = v;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function liveRows(id: string): DbRow[] {
  return bucket(id).filter((r) => !r.deleted);
}

export interface DbApi {
  query(opts: { databaseId: string; pageSize?: number; startCursor?: string | null }): Promise<DbResult>;
  addRecord(opts: { databaseId: string; properties: Props }): Promise<{ id: string; record_id: string }>;
  updateRecord(opts: { databaseId: string; recordId: string; properties: Props }): Promise<Record<string, never>>;
  deleteRecord(opts: { databaseId: string; recordId: string }): Promise<Record<string, never>>;
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
      queue({
        table: ALIAS[opts.databaseId] || opts.databaseId,
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
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].id === opts.recordId) {
          const props = (rows[i].properties || (rows[i].properties = {})) as Record<string, unknown>;
          for (const k in opts.properties) {
            if (Object.prototype.hasOwnProperty.call(opts.properties, k)) props[k] = opts.properties[k];
          }
          rows[i].updatedAt = now;
          queue({
            table: ALIAS[opts.databaseId] || opts.databaseId,
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
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].id === opts.recordId) {
          rows[i].deleted = true;
          rows[i].updatedAt = now;
          queue({
            table: ALIAS[opts.databaseId] || opts.databaseId,
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
  }
};

/*
  注意：这里必须按需启动。ESM 的 import 会先于 main.ts 的语句求值，
  如果在模块顶层就 bootstrap()，mock 桥还没装上，第一次 invoke 必然失败，
  ready 会被永久缓存成「空数据」。
*/
export function dbReady(): Promise<DbState> {
  const p = bootstrap();
  const g = window as unknown as { __SD_DESKTOP__?: Record<string, unknown> };
  if (g.__SD_DESKTOP__) g.__SD_DESKTOP__.ready = p;
  return p;
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

export function dbSnapshot(): Record<string, DbRow[]> {
  return JSON.parse(JSON.stringify(state.tables));
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

/** 旧代码到处 getDB()，这里统一从这一个门面取 */
export function getDB(): DbApi {
  return db;
}

/** 有没有宿主（真机或 mock）。没有时按离线处理，读本地缓存 */
export function dbAvailable(): boolean {
  return !!transport();
}

// cdp-verify.mjs 与调试脚本依赖这两个全局，保留
const w = window as unknown as Record<string, unknown>;
w.__SMART_PAGE__ = (w.__SMART_PAGE__ as Record<string, unknown>) || {};
(w.__SMART_PAGE__ as Record<string, unknown>).database = db;
w.__SD_DESKTOP__ = {
  database: db,
  ready: Promise.resolve(null),
  state,
  invoke,
  theTables: () => state.tables,
  snapshot: () => dbSnapshot(),
  flushNow
};
