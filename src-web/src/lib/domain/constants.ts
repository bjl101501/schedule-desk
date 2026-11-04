/* 常量表：与旧 01-core.js / 03-ui.js / 07-pomodoro.js 一一对应 */

/*
  注意：countdowns 的 id 少了第二个 x，是历史遗留的错拼。
  bridge/db.ts 的 ALIAS 会把它映射到真实表 gVxrxS4S2…，
  apiSaveCountdown 则直接写正确 id。两边都靠它兜底，禁止「顺手修正」。
*/
export const DB_IDS = {
  tasks: 'RBTQ4jwngkyjWiZE7VqCJZ',
  habits: 'xaX0HSTIH0O7cXXvPnbsR2',
  countdowns: 'gVxrS4S2Zb2xddhphNdjT',
  pomodoros: '6ny2WVjivlBujxY3ICpYGT'
} as const;

export const PRIOS = ['P0', 'P1', 'P2', 'P3'];
export const PRIO_LABEL: Record<string, string> = { P0: '最高', P1: '高', P2: '中', P3: '低', '': '无' };

export const EB_OFFSETS = [0, 5, 30, 720, 1440, 2880, 5760, 10080, 21600];
export const EB_LABEL = ['准时', '5 分钟', '30 分钟', '12 小时', '1 天', '2 天', '4 天', '7 天', '15 天'];

/**
 * 清单与标签的取色统一收到 domain/palette.ts：
 * 清单 = 冷色 16 色，标签 = 暖色 13 色。
 */
import { LIST_PALETTE, TAG_PALETTE } from './palette';

export { LIST_PALETTE, TAG_PALETTE };

export const LEGACY_COLORS: Record<string, string> = {
  '#2f6bff': '#177CB0', '#1f55e0': '#0E5F8A', '#8b5cf6': '#7A4E63', '#ec4899': '#B4557A',
  '#17a673': '#5E8C6A', '#0ea5b7': '#1685A9', '#f59f1b': '#C8892B', '#e5484d': '#C3272B',
  '#64748b': '#8C8279', '#cbd3df': '#8C8279', '#d5dbe4': '#8C8279'
};

export const REPEAT_OPTS = ['不重复', '每天', '每周', '每月', '每年', '工作日'];
export const QUAD_LABEL: Record<string, string> = {
  q1: '重要不紧急', q2: '重要紧急', q3: '不重要紧急', q4: '不重要不紧急'
};

export const HABIT_ICONS = ['sun', 'book', 'fire', 'heart', 'coffee', 'target', 'moon', 'star'];

export const THEMES = [
  { k: 'paper', name: '宣纸', bg: '#F7F3EA', panel: '#FFFEFA', brand: '#177CB0' },
  { k: 'celadon', name: '青瓷', bg: '#EEF2EE', panel: '#FCFEFB', brand: '#2E7D6F' },
  { k: 'moon', name: '月白', bg: '#EEF1F6', panel: '#FBFCFE', brand: '#3B6EA5' },
  { k: 'dusk', name: '暮色', bg: '#1B1A18', panel: '#232220', brand: '#6FA7C9' },
  { k: 'ink', name: '墨蓝', bg: '#15181F', panel: '#1C212B', brand: '#6FA8DC' }
];

export const FOCUS_MODES = {
  focus: { name: '专注', min: 25 },
  short: { name: '短休', min: 5 },
  long: { name: '长休', min: 15 }
} as const;

export type FocusMode = keyof typeof FOCUS_MODES;

/** 旧版配色 → 传统色，读取时顺手迁移，避免老数据花掉 */
export function themedColor(c?: string | null): string {
  const k = String(c || '').toLowerCase();
  return LEGACY_COLORS[k] || c || '#177CB0';
}
