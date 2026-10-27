/* ---------- 04-views.js · 侧栏 / 清单视图 ---------- */
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
    srt.setAttribute('data-tip', S.sortMode === 'manual' ? '当前：手动排序，可拖动任务调整顺序。' : '当前：按时间排序，点一下切换。');
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
    fb.setAttribute('data-tip', n ? '已启用 ' + n + ' 个筛选条件，点开修改。' : '按优先级、标签、状态和日期筛选。');
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
  // 只收「今天该动手」的：逾期 + 正在进行/即将开始 + 今天到期 + 今天到点的复习。
  var overdue = [], live = [], todayItems = [], remind = [];
  var SHORT = { ongoing: '进行中', upcoming: '即将开始', remindSoon: '即将逾期' };
  S.tasks.filter(inScope).forEach(function (t) {
    if (t.done) return;
    var st = taskState(t);
    if (st.key === 'overdue') overdue.push(t);
    else if (SHORT[st.key]) live.push({ t: t, label: SHORT[st.key] });
    else if (t.date === t0s) todayItems.push(t);
    var r = reminderState(t);
    if (r && r.overdue) remind.push({ t: t, r: r });
  });
  overdue = sortTasks(overdue); todayItems = sortTasks(todayItems);
  live.sort(function (a, b) {
    var wa = taskWindow(a.t), wb = taskWindow(b.t);
    return (wa ? wa.start.getTime() : 0) - (wb ? wb.start.getTime() : 0);
  });
  // 同一条日程可能既逾期又有待复习，计数要去重，否则会出现「4 项」只有 3 行
  var seen = {};
  overdue.concat(live.map(function (x) { return x.t; })).concat(todayItems).forEach(function (x) { seen[x.id] = 1; });
  remind.forEach(function (it) { seen[it.t.id] = 1; });
  var total = Object.keys(seen).length;
  var rows = [];
  overdue.slice(0, 3).forEach(function (t) {
    rows.push({ t: t, kind: 'over', label: taskState(t).label.replace('已逾期 ', '逾期 ') });
  });
  live.slice(0, 3).forEach(function (it) {
    if (rows.length >= 7) return;
    rows.push({ t: it.t, kind: 'live', label: it.label });
  });
  if (remind.length) {
    remind.slice(0, 3).forEach(function (it) {
      if (rows.length >= 7) return;
      // 今天到期、下面「今天」那行肯定列得出来的，不用再挂一条「该复习」
      if (it.t.date === t0s && todayItems.indexOf(it.t) > -1 && todayItems.indexOf(it.t) < 6) return;
      var dup = rows.some(function (r) { return r.t.id === it.t.id; });
      if (!dup) rows.push({ t: it.t, kind: 'remind', label: '该复习' });
    });
  }
  todayItems.slice(0, 6).forEach(function (t) {
    if (rows.length >= 8) return;
    var dup = rows.some(function (r) { return r.t.id === t.id; });
    if (!dup) rows.push({ t: t, kind: 'today', label: t.time ? t.time : '今天' });
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
  var st = taskState(t);
  var due = '';
  if (t.date) {
    var d = parseYmd(t.date), diff = dayDiff(t0, d);
    // 日期本身只表达「哪天」，是不是逾期交给状态胶囊，避免两处打架
    var dcls = st.key === 'overdue' ? 'due-over' : (diff === 0 ? 'due-today' : '');
    due = '<span class="m ' + dcls + '">' + svgIcon('calendar') + shortDate(d) + (t.time ? ' ' + timeRangeText(t) : '') + '</span>';
  }
  var rm = remindChipHtml(t);
  var stateChip = stateChipHtml(t);
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
    '<div class="task-meta">' + due + stateChip +
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
    var st = taskState(t);
    var diff = t.date ? dayDiff(today0(), parseYmd(t.date)) : null;
    var dcls = diff === null ? '' : (st.key === 'overdue' ? 'over' : diff === 0 ? 'today' : '');
    var tags = t.tags.map(function (g) { return '<span class="tag-chip ' + tagColor(g) + '">#' + esc(g) + '</span>'; }).join('');
    return '<div class="tcard ' + (t.prio ? t.prio.toLowerCase() : '') + (t.done ? ' done' : '') + (S.detailId === t.id ? ' active' : '') + '" data-tid="' + esc(t.id) + '">' +
      '<div class="tcard-top"><div class="chk" data-done="' + esc(t.id) + '">' + svgIcon('check') + '</div>' +
      flagHtml(t) + '<div class="tcard-title">' + esc(t.title) + '</div>' + subCountHtml(t) + '</div>' +
      subRowsHtml(t, 5) +
      (t.note ? '<div class="tcard-note">' + esc(t.note) + '</div>' : '') +
      '<div class="tcard-foot">' + stateChipHtml(t) + tags +
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
    map.push({ key: 'todo', title: '未开始', color: 'var(--brand)', items: [] });
    map.push({ key: 'doing', title: '今天', color: 'var(--cyan)', items: [] });
    map.push({ key: 'over', title: '已逾期', color: 'var(--red)', items: [] });
    map.push({ key: 'done', title: '已完成', color: 'var(--green)', items: [] });
    rows.forEach(function (t) {
      var st = taskState(t);
      if (st.key === 'done') map[3].items.push(t);
      else if (st.key === 'overdue') map[2].items.push(t);
      else if (st.key === 'ongoing' || st.key === 'upcoming' || st.key === 'remindSoon') map[1].items.push(t);
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
      var st = taskState(t);
      if (st.key === 'overdue') { map[0].items.push(t); return; }
      var d = dayDiff(today0(), parseYmd(t.date));
      if (d === 0) map[1].items.push(t);
      else if (d > 0 && d <= 7) map[2].items.push(t);
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
