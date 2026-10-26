/* ============ 日程台 · 应用脚本 ============ */
/* ---------- 数据库绑定 ---------- */
var DB_IDS = {
  tasks: 'RBTQ4jwngkyjWiZE7VqCJZ',
  habits: 'xaX0HSTIH0O7cXXvPnbsR2',
  countdowns: 'gVxrS4S2Zb2xddhphNdjT',
  pomodoros: '6ny2WVjivlBujxY3ICpYGT'
};
var PRIOS = ['P0', 'P1', 'P2', 'P3'];
var PRIO_LABEL = { 'P0': '最高', 'P1': '高', 'P2': '中', 'P3': '低', '': '无' };
var EB_OFFSETS = [0, 5, 30, 720, 1440, 2880, 5760, 10080, 21600];
var EB_LABEL = ['准时', '5 分钟', '30 分钟', '12 小时', '1 天', '2 天', '4 天', '7 天', '15 天'];
var LIST_COLORS = ['#177CB0', '#7A4E63', '#5E8C6A', '#C8892B', '#1685A9', '#C3272B', '#B4557A', '#8C8279'];
// 旧版配色 → 传统色，读取时顺手迁移，避免老数据花掉
var LEGACY_COLORS = {
  '#2f6bff': '#177CB0', '#1f55e0': '#0E5F8A', '#8b5cf6': '#7A4E63', '#ec4899': '#B4557A',
  '#17a673': '#5E8C6A', '#0ea5b7': '#1685A9', '#f59f1b': '#C8892B', '#e5484d': '#C3272B',
  '#64748b': '#8C8279', '#cbd3df': '#8C8279', '#d5dbe4': '#8C8279'
};
function themedColor(c) {
  var k = String(c || '').toLowerCase();
  return LEGACY_COLORS[k] || c || '#177CB0';
}
var TAG_COLORS = ['c0', 'c1', 'c2', 'c3', 'c4'];

/* ---------- 全局状态 ---------- */
var APP_VERSION = 'v2.1.4';
var S = {
  view: 'today',
  vmode: 'list',
  kanbanGroup: 'priority',
  calMode: 'month',
  calDays: 3,
  calWeeks: 3,
  calReturn: null,
  cursor: new Date(),
  selectedList: null,
  selectedTag: null,
  focusRange: 'all',
  tasks: [], habits: [], countdowns: [], pomodoros: [],
  loaded: false,
  online: true,
  busy: 0,
  filters: { prio: [], tags: [], status: 'todo', from: '', to: '', kw: '' },
  timer: { mode: 'focus', total: 25 * 60, left: 25 * 60, running: false, taskId: '', taskTitle: '', subIndex: '', subTitle: '', pauseCount: 0, pauseSec: 0, pauseStart: 0, round: 1 },
  tick: null,
  sortMode: 'time',
  subFold: {},
  detailId: '',
  habitMode: 'cards',
  subOnly: {},
  habitCursor: null,
  schemaReady: false
};

/* ---------- 工具 ---------- */
function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function parseYmd(s) {
  if (!s) return null;
  var m = String(s).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
}
function isoToYmd(v) {
  if (!v) return '';
  var s = String(v);
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[1] + '-' + m[2] + '-' + m[3] : '';
}
function today0() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
function dayDiff(a, b) {
  if (!a || !b) return 0;
  var x = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  var y = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((y - x) / 86400000);
}
function sameDay(a, b) {
  return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function startOfWeek(d) {
  var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var w = x.getDay();
  return addDays(x, w === 0 ? -6 : 1 - w);
}
function parseJson(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch (e) { return null; }
}
function parseHM(s) {
  if (!s) return null;
  var m = String(s).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}
function hmStr(min) {
  min = Math.max(0, Math.min(24 * 60, Math.round(min)));
  return pad2(Math.floor(min / 60)) + ':' + pad2(min % 60);
}
function durText(min) {
  min = Math.round(min || 0);
  if (min < 60) return min + ' 分钟';
  var h = Math.floor(min / 60), m = min % 60;
  return m ? h + ' 小时 ' + m + ' 分' : h + ' 小时';
}
function weekdayName(d) { return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]; }
function dateLabel(d) {
  if (!d) return '';
  var t = today0(), diff = dayDiff(t, d);
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  if (diff === -1) return '昨天';
  if (diff > 1 && diff < 7) return weekdayName(d);
  if (d.getFullYear() !== t.getFullYear()) return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  return (d.getMonth() + 1) + '月' + d.getDate() + '日';
}
function shortDate(d) {
  if (!d) return '';
  var t = today0(), diff = dayDiff(t, d);
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  if (diff === -1) return '昨天';
  return (d.getMonth() + 1) + '/' + d.getDate();
}
function tagColor(name) {
  var n = 0, s = String(name);
  for (var i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) % 997;
  return TAG_COLORS[n % TAG_COLORS.length];
}
function uid() { return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function svgIcon(name, cls) {
  var p = ICONS[name] || '';
  return '<svg viewBox="0 0 24 24" width="1em" height="1em" class="' + (cls || '') + '">' + p + '</svg>';
}

var ICONS = {
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

/* ---------- 数据层 ---------- */
function getDB() {
  return (window.__SMART_PAGE__ && window.__SMART_PAGE__.database) ? window.__SMART_PAGE__.database : null;
}
function setSync(state, text) {
  var pill = document.getElementById('syncPill');
  var t = document.getElementById('syncText');
  if (!pill || !t) return;
  pill.className = 'sync-pill' + (state === 'syncing' ? ' syncing' : state === 'offline' ? ' offline' : '');
  t.textContent = text;
  pill.title = text;
}
function loadAllRows(which, guard, cursor, acc) {
  guard = guard || 0; acc = acc || [];
  var db = getDB();
  if (!db) return Promise.resolve(acc);
  if (guard > 120) return Promise.resolve(acc);
  var q = null;
  if (which === 'tasks') q = db.query({ databaseId: 'RBTQ4jwngkyjWiZE7VqCJZ', pageSize: 200, startCursor: cursor });
  else if (which === 'habits') q = db.query({ databaseId: 'xaX0HSTIH0O7cXXvPnbsR2', pageSize: 200, startCursor: cursor });
  else if (which === 'countdowns') q = db.query({ databaseId: 'gVxrxS4S2Zb2xddhphNdjT', pageSize: 200, startCursor: cursor });
  else q = db.query({ databaseId: '6ny2WVjivlBujxY3ICpYGT', pageSize: 200, startCursor: cursor });
  return q.then(function (r) {
    acc = acc.concat(r.results || []);
    var next = r.nextCursor;
    if (r.hasMore && next && next !== cursor && (r.results || []).length) {
      return loadAllRows(which, guard + 1, next, acc);
    }
    return acc;
  });
}
function loadAll() {
  var db = getDB();
  if (!db) {
    S.online = false;
    setSync('offline', '离线模式');
    loadLocalCache();
    S.loaded = true;
    refreshAll();
    ensureHolidayCountdown();
    return;
  }
  setSync('syncing', '同步中');
  S.busy++;
  Promise.all([
    loadAllRows('tasks'),
    loadAllRows('habits'),
    loadAllRows('countdowns'),
    loadAllRows('pomodoros')
  ]).then(function (res) {
    S.tasks = (res[0] || []).map(normTask);
    S.habits = (res[1] || []).map(normHabit);
    S.countdowns = (res[2] || []).map(normCountdown);
    S.pomodoros = (res[3] || []).map(normPomo);
    S.online = true;
    S.loaded = true;
    S.busy--;
    setSync('synced', '已同步');
    autoSnapshotDaily();
    if (!S.tasks.length && !S.habits.length && !seededFlag()) seedDemo();
    else { cacheLocal(); refreshAll(); }
    ensureHolidayCountdown();
  }).catch(function (err) {
    console.error('[database] 数据加载失败:', err);
    S.online = false;
    S.busy--;
    setSync('offline', '离线模式');
    loadLocalCache();
    S.loaded = true;
    refreshAll();
  });
}
/* ---------- 拆分 / 子项 ---------- */
function unpackSubs(raw) {
  var arr = parseJson(raw);
  if (!arr || Object.prototype.toString.call(arr) !== '[object Array]') return [];
  return arr.map(function (x, i) {
    return {
      id: 's' + i,
      title: String(x.t || x.title || ''),
      min: Number(x.m || x.min) || 0,
      // 有 days 的子项会按顺序排进日期，0 表示只当时长拆分，不占日子
      days: Math.max(0, Number(x.dy || x.days) || 0),
      done: !!(x.d || x.done)
    };
  }).filter(function (x) { return !!x.title; });
}
function packSubs(subs) {
  if (!subs || !subs.length) return '';
  return JSON.stringify(subs.map(function (x) {
    return {
      t: String(x.title || '').trim(), m: Number(x.min) || 0,
      dy: Math.max(0, Number(x.days) || 0), d: !!x.done
    };
  }).filter(function (x) { return !!x.t; }));
}
function subStats(t) {
  var subs = (t && t.subs) || [];
  var n = subs.length, done = 0, min = 0;
  subs.forEach(function (x) { if (x.done) done++; min += Number(x.min) || 0; });
  return { n: n, done: done, min: min, pct: n ? Math.round(done / n * 100) : 0, all: n > 0 && done === n };
}
/* ---------- 跨天 / 阶段排期 ----------
   一个任务从 date 开始，占 span 天。子项可以各自标注占几天，
   从开始日依次往后排。这样「7 天的项目拆成 2/3/1/1 天」就能直接表达。 */
function taskSpan(t) {
  return Math.max(1, Number(t && t.span) || 1);
}
function mdShort(d) {
  return d ? (d.getMonth() + 1) + '/' + d.getDate() : '';
}
// 阶段日期文案：一天就写 10/26，多天写 10/26–10/28
function segDateText(seg) {
  if (!seg || !seg.start) return '';
  var a = mdShort(seg.start), b = mdShort(seg.end);
  return a === b ? a : a + '–' + b;
}
function subPlan(t) {
  var start = t && t.date ? parseYmd(t.date) : null;
  var out = [];
  if (!start) return out;
  var cur = new Date(start);
  (t.subs || []).forEach(function (x, i) {
    var days = Math.max(0, Number(x.days) || 0);
    var seg = { i: i, title: x.title, days: days, done: !!x.done, start: null, end: null, dayFrom: 0 };
    if (days > 0) {
      seg.dayFrom = dayDiff(start, cur);
      seg.start = new Date(cur);
      seg.end = addDays(cur, days - 1);
      cur = addDays(cur, days);
    }
    out.push(seg);
  });
  return out;
}
// 子项天数合计，用来反推整条日程该占多少天
function planDays(t) {
  return (t.subs || []).reduce(function (a, x) { return a + Math.max(0, Number(x.days) || 0); }, 0);
}
// 把子项排期的最后一天跟 date + span 对齐，供「总跨度」显示
function plannedEnd(t) {
  var start = t && t.date ? parseYmd(t.date) : null;
  if (!start) return null;
  return addDays(start, taskSpan(t) - 1);
}
function quadKey(t) {
  if (t.important && t.urgent) return 'q1';
  if (t.important) return 'q2';
  if (t.urgent) return 'q3';
  return 'q4';
}
var QUAD_LABEL = { q1: '重要且紧急', q2: '重要不紧急', q3: '紧急不重要', q4: '不重要不紧急' };
function quadGlyph(q) {
  // 2x2 小格子，选中那格实心、其余淡淡铺底，13px 下也能一眼看出在哪一象限
  var cell = [['0.6', '0.6'], ['5.4', '0.6'], ['0.6', '5.4'], ['5.4', '5.4']];
  var on = q === 'q1' ? 0 : q === 'q2' ? 1 : q === 'q3' ? 2 : 3;
  var r = '';
  for (var i = 0; i < 4; i++) {
    r += '<rect x="' + cell[i][0] + '" y="' + cell[i][1] + '" width="4" height="4" rx="1.2" ' +
      (i === on ? 'fill="currentColor" opacity=".95"' : 'fill="currentColor" opacity=".16"') + '/>';
  }
  return '<svg viewBox="0 0 10 10" width="13" height="13" aria-hidden="true">' + r + '</svg>';
}
// 日历/列表里统一用这一个取 class，无优先级按 P3，配色才不会各处不一
function prioCls(t) {
  var p = t && t.prio ? String(t.prio).toLowerCase() : '';
  return /^p[0-3]$/.test(p) ? p : 'p3';
}
function flagHtml(t) {
  var p = t.prio ? '<span class="flag-p ' + String(t.prio).toLowerCase() + '">' + String(t.prio).toUpperCase() + '</span>' : '';
  var q = quadKey(t);
  var g = '<span class="flag-q ' + q + '" title="' + QUAD_LABEL[q] + '">' + quadGlyph(q) + '</span>';
  return '<span class="flags">' + p + g + '</span>';
}
function timeRangeText(t) {
  if (!t || !t.time) return '';
  var st = parseHM(t.time);
  if (st === null) return t.time;
  if (!t.estimate) return t.time;
  return t.time + '–' + hmStr(st + t.estimate);
}
function subInlineHtml(t) {
  var st = subStats(t);
  if (!st.n) return '';
  return '<div class="sub-inline"><span class="sub-bar' + (st.all ? ' full' : '') + '">' +
    '<i style="width:' + st.pct + '%"></i></span>' +
    '<span class="sub-txt">' + st.done + '/' + st.n + '</span></div>';
}
function subRowsHtml(t, limit) {
  var subs = (t && t.subs) || [];
  if (!subs.length) return '';
  var st = subStats(t);
  var plan = subPlan(t);
  var only = !!S.subOnly[t.id];
  var html = '';
  var shown = 0;
  // 先算一遍会显示哪些，才能知道哪条是「最后一条」（用 └ 收尾）
  var vis = [];
  for (var k = 0; k < subs.length; k++) { if (!(only && subs[k].done)) vis.push(k); }
  var lastVis = vis.length ? vis[vis.length - 1] : -1;
  for (var i = 0; i < subs.length; i++) {
    var x = subs[i];
    if (only && x.done) continue;
    shown++;
    var seg = plan[i] || {};
    html += '<div class="sub-row' + (x.done ? ' done' : '') + '" data-subrow="' + i + '" ' +
      'data-subrow-parent="' + esc(t.id) + '" title="点一下勾选 / 取消">' +
      '<span class="sub-branch">' + (i === lastVis ? '└' : '├') + '</span>' +
      '<span class="sub-box">' + svgIcon('check') + '</span>' +
      '<span class="sub-t">' + esc(x.title) + '</span>' +
      (seg.start ? '<span class="sub-day">' + segDateText(seg) + '</span>' : '') +
      (x.min ? '<span class="sub-min">' + durText(x.min) + '</span>' : '') +
      '</div>';
  }
  if (!shown) html = '<div class="sub-row-more">全部子项都完成了</div>';
  var tools = '';
  if (subs.length > 6) {
    tools = '<div class="sub-tools">' +
      '<button class="sub-only' + (only ? ' on' : '') + '" data-subonly="' + esc(t.id) + '">' +
      (only ? '显示全部' : '只看未完成') + '</button>' +
      '<span>' + st.done + ' / ' + st.n + ' 已完成</span></div>';
  }
  return '<div class="sub-rows' + (subs.length > 10 ? ' dense' : '') + '">' + tools + html + '</div>';
}
function subCountHtml(t) {
  var st = subStats(t);
  if (!st.n) return '';
  return '<span class="sub-count' + (st.all ? ' full' : '') + '">' + st.done + '/' + st.n + '</span>';
}
function subSectionHtml(t) {
  var st = subStats(t);
  if (!st.n) {
    return '<div class="dt-sec"><label>' + svgIcon('split') + ' 拆分<span>把一条日程拆成几段分别勾选</span></label>' +
      '<div class="sub-empty">还没有拆分子项。点「修改」可以拆成比如「语文 / 数学 / 英语」，或「热身 / 力量 / 有氧」。</div></div>';
  }
  var plan = subPlan(t);
  var items = t.subs.map(function (x, i) {
    var seg = plan[i] || {};
    // 子项前面挂一个分支符：中间 ├、最后一条 └，一眼看出从属于上面这条日程
    return '<button class="sub-item' + (x.done ? ' done' : '') + '" data-subtoggle="' + i + '">' +
      '<span class="sub-branch">' + (i === t.subs.length - 1 ? '└' : '├') + '</span>' +
      '<span class="sub-box">' + svgIcon('check') + '</span>' +
      '<span class="sub-t">' + esc(x.title) + '</span>' +
      (seg.start ? '<span class="sub-day">' + segDateText(seg) + '</span>' : '') +
      (x.min ? '<span class="sub-min">' + durText(x.min) + '</span>' : '') +
      '</button>';
  }).join('');
  return '<div class="dt-sec" id="dtSubsSec"><label>' + svgIcon('split') + ' 拆分' +
    '<span>' + st.n + ' 个子项' + (st.min ? ' · 合计 ' + durText(st.min) : '') + '</span></label>' +
    '<div class="sub-prog"><span class="sub-bar' + (st.all ? ' full' : '') + '"><i id="dtSubBar" style="width:' + st.pct + '%"></i></span>' +
    '<span class="sub-prog-num" id="dtSubNum">' + st.done + ' / ' + st.n + ' <em>' + st.pct + '%</em></span></div>' +
    '<div class="sub-list" id="dtSubList">' + items + '</div></div>';
}
// 子项勾选后同步父任务的完成状态：全部完成即视为完成，取消一个则退回未完成
function syncDoneFromSubs(t) {
  var st = subStats(t);
  if (!st.n) return false;
  if (st.all && !t.done) { t.done = true; t.doneAt = ymd(today0()); return true; }
  if (!st.all && t.done) { t.done = false; t.doneAt = ''; return true; }
  return false;
}
var REPEAT_OPTS = ['不重复', '每天', '每周', '每月', '每年', '工作日'];
function repeatLabel(t) { return t.repeat && t.repeat !== '不重复' ? t.repeat : ''; }
function nextRepeatDate(dateStr, rule) {
  var d = parseYmd(dateStr);
  if (!d) return '';
  if (rule === '每天') return ymd(addDays(d, 1));
  if (rule === '每周') return ymd(addDays(d, 7));
  if (rule === '每月') {
    var mm = d.getMonth(), yy = d.getFullYear();
    var nm = mm + 1, ny = yy;
    if (nm > 11) { nm = 0; ny++; }
    var lastDay = new Date(ny, nm + 1, 0).getDate();
    return ymd(new Date(ny, nm, Math.min(d.getDate(), lastDay)));
  }
  if (rule === '每年') {
    var ty = d.getFullYear() + 1;
    var m0 = d.getMonth();
    var lastD = new Date(ty, m0 + 1, 0).getDate();
    return ymd(new Date(ty, m0, Math.min(d.getDate(), lastD)));
  }
  if (rule === '工作日') {
    var nd = addDays(d, 1);
    while (nd.getDay() === 0 || nd.getDay() === 6) nd = addDays(nd, 1);
    return ymd(nd);
  }
  return '';
}
function cloneNextRepeat(t) {
  var nd = nextRepeatDate(t.date, t.repeat);
  if (!nd) return null;
  var nt = {
    id: '', title: t.title, note: t.note, list: t.list, tags: (t.tags || []).slice(),
    prio: t.prio, important: t.important, urgent: t.urgent, done: false,
    remindMode: t.remindMode, remindCfg: null, date: nd, time: t.time,
    estimate: t.estimate, subs: (t.subs || []).map(function (x) {
      return { id: '', title: x.title, min: x.min, done: false };
    }),
    repeat: t.repeat, doneAt: '', sort: t.sort, createdAt: ymd(today0())
  };
  if (t.remindCfg && t.remindCfg.offsets) {
    nt.remindCfg = {
      anchor: nd + ' ' + (t.time || '09:00'),
      offsets: t.remindCfg.offsets.slice(), read: []
    };
  }
  return nt;
}
function spawnNextRepeat(t) {
  if (!t || !t.repeat || t.repeat === '不重复' || !t.date) return null;
  var nt = cloneNextRepeat(t);
  if (!nt) return null;
  // 防止重复勾选造成同一日期出现多条
  var dup = S.tasks.some(function (x) {
    return x.id !== t.id && x.title === nt.title && x.date === nt.date && !x.done;
  });
  if (dup) return null;
  S.tasks.push(nt);
  apiAddTask(nt);
  cacheLocal();
  toast('已生成下一次：' + dateLabel(parseYmd(nt.date)));
  return nt;
}
function toggleSub(t, idx, quiet) {
  if (!t || !t.subs || !t.subs[idx]) return;
  t.subs[idx].done = !t.subs[idx].done;
  var flipped = syncDoneFromSubs(t);
  cacheLocal();
  var fields = ['拆分'];
  if (flipped) { fields.push('已完成'); fields.push('完成时间'); }
  apiUpdateTask(t, fields);
  if (flipped && t.done && t.repeat && t.repeat !== '不重复') spawnNextRepeat(t);
  if (!quiet || flipped) refreshAll();
  return flipped;
}

function normTask(r) {
  var cfg = parseJson(r['提醒设置']) || {};
  return {
    id: r._id || r.record_id || r.id,
    title: r['标题'] || '未命名任务',
    note: r['备注'] || '',
    list: r['清单'] || '收集箱',
    tags: String(r['标签'] || '').split(',').filter(function (x) { return !!x; }),
    prio: String(r['优先级'] || '').toUpperCase().slice(0, 2),
    important: !!r['重要'],
    urgent: !!r['紧急'],
    done: !!r['已完成'],
    remindMode: r['提醒模式'] || '不提醒',
    remindCfg: cfg,
    date: isoToYmd(r['日期']),
    time: r['时间'] || '',
    estimate: Number(r['预计时长']) || 0,
    doneAt: isoToYmd(r['完成时间']),
    sort: Number(r['排序']) || 0,
    subs: unpackSubs(r['拆分']),
    repeat: r['重复'] || '',
    span: Math.max(1, Number(r['持续']) || 1),
    createdAt: isoToYmd(r['创建时间']),
    _new: false
  };
}
function normHabit(r) {
  var log = parseJson(r['打卡记录']);
  if (!log || !log.length) log = [];
  return {
    id: r._id || r.record_id || r.id, name: r['名称'] || '习惯', icon: r['图标'] || 'target',
    color: themedColor(r['颜色'] || '#177CB0'), target: Number(r['每周目标']) || 7,
    streak: Number(r['连续天数']) || 0, total: Number(r['总打卡']) || 0,
    log: log, createdAt: isoToYmd(r['创建时间'])
  };
}
function normCountdown(r) {
  return {
    id: r._id || r.record_id || r.id, name: r['名称'] || '纪念日', type: r['类型'] || '倒数日',
    date: isoToYmd(r['日期']), note: r['备注'] || '', color: themedColor(r['颜色'] || '#177CB0'),
    group: r['分组'] || '', sys: r['系统'] || '',
    createdAt: isoToYmd(r['创建时间'])
  };
}
function normPomo(r) {
  return {
    id: r._id || r.record_id || r.id, task: r['任务'] || '', type: r['类型'] || '专注',
    duration: Number(r['时长']) || 0, start: isoToYmd(r['开始时间']), date: isoToYmd(r['日期']),
    sub: r['子项'] || '', pauseCount: Number(r['暂停次数']) || 0, pauseSec: Number(r['暂停时长']) || 0
  };
}
function taskToProps(t, partial) {
  var p = {};
  function put(k, v) { if (!partial || partial.indexOf(k) > -1) p[k] = v; }
  put('标题', { text: t.title || '' });
  put('备注', { text: t.note || '' });
  put('清单', { text: t.list || '收集箱' });
  put('标签', { text: (t.tags || []).join(',') });
  put('优先级', { select: String(t.prio || '').toUpperCase() });
  put('重要', { checkbox: !!t.important });
  put('紧急', { checkbox: !!t.urgent });
  put('已完成', { checkbox: !!t.done });
  put('提醒模式', { select: t.remindMode || '不提醒' });
  put('提醒设置', { text: t.remindCfg ? JSON.stringify(t.remindCfg) : '' });
  put('日期', { date: t.date || '' });
  put('时间', { text: t.time || '' });
  put('预计时长', { number: Number(t.estimate) || 0 });
  put('完成时间', { date: t.doneAt || '' });
  put('拆分', { text: packSubs(t.subs) });
  put('重复', { text: t.repeat || '' });
  put('持续', { number: Math.max(1, Number(t.span) || 1) });
  put('排序', { number: Number(t.sort) || 0 });
  put('创建时间', { date: t.createdAt || ymd(today0()) });
  return p;
}
function apiAddTask(t) {
  var db = getDB(); if (!db) return Promise.resolve();
  setSync('syncing', '同步中');
  return db.addRecord({ databaseId: 'RBTQ4jwngkyjWiZE7VqCJZ', properties: taskToProps(t) }).then(function (r) {
    if (r && r.id) t.id = r.id;
    setSync('synced', '已同步');
  }).catch(function (e) { console.error('[database] 新增任务失败:', e); setSync('offline', '同步失败'); toast('任务未同步，请检查网络'); });
}
function apiUpdateTask(t, partial) {
  var db = getDB(); if (!db || !t.id) return Promise.resolve();
  setSync('syncing', '同步中');
  return db.updateRecord({ databaseId: 'RBTQ4jwngkyjWiZE7VqCJZ', recordId: t.id, properties: taskToProps(t, partial) }).then(function () {
    setSync('synced', '已同步');
  }).catch(function (e) { console.error('[database] 更新任务失败:', e); setSync('offline', '同步失败'); toast('修改未同步，请检查网络'); });
}
function apiDeleteTask(id) {
  var db = getDB(); if (!db || !id) return Promise.resolve();
  return db.deleteRecord({ databaseId: 'RBTQ4jwngkyjWiZE7VqCJZ', recordId: id }).catch(function (e) { console.error('[database] 删除失败:', e); toast('删除未同步'); });
}
function habitToProps(h) {
  return {
    '名称': { text: h.name }, '图标': { text: h.icon }, '颜色': { text: h.color },
    '每周目标': { number: Number(h.target) || 7 }, '连续天数': { number: Number(h.streak) || 0 },
    '总打卡': { number: Number(h.total) || 0 }, '打卡记录': { text: JSON.stringify(h.log || []) },
    '创建时间': { date: h.createdAt || ymd(today0()) }
  };
}
function apiSaveHabit(h) {
  var db = getDB(); if (!db) return Promise.resolve();
  if (!h.id) return db.addRecord({ databaseId: 'xaX0HSTIH0O7cXXvPnbsR2', properties: habitToProps(h) }).then(function (r) { if (r && r.id) h.id = r.id; })
    .catch(function (e) { console.error('[database] 习惯保存失败:', e); toast('习惯未同步'); });
  return db.updateRecord({ databaseId: 'xaX0HSTIH0O7cXXvPnbsR2', recordId: h.id, properties: habitToProps(h) })
    .catch(function (e) { console.error('[database] 习惯更新失败:', e); toast('习惯未同步'); });
}
function apiDeleteHabit(id) {
  var db = getDB(); if (!db || !id) return Promise.resolve();
  return db.deleteRecord({ databaseId: 'xaX0HSTIH0O7cXXvPnbsR2', recordId: id }).catch(function (e) { console.error(e); });
}
function cdToProps(c) {
  return {
    '名称': { text: c.name }, '类型': { select: c.type || '倒数日' },
    '日期': { date: c.date || '' }, '备注': { text: c.note || '' },
    '颜色': { text: c.color }, '分组': { text: c.group || '' }, '系统': { text: c.sys || '' },
    '创建时间': { date: c.createdAt || ymd(today0()) }
  };
}
function cdGroupOf(cd) {
  var g = String((cd && cd.group) || '').trim();
  if (g) return g;
  return (cd && cd.type) || '其他';
}
function apiSaveCountdown(c) {
  var db = getDB(); if (!db) return Promise.resolve();
  if (!c.id) return db.addRecord({ databaseId: 'gVxrxS4S2Zb2xddhphNdjT', properties: cdToProps(c) }).then(function (r) { if (r && r.id) c.id = r.id; })
    .catch(function (e) { console.error('[database] 纪念日保存失败:', e); toast('纪念日未同步'); });
  return db.updateRecord({ databaseId: 'gVxrxS4S2Zb2xddhphNdjT', recordId: c.id, properties: cdToProps(c) })
    .catch(function (e) { console.error(e); toast('纪念日未同步'); });
}
function apiDeleteCountdown(id) {
  var db = getDB(); if (!db || !id) return Promise.resolve();
  return db.deleteRecord({ databaseId: 'gVxrxS4S2Zb2xddhphNdjT', recordId: id }).catch(function (e) { console.error(e); });
}
function apiAddPomo(p) {
  var db = getDB(); if (!db) return Promise.resolve();
  return db.addRecord({
    databaseId: '6ny2WVjivlBujxY3ICpYGT', properties: {
      '任务': { text: p.task || '未命名专注' }, '类型': { select: p.type || '专注' },
      '时长': { number: Number(p.duration) || 0 },
      '开始时间': { date: p.start || '' },
      '日期': { date: p.date || '' },
      '子项': { text: p.sub || '' },
      '暂停次数': { number: Number(p.pauseCount) || 0 },
      '暂停时长': { number: Number(p.pauseSec) || 0 }
    }
  }).then(function (r) { if (r && r.id) p.id = r.id; })
    .catch(function (e) { console.error('[database] 专注记录保存失败:', e); toast('专注记录未同步'); });
}
// 本地缓存：数据一变就标脏，260ms 内合并成一次序列化，避免连续操作时反复 stringify
var _cacheTimer = null;
function cacheLocal() {
  S._rev = (S._rev || 0) + 1;
  if (_cacheTimer) return;
  _cacheTimer = setTimeout(function () {
    _cacheTimer = null;
    flushCache();
  }, 260);
}
function flushCache() {
  if (_cacheTimer) { clearTimeout(_cacheTimer); _cacheTimer = null; }
  try {
    localStorage.setItem('wb_schedule_cache', JSON.stringify({
      ts: Date.now(), tasks: S.tasks, habits: S.habits, countdowns: S.countdowns, pomodoros: S.pomodoros
    }));
  } catch (e) { }
}
function loadLocalCache() {
  try {
    var raw = localStorage.getItem('wb_schedule_cache');
    if (!raw) return;
    var o = JSON.parse(raw);
    if (!o) return;
    S.tasks = o.tasks || []; S.habits = o.habits || [];
    S.countdowns = o.countdowns || []; S.pomodoros = o.pomodoros || [];
  } catch (e) { }
}

/* ---------- 示例数据 ---------- */
function seededFlag() {
  try { return localStorage.getItem('wb_schedule_seeded') === '1'; } catch (e) { return false; }
}
function markSeeded() {
  try { localStorage.setItem('wb_schedule_seeded', '1'); } catch (e) { }
}
function seedDemo() {
  var t = today0();
  var demo = [
    { title: '整理本周项目周报', list: '工作', tags: ['工作'], prio: 'P1', important: true, urgent: true, date: ymd(addDays(t, -2)), time: '18:00', estimate: 45, remindMode: '艾宾浩斯', remindCfg: { anchor: ymd(addDays(t, -2)) + ' 18:00', offsets: EB_OFFSETS, read: [] }, note: '逾期示例：上周五该交的周报' },
    { title: '产品评审会：日程台二期', list: '工作', tags: ['会议', '工作'], prio: 'P0', important: true, urgent: true, date: ymd(t), time: '10:00', estimate: 90, remindMode: '艾宾浩斯', remindCfg: { anchor: ymd(t) + ' 10:00', offsets: EB_OFFSETS, read: [] }, note: '带上原型和上一版数据', subs: [{ title: '准备原型与数据', min: 30, done: true }, { title: '评审会讨论', min: 45, done: false }, { title: '整理结论与待办', min: 15, done: false }] },
    { title: '给妈妈打个电话', list: '生活', tags: ['生活'], prio: 'P2', important: true, urgent: false, date: ymd(t), time: '20:30', estimate: 30, remindMode: '单次提醒', remindCfg: { anchor: ymd(t) + ' 20:30', offsets: [-10], read: [] } },
    { title: '读完《深度工作》第 3 章', list: '学习', tags: ['学习', '阅读'], prio: 'P2', important: false, urgent: false, date: ymd(addDays(t, 1)), time: '21:00', estimate: 60, remindMode: '不提醒', subs: [{ title: '精读正文', min: 40, done: false }, { title: '做读书笔记', min: 20, done: false }] },
    { title: '预约体检', list: '生活', tags: ['生活'], prio: 'P3', important: false, urgent: true, date: ymd(addDays(t, 3)), time: '', estimate: 15, remindMode: '不提醒' },
    { title: '季度目标复盘', list: '工作', tags: ['工作'], prio: 'P1', important: true, urgent: false, date: ymd(addDays(t, 5)), time: '14:00', estimate: 120, remindMode: '不提醒' }
  ];
  var history = [
    { title: '写周报并同步给团队', list: '工作', tags: ['工作'], prio: 'P1', day: -1 },
    { title: '整理会议纪要', list: '工作', tags: ['会议'], prio: 'P2', day: -1 },
    { title: '跑步 5 公里', list: '生活', tags: ['运动'], prio: 'P3', day: -2 },
    { title: '学完一节数据分析课', list: '学习', tags: ['学习'], prio: 'P2', day: -3 },
    { title: '给客户回邮件', list: '工作', tags: ['工作'], prio: 'P1', day: -3 },
    { title: '读完《深度工作》第 2 章', list: '学习', tags: ['学习', '阅读'], prio: 'P2', day: -4 },
    { title: '整理本月账单', list: '生活', tags: ['生活'], prio: 'P3', day: -5 },
    { title: '准备产品需求文档', list: '工作', tags: ['工作'], prio: 'P0', day: -5 },
    { title: '和朋友吃饭', list: '生活', tags: ['生活'], prio: 'P3', day: -6 },
    { title: '复盘上周目标完成情况', list: '工作', tags: ['工作'], prio: 'P1', day: -7 },
    { title: '做一次冥想', list: '生活', tags: ['生活'], prio: 'P3', day: -8 },
    { title: '看完技术分享视频', list: '学习', tags: ['学习'], prio: 'P3', day: -9 },
    { title: '整理素材库', list: '工作', tags: ['工作'], prio: 'P2', day: -11 },
    { title: '给家里买日用品', list: '生活', tags: ['生活'], prio: 'P3', day: -12 }
  ];
  var h = today0(), dstr = ymd(h);
  function mkLog(rate, span) {
    var log = [];
    for (var i = 1; i <= span; i++) {
      if (Math.random() < rate) log.push(ymd(addDays(h, -i)));
    }
    return log.reverse();
  }
  var habits = [
    { name: '早起 6:30', icon: 'sun', color: '#C8892B', target: 7, log: mkLog(0.78, 34) },
    { name: '阅读 30 分钟', icon: 'book', color: '#177CB0', target: 7, log: mkLog(0.62, 34) },
    { name: '运动打卡', icon: 'fire', color: '#C3272B', target: 4, log: mkLog(0.45, 34) }
  ];
  var cds = [
    { name: '项目上线日', type: '倒数日', date: ymd(addDays(t, 23)), note: '二期正式发布', color: '#177CB0' },
    { name: '和老婆的纪念日', type: '纪念日', date: '2021-06-18', note: '每年都要记住', color: '#7A4E63' },
    { name: '年度旅行出发', type: '倒数日', date: ymd(addDays(t, 47)), note: '大理 · 7 天', color: '#5E8C6A' }
  ];
  S.busy++;
  var jobs = [];
  demo.forEach(function (x) {
    var task = {
      id: '', title: x.title, note: x.note || '', list: x.list, tags: x.tags, prio: x.prio,
      important: x.important, urgent: x.urgent, done: false, remindMode: x.remindMode, subs: x.subs || [],
      remindCfg: x.remindCfg || null, date: x.date, time: x.time, estimate: x.estimate,
      doneAt: '', sort: 0, createdAt: ymd(today0())
    };
    jobs.push(function () { return apiAddTask(task).then(function () { S.tasks.push(task); }); });
  });
  history.forEach(function (x) {
    var task = {
      id: '', title: x.title, note: '', list: x.list, tags: x.tags, prio: x.prio,
      important: false, urgent: false, done: true, remindMode: '不提醒',
      remindCfg: null, date: ymd(addDays(t, x.day)), time: '', estimate: 30,
      doneAt: ymd(addDays(t, x.day)), sort: 0, createdAt: ymd(addDays(t, x.day))
    };
    jobs.push(function () { return apiAddTask(task).then(function () { S.tasks.push(task); }); });
  });
  habits.forEach(function (x) {
    var hb = { id: '', name: x.name, icon: x.icon, color: x.color, target: x.target, streak: 0, total: x.log.length, log: x.log, createdAt: ymd(t) };
    jobs.push(function () {
      return apiSaveHabit(hb).then(function () { hb.streak = calcStreak(hb); S.habits.push(hb); });
    });
  });
  cds.forEach(function (x) {
    var c = { id: '', name: x.name, type: x.type, date: x.date, note: x.note, color: x.color, createdAt: ymd(t) };
    jobs.push(function () { return apiSaveCountdown(c).then(function () { S.countdowns.push(c); }); });
  });
  var pomoSeed = [];
  for (var pi = 0; pi < 9; pi++) {
    var pday = -Math.floor(pi / 3);
    pomoSeed.push({ id: '', task: pi % 2 ? '写方案' : '读文档', type: '专注', duration: 25, start: ymd(addDays(t, pday)), date: ymd(addDays(t, pday)) });
  }
  pomoSeed.forEach(function (p) {
    jobs.push(function () { return apiAddPomo(p).then(function () { S.pomodoros.push(p); }); });
  });
  // 串行写入，避免触发单页 20 QPS 限流
  var qi = 0;
  function runNext() {
    if (qi >= jobs.length) {
      S.busy--;
      markSeeded();
      cacheLocal();
      refreshAll();
      toast('已预置示例数据，可在「备份」里一键清空');
      return;
    }
    var fn = jobs[qi++];
    var r;
    try { r = fn(); } catch (e) { r = null; }
    if (r && typeof r.then === 'function') r.then(runNext, runNext);
    else setTimeout(runNext, 0);
  }
  runNext();
}

/* ---------- 通用 UI ---------- */
function toast(msg) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('in');
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.classList.remove('in'); }, 2100);
}
/* 表单输入本地缓存：输到一半刷新 / 误关窗口不丢 */
var DRAFT_KEY = 'wb_schedule_quick_draft';
var draftTimer = null;
function saveDraft(v) {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(function () {
    try {
      if (v && v.trim()) localStorage.setItem(DRAFT_KEY, v);
      else localStorage.removeItem(DRAFT_KEY);
    } catch (e) { }
  }, 300);
}
function readDraft() {
  try { return localStorage.getItem(DRAFT_KEY) || ''; } catch (e) { return ''; }
}
function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch (e) { }
}
/* ---------- 桌面端右侧面板 ---------- */
var PANEL_W = 440;
var PANEL_MIN = 360;
var PANEL_MAX = 760;
function setPanelWidth(w) {
  PANEL_W = Math.max(PANEL_MIN, Math.min(PANEL_MAX, Math.round(w || 440)));
  document.documentElement.style.setProperty('--panel-w', PANEL_W + 'px');
}
function bindPanelResize(grip) {
  if (!grip || grip._bound) return;
  grip._bound = true;
  grip.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    var startX = e.clientX, startW = PANEL_W;
    function mv(ev) { setPanelWidth(startW + (startX - ev.clientX)); }
    function up() {
      document.removeEventListener('pointermove', mv, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', up, true);
      try { localStorage.setItem('wb_schedule_panel_w', String(PANEL_W)); } catch (er) { }
      var el = document.querySelector('.modal-mask.panel .modal');
      if (el) el.style.width = '';
    }
    document.addEventListener('pointermove', mv, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', up, true);
  });
  grip.addEventListener('dblclick', function () { setPanelWidth(440); });
}
// 宽弹窗（详情 / 编辑 / 搜索）在电脑端改用右侧停靠面板，页面同步收窄，列表仍可点
function applyModalMode(wrap) {
  if (wrap.classList.contains('stacked')) return;
  var m = wrap.querySelector('.modal');
  if (!m) return;
  var want = m.classList.contains('wide') && window.innerWidth >= 1000;
  var has = wrap.classList.contains('panel');
  var app = document.querySelector('.app');
  if (want === has) {
    if (app) app.classList.toggle('panel-open', want);
    return;
  }
  if (want) {
    wrap.classList.add('panel');
    m.classList.remove('floating');
    ['position', 'left', 'top', 'width', 'maxHeight', 'margin', 'marginTop'].forEach(function (k) { m.style[k] = ''; });
    if (app) app.classList.add('panel-open');
    var grip = m.querySelector('.panel-grip');
    if (!grip) {
      grip = document.createElement('div');
      grip.className = 'panel-grip';
      grip.title = '左右拖动调整宽度，双击恢复默认';
      m.appendChild(grip);
    }
    bindPanelResize(grip);
  } else {
    wrap.classList.remove('panel');
    if (app) app.classList.remove('panel-open');
    var g = m.querySelector('.panel-grip');
    if (g && g.parentNode) g.parentNode.removeChild(g);
    ['position', 'left', 'top', 'width', 'maxHeight', 'margin', 'marginTop'].forEach(function (k) { m.style[k] = ''; });
  }
}
function enableModalDrag(wrap) {
  var modal = wrap.querySelector('.modal');
  if (!modal) return;
  if (wrap.classList.contains('panel')) return;
  // 手机浏览器 100vh 含地址栏，88vh 可能超出可见区域；用 visualViewport 兜底
  try {
    var vv = window.visualViewport;
    var vis = Math.min(
      vv && vv.height ? vv.height : (window.innerHeight || 900),
      (window.screen && window.screen.height) ? window.screen.height : 900
    );
    var cap = Math.round(Math.min(vis * 0.94, 680));
    modal.style.maxHeight = cap + 'px';
    // 放得下才垂直居中；放不下就贴顶，保证标题栏永远可见
    requestAnimationFrame(function () {
      if (wrap.classList.contains('panel')) return;
      var mh = modal.getBoundingClientRect().height;
      // 矮弹窗居中，长弹窗贴顶：贴顶才能保证顶部标题栏一定在可见区
      if (mh <= vis * 0.6) {
        modal.style.marginTop = Math.max(0, Math.round((vis - mh) / 2 - 30)) + 'px';
      } else {
        modal.style.marginTop = '0px';
      }
    });
  } catch (e) { }
  var head = modal.querySelector('.m-head');
  if (!head) return;
  if (window.innerWidth <= 860) return;
  var st = null;
  function onMove(e) {
    if (!st) return;
    var dx = e.clientX - st.x;
    var dy = e.clientY - st.y;
    if (!st.moved) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      st.moved = true;
      modal.classList.add('floating');
      modal.style.position = 'fixed';
      modal.style.margin = '0';
      modal.style.width = st.w + 'px';
      modal.style.left = st.left + 'px';
      modal.style.top = st.top + 'px';
      modal.style.maxHeight = Math.min(st.h, window.innerHeight - 24) + 'px';
      head.classList.add('dragging');
    }
    e.preventDefault();
    var minVis = 140;
    var nl = Math.max(minVis - st.w, Math.min(window.innerWidth - minVis, st.left + dx));
    var nt = Math.max(8, Math.min(window.innerHeight - 60, st.top + dy));
    modal.style.left = nl + 'px';
    modal.style.top = nt + 'px';
  }
  function onUp() {
    document.removeEventListener('pointermove', onMove, true);
    document.removeEventListener('pointerup', onUp, true);
    document.removeEventListener('pointercancel', onUp, true);
    head.classList.remove('dragging');
    st = null;
  }
  head.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('button, input, select, textarea, a')) return;
    var r = modal.getBoundingClientRect();
    st = { x: e.clientX, y: e.clientY, left: r.left, top: r.top, w: r.width, h: r.height, moved: false };
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
  });
  head.addEventListener('dblclick', function (e) {
    if (e.target.closest('button')) return;
    modal.classList.remove('floating');
    modal.style.position = '';
    modal.style.left = '';
    modal.style.top = '';
    modal.style.width = '';
    modal.style.margin = '';
    modal.style.maxHeight = '';
  });
}

