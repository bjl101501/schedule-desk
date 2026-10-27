/* ---------- 10-ui-kit.js · 可复用 UI 原件：浮层定位 / 悬浮说明 / 日期选择 / 时间选择 / 标签输入 ---------- */
/* 目标：把编辑器里重复的交互收成一份，新页面要用直接调，不再各写一套。 */

/* ---------- 浮层定位（pick-menu、日历、时间面板共用） ---------- */
function floatPanel(el, rect, opts) {
  opts = opts || {};
  var gap = opts.gap === undefined ? 5 : opts.gap;
  var width = el.offsetWidth || opts.minWidth || 190;
  var height = el.offsetHeight || 0;
  var vw = window.innerWidth, vh = window.innerHeight;
  var left = Math.max(8, Math.min(rect.left || 8, vw - width - 8));
  var top = (rect.bottom || 0) + gap;
  if (top + height > vh - 8) {
    var above = (rect.top || 0) - height - gap;
    top = above >= 8 ? above : Math.max(8, vh - height - 8);
  }
  if (opts.align === 'right' && rect.right) {
    left = Math.max(8, Math.min(rect.right - width, vw - width - 8));
  }
  el.style.left = left + 'px';
  el.style.top = top + 'px';
  return { left: left, top: top };
}

/* 同一时刻只允许一个浮层；点外面 / 滚动 / 缩放都收起 */
var __openPanel = null;
function closeOpenPanel() {
  if (__openPanel && __openPanel.close) __openPanel.close();
  __openPanel = null;
}
function openPanel(anchor, html, opts) {
  opts = opts || {};
  closeOpenPanel();
  var el = document.createElement('div');
  el.className = 'float-panel ' + (opts.cls || '');
  el.innerHTML = html;
  document.body.appendChild(el);
  var closed = false;
  function close() {
    if (closed) return;
    closed = true;
    if (el.parentNode) el.parentNode.removeChild(el);
    if (anchor && anchor.classList) anchor.classList.remove('open');
    document.removeEventListener('mousedown', onDocDown, true);
    window.removeEventListener('resize', close);
    var scroller = opts.scroller;
    if (scroller) scroller.removeEventListener('scroll', close, true);
    if (__openPanel && __openPanel.el === el) __openPanel = null;
    if (opts.onClose) opts.onClose();
  }
  function onDocDown(e) {
    if (el.contains(e.target)) return;
    if (anchor && anchor.contains(e.target)) return;
    close();
  }
  if (anchor && anchor.classList) anchor.classList.add('open');
  floatPanel(el, anchor.getBoundingClientRect(), opts);
  setTimeout(function () {
    document.addEventListener('mousedown', onDocDown, true);
    window.addEventListener('resize', close);
    var scroller = opts.scroller;
    if (scroller) scroller.addEventListener('scroll', close, true);
  }, 0);
  __openPanel = { el: el, close: close };
  return {
    el: el,
    close: close,
    // 内容渲染完高度才确定，重新摆一次位置（翻转判断才准）
    place: function () { floatPanel(el, anchor.getBoundingClientRect(), opts); }
  };
}

/* ---------- 悬浮说明：默认放在触发点上方，绝不压在输入框上 ---------- */
var __tipEl = null;
var __tipTimer = null;
function tipLayer() {
  if (__tipEl) return __tipEl;
  __tipEl = document.createElement('div');
  __tipEl.className = 'tip-layer';
  __tipEl.setAttribute('role', 'tooltip');
  document.body.appendChild(__tipEl);
  return __tipEl;
}
function hideTip() {
  if (__tipTimer) { clearTimeout(__tipTimer); __tipTimer = null; }
  if (__tipEl) __tipEl.classList.remove('in');
}
function showTip(target) {
  var text = target.getAttribute('data-tip');
  if (!text) return;
  var el = tipLayer();
  el.textContent = text;
  el.classList.add('in');
  var r = target.getBoundingClientRect();
  var w = el.offsetWidth, h = el.offsetHeight;
  var vw = window.innerWidth, vh = window.innerHeight;
  // 优先放上方；上方放不下就放到触发点的右侧/左侧，永不默认落到下方（下方是输入框）
  var top = r.top - h - 8;
  var left = r.left + r.width / 2 - w / 2;
  if (top < 8) {
    top = Math.max(8, Math.min(r.top + r.height / 2 - h / 2, vh - h - 8));
    var right = r.right + 10;
    left = right + w <= vw - 8 ? right : r.left - w - 10;
  }
  left = Math.max(8, Math.min(left, vw - w - 8));
  top = Math.max(8, Math.min(top, vh - h - 8));
  el.style.left = left + 'px';
  el.style.top = top + 'px';
}
function bindTips() {
  if (bindTips.done) return;
  bindTips.done = true;
  document.addEventListener('pointerover', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
    if (!t) return;
    hideTip();
    __tipTimer = setTimeout(function () { showTip(t); }, 320);
  }, true);
  document.addEventListener('pointerout', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
    if (t) hideTip();
  }, true);
  document.addEventListener('focusin', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
    if (t) showTip(t);
  }, true);
  document.addEventListener('focusout', hideTip, true);
  document.addEventListener('scroll', hideTip, true);
  window.addEventListener('blur', hideTip);
}
/* 字段旁的问号点：比整段常驻说明安静得多 */
function tipMark(text) {
  return '<span class="tip-i" tabindex="0" role="note" data-tip="' + esc(text) + '">?</span>';
}

