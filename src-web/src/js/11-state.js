/* ---------- 11-state.js · 统一状态机 + 唯一调度器 ---------- */
/*
   以前「逾期」判定散在列表、卡片、看板、统计、详情、提醒中心六处，口径只看日期，
   于是「有预计时长的日程一创建就红」。现在所有展示都读 taskState()：
     有日期 + 时间 + 预计时长 → 开始前=未开始/即将开始，进行中=正在进行，超时长=已逾期
     有日期 + 时间，无预计   → 到点未完成即已逾期
     有日期、无时间（全天）  → 当天=正在进行，过了结束日=已逾期；预计时长不参与
     跨天任务               → 结束日之后才算逾期（子项各自判）
*/

function nowMs(v) {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  return Date.now();
}

function taskWindow(t) {
  if (!t || !t.date) return null;
  var d = parseYmd(t.date);
  if (!d) return null;
  var span = Math.max(1, Number(t.span) || 1);
  var dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  var est = Math.max(0, Number(t.estimate) || 0);
  if (!t.time) {
    // 全天日程：跨天到结束日 24:00
    return {
      start: dayStart,
      end: addDays(dayStart, span),
      allDay: true,
      span: span,
      hasEstimate: est > 0
    };
  }
  var hm = parseHM(t.time);
  if (hm === null) hm = 0;
  var start = new Date(dayStart.getTime() + hm * 60000);
  var end = new Date(start.getTime() + est * 60000);
  if (span > 1) {
    var spanEnd = addDays(dayStart, span);
    if (spanEnd.getTime() > end.getTime()) end = spanEnd;
  }
  return {
    start: start,
    end: end,
    allDay: false,
    span: span,
    hasEstimate: est > 0
  };
}

function spanText(ms) {
  var min = Math.round(Math.max(0, ms) / 60000);
  if (min < 60) return min + ' 分钟';
  if (min < 1440) {
    var h = Math.floor(min / 60), m = min % 60;
    return m ? h + ' 小时 ' + m + ' 分' : h + ' 小时';
  }
  return Math.floor(min / 1440) + ' 天';
}
/* 剩余时间：超过一天的用「天 + 小时」，避免出现「剩余 51 小时 20 分」这种读起来费劲的文案 */
function leftText(min) {
  if (min >= 1440) {
    var d = Math.floor(min / 1440), h = Math.round((min % 1440) / 60);
    return d + ' 天' + (h ? ' ' + h + ' 小时' : '');
  }
  if (min >= 60) {
    var hh = Math.floor(min / 60), mm = min % 60;
    return hh + ' 小时' + (mm ? ' ' + mm + ' 分' : '');
  }
  return min + ' 分钟';
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
      return { key: 'ongoing', label: '正在进行 · 剩余 ' + leftText(left), tone: 'brand' };
    }
    // 没有预计时长：到点即逾期，交给下面
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