function closeModal() {
  var root = document.getElementById('modalRoot');
  if (!root) return;
  // 「选已有」浮层挂在 body 上，关弹层时一起收掉
  var tm = document.querySelector('.pick-menu');
  if (tm && tm.parentNode) tm.parentNode.removeChild(tm);
  var masks = root.querySelectorAll('.modal-mask');
  var mask = masks.length ? masks[masks.length - 1] : null;
  if (!mask) { root.innerHTML = ''; return; }
  var closedTask = mask.getAttribute('data-task');
  if (closedTask) {
    S.detailId = '';
    markActiveTask('');
  }
  mask.classList.remove('in');
  setTimeout(function () {
    if (mask.parentNode === root) root.removeChild(mask);
    if (!root.querySelector('.modal-mask')) {
      var app = document.querySelector('.app');
      if (app) app.classList.remove('panel-open');
    }
  }, 180);
}
function swapContent(html, cls) {
  var old = document.getElementById('content');
  var c = document.createElement('div');
  c.id = 'content';
  c.className = 'content' + (cls ? ' ' + cls : '');
  c.innerHTML = html;
  if (old && old.parentNode) old.parentNode.replaceChild(c, old);
  return c;
}
// 取色圆点：习惯 / 纪念日编辑器共用，选中项用面板色描边 + 同色外环
function colorSwatches(current, attr) {
  return LIST_COLORS.map(function (c) {
    var on = current === c;
    return '<button ' + attr + '="' + c + '" style="width:28px;height:28px;border-radius:50%;background:' + c +
      ';border:3px solid ' + (on ? 'var(--panel)' : 'transparent') +
      ';box-shadow:0 0 0 ' + (on ? '2px ' + c : '0 transparent') + ';cursor:pointer"></button>';
  }).join('');
}
function openModal(html, opts) {
  opts = opts || {};
  var root = document.getElementById('modalRoot');
  var wrap = document.createElement('div');
  wrap.className = 'modal-mask';
  wrap.innerHTML = html;
  var mEl = wrap.querySelector('.modal');
  var isWide = !!(mEl && mEl.classList.contains('wide'));
  var prev = root.querySelector('.modal-mask');
  // 详情面板之间切换：复用同一个面板壳，只换内容，避免整块重建时闪一下
  // 详情本身是 wide（宽屏下就是 panel），所以这里不能排除 wide
  if (opts.reuse && prev && prev.classList.contains('panel')) {
    prev.innerHTML = html;
    prev.removeAttribute('data-task');
    var c2 = prev.querySelector('.m-close');
    if (c2) c2.addEventListener('click', closeModal);
    if (opts.onMount) opts.onMount(prev);
    applyModalMode(prev);
    enableModalDrag(prev);
    return prev;
  }
  // 面板已开时，小弹窗（确认 / 输入）叠在面板之上，不要把面板整个换掉
  if (prev && prev.classList.contains('panel') && !isWide) {
    wrap.classList.add('stacked');
    root.appendChild(wrap);
  } else {
    root.innerHTML = '';
    root.appendChild(wrap);
  }
  requestAnimationFrame(function () { wrap.classList.add('in'); });
  wrap.addEventListener('mousedown', function (e) {
    if (e.target === wrap && opts.maskClose !== false) closeModal();
  });
  var c = wrap.querySelector('.m-close');
  if (c) c.addEventListener('click', closeModal);
  if (opts.onMount) opts.onMount(wrap);
  applyModalMode(wrap);
  enableModalDrag(wrap);
  var first = wrap.querySelector('[autofocus]');
  if (first) setTimeout(function () { try { first.focus(); } catch (e) { } }, 120);
  return wrap;
}
function typedConfirm(title, desc, word, onOk) {
  openModal(
    '<div class="modal sm">' +
    '<div class="m-head"><h3>' + esc(title) + '</h3><button class="m-close">' + svgIcon('close') + '</button></div>' +
    '<div class="m-body">' +
    '<div style="font-size:13px;color:var(--text-2);line-height:1.75">' + desc + '</div>' +
    '<div class="field"><label>输入「' + esc(word) + '」确认<span class="hint">此操作无法撤销</span></label>' +
    '<input class="inp" id="tcInput" placeholder="' + esc(word) + '" style="height:40px;font-size:15px"></div>' +
    '</div>' +
    '<div class="m-foot"><div class="spacer"></div>' +
    '<button class="btn btn-sec" id="tcCancel">取消</button>' +
    '<button class="btn btn-danger" id="tcOk" disabled>确认删除</button></div></div>', {
    onMount: function (w) {
      var inp = w.querySelector('#tcInput');
      var ok = w.querySelector('#tcOk');
      inp.addEventListener('input', function () {
        var hit = String(inp.value || '').trim() === word;
        ok.disabled = !hit;
        ok.style.opacity = hit ? 1 : .5;
      });
      w.querySelector('#tcCancel').addEventListener('click', closeModal);
      ok.addEventListener('click', function () {
        if (ok.disabled) return;
        closeModal();
        setTimeout(function () { onOk && onOk(); }, 160);
      });
      setTimeout(function () { try { inp.focus(); } catch (e) { } }, 80);
    }
  });
}

/* ---------- 本地快照（防误删） ---------- */
var SNAP_KEY = 'wb_schedule_snapshot';
function takeSnapshot(reason) {
  try {
    localStorage.setItem(SNAP_KEY, JSON.stringify({
      at: Date.now(), reason: reason,
      tasks: S.tasks, habits: S.habits, countdowns: S.countdowns
    }));
  } catch (e) { }
}
function readSnapshot() {
  try {
    var o = JSON.parse(localStorage.getItem(SNAP_KEY) || 'null');
    return (o && o.tasks) ? o : null;
  } catch (e) { return null; }
}

function promptModal(title, desc, value, placeholder, onOk) {
  openModal(
    '<div class="modal sm">' +
    '<div class="m-head"><h3>' + esc(title) + '</h3><button class="m-close">' + svgIcon('close') + '</button></div>' +
    '<div class="m-body">' +
    (desc ? '<div style="font-size:12.5px;color:var(--text-2);line-height:1.7;margin-bottom:9px">' + desc + '</div>' : '') +
    '<input class="inp" id="pmInput" value="' + esc(value || '') + '" placeholder="' + esc(placeholder || '') + '" style="height:42px;font-size:15px">' +
    '</div>' +
    '<div class="m-foot"><div class="spacer"></div>' +
    '<button class="btn btn-sec" id="pmCancel">取消</button>' +
    '<button class="btn btn-pri" id="pmOk">确定</button></div></div>', {
    onMount: function (w) {
      var inp = w.querySelector('#pmInput');
      function submit() {
        var v = String(inp.value || '').trim();
        if (!v) { inp.focus(); return; }
        closeModal();
        if (onOk) onOk(v);
      }
      w.querySelector('#pmCancel').addEventListener('click', closeModal);
      w.querySelector('#pmOk').addEventListener('click', submit);
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
      });
      setTimeout(function () { try { inp.focus(); inp.select(); } catch (e) { } }, 80);
    }
  });
}

/* ---------- 侧栏迷你菜单 ---------- */
function onDocDown(e) {
  if (e.target.closest && e.target.closest('#miniMenu')) return;
  closeMiniMenu();
}
/* ---------- 换肤 ---------- */
var THEMES = [
  { k: 'paper', name: '宣纸', bg: '#F7F3EA', panel: '#FFFEFA', brand: '#177CB0' },
  { k: 'celadon', name: '青瓷', bg: '#EEF2EE', panel: '#FCFEFB', brand: '#2E7D6F' },
  { k: 'moon', name: '月白', bg: '#EEF1F6', panel: '#FBFCFE', brand: '#3B6EA5' },
  { k: 'dusk', name: '暮色', bg: '#1B1A18', panel: '#232220', brand: '#6FA7C9' },
  { k: 'ink', name: '墨蓝', bg: '#15181F', panel: '#1C212B', brand: '#6FA8DC' }
];
function currentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'paper';
}
function themeDots(t) {
  return '<span class="tdots"><i style="background:' + t.bg + '"></i><i style="background:' + t.panel + '"></i><i style="background:' + t.brand + '"></i></span>';
}
function setTheme(k) {
  if (k === 'paper') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', k);
  try { localStorage.setItem('wb_theme', k); } catch (e) { }
  var th = THEMES.filter(function (x) { return x.k === k; })[0] || THEMES[0];
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', th.bg);
  toast('已切换到「' + th.name + '」');
}
function openThemeMenu(anchor) {
  closeMiniMenu();
  if (!anchor) return;
  var cur = currentTheme();
  var m = document.createElement('div');
  m.id = 'miniMenu';
  m.className = 'mini-menu theme-menu';
  m.innerHTML = THEMES.map(function (t) {
    return '<button class="theme-row' + (cur === t.k ? ' on' : '') + '" data-th="' + t.k + '">' +
      themeDots(t) + '<span class="tn">' + t.name + '</span>' +
      (cur === t.k ? svgIcon('check') : '') + '</button>';
  }).join('');
  document.body.appendChild(m);
  var r = anchor.getBoundingClientRect();
  var w = m.offsetWidth || 190, h = m.offsetHeight || 220;
  var left = Math.min(window.innerWidth - w - 10, Math.max(10, r.right - w));
  var top = r.bottom + 8;
  if (top + h > window.innerHeight - 10) top = Math.max(10, r.top - h - 8);
  m.style.left = left + 'px';
  m.style.top = top + 'px';
  m.addEventListener('click', function (e) {
    var b = e.target.closest('[data-th]');
    if (!b) return;
    var k = b.getAttribute('data-th');
    closeMiniMenu();
    setTheme(k);
    var chips = document.querySelectorAll('[data-ththeme]');
    Array.prototype.forEach.call(chips, function (x) {
      x.className = 'theme-chip' + (x.getAttribute('data-ththeme') === k ? ' on' : '');
    });
  });
  setTimeout(function () { document.addEventListener('mousedown', onDocDown, true); }, 0);
}

function closeMiniMenu() {
  var m = document.getElementById('miniMenu');
  if (m && m.parentNode) m.parentNode.removeChild(m);
  document.removeEventListener('mousedown', onDocDown, true);
}
function openMiniMenu(anchor, items) {
  closeMiniMenu();
  if (!anchor || !items.length) return;
  var r = anchor.getBoundingClientRect();
  var m = document.createElement('div');
  m.id = 'miniMenu';
  m.className = 'mini-menu';
  m.innerHTML = items.map(function (it, i) {
    return '<button data-mi="' + i + '"' + (it.danger ? ' class="danger"' : '') + '>' +
      (it.icon ? svgIcon(it.icon) : '') + '<span>' + esc(it.label) + '</span></button>';
  }).join('');
  document.body.appendChild(m);
  var w = m.offsetWidth || 148, h = m.offsetHeight || 78;
  var left = Math.min(window.innerWidth - w - 10, Math.max(10, r.left - 6));
  var top = r.bottom + 6;
  if (top + h > window.innerHeight - 10) top = Math.max(10, r.top - h - 6);
  m.style.left = left + 'px';
  m.style.top = top + 'px';
  m.addEventListener('click', function (e) {
    var b = e.target.closest('[data-mi]');
    if (!b) return;
    var idx = parseInt(b.getAttribute('data-mi'), 10);
    closeMiniMenu();
    if (items[idx] && items[idx].fn) items[idx].fn();
  });
  setTimeout(function () { document.addEventListener('mousedown', onDocDown, true); }, 0);
}
function replaceInOrder(key, from, to) {
  var order = readOrder(key);
  var i = order.indexOf(from);
  if (i > -1) { order[i] = to; try { localStorage.setItem(key, JSON.stringify(order)); } catch (e) { } }
}
function dropFromOrder(key, name) {
  var order = readOrder(key).filter(function (x) { return x !== name; });
  try { localStorage.setItem(key, JSON.stringify(order)); } catch (e) { }
}
function renameList(oldName) {
  promptModal('重命名清单', '清单里的 ' + S.tasks.filter(function (t) { return (t.list || '收集箱') === oldName; }).length + ' 条日程会一起改到新名字。', oldName, '清单名称', function (v) {
    var arr = customLists();
    var i = arr.indexOf(oldName);
    if (i > -1) arr.splice(i, 1);
    if (arr.indexOf(v) === -1) arr.push(v);
    writeStrArr(CUSTOM_LISTS_KEY, arr);
    replaceInOrder('wb_schedule_list_order', oldName, v);
    S.tasks.forEach(function (t) {
      if ((t.list || '收集箱') === oldName) { t.list = v; apiUpdateTask(t, ['清单']); }
    });
    if (S.selectedList === oldName) S.selectedList = v;
    cacheLocal(); refreshAll();
    toast('已重命名为「' + v + '」');
  });
}
function removeList(name) {
  var n = S.tasks.filter(function (t) { return (t.list || '收集箱') === name; }).length;
  confirmModal('删除清单', '「' + esc(name) + '」' + (n ? '里有 <b>' + n + '</b> 条日程，删除后这些日程会移到「收集箱」。' : '目前没有日程。') + '<br><br>清单本身会被移除，任务不会被删除。', '删除清单', function () {
    writeStrArr(CUSTOM_LISTS_KEY, customLists().filter(function (x) { return x !== name; }));
    dropFromOrder('wb_schedule_list_order', name);
    S.tasks.forEach(function (t) {
      if ((t.list || '收集箱') === name) { t.list = '收集箱'; apiUpdateTask(t, ['清单']); }
    });
    if (S.selectedList === name) S.selectedList = null;
    cacheLocal(); refreshAll();
    toast('已删除清单「' + name + '」');
  }, true);
}
function renameTag(oldName) {
  promptModal('重命名标签', '会给所有用到 #' + esc(oldName) + ' 的日程换成新标签。', oldName, '标签名（不含 #）', function (raw) {
    var v = String(raw || '').replace(/^#/, '').trim();
    if (!v || v === oldName) return;
    var arr = customTags();
    var i = arr.indexOf(oldName);
    if (i > -1) arr.splice(i, 1);
    if (arr.indexOf(v) === -1) arr.push(v);
    writeStrArr(CUSTOM_TAGS_KEY, arr);
    replaceInOrder('wb_schedule_tag_order', oldName, v);
    S.tasks.forEach(function (t) {
      var j = (t.tags || []).indexOf(oldName);
      if (j > -1) {
        if (t.tags.indexOf(v) === -1) t.tags[j] = v; else t.tags.splice(j, 1);
        apiUpdateTask(t, ['标签']);
      }
    });
    if (S.selectedTag === oldName) S.selectedTag = v;
    cacheLocal(); refreshAll();
    toast('已重命名为 #' + v);
  });
}
function removeTag(name) {
  var n = S.tasks.filter(function (t) { return (t.tags || []).indexOf(name) > -1; }).length;
  confirmModal('删除标签', n ? '有 <b>' + n + '</b> 条日程带着 #' + esc(name) + '，删除后只是去掉这个标签，日程本身不受影响。' : '这个标签还没有被使用。', '删除标签', function () {
    writeStrArr(CUSTOM_TAGS_KEY, customTags().filter(function (x) { return x !== name; }));
    dropFromOrder('wb_schedule_tag_order', name);
    S.tasks.forEach(function (t) {
      var j = (t.tags || []).indexOf(name);
      if (j > -1) { t.tags.splice(j, 1); apiUpdateTask(t, ['标签']); }
    });
    if (S.selectedTag === name) S.selectedTag = null;
    cacheLocal(); refreshAll();
    toast('已删除标签 #' + name);
  }, true);
}

function confirmModal(title, desc, okText, onOk, danger) {
  openModal(
    '<div class="modal sm">' +
    '<div class="m-head"><h3>' + esc(title) + '</h3><button class="m-close">' + svgIcon('close') + '</button></div>' +
    '<div class="m-body"><div style="font-size:13px;color:var(--text-2);line-height:1.7">' + desc + '</div></div>' +
    '<div class="m-foot"><div class="spacer"></div>' +
    '<button class="btn btn-sec" data-x="no">取消</button>' +
    '<button class="btn ' + (danger ? 'btn-danger' : 'btn-pri') + '" data-x="ok">' + esc(okText || '确定') + '</button>' +
    '</div></div>', {
    onMount: function (w) {
      w.querySelector('[data-x="no"]').addEventListener('click', closeModal);
      w.querySelector('[data-x="ok"]').addEventListener('click', function () { closeModal(); onOk && onOk(); });
    }
  });
}
/* ---------- 计算层 ---------- */
var ARCHIVED_KEY = 'wb_schedule_archived_lists';
function archivedLists() { return readStrArr(ARCHIVED_KEY); }
function isArchived(name) { return archivedLists().indexOf(name) > -1; }
function archiveList(name) {
  var arr = archivedLists();
  if (arr.indexOf(name) === -1) arr.push(name);
  writeStrArr(ARCHIVED_KEY, arr);
  if (S.selectedList === name) S.selectedList = null;
  refreshAll();
  toast('已归档「' + name + '」，在侧栏底部可以找回');
}
function unarchiveList(name) {
  writeStrArr(ARCHIVED_KEY, archivedLists().filter(function (x) { return x !== name; }));
  refreshAll();
  toast('已取消归档「' + name + '」');
}
var CUSTOM_LISTS_KEY = 'wb_schedule_custom_lists';
var CUSTOM_TAGS_KEY = 'wb_schedule_custom_tags';
function readStrArr(key) {
  try {
    var v = JSON.parse(localStorage.getItem(key) || '[]');
    return Object.prototype.toString.call(v) === '[object Array]' ? v : [];
  } catch (e) { return []; }
}
function writeStrArr(key, arr) {
  try { localStorage.setItem(key, JSON.stringify(arr)); } catch (e) { }
}
function customLists() { return readStrArr(CUSTOM_LISTS_KEY); }
function customTags() { return readStrArr(CUSTOM_TAGS_KEY); }
function addCustomList(name) {
  name = String(name || '').trim();
  if (!name) return '';
  var arr = customLists();
  if (arr.indexOf(name) === -1) { arr.push(name); writeStrArr(CUSTOM_LISTS_KEY, arr); }
  return name;
}
function addCustomTag(name) {
  name = String(name || '').trim().replace(/^#/, '');
  if (!name) return '';
  var arr = customTags();
  if (arr.indexOf(name) === -1) { arr.push(name); writeStrArr(CUSTOM_TAGS_KEY, arr); }
  return name;
}
function readOrder(key) {
  try {
    var v = JSON.parse(localStorage.getItem(key) || '[]');
    return Object.prototype.toString.call(v) === '[object Array]' ? v : [];
  } catch (e) { return []; }
}
function orderNames(names, key) {
  var order = readOrder(key);
  if (!order.length) return names;
  var idx = {};
  order.forEach(function (n, i) { idx[n] = i; });
  var base = {};
  names.forEach(function (n, i) { base[n] = i; });
  return names.slice().sort(function (a, b) {
    var ia = idx[a], ib = idx[b];
    if (ia === undefined && ib === undefined) return base[a] - base[b];
    if (ia === undefined) return 1;
    if (ib === undefined) return -1;
    return ia - ib;
  });
}
function allTags() {
  var map = {};
  S.tasks.forEach(function (t) { t.tags.forEach(function (g) { map[g] = (map[g] || 0) + 1; }); });
  customTags().forEach(function (n) { if (!map[n]) map[n] = 0; });
  var names = Object.keys(map).sort(function (a, b) { return map[b] - map[a]; });
  return orderNames(names, 'wb_schedule_tag_order');
}
function allLists() {
  var map = {};
  S.tasks.forEach(function (t) { var k = t.list || '收集箱'; map[k] = (map[k] || 0) + 1; });
  customLists().forEach(function (n) { if (!map[n]) map[n] = 0; });
  if (!map['收集箱']) map['收集箱'] = 0;
  var names = Object.keys(map).sort(function (a, b) {
    if (a === '收集箱') return -1;
    if (b === '收集箱') return 1;
    return map[b] - map[a];
  });
  return orderNames(names, 'wb_schedule_list_order');
}
function taskTimeVal(t) {
  var m = parseHM(t.time);
  return m === null ? 24 * 60 + 1 : m;
}
function sortTasks(arr) {
  var manual = S.sortMode === 'manual';
  return arr.slice().sort(function (a, b) {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.done && b.done) return (b.doneAt || '').localeCompare(a.doneAt || '');
    var da = a.date || '9999-99-99', db2 = b.date || '9999-99-99';
    if (da !== db2) return da < db2 ? -1 : 1;
    var sa = Number(a.sort) || 0, sb = Number(b.sort) || 0;
    var ta = taskTimeVal(a), tb = taskTimeVal(b);
    if (manual) {
      if (sa !== sb) return sa - sb;
      if (ta !== tb) return ta - tb;
    } else {
      if (ta !== tb) return ta - tb;
      if (sa !== sb) return sa - sb;
    }
    var pa = PRIOS.indexOf(a.prio), pb = PRIOS.indexOf(b.prio);
    if (pa < 0) pa = 99; if (pb < 0) pb = 99;
    return pa - pb;
  });
}
function inScope(t) {
  var t0 = today0();
  if (S.selectedList) return (t.list || '收集箱') === S.selectedList;
  if (S.selectedTag) return t.tags.indexOf(S.selectedTag) > -1;
  if (S.view === 'today') return t.date === ymd(t0) || (t.date && t.date < ymd(t0));
  if (S.view === 'next7') {
    if (!t.date) return false;
    var d = parseYmd(t.date);
    var diff = dayDiff(t0, d);
    return diff >= 0 && diff < 7;
  }
  if (S.view === 'inbox') return !t.date || (t.list || '收集箱') === '收集箱';
  return true;
}
function applyFilters(arr) {
  var f = S.filters;
  var today = ymd(today0());
  return arr.filter(function (t) {
    if (f.status === 'todo') {
      if (t.done && t.doneAt !== today) return false;
    } else if (f.status === 'done') {
      if (!t.done) return false;
    }
    if (f.prio.length && f.prio.indexOf(t.prio || 'none') === -1) return false;
    if (f.tags.length && !f.tags.some(function (g) { return t.tags.indexOf(g) > -1; })) return false;
    if (f.from && (!t.date || t.date < f.from)) return false;
    if (f.to && (!t.date || t.date > f.to)) return false;
    if (f.kw) {
      var kw = f.kw.toLowerCase();
      var subTxt = (t.subs || []).map(function (x) { return x.title; }).join(' ');
      var hay = (t.title + ' ' + t.note + ' ' + t.tags.join(' ') + ' ' + t.list + ' ' + subTxt).toLowerCase();
      if (hay.indexOf(kw) === -1) return false;
    }
    return true;
  });
}
function visibleTasks() {
  return sortTasks(applyFilters(S.tasks.filter(inScope)));
}
function activeFilterCount() {
  var f = S.filters, n = 0;
  if (f.prio.length) n++;
  if (f.tags.length) n++;
  if (f.status !== 'todo') n++;
  if (f.from) n++;
  if (f.to) n++;
  if (f.kw) n++;
  return n;
}
function countBy(fn) { return S.tasks.filter(fn).length; }
function nextReminder(t) {
  if (!t.remindCfg || !t.remindCfg.anchor || t.done) return null;
  var anchor = parseAnchor(t.remindCfg.anchor);
  if (!anchor) return null;
  var offs = t.remindCfg.offsets || EB_OFFSETS;
  var read = t.remindCfg.read || [];
  var now = Date.now();
  var best = null, bestIdx = -1;
  for (var i = 0; i < offs.length; i++) {
    if (read.indexOf(i) > -1) continue;
    var at = anchor.getTime() + offs[i] * 60000;
    if (at <= now) { if (best === null || at > best) { best = at; bestIdx = i; } }
  }
  if (best !== null) return { at: best, idx: bestIdx, overdue: true, offset: offs[bestIdx] };
  for (var j = 0; j < offs.length; j++) {
    if (read.indexOf(j) > -1) continue;
    var at2 = anchor.getTime() + offs[j] * 60000;
    if (at2 > now) return { at: at2, idx: j, overdue: false, offset: offs[j] };
  }
  return null;
}
function parseAnchor(s) {
  if (!s) return null;
  var m = String(s).match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10),
    m[4] ? parseInt(m[4], 10) : 9, m[5] ? parseInt(m[5], 10) : 0);
}
// 改日期 / 时间之后，把提醒的基准时间一起挪过去。
// 只改 t.date 不动 remindCfg.anchor 的话：提醒还在旧的那天响，
// 而且一直算「逾期」，日程会被顶在「今天要处理」里下不来。
function syncRemindAnchor(t, oldDate, oldTime) {
  if (!t || !t.remindCfg) return false;
  var cfg = t.remindCfg;
  // 变成「未安排」就没有基准了，先把提醒挂起（配置留着，排上日期再自动接回来）
  if (!t.date) {
    if (!cfg.anchor) return false;
    t.remindCfg = { anchor: '', offsets: (cfg.offsets || EB_OFFSETS).slice(), read: [] };
    return true;
  }
  var a = parseAnchor(cfg.anchor);
  var hhmm;
  if (!a) {
    // 之前被「未安排」挂起过，现在又排上日子了，按新的日期和时间接回来
    if (!cfg.offsets || !cfg.offsets.length) return false;
    hhmm = t.time || '09:00';
  } else {
    var ah = pad2(a.getHours()) + ':' + pad2(a.getMinutes());
    // 锚点时间还是默认值（等于原来的开始时间）就继续跟着新的时间走；
    // 用户手动改过「基准时间」的，只换日期，不动几点
    hhmm = (ah === (oldTime || '09:00')) ? (t.time || '09:00') : ah;
  }
  var next = t.date + ' ' + hhmm;
  var cur = String(cfg.anchor || '').replace('T', ' ').slice(0, 16);
  if (cur === next) return false;
  // 日子变了，原来的「已提醒」标记作废，否则新日期上的提醒会被当成已读吞掉
  t.remindCfg = { anchor: next, offsets: (cfg.offsets || EB_OFFSETS).slice(), read: [] };
  return true;
}
function pendingReminders() {
  var out = [];
  S.tasks.forEach(function (t) {
    var r = nextReminder(t);
    if (r && r.overdue) out.push({ task: t, r: r });
  });
  return out.sort(function (a, b) { return a.r.at - b.r.at; });
}
function calcStreak(h) {
  var set = {};
  (h.log || []).forEach(function (d) { set[d] = 1; });
  var cur = today0(), n = 0;
  if (!set[ymd(cur)]) cur = addDays(cur, -1);
  while (set[ymd(cur)]) { n++; cur = addDays(cur, -1); }
  return n;
}

/* ---------- 顶层刷新（唯一入口） ---------- */
function refreshAll() {
  var c0 = document.getElementById('content');
  var keepTop = c0 ? c0.scrollTop : 0;
  renderSidebar();
  renderTopbar();
  renderBell();
  if (S.view === 'calendar') renderCalendarView();
  else if (S.view === 'quadrant') renderQuadrantView();
  else if (S.view === 'habit') renderHabitView();
  else if (S.view === 'countdown') renderCountdownView();
  else if (S.view === 'focus') renderFocusView();
  else if (S.view === 'stats') renderStatsView();
  else renderTaskView();
  var c1 = document.getElementById('content');
  if (c1) {
    c1.style.scrollBehavior = 'auto';
    c1.scrollTop = keepTop;
    c1.style.scrollBehavior = '';
  }
}

/* ---------- 侧边栏 ---------- */
function renderSidebar() {
  var t0 = ymd(today0());
  var todayCount = countBy(function (t) { return !t.done && t.date && t.date <= t0; });
  var next7 = countBy(function (t) {
    if (t.done || !t.date) return false;
    var d = dayDiff(today0(), parseYmd(t.date));
    return d >= 0 && d < 7;
  });
  var inbox = countBy(function (t) { return !t.done && (!t.date || (t.list || '收集箱') === '收集箱'); });
  var habitPending = S.habits.filter(function (h) { return h.log.indexOf(t0) === -1; }).length;
  setTxt('cntToday', todayCount || '');
  setTxt('cntNext7', next7 || '');
  setTxt('cntInbox', inbox || '');
  setTxt('cntHabit', habitPending || '');
  var cT = document.getElementById('cntToday');
  if (cT) cT.className = 'cnt' + (todayCount ? ' warn' : '');

  var nav = document.getElementById('navMain');
  if (nav) {
    Array.prototype.forEach.call(nav.children, function (el) {
      var v = el.getAttribute('data-view');
      var on = S.view === v && !S.selectedList && !S.selectedTag;
      el.className = 'nav-item' + (on ? ' on' : '');
    });
  }
  var tb = document.getElementById('tabbar');
  if (tb) {
    Array.prototype.forEach.call(tb.querySelectorAll('a'), function (el) {
      el.className = (S.view === el.getAttribute('data-view') && !S.selectedList && !S.selectedTag) ? 'on' : '';
    });
  }
  var ln = document.getElementById('listNav');
  var allL = allLists();
  var liveL = allL.filter(function (nm) { return !isArchived(nm); });
  var archL = allL.filter(function (nm) { return isArchived(nm); });
  if (ln) {
    ln.innerHTML = liveL.map(function (nm, i) {
      var c = countBy(function (t) { return !t.done && (t.list || '收集箱') === nm; });
      var on = S.selectedList === nm;
      return '<div class="side-item' + (on ? ' on' : '') + '" data-list="' + esc(nm) + '" data-drag-name="' + esc(nm) + '">' +
        '<span class="dot" style="background:' + LIST_COLORS[i % LIST_COLORS.length] + '"></span>' +
        '<span class="nm">' + esc(nm) + '</span>' +
        (c ? '<span class="cnt">' + c + '</span>' : '') +
        (nm === '收集箱' ? '' : '<button class="side-more" data-listmore="' + esc(nm) + '" title="管理清单">' + svgIcon('more') + '</button>') +
        '</div>';
    }).join('');
  }
  var an = document.getElementById('archivedNav');
  if (an) {
    if (!archL.length) an.innerHTML = '';
    else {
      an.innerHTML = '<div class="side-sub"><span>已归档</span><b>' + archL.length + '</b></div>' +
        archL.map(function (nm) {
          var on = S.selectedList === nm;
          return '<div class="side-item archived' + (on ? ' on' : '') + '" data-list="' + esc(nm) + '">' +
            '<span class="dot" style="background:#B9AE9C"></span>' +
            '<span class="nm">' + esc(nm) + '</span>' +
            '<button class="side-more show" data-listmore="' + esc(nm) + '" title="管理清单">' + svgIcon('more') + '</button>' +
            '</div>';
        }).join('');
    }
  }
  var tn = document.getElementById('tagNav');
  if (tn) {
    var tags = allTags();
    tn.innerHTML = tags.length ? tags.map(function (g) {
      var c = countBy(function (t) { return !t.done && t.tags.indexOf(g) > -1; });
      var on = S.selectedTag === g;
      return '<div class="side-item' + (on ? ' on' : '') + '" data-tag="' + esc(g) + '" data-drag-name="' + esc(g) + '">' +
        '<span class="nm"># ' + esc(g) + '</span>' +
        (c ? '<span class="cnt">' + c + '</span>' : '') +
        '<button class="side-more" data-tagmore="' + esc(g) + '" title="管理标签">' + svgIcon('more') + '</button>' +
        '</div>';
    }).join('') : '<div style="font-size:11.5px;color:var(--text-3);padding:4px 10px">暂无标签，加任务时用 #标签</div>';
  }
}
function setTxt(id, v) {
  var el = document.getElementById(id);
  if (el) el.textContent = v;
}
function renderTopbar() {
  var title = '今天', sub = '';
  var t = today0();
  if (S.selectedList) { title = S.selectedList; sub = '清单 · 共 ' + countBy(function (x) { return (x.list || '收集箱') === S.selectedList; }) + ' 项'; }
  else if (S.selectedTag) { title = '# ' + S.selectedTag; sub = '标签 · 共 ' + countBy(function (x) { return x.tags.indexOf(S.selectedTag) > -1; }) + ' 项'; }
  else if (S.view === 'today') { title = '今天'; sub = t.getFullYear() + ' 年 ' + (t.getMonth() + 1) + ' 月 ' + t.getDate() + ' 日 · ' + weekdayName(t); }
  else if (S.view === 'next7') { title = '最近 7 天'; sub = shortDate(t) + ' — ' + shortDate(addDays(t, 6)); }
  else if (S.view === 'inbox') { title = '收集箱'; sub = '还没安排时间的任务'; }
  else if (S.view === 'calendar') { title = '日历'; sub = '年 / 月 / 周 / 多周 / 日 / 多日 六种视图'; }
  else if (S.view === 'quadrant') { title = '四象限'; sub = '按重要 × 紧急划分优先级'; }
  else if (S.view === 'habit') { title = '习惯打卡'; sub = '共 ' + S.habits.length + ' 个习惯 · 今日待打卡 ' + S.habits.filter(function (h) { return h.log.indexOf(ymd(t)) === -1; }).length + ' 个'; }
  else if (S.view === 'countdown') { title = '倒数纪念日'; sub = '记住每一个重要的日子'; }
  else if (S.view === 'focus') { title = '番茄专注'; sub = '25 分钟为一个专注周期'; }
  else if (S.view === 'stats') { title = '数据统计'; sub = '任务 · 专注 · 习惯 全景回顾'; }
  setTxt('viewTitle', title);
  setTxt('viewSub', sub);

  var sw = document.getElementById('viewSwitch');
  if (sw) {
    var showSwitch = (S.view === 'today' || S.view === 'next7' || S.view === 'inbox' || S.selectedList || S.selectedTag);
    sw.style.display = showSwitch ? '' : 'none';
    Array.prototype.forEach.call(sw.children, function (b) {
      b.className = b.getAttribute('data-vmode') === S.vmode ? 'on' : '';
    });
  }
  var srt = document.getElementById('btnSort');
  if (srt) {
    srt.style.display = showSwitch ? '' : 'none';
    srt.className = 'tb-btn' + (S.sortMode === 'manual' ? ' on' : '');
    srt.title = S.sortMode === 'manual' ? '当前：手动排序（拖动任务调整顺序）' : '当前：按时间排序';
    var st2 = srt.querySelector('.txt');
    if (st2) st2.textContent = S.sortMode === 'manual' ? '手动排序' : '按时间';
  }
  var fb = document.getElementById('btnFilter');
  if (fb) {
    fb.style.display = showSwitch ? '' : 'none';
    var n = activeFilterCount();
    fb.className = 'tb-btn' + (n ? ' on' : '');
    var txt = fb.querySelector('.txt');
    if (txt) txt.textContent = n ? '筛选 ' + n : '筛选';
    fb.title = n ? '筛选 · 已启用 ' + n + ' 个条件' : '筛选';
  }
}
function renderBell() {
  var pend = pendingReminders();
  var b = document.getElementById('bellBadge');
  if (!b) return;
  if (pend.length) { b.textContent = pend.length > 99 ? '99+' : pend.length; b.classList.remove('hidden'); }
  else b.classList.add('hidden');
}

