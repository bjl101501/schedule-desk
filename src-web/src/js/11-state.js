/* ---------- 11-state.js · 统一状态机 + 唯一调度器 ---------- */
/*
   时间窗口只有一处定义，所有展示都读 taskState()：
     开始 = 日期 + 时间（时间空 = 全天，从 00:00 起）
     结束 = 计划？(结束日期 + 结束时间，时间空 = 结束日 24:00)
                    ：定时 + 预计时长？开始 + 时长
                    ：定时无时长？开始（到点即逾期）
                    ：全天无计划？当天 24:00
     计划与预计时长都有时，取更晚的那个作为结束点。
*/

function nowMs(v) {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  return Date.now();
}

/* 计划的结束时刻；返回 null 表示没有计划。
   hasEnd=false 表示只到「结束日 24:00」，没有明确时刻（结束提醒需要对它置灰）。 */
function planEnd(t) {
  if (!t || !t.plan || !t.endDate) return null;
  var d = parseYmd(t.endDate);
  if (!d) return null;
  var hm = parseHM(t.endTime);
  if (hm === null) return { ms: addDays(d, 1).getTime(), hasEnd: false };
  return { ms: d.getTime() + hm * 60000, hasEnd: true };
}

function taskWindow(t) {
  if (!t || !t.date) return null;
  var d = parseYmd(t.date);
  if (!d) return null;
  var dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  var est = Math.max(0, Number(t.estimate) || 0);
  var allDay = !t.time;
  var span = taskSpan(t);
  var pe = planEnd(t);
  var start, end, hasEnd = false;

  if (allDay) {
    start = dayStart;
    if (pe) { end = new Date(pe.ms); hasEnd = !!pe.hasEnd; }
    else { end = addDays(dayStart, 1); }
  } else {
    var hm = parseHM(t.time);
    if (hm === null) hm = 0;
    start = new Date(dayStart.getTime() + hm * 60000);
    var byEst = est > 0 ? start.getTime() + est * 60000 : start.getTime();
    if (pe && pe.ms > byEst) { end = new Date(pe.ms); hasEnd = !!pe.hasEnd; }
    else { end = new Date(byEst); hasEnd = est > 0; }
  }

  return {
    start: start,
    end: end,
    allDay: allDay,
    span: span,
    hasEstimate: est > 0,
    hasEnd: hasEnd
  };
}

function spanText(ms) {
  return coarseSpan(ms);
}
/* 剩余时间：与逾期同一套口径，只取最大单位 */
function leftText(min) {
  return coarseSpan(min * 60000);
}

function taskState(t, at) {
  var now = nowMs(at);
  if (!t) return { key: 'none', label: '', tone: '' };
  if (t.done) return { key: 'done', label: '', tone: '' };
  var w = taskWindow(t);
  if (!w) return { key: 'unscheduled', label: '', tone: '' };
  var r = reminderState(t, now);

  if (now < w.start.getTime()) {
    // 提前提醒已到点：有预计时长说「即将开始」，没有则说「即将逾期」
    if (r && r.overdue && r.offset < 0) {
      if (w.allDay) return { key: 'upcoming', label: '今天要做', tone: 'cyan' };
      if (w.hasEstimate) return { key: 'upcoming', label: '即将开始', tone: 'cyan' };
      return { key: 'remindSoon', label: '即将逾期', tone: 'orange' };
    }
    return { key: 'planned', label: '', tone: '' };
  }

  if (now <= w.end.getTime()) {
    if (w.allDay) return { key: 'ongoing', label: '全天 · 进行中', tone: 'brand' };
    if (w.end.getTime() > w.start.getTime()) {
      var left = Math.max(1, Math.round((w.end.getTime() - now) / 60000));
      return { key: 'ongoing', label: '进行中 · 剩余 ' + leftText(left), tone: 'brand' };
    }
    // 没有预计时长也没有计划：到点即逾期，交给下面
  }

  // 全天任务按天算：昨天的事今天就是「已逾期 1 天」，不用小时去吓人
  if (w.allDay) {
    var days = Math.max(1, Math.ceil((now - w.end.getTime()) / 86400000));
    return { key: 'overdue', label: '已逾期 ' + days + ' 天', tone: 'red' };
  }
  return { key: 'overdue', label: '已逾期 ' + spanText(now - w.end.getTime()), tone: 'red' };
}

