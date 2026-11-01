/*
  「下一个假期」纪念日：先读 2 小时缓存，再打两个接口兜底，7 秒拿不到就用本地推算。
  这条系统条目只在内存里改字段，写库走 apiSaveCountdown。
*/
import type { Countdown } from '$lib/domain/types';
import { today0, ymd } from '$lib/domain/date';
import { cleanHolidayName, fallbackHoliday, HOLIDAY_API, type HolidayInfo } from '$lib/domain/holiday';
import { STORAGE_KEYS, readJson, writeJson } from '../storage';
import { cacheLocal } from './cache.svelte';
import { data } from './state.svelte';
import { apiSaveCountdown } from './write';

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