/* ---------- 清单视图 ---------- */
function renderTaskView() {
  var html = '';
  if (S.selectedList && isArchived(S.selectedList)) {
    html += '<div class="banner" style="background:var(--panel-2);border-color:var(--line);color:var(--text-2);margin-bottom:10px">' +
      svgIcon('box') + '<span>「' + esc(S.selectedList) + '」已归档。仍可查看和编辑，只是不出现在侧栏清单里。</span>' +
      '<button class="bact" data-unarchive="' + esc(S.selectedList) + '">取消归档</button></div>';
  }
  // 换视图 / 换清单 / 改筛选时把分页重置回第一屏
  var listKey = [S.view, S.selectedList || '', S.selectedTag || '', S.vmode,
    JSON.stringify(S.filters || {})].join('|');
  if (S._listKey !== listKey) { S._listKey = listKey; S.listLimit = LIST_PAGE; }

  html += renderTodayPanel();
  html += renderFilterBar();
  if (S.vmode === 'timeline') html += renderTimelineBody();
  else if (S.vmode === 'kanban') html += renderKanbanBody();
  else {
    var rows = visibleTasks();
    if (!rows.length) html += emptyBlock('这里很干净', '没有符合条件的日程。换个筛选条件，或者添加一条新日程。', '+ 添加日程', 'add');
    else if (S.vmode === 'card') html += renderCardBody(rows);
    else html += renderListBody(rows);
  }
  var c = swapContent(html);
  bindTaskViewEvents(c);
}
function renderTodayPanel() {
  var t0 = today0(), t0s = ymd(t0);
  // 只收「今天该动手」的：逾期 + 今天到期 + 今天到点的复习。
  // 未来几天的不放进来 —— 面板叫「今天要处理」，塞别的日期只会让人以为日期没改成功。
  var overdue = [], todayItems = [], remind = [];
  S.tasks.filter(inScope).forEach(function (t) {
    if (t.done) return;
    if (t.date && t.date < t0s) overdue.push(t);
    else if (t.date === t0s) todayItems.push(t);
    var r = nextReminder(t);
    if (r && r.overdue) remind.push({ t: t, r: r });
  });
  overdue = sortTasks(overdue); todayItems = sortTasks(todayItems);
  // 同一条日程可能既逾期又有待复习，计数要去重，否则会出现「4 项」只有 3 行
  var seen = {};
  overdue.concat(todayItems).forEach(function (x) { seen[x.id] = 1; });
  remind.forEach(function (it) { seen[it.t.id] = 1; });
  var total = Object.keys(seen).length;
  var rows = [];
  overdue.slice(0, 4).forEach(function (t) {
    rows.push({ t: t, kind: 'over', label: '逾期 ' + Math.abs(dayDiff(t0, parseYmd(t.date))) + ' 天' });
  });
  if (remind.length) {
    remind.slice(0, 3).forEach(function (it) {
      if (rows.length >= 7) return;
      // 今天到期、而且下面「今天」那行肯定列得出来的，不用再挂一条「该复习」
      if (it.t.date === t0s && todayItems.indexOf(it.t) > -1 && todayItems.indexOf(it.t) < 6) return;
      var dup = rows.some(function (r) { return r.t.id === it.t.id; });
      if (!dup) rows.push({ t: it.t, kind: 'remind', label: '该复习' });
    });
  }
  todayItems.slice(0, 6).forEach(function (t) {
    if (rows.length >= 8) return;
    rows.push({ t: t, kind: 'today', label: t.time ? t.time : '今天' });
  });

  var body;
  if (!rows.length) {
    body = '<div class="today-empty">' + svgIcon('check') + '今天没有待办，享受这份清闲吧</div>';
  } else {
    body = rows.map(function (r) {
      return '<div class="today-row" data-tid="' + esc(r.t.id) + '">' +
        '<span class="tag-mini ' + r.kind + '">' + esc(r.label) + '</span>' +
        '<span class="tt">' + esc(r.t.title) + '</span>' +
        (r.t.time && r.kind !== 'today' ? '<span class="tm">' + esc(r.t.time) + '</span>' : '') +
        '<button class="go" data-done="' + esc(r.t.id) + '" title="完成">' + svgIcon('check') + '</button>' +
        '</div>';
    }).join('');
  }
  return '<section class="today-panel">' +
    '<div class="today-head"><h2><span class="pin"></span>今天要处理</h2>' +
    '<span class="stat">' + (total ? total + ' 项待处理 · 逾期 ' + overdue.length + ' 项' : '今天没有要处理的') + '</span></div>' +
    '<div class="today-body">' + body + '</div></section>';
}
function renderFilterBar() {
  var f = S.filters, chips = [];
  if (f.prio.length) chips.push({ k: 'prio', t: '优先级 ' + f.prio.join('/') });
  if (f.tags.length) chips.push({ k: 'tags', t: '标签 ' + f.tags.map(function (x) { return '#' + x; }).join(' ') });
  if (f.status !== 'todo') chips.push({ k: 'status', t: f.status === 'done' ? '只看已完成' : '全部任务' });
  if (f.from) chips.push({ k: 'from', t: '从 ' + f.from });
  if (f.to) chips.push({ k: 'to', t: '到 ' + f.to });
  if (f.kw) chips.push({ k: 'kw', t: '搜索「' + f.kw + '」' });
  if (!chips.length) return '';
  return '<div class="filter-bar">' + chips.map(function (c) {
    return '<span class="fchip">' + esc(c.t) + '<button data-clear="' + c.k + '">' + svgIcon('close') + '</button></span>';
  }).join('') + '<button class="fchip" style="background:var(--line-2);color:var(--text-2)" data-clear="all">清除全部</button></div>';
}
// 列表分批渲染：一次只吐 60 条，剩下的点按钮再加，避免几百条时整页重建
var LIST_PAGE = 60;
function renderListBody(rows) {
  var groups = {}, order = [];
  rows.forEach(function (t) {
    var k = t.done ? '已完成' : (t.date ? dateLabel(parseYmd(t.date)) : '未安排');
    if (!groups[k]) { groups[k] = []; order.push(k); }
    groups[k].push(t);
  });
  var limit = S.listLimit || LIST_PAGE;
  var html = '', shown = 0;
  order.forEach(function (k) {
    var list = groups[k];
    var room = Math.max(0, limit - shown);
    if (!room) return;
    var part = list.slice(0, room);
    shown += part.length;
    html += '<div class="sec-head"><h3>' + esc(k) + '</h3><span class="meta">' + list.length + ' 项</span><span class="line"></span></div>';
    html += '<div class="task-list">' + part.map(taskRowHtml).join('') + '</div>';
  });
  if (shown < rows.length) {
    var more = Math.min(LIST_PAGE, rows.length - shown);
    html += '<button class="load-more" data-loadmore>再显示 ' + more + ' 条<span class="lm-sub">还有 ' + (rows.length - shown) + ' 条没显示 / 共 ' + rows.length + ' 条</span></button>';
  }
  return html;
}
function taskRowHtml(t) {
  var t0 = today0(), cls = 'task' + (t.done ? ' done' : '');
  var due = '', overdue = false;
  if (t.date) {
    var d = parseYmd(t.date), diff = dayDiff(t0, d);
    var dcls = diff < 0 ? 'due-over' : (diff === 0 ? 'due-today' : '');
    overdue = diff < 0;
    due = '<span class="m ' + dcls + '">' + svgIcon('calendar') + shortDate(d) + (t.time ? ' ' + timeRangeText(t) : '') + '</span>';
  }
  var r = nextReminder(t);
  var rm = r ? '<span class="m due-remind">' + svgIcon('bell') + (r.overdue ? '待复习' : relTime(r.at)) + '</span>' : '';
  var tags = t.tags.map(function (g) {
    return '<span class="tag-chip ' + tagColor(g) + '">#' + esc(g) + '</span>';
  }).join('');
  var est = t.estimate ? '<span class="est-badge">' + durText(t.estimate) + '</span>' : '';
  return '<div class="' + cls + (S.detailId === t.id ? ' active' : '') + '" data-tid="' + esc(t.id) + '">' +
    (t.prio ? '<span class="prio-bar ' + t.prio.toLowerCase() + '"></span>' : '') +
    '<div class="chk" data-done="' + esc(t.id) + '">' + svgIcon('check') + '</div>' +
    '<div class="task-main"><div class="task-title-row">' + flagHtml(t) +
    '<div class="task-title">' + esc(t.title) + '</div>' +
    subCountHtml(t) + '</div>' +
    subRowsHtml(t, 8) +
    (t.note ? '<div class="task-note">' + esc(t.note) + '</div>' : '') +
    '<div class="task-meta">' + due +
    (repeatLabel(t) ? '<span class="m due-repeat">' + svgIcon('repeat') + esc(repeatLabel(t)) + '</span>' : '') + rm + tags +
    (t.list && t.list !== '收集箱' ? '<span class="m">' + svgIcon('inbox') + esc(t.list) + '</span>' : '') +
    '</div></div>' +
    '<div class="task-right">' + est +
    '<button class="task-act" data-edit="' + esc(t.id) + '" title="编辑">' + svgIcon('edit') + '</button>' +
    '<button class="task-act" data-del="' + esc(t.id) + '" title="删除">' + svgIcon('trash') + '</button>' +
    '</div></div>';
}
function renderCardBody(rows) {
  var limit = S.listLimit || LIST_PAGE;
  var part = rows.slice(0, limit);
  return '<div class="card-grid">' + part.map(function (t) {
    var diff = t.date ? dayDiff(today0(), parseYmd(t.date)) : null;
    var dcls = diff === null ? '' : (diff < 0 ? 'over' : diff === 0 ? 'today' : '');
    var tags = t.tags.map(function (g) { return '<span class="tag-chip ' + tagColor(g) + '">#' + esc(g) + '</span>'; }).join('');
    return '<div class="tcard ' + (t.prio ? t.prio.toLowerCase() : '') + (t.done ? ' done' : '') + (S.detailId === t.id ? ' active' : '') + '" data-tid="' + esc(t.id) + '">' +
      '<div class="tcard-top"><div class="chk" data-done="' + esc(t.id) + '">' + svgIcon('check') + '</div>' +
      flagHtml(t) + '<div class="tcard-title">' + esc(t.title) + '</div>' + subCountHtml(t) + '</div>' +
      subRowsHtml(t, 5) +
      (t.note ? '<div class="tcard-note">' + esc(t.note) + '</div>' : '') +
      '<div class="tcard-foot">' + tags +
      (t.estimate ? '<span class="est-badge">' + durText(t.estimate) + '</span>' : '') +
      (t.time ? '<span class="tcard-time">' + svgIcon('clock') + timeRangeText(t) + '</span>' : '') +
      (t.date ? '<span class="tcard-date ' + dcls + '">' + svgIcon('calendar') + shortDate(parseYmd(t.date)) + '</span>' : '') +
      '</div></div>';
  }).join('') + '</div>' +
    (rows.length > part.length
      ? '<button class="load-more" data-loadmore>再显示 ' + Math.min(LIST_PAGE, rows.length - part.length) + ' 张' +
        '<span class="lm-sub">还有 ' + (rows.length - part.length) + ' 张没显示 / 共 ' + rows.length + ' 张</span></button>'
      : '');
}
function kanbanGroups() {
  var g = S.kanbanGroup, map = [], rows = visibleTasks();
  if (g === 'priority') {
    map.push({ key: 'P0', title: 'P0 · 最高', color: 'var(--red)', items: [] });
    map.push({ key: 'P1', title: 'P1 · 高', color: 'var(--orange)', items: [] });
    map.push({ key: 'P2', title: 'P2 · 中', color: 'var(--brand)', items: [] });
    map.push({ key: 'P3', title: 'P3 · 低', color: 'var(--text-3)', items: [] });
    map.push({ key: 'none', title: '未分级', color: 'var(--text-3)', items: [] });
    rows.forEach(function (t) {
      var k = String(t.prio || '').toUpperCase() || 'none';
      var col = map.filter(function (c) { return c.key === k; })[0];
      if (col) col.items.push(t); else map[4].items.push(t);
    });
  } else if (g === 'list') {
    allLists().forEach(function (nm, i) { map.push({ key: nm, title: nm, color: LIST_COLORS[i % LIST_COLORS.length], items: [] }); });
    rows.forEach(function (t) {
      var nm = t.list || '收集箱';
      var col = map.filter(function (c) { return c.key === nm; })[0];
      if (col) col.items.push(t);
    });
  } else if (g === 'tags') {
    var tags = allTags();
    if (!tags.length) tags = ['无标签'];
    tags.forEach(function (nm, i) { map.push({ key: nm, title: '#' + nm, color: LIST_COLORS[i % LIST_COLORS.length], items: [] }); });
    map.push({ key: '__none', title: '无标签', color: 'var(--text-3)', items: [] });
    rows.forEach(function (t) {
      if (!t.tags.length) { map[map.length - 1].items.push(t); return; }
      t.tags.forEach(function (g2) {
        var col = map.filter(function (c) { return c.key === g2; })[0];
        if (col && col.items.indexOf(t) === -1) col.items.push(t);
      });
    });
  } else if (g === 'status') {
    map.push({ key: 'todo', title: '待处理', color: 'var(--brand)', items: [] });
    map.push({ key: 'doing', title: '今天到期', color: 'var(--orange)', items: [] });
    map.push({ key: 'over', title: '已逾期', color: 'var(--red)', items: [] });
    map.push({ key: 'done', title: '已完成', color: 'var(--green)', items: [] });
    rows.forEach(function (t) {
      var t0 = ymd(today0());
      if (t.done) map[3].items.push(t);
      else if (t.date && t.date < t0) map[2].items.push(t);
      else if (t.date === t0) map[1].items.push(t);
      else map[0].items.push(t);
    });
  } else {
    map.push({ key: 'over', title: '已逾期', color: 'var(--red)', items: [] });
    map.push({ key: 'today', title: '今天', color: 'var(--brand)', items: [] });
    map.push({ key: 'week', title: '本周内', color: 'var(--green)', items: [] });
    map.push({ key: 'later', title: '更晚', color: 'var(--purple)', items: [] });
    map.push({ key: 'none', title: '未安排', color: 'var(--text-3)', items: [] });
    rows.forEach(function (t) {
      if (!t.date) { map[4].items.push(t); return; }
      var d = dayDiff(today0(), parseYmd(t.date));
      if (d < 0) map[0].items.push(t);
      else if (d === 0) map[1].items.push(t);
      else if (d <= 7) map[2].items.push(t);
      else map[3].items.push(t);
    });
  }
  return map;
}
function renderKanbanBody() {
  var groups = kanbanGroups();
  var opts = [
    { k: 'priority', t: '按优先级' }, { k: 'list', t: '按清单' }, { k: 'tags', t: '按标签' },
    { k: 'status', t: '按状态' }, { k: 'date', t: '按日期' }
  ];
  var head = '<div class="sec-head"><h3>看板</h3><span class="meta">' + groups.length + ' 列</span><span class="line"></span></div>' +
    '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:12px">' +
    opts.map(function (o) {
      return '<button class="chip-p' + (S.kanbanGroup === o.k ? ' on' : '') + '" data-kgroup="' + o.k + '">' + o.t + '</button>';
    }).join('') + '</div>';
  var cols = groups.map(function (g) {
    return '<div class="kcol" data-kkey="' + esc(g.key) + '"><div class="kcol-head">' +
      '<span class="kdot" style="background:' + g.color + '"></span>' + esc(g.title) +
      '<span class="kcnt">' + g.items.length + '</span>' +
      '<button class="kadd" data-kadd="' + esc(g.key) + '" title="在此分组新建">' + svgIcon('plus') + '</button>' +
      '</div><div class="kcol-body">' +
      (g.items.length ? g.items.map(function (t) {
        var diff = t.date ? dayDiff(today0(), parseYmd(t.date)) : null;
        var dcls = diff === null ? '' : (diff < 0 ? 'over' : diff === 0 ? 'today' : '');
        return '<div class="kcard' + (t.done ? ' done' : '') + (S.detailId === t.id ? ' active' : '') + '" data-tid="' + esc(t.id) + '">' +
          '<div class="kcard-title">' + flagHtml(t) + esc(t.title) + '</div>' +
          subInlineHtml(t) +
          '<div class="kcard-foot">' +
          t.tags.slice(0, 2).map(function (gg) { return '<span class="tag-chip ' + tagColor(gg) + '">#' + esc(gg) + '</span>'; }).join('') +
          (t.date ? '<span class="kcard-date ' + dcls + '">' + shortDate(parseYmd(t.date)) + '</span>' : '') +
          '</div></div>';
      }).join('') : '<div class="kempty">暂无任务</div>') +
      '</div></div>';
  }).join('');
  return head + '<div class="kanban">' + cols + '</div>';
}
/* ---------- 时间线：按日期的横道图 ---------- */
var GANTT_DEFAULT_DAYS = 7;
var GANTT_TINTS = ['#D8E6F6', '#E6DCF3', '#D8EDE4', '#F8E7CC', '#D4E9F1', '#F7DCDC', '#F1DEE8', '#E7E2DA'];
function listColorOf(name) {
  var lists = allLists();
  var i = lists.indexOf(name);
  if (i < 0) return LIST_COLORS[0];
  return LIST_COLORS[i % LIST_COLORS.length];
}
function listTintOf(name) {
  var lists = allLists();
  var i = lists.indexOf(name);
  return GANTT_TINTS[(i < 0 ? 0 : i) % GANTT_TINTS.length];
}
// 时间线主条的 HTML，泳道渲染和子项展开都要用
function barHtmlOf(x) {
  var t = x.t, days = S._ganttDays || 7;
  var stt = subStats(t);
  var left = (x.off / days * 100).toFixed(4);
  var width = (x.span / days * 100).toFixed(4);
  var sMin = parseHM(t.time);
  var eMin = (sMin !== null && t.estimate) ? sMin + Number(t.estimate) : null;
  var timeTxt = t.time ? (eMin !== null ? t.time + '–' + hmStr(eMin) : t.time) : '全天';
  var tip = t.title + '\n' + timeTxt + ' · ' + x.span + ' 天' +
    (stt.n ? ' · 子项 ' + stt.done + '/' + stt.n : '') + '\n' + t.date + ' 起';
  var segs = subPlan(t).filter(function (g) { return g.days > 0; });
  var segsHtml = '';
  if (segs.length > 1) {
    segsHtml = '<div class="g-segs">' + segs.map(function (g) {
      return '<i style="width:' + (g.days / x.span * 100).toFixed(3) + '%" title="' +
        esc(g.title) + ' · ' + g.days + ' 天 · ' + segDateText(g) + '"></i>';
    }).join('') + '</div>';
  }
  var meta2 = segs.length > 1 ? segs.length + ' 段 · ' + x.span + ' 天' : timeTxt;
  return '<div class="g-bar' + (segs.length > 1 ? ' has-segs' : '') + '" data-gbar="' + esc(t.id) + '" title="' + esc(tip) + '"' +
    ' style="left:' + left + '%;width:calc(' + width + '% - 4px);background:' + listTintOf(t.list) +
    ';color:' + listColorOf(t.list) + ';border-left:3px solid ' + listColorOf(t.list) + '">' +
    segsHtml +
    '<span class="g-bar-t">' + esc(t.title) + '</span>' +
    '<span class="g-bar-m">' + esc(meta2) + '</span>' +
    '<i class="g-resize" data-gresize="' + esc(t.id) + '" title="拖我延长天数"></i>' +
    '</div>';
}
function renderTimelineBody() {
  var t0s = ymd(today0());
  // 时间线跟着当前清单/视图走：今天视图只有今天的任务，范围自然就窄；
  // 直接读 S.tasks 会把别的日子的任务也算进来，今天视图里无故铺成七天
  var rows = visibleTasks().filter(function (t) { return !t.done; });
  var dated = rows.filter(function (t) { return !!t.date; });
  var undated = rows.filter(function (t) { return !t.date; });

  // 范围完全由这批任务自己决定：最早那条的日期 → 最晚那条的结束日
  var minD = null, maxD = null;
  dated.forEach(function (t) {
    var d = parseYmd(t.date);
    if (!d) return;
    var e = addDays(d, Math.max(1, Number(t.span) || 1) - 1);
    if (!minD || d < minD) minD = d;
    if (!maxD || e > maxD) maxD = e;
  });
  if (!minD) {
    return '<div class="sec-head"><h3>时间线</h3><span class="meta">横轴是日期，色带长度就是这件事占几天</span><span class="line"></span></div>' +
      '<div class="gantt-wrap"><div class="g-empty">' + svgIcon('calendar') +
      '<span>当前清单里还没有带日期的日程。加一条带日期的日程，这里就会自动铺开。</span></div></div>' +
      (undated.length ? '<div class="sec-head"><h3>未排期</h3><span class="meta">' + undated.length + ' 项</span><span class="line"></span></div>' +
        '<div class="task-list">' + undated.slice(0, 12).map(taskRowHtml).join('') + '</div>' : '');
  }

  var days = dayDiff(minD, maxD) + 1;
  var start = minD;
  S._ganttDays = days;

  var head = '';
  for (var i = 0; i < days; i++) {
    var d = addDays(start, i), ds = ymd(d);
    var wd = d.getDay();
    var cls = 'g-day' + (ds === t0s ? ' today' : '') + ((wd === 0 || wd === 6) ? ' we' : '');
    head += '<div class="' + cls + '"><em>' + (i === 0 || d.getDate() === 1 ? (d.getMonth() + 1) + ' 月' : '') + '</em>' +
      '<b>' + d.getDate() + '</b><span>' + ['日', '一', '二', '三', '四', '五', '六'][wd] + '</span></div>';
  }

  var items = dated.map(function (t) {
    var off = dayDiff(start, parseYmd(t.date));
    var span = Math.max(1, Number(t.span) || 1);
    return { t: t, off: off, span: span, end: off + span, lane: 0 };
  }).sort(function (a, b) { return a.off - b.off || b.span - a.span; });
  // 不重叠的任务共用一行（泳道），同一天有几件事也不会摊成好几行
  var laneEnd = [];
  items.forEach(function (it) {
    var lane = 0;
    while (laneEnd[lane] !== undefined && laneEnd[lane] > it.off) lane++;
    laneEnd[lane] = it.end;
    it.lane = lane;
  });

  var body = '';
  for (var L = 0; L < laneEnd.length; L++) {
    body += '<div class="g-lane">' + items.filter(function (x) { return x.lane === L; }).map(barHtmlOf).join('') + '</div>';
  }

  var noDate = undated.length
    ? '<div class="sec-head"><h3>未排期</h3><span class="meta">' + undated.length + ' 项</span><span class="line"></span></div>' +
      '<div class="task-list">' + undated.slice(0, 12).map(taskRowHtml).join('') + '</div>'
    : '';

  return '<div class="sec-head"><h3>时间线</h3><span class="meta">横轴是日期，色带长度就是这件事占几天；拖动改开始日，拖右边缘改天数</span><span class="line"></span></div>' +
    '<div class="gantt-wrap">' +
    '<div class="gantt-bar">' +
    '<span class="gantt-range">' + fmtRange(start, maxD) + '</span>' +
    '<span class="gantt-hint">' + items.length + ' 条 · ' + days + ' 天</span>' +
    '</div>' +
    '<div class="gantt" data-start="' + ymd(start) + '" style="--gdays:' + days + '">' +
    '<div class="g-head">' + head + '</div>' +
    body +
    '</div></div>' +
    noDate;
}

function fmtRange(a, b) {
  var s = (a.getMonth() + 1) + '/' + a.getDate();
  var e = (b.getMonth() + 1) + '/' + b.getDate();
  if (a.getFullYear() !== b.getFullYear()) return a.getFullYear() + '/' + s + ' – ' + b.getFullYear() + '/' + e;
  return s + ' – ' + e + ' · ' + a.getFullYear();
}

function relTime(ts) {
  var diff = Math.round((ts - Date.now()) / 60000);
  if (diff <= 0) return '已到时间';
  if (diff < 60) return diff + ' 分钟后';
  if (diff < 1440) return Math.round(diff / 60) + ' 小时后';
  return Math.round(diff / 1440) + ' 天后';
}
function emptyBlock(title, desc, btn, act) {
  return '<div class="empty"><div class="empty-ico">' + svgIcon('inbox') + '</div>' +
    '<h4>' + esc(title) + '</h4><p>' + esc(desc) + '</p>' +
    (btn ? '<button data-empty="' + act + '">' + esc(btn) + '</button>' : '') + '</div>';
}
function bindTaskViewEvents(root) {
  root.addEventListener('click', function (e) {
    if (isSuppressed()) { e.stopPropagation(); return; }
    var so = e.target.closest('[data-subonly]');
    if (so) {
      e.stopPropagation();
      var sid0 = so.getAttribute('data-subonly');
      S.subOnly[sid0] = !S.subOnly[sid0];
      var t0x = findTask(sid0);
      if (t0x) {
        var holder0 = so.closest('.task, .tcard');
        if (holder0) {
          var wrap0 = holder0.querySelector('.sub-rows');
          if (wrap0) {
            var tmp = document.createElement('div');
            tmp.innerHTML = subRowsHtml(t0x);
            wrap0.parentNode.replaceChild(tmp.firstChild, wrap0);
          }
        }
      }
      return;
    }
    var subEl = e.target.closest('[data-subrow]');
    if (subEl) {
      e.stopPropagation();
      var pid = subEl.getAttribute('data-subrow-parent');
      var sidx = parseInt(subEl.getAttribute('data-subrow'), 10);
      var pt = findTask(pid);
      if (!pt) return;
      var flipped = toggleSub(pt, sidx, true);
      if (!flipped) {
        subEl.classList.toggle('done');
        var holder = subEl.closest('.task, .tcard');
        if (holder) {
          var cnt = holder.querySelector('.sub-count');
          if (cnt) {
            var st2 = subStats(pt);
            cnt.textContent = st2.done + '/' + st2.n;
            cnt.className = 'sub-count' + (st2.all ? ' full' : '');
          }
        }
      } else {
        toast(pt.done ? '子项全部完成，日程已标记完成' : '还有子项没完成，日程已退回待办');
      }
      return;
    }
    var doneBtn = e.target.closest('[data-done]');
    if (doneBtn) { e.stopPropagation(); toggleDone(doneBtn.getAttribute('data-done')); return; }
    var delBtn = e.target.closest('[data-del]');
    if (delBtn) { e.stopPropagation(); askDeleteTask(delBtn.getAttribute('data-del')); return; }
    var editBtn = e.target.closest('[data-edit]');
    if (editBtn) { e.stopPropagation(); openTaskEditor(editBtn.getAttribute('data-edit')); return; }
    var clearBtn = e.target.closest('[data-clear]');
    if (clearBtn) { clearFilter(clearBtn.getAttribute('data-clear')); return; }
    var ua = e.target.closest('[data-unarchive]');
    if (ua) { e.stopPropagation(); unarchiveList(ua.getAttribute('data-unarchive')); return; }
    var kg = e.target.closest('[data-kgroup]');
    if (kg) { S.kanbanGroup = kg.getAttribute('data-kgroup'); refreshAll(); return; }
    var lm = e.target.closest('[data-loadmore]');
    if (lm) { S.listLimit = (S.listLimit || LIST_PAGE) + LIST_PAGE; refreshAll(); return; }
    var kadd = e.target.closest('[data-kadd]');
    if (kadd) { e.stopPropagation(); openTaskEditor(null, { presetGroup: S.kanbanGroup, value: kadd.getAttribute('data-kadd') }); return; }
    var vm2 = e.target.closest('[data-vmode]');
    if (vm2) { S.vmode = vm2.getAttribute('data-vmode'); S.listLimit = LIST_PAGE; refreshAll(); return; }
    var sm2 = e.target.closest('[data-sort]');
    if (sm2) {
      var want = sm2.getAttribute('data-sort');
      S.sortMode = want;
      try { localStorage.setItem('wb_schedule_sort', want); } catch (e2) { }
      refreshAll(); return;
    }
    var empty = e.target.closest('[data-empty]');
    if (empty) { openTaskEditor(null); return; }
    var row = e.target.closest('[data-tid]');
    if (row && !e.target.closest('[data-tldrag]')) { toggleDetailFromClick(row.getAttribute('data-tid')); return; }
  });
  enableGanttDrag(root);
  enableSortDrag(root);
  enableCardDrag(root);
  enableKanbanDrag(root);
}
function clearFilter(k) {
  if (k === 'all') S.filters = { prio: [], tags: [], status: 'todo', from: '', to: '', kw: '' };
  else if (k === 'prio') S.filters.prio = [];
  else if (k === 'tags') S.filters.tags = [];
  else if (k === 'status') S.filters.status = 'todo';
  else if (k === 'from') S.filters.from = '';
  else if (k === 'to') S.filters.to = '';
  else if (k === 'kw') S.filters.kw = '';
  refreshAll();
}
function findTask(id) {
  for (var i = 0; i < S.tasks.length; i++) if (S.tasks[i].id === id) return S.tasks[i];
  return null;
}
function toggleDone(id) {
  var t = findTask(id);
  if (!t) return;
  t.done = !t.done;
  t.doneAt = t.done ? ymd(today0()) : '';
  var fields = ['已完成', '完成时间'];
  // 勾掉父任务时，把还没勾的子项一并勾上，保持「进度 100%」一致
  if (t.done && t.subs && t.subs.length && subStats(t).done < t.subs.length) {
    t.subs.forEach(function (x) { x.done = true; });
    fields.push('拆分');
  }
  cacheLocal();
  if (t.done) spawnNextRepeat(t);
  refreshAll();
  apiUpdateTask(t, fields);
}
function askDeleteTask(id) {
  var t = findTask(id);
  if (!t) return;
  confirmModal('删除任务', '确定删除「' + esc(t.title) + '」？删除后无法恢复。', '删除', function () {
    S.tasks = S.tasks.filter(function (x) { return x.id !== id; });
    cacheLocal();
    refreshAll();
    apiDeleteTask(id);
    toast('已删除');
  }, true);
}

/* ---------- 拖拽：列表排序 / 看板换列 / 日历改期 ---------- */
var _dragTipEl = null;
function showDragTip(msg) {
  if (!_dragTipEl) {
    _dragTipEl = document.createElement('div');
    _dragTipEl.className = 'drag-tip';
    document.body.appendChild(_dragTipEl);
  }
  _dragTipEl.textContent = msg;
  _dragTipEl.classList.add('in');
}
function hideDragTip() {
  if (_dragTipEl) _dragTipEl.classList.remove('in');
}
function buzz() {
  try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) { }
}
var _suppressClick = false;
var _suppressTimer = null;
function suppressNextClick() {
  _suppressClick = true;
  clearTimeout(_suppressTimer);
  _suppressTimer = setTimeout(function () { _suppressClick = false; }, 420);
}
function isSuppressed() { return _suppressClick; }

function enableSortDrag(root) {
  var st = null;
  function dropListeners() {
    document.removeEventListener('pointermove', onMove, true);
    document.removeEventListener('pointerup', onUp, true);
    document.removeEventListener('pointercancel', onUp, true);
  }
  function cleanup() {
    dropListeners();
    if (!st) return;
    if (st.timer) clearTimeout(st.timer);
    if (st.ghost && st.ghost.parentNode) st.ghost.parentNode.removeChild(st.ghost);
    if (st.line && st.line.parentNode) st.line.parentNode.removeChild(st.line);
    if (st.el) st.el.classList.remove('dragging');
    document.body.classList.remove('is-dragging');
    hideDragTip();
    st = null;
  }
  function begin() {
    if (!st || st.active) return;
    st.active = true;
    var r = st.el.getBoundingClientRect();
    var g = st.el.cloneNode(true);
    g.className = 'drag-ghost';
    g.style.width = r.width + 'px';
    g.style.height = r.height + 'px';
    g.style.left = r.left + 'px';
    g.style.top = r.top + 'px';
    g.querySelectorAll('[id]').forEach(function (n) { n.removeAttribute('id'); });
    document.body.appendChild(g);
    st.ghost = g;
    st.el.classList.add('dragging');
    document.body.classList.add('is-dragging');
    st.line = document.createElement('div');
    st.line.className = 'drag-line';
    st.listEl.insertBefore(st.line, st.el);
    buzz();
    showDragTip('拖到目标位置后松手');
  }
  function onMove(e) {
    if (!st) return;
    if (!st.active) {
      // 鼠标按住走 4px 就进入拖动，不用先长按等 250ms
      if (Math.abs(e.clientY - st.startY) > 4 || Math.abs(e.clientX - st.startX) > 4) begin();
      else return;
    }
    if (!st.active) return;
    e.preventDefault();
    st.ghost.style.top = (e.clientY - st.offsetY) + 'px';
    var kids = Array.prototype.slice.call(st.listEl.children).filter(function (x) {
      return x !== st.el && x !== st.line && x.classList && x.classList.contains('task');
    });
    var before = null;
    for (var i = 0; i < kids.length; i++) {
      var r = kids[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { before = kids[i]; break; }
    }
    if (before) st.listEl.insertBefore(st.line, before);
    else st.listEl.appendChild(st.line);
  }
  function onUp() {
    if (!st) { cleanup(); return; }
    if (!st.active) { cleanup(); return; }
    suppressNextClick();
    var listEl = st.listEl, el = st.el, line = st.line;
    if (line && line.parentNode === listEl) listEl.insertBefore(el, line);
    cleanup();
    var ids = Array.prototype.slice.call(listEl.children)
      .filter(function (x) { return x.classList && x.classList.contains('task'); })
      .map(function (x) { return x.getAttribute('data-tid'); });
    applySortOrder(ids);
  }
  root.addEventListener('pointerdown', function (e) {
    if (S.vmode !== 'list') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('button, .chk, input, textarea, select, a, .sub-row')) return;
    var el = e.target.closest('.task[data-tid]');
    if (!el) return;
    var listEl = el.parentNode;
    if (!listEl || !listEl.classList || !listEl.classList.contains('task-list')) return;
    var r = el.getBoundingClientRect();
    st = {
      el: el, listEl: listEl, startX: e.clientX, startY: e.clientY,
      offsetY: e.clientY - r.top, active: false, ghost: null, line: null, timer: null
    };
    st.timer = null;
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
  });
}
function applySortOrder(ids) {
  var changed = [];
  ids.forEach(function (id, i) {
    var t = findTask(id);
    if (t && Number(t.sort) !== i) { t.sort = i; changed.push(t); }
  });
  if (!changed.length) { refreshAll(); return; }
  S.sortMode = 'manual';
  try { localStorage.setItem('wb_schedule_sort', 'manual'); } catch (e) { }
  cacheLocal();
  refreshAll();
  toast('顺序已更新 · 已切换为手动排序');
  var qi = 0;
  function step() {
    if (qi >= changed.length) return;
    var t = changed[qi++];
    apiUpdateTask(t, ['排序']).then(step, step);
  }
  step();
}

function enableSideDrag(container, key) {
  if (!container) return;
  var dragEl = null, startY = 0, moved = false;
  function onMove(e) {
    if (!dragEl) return;
    if (!moved) {
      if (Math.abs(e.clientY - startY) < 6) return;
      moved = true;
      dragEl.classList.add('side-dragging');
      showDragTip('上下拖动调整顺序');
    }
    e.preventDefault();
    var items = Array.prototype.slice.call(container.querySelectorAll('.side-item'));
    var before = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i] === dragEl) continue;
      var r = items[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { before = items[i]; break; }
    }
    if (before) container.insertBefore(dragEl, before);
    else container.appendChild(dragEl);
  }
  function onUp() {
    document.removeEventListener('pointermove', onMove, true);
    document.removeEventListener('pointerup', onUp, true);
    document.removeEventListener('pointercancel', onUp, true);
    if (!dragEl) return;
    dragEl.classList.remove('side-dragging');
    hideDragTip();
    if (moved) {
      var names = [];
      Array.prototype.forEach.call(container.querySelectorAll('.side-item'), function (n) {
        names.push(n.getAttribute('data-drag-name'));
      });
      try { localStorage.setItem(key, JSON.stringify(names)); } catch (e) { }
      suppressNextClick();
      refreshAll();
      toast('顺序已保存');
    }
    dragEl = null; moved = false;
  }
  container.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.side-more')) return;
    var item = e.target.closest('.side-item');
    if (!item || item.parentNode !== container) return;
    dragEl = item; startY = e.clientY; moved = false;
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
  });
}