/* ---------- 日期选择 ---------- */
function fmtDateField(d) {
  if (!d) return '';
  // 面板里日期列只有 130px 左右，写「10 月 27 日 周二」会被截断
  return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + weekdayName(d);
}
function mountDateField(el, opts) {
  opts = opts || {};
  var value = opts.value || '';
  el.classList.add('pick-field');
  el.setAttribute('type', 'button');
  el.innerHTML = '<span class="pf-txt"></span><i class="pf-c">' + svgIcon('chevD') + '</i>';
  var txt = el.querySelector('.pf-txt');
  function paint() {
    if (!value) {
      txt.textContent = opts.placeholder || '选择日期';
      el.classList.add('is-empty');
      el.removeAttribute('title');
    } else {
      var d = parseYmd(value);
      txt.textContent = fmtDateField(d);
      el.classList.remove('is-empty');
      el.title = d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 ' + weekdayName(d);
    }
  }
  function setValue(v) {
    v = isoToYmd(v) || '';
    if (v === value) return;
    value = v;
    paint();
    if (opts.onChange) opts.onChange(value);
  }
  paint();

  var view = value ? parseYmd(value) : today0();
  el.addEventListener('click', function () {
    if (__openPanel && __openPanel.el && __openPanel.el.getAttribute('data-for') === el.id) { closeOpenPanel(); return; }
    var cur = value ? parseYmd(value) : today0();
    view = new Date(cur.getFullYear(), cur.getMonth(), 1);
    var p = openPanel(el, '<div class="cal-pop"></div>', {
      cls: 'cal-panel',
      minWidth: 252,
      scroller: document.querySelector('.m-body'),
      onClose: function () { el.classList.remove('open'); }
    });
    p.el.setAttribute('data-for', el.id);
    renderCal(p.el);
    p.place();
  });

  function renderCal(box) {
    var y = view.getFullYear(), m = view.getMonth();
    var first = new Date(y, m, 1);
    var startOffset = (first.getDay() + 6) % 7; // 周一起始
    var daysInMonth = new Date(y, m + 1, 0).getDate();
    var cells = [];
    for (var i = 0; i < startOffset; i++) cells.push(null);
    for (var d = 1; d <= daysInMonth; d++) cells.push(new Date(y, m, d));
    while (cells.length % 7 !== 0) cells.push(null);
    var todayStr = ymd(today0());
    var selStr = value || '';
    var html = '<div class="cal-head">' +
      '<button type="button" class="cal-nav" data-nav="-1" aria-label="上个月">' + svgIcon('chevL') + '</button>' +
      '<b>' + y + ' 年 ' + (m + 1) + ' 月</b>' +
      '<button type="button" class="cal-nav" data-nav="1" aria-label="下个月">' + svgIcon('chevR') + '</button>' +
      '</div><div class="cal-grid cal-dow">' +
      ['一', '二', '三', '四', '五', '六', '日'].map(function (x) { return '<span>' + x + '</span>'; }).join('') +
      '</div><div class="cal-grid cal-days">' +
      // 空位也用 button：span 与 button 的 min-content 不同，会把 1fr 挤成忽宽忽窄
      cells.map(function (c) {
        if (!c) return '<button type="button" class="cal-cell cal-blank" disabled aria-hidden="true"></button>';
        var s = ymd(c);
        var cls = 'cal-cell' + (s === selStr ? ' on' : '') + (s === todayStr ? ' today' : '') + (c.getDay() === 0 || c.getDay() === 6 ? ' weekend' : '');
        return '<button type="button" class="' + cls + '" data-day="' + s + '">' + c.getDate() + '</button>';
      }).join('') +
      '</div><div class="cal-foot">' +
      '<button type="button" class="cal-quick" data-quick="0">今天</button>' +
      '<button type="button" class="cal-quick" data-quick="1">明天</button>' +
      '<button type="button" class="cal-quick" data-quick="7">下周一</button>' +
      '<span class="sp"></span>' +
      '<button type="button" class="cal-quick muted" data-clear="1">清除</button>' +
      '</div>';
    box.innerHTML = html;

    box.querySelectorAll('[data-nav]').forEach(function (b) {
      b.addEventListener('click', function () {
        view = new Date(y, m + parseInt(b.getAttribute('data-nav'), 10), 1);
        renderCal(box);
      });
    });
    box.querySelectorAll('[data-day]').forEach(function (b) {
      b.addEventListener('click', function () {
        setValue(b.getAttribute('data-day'));
        closeOpenPanel();
      });
      b.addEventListener('keydown', function (e) {
        var step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -7 : e.key === 'ArrowDown' ? 7 : 0;
        if (!step) return;
        e.preventDefault();
        var cellsAll = Array.prototype.slice.call(box.querySelectorAll('[data-day]'));
        var i = cellsAll.indexOf(b) + step;
        if (cellsAll[i]) cellsAll[i].focus();
      });
    });
    box.querySelectorAll('[data-quick]').forEach(function (b) {
      b.addEventListener('click', function () {
        var add = parseInt(b.getAttribute('data-quick'), 10);
        var d = today0();
        if (add === 7) d = addDays(startOfWeek(today0()), 7);
        setValue(ymd(d));
        closeOpenPanel();
      });
    });
    var clr = box.querySelector('[data-clear]');
    if (clr) clr.addEventListener('click', function () { setValue(''); closeOpenPanel(); });
  }

  Object.defineProperty(el, 'value', {
    configurable: true,
    get: function () { return value; },
    set: function (v) { setValue(v); }
  });
  return { get: function () { return value; }, set: setValue };
}

