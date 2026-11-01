/* 下一个假期：官方接口失败时用内置表兜底 */
import { ymd, today0 } from './date';

export const HOLIDAY_API = 'https://holiday.ailcc.com/api/holiday/next/';

const FALLBACK = [
  { date: '2027-01-01', name: '元旦' },
  { date: '2027-04-05', name: '清明节' },
  { date: '2027-05-01', name: '劳动节' },
  { date: '2027-10-01', name: '国庆节' },
  { date: '2028-01-01', name: '元旦' },
  { date: '2028-04-04', name: '清明节' },
  { date: '2028-05-01', name: '劳动节' },
  { date: '2028-10-01', name: '国庆节' }
];

export interface HolidayInfo {
  date: string;
  name: string;
  est?: boolean;
  at?: number;
  src?: string;
}

export function fallbackHoliday(today: string = ymd(today0())): HolidayInfo {
  for (const h of FALLBACK) {
    if (h.date >= today) return { date: h.date, name: h.name, est: true, at: Date.now() };
  }
  const last = FALLBACK[FALLBACK.length - 1];
  return { date: last.date, name: last.name, est: true, at: Date.now() };
}

export function cleanHolidayName(n: unknown): string {
  return String(n || '节假日').replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').trim() || '节假日';
}