function enableKanbanDrag(root) {
  var st = null;
  var hot = null;
  function cleanup() {
    document.removeEventListener('pointermove', onMove, true);
    document.removeEventListener('pointerup', onUp, true);
    document.removeEventListener('pointercancel', onUp, true);
    if (!st) return;
    if (st.timer) clearTimeout(st.timer);
    if (st.ghost && st.ghost.parentNode) st.ghost.parentNode.removeChild(st.ghost);
    if (st.el) st.el.classList.remove('dragging');
    document.body.classList.remove('is-dragging');
    if (hot) { hot.classList.remove('dragover'); hot = null; }
    hideDragTip();
    st = null;
  }
  function begin() {
    if (!st || st.active) return;
    st.active = true;
    var r = st.el.getBoundingClientRect();
    var g = st.el.cloneNode(true);
    g.className = 'drag-ghost';
    g.style.width = r.width + 'px';
    g.style.height = r.height + 'px';
    g.style.left = r.left + 'px';
    g.style.top = r.top + 'px';
    document.body.appendChild(g);
    st.ghost = g;
    st.el.classList.add('dragging');
    document.body.classList.add('is-dragging');
    buzz();
    showDragTip('拖到目标分组后松手');
  }
  function onMove(e) {
    if (!st) return;
    if (!st.active) {
      if (Math.abs(e.clientY - st.startY) > 4 || Math.abs(e.clientX - st.startX) > 4) begin();
      else return;
    }
    if (!st.active) return;
    e.preventDefault();
    st.ghost.style.top = (e.clientY - st.offsetY) + 'px';
    st.ghost.style.left = (e.clientX - st.offsetX) + 'px';
    var under = document.elementFromPoint(e.clientX, e.clientY);
    var body = under && under.closest ? under.closest('.kcol-body') : null;
    if (body && body !== hot) {
      if (hot) hot.classList.remove('dragover');
      hot = body;
      hot.classList.add('dragover');
    }
  }
  function onUp() {
    if (!st || !st.active) { cleanup(); return; }
    suppressNextClick();
    var targetKey = null;
    if (hot) {
      var col = hot.closest('.kcol');
      if (col) targetKey = col.getAttribute('data-kkey');
    }
    var t = findTask(st.el.getAttribute('data-tid'));
    cleanup();
    if (!t || !targetKey) { refreshAll(); return; }
    var fields = applyGroupChange(t, S.kanbanGroup, targetKey);
    if (!fields) { refreshAll(); return; }
    cacheLocal();
    refreshAll();
    apiUpdateTask(t, fields);
    toast('已移至「' + kanbanKeyName(S.kanbanGroup, targetKey) + '」');
  }
  root.addEventListener('pointerdown', function (e) {
    if (S.vmode !== 'kanban') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    var el = e.target.closest('.kcard[data-tid]');
    if (!el) return;
    var r = el.getBoundingClientRect();
    st = {
      el: el, startX: e.clientX, startY: e.clientY,
      offsetY: e.clientY - r.top, offsetX: e.clientX - r.left,
      active: false, ghost: null, timer: null
    };
    st.timer = null;
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
  });
}
/* ---------- 卡片视图拖动排序 ---------- */
function enableCardDrag(root) {
  var st = null, ghost = null, target = null, after = false;
  function cleanup() {
    document.removeEventListener('pointermove', onMove, true);
    document.removeEventListener('pointerup', onUp, true);
    document.removeEventListener('pointercancel', onUp, true);
    if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
    if (st && st.el) st.el.classList.remove('dragging');
    if (target) { target.classList.remove('drop-before', 'drop-after'); target = null; }
    document.body.classList.remove('is-dragging');
    hideDragTip();
    ghost = null; st = null;
  }
  function begin() {
    if (!st || st.active) return;
    st.active = true;
    var r = st.el.getBoundingClientRect();
    ghost = st.el.cloneNode(true);
    ghost.className = 'drag-ghost';
    ghost.style.width = r.width + 'px';
    ghost.style.height = r.height + 'px';
    ghost.style.left = r.left + 'px';
    ghost.style.top = r.top + 'px';
    document.body.appendChild(ghost);
    st.el.classList.add('dragging');
    document.body.classList.add('is-dragging');
    buzz();
    showDragTip('拖到目标位置后松手');
  }
  function onMove(e) {
    if (!st) return;
    if (!st.active) {
      if (Math.abs(e.clientY - st.startY) > 4 || Math.abs(e.clientX - st.startX) > 4) begin();
      else return;
    }
    if (!st.active) return;
    e.preventDefault();
    ghost.style.top = (e.clientY - st.offsetY) + 'px';
    ghost.style.left = (e.clientX - st.offsetX) + 'px';
    var under = document.elementFromPoint(e.clientX, e.clientY);
    var card = under && under.closest ? under.closest('.tcard[data-tid]') : null;
    if (card === st.el) card = null;
    if (card !== target) {
      if (target) target.classList.remove('drop-before', 'drop-after');
      target = card;
    }
    if (target) {
      var rr = target.getBoundingClientRect();
      after = (e.clientX - rr.left) > rr.width / 2;
      target.classList.toggle('drop-after', after);
      target.classList.toggle('drop-before', !after);
    }
  }
  function onUp() {
    if (!st || !st.active) { cleanup(); return; }
    suppressNextClick();
    var grid = st.el.parentNode;
    if (target && target.parentNode === grid) {
      grid.insertBefore(st.el, after ? target.nextSibling : target);
    }
    var ids = Array.prototype.slice.call(grid.children)
      .filter(function (x) { return x.classList && x.classList.contains('tcard'); })
      .map(function (x) { return x.getAttribute('data-tid'); });
    cleanup();
    applySortOrder(ids);
  }
  root.addEventListener('pointerdown', function (e) {
    if (S.vmode !== 'card') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('button, .chk, input, textarea, select, a, .sub-row')) return;
    var el = e.target.closest('.tcard[data-tid]');
    if (!el) return;
    var listEl = el.parentNode;
    if (!listEl || !listEl.classList.contains('card-grid')) return;
    var r = el.getBoundingClientRect();
    st = { el: el, startX: e.clientX, startY: e.clientY, offsetY: e.clientY - r.top, offsetX: e.clientX - r.left, active: false };
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
  });
}

function kanbanKeyName(group, key) {
  var map = {
    priority: { 'P0': 'P0 最高', 'P1': 'P1 高', 'P2': 'P2 中', 'P3': 'P3 低', 'none': '未分级' },
    status: { 'todo': '待处理', 'doing': '今天到期', 'over': '已逾期', 'done': '已完成' },
    date: { 'over': '已逾期', 'today': '今天', 'week': '本周内', 'later': '更晚', 'none': '未安排' },
    tags: { '__none': '无标签' },
    list: {}
  };
  if (map[group] && map[group][key]) return map[group][key];
  return key;
}
function applyGroupChange(t, group, key) {
  var t0 = today0();
  // 下面几个分支会改日期，提醒基准得跟着挪
  var oldDate = t.date, oldTime = t.time;
  if (group === 'priority') {
    t.prio = (key === 'none' ? '' : key);
    return ['优先级'];
  }
  if (group === 'list') {
    t.list = key;
    return ['清单'];
  }
  if (group === 'tags') {
    if (key === '__none') t.tags = [];
    else if (t.tags.indexOf(key) === -1) t.tags = t.tags.concat([key]);
    return ['标签'];
  }
  if (group === 'status') {
    if (key === 'done') { t.done = true; t.doneAt = ymd(t0); return ['已完成', '完成时间']; }
    t.done = false;
    t.doneAt = '';
    if (key === 'over') t.date = ymd(addDays(t0, -1));
    else if (key === 'doing') t.date = ymd(t0);
    else if (key === 'todo' && (!t.date || t.date < ymd(t0))) t.date = ymd(addDays(t0, 1));
    var f1 = ['已完成', '完成时间', '日期'];
    if (syncRemindAnchor(t, oldDate, oldTime)) f1.push('提醒设置');
    return f1;
  }
  if (group === 'date') {
    if (key === 'over') t.date = ymd(addDays(t0, -1));
    else if (key === 'today') t.date = ymd(t0);
    else if (key === 'week') t.date = ymd(addDays(t0, 3));
    else if (key === 'later') t.date = ymd(addDays(t0, 14));
    else if (key === 'none') { t.date = ''; t.time = ''; }
    var f2 = ['日期', '时间'];
    if (syncRemindAnchor(t, oldDate, oldTime)) f2.push('提醒设置');
    return f2;
  }
  return null;
}
function enableCalendarDrag(root) {
  var st = null, ghost = null, lineEl = null, tipEl = null;

  function clearHover() {
    Array.prototype.forEach.call(
      root.querySelectorAll('.mcell.dragover, .md-day.dragover, .md-allday.dragover, .wcol-body.dragover'),
      function (c) { c.classList.remove('dragover'); }
    );
  }
  function cleanup() {
    document.removeEventListener('pointermove', onMove, true);
    document.removeEventListener('pointerup', onUp, true);
    document.removeEventListener('pointercancel', onUp, true);
    if (!st) return;
    if (st.el) st.el.style.opacity = '';
    if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
    if (lineEl && lineEl.parentNode) lineEl.parentNode.removeChild(lineEl);
    if (tipEl && tipEl.parentNode) tipEl.parentNode.removeChild(tipEl);
    clearHover();
    document.body.classList.remove('is-dragging');
    hideDragTip();
    ghost = null; lineEl = null; tipEl = null; st = null;
  }
  function begin(e) {
    st.active = true;
    var t = findTask(st.id);
    ghost = document.createElement('div');
    ghost.className = 'cal-ghost';
    ghost.textContent = t ? t.title : '任务';
    ghost.style.left = (e.clientX + 14) + 'px';
    ghost.style.top = (e.clientY - 16) + 'px';
    document.body.appendChild(ghost);
    document.body.classList.add('is-dragging');
    st.el.style.opacity = '.28';
    lineEl = document.createElement('div');
    lineEl.className = 'cal-drag-line';
    document.body.appendChild(lineEl);
    tipEl = document.createElement('div');
    tipEl.className = 'cal-drag-tip';
    document.body.appendChild(tipEl);
    buzz();
    showDragTip('松手放到这个时间');
  }
  function onMove(e) {
    if (!st) return;
    if (!st.active) {
      if (Math.abs(e.clientX - st.startX) > 6 || Math.abs(e.clientY - st.startY) > 6) begin(e);
      else return;
    }
    e.preventDefault();
    ghost.style.left = (e.clientX + 14) + 'px';
    ghost.style.top = (e.clientY - 16) + 'px';

    var under = document.elementFromPoint(e.clientX, e.clientY);
    if (!under || !under.closest) return;
    var dayCol = under.closest('.md-day');
    var cell = under.closest('[data-cdate]');
    clearHover();
    if (cell) cell.classList.add('dragover');

    if (dayCol) {
      var rr = dayCol.getBoundingClientRect();
      var m = Math.round(((e.clientY - rr.top) / HOUR_H * 60) / 30) * 30;
      m = Math.max(0, Math.min(23 * 60 + 30, m));
      var lineTop = rr.top + m / 60 * HOUR_H;
      lineEl.style.display = 'block';
      lineEl.style.left = rr.left + 'px';
      lineEl.style.width = rr.width + 'px';
      lineEl.style.top = lineTop + 'px';
      tipEl.style.display = 'block';
      tipEl.textContent = pad2(Math.floor(m / 60)) + ':' + pad2(m % 60);
      tipEl.style.left = (rr.left + 8) + 'px';
      tipEl.style.top = (lineTop - 24) + 'px';
    } else {
      lineEl.style.display = 'none';
      tipEl.style.display = 'none';
    }
  }
  function onUp(e) {
    if (!st || !st.active) { cleanup(); return; }
    suppressNextClick();
    var id = st.id;
    var under = document.elementFromPoint(e.clientX, e.clientY);
    var dayCol = under && under.closest ? under.closest('.md-day') : null;
    var allday = under && under.closest ? under.closest('.md-allday') : null;
    var cell = under && under.closest ? under.closest('[data-cdate]') : null;
    var targetMin = null;
    if (dayCol) {
      var rr = dayCol.getBoundingClientRect();
      var m = Math.round(((e.clientY - rr.top) / HOUR_H * 60) / 30) * 30;
      targetMin = Math.max(0, Math.min(23 * 60 + 30, m));
    }
    cleanup();
    var t = findTask(id);
    if (!t) { refreshAll(); return; }
    var changed = [];
    var oldDate = t.date, oldTime = t.time;
    if (cell) {
      var nd = cell.getAttribute('data-cdate');
      if (nd && t.date !== nd) { t.date = nd; changed.push('日期'); }
    }
    if (allday) {
      if (t.time) { t.time = ''; changed.push('时间'); }
    } else if (dayCol && targetMin !== null) {
      var nt = hmStr(targetMin);
      if (t.time !== nt) { t.time = nt; changed.push('时间'); }
    }
    // 日子或钟点变了，提醒的基准时间跟着挪，不然提醒还挂在旧的那天
    if (changed.length && syncRemindAnchor(t, oldDate, oldTime)) changed.push('提醒设置');
    if (!changed.length) { refreshAll(); toast('位置没有变化'); return; }
    cacheLocal();
    refreshAll();
    apiUpdateTask(t, changed);
    var msg = '「' + t.title + '」→ ' + dateLabel(parseYmd(t.date));
    msg += t.time ? ' ' + t.time : ' 全天';
    toast(msg);
  }
  root.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (isSuppressed()) return;
    var ev = e.target.closest('[data-tid]');
    if (!ev) return;
    var ok = ev.classList.contains('mev') || ev.classList.contains('wev') ||
      ev.classList.contains('md-ev2') || ev.classList.contains('md-adchip');
    if (!ok) return;
    st = { el: ev, id: ev.getAttribute('data-tid'), startX: e.clientX, startY: e.clientY, active: false };
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
  });
}

/* ---------- 时间线拖拽 ---------- */
function enableGanttDrag(root) {
  var wrap = root.querySelector('.gantt');
  if (!wrap) return;
  var days = parseInt((wrap.style.getPropertyValue('--gdays') || '').trim(), 10) || 7;
  var startD = parseYmd(wrap.getAttribute('data-start')) || today0();
  var st = null;

  function dayW() {
    var tr = wrap.querySelector('.g-track');
    if (!tr) return 40;
    return Math.max(12, tr.getBoundingClientRect().width / days);
  }
  function cleanup() {
    document.removeEventListener('pointermove', onMove, true);
    document.removeEventListener('pointerup', onUp, true);
    document.removeEventListener('pointercancel', onUp, true);
    document.body.classList.remove('is-dragging');
    if (st && st.bar) {
      st.bar.classList.remove('dragging');
      var m = st.bar.querySelector('.g-bar-m');
      if (m && st.meta0) m.textContent = st.meta0;
    }
    st = null;
  }
  function onMove(e) {
    if (!st) return;
    e.preventDefault();
    var dx = e.clientX - st.x0;
    if (Math.abs(dx) > 3) st.moved = true;
    var dd = Math.round(dx / dayW());
    var mEl = st.bar.querySelector('.g-bar-m');
    if (st.resize) {
      // 上限给到 90 天，不能用当前窗口天数 —— 一屏只有 1 天时会把跨度锁死在 1
      st.span = Math.max(1, Math.min(90, st.span0 + dd));
      st.bar.style.width = 'calc(' + (st.span / days * 100) + '% - 3px)';
      if (mEl) mEl.textContent = st.span + ' 天';
    } else {
      var off0 = dayDiff(startD, parseYmd(st.date0));
      // 只要求开始日落在窗口内，条本身可以比窗口长
      var maxOff = Math.max(0, days - 1);
      st.off = Math.max(0, Math.min(maxOff, off0 + dd));
      st.bar.style.left = (st.off / days * 100) + '%';
      // 拖动过程中直接显示落点日期，松手前就知道会放到哪天
      var nd = addDays(startD, st.off);
      if (mEl) mEl.textContent = (nd.getMonth() + 1) + '/' + nd.getDate() + ' 起';
    }
  }
  function onUp() {
    if (!st) { cleanup(); return; }
    var id = st.id, moved = st.moved, resize = st.resize;
    var span = st.span, off = st.off;
    cleanup();
    var t = findTask(id);
    if (!t) { refreshAll(); return; }
    if (!moved) { toggleDetailFromClick(id); return; }
    suppressNextClick();
    if (resize) {
      t.span = Math.max(1, span || 1);
      cacheLocal();
      refreshAll();
      apiUpdateTask(t, ['持续']);
      toast('持续 ' + t.span + ' 天');
    } else {
      var nd = ymd(addDays(startD, off || 0));
      if (t.date !== nd) {
        var od = t.date, ot = t.time;
        t.date = nd;
        var fields = ['日期'];
        if (syncRemindAnchor(t, od, ot)) fields.push('提醒设置');
        cacheLocal();
        refreshAll();
        apiUpdateTask(t, fields);
        toast('已移到 ' + dateLabel(parseYmd(nd)) + '（' + nd + '）');
      } else {
        refreshAll();
      }
    }
  }

  root.addEventListener('pointerdown', function (e) {
    if (S.vmode !== 'timeline') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    var bar = e.target.closest('[data-gbar]');
    if (!bar) return;
    var id = bar.getAttribute('data-gbar');
    var t = findTask(id);
    if (!t) return;
    var mEl = bar.querySelector('.g-bar-m');
    st = {
      id: id, bar: bar, t: t, resize: !!e.target.closest('[data-gresize]'),
      x0: e.clientX, date0: t.date, span0: Math.max(1, Number(t.span) || 1),
      moved: false, span: null, off: null,
      meta0: mEl ? mEl.textContent : ''
    };
    bar.classList.add('dragging');
    document.body.classList.add('is-dragging');
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
    e.preventDefault();
  });
}

function buildTaskIndex() {
  var m = {};
  S.tasks.forEach(function (t) {
    if (!t.date) return;
    (m[t.date] || (m[t.date] = [])).push(t);
  });
  Object.keys(m).forEach(function (k) { m[k] = sortTasks(m[k]); });
  _idxByDate = m;
  _idxRev = S._rev || 0;
}
// 跨天日程在某一天是否「正在进行中」（不含开始日本身）
function spanningOn(dateStr) {
  var d = parseYmd(dateStr);
  if (!d) return [];
  return S.tasks.filter(function (t) {
    if (!t.date) return false;
    var sp = taskSpan(t);
    if (sp < 2) return false;
    var from = dayDiff(parseYmd(t.date), d);
    return from > 0 && from < sp;
  });
}
function tasksOn(dateStr) {
  if (!_idxByDate || _idxRev !== (S._rev || 0)) buildTaskIndex();
  var a = _idxByDate[dateStr];
  return a ? a.slice() : [];
}
function renderCalendarView() {
  buildTaskIndex();
  var cur = S.cursor || today0();
  var title = '';
  if (S.calMode === 'year') title = cur.getFullYear() + ' 年';
  else if (S.calMode === 'month') title = cur.getFullYear() + ' 年 ' + (cur.getMonth() + 1) + ' 月';
  else if (S.calMode === 'week') {
    var ws = startOfWeek(cur), we = addDays(ws, 6);
    title = (ws.getMonth() + 1) + '月' + ws.getDate() + '日 — ' + (we.getMonth() + 1) + '月' + we.getDate() + '日';
  } else if (S.calMode === 'multiweek') {
    var ws2 = startOfWeek(cur), we2 = addDays(ws2, S.calWeeks * 7 - 1);
    title = (ws2.getMonth() + 1) + '月' + ws2.getDate() + '日 — ' + (we2.getMonth() + 1) + '月' + we2.getDate() + '日 · ' + S.calWeeks + ' 周';
  } else if (S.calMode === 'day') title = cur.getFullYear() + ' 年 ' + (cur.getMonth() + 1) + ' 月 ' + cur.getDate() + ' 日 · ' + weekdayName(cur);
  else {
    var de = addDays(cur, S.calDays - 1);
    title = (cur.getMonth() + 1) + '月' + cur.getDate() + '日 — ' + (de.getMonth() + 1) + '月' + de.getDate() + '日 · ' + S.calDays + ' 天';
  }
  var modes = [
    { k: 'year', t: '年' }, { k: 'month', t: '月' }, { k: 'week', t: '周' },
    { k: 'multiweek', t: '多周' }, { k: 'day', t: '日' }, { k: 'multiday', t: '多日' }
  ];
  var spanCtl = '';
  if (S.calMode === 'multiweek') {
    spanCtl = '<div class="cal-views">' + [2, 3, 4].map(function (n) {
      return '<button data-calweeks="' + n + '" class="' + (S.calWeeks === n ? 'on' : '') + '">' + n + ' 周</button>';
    }).join('') + '</div>';
  } else if (S.calMode === 'multiday') {
    spanCtl = '<div class="cal-views">' + [3, 5, 7].map(function (n) {
      return '<button data-caldays="' + n + '" class="' + (S.calDays === n ? 'on' : '') + '">' + n + ' 天</button>';
    }).join('') + '</div>';
  }
  var backBtn = '';
  if (S.calReturn && (S.calMode === 'day' || S.calMode === 'month')) {
    backBtn = '<button class="cal-back" data-calback>' + svgIcon('chevL') + '返回' +
      (S.calReturn.mode === 'year' ? '年' : '月') + '视图</button>';
  }
  var head = '<div class="cal-shell"><div class="cal-head">' +
    backBtn +
    '<span class="cal-title">' + esc(title) + '</span>' +
    '<div class="cal-nav"><button data-calnav="-1">' + svgIcon('chevL') + '</button>' +
    '<button data-calnav="1">' + svgIcon('chevR') + '</button></div>' +
    '<button class="cal-today-btn" data-caltoday>今天</button>' +
    '<div style="margin-left:auto;display:flex;gap:5px;align-items:center;flex-wrap:wrap;justify-content:flex-end;max-width:100%;min-width:0">' +
    '<div class="cal-legend" title="日历里日程块的底色只由优先级决定，和清单、标签无关">' +
    '<b><i style="background:var(--red)"></i>P0</b>' +
    '<b><i style="background:var(--orange)"></i>P1</b>' +
    '<b><i style="background:var(--brand)"></i>P2</b>' +
    '<b><i style="background:var(--text-3)"></i>P3</b></div>' +
    spanCtl +
    '<div class="cal-views" style="margin-left:0">' + modes.map(function (m) {
      return '<button data-calmode="' + m.k + '" class="' + (S.calMode === m.k ? 'on' : '') + '">' + m.t + '</button>';
    }).join('') + '</div></div></div>';
  var body = '';
  if (S.calMode === 'year') body = calYear(cur);
  else if (S.calMode === 'month') body = calMonth(cur);
  else if (S.calMode === 'week') body = calWeek(cur);
  else if (S.calMode === 'multiweek') body = calMultiWeek(cur);
  else if (S.calMode === 'day') body = calDay(cur);
  else body = calMultiDay(cur);
  var fill = (S.calMode === 'day' || S.calMode === 'multiday');
  var c = swapContent(head + body + '</div>', fill ? 'fill' : '');
  bindCalendarEvents(c);
  enableCalendarDrag(c);
  if (fill) setTimeout(scrollTimeGrid, 40);
}function calYear(cur) {
  var y = cur.getFullYear();
  var out = '<div class="year-grid">';
  for (var m = 0; m < 12; m++) {
    var first = new Date(y, m, 1);
    var start = startOfWeek(first);
    // 只渲染这个月真正跨到的周数，避免每月固定 6 行撑出大片空白
    var lastDay = new Date(y, m + 1, 0);
    var weeks = Math.ceil((Math.floor((lastDay - startOfWeek(first)) / 86400000) + 1) / 7);
    if (weeks < 4) weeks = 5;
    var cells = '';
    var monthCount = 0;
    for (var i = 0; i < weeks * 7; i++) {
      var d = addDays(start, i);
      var ds = ymd(d);
      var outMonth = d.getMonth() !== m;
      var has = outMonth ? [] : tasksOn(ds).filter(function (t) { return !t.done; });
      if (has.length) monthCount += has.length;
      // 上下月补位的格子不参与「今天」高亮，否则 10/26 会在 11 月格里再高亮一次
      var cls = 'yday' + (outMonth ? ' out' : '') + (!outMonth && sameDay(d, today0()) ? ' today' : '') + (has.length ? ' has' : '');
      if (has.length > 1) cls += ' multi';
      // 一天有多条时按最高优先级上色，和月/周/日视图的判断一致
      if (has.length) {
        var ranks = has.map(prioCls);
        cls += ' ' + (ranks.indexOf('p0') > -1 ? 'p0' : ranks.indexOf('p1') > -1 ? 'p1'
          : ranks.indexOf('p2') > -1 ? 'p2' : 'p3');
      }
      cells += '<div class="' + cls + '" data-cdate="' + ds + '">' +
        '<span class="ynum" data-ynum="' + ds + '" title="点这里看这一天">' + d.getDate() + '</span></div>';
    }
    out += '<div class="ymini' + (m === cur.getMonth() ? ' on' : '') + '" data-ymonth="' + m + '">' +
      '<h4>' + (m + 1) + ' 月' + (monthCount ? '<em>' + monthCount + ' 项</em>' : '') + '</h4>' +
      '<div class="yweek">' + cells + '</div></div>';
  }
  return out + '</div>';
}
function calMonth(cur) {
  var y = cur.getFullYear(), m = cur.getMonth();
  var start = startOfWeek(new Date(y, m, 1));
  var heads = ['一', '二', '三', '四', '五', '六', '日'].map(function (d) { return '<div>' + d + '</div>'; }).join('');
  var cells = '';
  for (var i = 0; i < 42; i++) {
    var d = addDays(start, i);
    var ds = ymd(d);
    var list = tasksOn(ds);
    // 跨天日程在它经过的每一天都占一格，标「第N天」，一眼看出还在进行
    var cont = spanningOn(ds).map(function (t) {
      return { t: t, dayN: dayDiff(parseYmd(t.date), d) + 1 };
    });
    var out = d.getMonth() !== m;
    var cls = 'mcell' + (out ? ' out' : '') + (sameDay(d, today0()) ? ' today' : '');
    var all2 = list.map(function (t) { return { t: t, dayN: 0 }; }).concat(cont);
    var evs = all2.slice(0, 3).map(function (it) {
      var t = it.t;
      return '<div class="mev ' + prioCls(t) + (t.done ? ' done' : '') + (it.dayN ? ' cont' : '') +
        '" data-tid="' + esc(t.id) + '">' +
        (it.dayN ? '<i class="sub-br">├</i><span class="mev-d">第' + it.dayN + '天</span>' : (t.time ? t.time + ' ' : '')) +
        esc(t.title) + '</div>';
    }).join('');
    if (all2.length > 3) evs += '<div class="mmore">+' + (all2.length - 3) + ' 项</div>';
    cells += '<div class="' + cls + '" data-cdate="' + ds + '"><div class="mnum"><span>' + d.getDate() + '</span>' +
      (sameDay(d, today0()) ? '<span class="lunar">今天</span>' : '') + '</div>' + evs + '</div>';
  }
  return '<div class="mw-head">' + heads + '</div><div class="month-grid">' + cells + '</div>';
}

var HOUR_H = 60;
// 小时行高：当天没几个日程就压扁，排满了再拉到 60px
function calcHourHeight(days) {
  // 固定行高，切天/切视图时时间轴不会忽高忽低；36px 一屏能看到全天 24 小时
  return 36;
}
var DAY_MIN = 1440;

// 某个任务在某天对应哪一段（有排期子项时）
function segOn(t, ds) {
  var d = parseYmd(ds);
  if (!t || !t.date || !d) return null;
  var off = dayDiff(parseYmd(t.date), d);
  if (off < 0) return null;
  var hit = null;
  subPlan(t).forEach(function (g) {
    if (g.days > 0 && off >= g.dayFrom && off < g.dayFrom + g.days) hit = g;
  });
  return hit;
}
// 某个任务在某天对应哪一段（有排期子项时）
function segOn(t, ds) {
  var d = parseYmd(ds);
  if (!t || !t.date || !d) return null;
  var off = dayDiff(parseYmd(t.date), d);
  if (off < 0) return null;
  var hit = null;
  subPlan(t).forEach(function (g) {
    if (g.days > 0 && off >= g.dayFrom && off < g.dayFrom + g.days) hit = g;
  });
  return hit;
}
// 某个任务在某天对应哪一段（有排期子项时）
function segOn(t, ds) {
  var d = parseYmd(ds);
  if (!t || !t.date || !d) return null;
  var off = dayDiff(parseYmd(t.date), d);
  if (off < 0) return null;
  var hit = null;
  subPlan(t).forEach(function (g) {
    if (g.days > 0 && off >= g.dayFrom && off < g.dayFrom + g.days) hit = g;
  });
  return hit;
}
// 某个任务在某天对应哪一段（有排期子项时）
function segOn(t, ds) {
  var d = parseYmd(ds);
  if (!t || !t.date || !d) return null;
  var off = dayDiff(parseYmd(t.date), d);
  if (off < 0) return null;
  var hit = null;
  subPlan(t).forEach(function (g) {
    if (g.days > 0 && off >= g.dayFrom && off < g.dayFrom + g.days) hit = g;
  });
  return hit;
}
function blocksHtml(list, ds) {
  var items = list.filter(function (t) { return !!t.time; }).map(function (t) {
    var st = parseHM(t.time) || 0;
    var dur = Number(t.estimate) > 0 ? Number(t.estimate) : 30;
    if (dur > DAY_MIN) dur = DAY_MIN;
    var top = st / 60 * HOUR_H;
    var hgt = dur / 60 * HOUR_H;
    if (hgt < 22) hgt = 22;
    if (top + hgt > DAY_MIN) { top = Math.max(0, DAY_MIN - hgt); }
    return { t: t, st: st, dur: dur, top: top, hgt: hgt, lane: 0 };
  }).sort(function (a, b) { return a.top - b.top; });

  // 按重叠簇分组：只有真正重叠的任务才分列，孤立任务占满整行
  var clusters = [], cur = [], curEnd = -1;
  items.forEach(function (it) {
    if (cur.length && it.top >= curEnd - 1) { clusters.push(cur); cur = []; curEnd = -1; }
    cur.push(it);
    if (it.top + it.hgt > curEnd) curEnd = it.top + it.hgt;
  });
  if (cur.length) clusters.push(cur);
  clusters.forEach(function (group) {
    var lanes = [];
    group.forEach(function (it) {
      var lane = 0;
      while (lanes[lane] !== undefined && lanes[lane] > it.top + 1) lane++;
      lanes[lane] = it.top + it.hgt;
      it.lane = lane;
    });
    var cnt = Math.max(1, lanes.length);
    group.forEach(function (it) { it.laneCount = cnt; });
  });

  var html = items.map(function (it) {
    var w = 100 / it.laneCount;
    var left = it.lane * w;
    var t = it.t;
    var cls = 'md-ev2 ' + prioCls(t) + (t.done ? ' done' : '') +
      (it.hgt < 34 ? ' tiny' : '') + (it.hgt < 46 ? ' short' : '');
    var endT = hmStr(it.st + it.dur);
    var box = 'left:calc(' + left.toFixed(3) + '% + 3px);width:calc(' + w.toFixed(3) + '% - 6px)';
    var stSub = subStats(t);
    var subTxt = stSub.n ? ' · ' + stSub.done + '/' + stSub.n : '';
    var timeLine = it.hgt >= 34 ? '<div class="md-ev2-t">' + esc(t.time) + ' – ' + esc(endT) + subTxt + '</div>' : '';
    var subBar = stSub.n ? '<span class="md-ev2-p"><i style="width:' + stSub.pct + '%"></i></span>' : '';
    // 这块日程当天对应的阶段（有排期子项时），块够高才显示，前面挂分支符
    var segToday = it.hgt >= 44 ? segOn(t, ds) : null;
    var segLine = segToday
      ? '<div class="md-ev2-s"><i class="md-ev2-br">' + (segToday.days > 1 ? '├' : '└') + '</i>' +
        esc(segToday.title) + '</div>'
      : '';
    return '<div class="' + cls + '" style="top:' + it.top.toFixed(1) + 'px;height:' + it.hgt.toFixed(1) + 'px;' + box + '" ' +
      'data-tid="' + esc(t.id) + '" title="' + esc(t.title) + ' · ' + esc(t.time) + '-' + esc(endT) +
      '">' +
      timeLine + '<div class="md-ev2-n">' + esc(t.title) + '</div>' + segLine + subBar + '</div>';
  }).join('');

  if (ds === ymd(today0())) {
    var now = new Date();
    var nm = now.getHours() * 60 + now.getMinutes();
    html += '<div class="md-now" style="top:' + (nm / 60 * HOUR_H).toFixed(1) + 'px"></div>';
  }
  return html;
}

function timeGridHtml(cols) {
  var n = cols.length;
  HOUR_H = calcHourHeight(cols.map(function (c) { return c.ds; }));
  var corner = '<div class="md-corner"></div>';
  var heads = cols.map(function (c) {
    var isToday = sameDay(c.d, today0());
    return '<div class="md-colhead' + (isToday ? ' today' : '') + '">' +
      '<div class="md-wd">' + weekdayName(c.d) + '</div>' +
      '<div class="md-dn">' + c.d.getDate() + '</div></div>';
  }).join('');
  // 全天行：单日无时间的放芯片，跨天的画成一条横跨的条（条带叠在落点之上）
  // 全天行：当天没写时间的日程 + 正在跨天进行的日程（后者标「第 N 天」）
  var allDayList = cols.map(function (c) {
    var own = tasksOn(c.ds).filter(function (t) { return !t.time; }).map(function (t) {
      return { t: t, dayN: 0 };
    });
    var cont = spanningOn(c.ds).map(function (t) {
      return { t: t, dayN: dayDiff(parseYmd(t.date), c.d) + 1 };
    });
    return own.concat(cont);
  });
  S._mdAllday = allDayList.some(function (l) { return l.length > 0; });
  var allDayHtml = '';
  if (S._mdAllday) {
    allDayHtml = '<div class="md-allday-lbl">全天</div>' +
      cols.map(function (c, i) {
        return '<div class="md-allday" data-cdate="' + c.ds + '">' +
          allDayList[i].map(function (x) {
            var t = x.t;
            return '<span class="md-adchip ' + prioCls(t) + (x.dayN ? ' cont' : '') +
              '" data-tid="' + esc(t.id) + '" title="' + esc(t.title) +
              (x.dayN ? ' · 第 ' + x.dayN + '/' + taskSpan(t) + ' 天' : '') + '">' +
              (x.dayN ? '<i class="sub-br">├</i><i class="ad-day">第' + x.dayN + '天</i>' : '') + esc(t.title) + '</span>';
          }).join('') + '</div>';
      }).join('');
  }
  var ticks = '';
  for (var h = 0; h < 24; h++) {
    ticks += '<div class="md-tick" style="top:' + (h * HOUR_H) + 'px">' + pad2(h) + ':00</div>';
  }
  var axis = '<div class="md-axis"><div class="md-axis-in">' + ticks + '</div></div>';
  var days = cols.map(function (c) {
    return '<div class="md-day" data-cdate="' + c.ds + '">' + blocksHtml(tasksOn(c.ds), c.ds) + '</div>';
  }).join('');
  return '<div class="md-wrap" style="--hour-h:' + HOUR_H + 'px"><div class="md-grid" data-n="' + n + '">' +
    corner + heads + allDayHtml + axis + days + '</div></div>';
}

function calDay(cur) {
  return timeGridHtml([{ d: cur, ds: ymd(cur) }]);
}
function calMultiDay(cur) {
  var days = S.calDays || 3;
  var cols = [];
  for (var i = 0; i < days; i++) {
    var d = addDays(cur, i);
    cols.push({ d: d, ds: ymd(d) });
  }
  return timeGridHtml(cols);
}
function scrollTimeGrid() {
  var w = document.querySelector('.md-wrap');
  if (!w) return;
  var now = new Date();
  var base;
  var viewingToday = false;
  if (S.calMode === 'day') viewingToday = sameDay(S.cursor || today0(), now);
  else {
    for (var i = 0; i < (S.calDays || 3); i++) {
      if (sameDay(addDays(S.cursor || today0(), i), now)) { viewingToday = true; break; }
    }
  }
  base = viewingToday ? (now.getHours() * 60 + now.getMinutes() - 90) : 7 * 60;
  if (base < 6 * 60) base = 6 * 60 - 30;
  // sticky 的列头 + 全天行（换行后高度不固定）会盖住顶部，滚动位置要补回来
  var adEl = document.querySelector('.md-allday');
  var adH = (adEl && adEl.getBoundingClientRect) ? adEl.getBoundingClientRect().height : 0;
  if (!adH) adH = S._mdAllday ? 32 : 0;
  var headH = 54 + adH;
  w.scrollTop = Math.max(0, base / 60 * HOUR_H - headH);
}
function weekColHtml(d) {
  var ds = ymd(d);
  var list = tasksOn(ds).map(function (t) { return { t: t, dayN: 0 }; })
    .concat(spanningOn(ds).map(function (t) {
      return { t: t, dayN: dayDiff(parseYmd(t.date), d) + 1 };
    }));
  var evs = list.map(function (it) {
    var t = it.t;
    return '<div class="wev ' + prioCls(t) + (t.done ? ' done' : '') + (it.dayN ? ' cont' : '') +
      '" data-tid="' + esc(t.id) + '">' +
      (it.dayN ? '<div class="wt"><i class="sub-br">├</i>第' + it.dayN + '天</div>' : (t.time ? '<div class="wt">' + esc(t.time) + '</div>' : '')) +
      esc(t.title) + '</div>';
  }).join('');
  return '<div class="wcol' + (sameDay(d, today0()) ? ' today' : '') + '">' +
    '<div class="wcol-head"><div class="wd">' + weekdayName(d) + '</div><div class="dn">' + d.getDate() + '</div></div>' +
    '<div class="wcol-body" data-cdate="' + ds + '">' + evs + '</div></div>';
}
// 周视图列高：按这一周里最忙的那天算，空的一周不占满屏
function weekColHeight(days) {
  var mx = 0;
  days.forEach(function (d) {
    var n = tasksOn(ymd(d)).length;
    if (n > mx) mx = n;
  });
  var h = 56 + mx * 34;
  return Math.max(118, Math.min(430, h));
}
function weekGrid(days, cap) {
  var h = weekColHeight(days);
  if (cap) h = Math.min(h, cap);
  var cols = '';
  for (var i = 0; i < 7; i++) cols += weekColHtml(days[i]);
  return '<div class="week-grid" style="--wcol-h:' + h + 'px">' + cols + '</div>';
}
function calWeek(cur) {
  var ws = startOfWeek(cur), days = [];
  for (var i = 0; i < 7; i++) days.push(addDays(ws, i));
  return weekGrid(days);
}
function calMultiWeek(cur) {
  var weeks = S.calWeeks || 3;
  var ws = startOfWeek(cur);
  var out = '';
  for (var w = 0; w < weeks; w++) {
    var weekStart = addDays(ws, w * 7);
    var days = [];
    for (var i = 0; i < 7; i++) days.push(addDays(weekStart, i));
    out += '<div style="margin-bottom:10px"><div class="sec-head" style="margin:0 0 6px"><h3 style="font-size:12px">' +
      (weekStart.getMonth() + 1) + '月' + weekStart.getDate() + '日 起这一周</h3><span class="line"></span></div>' +
      weekGrid(days, 300) + '</div>';
  }
  return out;
}
function bindCalendarEvents(root) {
  root.addEventListener('click', function (e) {
    if (isSuppressed()) { e.stopPropagation(); return; }
    var wk = e.target.closest('[data-calweeks]');
    if (wk) { S.calWeeks = parseInt(wk.getAttribute('data-calweeks'), 10); refreshAll(); return; }
    var dy = e.target.closest('[data-caldays]');
    if (dy) { S.calDays = parseInt(dy.getAttribute('data-caldays'), 10); refreshAll(); return; }
    var bk = e.target.closest('[data-calback]');
    if (bk) {
      S.calMode = S.calReturn.mode;
      S.cursor = S.calReturn.cursor;
      S.calReturn = null;
      refreshAll(); return;
    }
    var mode = e.target.closest('[data-calmode]');
    if (mode) { S.calMode = mode.getAttribute('data-calmode'); S.calReturn = null; refreshAll(); return; }
    var nav = e.target.closest('[data-calnav]');
    if (nav) {
      var dir = parseInt(nav.getAttribute('data-calnav'), 10);
      S.cursor = shiftCursor(S.cursor, S.calMode, dir);
      S.calReturn = null;
      refreshAll(); return;
    }
    var td = e.target.closest('[data-caltoday]');
    if (td) { S.cursor = today0(); S.calReturn = null; refreshAll(); return; }
    var ev = e.target.closest('[data-tid]');
    if (ev) { toggleDetailFromClick(ev.getAttribute('data-tid')); return; }
    // 年视图：点日期数字框 → 当天；点格子其它地方 → 那个月
    var yn = e.target.closest('[data-ynum]');
    if (yn) {
      S.calReturn = { mode: 'year', cursor: new Date(S.cursor.getFullYear(), S.cursor.getMonth(), 1) };
      S.cursor = parseYmd(yn.getAttribute('data-ynum'));
      S.calMode = 'day';
      refreshAll(); return;
    }
    var ym = e.target.closest('[data-ymonth]');
    if (ym) {
      var midx = parseInt(ym.getAttribute('data-ymonth'), 10);
      S.calReturn = { mode: 'year', cursor: new Date(S.cursor.getFullYear(), S.cursor.getMonth(), 1) };
      S.cursor = new Date(S.cursor.getFullYear(), midx, 1);
      S.calMode = 'month';
      refreshAll(); return;
    }
    var cell = e.target.closest('[data-cdate]');
    if (cell) {
      var target = parseYmd(cell.getAttribute('data-cdate'));
      if (S.calMode === 'year') {
        S.calReturn = { mode: 'year', cursor: new Date(S.cursor.getFullYear(), S.cursor.getMonth(), 1) };
        S.cursor = new Date(target.getFullYear(), target.getMonth(), 1);
        S.calMode = 'month';
      } else if (S.calMode === 'month') {
        S.calReturn = { mode: 'month', cursor: new Date(S.cursor.getFullYear(), S.cursor.getMonth(), 1) };
        S.cursor = target;
        S.calMode = 'day';
      } else {
        S.cursor = target;
        S.calMode = 'day';
      }
      refreshAll(); return;
    }
  });
}
function shiftCursor(cur, mode, dir) {
  var d = new Date(cur.getTime());
  if (mode === 'year') d.setFullYear(d.getFullYear() + dir);
  else if (mode === 'month') d.setMonth(d.getMonth() + dir);
  else if (mode === 'week') return addDays(d, dir * 7);
  else if (mode === 'multiweek') return addDays(d, dir * 21);
  else if (mode === 'day') return addDays(d, dir);
  else return addDays(d, dir * 3);
  return d;
}