/* ---------- 时间选择 ---------- */
function mountTimeField(el, opts) {
  opts = opts || {};
  var value = opts.value || '';
  el.classList.add('pick-field');
  el.setAttribute('type', 'button');
  el.innerHTML = '<span class="pf-txt"></span><i class="pf-c">' + svgIcon('chevD') + '</i>';
  var txt = el.querySelector('.pf-txt');
  function paint() {
    // 空值不写「全天」，直接说明规则；字号交给 .is-empty 压小
    txt.textContent = value || (opts.emptyText || '留空默认为全天');
    if (value) el.classList.remove('is-empty'); else el.classList.add('is-empty');
  }
  function setValue(v) {
    v = /^\d{1,2}:\d{2}$/.test(v || '') ? (v.length === 4 ? '0' + v : v) : '';
    if (v === value) return;
    value = v;
    paint();
    if (opts.onChange) opts.onChange(value);
  }
  paint();

  var QUICK = ['08:00', '09:00', '12:00', '14:00', '18:00', '20:00'];
  el.addEventListener('click', function () {
    if (__openPanel && __openPanel.el && __openPanel.el.getAttribute('data-for') === el.id) { closeOpenPanel(); return; }
    var p = openPanel(el, '<div class="tm-pop"></div>', {
      cls: 'tm-panel', minWidth: 252,
      scroller: document.querySelector('.m-body'),
      onClose: function () {
        // 点了小时没点分钟就关掉：按当前选择提交，别让用户的点击白费
        if (dirty) setValue(pad2(selH) + ':' + pad2(selM));
        el.classList.remove('open');
      }
    });
    p.el.setAttribute('data-for', el.id);
    var cur = value;
    var selH = cur ? parseInt(cur.slice(0, 2), 10) : 9;
    var selM = cur ? parseInt(cur.slice(3, 5), 10) : 0;
    var dirty = false;
    renderTime(p.el);
    p.place();

    function paintSel(box) {
      var head = box.querySelector('.tm-head b');
      if (head) head.textContent = pad2(selH) + ':' + pad2(selM);
      box.querySelectorAll('[data-h]').forEach(function (x) {
        x.classList.toggle('on', parseInt(x.getAttribute('data-h'), 10) === selH);
      });
      box.querySelectorAll('[data-m]').forEach(function (x) {
        x.classList.toggle('on', parseInt(x.getAttribute('data-m'), 10) === selM);
      });
    }
    function renderTime(box) {
      var hours = '', mins = '';
      for (var h = 0; h < 24; h++) {
        hours += '<button type="button" class="tm-cell" data-h="' + h + '">' + pad2(h) + '</button>';
      }
      for (var m = 0; m < 60; m++) {
        mins += '<button type="button" class="tm-cell" data-m="' + m + '">' + pad2(m) + '</button>';
      }
      box.innerHTML = '<div class="tm-head"><b>' + pad2(selH) + ':' + pad2(selM) + '</b><span>选小时 / 分钟</span></div>' +
        '<div class="tm-body"><div class="tm-col" data-col="h">' + hours + '</div>' +
        '<div class="tm-col" data-col="m">' + mins + '</div></div>' +
        '<div class="tm-quick">' + QUICK.map(function (q) {
          return '<button type="button" class="chip-p' + (q === cur ? ' on' : '') + '" data-q="' + q + '">' + q + '</button>';
        }).join('') + '</div>' +
        '<div class="cal-foot"><span class="sp"></span>' +
        '<button type="button" class="cal-quick muted" data-clear="1">留空（全天）</button></div>';
      paintSel(box);

      box.querySelectorAll('[data-h]').forEach(function (b) {
        b.addEventListener('click', function () {
          selH = parseInt(b.getAttribute('data-h'), 10);
          dirty = true;
          paintSel(box);
        });
      });
      box.querySelectorAll('[data-m]').forEach(function (b) {
        b.addEventListener('click', function () {
          selM = parseInt(b.getAttribute('data-m'), 10);
          dirty = true;
          setValue(pad2(selH) + ':' + pad2(selM));
          closeOpenPanel();
        });
      });
      box.querySelectorAll('[data-q]').forEach(function (b) {
        b.addEventListener('click', function () {
          setValue(b.getAttribute('data-q'));
          closeOpenPanel();
        });
      });
      var clr = box.querySelector('[data-clear]');
      if (clr) clr.addEventListener('click', function () { setValue(''); dirty = false; closeOpenPanel(); });

      // 打开时把选中项滚到中间，但不要出现滚动条
      ['h', 'm'].forEach(function (k) {
        var col = box.querySelector('[data-col="' + k + '"]');
        var on = col && col.querySelector('.on');
        if (col && on) col.scrollTop = Math.max(0, on.offsetTop - col.clientHeight / 2 + 14);
      });
    }
  });
  Object.defineProperty(el, 'value', {
    configurable: true,
    get: function () { return value; },
    set: function (v) { setValue(v); }
  });
  return { get: function () { return value; }, set: setValue };
}


