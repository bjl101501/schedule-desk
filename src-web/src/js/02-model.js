/* ---------- 02-model.js · 数据层 / 拆分与排期 / 示例数据 ---------- */
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
/* 子项是否逾期：过了排期最后一天还没勾才算（当天不算逾期） */
function subLate(seg, done) {
  if (done || !seg || !seg.end) return false;
  return dayDiff(today0(), seg.end) < 0;
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
      (subLate(seg, x.done) ? '<span class="sub-late">子项逾期</span>' : '') +
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
      (subLate(seg, x.done) ? '<span class="sub-late">子项逾期</span>' : '') +
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
  // 时间按当前时刻生成，避免晚上打开时示例全变成逾期
  var now = new Date();
  var nowMin = now.getHours() * 60 + now.getMinutes();
  function hmAgo(mins) {
    var v = Math.max(0, Math.min(23 * 60 + 59, nowMin - mins));
    return hmStr(v);
  }
  var overDate = nowMin >= 180 ? ymd(t) : ymd(addDays(t, -1));
  var overTime = nowMin >= 180 ? hmAgo(180) : '18:00';
  var demo = [
    // 1 进行中：有预计时长，刚开始不久
    { title: '整理今天的会议记录', list: '工作', tags: ['工作'], prio: 'P2', important: true, urgent: false,
      date: ymd(t), time: hmAgo(25), estimate: 60, remindMode: '不提醒', note: '超过预计时长才算逾期' },
    // 2 已逾期：超过预计时长
    { title: '提交本周项目周报', list: '工作', tags: ['工作'], prio: 'P1', important: true, urgent: true,
      date: overDate, time: overTime, estimate: 45, remindMode: '单次提醒',
      remindCfg: { anchor: overDate + ' ' + overTime, offsets: [-30], read: [], snooze: 5 },
      note: '超过预计时长才算逾期' },
    // 3 全天进行中
    { title: '把书桌和资料收一遍', list: '生活', tags: ['生活'], prio: 'P3', important: false, urgent: false,
      date: ymd(t), time: '', estimate: 0, remindMode: '不提醒', note: '没填时间＝全天' },
    // 4 跨天推进
    { title: '日程台二期开发', list: '工作', tags: ['工作', '项目'], prio: 'P0', important: true, urgent: true,
      date: ymd(addDays(t, -1)), time: '09:00', estimate: 0, span: 3, remindMode: '不提醒',
      subs: [{ title: '接口与数据结构', min: 0, days: 1, done: true },
             { title: '前端交互与状态', min: 0, days: 1, done: false },
             { title: '打包与回归', min: 0, days: 1, done: false }],
      note: '到结束日之后才算逾期' },
    // 5 子项逾期
    { title: '准备季度复盘材料', list: '工作', tags: ['工作'], prio: 'P1', important: true, urgent: false,
      date: ymd(addDays(t, -2)), time: '10:00', estimate: 0, span: 4, remindMode: '不提醒',
      subs: [{ title: '收集各组数据', min: 0, days: 1, done: false },
             { title: '写复盘初稿', min: 0, days: 2, done: false }],
      note: '第一步已过排期' },
    // 6 明天 + 单次提前提醒 + 稍后提醒
    { title: '产品面试 · 候选人 A', list: '工作', tags: ['会议', '工作'], prio: 'P0', important: true, urgent: true,
      date: ymd(addDays(t, 1)), time: '15:00', estimate: 60, remindMode: '单次提醒',
      remindCfg: { anchor: ymd(addDays(t, 1)) + ' 15:00', offsets: [-30], read: [], snooze: 5 },
      note: '提前 30 分钟 + 稍后提醒' },
    // 7 全天 + 准时提醒
    { title: '交房租', list: '生活', tags: ['生活'], prio: 'P2', important: false, urgent: true,
      date: ymd(addDays(t, 3)), time: '', estimate: 0, remindMode: '单次提醒',
      remindCfg: { anchor: ymd(addDays(t, 3)) + ' 09:00', offsets: [0], read: [] },
      note: '全天提醒基准 09:00' },
    // 8 唯一的艾宾浩斯示例
    { title: '背完《长难句》第 5 单元', list: '学习', tags: ['学习', '英语'], prio: 'P2', important: false, urgent: false,
      date: ymd(addDays(t, 1)), time: '21:00', estimate: 0, remindMode: '艾宾浩斯',
      remindCfg: { anchor: ymd(addDays(t, 1)) + ' 21:00', offsets: EB_OFFSETS, read: [] },
      note: '唯一一条艾宾浩斯' },
    // 9 未安排
    { title: '想去看看新开的美术馆', list: '收集箱', tags: ['生活'], prio: '', important: false, urgent: false,
      date: '', time: '', estimate: 0, remindMode: '不提醒', note: '' },
    // 10 已完成
    { title: '晨间拉伸 10 分钟', list: '生活', tags: ['运动'], prio: 'P3', important: false, urgent: false,
      date: ymd(t), time: '08:00', estimate: 10, remindMode: '不提醒', done: true, doneAt: ymd(t),
      note: '' },
    // 11 周末家务（子项拆分）
    { title: '周末大扫除', list: '生活', tags: ['生活'], prio: 'P3', important: false, urgent: false,
      date: ymd(addDays(t, 2)), time: '10:00', estimate: 0, remindMode: '不提醒',
      subs: [{ title: '厨房', min: 20, done: false }, { title: '卫生间', min: 20, done: false }, { title: '客厅', min: 30, done: false }],
      note: '按时长拆分' }
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
    { title: '复盘上周目标完成情况', list: '工作', tags: ['工作'], prio: 'P1', day: -7 },
    { title: '做一次冥想', list: '生活', tags: ['生活'], prio: 'P3', day: -8 }
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
    { name: '年度旅行出发', type: '倒数日', date: ymd(addDays(t, 47)), note: '大理 · 7 天', color: '#5E8C6A' },
    // 示例里直接给一条假期倒数：接口慢或未公布时也能看到这一项
    (function () {
      var fh = fallbackHoliday(ymd(t));
      return { name: '下一个假期 · ' + fh.name, type: '倒数日', date: fh.date, note: '预估 · 官方未公布', color: '#C3272B', group: '假期', sys: 'holiday' };
    })()
  ];
  S.busy++;
  var jobs = [];
  demo.forEach(function (x) {
    var task = {
      id: '', title: x.title, note: x.note || '', list: x.list, tags: x.tags, prio: x.prio,
      important: x.important, urgent: x.urgent, done: !!x.done, remindMode: x.remindMode, subs: x.subs || [],
      remindCfg: x.remindCfg || null, date: x.date, time: x.time, estimate: x.estimate,
      span: x.span || 1, repeat: x.repeat || '', doneAt: x.doneAt || '', sort: 0, createdAt: ymd(today0())
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
    var c = { id: '', name: x.name, type: x.type, date: x.date, note: x.note, color: x.color, group: x.group || '', sys: x.sys || '', createdAt: ymd(t) };
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