/* ---------- 四象限 ---------- */
function renderQuadrantView() {
  var live = S.tasks.filter(function (t) { return !t.done; });
  var q1 = [], q2 = [], q3 = [], q4 = [];
  live.forEach(function (t) {
    if (t.important && t.urgent) q1.push(t);
    else if (t.important && !t.urgent) q2.push(t);
    else if (!t.important && t.urgent) q3.push(t);
    else q4.push(t);
  });
  var defs = [
    { cls: 'q1', num: 'Ⅰ', name: '重要且紧急', sub: '马上做，别拖', items: q1 },
    { cls: 'q2', num: 'Ⅱ', name: '重要不紧急', sub: '排进日程，决定长期', items: q2 },
    { cls: 'q3', num: 'Ⅲ', name: '紧急不重要', sub: '尽快清掉或转交', items: q3 },
    { cls: 'q4', num: 'Ⅳ', name: '不重要不紧急', sub: '有空再说，别沉迷', items: q4 }
  ];
  var total = live.length || 1;
  var html = '<div class="banner" style="background:var(--brand-softer);border:1px solid var(--line);color:var(--text-2)">' +
    svgIcon('bulb') + '<span>拖动卡片可以换象限；越靠左上越该现在处理。共 ' + live.length + ' 项待办，' +
    '其中「重要」' + (q1.length + q2.length) + ' 项、「紧急」' + (q1.length + q3.length) + ' 项。</span></div>' +
    '<div class="quad-grid">';
  defs.forEach(function (d) {
    var pct = Math.round(d.items.length / total * 100);
    html += '<div class="qbox ' + d.cls + '">' +
      '<div class="qhead">' +
      '<div class="qnum">' + d.num + '</div>' +
      '<div><h4>' + d.name + '</h4><div class="qsub">' + d.sub + '</div></div>' +
      '<div class="qcnt"><b>' + d.items.length + '</b> 项 · ' + pct + '%</div>' +
      '</div>' +
      '<div class="qbody" data-qdrop="' + d.cls + '">' +
      (d.items.length ? sortTasks(d.items).map(function (t) {
        var diff = t.date ? dayDiff(today0(), parseYmd(t.date)) : null;
        return '<div class="kcard" data-tid="' + esc(t.id) + '" draggable="true">' +
          '<div class="kcard-title">' + flagHtml(t) + esc(t.title) + '</div>' +
          subInlineHtml(t) +
          '<div class="kcard-foot">' +
          t.tags.slice(0, 2).map(function (g) { return '<span class="tag-chip ' + tagColor(g) + '">#' + esc(g) + '</span>'; }).join('') +
          (t.date ? '<span class="kcard-date ' + (diff < 0 ? 'over' : diff === 0 ? 'today' : '') + '">' + shortDate(parseYmd(t.date)) + '</span>' : '') +
          '</div></div>';
      }).join('') : '<div class="qempty">暂无任务</div>') +
      '</div></div>';
  });
  html += '</div>';
  var c = swapContent(html);
  bindQuadrantEvents(c);
}
function bindQuadrantEvents(root) {
  root.addEventListener('click', function (e) {
    var card = e.target.closest('[data-tid]');
    if (card) toggleDetailFromClick(card.getAttribute('data-tid'));
  });
  var dragId = null;
  root.addEventListener('dragstart', function (e) {
    var card = e.target.closest('[data-tid]');
    if (!card) return;
    dragId = card.getAttribute('data-tid');
    card.style.opacity = '.4';
  });
  root.addEventListener('dragend', function (e) {
    var card = e.target.closest('[data-tid]');
    if (card) card.style.opacity = '';
  });
  root.addEventListener('dragover', function (e) {
    if (e.target.closest('[data-qdrop]')) e.preventDefault();
  });
  root.addEventListener('drop', function (e) {
    var box = e.target.closest('[data-qdrop]');
    if (!box || !dragId) return;
    e.preventDefault();
    var t = findTask(dragId);
    if (!t) return;
    var q = box.getAttribute('data-qdrop');
    t.important = (q === 'q1' || q === 'q2');
    t.urgent = (q === 'q1' || q === 'q3');
    cacheLocal();
    refreshAll();
    apiUpdateTask(t, ['重要', '紧急']);
    toast('已移到「' + ({ q1: '重要且紧急', q2: '重要不紧急', q3: '紧急不重要', q4: '不重要不紧急' })[q] + '」');
    dragId = null;
  });
}

/* ---------- 习惯打卡 ---------- */
function renderHabitCal() {
  var cur = S.habitCursor || today0();
  var y = cur.getFullYear(), m = cur.getMonth();
  var start = startOfWeek(new Date(y, m, 1));
  var heads = ['一', '二', '三', '四', '五', '六', '日'].map(function (d) { return '<div>' + d + '</div>'; }).join('');
  var cells = '';
  var t0s = ymd(today0());
  for (var i = 0; i < 42; i++) {
    var d = addDays(start, i), ds = ymd(d);
    var out = d.getMonth() !== m;
    var future = ds > t0s;
    var dots = S.habits.map(function (h) {
      var on = h.log.indexOf(ds) > -1;
      return '<button class="hcal-dot' + (on ? ' on' : '') + (future ? ' future' : '') + '" ' +
        'style="--c:' + esc(h.color) + '" data-hcal="' + esc(h.id) + '|' + ds + '" ' +
        'title="' + esc(h.name) + (on ? ' · 已打卡' : ' · 点一下打卡') + '"></button>';
    }).join('');
    var cnt = S.habits.filter(function (h) { return h.log.indexOf(ds) > -1; }).length;
    cells += '<div class="hcal-cell' + (out ? ' out' : '') + (ds === t0s ? ' today' : '') + (future ? ' future' : '') + '">' +
      '<div class="hcal-dnum">' + d.getDate() + (cnt ? '<em>' + cnt + '</em>' : '') + '</div>' +
      '<div class="hcal-dots">' + dots + '</div></div>';
  }
  var legend = '';
  S.habits.forEach(function (h) {
    var total = h.log.filter(function (x) {
      var d2 = parseYmd(x);
      return d2 && d2.getFullYear() === y && d2.getMonth() === m;
    }).length;
    legend += '<span class="hcal-lg"><i style="background:' + esc(h.color) + '"></i>' + esc(h.name) +
      '<b>' + total + '</b></span>';
  });
  return '<div class="hcal-wrap">' +
    '<div class="hcal-head">' +
    '<div class="hcal-title">' + y + ' 年 ' + (m + 1) + ' 月</div>' +
    '<div class="cal-nav"><button data-hcalnav="-1">' + svgIcon('chevL') + '</button>' +
    '<button data-hcalnav="1">' + svgIcon('chevR') + '</button></div>' +
    '<button class="cal-today-btn" data-hcaltoday>本月</button>' +
    '</div>' +
    '<div class="hcal-whead">' + heads + '</div>' +
    '<div class="hcal-grid">' + cells + '</div>' +
    '<div class="hcal-legend">' + legend + '</div>' +
    '</div>';
}

function renderHabitView() {
  var t0 = today0(), t0s = ymd(t0);
  if (!S.habits.length) {
    var ce = swapContent('<div class="empty"><div class="empty-ico">' + svgIcon('repeat') + '</div>' +
      '<h4>还没有习惯</h4><p>每天重复的小事，才是改变的开始。添加第一个习惯吧。</p>' +
      '<button data-habitadd>+ 添加习惯</button></div>');
    bindHabitEvents(ce);
    return;
  }
  var doneToday = S.habits.filter(function (h) { return h.log.indexOf(t0s) > -1; }).length;
  var modeSeg = '<div class="seg" style="margin-left:auto">' +
    '<button data-habmode="cards" class="' + (S.habitMode !== 'cal' ? 'on' : '') + '">卡片</button>' +
    '<button data-habmode="cal" class="' + (S.habitMode === 'cal' ? 'on' : '') + '">日历总览</button>' +
    '</div>';
  var html = '<div class="view-bar">' +
    '<button class="btn btn-pri view-add" data-habitadd>' + svgIcon('plus') + '添加习惯</button>' +
    '<div class="view-note">今日已完成 <b>' + doneToday + ' / ' + S.habits.length + '</b>' +
    (doneToday >= S.habits.length ? ' 个，今天全部打卡完成' : ' 个 · 连续坚持的人最酷') + '</div>' +
    modeSeg +
    '</div>';
  if (S.habitMode === 'cal') {
    var hc = swapContent(html + renderHabitCal());
    bindHabitEvents(hc);
    return;
  }
  html += '<div class="habit-grid">';
  S.habits.forEach(function (h) {
    h.streak = calcStreak(h);
    var checked = h.log.indexOf(t0s) > -1;
    var weekStart = startOfWeek(t0);
    var weekHtml = '';
    var wnames = ['一', '二', '三', '四', '五', '六', '日'];
    for (var i = 0; i < 7; i++) {
      var d = addDays(weekStart, i), ds = ymd(d);
      var on = h.log.indexOf(ds) > -1;
      weekHtml += '<div class="hday"><span class="hdw">' + wnames[i] + '</span>' +
        '<div class="hd-dot' + (on ? ' on' : '') + (sameDay(d, t0) ? ' today' : '') + '" data-hday="' + esc(h.id) + '|' + ds + '">' +
        (on ? svgIcon('check') : d.getDate()) + '</div></div>';
    }
    var heat = '';
    for (var w = 17; w >= 0; w--) {
      var colStart = addDays(weekStart, -w * 7);
      var col = '';
      for (var k = 0; k < 7; k++) {
        var dd = addDays(colStart, k), dds = ymd(dd);
        var hit = h.log.indexOf(dds) > -1;
        var lv = hit ? (h.target >= 7 ? 'l3' : 'l4') : '';
        col += '<div class="hh-cell ' + lv + '" title="' + dds + (hit ? ' 已打卡' : '') + '"></div>';
      }
      heat += '<div class="hh-col">' + col + '</div>';
    }
    var weekDone = h.log.filter(function (x) {
      var d2 = parseYmd(x);
      return d2 && dayDiff(weekStart, d2) >= 0 && dayDiff(weekStart, d2) < 7;
    }).length;
    html += '<div class="hcard">' +
      '<div class="hcard-top">' +
      '<div class="hicon" style="background:' + hexSoft(h.color) + ';color:' + esc(h.color) + '">' + svgIcon(h.icon) + '</div>' +
      '<div class="hinfo"><div class="hn">' + esc(h.name) + '</div>' +
      '<div class="hs">连续 ' + h.streak + ' 天 · 本周 ' + weekDone + '/' + h.target + ' · 累计 ' + h.total + ' 次</div></div>' +
      '<button class="hbtn' + (checked ? ' on' : '') + '" data-hcheck="' + esc(h.id) + '" title="今日打卡">' + svgIcon('check') + '</button>' +
      '</div>' +
      '<div class="hweek">' + weekHtml + '</div>' +
      '<div class="hheat">' + heat + '</div>' +
      '<div style="display:flex;gap:6px"><button class="btn btn-sm btn-sec" data-hedit="' + esc(h.id) + '" style="flex:1">编辑</button>' +
      '<button class="btn btn-sm btn-sec" data-hdel="' + esc(h.id) + '" style="flex:1">删除</button></div>' +
      '</div>';
  });
  html += '</div>';
  var c = swapContent(html);
  bindHabitEvents(c);
}
function hexSoft(hex) {
  var h = String(hex || '#177CB0').replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',.12)';
}
function bindHabitEvents(root) {
  root.addEventListener('click', function (e) {
    var add = e.target.closest('[data-habitadd]');
    if (add) { openHabitEditor(null); return; }
    var hm = e.target.closest('[data-habmode]');
    if (hm) { S.habitMode = hm.getAttribute('data-habmode'); refreshAll(); return; }
    var hn = e.target.closest('[data-hcalnav]');
    if (hn) {
      var base = S.habitCursor || today0();
      S.habitCursor = new Date(base.getFullYear(), base.getMonth() + parseInt(hn.getAttribute('data-hcalnav'), 10), 1);
      refreshAll(); return;
    }
    if (e.target.closest('[data-hcaltoday]')) { S.habitCursor = today0(); refreshAll(); return; }
    var hd = e.target.closest('[data-hcal]');
    if (hd) {
      var hp = hd.getAttribute('data-hcal').split('|');
      // 未来日期只是虚线提示，真点了也不给打卡
      if (hp[1] > ymd(today0())) { toast('还没到那天'); return; }
      toggleHabit(hp[0], hp[1]);
      return;
    }
    var chk = e.target.closest('[data-hcheck]');
    if (chk) { toggleHabit(chk.getAttribute('data-hcheck'), ymd(today0())); return; }
    var day = e.target.closest('[data-hday]');
    if (day) {
      var parts = day.getAttribute('data-hday').split('|');
      if (parts[1] > ymd(today0())) { toast('还没到那天'); return; }
      toggleHabit(parts[0], parts[1]); return;
    }
    var ed = e.target.closest('[data-hedit]');
    if (ed) { openHabitEditor(ed.getAttribute('data-hedit')); return; }
    var dl = e.target.closest('[data-hdel]');
    if (dl) {
      var h = findHabit(dl.getAttribute('data-hdel'));
      if (!h) return;
      confirmModal('删除习惯', '确定删除「' + esc(h.name) + '」？所有打卡记录将一起删除。', '删除', function () {
        S.habits = S.habits.filter(function (x) { return x.id !== h.id; });
        cacheLocal(); refreshAll(); apiDeleteHabit(h.id); toast('已删除');
      }, true);
      return;
    }
  });
}
function findHabit(id) {
  for (var i = 0; i < S.habits.length; i++) if (S.habits[i].id === id) return S.habits[i];
  return null;
}
function toggleHabit(id, ds) {
  var h = findHabit(id);
  if (!h) return;
  var idx = h.log.indexOf(ds);
  if (idx > -1) h.log.splice(idx, 1);
  else h.log.push(ds);
  h.log.sort();
  h.total = h.log.length;
  h.streak = calcStreak(h);
  cacheLocal();
  refreshAll();
  apiSaveHabit(h);
  if (idx === -1 && ds === ymd(today0())) toast('打卡成功 · 连续 ' + h.streak + ' 天');
}

/* ---------- 倒数纪念日 ---------- */
/* ---------- 下一个假期（holiday.ailcc.com） ---------- */
var HOLIDAY_API = 'https://holiday.ailcc.com/api/holiday/next/';
var HOLIDAY_FALLBACK = [
  { date: '2027-01-01', name: '元旦' },
  { date: '2027-04-05', name: '清明节' },
  { date: '2027-05-01', name: '劳动节' },
  { date: '2027-10-01', name: '国庆节' },
  { date: '2028-01-01', name: '元旦' },
  { date: '2028-04-04', name: '清明节' },
  { date: '2028-05-01', name: '劳动节' },
  { date: '2028-10-01', name: '国庆节' }
];
function fallbackHoliday(today) {
  for (var i = 0; i < HOLIDAY_FALLBACK.length; i++) {
    if (HOLIDAY_FALLBACK[i].date >= today) {
      return { date: HOLIDAY_FALLBACK[i].date, name: HOLIDAY_FALLBACK[i].name, est: true, at: Date.now() };
    }
  }
  var last = HOLIDAY_FALLBACK[HOLIDAY_FALLBACK.length - 1];
  return { date: last.date, name: last.name, est: true, at: Date.now() };
}
function cleanHolidayName(n) {
  return String(n || '节假日').replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').trim() || '节假日';
}
function fetchNextHoliday(cb) {
  var today = ymd(today0());
  var CACHE_KEY = 'wb_holiday_cache_v2';
  var cache = null;
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { }
  // 缓存 2 小时：假期安排变动不频繁，但跨年公布后要能较快反映出来
  if (cache && cache.date && cache.date >= today && cache.at && (Date.now() - cache.at) < 2 * 3600 * 1000) {
    cb(cache); return;
  }

  var done = false, timer = null;
  function finish(v) {
    if (done) return;
    done = true;
    if (timer) clearTimeout(timer);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(v)); } catch (e) { }
    cb(v);
  }
  function giveUp() { finish(fallbackHoliday(today)); }

  timer = setTimeout(giveUp, 7000);

  // 1) 走 next 接口拿「下一次放假」
  function tryNext() {
    return fetch(HOLIDAY_API + today + '?type=Y', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var h = j && j.holiday;
        if (h && h.date && String(h.date) >= today) {
          finish({ date: String(h.date), name: cleanHolidayName(h.name), at: Date.now(), est: false, src: 'next' });
          return true;
        }
        return false;
      })
      .catch(function () { return false; });
  }

  // 2) next 返回 null（次年安排还没公布）时，退到整年日历里找今年/明年剩下的假期
  function fromYear(y) {
    return fetch(HOLIDAY_API.replace('/next/', '/year/') + y, { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var map = (j && j.holiday) || {};
        var keys = Object.keys(map).sort();
        for (var i = 0; i < keys.length; i++) {
          var it = map[keys[i]];
          if (it && it.holiday && it.date && String(it.date) >= today) {
            finish({ date: String(it.date), name: cleanHolidayName(it.name || it.extra_info), at: Date.now(), est: false, src: 'year' });
            return true;
          }
        }
        return false;
      })
      .catch(function () { return false; });
  }

  try {
    tryNext().then(function (hit) {
      if (hit) return;
      var y = today0().getFullYear();
      return fromYear(y).then(function (ok) {
        if (ok) return;
        return fromYear(y + 1).then(function (ok2) { if (!ok2) giveUp(); });
      });
    });
  } catch (e) { giveUp(); }
}

function ensureHolidayCountdown() {
  fetchNextHoliday(function (h) {
    var item = S.countdowns.filter(function (c) { return c.sys === 'holiday'; })[0];
    var nm = '下一个假期 · ' + h.name;
    var note = h.est ? '预估 · 官方未公布' : '官方放假安排';
    if (!item) {
      item = {
        id: '', name: nm, type: '倒数日', date: h.date, note: note,
        color: '#C3272B', group: '假期', sys: 'holiday', createdAt: ymd(today0())
      };
      S.countdowns.push(item);
      cacheLocal();
      apiSaveCountdown(item);
      if (S.view === 'countdown') refreshAll();
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
      if (S.view === 'countdown') refreshAll();
    }
  });
}

function renderCountdownView() {
  var t0 = today0();
  if (!S.countdowns.length) {
    var ce = swapContent('<div class="empty"><div class="empty-ico">' + svgIcon('heart') + '</div>' +
      '<h4>还没有纪念日</h4><p>生日、纪念日、旅行出发日… 把重要的日子放进来，不再错过。</p>' +
      '<button data-cdadd>+ 添加纪念日</button></div>');
    bindCountdownEvents(ce);
    return;
  }
  var all = S.countdowns.slice().sort(function (a, b) {
    return nextOccur(a).getTime() - nextOccur(b).getTime();
  });
  var firstCd = all[0];
  var firstDiff = firstCd ? dayDiff(t0, nextOccur(firstCd)) : 0;
  var cdNote = '共 <b>' + all.length + '</b> 个日子';
  if (firstCd) {
    cdNote += ' · 最近「' + esc(firstCd.name) + '」' +
      (firstDiff === 0 ? '就是今天' : firstDiff > 0 ? '还有 <b>' + firstDiff + '</b> 天' : '已过去 ' + Math.abs(firstDiff) + ' 天');
  }
  var map = {}, gnames = [];
  all.forEach(function (cd) {
    var g = cdGroupOf(cd);
    if (!map[g]) { map[g] = []; gnames.push(g); }
    map[g].push(cd);
  });
  gnames = orderNames(gnames, 'wb_schedule_cdgroup_order');
  var html = '<div class="view-bar">' +
    '<button class="btn btn-pri view-add" data-cdadd>' + svgIcon('plus') + '添加纪念日</button>' +
    '<div class="view-note">' + cdNote + ' · 拖动分组标题可调整顺序</div>' +
    '</div><div class="cd-grid cd-flat">';
  gnames.forEach(function (g) {
    var list = map[g].slice().sort(function (a, b) {
      return nextOccur(a).getTime() - nextOccur(b).getTime();
    });
    var soon = list[0];
    var sdiff = soon ? dayDiff(t0, nextOccur(soon)) : 0;
    html += '<div class="cdgroup" data-cdgroup="' + esc(g) + '">' +
      '<div class="cdgroup-head" data-cdgh="' + esc(g) + '">' +
      '<span class="cdg-drag">' + svgIcon('drag') + '</span>' +
      '<h3>' + esc(g) + '</h3>' +
      '<span class="cdg-cnt">' + list.length + '</span>' +
      '<span class="cdg-line"></span>' +
      (soon ? '<span class="cdg-next">' + (sdiff >= 0 ? '还有 ' + sdiff + ' 天' : '已过 ' + Math.abs(sdiff) + ' 天') + '</span>' : '') +
      '</div>';
    list.forEach(function (cd) {
      var next = nextOccur(cd);
      var diff = dayDiff(t0, next);
      var isRepeat = cd.type !== '倒数日';
      var label = diff === 0 ? '就是今天' : diff > 0 ? '还有' : '已过去';
      html += '<div class="cdcard' + (cd.sys === 'holiday' ? ' cd-holiday' : '') + '" data-cid="' + esc(cd.id || (cd.sys ? 'sys:' + cd.sys : '')) + '" style="background:linear-gradient(135deg,' + esc(cd.color) + ',' + darken(cd.color) + ')">' +
        (cd.sys === 'holiday' ? '<span class="cd-ribbon">' + ((cd.note || '').indexOf('预估') > -1 ? '预估' : 'API') + '</span>' : '') +
        '<div class="cdn">' + esc(cd.name) + '<small>' + esc(cd.type) + (isRepeat ? ' · 每年' : '') + '</small></div>' +
        '<div class="cdv"><b>' + Math.abs(diff) + '</b><span>天 · ' + label + '</span></div>' +
        '<div class="cdfoot">' + svgIcon('calendar') + next.getFullYear() + '-' + pad2(next.getMonth() + 1) + '-' + pad2(next.getDate()) +
        (cd.note ? ' · ' + esc(cd.note) : '') + '</div></div>';
    });
    html += '</div>';
  });
  html += '</div>';
  var c = swapContent(html);
  bindCountdownEvents(c);
}
function nextOccur(cd) {
  var base = parseYmd(cd.date) || today0();
  if (cd.type === '倒数日') return base;
  var t0 = today0();
  var thisYear = new Date(t0.getFullYear(), base.getMonth(), base.getDate());
  if (thisYear.getTime() >= t0.getTime()) return thisYear;
  return new Date(t0.getFullYear() + 1, base.getMonth(), base.getDate());
}
function darken(hex) {
  var h = String(hex || '#177CB0').replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  var r = Math.max(0, parseInt(h.slice(0, 2), 16) - 52);
  var g = Math.max(0, parseInt(h.slice(2, 4), 16) - 42);
  var b = Math.max(0, parseInt(h.slice(4, 6), 16) - 24);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}
function bindCountdownEvents(root) {
  root.addEventListener('click', function (e) {
    var add = e.target.closest('[data-cdadd]');
    if (add) { openCountdownEditor(null); return; }
    var card = e.target.closest('[data-cid]');
    if (card) { openCountdownEditor(card.getAttribute('data-cid')); return; }
  });
  enableCdGroupDrag(root);
}
function enableCdGroupDrag(root) {
  var el = null, startY = 0, moved = false, overEl = null;
  function groups() {
    return Array.prototype.slice.call(root.querySelectorAll('.cdgroup'));
  }
  function clearMarks() {
    groups().forEach(function (g) { g.classList.remove('drop-before', 'drop-after'); });
  }
  function onMove(e) {
    if (!el) return;
    if (!moved) {
      if (Math.abs(e.clientY - startY) < 6) return;
      moved = true;
      el.classList.add('dragging');
      showDragTip('上下拖动调整分组顺序');
    }
    e.preventDefault();
    var list = groups().filter(function (g) { return g !== el; });
    var before = null, after = null;
    for (var i = 0; i < list.length; i++) {
      var r = list[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { before = list[i]; break; }
      after = list[i];
    }
    clearMarks();
    if (before) { before.parentNode.insertBefore(el, before); before.classList.add('drop-before'); }
    else if (after) { after.parentNode.insertBefore(el, after.nextSibling); after.classList.add('drop-after'); }
    else if (list.length) { list[list.length - 1].parentNode.appendChild(el); }
  }
  function onUp() {
    document.removeEventListener('pointermove', onMove, true);
    document.removeEventListener('pointerup', onUp, true);
    document.removeEventListener('pointercancel', onUp, true);
    if (!el) return;
    el.classList.remove('dragging');
    clearMarks();
    hideDragTip();
    if (moved) {
      var order = groups().map(function (g) { return g.getAttribute('data-cdgroup'); });
      try { localStorage.setItem('wb_schedule_cdgroup_order', JSON.stringify(order)); } catch (e) { }
      suppressNextClick();
      refreshAll();
      toast('分组顺序已保存');
    }
    el = null; moved = false;
  }
  root.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    var head = e.target.closest('[data-cdgh]');
    if (!head) return;
    el = head.parentNode;
    startY = e.clientY;
    moved = false;
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
  });
}
/* ---------- 数据统计 ---------- */
function renderStatsView() {
  var t0 = today0(), t0s = ymd(t0);
  var doneAll = S.tasks.filter(function (t) { return t.done; });
  var doneToday = doneAll.filter(function (t) { return t.doneAt === t0s; }).length;
  var ws = startOfWeek(t0);
  var doneWeek = doneAll.filter(function (t) {
    var d = parseYmd(t.doneAt);
    return d && dayDiff(ws, d) >= 0 && dayDiff(ws, d) < 7;
  }).length;
  var live = S.tasks.filter(function (t) { return !t.done; }).length;
  var overdue = S.tasks.filter(function (t) { return !t.done && t.date && t.date < t0s; }).length;
  var monthAgo = addDays(t0, -29);
  var inMonth = S.tasks.filter(function (t) { return t.date && dayDiff(monthAgo, parseYmd(t.date)) >= 0 && dayDiff(monthAgo, parseYmd(t.date)) <= 29; });
  var doneMonth = inMonth.filter(function (t) { return t.done; }).length;
  var rate = inMonth.length ? Math.round(doneMonth / inMonth.length * 100) : 0;

  var weekPomos = S.pomodoros.filter(function (p) {
    var d = parseYmd(p.date);
    return p.type === '专注' && d && dayDiff(ws, d) >= 0 && dayDiff(ws, d) < 7;
  });
  var weekFocusMin = weekPomos.reduce(function (a, b) { return a + b.duration; }, 0);
  var weekPomoCount = weekPomos.length;

  var weekDays = [], maxDone = 1;
  for (var i = 6; i >= 0; i--) {
    var d = addDays(t0, -i), ds = ymd(d);
    var dn = doneAll.filter(function (t) { return t.doneAt === ds; }).length;
    var created = S.tasks.filter(function (t) { return t.date === ds; }).length;
    if (dn > maxDone) maxDone = dn;
    if (created > maxDone) maxDone = created;
    weekDays.push({ d: d, done: dn, total: created });
  }

  var bars = weekDays.map(function (w) {
    return '<div class="bar-col"><div class="bar-wrap">' +
      '<div class="bar" style="height:' + Math.max(4, w.done / maxDone * 100) + '%" title="完成 ' + w.done + '"></div>' +
      '<div class="bar alt" style="height:' + Math.max(4, w.total / maxDone * 100) + '%" title="安排 ' + w.total + '"></div>' +
      '</div><span class="bar-lbl">' + (w.d.getMonth() + 1) + '/' + w.d.getDate() + '</span></div>';
  }).join('');

  var tagMap = {};
  S.tasks.forEach(function (t) { t.tags.forEach(function (g) { tagMap[g] = (tagMap[g] || 0) + 1; }); });
  var tagKeys = Object.keys(tagMap).sort(function (a, b) { return tagMap[b] - tagMap[a]; }).slice(0, 6);
  var tagTotal = tagKeys.reduce(function (a, k) { return a + tagMap[k]; }, 0) || 1;
  var colors = ['#177CB0', '#7A4E63', '#5E8C6A', '#C8892B', '#0ea5b7', '#C3272B'];
  var ringC = 2 * Math.PI * 52;
  var offset = 0;
  var ringSegs = tagKeys.map(function (k, i) {
    var frac = tagMap[k] / tagTotal;
    var seg = '<circle cx="66" cy="66" r="52" fill="none" stroke="' + colors[i % colors.length] + '" stroke-width="17" ' +
      'stroke-dasharray="' + (frac * ringC) + ' ' + ringC + '" stroke-dashoffset="' + (-offset * ringC) + '"/>';
    offset += frac;
    return seg;
  }).join('');
  var legend = tagKeys.length ? tagKeys.map(function (k, i) {
    return '<div class="dl"><i style="background:' + colors[i % colors.length] + '"></i>' +
      '<span class="dn2">#' + esc(k) + '</span><span class="dv2">' + tagMap[k] + '</span></div>';
  }).join('') : '<div style="font-size:12px;color:var(--text-3)">还没有给任务打标签</div>';

  var heat = '';
  var heatStart = addDays(startOfWeek(t0), -17 * 7);
  for (var w2 = 0; w2 < 18; w2++) {
    var col = '';
    for (var k2 = 0; k2 < 7; k2++) {
      var dd = addDays(heatStart, w2 * 7 + k2), dds = ymd(dd);
      var n = doneAll.filter(function (t) { return t.doneAt === dds; }).length;
      var lv = n === 0 ? '' : n <= 1 ? 'l1' : n <= 2 ? 'l2' : n <= 4 ? 'l3' : 'l4';
      col += '<div class="heat-cell ' + lv + '" title="' + dds + ' 完成 ' + n + ' 项"></div>';
    }
    heat += '<div class="heat-col">' + col + '</div>';
  }

  var habitBars = S.habits.map(function (h) {
    var st = calcStreak(h);
    var last30 = 0;
    for (var q = 0; q < 30; q++) if (h.log.indexOf(ymd(addDays(t0, -q))) > -1) last30++;
    return '<div class="pomo-item"><span class="pi-dot" style="background:' + esc(h.color) + '"></span>' +
      '<span class="pi-t">' + esc(h.name) + '</span>' +
      '<span class="pi-m">30 天 ' + last30 + ' 次 · 连续 ' + st + ' 天</span></div>';
  }).join('') || '<div style="font-size:12px;color:var(--text-3)">还没有习惯</div>';

  swapContent(
    '<div class="stat-cards">' +
    '<div class="scard"><div class="sl">' + svgIcon('inbox') + '待办任务</div>' +
    '<div class="sv"><b data-sp-bindable="database" data-sp-database-id="RBTQ4jwngkyjWiZE7VqCJZ">' + live + '</b><small>项</small></div>' +
    '<div class="sd">其中逾期 <b style="color:var(--red)" data-sp-bindable="database" data-sp-database-id="RBTQ4jwngkyjWiZE7VqCJZ">' + overdue + '</b> 项</div></div>' +
    '<div class="scard"><div class="sl">' + svgIcon('check') + '今日完成</div>' +
    '<div class="sv"><b data-sp-bindable="database" data-sp-database-id="RBTQ4jwngkyjWiZE7VqCJZ">' + doneToday + '</b><small>项</small></div>' +
    '<div class="sd">本周累计 <b data-sp-bindable="database" data-sp-database-id="RBTQ4jwngkyjWiZE7VqCJZ">' + doneWeek + '</b> 项</div></div>' +
    '<div class="scard"><div class="sl">' + svgIcon('trend') + '近 30 天完成率</div>' +
    '<div class="sv"><b data-sp-bindable="database" data-sp-database-id="RBTQ4jwngkyjWiZE7VqCJZ">' + rate + '</b><small>%</small></div>' +
    '<div class="sd">完成 ' + doneMonth + ' / ' + inMonth.length + ' 项</div></div>' +
    '<div class="scard"><div class="sl">' + svgIcon('clock') + '本周专注</div>' +
    '<div class="sv"><b data-sp-bindable="database" data-sp-database-id="6ny2WVjivlBujxY3ICpYGT">' + Math.round(weekFocusMin / 60) + '</b><small>小时</small></div>' +
    '<div class="sd"><b data-sp-bindable="database" data-sp-database-id="6ny2WVjivlBujxY3ICpYGT">' + weekPomoCount + '</b> 个番茄 · ' + weekFocusMin + ' 分钟</div></div>' +
    '</div>' +

    '<div class="chart-grid">' +
    '<div class="chart-card"><h4>近 7 天任务趋势</h4><div class="csub">实心为已完成，浅色为当天安排的任务数</div>' +
    '<div class="bar-chart">' + bars + '</div>' +
    '<div class="legend"><span><i style="background:var(--brand)"></i>已完成</span><span><i style="background:var(--heat-1)"></i>安排</span></div></div>' +
    '<div class="chart-card"><h4>任务标签分布</h4><div class="csub">看看你的时间都花在哪类事上 · 多标签任务会重复计数</div>' +
    '<div class="donut-wrap"><div class="donut"><svg width="132" height="132" viewBox="0 0 132 132">' +
    '<circle cx="66" cy="66" r="52" fill="none" stroke="#eef2f8" stroke-width="17"/>' + ringSegs + '</svg>' +
    '<div class="donut-center"><b data-sp-bindable="database" data-sp-database-id="RBTQ4jwngkyjWiZE7VqCJZ">' + S.tasks.length + '</b><span>总任务</span></div></div>' +
    '<div class="donut-legend">' + legend + '</div></div></div>' +
    '</div>' +

    '<div class="chart-grid">' +
    '<div class="chart-card"><h4>完成热力图</h4><div class="csub">近 18 周 · 每格一天，颜色越深完成越多</div>' +
    '<div class="heat-wrap"><div class="heat">' + heat + '</div></div>' +
    '<div class="legend"><span>少</span><span><i style="background:var(--line-2)"></i>' +
      [1, 2, 3, 4].map(function (i) { return '<i style="background:var(--heat-' + i + ');margin-left:3px"></i>'; }).join('') +
      '</span><span>多</span></div></div>' +
    '<div class="chart-card"><h4>习惯坚持情况</h4><div class="csub">连续天数与近 30 天打卡次数</div>' +
    '<div class="pomo-list">' + habitBars + '</div></div>' +
    '</div>');
}