/* 提醒状态：已到点未读算 overdue，否则返回下一个将到的节点 */
function reminderState(t, at) {
  var now = nowMs(at);
  if (!t || t.done || !t.remindCfg || !t.remindCfg.anchor) return null;
  var anchor = parseAnchor(t.remindCfg.anchor);
  if (!anchor) return null;
  var offs = (t.remindCfg.offsets && t.remindCfg.offsets.length) ? t.remindCfg.offsets : EB_OFFSETS;
  var read = t.remindCfg.read || [];
  var best = null, bestIdx = -1;
  for (var i = 0; i < offs.length; i++) {
    if (read.indexOf(i) > -1) continue;
    var ms = anchor.getTime() + offs[i] * 60000;
    if (ms <= now && (best === null || ms > best)) { best = ms; bestIdx = i; }
  }
  if (best !== null) {
    return { at: best, idx: bestIdx, offset: offs[bestIdx], overdue: true, mode: t.remindMode || '' };
  }
  for (var j = 0; j < offs.length; j++) {
    if (read.indexOf(j) > -1) continue;
    var ms2 = anchor.getTime() + offs[j] * 60000;
    if (ms2 > now) return { at: ms2, idx: j, offset: offs[j], overdue: false, mode: t.remindMode || '' };
  }
  return null;
}

/* ---------- 展示片段 ---------- */
function stateChipHtml(t) {
  var s = taskState(t);
  if (!s.label) return '';
  return '<span class="m state-chip state-' + s.tone + '" data-state-id="' + esc(t.id) + '">' + esc(s.label) + '</span>';
}

function remindChipHtml(t) {
  var r = reminderState(t);
  if (!r) return '';
  var isEb = t.remindMode === '艾宾浩斯';
  if (r.overdue) {
    var hit = isEb ? '待复习' : '已提醒';
    return '<span class="m due-remind hit" data-remind-id="' + esc(t.id) + '">' + svgIcon('bell') + hit + '</span>';
  }
  if (r.at - Date.now() > 24 * 3600 * 1000) return '';
  return '<span class="m due-remind soon" data-remind-id="' + esc(t.id) + '">' + svgIcon('bell') + relTime(r.at) + '</span>';
}

/* 只改状态文字，不重建 DOM：滚动位置、展开的子项都不会被打断 */
function patchLiveState() {
  Array.prototype.forEach.call(document.querySelectorAll('[data-state-id]'), function (n) {
    var t = findTask(n.getAttribute('data-state-id'));
    if (!t) return;
    var s = taskState(t);
    if (!s.label) { n.parentNode && n.parentNode.removeChild(n); return; }
    n.textContent = s.label;
    n.className = 'm state-chip state-' + s.tone;
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-remind-id]'), function (n) {
    var t = findTask(n.getAttribute('data-remind-id'));
    if (!t) return;
    var r = reminderState(t);
    if (!r) { n.parentNode && n.parentNode.removeChild(n); return; }
    var isEb = t.remindMode === '艾宾浩斯';
    if (r.overdue) {
      n.className = 'm due-remind hit';
      n.innerHTML = svgIcon('bell') + (isEb ? '待复习' : '已提醒');
    } else {
      n.className = 'm due-remind soon';
      n.innerHTML = svgIcon('bell') + relTime(r.at);
    }
  });
}

/* 状态签名：只有真的发生迁移（未开始 → 进行中 / 逾期）才整页重排，
   其余时候只改文字。否则「计划中」的任务到点后不会长出状态胶囊。 */
var __stateSig = {};
var __stateSigReady = false;
function stateSignature(t) {
  var s = taskState(t);
  var r = reminderState(t);
  return s.key + '|' + (r ? (r.overdue ? '1' : '0') + ':' + r.idx : '-');
}
function statesChanged() {
  var changed = false;
  for (var i = 0; i < S.tasks.length; i++) {
    var t = S.tasks[i];
    var sig = stateSignature(t);
    if (__stateSig[t.id] !== sig) {
      __stateSig[t.id] = sig;
      changed = true;
    }
  }
  if (!__stateSigReady) {
    __stateSigReady = true;
    return false;
  }
  return changed;
}

/* ---------- 唯一调度器 ----------
   全应用只有这一个定时器：15 秒一次，先判断是否跨天（跨天要重排列表），
   否则只触发订阅者做轻量刷新。以后加轮询、自动同步都挂这里，不再各自 setInterval。 */
var Scheduler = {
  every: 15000,
  timer: null,
  day: '',
  subs: [],
  on: function (fn) { if (fn) Scheduler.subs.push(fn); },
  start: function () {
    if (Scheduler.timer) return;
    Scheduler.day = ymd(today0());
    Scheduler.timer = setInterval(function () {
      var d = ymd(today0());
      if (d !== Scheduler.day) {
        Scheduler.day = d;
        refreshAll();
        return;
      }
      for (var i = 0; i < Scheduler.subs.length; i++) {
        try { Scheduler.subs[i](); } catch (e) { }
      }
    }, Scheduler.every);
  }
};
