/* 快速添加：从一句中文里认出日期、时间、标签、优先级 */
import type { QuickDraft } from './types';
import { addDays, dayDiff, pad2, startOfWeek, today0, ymd } from './date';

function applyAmPm(h: number, kw?: string): number {
  if (kw === '下午' || kw === '傍晚' || kw === '晚上') return h < 12 ? h + 12 : h;
  if (kw === '中午') return h < 11 ? h + 12 : h;
  if (kw === '凌晨') return h === 12 ? 0 : h;
  return h;
}

export function parseQuick(raw: string, today: Date = today0()): QuickDraft {
  const text = String(raw || '').trim();
  const out: QuickDraft = { title: '', date: '', time: '', tags: [], prio: '' };
  if (!text) return out;
  const t0 = today;
  let rest = text;

  // 优先级 !p0 / !0
  const pm = rest.match(/!\s*(p?[0-3])/i);
  if (pm) {
    out.prio = 'P' + pm[1].replace(/[pP]/, '');
    rest = rest.replace(pm[0], ' ');
  }
  // 标签 #xxx
  rest = rest.replace(/#([^\s#，,。]+)/g, (_m, g: string) => {
    out.tags.push(g);
    return ' ';
  });

  // 日期
  let dateFound = '';
  let dm = rest.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})[日号]?/);
  if (dm) {
    dateFound = dm[1] + '-' + pad2(parseInt(dm[2], 10)) + '-' + pad2(parseInt(dm[3], 10));
    rest = rest.replace(dm[0], ' ');
  }
  if (!dateFound) {
    dm = rest.match(/(\d{1,2})月(\d{1,2})[日号]/);
    if (dm) {
      const y = t0.getFullYear();
      let cand = new Date(y, parseInt(dm[1], 10) - 1, parseInt(dm[2], 10));
      if (dayDiff(t0, cand) < -180) cand = new Date(y + 1, parseInt(dm[1], 10) - 1, parseInt(dm[2], 10));
      dateFound = ymd(cand);
      rest = rest.replace(dm[0], ' ');
    }
  }
  if (!dateFound) {
    dm = rest.match(/(\d{1,2})[/-](\d{1,2})(?!\d)/);
    if (dm) {
      const hit = rest.indexOf(dm[0]);
      const prevCh = hit > 0 ? rest.charAt(hit - 1) : '';
      const mm = parseInt(dm[1], 10);
      const dd = parseInt(dm[2], 10);
      if (!/\d/.test(prevCh) && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        let cand2 = new Date(t0.getFullYear(), mm - 1, dd);
        if (dayDiff(t0, cand2) < -180) cand2 = new Date(t0.getFullYear() + 1, mm - 1, dd);
        dateFound = ymd(cand2);
        rest = rest.replace(dm[0], ' ');
      }
    }
  }
  if (!dateFound) {
    dm = rest.match(/(\d{1,2})\s*天[后後]/);
    if (dm) {
      dateFound = ymd(addDays(t0, parseInt(dm[1], 10)));
      rest = rest.replace(dm[0], ' ');
    }
  }
  if (!dateFound) {
    dm = rest.match(/(\d{1,2})\s*(?:周|个?星期)[后後]/);
    if (dm) {
      dateFound = ymd(addDays(t0, parseInt(dm[1], 10) * 7));
      rest = rest.replace(dm[0], ' ');
    }
  }
  if (!dateFound) {
    const rel: [string, number][] = [
      ['大后天', 3], ['后天', 2], ['明天', 1], ['明日', 1], ['今天', 0], ['今日', 0], ['昨天', -1]
    ];
    for (const [kw, off] of rel) {
      if (rest.indexOf(kw) > -1) {
        dateFound = ymd(addDays(t0, off));
        rest = rest.replace(kw, ' ');
        break;
      }
    }
  }
  if (!dateFound) {
    const wm = rest.match(/(下下|下|这|本)?\s*(?:周|星期)([一二三四五六日天])/);
    if (wm) {
      const wmap: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
      const targetDow = wmap[wm[2]];
      const dowOffset = targetDow === 0 ? 6 : targetDow - 1;
      const monday = startOfWeek(t0);
      let base = monday;
      if (wm[1] === '下') base = addDays(monday, 7);
      else if (wm[1] === '下下') base = addDays(monday, 14);
      let candW = addDays(base, dowOffset);
      if (!wm[1] && dayDiff(t0, candW) < 0) candW = addDays(candW, 7);
      dateFound = ymd(candW);
      rest = rest.replace(wm[0], ' ');
    }
  }
  out.date = dateFound || ymd(t0);

  // 时间
  let timeFound = '';
  let tm = rest.match(/(凌晨|早上|上午|中午|下午|傍晚|晚上|夜里)?\s*(\d{1,2})\s*[:：]\s*(\d{2})/);
  if (tm) {
    let hh = parseInt(tm[2], 10);
    const mi = parseInt(tm[3], 10);
    if (tm[1]) hh = applyAmPm(hh, tm[1]);
    if (hh >= 0 && hh < 24 && mi < 60) timeFound = pad2(hh) + ':' + pad2(mi);
    rest = rest.replace(tm[0], ' ');
  }
  if (!timeFound) {
    tm = rest.match(/(凌晨|早上|上午|中午|下午|傍晚|晚上|夜里)?\s*(\d{1,2})\s*[点時时](半|\d{1,2})?/);
    if (tm) {
      let hh2 = parseInt(tm[2], 10);
      let mi2 = 0;
      if (tm[3] === '半') mi2 = 30;
      else if (tm[3]) mi2 = parseInt(tm[3], 10);
      if (tm[1]) hh2 = applyAmPm(hh2, tm[1]);
      if (hh2 >= 0 && hh2 < 24 && mi2 < 60) timeFound = pad2(hh2) + ':' + pad2(mi2);
      rest = rest.replace(tm[0], ' ');
    }
  }
  out.time = timeFound;

  out.title = rest.replace(/\s+/g, ' ').replace(/^[\s,，。、]+|[\s,，。、]+$/g, '').trim();
  if (!out.title) out.title = '新事项';
  return out;
}