/* ---------- 番茄专注 ---------- */
var FOCUS_MODES = {
  focus: { name: '专注', min: 25, color: '#177CB0' },
  short: { name: '短休息', min: 5, color: '#5E8C6A' },
  long: { name: '长休息', min: 15, color: '#7A4E63' }
};
function renderFocusView() {
  var T = S.timer;
  var mode = FOCUS_MODES[T.mode] || FOCUS_MODES.focus;
  var totalSec = T.total || mode.min * 60;
  var leftSec = T.left;
  var frac = totalSec > 0 ? leftSec / totalSec : 0;
  var r = 92, circ = 2 * Math.PI * r;
  var t0s = ymd(today0());
  var todayPomos = S.pomodoros.filter(function (p) { return p.date === t0s && p.type === '专注'; });
  var todayMin = todayPomos.reduce(function (a, b) { return a + b.duration; }, 0);
  var ws = startOfWeek(today0());
  var weekMin = S.pomodoros.filter(function (p) {
    var d = parseYmd(p.date);
    return p.type === '专注' && d && dayDiff(ws, d) >= 0 && dayDiff(ws, d) < 7;
  }).reduce(function (a, b) { return a + b.duration; }, 0);
  var recent = S.pomodoros.filter(function (p) { return p.type === '专注'; }).slice(-6).reverse();
  var recentHtml = recent.length ? recent.map(function (p) {
    return '<div class="pomo-item"><span class="pi-dot"></span><span class="pi-t">' + esc(p.task || '未命名专注') +
      (p.sub ? ' · ' + esc(p.sub) : '') + '</span>' +
      '<span class="pi-m">' + esc(p.date || '') + ' · ' + p.duration + ' 分' +
      (p.pauseCount ? ' · 暂停' + p.pauseCount : '') + '</span></div>';
  }).join('') : '<div style="font-size:12px;color:var(--text-3)">今天还没开始专注，先来一个 25 分钟吧</div>';

  var taskOpts = S.tasks.filter(function (t) { return !t.done; }).slice(0, 40);
  var selHtml = '<option value="">不关联任务</option>' + taskOpts.map(function (t) {
    return '<option value="' + esc(t.id) + '"' + (T.taskId === t.id ? ' selected' : '') + '>' + esc(t.title) + '</option>';
  }).join('');

  var curTask = T.taskId ? findTask(T.taskId) : null;
  var subSel = '';
  if (curTask && curTask.subs && curTask.subs.length) {
    subSel = '<select class="focus-task" id="focusSubSel"><option value="">不指定子项（整条日程）</option>' +
      curTask.subs.map(function (x, i) {
        return '<option value="' + i + '"' + (String(T.subIndex) === String(i) ? ' selected' : '') + '>' +
          (x.done ? '✓ ' : '') + esc(x.title) + '</option>';
      }).join('') + '</select>';
  }
  var pauseInfo = '';
  if (T.mode === 'focus' && (T.pauseCount || T.pauseSec)) {
    pauseInfo = '<div class="focus-pause">' + svgIcon('clock') + '已暂停 ' + (T.pauseCount || 0) + ' 次 · 合计 ' +
      Math.round((T.pauseSec || 0) / 60) + ' 分' + (T.pauseStart ? '（暂停中）' : '') + '</div>';
  }
  var c = swapContent('<div class="focus-wrap">' +    '<div class="focus-card">' +
    '<div class="focus-modes">' +
    Object.keys(FOCUS_MODES).map(function (k) {
      return '<button data-fmode="' + k + '" class="' + (T.mode === k ? 'on' : '') + '">' + FOCUS_MODES[k].name + ' ' + FOCUS_MODES[k].min + "'" + '</button>';
    }).join('') + '</div>' +
    '<div class="focus-ring"><svg width="216" height="216" viewBox="0 0 216 216">' +
    '<circle class="fr-bg" cx="108" cy="108" r="' + r + '"/>' +
    '<circle class="fr-fg" cx="108" cy="108" r="' + r + '" stroke="' + mode.color + '" ' +
    'stroke-dasharray="' + circ + '" stroke-dashoffset="' + (circ * (1 - frac)) + '"/></svg>' +
    '<div class="focus-time-wrap"><div class="focus-time">' + pad2(Math.floor(leftSec / 60)) + ':' + pad2(leftSec % 60) + '</div>' +
    '<div class="focus-state">' + (T.running ? mode.name + '中 · 第 ' + T.round + ' 轮' : (leftSec === totalSec ? '准备开始' : '已暂停')) + '</div></div></div>' +
    '<select class="focus-task" id="focusTaskSel">' + selHtml + '</select>' +
    subSel + pauseInfo +
    '<div class="focus-ctrl">' +
    '<button class="fbtn fbtn-main" data-ftoggle>' + svgIcon(T.running ? 'pause' : 'play') + (T.running ? '暂停' : (leftSec === totalSec ? '开始专注' : '继续')) + '</button>' +
    '<button class="fbtn fbtn-ghost" data-freset title="重置">' + svgIcon('reset') + '</button>' +
    '<button class="fbtn fbtn-ghost" data-fskip title="跳过本轮">跳过</button>' +
    '</div>' +
    '<div style="font-size:11.5px;color:var(--text-3);text-align:center;line-height:1.7;max-width:330px">' +
    '一个番茄 = 25 分钟专注 + 5 分钟休息。<br>完成 4 轮后休息 15 分钟，效率比时长更重要。</div>' +
    '</div>' +
    '<div class="focus-side">' +
    '<div class="fside-card"><h4>' + svgIcon('target') + '今日专注</h4>' +
    '<div class="pomo-stat">' +
    '<div><b data-sp-bindable="database" data-sp-database-id="6ny2WVjivlBujxY3ICpYGT">' + todayPomos.length + '</b><span>番茄数</span></div>' +
    '<div><b data-sp-bindable="database" data-sp-database-id="6ny2WVjivlBujxY3ICpYGT">' + todayMin + '</b><span>分钟</span></div>' +
    '<div><b data-sp-bindable="database" data-sp-database-id="6ny2WVjivlBujxY3ICpYGT">' + Math.round(weekMin / 60) + '</b><span>本周小时</span></div>' +
    '</div>' +
    (todayPomos.some(function (p) { return p.pauseCount; })
      ? '<div class="pomo-pause">今日暂停 ' + todayPomos.reduce(function (a, b) { return a + (b.pauseCount || 0); }, 0) +
        ' 次 · ' + Math.round(todayPomos.reduce(function (a, b) { return a + (b.pauseSec || 0); }, 0) / 60) + ' 分钟</div>'
      : '') +
    '</div>' +
    '<div class="fside-card"><h4>' + svgIcon('clock') + '最近专注</h4><div class="pomo-list">' + recentHtml + '</div></div>' +
    '<div class="fside-card"><h4>' + svgIcon('bulb') + '专注小贴士</h4>' +
    '<div style="font-size:12px;color:var(--text-2);line-height:1.8">' +
    '· 开始前先选一个具体任务，避免「假专注」<br>' +
    '· 25 分钟内被打断，记下来等休息时再处理<br>' +
    '· 休息时真的离开屏幕，喝水或走动</div></div>' +
    '</div></div>');
  bindFocusEvents(c);
}
function bindFocusEvents(root) {
  root.addEventListener('click', function (e) {
    var m = e.target.closest('[data-fmode]');
    if (m) { setFocusMode(m.getAttribute('data-fmode')); return; }
    if (e.target.closest('[data-ftoggle]')) { toggleFocus(); return; }
    if (e.target.closest('[data-freset]')) { resetFocus(); return; }
    if (e.target.closest('[data-fskip]')) { finishFocus(true); return; }
  });
  var sel = root.querySelector('#focusTaskSel');
  if (sel) sel.addEventListener('change', function () {
    S.timer.taskId = sel.value;
    var t = findTask(sel.value);
    S.timer.taskTitle = t ? t.title : '';
    S.timer.subIndex = '';
    S.timer.subTitle = '';
    refreshAll();
  });
  var ssel = root.querySelector('#focusSubSel');
  if (ssel) ssel.addEventListener('change', function () {
    S.timer.subIndex = ssel.value;
    var t2 = findTask(S.timer.taskId);
    var idx = parseInt(ssel.value, 10);
    S.timer.subTitle = (t2 && t2.subs && t2.subs[idx]) ? t2.subs[idx].title : '';
  });
}
function setFocusMode(mode) {
  var m = FOCUS_MODES[mode];
  stopTick();
  S.timer.mode = mode;
  S.timer.total = m.min * 60;
  S.timer.left = m.min * 60;
  S.timer.running = false;
  refreshAll();
}
function toggleFocus() {
  var T = S.timer;
  if (T.running) {
    T.running = false;
    stopTick();
    // 只有专注阶段记录暂停；休息不计
    if (T.mode === 'focus' && T.left > 0) {
      T.pauseCount = (T.pauseCount || 0) + 1;
      T.pauseStart = Date.now();
    }
    refreshAll();
  } else {
    if (T.pauseStart) {
      T.pauseSec = (T.pauseSec || 0) + Math.max(0, Math.round((Date.now() - T.pauseStart) / 1000));
      T.pauseStart = 0;
    }
    T.running = true;
    startTick();
    refreshAll();
  }
}
function resetFocus() {
  stopTick();
  S.timer.running = false;
  S.timer.left = S.timer.total;
  S.timer.pauseCount = 0;
  S.timer.pauseSec = 0;
  S.timer.pauseStart = 0;
  refreshAll();
}
function startTick() {
  stopTick();
  S.tick = setInterval(function () {
    if (!S.timer.running) return;
    S.timer.left--;
    if (S.timer.left <= 0) { finishFocus(false); return; }
    var el = document.querySelector('.focus-time');
    if (el) el.textContent = pad2(Math.floor(S.timer.left / 60)) + ':' + pad2(S.timer.left % 60);
    var ring = document.querySelector('.fr-fg');
    if (ring) {
      var r = 92, circ = 2 * Math.PI * r;
      ring.setAttribute('stroke-dashoffset', circ * (1 - S.timer.left / S.timer.total));
    }
  }, 1000);
}
function stopTick() { if (S.tick) { clearInterval(S.tick); S.tick = null; } }
function finishFocus(skipped) {
  stopTick();
  var T = S.timer;
  var used = Math.round((T.total - T.left) / 60);
  T.running = false;
  if (T.mode === 'focus' && T.pauseStart) {
    T.pauseSec = (T.pauseSec || 0) + Math.max(0, Math.round((Date.now() - T.pauseStart) / 1000));
    T.pauseStart = 0;
  }
  if (T.mode === 'focus' && (used >= 1 || !skipped)) {
    var ft = findTask(T.taskId);
    var p = {
      id: '', task: T.taskTitle || (ft ? ft.title : '') || '专注',
      type: '专注', duration: Math.max(1, used), start: ymd(today0()), date: ymd(today0()),
      sub: T.subTitle || '', pauseCount: T.pauseCount || 0, pauseSec: T.pauseSec || 0
    };
    S.pomodoros.push(p);
    apiAddPomo(p);
    var msg = '完成一个 ' + Math.max(1, used) + ' 分钟番茄';
    if (T.pauseCount) msg += ' · 暂停 ' + T.pauseCount + ' 次';
    toast(msg);
    T.round = T.round >= 4 ? 1 : T.round + 1;
    T.pauseCount = 0;
    T.pauseSec = 0;
  } else if (!skipped) {
    toast('休息结束，继续加油');
  }
  T.left = T.total;
  cacheLocal();
  refreshAll();
}
/* ---------- 任务详情（只读） ---------- */
function markActiveTask(id) {
  Array.prototype.forEach.call(
    document.querySelectorAll('.task.active, .tcard.active, .kcard.active'),
    function (n) { n.classList.remove('active'); }
  );
  if (!id) return;
  Array.prototype.forEach.call(
    document.querySelectorAll('[data-tid="' + id + '"]'),
    function (n) {
      if (n.classList && (n.classList.contains('task') || n.classList.contains('tcard') || n.classList.contains('kcard'))) {
        n.classList.add('active');
      }
    }
  );
}
// 点已经打开的那条日程 → 收起面板；点别的 → 换成那一条
function toggleDetailFromClick(id) {
  var wrap = document.querySelector('#modalRoot .modal-mask.panel');
  if (wrap && wrap.getAttribute('data-task') === id) {
    closeModal();
    return;
  }
  openTaskDetail(id);
}
function openTaskDetail(id) {
  var t = findTask(id);
  if (!t) { toast('这条任务已被删除'); return; }
  var t0 = today0();
  var d = t.date ? parseYmd(t.date) : null;
  var diff = d ? dayDiff(t0, d) : null;
  var rows = [];

  if (d) {
    var dTxt = (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 ' + weekdayName(d);
    var dCls = 'dt-v';
    if (!t.done && diff < 0) { dTxt += ' · 逾期 ' + Math.abs(diff) + ' 天'; dCls += ' warn'; }
    else if (diff === 0) { dTxt += ' · 今天'; dCls += ' brand'; }
    else if (diff === 1) { dTxt += ' · 明天'; }
    else if (diff > 1) { dTxt += ' · 还有 ' + diff + ' 天'; }
    rows.push(rowHtml('calendar', '日期', dTxt, dCls));
  } else {
    rows.push(rowHtml('inbox', '日期', '未安排时间', 'dt-v muted'));
  }

  if (t.time) {
    var endMin = (parseHM(t.time) || 0) + (t.estimate || 0);
    var range = t.time + (t.estimate ? ' — ' + hmStr(endMin) : '');
    rows.push(rowHtml('clock', '时间', range, 'dt-v'));
  }

  // 跨天日程：把「第几天 / 结束日 / 阶段数」讲清楚，不然详情里只看到一个开始日
  var sp = taskSpan(t);
  if (sp > 1 && d) {
    var endD = addDays(d, sp - 1);
    var segN = (t.subs || []).filter(function (x) { return Number(x.days) > 0; }).length;
    rows.push(rowHtml('repeat', '跨度',
      sp + ' 天 · ' + (d.getMonth() + 1) + '/' + d.getDate() + ' – ' + (endD.getMonth() + 1) + '/' + endD.getDate() +
      (segN ? ' · ' + segN + ' 个阶段' : ''), 'dt-v brand'));
  }
  if (t.estimate) rows.push(rowHtml('target', '预计', durText(t.estimate), 'dt-v'));
  if (repeatLabel(t)) rows.push(rowHtml('repeat', '重复', repeatLabel(t) + ' · 完成后自动排下一次', 'dt-v brand'));
  if (t.list && t.list !== '收集箱') rows.push(rowHtml('inbox', '清单', esc(t.list), 'dt-v'));
  if (t.prio) {
    rows.push('<div class="dt-row"><span class="dt-k">优先级</span><span class="dt-v">' +
      '<span class="tag-chip ' + (t.prio === 'P0' ? 'c3' : t.prio === 'P1' ? 'c4' : 'c0') + '">' +
      String(t.prio).toUpperCase() + ' · ' + (PRIO_LABEL[String(t.prio).toUpperCase()] || '无') + '</span></span></div>');
  }
  if (t.tags.length) {
    rows.push('<div class="dt-row"><span class="dt-k">标签</span><span class="dt-v">' +
      t.tags.map(function (g) { return '<span class="tag-chip ' + tagColor(g) + '">#' + esc(g) + '</span>'; }).join('') +
      '</span></div>');
  }
  rows.push('<div class="dt-row"><span class="dt-k">四象限</span><span class="dt-v">' +
    '<span class="tag-chip ' + (t.important && t.urgent ? 'c3' : t.important ? 'c4' : t.urgent ? 'c0' : '') + '">' +
    quadText(t) + '</span></span></div>');
  if (t.done && t.doneAt) {
    rows.push(rowHtml('check', '完成于', t.doneAt, 'dt-v brand'));
  }

  var remindHtml = '';
  if (t.remindCfg && t.remindCfg.anchor && (t.remindCfg.offsets || []).length) {
    var anchor = parseAnchor(t.remindCfg.anchor);
    var offs = t.remindCfg.offsets;
    var read = t.remindCfg.read || [];
    var label = t.remindMode === '艾宾浩斯' ? '艾宾浩斯复习计划' : '单次提醒';
    var nodes = offs.map(function (off, i) {
      var at = anchor.getTime() + off * 60000;
      var isPast = at < Date.now();
      var isRead = read.indexOf(i) > -1;
      var cls = isRead ? 'past' : (isPast ? 'now' : 'future');
      var ad = new Date(at);
      var txt = (ad.getMonth() + 1) + '/' + ad.getDate() + ' ' + pad2(ad.getHours()) + ':' + pad2(ad.getMinutes());
      var st = isRead ? '已确认' : (isPast ? '待复习' : '待触发');
      return '<div class="eb-node ' + cls + '"><span class="eb-dot"></span>' +
        '<span class="eb-l">' + ebStageName(off) + '</span>' +
        '<span class="eb-t">' + txt + '</span>' +
        '<span class="eb-s">' + st + '</span></div>';
    }).join('');
    remindHtml = '<div class="dt-sec"><label>' + svgIcon('bell') + ' ' + label +
      '<span>' + offs.length + ' 个节点 · 起点 ' + toDtLocal(t.remindCfg.anchor).replace('T', ' ') + '</span></label>' +
      '<div class="eb-track">' + nodes + '</div></div>';
  } else {
    remindHtml = '<div class="dt-sec"><label>' + svgIcon('bell') + ' 提醒</label>' +
      '<div class="dt-note" style="color:var(--text-3)">未设置提醒。点「修改」可以加单次提醒或艾宾浩斯复习计划。</div></div>';
  }

  var html = '<div class="modal wide">' +
    '<div class="m-head"><h3>任务详情</h3><button class="m-close">' + svgIcon('close') + '</button></div>' +
    '<div class="m-body">' +
    '<div class="dt-head"><button class="dt-chk' + (t.done ? ' on' : '') + '" id="dtChk" title="标记完成">' + svgIcon('check') + '</button>' +
    '<h2 class="dt-title' + (t.done ? ' done' : '') + '">' + esc(t.title) + '</h2></div>' +
    '<div class="dt-meta">' + rows.join('') + '</div>' +
    '<div id="dtSubs">' + subSectionHtml(t) + '</div>' +
    remindHtml +
    (t.note ? '<div class="dt-sec"><label>' + svgIcon('edit') + ' 备注</label><div class="dt-note">' + esc(t.note) + '</div></div>' : '') +
    '</div>' +
    '<div class="m-foot">' +
    '<button class="btn btn-danger btn-sm" id="dtDel">' + svgIcon('trash') + '删除</button>' +
    '<div class="spacer"></div>' +
    '<button class="btn btn-sec" id="dtToggle">' + (t.done ? '标记未完成' : '标记完成') + '</button>' +
    '<button class="btn btn-pri" id="dtEdit">' + svgIcon('edit') + '修改</button>' +
    '</div></div>';

  openModal(html, {
    reuse: true,
    onMount: function (root) {
      function refreshSubs() {
        var box = root.querySelector('#dtSubs');
        if (box) box.innerHTML = subSectionHtml(t);
        var chk = root.querySelector('#dtChk');
        if (chk) chk.className = 'dt-chk' + (t.done ? ' on' : '');
        var ti = root.querySelector('.dt-title');
        if (ti) ti.className = 'dt-title' + (t.done ? ' done' : '');
        var tg = root.querySelector('#dtToggle');
        if (tg) tg.textContent = t.done ? '标记未完成' : '标记完成';
      }
      var subBox = root.querySelector('#dtSubs');
      if (subBox) subBox.addEventListener('click', function (e) {
        var b = e.target.closest('[data-subtoggle]');
        if (!b) return;
        var idx = parseInt(b.getAttribute('data-subtoggle'), 10);
        var flipped = toggleSub(t, idx);
        refreshSubs();
        if (flipped) toast(t.done ? '子项全部完成，日程已标记完成' : '还有子项没完成，日程已退回待办');
      });
      root.querySelector('#dtChk').addEventListener('click', function () {
        toggleDone(t.id);
        openTaskDetail(t.id);
      });
      root.querySelector('#dtToggle').addEventListener('click', function () {
        toggleDone(t.id);
        openTaskDetail(t.id);
      });
      root.querySelector('#dtEdit').addEventListener('click', function () {
        // 直接换内容：面板模式下关闭再打开会让右侧一收一放
        openTaskEditor(t.id, { fromDetail: true });
      });
      root.querySelector('#dtDel').addEventListener('click', function () {
        confirmModal('删除任务', '确定删除「' + esc(t.title) + '」？删除后无法恢复。', '删除', function () {
          S.tasks = S.tasks.filter(function (x) { return x.id !== t.id; });
          cacheLocal();
          refreshAll();
          apiDeleteTask(t.id);
          toast('已删除');
        }, true);
      });
    }
  });
  var _wrap = document.querySelector('#modalRoot .modal-mask');
  if (_wrap) _wrap.setAttribute('data-task', id);
  S.detailId = id;
  markActiveTask(id);
  keepTimelineBlockVisible(id);
}
function rowHtml(icon, k, v, cls) {
  return '<div class="dt-row">' + svgIcon(icon, 'dt-ico') + '<span class="dt-k">' + esc(k) + '</span>' +
    '<span class="' + (cls || 'dt-v') + '">' + v + '</span></div>';
}
// 打开详情后把时间线上对应的那一行标出来，并滚到视口内
function keepTimelineBlockVisible(id) {
  var wrap = document.querySelector('.gantt');
  if (!wrap) return;
  setTimeout(function () {
    var row = wrap.querySelector('.g-row[data-gid="' + id + '"]');
    if (!row) return;
    if (row.scrollIntoView) { try { row.scrollIntoView({ block: 'nearest' }); } catch (e) { } }
  }, 320);
}
function quadText(t) {
  if (t.important && t.urgent) return '重要且紧急';
  if (t.important) return '重要不紧急';
  if (t.urgent) return '紧急不重要';
  return '不重要不紧急';
}

/* ---------- 任务编辑器 ---------- */
var SUB_TPLS = [
  { k: 'homework', t: '作业分科', items: [['语文作业', 30], ['数学作业', 40], ['英语作业', 30], ['其他科目', 20]] },
  { k: 'fitness', t: '健身分部', items: [['热身', 10], ['力量训练', 30], ['有氧', 20], ['拉伸放松', 10]] },
  { k: 'study', t: '学习分段', items: [['预习', 15], ['精读', 40], ['做题', 40], ['复盘整理', 15]] },
  { k: 'chores', t: '家务分工', items: [['整理房间', 20], ['洗衣', 15], ['做饭', 40], ['洗碗', 15]] }
];
function openTaskEditor(id, preset) {
  var t = id ? findTask(id) : null;
  var isNew = !t;
  var fromDetail = !!(preset && preset.fromDetail);
  if (isNew) {
    t = {
      id: '', title: '', note: '', list: '收集箱', tags: [], prio: '',
      important: false, urgent: false, done: false, remindMode: '不提醒', remindCfg: null,
      date: ymd(today0()), time: '', estimate: 0, doneAt: '', subs: [], sort: Math.floor(Date.now() / 1000) % 1000000, createdAt: ymd(today0())
    };
    if (S.selectedList) t.list = S.selectedList;
    if (preset && preset.presetGroup === 'list' && preset.value) t.list = preset.value;
    if (preset && preset.presetGroup === 'priority' && preset.value !== 'none') t.prio = preset.value;
    if (preset && preset.presetGroup === 'tags' && preset.value) t.tags = [preset.value];
    if (preset && preset.value === 'today') t.date = ymd(today0());
  }
  var tags = t.tags.slice();
  var allTagList = allTags();
  var listNames = allLists();
  var ebOffsets = (t.remindCfg && t.remindCfg.offsets) ? t.remindCfg.offsets.slice() : EB_OFFSETS.slice();
  var anchorVal = (t.remindCfg && t.remindCfg.anchor) ? toDtLocal(t.remindCfg.anchor) : (t.date ? t.date + 'T' + (t.time || '09:00') : '');

  function tagsHtml() {
    return tags.map(function (g, i) {
      return '<button class="chip-p on" data-tagrm="' + i + '">#' + esc(g) + ' ×</button>';
    }).join('');
  }
  var html = '<div class="modal wide">' +
    '<div class="m-head">' +
    (fromDetail ? '<button class="m-back" id="edBack" title="返回详情">' + svgIcon('chevL') + '</button>' : '') +
    '<h3>' + (isNew ? '新建日程' : (fromDetail ? '修改日程' : '编辑日程')) + '</h3>' +
    '<button class="m-close">' + svgIcon('close') + '</button></div>' +
    '<div class="m-body">' +
    '<div class="field"><input class="inp" id="edTitle" placeholder="要做什么？" value="' + esc(t.title) + '" ' + (isNew ? 'autofocus' : '') + ' style="font-size:16px;font-weight:600;height:44px"></div>' +
    '<div class="field"><textarea class="inp" id="edNote" placeholder="补充说明（可选）">' + esc(t.note) + '</textarea></div>' +
    '<div class="ed-sep"></div>' +
    '<div class="row3">' +
    '<div class="field"><label>开始日期</label><input class="inp" type="date" id="edDate" value="' + esc(t.date) + '"></div>' +
    '<div class="field"><label>时间<span class="hint">可留空</span></label><input class="inp" type="time" id="edTime" value="' + esc(t.time) + '"></div>' +
    '<div class="field"><label>持续<span class="hint">可选</span></label>' +
    // 默认不勾：普通日程只占当天；勾了「多天」才出现天数，子项那列「天」也跟着出现
    '<div class="span-toggle' + (t.span > 1 ? ' on' : '') + '" id="edSpanWrap" title="勾选后可以连续占多天">' +
    '<input type="checkbox" id="edSpanOn"' + (t.span > 1 ? ' checked' : '') + '>' +
    '<span class="span-txt">多天</span>' +
    '<input class="span-num" type="number" id="edSpan" min="2" max="365" step="1" value="' +
    (t.span > 1 ? t.span : '') + '" placeholder="2">' +
    '<span class="span-u">天</span>' +
    '</div></div>' +
    '</div>' +
    '<div class="span-hint" id="edSpanHint"></div>' +
    '<div class="ed-sep"></div>' +
    '<div class="field"><label>重复<span class="hint">勾完这条会自动排下一次</span></label><div class="chip-pick" id="edRepeat">' +
    REPEAT_OPTS.map(function (r) {
      return '<button class="chip-p' + ((t.repeat || '不重复') === r ? ' on' : '') + '" data-repeat="' + r + '">' + r + '</button>';
    }).join('') + '</div></div>' +
    '<div class="ed-sep"></div>' +
    '<div class="row2">' +
    '<div class="field"><label>清单</label>' +
    '<input class="inp" id="edList" value="' + esc(t.list) + '" placeholder="收集箱">' +
    // 和下面「标签」一个格式：输入框 + 选已有下拉 + 一个新建入口
    '<div class="pick-row">' +
    '<button type="button" class="inp pick-multi" id="edListPick">' +
    '<span>选已有</span><i class="pm-c">' + svgIcon('chevD') + '</i></button>' +
    '<button class="chip-p" data-picklist="__new" style="border-style:dashed">＋ 新建清单</button>' +
    '</div></div>' +
    '<div class="field"><label>预计时长</label>' +
    '<div class="est-row">' +
    '<input class="inp" type="number" id="edEst" min="0" step="5" value="' + (t.estimate || '') + '" placeholder="45">' +
    '<div class="seg est-unit" id="edEstUnit">' +
    '<button data-estunit="min" class="on">分钟</button><button data-estunit="hour">小时</button>' +
    '</div></div>' +
    '<div class="est-hint" id="edEstHint"></div>' +
    '</div>' +
    '</div>' +
    '<div class="ed-sep"></div>' +
    '<div class="field"><label>' + svgIcon('split') + '拆分<span class="hint" id="edSubHint">拆成几段分别勾选</span></label>' +
    '<div class="sub-edit" id="edSubs"></div>' +
    '<div class="sub-edit-foot">' +
    '<button class="chip-p" id="edSubAdd">＋ 添加子项</button>' +
    '<span class="hint" id="edSubSum"></span>' +
    '<button class="chip-p" id="edSubUseEst" style="display:none">用作预计时长</button>' +
    '</div>' +
    '<div class="chip-pick" style="margin-top:7px"><span class="hint" style="align-self:center;margin-right:2px">模板</span>' +
    SUB_TPLS.map(function (tp) {
      return '<button class="chip-p" data-subtpl="' + tp.k + '" style="border-style:dashed">' + tp.t + '</button>';
    }).join('') + '</div>' +
    '</div>' +
    '<div class="ed-sep"></div>' +
    '<div class="field"><label>优先级</label><div class="chip-pick" id="edPrio">' +
    ['P0', 'P1', 'P2', 'P3'].map(function (p) {
      return '<button class="chip-p' + (p === 'P0' ? ' red' : '') + (t.prio === p ? ' on' : '') + '" data-prio="' + p + '">' + p + ' · ' + PRIO_LABEL[p] + '</button>';
    }).join('') + '<button class="chip-p' + (!t.prio ? ' on' : '') + '" data-prio="">无</button></div></div>' +
    '<div class="ed-sep"></div>' +
    '<div class="field"><label>四象限属性</label><div class="chip-pick">' +
    '<button class="chip-p' + (t.important ? ' on' : '') + '" data-imp="1">' + (t.important ? '✓ ' : '') + '重要</button>' +
    '<button class="chip-p' + (t.urgent ? ' on' : '') + '" data-urg="1">' + (t.urgent ? '✓ ' : '') + '紧急</button>' +
    '<span class="hint" style="align-self:center">' + quadName(t.important, t.urgent) + '</span></div></div>' +
    '<div class="ed-sep"></div>' +
    '<div class="field"><label>标签</label><div class="chip-pick" id="edTagsWrap">' + tagsHtml() + '</div>' +
    '<div class="pick-row"><input class="inp" id="edTagInput" placeholder="输入标签名后回车添加" style="height:34px;font-size:13px">' +
    // 标签可以一次选多个，所以不用 <select>，点开是一个带勾选的面板
    '<button type="button" class="inp pick-multi" id="edTagPick">' +
    '<span>选已有</span><i class="pm-c"><b class="pm-n" id="edTagN"></b>' + svgIcon('chevD') + '</i></button>' +
    '</div></div>' +
    '<div class="ed-sep"></div>' +
    '<div class="field"><label>提醒方式</label><div class="seg" id="edRemindMode">' +
    ['不提醒', '单次提醒', '艾宾浩斯'].map(function (m) {
      return '<button data-rmode="' + m + '" class="' + (t.remindMode === m ? 'on' : '') + '">' + m + '</button>';
    }).join('') + '</div></div>' +
    '<div id="edRemindBox"></div>' +
    '</div>' +
    '<div class="m-foot">' +
    (isNew ? '' : '<button class="btn btn-danger btn-sm" id="edDel">' + svgIcon('trash') + '删除</button>') +
    '<div class="spacer"></div>' +
    '<button class="btn btn-sec" id="edCancel">取消</button>' +
    '<button class="btn btn-pri" id="edSave">' + (isNew ? '添加任务' : '保存修改') + '</button>' +
    '</div></div>';

  var w = openModal(html, {
    onMount: function (root) {
      var subsDraft = (t.subs || []).map(function (x) {
        return { title: x.title, min: Number(x.min) || 0, days: Math.max(0, Number(x.days) || 0), done: !!x.done };
      });
      var subsBox = root.querySelector('#edSubs');
      var subsSum = root.querySelector('#edSubSum');
      var estInp = root.querySelector('#edEst');
      var spanWrap = root.querySelector('#edSpanWrap');
      var spanInp = root.querySelector('#edSpan');
      var spanChk = root.querySelector('#edSpanOn');
      // 「持续」是个开关：不勾就是当天的日程，勾了才管天数（子项的「天」列同理）
      var spanOn = !!(spanChk && spanChk.checked);
      // 预计时长内部一律按分钟存，输入框按当前单位显示（整小时才用小时）
      var estMin = Math.max(0, Number(t.estimate) || 0);
      var estUnit = (estMin > 0 && estMin % 60 === 0) ? 'hour' : 'min';
      function estNum(v) { return String(Math.round(v * 100) / 100); }
      function paintEst() {
        if (!estInp) return;
        estInp.value = estMin ? (estUnit === 'hour' ? estNum(estMin / 60) : String(estMin)) : '';
        estInp.step = estUnit === 'hour' ? '0.5' : '5';
        estInp.placeholder = estUnit === 'hour' ? '1.5' : '45';
        Array.prototype.forEach.call(root.querySelectorAll('[data-estunit]'), function (b) {
          b.className = b.getAttribute('data-estunit') === estUnit ? 'on' : '';
        });
      }
      function readEst() {
        var v = parseFloat(estInp ? estInp.value : '');
        estMin = (!v || v <= 0) ? 0 : Math.round(estUnit === 'hour' ? v * 60 : v);
        return estMin;
      }
      function setEstMin(v) {
        estMin = Math.max(0, Math.round(Number(v) || 0));
        // 程序填入的数值换成能整除的单位，免得出现 0.83 小时这种数
        if (estMin && estMin % 60 !== 0) estUnit = 'min';
        paintEst();
      }
      function syncSpanUI() {
        if (spanWrap) spanWrap.className = 'span-toggle' + (spanOn ? ' on' : '');
        if (spanInp) spanInp.disabled = !spanOn;
        if (subsBox) subsBox.className = 'sub-edit' + (spanOn ? ' has-span' : '');
        var sh = root.querySelector('#edSubHint');
        if (sh) sh.textContent = spanOn ? '拆成几段分别勾选；填「天」会自动按顺序排进日期' : '拆成几段分别勾选';
      }
      function subsTotal() {
        return subsDraft.reduce(function (a, x) { return a + (Number(x.min) || 0); }, 0);
      }
      function subsDays() {
        if (!spanOn) return 0;
        return subsDraft.reduce(function (a, x) { return a + (Number(x.days) || 0); }, 0);
      }
      // 跨度提示：把「开始日 + 持续 / 子项天数」算成一句人话
      function syncPlan() {
        var hint = root.querySelector('#edSpanHint');
        if (!hint) return;
        var dv = (root.querySelector('#edDate') || {}).value || '';
        var sv = spanOn ? Math.max(1, parseInt(spanInp ? spanInp.value : '', 10) || 1) : 1;
        var pd = subsDays();
        var span = Math.max(1, Math.max(sv, pd));
        if (!dv) {
          hint.className = 'span-hint' + (pd ? ' warn' : '');
          hint.innerHTML = pd ? svgIcon('alert') + '子项排了 ' + pd + ' 天，但还没选开始日期' : '';
          return;
        }
        var st = parseYmd(dv), en = addDays(st, span - 1);
        var segs = spanOn ? subsDraft.filter(function (x) { return (Number(x.days) || 0) > 0; }).length : 0;
        hint.className = 'span-hint' + (span > 1 ? ' on' : '');
        hint.innerHTML = '占 <b>' + span + '</b> 天：' + fmtRange(st, en) +
          (segs ? ' · ' + segs + ' 个阶段' : '') +
          (pd && pd > sv ? '（按子项合计）' : '');
      }
      function syncSubSum() {
        var n = subsDraft.filter(function (x) { return String(x.title || '').trim(); }).length;
        var sm = subsTotal();
        var pdSum = subsDays();
        if (subsSum) subsSum.innerHTML = n
          ? '共 <b>' + n + '</b> 项' + (sm ? ' · 合计 <b>' + durText(sm) + '</b>' : '') +
            (pdSum ? ' · 排期 <b>' + pdSum + ' 天</b>' : '')
          : '还没添加子项';
        var ub = root.querySelector('#edSubUseEst');
        var hint = root.querySelector('#edEstHint');
        var ev = readEst();
        var diff = sm > 0 && ev !== sm;
        if (ub) {
          ub.style.display = diff ? '' : 'none';
          ub.className = 'chip-p' + (diff ? ' on' : '');
          ub.textContent = '同步为 ' + durText(sm);
        }
        if (hint) {
          hint.className = 'est-hint' + (diff ? ' show' : '');
          hint.innerHTML = diff
            ? svgIcon('alert') + '子项合计 ' + durText(sm) + (ev ? '，与预计 ' + durText(ev) + '不一致' : '，还没填预计时长')
            : '';
        }
        syncPlan();
      }
      function renderSubs() {
        if (!subsBox) return;
        subsBox.innerHTML = subsDraft.map(function (x, i) {
          return '<div class="sub-edit-row">' +
            '<input class="inp sub-name" data-subt="' + i + '" value="' + esc(x.title) + '" placeholder="子项名称，如 调研">' +
            '<input class="inp sub-minin" type="number" min="0" step="5" data-subm="' + i + '" value="' + (x.min || '') + '" placeholder="分钟">' +
            '<input class="inp sub-dayin" type="number" min="0" max="365" step="1" data-subd="' + i + '" value="' + (x.days || '') + '" placeholder="天">' +
            '<button class="sub-del" data-subdel="' + i + '" title="删除这个子项">' + svgIcon('close') + '</button>' +
            '</div>';
        }).join('');
        Array.prototype.forEach.call(subsBox.querySelectorAll('[data-subt]'), function (inp) {
          inp.addEventListener('input', function () {
            var i = parseInt(inp.getAttribute('data-subt'), 10);
            if (subsDraft[i]) subsDraft[i].title = inp.value;
            syncSubSum();
          });
        });
        Array.prototype.forEach.call(subsBox.querySelectorAll('[data-subm]'), function (inp) {
          inp.addEventListener('input', function () {
            var i = parseInt(inp.getAttribute('data-subm'), 10);
            if (subsDraft[i]) subsDraft[i].min = Math.max(0, parseInt(inp.value, 10) || 0);
            syncSubSum();
          });
        });
        Array.prototype.forEach.call(subsBox.querySelectorAll('[data-subd]'), function (inp) {
          inp.addEventListener('input', function () {
            var i = parseInt(inp.getAttribute('data-subd'), 10);
            if (subsDraft[i]) subsDraft[i].days = Math.max(0, parseInt(inp.value, 10) || 0);
            syncSubSum();
          });
        });
        Array.prototype.forEach.call(subsBox.querySelectorAll('[data-subdel]'), function (b) {
          b.addEventListener('click', function () {
            var i = parseInt(b.getAttribute('data-subdel'), 10);
            subsDraft.splice(i, 1);
            renderSubs();
            syncSubSum();
          });
        });
        syncSubSum();
      }
      // 先把时长按单位画出来，再由 renderSubs 里的 syncSubSum 读回去，免得重复换算
      paintEst();
      syncSpanUI();
      renderSubs();
      if (spanChk) spanChk.addEventListener('change', function () {
        spanOn = !!spanChk.checked;
        if (spanOn) {
          if (spanInp && !(parseInt(spanInp.value, 10) > 1)) spanInp.value = '2';
        } else if (spanInp) {
          spanInp.value = '';
        }
        syncSpanUI();
        syncSubSum();
        if (spanOn && spanInp) { try { spanInp.focus(); } catch (e) { } }
      });
      // 整颗胶囊都可以点，点数字框本身不切换
      if (spanWrap) spanWrap.addEventListener('click', function (e) {
        if (e.target === spanChk || e.target === spanInp) return;
        spanChk.checked = !spanChk.checked;
        spanChk.dispatchEvent(new Event('change', { bubbles: true }));
      });
      if (spanInp) spanInp.addEventListener('input', syncPlan);
      var dateInp2 = root.querySelector('#edDate');
      if (dateInp2) dateInp2.addEventListener('change', syncPlan);
      syncPlan();
      var addSubBtn = root.querySelector('#edSubAdd');
      if (addSubBtn) addSubBtn.addEventListener('click', function () {
        subsDraft.push({ title: '', min: 0, days: 0, done: false });
        renderSubs();
        var inputs = subsBox.querySelectorAll('[data-subt]');
        var last = inputs[inputs.length - 1];
        if (last) last.focus();
      });
      var useEstBtn = root.querySelector('#edSubUseEst');
      if (useEstBtn) useEstBtn.addEventListener('click', function () {
        setEstMin(subsTotal());
        syncSubSum();
      });
      if (estInp) estInp.addEventListener('input', syncSubSum);
      // 分钟 / 小时单选：换单位时把已填的数换算过去，底层一直是分钟
      Array.prototype.forEach.call(root.querySelectorAll('[data-estunit]'), function (b) {
        b.addEventListener('click', function () {
          readEst();
          estUnit = b.getAttribute('data-estunit');
          paintEst();
          syncSubSum();
        });
      });
      Array.prototype.forEach.call(root.querySelectorAll('[data-subtpl]'), function (b) {
        b.addEventListener('click', function () {
          var tp = SUB_TPLS.filter(function (x) { return x.k === b.getAttribute('data-subtpl'); })[0];
          if (!tp) return;
          var exists = {};
          subsDraft.forEach(function (x) { exists[String(x.title || '').trim()] = true; });
          var added = 0;
          tp.items.forEach(function (it) {
            if (exists[it[0]]) return;
            subsDraft.push({ title: it[0], min: it[1], days: 0, done: false });
            exists[it[0]] = true;
            added++;
          });
          // 去掉开头的空行
          subsDraft = subsDraft.filter(function (x, i) {
            return !(i === 0 && !String(x.title || '').trim() && subsDraft.length > 1);
          });
          renderSubs();
          if (added) toast('已加入 ' + added + ' 个子项');
        });
      });
      var state = {
        repeat: t.repeat || '不重复',
        prio: t.prio, important: t.important, urgent: t.urgent,
        remindMode: t.remindMode || '不提醒', offsets: ebOffsets,
        onceOffset: (t.remindCfg && t.remindCfg.offsets && t.remindCfg.offsets.length) ? t.remindCfg.offsets[0] : -10
      };
      function renderRemindBox() {
        var box = root.querySelector('#edRemindBox');
        if (!box) return;
        if (state.remindMode === '不提醒') { box.innerHTML = ''; return; }
        if (state.remindMode === '单次提醒') {
          var opts = [{ v: 0, t: '准时' }, { v: -5, t: '提前 5 分钟' }, { v: -10, t: '提前 10 分钟' }, { v: -15, t: '提前 15 分钟' },
          { v: -30, t: '提前 30 分钟' }, { v: -60, t: '提前 1 小时' }, { v: -1440, t: '提前 1 天' }];
          box.innerHTML = '<div class="field"><label>提醒时机</label><div class="chip-pick">' +
            opts.map(function (o) {
              return '<button class="chip-p' + (state.onceOffset === o.v ? ' on' : '') + '" data-once="' + o.v + '">' + o.t + '</button>';
            }).join('') + '</div></div>';
          Array.prototype.forEach.call(box.querySelectorAll('[data-once]'), function (b) {
            b.addEventListener('click', function () { state.onceOffset = parseInt(b.getAttribute('data-once'), 10); renderRemindBox(); });
          });
          return;
        }
        box.innerHTML = '<div class="field"><label>复习时间点<span class="hint">按艾宾浩斯遗忘曲线，点选要提醒的节点</span></label>' +
          '<div class="chip-pick">' +
          EB_OFFSETS.map(function (off, i) {
            return '<button class="chip-p' + (state.offsets.indexOf(off) > -1 ? ' on' : '') + '" data-eb="' + off + '">' + EB_LABEL[i] + '</button>';
          }).join('') + '</div></div>' +
          '<div class="field"><label>基准时间<span class="hint">第一个提醒从这个时间开始计算</span></label>' +
          '<input class="inp" type="datetime-local" id="edAnchor" value="' + esc(anchorVal) + '"></div>' +
          '<div style="font-size:11.5px;color:var(--text-3);line-height:1.6">已选 <b>' + state.offsets.length + '</b> 个提醒节点，' +
          '总共跨 ' + ebSpan(state.offsets) + '。提醒会出现在顶部铃铛和「今天要处理」区域。</div>';
        Array.prototype.forEach.call(box.querySelectorAll('[data-eb]'), function (b) {
          b.addEventListener('click', function () {
            var off = parseInt(b.getAttribute('data-eb'), 10);
            var i = state.offsets.indexOf(off);
            if (i > -1) state.offsets.splice(i, 1); else state.offsets.push(off);
            state.offsets.sort(function (x, y) { return x - y; });
            renderRemindBox();
          });
        });
      }
      renderRemindBox();

      Array.prototype.forEach.call(root.querySelectorAll('[data-repeat]'), function (b) {
        b.addEventListener('click', function () {
          state.repeat = b.getAttribute('data-repeat');
          Array.prototype.forEach.call(root.querySelectorAll('[data-repeat]'), function (x) { x.className = 'chip-p'; });
          b.className = 'chip-p on';
        });
      });
      Array.prototype.forEach.call(root.querySelectorAll('[data-prio]'), function (b) {
        b.addEventListener('click', function () {
          state.prio = b.getAttribute('data-prio');
          Array.prototype.forEach.call(root.querySelectorAll('[data-prio]'), function (x) { x.className = 'chip-p' + (x.getAttribute('data-prio') === 'P0' ? ' red' : ''); });
          b.className = 'chip-p' + (state.prio === 'P0' ? ' red on' : ' on');
        });
      });
      Array.prototype.forEach.call(root.querySelectorAll('[data-imp]'), function (b) {
        b.addEventListener('click', function () {
          state.important = !state.important;
          b.className = 'chip-p' + (state.important ? ' on' : '');
          b.textContent = (state.important ? '✓ ' : '') + '重要';
          var hint = root.querySelector('[data-imp]').parentNode.querySelector('.hint');
          if (hint) hint.textContent = quadName(state.important, state.urgent);
        });
      });
      Array.prototype.forEach.call(root.querySelectorAll('[data-urg]'), function (b) {
        b.addEventListener('click', function () {
          state.urgent = !state.urgent;
          b.className = 'chip-p' + (state.urgent ? ' on' : '');
          b.textContent = (state.urgent ? '✓ ' : '') + '紧急';
          var hint = root.querySelector('[data-urg]').parentNode.querySelector('.hint');
          if (hint) hint.textContent = quadName(state.important, state.urgent);
        });
      });
      Array.prototype.forEach.call(root.querySelectorAll('[data-rmode]'), function (b) {
        b.addEventListener('click', function () {
          state.remindMode = b.getAttribute('data-rmode');
          Array.prototype.forEach.call(root.querySelectorAll('[data-rmode]'), function (x) { x.className = ''; });
          b.className = 'on';
          renderRemindBox();
        });
      });
      function rebindTags() {
        var wrap = root.querySelector('#edTagsWrap');
        if (!wrap) return;
        wrap.innerHTML = tagsHtml();
        Array.prototype.forEach.call(wrap.querySelectorAll('[data-tagrm]'), function (b) {
          b.addEventListener('click', function () {
            tags.splice(parseInt(b.getAttribute('data-tagrm'), 10), 1);
            rebindTags();
          });
        });
        syncTagBadge();
        paintPickMenu();
      }
      var listNewBtn = root.querySelector('[data-picklist="__new"]');
      if (listNewBtn) listNewBtn.addEventListener('click', function () {
        var inp = root.querySelector('#edList');
        if (!inp) return;
        inp.value = '';
        inp.placeholder = '输入新清单名称';
        inp.focus();
      });
      rebindTags();
      var tagInput = root.querySelector('#edTagInput');
      if (tagInput) tagInput.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        var v = tagInput.value.trim().replace(/^#/, '');
        if (v && tags.indexOf(v) === -1) { tags.push(v); rebindTags(); }
        tagInput.value = '';
      });
      /* ---- 「选已有」浮层：清单单选、标签多选共用一套壳和样式 ---- */
      var listPickBtn = root.querySelector('#edListPick');
      var tagPickBtn = root.querySelector('#edTagPick');
      var pickEl = null;
      var pickBtn = null;
      var pickMode = 'single';
      var pickBody = root.querySelector('.m-body');
      // 标签候选 = 全站已有标签 + 本次已选（可能刚手输进来）
      function tagsPool() {
        var pool = allTags().slice();
        tags.forEach(function (g) { if (pool.indexOf(g) === -1) pool.push(g); });
        return pool;
      }
      function syncTagBadge() {
        var n = root.querySelector('#edTagN');
        if (n) n.textContent = tags.length ? String(tags.length) : '';
      }
      function pickItems() {
        if (pickMode === 'multi') {
          return tagsPool().map(function (g) {
            return { v: g, label: '#' + g, on: tags.indexOf(g) > -1 };
          });
        }
        var inp = root.querySelector('#edList');
        var cur = (inp && inp.value ? inp.value : '收集箱');
        var names = allLists().slice();
        if (cur && names.indexOf(cur) === -1) names.push(cur);
        return names.map(function (n) { return { v: n, label: n, on: n === cur }; });
      }
      function paintPickMenu() {
        if (!pickEl) return;
        var items = pickItems();
        if (!items.length) {
          pickEl.innerHTML = '<div class="pick-menu-empty">' + (pickMode === 'multi'
            ? '还没有已有标签。<br>在左边输入框写名字回车，就建一个新的。'
            : '还没有清单。点右边的「＋ 新建清单」建一个。') + '</div>';
          return;
        }
        pickEl.innerHTML = items.map(function (it) {
          return '<button type="button" class="pick-opt' + (it.on ? ' on' : '') +
            '" data-pickv="' + esc(it.v) + '">' +
            '<i class="pick-box">' + (it.on && pickMode === 'multi' ? '✓' : '') + '</i>' +
            '<span>' + esc(it.label) + '</span></button>';
        }).join('');
        Array.prototype.forEach.call(pickEl.querySelectorAll('[data-pickv]'), function (b) {
          b.addEventListener('click', function () {
            var v = b.getAttribute('data-pickv');
            if (pickMode === 'multi') {
              var i = tags.indexOf(v);
              if (i > -1) tags.splice(i, 1); else tags.push(v);
              rebindTags();
              paintPickMenu();
              return;
            }
            var inp = root.querySelector('#edList');
            if (inp) { inp.value = v; inp.placeholder = '收集箱'; }
            closePickMenu();
          });
        });
      }
      function closePickMenu() {
        if (pickEl && pickEl.parentNode) pickEl.parentNode.removeChild(pickEl);
        pickEl = null;
        if (pickBtn) pickBtn.className = 'inp pick-multi';
        pickBtn = null;
        document.removeEventListener('mousedown', onPickDocDown, true);
        if (pickBody) pickBody.removeEventListener('scroll', closePickMenu, true);
        window.removeEventListener('resize', closePickMenu);
      }
      function onPickDocDown(e) {
        if (!pickEl) return;
        if (pickEl.contains(e.target)) return;
        if (pickBtn && pickBtn.contains(e.target)) return;
        closePickMenu();
      }
      function openPickMenu(btn, mode) {
        if (!btn) return;
        var same = !!pickEl && pickBtn === btn;
        if (pickEl) closePickMenu();
        if (same) return;
        pickBtn = btn;
        pickMode = mode;
        var r = btn.getBoundingClientRect();
        pickEl = document.createElement('div');
        pickEl.className = 'pick-menu ' + mode;
        document.body.appendChild(pickEl);
        paintPickMenu();
        // 面板贴在按钮下面，底下放不下就翻到上面，左右别出屏
        var mw = Math.max(r.width || 0, 190);
        var mh = pickEl.offsetHeight || 0;
        var left = Math.max(8, Math.min(r.left || 8, window.innerWidth - mw - 8));
        var top = (r.bottom || 0) + 5;
        if (top + mh > window.innerHeight - 8) top = Math.max(8, (r.top || 0) - mh - 5);
        pickEl.style.width = mw + 'px';
        pickEl.style.left = left + 'px';
        pickEl.style.top = top + 'px';
        btn.className = 'inp pick-multi open';
        setTimeout(function () { document.addEventListener('mousedown', onPickDocDown, true); }, 0);
        if (pickBody) pickBody.addEventListener('scroll', closePickMenu, true);
        window.addEventListener('resize', closePickMenu);
      }
      if (listPickBtn) listPickBtn.addEventListener('click', function () {
        openPickMenu(listPickBtn, 'single');
      });
      if (tagPickBtn) tagPickBtn.addEventListener('click', function () {
        openPickMenu(tagPickBtn, 'multi');
      });
      root.querySelector('#edCancel').addEventListener('click', closeModal);
      var backBtn = root.querySelector('#edBack');
      if (backBtn) backBtn.addEventListener('click', function () {
        closeModal();
        setTimeout(function () { openTaskDetail(t.id); }, 200);
      });
      var delBtn = root.querySelector('#edDel');
      if (delBtn) delBtn.addEventListener('click', function () {
        confirmModal('删除任务', '确定删除这条任务？', '删除', function () {
          S.tasks = S.tasks.filter(function (x) { return x.id !== t.id; });
          cacheLocal(); refreshAll(); apiDeleteTask(t.id); toast('已删除');
        }, true);
      });
      root.querySelector('#edSave').addEventListener('click', function (e) {
        var btn = e.currentTarget;
        var title = (root.querySelector('#edTitle').value || '').trim();
        if (!title) { toast('先写一个任务标题'); return; }
        var dateV = root.querySelector('#edDate').value;
        var timeV = root.querySelector('#edTime').value;
        var estV = readEst();
        var anchorEl = root.querySelector('#edAnchor');
        var anchor = anchorEl ? anchorEl.value : '';
        var cfg = null;
        if (state.remindMode === '艾宾浩斯') {
          if (!state.offsets.length) { toast('至少选一个复习节点'); return; }
          cfg = { anchor: fromDtLocal(anchor || (dateV + 'T' + (timeV || '09:00'))), offsets: state.offsets.slice(), read: [] };
        } else if (state.remindMode === '单次提醒') {
          cfg = { anchor: fromDtLocal(dateV + 'T' + (timeV || '09:00')), offsets: [state.onceOffset], read: [] };
        }
        t.title = title;
        t.note = (root.querySelector('#edNote').value || '').trim();
        t.list = (root.querySelector('#edList').value || '').trim() || '收集箱';
        if (listNames.indexOf(t.list) === -1) addCustomList(t.list);
        t.prio = state.prio;
        t.important = state.important;
        t.urgent = state.urgent;
        t.tags = tags.slice();
        tags.forEach(function (g) { if (allTagList.indexOf(g) === -1) addCustomTag(g); });
        t.date = dateV;
        t.time = timeV;
        t.repeat = (state.repeat === '不重复') ? '' : state.repeat;
        var cleanSubs = subsDraft.map(function (x) {
          return {
            id: '', title: String(x.title || '').trim(), min: Number(x.min) || 0,
            days: spanOn ? Math.max(0, Number(x.days) || 0) : 0, done: !!x.done
          };
        }).filter(function (x) { return !!x.title; });
        t.subs = cleanSubs;
        // 总跨度：手填的「持续」和子项天数合计取大的那个，
        // 这样「安排 5 天但整件事占 7 天」也能表达；没勾「多天」就只占开始日一天
        var spanV = spanOn ? Math.max(1, parseInt(spanInp ? spanInp.value : '', 10) || 1) : 1;
        var planSum = cleanSubs.reduce(function (a, x) { return a + (x.days || 0); }, 0);
        t.span = Math.max(1, Math.min(365, Math.max(spanV, planSum)));
        if ((isNaN(estV) || estV <= 0) && cleanSubs.length) {
          var sumSub = cleanSubs.reduce(function (a, x) { return a + x.min; }, 0);
          if (sumSub > 0) estV = sumSub;
        }
        t.estimate = isNaN(estV) ? 0 : Math.max(0, estV);
        t.remindMode = state.remindMode;
        t.remindCfg = cfg;
        if (!t.createdAt) t.createdAt = ymd(today0());
        btn.disabled = true;
        if (!t.id) {
          var nt = t;
          nt.id = uid();
          S.tasks.push(nt);
          cacheLocal();
          closeModal();
          refreshAll();
          apiAddTask(nt).then(function () {
            cacheLocal(); refreshAll();
            toast('任务已添加');
          });
        } else {
          cacheLocal();
          var backId = t.id;
          closeModal();
          refreshAll();
          if (fromDetail) setTimeout(function () { openTaskDetail(backId); }, 200);
          apiUpdateTask(t).then(function () { cacheLocal(); refreshAll(); });
          toast('已保存');
        }
      });
    }
  });
  return w;
}
function quadName(imp, urg) {
  if (imp && urg) return '· 重要且紧急';
  if (imp) return '· 重要不紧急';
  if (urg) return '· 紧急不重要';
  return '· 不重要不紧急';
}
function ebSpan(offsets) {
  if (!offsets.length) return '0 分钟';
  var max = Math.max.apply(null, offsets);
  if (max < 60) return max + ' 分钟';
  if (max < 1440) return Math.round(max / 60) + ' 小时';
  return Math.round(max / 1440) + ' 天';
}
function toDtLocal(s) {
  var m = String(s || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (!m) return '';
  return m[1] + '-' + pad2(parseInt(m[2], 10)) + '-' + pad2(parseInt(m[3], 10)) + 'T' + pad2(m[4] ? parseInt(m[4], 10) : 9) + ':' + (m[5] || '00');
}
function fromDtLocal(v) {
  if (!v) return '';
  return v.replace('T', ' ');
}

/* ---------- 快速添加（智能识别日期时间） ---------- */
function parseQuick(raw) {
  var text = String(raw || '').trim();
  var out = { title: '', date: '', time: '', tags: [], prio: '' };
  if (!text) return out;
  var t0 = today0();
  var rest = text;

  // 优先级 !p0 / !0
  var pm = rest.match(/!\s*(p?[0-3])/i);
  if (pm) {
    out.prio = 'P' + pm[1].replace(/[pP]/, '');
    rest = rest.replace(pm[0], ' ');
  }
  // 标签 #xxx
  rest = rest.replace(/#([^\s#，,。]+)/g, function (m, g) { out.tags.push(g); return ' '; });

  // 日期
  var dateFound = '';
  var dm = rest.match(/(\d{4})[-\/年](\d{1,2})[-\/月](\d{1,2})[日号]?/);
  if (dm) {
    dateFound = dm[1] + '-' + pad2(parseInt(dm[2], 10)) + '-' + pad2(parseInt(dm[3], 10));
    rest = rest.replace(dm[0], ' ');
  }
  if (!dateFound) {
    dm = rest.match(/(\d{1,2})月(\d{1,2})[日号]/);
    if (dm) {
      var y = t0.getFullYear();
      var cand = new Date(y, parseInt(dm[1], 10) - 1, parseInt(dm[2], 10));
      if (dayDiff(t0, cand) < -180) cand = new Date(y + 1, parseInt(dm[1], 10) - 1, parseInt(dm[2], 10));
      dateFound = ymd(cand);
      rest = rest.replace(dm[0], ' ');
    }
  }
  if (!dateFound) {
    dm = rest.match(/(\d{1,2})[\/\-](\d{1,2})(?!\d)/);
    if (dm) {
      var hit = rest.indexOf(dm[0]);
      var prevCh = hit > 0 ? rest.charAt(hit - 1) : '';
      var mm = parseInt(dm[1], 10), dd = parseInt(dm[2], 10);
      if (!/\d/.test(prevCh) && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        var cand2 = new Date(t0.getFullYear(), mm - 1, dd);
        if (dayDiff(t0, cand2) < -180) cand2 = new Date(t0.getFullYear() + 1, mm - 1, dd);
        dateFound = ymd(cand2);
        rest = rest.replace(dm[0], ' ');
      }
    }
  }
  if (!dateFound) {
    dm = rest.match(/(\d{1,2})\s*天[后後]/);
    if (dm) { dateFound = ymd(addDays(t0, parseInt(dm[1], 10))); rest = rest.replace(dm[0], ' '); }
  }
  if (!dateFound) {
    dm = rest.match(/(\d{1,2})\s*(?:周|个?星期)[后後]/);
    if (dm) { dateFound = ymd(addDays(t0, parseInt(dm[1], 10) * 7)); rest = rest.replace(dm[0], ' '); }
  }
  if (!dateFound) {
    var rel = [['大后天', 3], ['后天', 2], ['明天', 1], ['明日', 1], ['今天', 0], ['今日', 0], ['昨天', -1]];
    for (var ri = 0; ri < rel.length; ri++) {
      if (rest.indexOf(rel[ri][0]) > -1) {
        dateFound = ymd(addDays(t0, rel[ri][1]));
        rest = rest.replace(rel[ri][0], ' ');
        break;
      }
    }
  }
  if (!dateFound) {
    var wm = rest.match(/(下下|下|这|本)?\s*(?:周|星期)([一二三四五六日天])/);
    if (wm) {
      var wmap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 };
      var targetDow = wmap[wm[2]];
      var dowOffset = targetDow === 0 ? 6 : targetDow - 1;
      var monday = startOfWeek(t0);
      var base = monday;
      if (wm[1] === '下') base = addDays(monday, 7);
      else if (wm[1] === '下下') base = addDays(monday, 14);
      var candW = addDays(base, dowOffset);
      if (!wm[1] && dayDiff(t0, candW) < 0) candW = addDays(candW, 7);
      dateFound = ymd(candW);
      rest = rest.replace(wm[0], ' ');
    }
  }
  out.date = dateFound || ymd(t0);

  // 时间
  var timeFound = '';
  var tm = rest.match(/(凌晨|早上|上午|中午|下午|傍晚|晚上|夜里)?\s*(\d{1,2})\s*[:：]\s*(\d{2})/);
  if (tm) {
    var hh = parseInt(tm[2], 10);
    var mi = parseInt(tm[3], 10);
    if (tm[1]) hh = applyAmPm(hh, tm[1]);
    if (hh >= 0 && hh < 24 && mi < 60) timeFound = pad2(hh) + ':' + pad2(mi);
    rest = rest.replace(tm[0], ' ');
  }
  if (!timeFound) {
    tm = rest.match(/(凌晨|早上|上午|中午|下午|傍晚|晚上|夜里)?\s*(\d{1,2})\s*[点時时](半|\d{1,2})?/);
    if (tm) {
      var hh2 = parseInt(tm[2], 10);
      var mi2 = 0;
      if (tm[3] === '半') mi2 = 30;
      else if (tm[3]) mi2 = parseInt(tm[3], 10);
      if (tm[1]) hh2 = applyAmPm(hh2, tm[1]);
      if (hh2 >= 0 && hh2 < 24 && mi2 < 60) timeFound = pad2(hh2) + ':' + pad2(mi2);
      rest = rest.replace(tm[0], ' ');
    }
  }
  out.time = timeFound;

  out.title = rest.replace(/\s+/g, ' ').replace(/^[\s,，。、]+|[\s,，。、]+$/g, '').trim();
  if (!out.title) out.title = '新任务';
  return out;
}
function applyAmPm(h, kw) {
  if (kw === '下午' || kw === '傍晚' || kw === '晚上') return h < 12 ? h + 12 : h;
  if (kw === '中午') return h < 11 ? h + 12 : h;
  if (kw === '凌晨') return h === 12 ? 0 : h;
  return h;
}
function openQuickAdd(initial) {
  var html = '<div class="modal">' +
    '<div class="m-head"><h3>添加日程</h3><button class="m-close">' + svgIcon('close') + '</button></div>' +
    '<div class="m-body">' +
    '<div class="field"><input class="inp" id="qaInput" autofocus placeholder="例：明天下午 3 点开会 #工作 !p1" value="' + esc(initial || readDraft()) + '" style="height:46px;font-size:16px"></div>' +
    '<div id="qaPreview" style="min-height:52px;background:var(--panel-2);border:1px solid var(--line);border-radius:10px;padding:10px 12px"></div>' +
    '<div style="font-size:11.5px;color:var(--text-3);line-height:1.8">' +
    '支持识别：今天 / 明天 / 后天 / 周五 / 下周一 / 10月26日 / 10/26 / 3天后 · 下午 3 点 / 15:30 / 晚上 8 点<br>' +
    '用 <b>#标签</b> 打标签，<b>!p0</b> ~ <b>!p3</b> 设优先级</div>' +
    '</div>' +
    '<div class="m-foot"><div class="spacer"></div>' +
    '<button class="btn btn-sec" id="qaMore">更多选项</button>' +
    '<button class="btn btn-pri" id="qaSave">添加</button></div></div>';
  openModal(html, {
    onMount: function (root) {
      var input = root.querySelector('#qaInput');
      var prev = root.querySelector('#qaPreview');
      function updatePreview() {
        saveDraft(input.value);
        var r = parseQuick(input.value);
        if (!input.value.trim()) { prev.innerHTML = '<span style="font-size:12px;color:var(--text-3)">输入任务内容，这里会实时显示识别结果</span>'; return; }
        prev.innerHTML = '<div style="font-size:13px;font-weight:600;color:var(--text)">' + esc(r.title) + '</div>' +
          '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:5px;font-size:11.5px;color:var(--text-2)">' +
          '<span>' + svgIcon('calendar') + ' ' + esc(dateLabel(parseYmd(r.date))) + ' ' + r.date + '</span>' +
          (r.time ? '<span>' + svgIcon('clock') + ' ' + r.time + '</span>' : '<span style="color:var(--text-3)">未设时间</span>') +
          (r.prio ? '<span>' + svgIcon('flag') + ' ' + r.prio + '</span>' : '') +
          (r.tags.length ? '<span>' + r.tags.map(function (g) { return '#' + esc(g); }).join(' ') + '</span>' : '') +
          '</div>';
      }
      input.addEventListener('input', updatePreview);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); root.querySelector('#qaSave').click(); }
      });
      updatePreview();
      root.querySelector('#qaMore').addEventListener('click', function () {
        var raw = String(input.value || '').trim();
        var r = parseQuick(raw);
        closeModal();
        setTimeout(function () {
          openTaskEditor(null);
          setTimeout(function () {
            var w2 = document.getElementById('modalRoot');
            if (!w2) return;
            var ti = w2.querySelector('#edTitle');
            if (ti) {
              if (raw) ti.value = r.title;
              ti.focus();
            }
            if (!raw) return;
            var dd = w2.querySelector('#edDate'); if (dd) dd.value = r.date;
            var tt = w2.querySelector('#edTime'); if (tt) tt.value = r.time;
            var ll = w2.querySelector('#edList'); if (ll) ll.value = '收集箱';
            var est = w2.querySelector('#edEst'); if (est) est.value = '';
            if (r.tags.length) {
              var tagInp = w2.querySelector('#edTagInput');
              if (tagInp) {
                r.tags.forEach(function (g) {
                  tagInp.value = g;
                  var ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
                  tagInp.dispatchEvent(ev);
                });
                tagInp.value = '';
              }
            }
          }, 120);
        }, 200);
      });
      root.querySelector('#qaSave').addEventListener('click', function () {
        var r = parseQuick(input.value);
        if (!input.value.trim()) { toast('先写点内容'); return; }
        var t = {
          id: uid(), title: r.title, note: '', list: (S.selectedList || '收集箱'), tags: r.tags, prio: r.prio,
          important: r.prio === 'P0', urgent: r.prio === 'P0' || r.prio === 'P1',
          done: false, remindMode: '不提醒', remindCfg: null,
          date: r.date, time: r.time, estimate: 0, doneAt: '', sort: Math.floor(Date.now() / 1000) % 1000000, createdAt: ymd(today0())
        };
        if (S.selectedTag && t.tags.indexOf(S.selectedTag) === -1) t.tags.push(S.selectedTag);
        S.tasks.push(t);
        cacheLocal();
        clearDraft();
        closeModal();
        refreshAll();
        apiAddTask(t).then(function () { cacheLocal(); refreshAll(); });
        toast('已添加：' + r.title + (r.time ? ' · ' + r.time : ''));
      });
    }
  });
}

