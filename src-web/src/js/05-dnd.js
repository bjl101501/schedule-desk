/* ---------- 05-dnd.js · 拖拽：列表排序 / 看板换列 / 日历改期 / 时间线 ---------- */
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
    status: { 'todo': '未开始', 'doing': '今天', 'over': '已逾期', 'done': '已完成' },
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
