/* 日期与文案工具：全部无副作用，需要「今天」的场合由调用方把 today 传进来 */

export function pad2(n: number): string {
  return n < 10 ? '0' + n : '' + n;
}

export function ymd(d: Date): string {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

export function parseYmd(s?: string | null): Date | null {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
}

export function isoToYmd(v: unknown): string {
  if (!v) return '';
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[1] + '-' + m[2] + '-' + m[3] : '';
}

export function today0(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

export function dayDiff(a: Date | null, b: Date | null): number {
  if (!a || !b) return 0;
  const x = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const y = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((y - x) / 86400000);
}

export function sameDay(a: Date | null, b: Date | null): boolean {
  return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const w = x.getDay();
  return addDays(x, w === 0 ? -6 : 1 - w);
}

export function parseJson<T = unknown>(s: unknown): T | null {
  if (!s) return null;
  try {
    return JSON.parse(String(s)) as T;
  } catch {
    return null;
  }
}

export function parseHM(s?: string | null): number | null {
  if (!s) return null;
  const m = String(s).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

export function hmStr(min: number): string {
  const v = Math.max(0, Math.min(24 * 60, Math.round(min)));
  return pad2(Math.floor(v / 60)) + ':' + pad2(v % 60);
}

/** 完成时刻精确到分钟，存 "YYYY-MM-DD HH:mm" */
export function stampNow(d?: Date): string {
  const x = d || new Date();
  return ymd(x) + ' ' + pad2(x.getHours()) + ':' + pad2(x.getMinutes());
}

export function stampDay(v?: string): string {
  const m = String(v || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

export function stampTime(v?: string): string {
  const m = String(v || '').match(/^\d{4}-\d{2}-\d{2}[ T](\d{2}:\d{2})/);
  return m ? m[1] : '';
}

/** 完成时间 → 10/30 15:30；只有日期的旧数据显示 10/30 */
export function doneText(v?: string): string {
  const d = stampDay(v);
  const hm = stampTime(v);
  if (!d) return '';
  const p = parseYmd(d);
  return (p ? p.getMonth() + 1 + '/' + p.getDate() : d) + (hm ? ' ' + hm : '');
}

/** 只取最大单位并向下取整：2 天 / 3 小时 / 45 分钟 */
export function coarseSpan(ms: number): string {
  const min = Math.max(1, Math.floor(Math.max(0, ms) / 60000));
  if (min >= 1440) return Math.floor(min / 1440) + ' 天';
  if (min >= 60) return Math.floor(min / 60) + ' 小时';
  return min + ' 分钟';
}

/** 同年只写月/日；跨年才补年份 */
export function rangeShort(a: Date | null, b: Date | null): string {
  if (!a || !b) return '';
  const s = a.getMonth() + 1 + '/' + a.getDate();
  const e = b.getMonth() + 1 + '/' + b.getDate();
  if (a.getFullYear() !== b.getFullYear()) {
    return a.getFullYear() + '/' + s + ' – ' + b.getFullYear() + '/' + e;
  }
  return s + ' – ' + e;
}

export function durText(min: number): string {
  const v = Math.round(min || 0);
  if (v < 60) return v + ' 分钟';
  const h = Math.floor(v / 60);
  const m = v % 60;
  return m ? h + ' 小时 ' + m + ' 分' : h + ' 小时';
}

export function weekdayName(d: Date): string {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
}

export function dateLabel(d: Date | null, today: Date = today0()): string {
  if (!d) return '';
  const diff = dayDiff(today, d);
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  if (diff === -1) return '昨天';
  if (diff > 1 && diff < 7) return weekdayName(d);
  if (d.getFullYear() !== today.getFullYear()) return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  return d.getMonth() + 1 + '月' + d.getDate() + '日';
}

export function shortDate(d: Date | null, today: Date = today0()): string {
  if (!d) return '';
  const diff = dayDiff(today, d);
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  if (diff === -1) return '昨天';
  return d.getMonth() + 1 + '/' + d.getDate();
}

export function mdShort(d: Date | null): string {
  return d ? d.getMonth() + 1 + '/' + d.getDate() : '';
}

export function uid(): string {
  return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** 提醒基准时间：'YYYY-MM-DD HH:mm'，缺时刻按 09:00 */
export function parseAnchor(s?: string | null): Date | null {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  return new Date(
    parseInt(m[1], 10),
    parseInt(m[2], 10) - 1,
    parseInt(m[3], 10),
    m[4] ? parseInt(m[4], 10) : 9,
    m[5] ? parseInt(m[5], 10) : 0
  );
}

export function tagColor(name: string, palette: string[]): string {
  let n = 0;
  const s = String(name);
  for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) % 997;
  return palette[n % palette.length];
}

/** 'YYYY-MM-DD HH:mm' → 'YYYY-MM-DDTHH:mm'（给 datetime-local 语义用） */
export function toDtLocal(s?: string | null): string {
  const m = String(s || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (!m) return '';
  return m[1] + '-' + pad2(parseInt(m[2], 10)) + '-' + pad2(parseInt(m[3], 10)) + 'T' + pad2(m[4] ? parseInt(m[4], 10) : 9) + ':' + (m[5] || '00');
}

export function fromDtLocal(v?: string | null): string {
  return v ? String(v).replace('T', ' ') : '';
}