/* ---------- 过滤器 ---------- */
function openSearch() {
  openModal('<div class="modal wide">' +
    '<div class="m-head"><h3>搜索</h3><button class="m-close">' + svgIcon('close') + '</button></div>' +
    '<div class="m-body">' +
    '<input class="inp" id="scInput" placeholder="搜日程、备注、标签、子项…" value="' + esc(S.filters.kw || '') + '" style="height:44px;font-size:16px">' +
    '<div class="sc-res" id="scRes"></div>' +
    '</div>' +
    '<div class="m-foot"><div style="font-size:11px;color:var(--text-3)" id="scCount"></div></div>' +
    '</div>', {
    onMount: function (root) {
      var inp = root.querySelector('#scInput');
      var box = root.querySelector('#scRes');
      var cnt = root.querySelector('#scCount');
      function run() {
        var kw = String(inp.value || '').trim().toLowerCase();
        if (!kw) { box.innerHTML = '<div class="sc-empty">输入关键词开始搜索，标题、备注、标签、子项都能搜</div>'; cnt.textContent = ''; return; }
        var hit = S.tasks.filter(function (t) {
          var subTxt = (t.subs || []).map(function (x) { return x.title; }).join(' ');
          var hay = (t.title + ' ' + t.note + ' ' + (t.tags || []).join(' ') + ' ' + (t.list || '') + ' ' + subTxt).toLowerCase();
          return hay.indexOf(kw) > -1;
        }).slice(0, 40);
        cnt.textContent = hit.length ? '找到 ' + hit.length + ' 条' : '';
        if (!hit.length) { box.innerHTML = '<div class="sc-empty">没有匹配的日程</div>'; return; }
        box.innerHTML = hit.map(function (t) {
          return '<div class="sc-item" data-scid="' + esc(t.id) + '">' + flagHtml(t) +
            '<span class="sc-t">' + esc(t.title) + '</span>' +
            '<span class="sc-m">' + (t.date ? shortDate(parseYmd(t.date)) : '未安排') + (t.time ? ' ' + t.time : '') + '</span></div>';
        }).join('');
      }
      inp.addEventListener('input', run);
      box.addEventListener('click', function (e) {
        var it = e.target.closest('[data-scid]');
        if (!it) return;
        var id = it.getAttribute('data-scid');
        closeModal();
        setTimeout(function () { openTaskDetail(id); }, 180);
      });
      setTimeout(function () { try { inp.focus(); inp.select(); } catch (e) { } }, 80);
      run();
    }
  });
}
function openFilter() {
  var f = { prio: S.filters.prio.slice(), tags: S.filters.tags.slice(), status: S.filters.status, from: S.filters.from, to: S.filters.to, kw: S.filters.kw };
  var tags = allTags();
  var html = '<div class="modal">' +
    '<div class="m-head"><h3>筛选任务</h3><button class="m-close">' + svgIcon('close') + '</button></div>' +
    '<div class="m-body">' +
    '<div class="field"><label>完成状态</label><div class="seg" id="ftStatus">' +
    [{ v: 'todo', t: '未完成' }, { v: 'done', t: '已完成' }, { v: 'all', t: '全部' }].map(function (o) {
      return '<button data-st="' + o.v + '" class="' + (f.status === o.v ? 'on' : '') + '">' + o.t + '</button>';
    }).join('') + '</div></div>' +
    '<div class="field"><label>优先级</label><div class="chip-pick" id="ftPrio">' +
    ['P0', 'P1', 'P2', 'P3'].map(function (p) {
      return '<button class="chip-p' + (f.prio.indexOf(p) > -1 ? ' on' : '') + '" data-fp="' + p + '">' + p + ' · ' + PRIO_LABEL[p] + '</button>';
    }).join('') + '</div></div>' +
    '<div class="field"><label>标签<span class="hint">可多选，满足任一即可</span></label><div class="chip-pick" id="ftTags">' +
    (tags.length ? tags.map(function (g) {
      return '<button class="chip-p' + (f.tags.indexOf(g) > -1 ? ' on' : '') + '" data-ft="' + esc(g) + '">#' + esc(g) + '</button>';
    }).join('') : '<span class="hint">暂无标签</span>') + '</div></div>' +
    '<div class="row2"><div class="field"><label>起始日期</label><input class="inp" type="date" id="ftFrom" value="' + esc(f.from) + '"></div>' +
    '<div class="field"><label>截止日期</label><input class="inp" type="date" id="ftTo" value="' + esc(f.to) + '"></div></div>' +
    '<div class="field"><label>关键词</label><input class="inp" id="ftKw" value="' + esc(f.kw) + '" placeholder="搜索标题 / 备注 / 标签"></div>' +
    '</div>' +
    '<div class="m-foot"><button class="btn btn-sec btn-sm" id="ftReset">重置</button><div class="spacer"></div>' +
    '<button class="btn btn-sec" id="ftCancel">取消</button>' +
    '<button class="btn btn-pri" id="ftApply">应用筛选</button></div></div>';
  openModal(html, {
    onMount: function (root) {
      Array.prototype.forEach.call(root.querySelectorAll('[data-st]'), function (b) {
        b.addEventListener('click', function () {
          f.status = b.getAttribute('data-st');
          Array.prototype.forEach.call(root.querySelectorAll('[data-st]'), function (x) { x.className = ''; });
          b.className = 'on';
        });
      });
      Array.prototype.forEach.call(root.querySelectorAll('[data-fp]'), function (b) {
        b.addEventListener('click', function () {
          var v = b.getAttribute('data-fp'), i = f.prio.indexOf(v);
          if (i > -1) f.prio.splice(i, 1); else f.prio.push(v);
          b.className = 'chip-p' + (i > -1 ? '' : ' on');
        });
      });
      Array.prototype.forEach.call(root.querySelectorAll('[data-ft]'), function (b) {
        b.addEventListener('click', function () {
          var v = b.getAttribute('data-ft'), i = f.tags.indexOf(v);
          if (i > -1) f.tags.splice(i, 1); else f.tags.push(v);
          b.className = 'chip-p' + (i > -1 ? '' : ' on');
        });
      });
      root.querySelector('#ftReset').addEventListener('click', function () {
        f = { prio: [], tags: [], status: 'todo', from: '', to: '', kw: '' };
        S.filters = f; closeModal(); refreshAll(); toast('筛选已重置');
      });
      root.querySelector('#ftCancel').addEventListener('click', closeModal);
      root.querySelector('#ftApply').addEventListener('click', function () {
        f.from = root.querySelector('#ftFrom').value;
        f.to = root.querySelector('#ftTo').value;
        f.kw = root.querySelector('#ftKw').value.trim();
        S.filters = f;
        closeModal();
        refreshAll();
        var n = activeFilterCount();
        toast(n ? '已应用 ' + n + ' 个筛选条件' : '筛选已清空');
      });
    }
  });
}

/* ---------- 提醒中心 ---------- */
function openReminderCenter() {
  var pend = pendingReminders();
  var upcoming = [];
  S.tasks.forEach(function (t) {
    var r = nextReminder(t);
    if (r && !r.overdue && r.at - Date.now() < 86400000) upcoming.push({ task: t, r: r });
  });
  upcoming.sort(function (a, b) { return a.r.at - b.r.at; });
  var bodyHtml = '';
  if (!pend.length && !upcoming.length) {
    bodyHtml = '<div style="text-align:center;padding:22px 0;color:var(--text-3);font-size:12.5px">暂时没有待复习的提醒</div>';
  } else {
    if (pend.length) {
      bodyHtml += '<div class="sec-head" style="margin-top:0"><h3 style="color:var(--red)">待复习 / 已到期</h3><span class="meta">' + pend.length + ' 条</span><span class="line"></span></div>';
      bodyHtml += pend.map(function (it) {
        var stage = ebStageName(it.r.offset);
        return '<div style="display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:9px;background:var(--red-soft);margin-bottom:5px">' +
          '<span style="font-size:10.5px;font-weight:700;color:var(--red);white-space:nowrap">' + esc(stage) + '</span>' +
          '<span style="flex:1;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(it.task.title) + '</span>' +
          '<button class="btn btn-sm btn-sec" data-rack="' + esc(it.task.id) + '|' + it.r.idx + '">知道了</button>' +
          '<button class="btn btn-sm btn-pri" data-rdone="' + esc(it.task.id) + '">完成</button></div>';
      }).join('');
    }
    if (upcoming.length) {
      bodyHtml += '<div class="sec-head"><h3>24 小时内</h3><span class="meta">' + upcoming.length + ' 条</span><span class="line"></span></div>';
      bodyHtml += upcoming.slice(0, 12).map(function (it) {
        var d = new Date(it.r.at);
        return '<div style="display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:9px;background:var(--purple-soft);margin-bottom:5px">' +
          '<span style="font-size:10.5px;font-weight:700;color:var(--purple);white-space:nowrap">' + esc(ebStageName(it.r.offset)) + '</span>' +
          '<span style="flex:1;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(it.task.title) + '</span>' +
          '<span style="font-size:11px;color:var(--text-3);white-space:nowrap">' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + '</span></div>';
      }).join('');
    }
  }
  openModal('<div class="modal">' +
    '<div class="m-head"><h3>提醒中心</h3><button class="m-close">' + svgIcon('close') + '</button></div>' +
    '<div class="m-body">' + bodyHtml + '</div>' +
    '<div class="m-foot"><div style="font-size:11px;color:var(--text-3)">艾宾浩斯提醒会按 5 分钟 → 30 分钟 → 12 小时 → 1/2/4/7/15 天递增推送</div></div></div>', {
    onMount: function (root) {
      root.addEventListener('click', function (e) {
        var ack = e.target.closest('[data-rack]');
        if (ack) {
          var parts = ack.getAttribute('data-rack').split('|');
          var t = findTask(parts[0]);
          if (t && t.remindCfg) {
            t.remindCfg.read = t.remindCfg.read || [];
            t.remindCfg.read.push(parseInt(parts[1], 10));
            cacheLocal(); apiUpdateTask(t, ['提醒设置']); closeModal(); refreshAll();
            toast('已标记为已读');
          }
          return;
        }
        var dn = e.target.closest('[data-rdone]');
        if (dn) { var id = dn.getAttribute('data-rdone'); closeModal(); toggleDone(id); }
      });
    }
  });
}
function ebStageName(off) {
  if (off === 0) return '准时';
  if (off < 60) return off + ' 分钟';
  if (off < 1440) return Math.round(off / 60) + ' 小时';
  return Math.round(off / 1440) + ' 天';
}
/* ---------- 习惯编辑器 ---------- */
var HABIT_ICONS = ['sun', 'book', 'fire', 'heart', 'coffee', 'target', 'moon', 'star'];
function openHabitEditor(id) {
  var h = id ? findHabit(id) : null;
  var isNew = !h;
  if (isNew) h = { id: '', name: '', icon: 'target', color: '#177CB0', target: 7, streak: 0, total: 0, log: [], createdAt: ymd(today0()) };
  var sel = { icon: h.icon, color: h.color };
  function iconHtml() {
    return HABIT_ICONS.map(function (k) {
      return '<button class="chip-p' + (sel.icon === k ? ' on' : '') + '" data-hi="' + k + '" style="width:42px;height:38px;padding:0;display:flex;align-items:center;justify-content:center">' + svgIcon(k) + '</button>';
    }).join('');
  }
  openModal('<div class="modal">' +
    '<div class="m-head"><h3>' + (isNew ? '新建习惯' : '编辑习惯') + '</h3><button class="m-close">' + svgIcon('close') + '</button></div>' +
    '<div class="m-body">' +
    '<div class="field"><label>习惯名称</label><input class="inp" id="hbName" autofocus value="' + esc(h.name) + '" placeholder="例：早起 6:30 / 阅读 30 分钟"></div>' +
    '<div class="field"><label>图标</label><div class="chip-pick" id="hbIcons">' + iconHtml() + '</div></div>' +
    '<div class="field"><label>颜色</label><div style="display:flex;gap:9px;flex-wrap:wrap" id="hbColors">' + colorSwatches(sel.color, 'data-hc') + '</div></div>' +
    '<div class="field"><label>每周目标<span class="hint">天 / 周</span></label>' +
    '<div class="chip-pick" id="hbTarget">' + [1, 2, 3, 4, 5, 6, 7].map(function (n) {
      return '<button class="chip-p' + (h.target === n ? ' on' : '') + '" data-ht="' + n + '">' + n + ' 天</button>';
    }).join('') + '</div></div>' +
    '</div>' +
    '<div class="m-foot">' + (isNew ? '' : '<button class="btn btn-danger btn-sm" id="hbDel">删除</button>') +
    '<div class="spacer"></div><button class="btn btn-sec" id="hbCancel">取消</button>' +
    '<button class="btn btn-pri" id="hbSave">' + (isNew ? '创建习惯' : '保存') + '</button></div></div>', {
    onMount: function (root) {
      var target = h.target;
      Array.prototype.forEach.call(root.querySelectorAll('[data-hi]'), function (b) {
        b.addEventListener('click', function () {
          sel.icon = b.getAttribute('data-hi');
          root.querySelector('#hbIcons').innerHTML = iconHtml();
          bindIcons();
        });
      });
      function bindIcons() {
        Array.prototype.forEach.call(root.querySelectorAll('[data-hi]'), function (b) {
          b.addEventListener('click', function () {
            sel.icon = b.getAttribute('data-hi');
            root.querySelector('#hbIcons').innerHTML = iconHtml();
            bindIcons();
          });
        });
      }
      bindIcons();
      Array.prototype.forEach.call(root.querySelectorAll('[data-hc]'), function (b) {
        b.addEventListener('click', function () {
          sel.color = b.getAttribute('data-hc');
          root.querySelector('#hbColors').innerHTML = colorHtml();
          bindColors();
        });
      });
      function bindColors() {
        Array.prototype.forEach.call(root.querySelectorAll('[data-hc]'), function (b) {
          b.addEventListener('click', function () {
            sel.color = b.getAttribute('data-hc');
            root.querySelector('#hbColors').innerHTML = colorHtml();
            bindColors();
          });
        });
      }
      bindColors();
      Array.prototype.forEach.call(root.querySelectorAll('[data-ht]'), function (b) {
        b.addEventListener('click', function () {
          target = parseInt(b.getAttribute('data-ht'), 10);
          Array.prototype.forEach.call(root.querySelectorAll('[data-ht]'), function (x) { x.className = 'chip-p'; });
          b.className = 'chip-p on';
        });
      });
      root.querySelector('#hbCancel').addEventListener('click', closeModal);
      var del = root.querySelector('#hbDel');
      if (del) del.addEventListener('click', function () {
        confirmModal('删除习惯', '删除后所有打卡记录都会消失，确定吗？', '删除', function () {
          S.habits = S.habits.filter(function (x) { return x.id !== h.id; });
          cacheLocal(); refreshAll(); apiDeleteHabit(h.id); toast('已删除');
        }, true);
      });
      root.querySelector('#hbSave').addEventListener('click', function () {
        var nm = (root.querySelector('#hbName').value || '').trim();
        if (!nm) { toast('给习惯起个名字'); return; }
        h.name = nm; h.icon = sel.icon; h.color = sel.color; h.target = target;
        if (isNew) {
          h.id = uid();
          h.createdAt = ymd(today0());
          S.habits.push(h);
          closeModal(); cacheLocal(); refreshAll();
          apiSaveHabit(h).then(function () { cacheLocal(); refreshAll(); toast('习惯已创建'); });
        } else {
          closeModal(); cacheLocal(); refreshAll();
          apiSaveHabit(h).then(function () { toast('已保存'); });
        }
      });
    }
  });
}