/* ---------- 标签输入：空格 / 回车 / 逗号都能提交，且不打断中文输入法 ---------- */
function mountTagInput(input, opts) {
  opts = opts || {};
  var composing = false;
  input.setAttribute('autocomplete', 'off');
  input.addEventListener('compositionstart', function () { composing = true; });
  input.addEventListener('compositionend', function () { composing = false; });

  function commit(raw) {
    var parts = String(raw || '').split(/[\s,，、;；]+/);
    var added = 0;
    parts.forEach(function (p) {
      var v = p.trim().replace(/^#/, '');
      if (!v) return;
      if (opts.onAdd && opts.onAdd(v) !== false) added++;
    });
    if (added && opts.onCommitted) opts.onCommitted(added);
    return added;
  }
  input.addEventListener('keydown', function (e) {
    if (e.isComposing || composing || e.keyCode === 229) return;
    var k = e.key;
    if (k === 'Enter' || k === ' ' || k === 'Spacebar' || k === ',' || k === '，' || k === '、' || k === ';' || k === '；') {
      e.preventDefault();
      commit(input.value);
      input.value = '';
      return;
    }
    if (k === 'Backspace' && !input.value && opts.onBackspace) {
      e.preventDefault();
      opts.onBackspace();
    }
  });
  input.addEventListener('paste', function (e) {
    var txt = e.clipboardData && e.clipboardData.getData('text');
    if (!txt || !/[\s,，、;；]/.test(txt)) return;
    e.preventDefault();
    commit(txt);
    input.value = '';
  });
  input.addEventListener('blur', function () {
    if (input.value.trim()) { commit(input.value); input.value = ''; }
  });
  return { commit: commit };
}

/* ---------- 组件统一初始化：打开弹窗时调用 ---------- */
function prepareForm(root) {
  if (!root) return;
  Array.prototype.forEach.call(root.querySelectorAll('input, textarea'), function (el) {
    el.setAttribute('autocomplete', 'off');
    el.setAttribute('autocapitalize', 'off');
    el.setAttribute('spellcheck', 'false');
    // 随机 name 打断浏览器的字段聚类，避免出现历史输入下拉
    if (!el.getAttribute('data-noname') && !el.name) {
      el.name = 'f_' + Math.random().toString(36).slice(2, 10);
      el.setAttribute('data-noname', '1');
    }
  });
}
