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

export const LIST_COLORS = ['#177CB0', '#7A4E63', '#5E8C6A', '#C8892B', '#1685A9', '#C3272B', '#B4557A', '#8C8279'];
export const LEGACY_COLORS: Record<string, string> = {
  '#2f6bff': '#177CB0', '#1f55e0': '#0E5F8A', '#8b5cf6': '#7A4E63', '#ec4899': '#B4557A',
  '#17a673': '#5E8C6A', '#0ea5b7': '#1685A9', '#f59f1b': '#C8892B', '#e5484d': '#C3272B',
  '#64748b': '#8C8279', '#cbd3df': '#8C8279', '#d5dbe4': '#8C8279'
};
export const TAG_COLORS = ['c0', 'c1', 'c2', 'c3', 'c4'];

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

/* 图标库：与旧 ICONS 表逐条一致，供 <Icon> 用 {@html} 渲染 */
export const ICONS: Record<string, string> = {
  check: '<path d="M20 6L9 17l-5-5"/>',
  box: '<path d="M3 8h18v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z"/><path d="M3 8l2-4h14l2 4"/><path d="M10 12h4"/>',
  split: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="12" r="2"/><path d="M6 7v10"/><path d="M18 10V7.5A2.5 2.5 0 0 0 15.5 5H8"/><path d="M18 14v.5a2.5 2.5 0 0 1-2.5 2.5H8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><path d="M7 7h.01"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  close: '<path d="M18 6L6 18M6 6l12 12"/>',
  chevL: '<path d="M15 18l-6-6 6-6"/>',
  chevR: '<path d="M9 18l6-6-6-6"/>',
  chevD: '<path d="M6 9l6 6 6-6"/>',
  play: '<path d="M5 3l14 9-14 9V3z"/>',
  pause: '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  more: '<circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/><circle cx="5" cy="12" r="1.5"/>',
  drag: '<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  fire: '<path d="M12 2s5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 1-3s.5 2 2 2c0-3 2-8 2-8z"/>',
  trend: '<path d="M3 3v18h18"/><path d="M7 15l3.5-4 3 2.5L20 7"/>',
  refresh: '<path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/>',
  bulb: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  card: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/>',
  kanban: '<rect x="3" y="3" width="5" height="18" rx="1.5"/><rect x="10" y="3" width="5" height="12" rx="1.5"/><rect x="17" y="3" width="4" height="15" rx="1.5"/>',
  timeline: '<path d="M3 12h18"/><rect x="6" y="6" width="6" height="4" rx="1"/><rect x="13" y="15" width="6" height="4" rx="1"/>',
  repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
  menu: '<path d="M3 12h18M3 6h18M3 18h18"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2a3 3 0 0 0-3-3z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  star: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  coffee: '<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><path d="M6 1v3M10 1v3M14 1v3"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  sun: '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'
};

/** 旧版配色 → 传统色，读取时顺手迁移，避免老数据花掉 */
export function themedColor(c?: string | null): string {
  const k = String(c || '').toLowerCase();
  return LEGACY_COLORS[k] || c || '#177CB0';
}