/* ---------- 纪念日编辑器 ---------- */
function openCountdownEditor(id) {
  var c = null;
  if (id) {
    c = S.countdowns.filter(function (x) { return x.id === id; })[0];
    if (!c && String(id).indexOf('sys:') === 0) {
      var sy = String(id).slice(4);
      c = S.countdowns.filter(function (x) { return x.sys === sy; })[0];
    }
  }
  var isNew = !c;
  if (isNew) c = { id: '', name: '', type: '倒数日', date: ymd(addDays(today0(), 30)), note: '', color: '#177CB0', createdAt: ymd(today0()) };
  var sel = { type: c.type, color: c.color };
  openModal('<div class="modal">' +
    '<div class="m-head"><h3>' + (isNew ? '添加纪念日' : '编辑纪念日') + '</h3><button class="m-close">' + svgIcon('close') + '</button></div>' +
    '<div class="m-body">' +
    (c.sys ? '<div class="banner" style="background:var(--red-soft);border-color:#F0CFCB;color:#A61F23;margin:0">' +
      svgIcon('alert') + '<span>系统项：日期由假期接口每天自动更新，不能删除，也不能改日期。</span></div>' : '') +
    '<div class="field"><label>名称</label><input class="inp" id="cdName" autofocus value="' + esc(c.name) + '" placeholder="例：项目上线日 / 结婚纪念日"' + (c.sys ? ' disabled' : '') + '></div>' +
    '<div class="field"><label>类型</label><div class="seg" id="cdType">' +
    ['倒数日', '纪念日', '生日'].map(function (t) {
      return '<button data-cdt="' + t + '" class="' + (c.type === t ? 'on' : '') + '">' + t + '</button>';
    }).join('') + '</div>' +
    '<div class="hint">倒数日只算一次；纪念日 / 生日每年自动循环</div></div>' +
    '<div class="field"><label>日期</label><input class="inp" type="date" id="cdDate" value="' + esc(c.date) + '"' + (c.sys ? ' disabled' : '') + '></div>' +
    '<div class="field"><label>分组<span class="hint">同类日子放一起，标题可拖动排序</span></label>' +
    '<input class="inp" id="cdGroup" value="' + esc(c.group || '') + '" placeholder="假期 / 生日 / 纪念日 / 旅行">' +
    '<div class="chip-pick" id="cdGroupPick">' + ['假期', '生日', '纪念日', '旅行', '目标', '其他'].map(function (g) {
      return '<button class="chip-p' + (cdGroupOf(c) === g ? ' on' : '') + '" data-cdg="' + g + '">' + g + '</button>';
    }).join('') + '</div></div>' +
    '<div class="field"><label>备注</label><input class="inp" id="cdNote" value="' + esc(c.note) + '" placeholder="可选"></div>' +
    '<div class="field"><label>颜色</label><div style="display:flex;gap:9px;flex-wrap:wrap" id="cdColors">' + colorSwatches(sel.color, 'data-cdc') + '</div></div>' +
    '</div><div class="m-foot">' + (isNew || c.sys ? '' : '<button class="btn btn-danger btn-sm" id="cdDel">删除</button>') +
    '<div class="spacer"></div><button class="btn btn-sec" id="cdCancel">取消</button>' +
    '<button class="btn btn-pri" id="cdSave">' + (isNew ? '添加' : '保存') + '</button></div></div>', {
    onMount: function (root) {
      Array.prototype.forEach.call(root.querySelectorAll('[data-cdt]'), function (b) {
        b.addEventListener('click', function () {
          sel.type = b.getAttribute('data-cdt');
          Array.prototype.forEach.call(root.querySelectorAll('[data-cdt]'), function (x) { x.className = ''; });
          b.className = 'on';
        });
      });
      function bindColors() {
        Array.prototype.forEach.call(root.querySelectorAll('[data-cdc]'), function (b) {
          b.addEventListener('click', function () {
            sel.color = b.getAttribute('data-cdc');
            root.querySelector('#cdColors').innerHTML = colorHtml();
            bindColors();
          });
        });
      }
      bindColors();
      var gInp = root.querySelector('#cdGroup');
      Array.prototype.forEach.call(root.querySelectorAll('[data-cdg]'), function (b) {
        b.addEventListener('click', function () {
          gInp.value = b.getAttribute('data-cdg');
          Array.prototype.forEach.call(root.querySelectorAll('[data-cdg]'), function (x) { x.className = 'chip-p'; });
          b.className = 'chip-p on';
        });
      });
      root.querySelector('#cdCancel').addEventListener('click', closeModal);
      var del = root.querySelector('#cdDel');
      if (del) del.addEventListener('click', function () {
        confirmModal('删除纪念日', '确定删除「' + esc(c.name) + '」？', '删除', function () {
          S.countdowns = S.countdowns.filter(function (x) { return x.id !== c.id; });
          cacheLocal(); refreshAll(); apiDeleteCountdown(c.id); toast('已删除');
        }, true);
      });
      root.querySelector('#cdSave').addEventListener('click', function () {
        var nm = (root.querySelector('#cdName').value || '').trim();
        var dv = root.querySelector('#cdDate').value;
        if (!nm) { toast('写个名字'); return; }
        if (!dv) { toast('选一个日期'); return; }
        if (!c.sys) { c.name = nm; c.type = sel.type; c.date = dv; }
        c.color = sel.color;
        c.group = (root.querySelector('#cdGroup').value || '').trim();
        c.note = (root.querySelector('#cdNote').value || '').trim();
        if (isNew) {
          c.id = uid(); c.createdAt = ymd(today0());
          S.countdowns.push(c);
          closeModal(); cacheLocal(); refreshAll();
          apiSaveCountdown(c).then(function () { cacheLocal(); refreshAll(); toast('已添加'); });
        } else {
          closeModal(); cacheLocal(); refreshAll();
          apiSaveCountdown(c).then(function () { toast('已保存'); });
        }
      });
    }
  });
}

/* ---------- 备份与导出 ---------- */
function downloadBlob(name, content, mime) {
  try {
    var blob = new Blob([content], { type: (mime || 'application/json') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 300);
    return true;
  } catch (e) { toast('导出失败，请换个浏览器试试'); return false; }
}
function exportJson() {
  var data = {
    app: 'schedule-desk', version: 1, exportedAt: new Date().toISOString(),
    tasks: S.tasks, habits: S.habits, countdowns: S.countdowns, pomodoros: S.pomodoros
  };
  if (downloadBlob('日程台备份-' + ymd(today0()) + '.json', JSON.stringify(data, null, 2))) {
    toast('已导出 ' + S.tasks.length + ' 个任务 · ' + S.habits.length + ' 个习惯');
  }
}
function exportCsv() {
  var head = ['标题', '清单', '标签', '优先级', '重要', '紧急', '已完成', '日期', '时间', '预计时长(分钟)', '完成时间', '重复', '备注'];
  var rows = S.tasks.map(function (t) {
    return [t.title, t.list, t.tags.join(' '), t.prio, t.important ? '是' : '否', t.urgent ? '是' : '否',
      t.done ? '是' : '否', t.date, t.time, t.estimate, t.doneAt, t.repeat || '', t.note].map(function (v) {
        var s = String(v === null || v === undefined ? '' : v).replace(/"/g, '""');
        return '"' + s + '"';
      }).join(',');
  });
  var csv = '\ufeff' + head.join(',') + '\n' + rows.join('\n');
  if (downloadBlob('日程台任务-' + ymd(today0()) + '.csv', csv, 'text/csv')) toast('已导出 CSV');
}
function parseBackupText(text) {
  var o = JSON.parse(String(text));
  if (!o || typeof o !== 'object') throw new Error('bad');
  return {
    tasks: o.tasks || [], habits: o.habits || [],
    countdowns: o.countdowns || [], pomodoros: o.pomodoros || []
  };
}
function importCount(d) {
  return d.tasks.length + d.habits.length + d.countdowns.length + d.pomodoros.length;
}
function normSubsInput(v) {
  if (!v) return [];
  if (Object.prototype.toString.call(v) === '[object Array]') {
    return v.map(function (x, i) {
      return {
        id: 's' + i,
        title: String(x.t || x.title || ''),
        min: Number(x.m || x.min) || 0,
        done: !!(x.d || x.done)
      };
    }).filter(function (x) { return !!x.title; });
  }
  return unpackSubs(v);
}
function applyBackup(data) {
  var queue = [];
  data.tasks.forEach(function (x) {
    var t = {
      id: '', title: x.title || '未命名', note: x.note || '', list: x.list || '收集箱',
      tags: x.tags || [], prio: x.prio || '', important: !!x.important, urgent: !!x.urgent,
      done: !!x.done, remindMode: x.remindMode || '不提醒', remindCfg: x.remindCfg || null,
      date: x.date || '', time: x.time || '', estimate: x.estimate || 0,
      subs: normSubsInput(x.subs || x['拆分']),
      repeat: x.repeat || x['重复'] || '',
      doneAt: x.doneAt || '', sort: x.sort || 0, createdAt: x.createdAt || ymd(today0())
    };
    (t.tags || []).forEach(function (g) { addCustomTag(g); });
    if (t.list && t.list !== '收集箱') addCustomList(t.list);
    queue.push(function () { S.tasks.push(t); return apiAddTask(t); });
  });
  data.habits.forEach(function (x) {
    var h = {
      id: '', name: x.name || '习惯', icon: x.icon || 'target', color: x.color || '#177CB0',
      target: x.target || 7, streak: x.streak || 0, total: x.total || 0,
      log: x.log || [], createdAt: x.createdAt || ymd(today0())
    };
    queue.push(function () { S.habits.push(h); return apiSaveHabit(h); });
  });
  data.countdowns.forEach(function (x) {
    var c = {
      id: '', name: x.name || '纪念日', type: x.type || '倒数日', date: x.date || '',
      note: x.note || '', color: x.color || '#177CB0', createdAt: x.createdAt || ymd(today0())
    };
    queue.push(function () { S.countdowns.push(c); return apiSaveCountdown(c); });
  });
  data.pomodoros.forEach(function (x) {
    var p = {
      id: '', task: x.task || '', type: x.type || '专注', duration: x.duration || 0,
      start: x.start || '', date: x.date || ''
    };
    queue.push(function () { S.pomodoros.push(p); return apiAddPomo(p); });
  });
  var i = 0, total = queue.length;
  if (!total) { toast('没有可导入的数据'); return; }
  toast('开始导入 ' + total + ' 条数据…');
  function step() {
    if (i >= total) {
      cacheLocal(); refreshAll();
      toast('导入完成：' + total + ' 条数据');
      return;
    }
    var fn = queue[i++];
    fn().then(function () {
      if (i % 10 === 0) toast('正在导入 ' + i + ' / ' + total);
      step();
    }).catch(function (e) { console.error('导入单条失败:', e); step(); });
  }
  step();
}
function openImport() {
  var pending = null;
  var html = '<div class="modal">' +
    '<div class="m-head"><h3>导入数据</h3><button class="m-close">' + svgIcon('close') + '</button></div>' +
    '<div class="m-body">' +
    '<div class="banner" style="background:var(--brand-softer);border-color:#dbe6ff;color:var(--brand-2);margin:0">' +
    svgIcon('bulb') + '<span>导入是「追加」模式，不会覆盖现有数据。支持本工作台导出的 JSON 备份。</span></div>' +
    '<label class="file-drop" id="impDrop" for="impFile">' + svgIcon('upload') +
    '<b>点击选择备份文件</b><span>或把 .json 文件拖到这里</span></label>' +
    '<input type="file" id="impFile" accept=".json,application/json" class="file-input">' +
    '<div class="field"><label>或者粘贴备份内容</label>' +
    '<textarea class="inp" id="impText" placeholder="把备份文件里的内容整段粘贴到这里也可以" style="min-height:86px;font-size:12px"></textarea></div>' +
    '<div class="imp-info" id="impInfo"></div>' +
    '</div>' +
    '<div class="m-foot"><div class="spacer"></div>' +
    '<button class="btn btn-sec" id="impCancel">取消</button>' +
    '<button class="btn btn-pri" id="impOk" disabled>确认导入</button>' +
    '</div></div>';
  openModal(html, {
    onMount: function (root) {
      var info = root.querySelector('#impInfo');
      var okBtn = root.querySelector('#impOk');
      var drop = root.querySelector('#impDrop');
      var fileIn = root.querySelector('#impFile');
      var textIn = root.querySelector('#impText');
      function reset(msg) {
        pending = null;
        okBtn.disabled = true;
        okBtn.style.opacity = '.5';
        info.innerHTML = msg ? '<span class="warn">' + msg + '</span>' : '';
      }
      function setPending(data, from) {
        var n = importCount(data);
        if (!n) { reset('这个文件里没有可导入的数据（任务 / 习惯 / 纪念日 / 专注记录都是空的）。'); return; }
        pending = data;
        okBtn.disabled = false;
        okBtn.style.opacity = 1;
        info.innerHTML = '已识别（' + esc(from) + '）：任务 <b>' + data.tasks.length + '</b> · 习惯 <b>' +
          data.habits.length + '</b> · 纪念日 <b>' + data.countdowns.length + '</b> · 专注记录 <b>' +
          data.pomodoros.length + '</b><br>确认后会追加到现有数据末尾，已有数据不受影响。';
      }
      function readFile(f) {
        if (!f) return;
        var rd = new FileReader();
        rd.onload = function () {
          try { setPending(parseBackupText(rd.result), f.name); }
          catch (e) { console.error('解析失败:', e); reset('这个文件不是有效的 JSON 备份，请选择本工作台导出的 .json 文件。'); }
        };
        rd.onerror = function () { reset('文件读取失败，换一个文件试试。'); };
        rd.readAsText(f);
      }
      fileIn.addEventListener('change', function (e) { readFile(e.target.files && e.target.files[0]); });
      ['dragenter', 'dragover'].forEach(function (ev) {
        drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); });
      });
      ['dragleave', 'drop'].forEach(function (ev) {
        drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); });
      });
      drop.addEventListener('drop', function (e) {
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) readFile(f);
      });
      textIn.addEventListener('input', function () {
        var v = textIn.value.trim();
        if (!v) { reset(''); return; }
        try { setPending(parseBackupText(v), '粘贴内容'); }
        catch (e) { reset('内容还不是完整的 JSON，可能没复制全。'); }
      });
      root.querySelector('#impCancel').addEventListener('click', closeModal);
      okBtn.addEventListener('click', function () {
        if (!pending) return;
        var data = pending;
        closeModal();
        applyBackup(data);
      });
    }
  });
}
function openBackup() {
  openModal('<div class="modal">' +
    '<div class="m-head"><h3>数据备份</h3><button class="m-close">' + svgIcon('close') + '</button></div>' +
    '<div class="m-body">' +
    '<div class="banner" style="background:var(--green-soft);border-color:var(--green);color:var(--text);margin:0">' +
    svgIcon('check') + '<span>数据已存在资料库在线表格中，换设备登录同一账号即可看到。建议每月额外导出一份 JSON 本地留底。</span></div>' +
    '<div class="field"><label>当前数据</label><div style="font-size:12.5px;color:var(--text-2);line-height:1.9">' +
    '任务 <b>' + S.tasks.length + '</b> 条 · 习惯 <b>' + S.habits.length + '</b> 个 · 纪念日 <b>' + S.countdowns.length + '</b> 个 · 专注记录 <b>' + S.pomodoros.length + '</b> 条</div></div>' +
    '<div style="display:flex;flex-direction:column;gap:8px">' +
    '<button class="btn btn-pri" id="bkExportJson" style="justify-content:flex-start;height:44px">' + svgIcon('download') + ' 导出 JSON 完整备份</button>' +
    '<button class="btn btn-sec" id="bkExportCsv" style="justify-content:flex-start;height:44px">' + svgIcon('download') + ' 导出任务 CSV（Excel 可打开）</button>' +
    '<button class="btn btn-sec" id="bkImport" style="justify-content:flex-start;height:44px">' + svgIcon('upload') + ' 导入备份 / 从文件恢复</button>' +
    '<button class="btn btn-sec" id="bkRestore" style="justify-content:flex-start;height:44px">' + svgIcon('refresh') + ' 恢复上次快照</button>' +
    '<button class="btn btn-sec" id="bkReseed" style="justify-content:flex-start;height:44px">' + svgIcon('refresh') + ' 重新生成示例数据</button>' +
    '<button class="btn btn-danger" id="bkClear" style="justify-content:flex-start;height:44px">' + svgIcon('trash') + ' 清空全部任务</button>' +
    '</div>' +
    '</div><div class="m-foot"><div style="font-size:11px;color:var(--text-3)">导出为完整备份，导入时逐条追加，可与旧备份合并</div></div></div>', {
    onMount: function (root) {
      root.querySelector('#bkExportJson').addEventListener('click', exportJson);
      root.querySelector('#bkExportCsv').addEventListener('click', exportCsv);
      root.querySelector('#bkImport').addEventListener('click', function () {
        closeModal();
        setTimeout(openImport, 200);
      });
      var snapBtn = root.querySelector('#bkRestore');
      if (snapBtn) {
        var snap = readSnapshot();
        if (!snap) { snapBtn.disabled = true; snapBtn.style.opacity = .5; snapBtn.title = '还没有快照'; }
        else {
          var dt = new Date(snap.at);
          snapBtn.innerHTML = svgIcon('refresh') + ' 恢复上次快照（' + (dt.getMonth() + 1) + '/' + dt.getDate() +
            ' ' + pad2(dt.getHours()) + ':' + pad2(dt.getMinutes()) + '，' + (snap.tasks || []).length + ' 条任务）';
        }
        snapBtn.addEventListener('click', function () {
          var sn = readSnapshot();
          if (!sn) return;
          confirmModal('恢复快照', '会用快照里的 ' + (sn.tasks || []).length + ' 条任务覆盖当前任务（当前 ' + S.tasks.length + ' 条）。', '恢复', function () {
            S.tasks = sn.tasks || [];
            S.habits = sn.habits || S.habits;
            S.countdowns = sn.countdowns || S.countdowns;
            cacheLocal(); refreshAll();
            toast('已恢复快照');
          });
        });
      }
      root.querySelector('#bkReseed').addEventListener('click', function () {
        confirmModal('重新生成示例数据', '会再写入一批示例任务（不影响已有数据）。确定吗？', '生成', function () {
          closeModal();
          setTimeout(function () { seedDemo(); }, 200);
          toast('正在写入示例数据…');
        });
      });
      root.querySelector('#bkClear').addEventListener('click', function () {
        takeSnapshot('清空任务前');
        typedConfirm('清空全部任务', '这会删除 <b>' + S.tasks.length + '</b> 条任务，且无法撤销。<br>删除前已在本机留了一份快照，可在「数据备份」里恢复。', '清空', function () {
          Promise.all(S.tasks.map(function (t) { return apiDeleteTask(t.id); })).then(function () {
            S.tasks = []; markSeeded(); cacheLocal(); refreshAll(); toast('已清空');
          });
        }, true);
      });
    }
  });
}
function openSettings() {
  openModal('<div class="modal settings">' +
    '<div class="m-head"><h3>设置</h3><button class="m-close">' + svgIcon('close') + '</button></div>' +
    '<div class="m-body">' +
    '<div class="field"><label>数据存储</label><div style="font-size:13.5px;color:var(--text-2);line-height:1.85">' +
    '工作台数据保存在你的资料库在线表格（4 张表：日程任务 / 习惯打卡 / 倒数纪念日 / 专注记录）。<br>' +
    '本机同时保留一份缓存，断网时可继续查看和操作。' +
    '</div></div>' +
    '<div class="field"><label>同步状态</label><div style="font-size:13.5px;color:var(--text-2)" id="stSync">' +
    (S.online ? '已连接资料库，数据实时同步' : '当前为离线模式，改动会在恢复后需要手动刷新') + '</div></div>' +
    '<div class="field"><label>本地快照<span class="hint">每天首次打开自动存一份，保留 7 天</span></label>' +
    '<div id="stSnaps" style="display:flex;flex-direction:column;gap:7px">' + dailySnapHtml() + '</div></div>' +
    '<div class="field"><label>艾宾浩斯提醒</label><div style="font-size:13.5px;color:var(--text-2);line-height:1.85">' +
    '在任务里开启「艾宾浩斯」后，会按 5 分钟 → 30 分钟 → 12 小时 → 1 / 2 / 4 / 7 / 15 天递增安排复习提醒。' +
    '提醒出现在顶部铃铛和「今天要处理」区域，不依赖浏览器通知权限。' +
    '</div></div>' +
    '<div class="field"><label>外观<span class="hint">选一套配色，立即生效，重新打开也记得</span></label>' +
    '<div class="theme-chips" id="stTheme">' + THEMES.map(function (t) {
      return '<button class="theme-chip' + (currentTheme() === t.k ? ' on' : '') + '" data-ththeme="' + t.k + '">' +
        themeDots(t) + t.name + '</button>';
    }).join('') + '</div></div>' +
    '<div class="field"><label>引用与致谢<span class="hint">外部依赖逐项登记</span></label>' +
    '<div style="font-size:13.5px;color:var(--text-2);line-height:1.955">' +
    '· <b>图标</b>：全部内联 SVG 手写，未使用图标库<br>' +
    '· <b>图表</b>：手写 SVG / CSS 绘制，未使用图表库<br>' +
    '· <b>数据存储</b>：WorkBuddy 资料库在线数据表（4 张表）<br>' +
    '· <b>配色</b>：中国传统色 —— 靛青 #177CB0（主色）、朱砂 #C3272B、杏黄 #C8892B、竹青 #5E8C6A、绛紫 #7A4E63、石青 #1685A9、宣纸 #F7F3EA（底）、玄色 #2A2925（字）；色名与色值参照 sealuo.com/category/all 传统色卡整理<br>' +
    '· <b>字体</b>：霞鹜文楷 GB — LXGW WenKai GB，作者 LXGW，SIL Open Font License 1.1；经 jsDelivr CDN 分片加载（lxgw-wenkai-gb-web），加载失败自动回落到系统字体<br>' +
    '· <b>节假日数据</b>：holiday.ailcc.com 公开接口（GET /api/holiday/next/{date}），仅取「下一个法定节假日」，每日缓存 6 小时；接口不可用时用内置的固定日期表兜底，并标注「预估」' +
    '</div></div>' +
    '<div class="field"><label>单网页做不到的事</label><div style="font-size:13.5px;color:var(--text-2);line-height:1.95">' +
    '· 系统级推送通知：页面在 iframe 里无法注册 Service Worker，关掉页面就收不到提醒<br>' +
    '· 真正的离线可用：同理，没有 Service Worker 缓存<br>' +
    '· 桌面 / 锁屏小组件：系统能力，网页无入口<br>' +
    '· 多人实时协同：没有长连接，只能靠刷新；同一账号多端会互相覆盖<br>' +
    '· 假期数据准确性：第三方免费接口，限流 31 次/分钟，官方未公布次年安排时会用固定日期预估' +
    '</div></div>' +
    '<div class="field"><label>隐私</label><div style="font-size:13.5px;color:var(--text-2);line-height:1.85">' +
    '页面发布后链接可访问，但数据在你的资料库账号下，其他人打开看到的是空数据。' +
    '</div></div>' +
    '<div style="display:flex;flex-direction:column;gap:8px">' +
    '<button class="btn btn-sec" id="stReload" style="justify-content:flex-start;height:42px">' + svgIcon('refresh') + ' 重新从云端加载</button>' +
    '<button class="btn btn-danger" id="stClearAll" style="justify-content:flex-start;height:42px">' + svgIcon('trash') + ' 清空全部数据（含习惯 / 纪念日）</button>' +
    '</div></div>' +
    '<div class="m-foot"><div style="font-size:11px;color:var(--text-3)">日程台 ' + APP_VERSION + ' · 作者 workbuddy &amp; bjl1015 · 单文件工作台</div></div></div>', {
    onMount: function (root) {
      Array.prototype.forEach.call(root.querySelectorAll('[data-ththeme]'), function (b) {
        b.addEventListener('click', function () {
          setTheme(b.getAttribute('data-ththeme'));
          Array.prototype.forEach.call(root.querySelectorAll('[data-ththeme]'), function (x) {
            x.className = 'theme-chip' + (x.getAttribute('data-ththeme') === currentTheme() ? ' on' : '');
          });
        });
      });
      Array.prototype.forEach.call(root.querySelectorAll('[data-snaprestore]'), function (b) {
        b.addEventListener('click', function () {
          var day = b.getAttribute('data-snaprestore');
          closeModal();
          setTimeout(function () { restoreDailySnap(day); }, 220);
        });
      });
      root.querySelector('#stReload').addEventListener('click', function () {
        closeModal(); loadAll(); toast('正在重新加载…');
      });
      root.querySelector('#stClearAll').addEventListener('click', function () {
        takeSnapshot('清空全部数据前');
        typedConfirm('清空全部数据', '会删除所有任务、习惯、纪念日（专注记录保留），且无法撤销。<br>删除前已在本机留了一份快照。', '全部清空', function () {
          var jobs = [];
          S.tasks.forEach(function (t) { jobs.push(apiDeleteTask(t.id)); });
          S.habits.forEach(function (h) { jobs.push(apiDeleteHabit(h.id)); });
          S.countdowns.forEach(function (c) { jobs.push(apiDeleteCountdown(c.id)); });
          Promise.all(jobs).then(function () {
            S.tasks = []; S.habits = []; S.countdowns = []; S.pomodoros = [];
            markSeeded(); cacheLocal(); refreshAll(); toast('已全部清空');
          });
        }, true);
      });
    }
  });
}

/* ---------- 导航与事件 ---------- */
function goView(v) {
  S.view = v;
  S.selectedList = null;
  S.selectedTag = null;
  // 换视图回到第一屏
  S.listLimit = LIST_PAGE;
  S._listKey = '';
  if (v === 'calendar' && !S.cursor) S.cursor = today0();
  closeDrawer();
  refreshAll();
  var c = document.getElementById('content');
  if (c) c.scrollTop = 0;
}
function openDrawer() {
  var sb = document.getElementById('sidebar');
  var dm = document.getElementById('drawerMask');
  if (sb) sb.classList.add('open');
  if (dm) dm.classList.add('in');
  document.body.classList.add('drawer-open');
}
function closeDrawer() {
  var sb = document.getElementById('sidebar');
  var dm = document.getElementById('drawerMask');
  if (sb) sb.classList.remove('open');
  if (dm) dm.classList.remove('in');
  document.body.classList.remove('drawer-open');
}
function bindGlobalEvents() {
  var nav = document.getElementById('navMain');
  if (nav) nav.addEventListener('click', function (e) {
    var it = e.target.closest('[data-view]');
    if (it) goView(it.getAttribute('data-view'));
  });
  var tb = document.getElementById('tabbar');
  if (tb) tb.addEventListener('click', function (e) {
    var it = e.target.closest('[data-view]');
    if (it) goView(it.getAttribute('data-view'));
  });
  // 顶栏的列表 / 卡片 / 看板 / 时间线切换（按钮在 #content 外面，得单独绑）
  var vsw = document.querySelector('.view-switch');
  if (vsw) vsw.addEventListener('click', function (e) {
    var b = e.target.closest('[data-vmode]');
    if (!b) return;
    var want = b.getAttribute('data-vmode');
    if (S.vmode === want) return;
    S.vmode = want;
    S.listLimit = LIST_PAGE;
    Array.prototype.forEach.call(vsw.querySelectorAll('[data-vmode]'), function (x) {
      x.className = x.getAttribute('data-vmode') === want ? 'on' : '';
    });
    refreshAll();
  });
  var ln = document.getElementById('listNav');
  if (ln) ln.addEventListener('click', onSideListClick);
  var anv = document.getElementById('archivedNav');
  if (anv) anv.addEventListener('click', onSideListClick);
  function onSideListClick(e) {
    var mb = e.target.closest('[data-listmore]');
    if (mb) {
      e.stopPropagation(); e.preventDefault();
      var nm0 = mb.getAttribute('data-listmore');
      var items = [
        { label: '重命名清单', icon: 'edit', fn: function () { renameList(nm0); } }
      ];
      if (isArchived(nm0)) items.push({ label: '取消归档', icon: 'refresh', fn: function () { unarchiveList(nm0); } });
      else items.push({ label: '归档清单', icon: 'box', fn: function () { archiveList(nm0); } });
      items.push({ label: '删除清单', icon: 'trash', danger: true, fn: function () { removeList(nm0); } });
      openMiniMenu(mb, items);
      return;
    }
    var it = e.target.closest('[data-list]');
    if (!it) return;
    S.selectedList = it.getAttribute('data-list');
    S.selectedTag = null;
    if (S.view !== 'today' && S.view !== 'next7' && S.view !== 'inbox') S.view = 'today';
    closeDrawer(); refreshAll();
  }
  var tn = document.getElementById('tagNav');
  if (tn) tn.addEventListener('click', function (e) {
    var mb = e.target.closest('[data-tagmore]');
    if (mb) {
      e.stopPropagation(); e.preventDefault();
      var g0 = mb.getAttribute('data-tagmore');
      openMiniMenu(mb, [
        { label: '重命名标签', icon: 'edit', fn: function () { renameTag(g0); } },
        { label: '删除标签', icon: 'trash', danger: true, fn: function () { removeTag(g0); } }
      ]);
      return;
    }
    var it = e.target.closest('[data-tag]');
    if (!it) return;
    S.selectedTag = it.getAttribute('data-tag');
    S.selectedList = null;
    if (S.view !== 'today' && S.view !== 'next7' && S.view !== 'inbox') S.view = 'today';
    closeDrawer(); refreshAll();
  });
  var sw = document.getElementById('viewSwitch');
  if (sw) sw.addEventListener('click', function (e) {
    var b = e.target.closest('[data-vmode]');
    if (!b) return;
    S.vmode = b.getAttribute('data-vmode');
    refreshAll();
  });
  var qa = document.getElementById('btnQuickAdd');
  if (qa) qa.addEventListener('click', function () { closeDrawer(); openQuickAdd(''); });
  var fab = document.getElementById('btnFabAdd');
  if (fab) fab.addEventListener('click', function () { openQuickAdd(''); });
  var sbtn = document.getElementById('btnSort');
  if (sbtn) sbtn.addEventListener('click', function () {
    S.sortMode = (S.sortMode === 'manual') ? 'time' : 'manual';
    try { localStorage.setItem('wb_schedule_sort', S.sortMode); } catch (e) { }
    refreshAll();
    toast(S.sortMode === 'manual' ? '已切换为手动排序 · 按住任务可拖动' : '已恢复按时间排序');
  });
  var bf = document.getElementById('btnFilter');
  if (bf) bf.addEventListener('click', openFilter);
  var bt = document.getElementById('btnTheme');
  if (bt) bt.addEventListener('click', function () { openThemeMenu(bt); });
  var bs = document.getElementById('btnSearch');
  if (bs) bs.addEventListener('click', function () { openSearch(); });
  var bb = document.getElementById('btnBell');
  if (bb) bb.addEventListener('click', openReminderCenter);
  var bm = document.getElementById('btnMenu');
  if (bm) bm.addEventListener('click', openDrawer);
  var dm = document.getElementById('drawerMask');
  if (dm) dm.addEventListener('click', closeDrawer);
  var bk = document.getElementById('btnBackup');
  if (bk) bk.addEventListener('click', function () { openBackup(); closeDrawer(); });
  var st = document.getElementById('btnSettings');
  if (st) st.addEventListener('click', function () { openSettings(); closeDrawer(); });
  var al = document.getElementById('btnAddList');
  if (al) al.addEventListener('click', function () {
    closeDrawer();
    promptModal('新建清单', '给这一类日程起个名字，比如「工作」「健身」「论文」。', '', '清单名称', function (name) {
      var nm = addCustomList(name);
      S.selectedList = nm;
      S.selectedTag = null;
      refreshAll();
      toast('已创建清单「' + nm + '」');
    });
  });
  var at = document.getElementById('btnAddTag');
  if (at) at.addEventListener('click', function () {
    closeDrawer();
    promptModal('新建标签', '标签可以跨清单使用，比如「会议」「阅读」。', '', '标签名（不含 #）', function (name) {
      var nm = addCustomTag(name);
      S.selectedTag = nm;
      S.selectedList = null;
      refreshAll();
      toast('已创建标签「#' + nm + '」');
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeModal(); closeDrawer(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openQuickAdd(''); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'n') { e.preventDefault(); openQuickAdd(''); }
  });
  window.addEventListener('resize', function () {
    var bm2 = document.getElementById('btnMenu');
    if (bm2) bm2.style.display = window.innerWidth <= 860 ? '' : 'none';
    var wrap2 = document.querySelector('#modalRoot .modal-mask');
    if (wrap2) applyModalMode(wrap2);
  });
  var bm3 = document.getElementById('btnMenu');
  if (bm3) bm3.style.display = window.innerWidth <= 860 ? '' : 'none';
  enableSideDrag(document.getElementById('listNav'), 'wb_schedule_list_order');
  enableSideDrag(document.getElementById('tagNav'), 'wb_schedule_tag_order');
}

/* ---------- 启动 ---------- */
function watchMainWidth() {
  var el = document.querySelector('.main');
  if (!el) return;
  function apply() {
    var w = el.getBoundingClientRect().width;
    el.classList.toggle('condensed', w < 860);
    el.classList.toggle('tight', w < 700);
  }
  apply();
  if (window.ResizeObserver) {
    new ResizeObserver(apply).observe(el);
  } else {
    window.addEventListener('resize', apply);
  }
}
/* ---------- 每日自动快照 ---------- */
var DAILY_KEY = 'wb_schedule_daily';
function readDailySnaps() {
  try { return JSON.parse(localStorage.getItem(DAILY_KEY) || '[]') || []; } catch (e) { return []; }
}
function autoSnapshotDaily() {
  try {
    var day = ymd(today0());
    var arr = readDailySnaps();
    if (arr.some(function (x) { return x.day === day; })) return;
    if (!S.tasks.length && !S.habits.length && !S.countdowns.length) return;
    arr.push({ day: day, at: Date.now(), tasks: S.tasks, habits: S.habits, countdowns: S.countdowns });
    // 只留最近 7 份，避免把 localStorage 撑爆
    if (arr.length > 7) arr = arr.slice(arr.length - 7);
    localStorage.setItem(DAILY_KEY, JSON.stringify(arr));
  } catch (e) { }
}
function dailySnapHtml() {
  var arr = readDailySnaps();
  if (!arr.length) {
    return '<div style="font-size:13px;color:var(--text-3)">还没有快照，明天首次打开时会自动生成一份。</div>';
  }
  return arr.slice().reverse().map(function (x) {
    var n = (x.tasks || []).length, h = (x.habits || []).length, c = (x.countdowns || []).length;
    return '<div style="display:flex;align-items:center;gap:10px;font-size:13px">' +
      '<span style="flex:1;color:var(--text-2)">' + x.day + ' · ' + n + ' 条日程 / ' + h + ' 个习惯 / ' + c + ' 个纪念日</span>' +
      '<button class="btn btn-sm btn-sec" data-snaprestore="' + x.day + '">恢复</button></div>';
  }).join('');
}
function restoreDailySnap(day) {
  var arr = readDailySnaps();
  var hit = arr.filter(function (x) { return x.day === day; })[0];
  if (!hit) { toast('这份快照已经不在了'); return; }
  typedConfirm('恢复 ' + day + ' 的快照',
    '会用 ' + day + ' 当天的数据覆盖现在的 ' + S.tasks.length + ' 条日程、' + S.habits.length + ' 个习惯、' + S.countdowns.length + ' 个纪念日。当前数据会先存一份快照。',
    '恢复', function () {
      takeSnapshot('恢复每日快照前');
      S.tasks = hit.tasks || [];
      S.habits = hit.habits || [];
      S.countdowns = hit.countdowns || [];
      flushCache();
      refreshAll();
      toast('已恢复到 ' + day);
    });
}

/* ---------- 全局快捷键 ---------- */
var VIEW_KEYS = { '1': 'today', '2': 'calendar', '3': 'quadrant', '4': 'habit', '5': 'countdown', '6': 'focus', '7': 'stats' };
var KEY_HELP = [
  ['N', '新建日程'],
  ['/', '搜索'],
  ['T', '回到今天'],
  ['1 – 7', '切换 清单 / 日历 / 四象限 / 习惯 / 纪念日 / 番茄 / 统计'],
  ['Esc', '关闭弹窗或侧栏'],
  ['?', '打开这份快捷键表']
];
function openShortcuts() {
  openModal('<div class="modal sm shortcuts">' +
    '<div class="m-head"><h3>键盘快捷键</h3><button class="m-close">' + svgIcon('close') + '</button></div>' +
    '<div class="m-body">' + KEY_HELP.map(function (r) {
      return '<div class="sc-row"><kbd>' + r[0] + '</kbd><span>' + r[1] + '</span></div>';
    }).join('') +
    '<div class="hint" style="margin-top:6px">在输入框里打字时不会触发这些快捷键。</div>' +
    '</div></div>');
}
function bindShortcuts() {
  document.addEventListener('keydown', function (e) {
    var t = e.target || {};
    var tag = String(t.tagName || '').toLowerCase();
    var typing = tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable;

    // Esc 任何时候都能关掉最上层
    if (e.key === 'Escape') {
      var top = document.querySelectorAll('.modal-mask.in');
      if (top.length) { closeModal(); e.preventDefault(); return; }
      if (document.body.classList.contains('drawer-open')) { closeDrawer(); return; }
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

    var hasModal = !!document.querySelector('.modal-mask.in');
    var k = e.key;

    if (k === '?') { e.preventDefault(); openShortcuts(); return; }
    if (hasModal) return;

    if (k === 'n' || k === 'N') { e.preventDefault(); openTaskEditor(null); return; }
    if (k === '/') { e.preventDefault(); openSearch(); return; }
    if (k === 't' || k === 'T') { e.preventDefault(); S.cursor = today0(); goView('today'); return; }
    if (VIEW_KEYS[k]) { e.preventDefault(); goView(VIEW_KEYS[k]); return; }
  });
}

function boot() {
  try { if (localStorage.getItem('wb_schedule_sort') === 'manual') S.sortMode = 'manual'; } catch (e) { }
  try {
    var pw = parseInt(localStorage.getItem('wb_schedule_panel_w') || '', 10);
    setPanelWidth(pw || 440);
  } catch (e) { setPanelWidth(440); }
  bindGlobalEvents();
  bindShortcuts();
  watchMainWidth();
  (function () {
    var th = THEMES.filter(function (x) { return x.k === currentTheme(); })[0] || THEMES[0];
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', th.bg);
  })();
  loadAll();
  var db = getDB();
  if (db && typeof db.onUpdated === 'function') {
    db.onUpdated(function (payload) {
      var ids = (payload && payload.databaseIds) || [];
      var mine = [DB_IDS.tasks, DB_IDS.habits, DB_IDS.countdowns, DB_IDS.pomodoros];
      var hit = ids.some(function (x) { return mine.indexOf(x) > -1; });
      if (!hit) return;
      clearTimeout(window.__updT);
      window.__updT = setTimeout(function () { loadAll(); }, 320);
    });
  }
  setTimeout(function () {
    if (!S.loaded) {
      var c = document.getElementById('content');
      if (c && c.querySelector('.empty')) {
        c.innerHTML = '<div class="empty"><div class="empty-ico">' + svgIcon('alert') + '</div>' +
          '<h4>暂时读不到云端数据</h4><p>可能是网络或登录状态问题。可以先点下面重试，或继续使用本机缓存。</p>' +
          '<button id="retryLoad">重新加载</button></div>';
        var r = document.getElementById('retryLoad');
        if (r) r.addEventListener('click', function () { S.loaded = false; loadAll(); });
      }
    }
  }, 9000);
}
document.addEventListener('DOMContentLoaded', boot);
