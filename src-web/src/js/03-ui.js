/* ---------- 03-ui.js · 通用 UI / 桌面面板 / 快照 / 换肤 / 计算 / 刷新 ---------- */
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
