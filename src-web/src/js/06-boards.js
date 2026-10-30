/* ---------- 06-boards.js · 四象限 / 习惯打卡 / 倒数纪念日 / 数据统计 ---------- */
/* ---------- 四象限 ---------- */
function renderQuadrantView() {
  var live = S.tasks.filter(function (t) { return !t.done; });
  // 坐标：横轴向右 = 更紧急，纵轴向上 = 更重要
  // Ⅰ 左上（重要不紧急）｜Ⅱ 右上（重要紧急）｜Ⅲ 右下（不重要紧急）｜Ⅳ 左下（不重要不紧急）
  var q1 = [], q2 = [], q3 = [], q4 = [];
  live.forEach(function (t) {
    if (t.important && t.urgent) q2.push(t);
    else if (t.important) q1.push(t);
    else if (t.urgent) q3.push(t);
    else q4.push(t);
  });
  var defs = [
    { cls: 'q1', num: 'Ⅰ', name: '重要 · 不紧急', sub: '计划做，决定长期', items: q1 },
    { cls: 'q2', num: 'Ⅱ', name: '重要 · 紧急', sub: '立即做，别拖', items: q2 },
    { cls: 'q4', num: 'Ⅳ', name: '不重要 · 不紧急', sub: '不做，别沉迷', items: q4 },
    { cls: 'q3', num: 'Ⅲ', name: '不重要 · 紧急', sub: '少做或转交', items: q3 }
  ];
  var total = live.length || 1;
  var html = '<div class="banner" style="background:var(--brand-softer);border:1px solid var(--line);color:var(--text-2)">' +
    svgIcon('bulb') + '<span>横轴向右＝更紧急，纵轴向上＝更重要；右上角最该现在处理。共 ' + live.length + ' 项待办，' +
    '其中「重要」' + (q1.length + q2.length) + ' 项、「紧急」' + (q2.length + q3.length) + ' 项。</span></div>' +
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
    t.urgent = (q === 'q2' || q === 'q3');
    cacheLocal();
    refreshAll();
    apiUpdateTask(t, ['重要', '紧急']);
    toast('已移到「' + ({ q1: '重要不紧急', q2: '重要紧急', q3: '不重要紧急', q4: '不重要不紧急' })[q] + '」');
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
      '<div class="hinfo"><div class="hn">' + esc(h.name) +
      '<button class="h-edit" data-hedit="' + esc(h.id) + '" title="编辑习惯">' + svgIcon('edit') + '</button></div>' +
      '<div class="hs">连续 ' + h.streak + ' 天 · 本周 ' + weekDone + '/' + h.target + ' · 累计 ' + h.total + ' 次</div></div>' +
      '<button class="hbtn' + (checked ? ' on' : '') + '" data-hcheck="' + esc(h.id) + '" title="今日打卡">' + svgIcon('check') + '</button>' +
      '</div>' +
      '<div class="hweek">' + weekHtml + '</div>' +
      '<div class="hheat">' + heat + '</div>' +
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
  var doneToday = doneAll.filter(function (t) { return stampDay(t.doneAt) === t0s; }).length;
  var ws = startOfWeek(t0);
  var doneWeek = doneAll.filter(function (t) {
    var d = parseYmd(t.doneAt);
    return d && dayDiff(ws, d) >= 0 && dayDiff(ws, d) < 7;
  }).length;
  var live = S.tasks.filter(function (t) { return !t.done; }).length;
  var overdue = S.tasks.filter(function (t) { return taskState(t).key === 'overdue'; }).length;
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
    var dn = doneAll.filter(function (t) { return stampDay(t.doneAt) === ds; }).length;
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
      var n = doneAll.filter(function (t) { return stampDay(t.doneAt) === dds; }).length;
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
