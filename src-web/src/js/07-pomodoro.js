/* ---------- 07-pomodoro.js · 番茄专注 / 任务详情 ---------- */
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
    var st = taskState(t);
    if (st.key === 'overdue') { dTxt += ' · ' + st.label; dCls += ' warn'; }
    else if (st.key === 'ongoing' || st.key === 'upcoming' || st.key === 'remindSoon') { dTxt += ' · ' + st.label; dCls += ' brand'; }
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
  } else {
    rows.push(rowHtml('clock', '时间', t.estimate ? '全天日程 · 预计 ' + durText(t.estimate) : '全天日程', 'dt-v'));
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
    var isEb = t.remindMode === '艾宾浩斯';
    var nodes = offs.map(function (off, i) {
      var at = anchor.getTime() + off * 60000;
      var isPast = at < Date.now();
      var isRead = read.indexOf(i) > -1;
      var cls = isRead ? 'past' : (isPast ? 'now' : 'future');
      var ad = new Date(at);
      var txt = (ad.getMonth() + 1) + '/' + ad.getDate() + ' ' + pad2(ad.getHours()) + ':' + pad2(ad.getMinutes());
      // 待复习是艾宾浩斯专属：单次提醒过期就是「已提醒 / 已逾期」，不能混用
      var st = isEb
        ? (isRead ? '已确认' : (isPast ? '待复习' : '待触发'))
        : (isRead ? '已确认' : (isPast ? '已提醒' : '待提醒'));
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
