// UI 回归检查：状态矩阵 + 编辑器交互 + 视图不变量 + 截图
// 用法：node ui-check.mjs <输出目录> [端口] [--strict]
//
// 每条断言都进 fails[] 并把退出码设成 2 —— 不再是「只写进报告」。
// --strict：连 KNOWN_FAIL 里的已知失败也算失败（重构收口时用）。
import fs from 'node:fs';
import path from 'node:path';
import {
  target,
  connect,
  evaluate,
  probe,
  shot,
  sleep,
  key,
  resize,
  exceptions,
  makeChecker,
  settle
} from './lib/cdp.mjs';

const OUT = process.argv[2] || '.';
const PORT = process.argv[3] || '9222';
const STRICT = process.argv.includes('--strict');

/*
  已知失败：本轮要修的缺陷，修完一条就从这里删一条。
  R9 收口时 --strict 必须通过（fails 为空）。
*/
const KNOWN_FAIL = [];

// Svelte 5 版本把全局收敛到 window.__SD_TEST__，这里做一层测试侧兼容，
// 让下面几十条断言保持原样：S.tasks / S.cursor / Scheduler.timer 都映射过去。
const SHIM = `(function(){
  var T = window.__SD_TEST__;
  if (!T) return false;
  window.taskState = T.taskState;
  window.today0 = T.today0;
  window.openTaskEditor = T.openTaskEditor;
  window.openTaskDetail = T.openTaskDetail;
  window.openQuickAdd = T.openQuickAdd;
  window.closeModal = T.closeModal;
  window.goView = T.goView;
  window.setTheme = T.setTheme;
  window.showTip = T.showTip;
  window.hideTip = T.hideTip;
  window.refreshAll = T.refreshAll;
  window.setCal = T.setCal;
  window.Scheduler = { get timer(){ return T.schedulerRunning() ? 1 : null; } };
  window.S = {
    get tasks(){ return T.tasks; },
    get cursor(){ return new Date(); },
    set cursor(v){ T.setCal({ cursor: v instanceof Date ? v : new Date(v) }); },
    get calMode(){ return 'month'; },
    set calMode(v){ T.setCal({ calMode: v }); },
    get detailId(){ return ''; },
    set detailId(v){}
  };
  return true;
})()`;

const EXPECT = {
  t01: 'ongoing', // 开始+时长，已过 20 分
  t02: 'overdue', // 开始+时长，已过 90 分
  t03: 'overdue', // 定时无时长，到点即逾期
  t04: 'remindSoon', // 未开始，提前提醒已到点，无时长
  t05: 'ongoing', // 全天
  t06: 'overdue', // 全天，昨天
  t07: 'ongoing', // 计划到结束日 24:00
  t08: 'overdue', // 计划 + 结束时间已过
  t09: 'upcoming', // 未开始，有时长，提前提醒已到点
  t10: 'planned', // 明天
  t11: 'done',
  t12: 'ongoing', // 全天 + 时长仍是全天
  t13: 'overdue', // 艾宾浩斯，基准已过
  t14: 'ongoing', // 定时 1 分钟前开始，用时 45 分钟
  t15: 'ongoing', // 计划与用时取更晚（计划 2 小时后）
  t17: 'overdue', // 计划结束日是昨天 24:00
  t18: 'planned' // 计划跨天，还没开始
};

async function main() {
  const page = await target(PORT);
  const cdp = connect(page.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await resize(cdp, 1280, 800);
  await sleep(3200);

  const report = { samples: {} };
  const S = report.samples;
  const c = makeChecker();
  fs.mkdirSync(OUT, { recursive: true });

  await evaluate(cdp, SHIM);

  // ---------- 1. 启动与状态矩阵 ----------
  c.check('state.fn', (await evaluate(cdp, "typeof taskState === 'function'")) === true);
  c.check(
    'test.kit',
    (await evaluate(cdp, '!!window.__SD_TEST__ && typeof __SD_TEST__.fieldValue === "function"')) === true
  );
  c.check('scheduler.running', (await evaluate(cdp, '__SD_TEST__.schedulerRunning()')) === true);

  // 数码字体真的加载了：样式拆文件后 @font-face 的相对路径错过一次，界面上很难一眼看出来
  const clockFont = await evaluate(
    cdp,
    `(function(){
      var el = document.querySelector('.clock .dnum, .clock b, .clock span');
      return { ok: document.fonts.check('16px Digital-7'),
               family: el ? getComputedStyle(el).fontFamily : '',
               faces: Array.from(document.fonts).filter(function(f){ return /Digital-7/i.test(f.family); })
                        .map(function(f){ return f.status; }) };
    })()`
  );
  S.clockFont = clockFont;
  c.check('clock.font', !!clockFont && clockFont.ok === true && /Digital-7/.test(clockFont.family || ''), clockFont);

  // 换肤后时钟要跟着主题走：五套主题的管色必须互不相同（曾经只有宣纸 + 深色两套，celadon / moon 是裸灰）
  const clockThemes = await evaluate(
    cdp,
    `(async function(){
       var el = document.documentElement;
       var keys = ['celadon','moon','dusk','ink'];
       var out = {};
       for (var i = 0; i < keys.length; i++) {
         el.setAttribute('data-theme', keys[i]);
         await new Promise(function(r){ requestAnimationFrame(function(){ requestAnimationFrame(r); }); });
         var c = document.querySelector('.clock');
         var on = c.querySelector('.dg .on');
         out[keys[i]] = { bg: getComputedStyle(c).backgroundColor,
                          on: on ? getComputedStyle(on).color : '' };
       }
       el.removeAttribute('data-theme');
       await new Promise(function(r){ requestAnimationFrame(function(){ requestAnimationFrame(r); }); });
       out.paper = { bg: getComputedStyle(document.querySelector('.clock')).backgroundColor };
       return out;
     })()`
  );
  S.clockThemes = clockThemes;
  const clockBgs = new Set(Object.keys(clockThemes || {}).map((k) => clockThemes[k].bg));
  c.check(
    'clock.theme',
    !!clockThemes &&
      clockBgs.size === 5 &&
      clockThemes.celadon.on !== clockThemes.ink.on &&
      !Object.keys(clockThemes).every((k) => clockThemes[k].bg === 'rgb(233, 233, 233)'),
    clockThemes
  );

  const count = await evaluate(cdp, 'S.tasks.length');
  c.atLeast('tasks.count', count, 10, { detail: '测试数据应至少 10 条' });

  const states = await evaluate(
    cdp,
    `S.tasks.map(t => { const s = taskState(t); return { id: t.id, title: t.title, key: s.key, label: s.label }; })`
  );
  const mismatches = [];
  (states || []).forEach((s) => {
    if (!s || !s.id) return;
    const want = EXPECT[s.id];
    if (want && s.key !== want) mismatches.push({ id: s.id, want, got: s.key, label: s.label });
  });
  c.check('state.matrix', mismatches.length === 0, mismatches);
  report.states = states;

  // ---------- 2. 列表与状态胶囊 ----------
  S.listText = await evaluate(
    cdp,
    "(document.querySelector('.content, #content')||{}).innerText?.slice(0,300)"
  );
  c.check(
    'list.text',
    typeof S.listText === 'string' &&
      S.listText.length > 10 &&
      !/undefined|NaN|\[object Object\]/.test(S.listText),
    { head: String(S.listText || '').slice(0, 80) }
  );

  await evaluate(cdp, "goView('next7')");
  await sleep(450);
  const chips = await evaluate(
    cdp,
    `Array.from(document.querySelectorAll('[data-state-id]')).map(n => ({id:n.dataset.stateId, text:(n.textContent||'').trim(), cls:n.className}))`
  );
  S.chips = { len: (chips || []).length, first: (chips || []).slice(0, 3) };
  c.every('chips.render', chips, (x) => x.text.length > 0 && /state-/.test(x.cls));
  await evaluate(cdp, "goView('today')");
  await sleep(400);

  // ---------- 3. 编辑器 ----------
  await evaluate(cdp, 'openTaskEditor(null)');
  await sleep(500);
  c.check('editor.open', (await evaluate(cdp, '!!document.querySelector("#edTitle")')) === true);
  S.dateText = await evaluate(cdp, 'document.querySelector("#edDate")?.textContent');
  c.has('editor.dateText', S.dateText);
  S.estPlaceholder = await evaluate(cdp, 'document.querySelector("#edEst")?.placeholder');
  c.eq('editor.estPlaceholder', S.estPlaceholder, '留空');

  const autocomplete = await evaluate(
    cdp,
    `Array.from(document.querySelectorAll('#modalRoot input, #modalRoot textarea')).map(e => e.getAttribute('autocomplete'))`
  );
  c.every('editor.autocomplete', autocomplete, (v) => v === 'off');

  const labels = await evaluate(
    cdp,
    `Array.from(document.querySelectorAll('#modalRoot .ed-sec .field > label')).map(l => {
      const r = l.getBoundingClientRect();
      const t = l.querySelector('.tip-i');
      const tr = t ? t.getBoundingClientRect() : null;
      return { text: (l.textContent||'').slice(0,10), w: Math.round(r.width), h: Math.round(r.height),
               tipY: tr ? Math.round(tr.y - r.y) : null };
    })`
  );
  S.labels = labels;
  const visibleLabels = (labels || []).filter((l) => l.w > 0 || l.h > 0);
  c.every('editor.labels', visibleLabels, (l) => l.w > 0 && l.h > 0 && (l.tipY === null || (l.tipY >= -2 && l.tipY <= l.h)));
  c.check('editor.labelsAll', (labels || []).length >= 10, { len: (labels || []).length });

  const bodyScroll = await evaluate(
    cdp,
    `(function(){var b=document.querySelector('#modalRoot .m-body');return b?{oy:getComputedStyle(b).overflowY,h:b.clientHeight}:null;})()`
  );
  c.check('editor.bodyScroll', !!bodyScroll && /auto|scroll/.test(bodyScroll.oy) && bodyScroll.h > 150, bodyScroll);

  const contentScroll = await evaluate(
    cdp,
    `(function(){var e=document.getElementById('content');return e?{oy:getComputedStyle(e).overflowY,h:e.clientHeight}:null;})()`
  );
  c.check('content.scroll', !!contentScroll && /auto|scroll/.test(contentScroll.oy) && contentScroll.h > 200, contentScroll);

  await shot(cdp, OUT, 'editor.png');

  // ---------- 4. 日期面板 ----------
  await evaluate(cdp, 'document.querySelector("#edDate")?.click()');
  await sleep(350);
  const calCells = await evaluate(cdp, 'document.querySelectorAll(".float-panel [data-day]").length');
  c.atLeast('picker.calCells', calCells, 28);

  const calLayout = await evaluate(
    cdp,
    `(function(){
      var grid = document.querySelector('.float-panel .cal-days');
      if (!grid) return null;
      var cs = getComputedStyle(grid);
      var cells = Array.prototype.slice.call(grid.children);
      var rows = {};
      cells.forEach(function(c){ var r=c.getBoundingClientRect(); var k=Math.round(r.top); rows[k]=(rows[k]||0)+1; });
      return { template: cs.gridTemplateColumns, rowGap: cs.rowGap, autoRows: cs.gridAutoRows,
               rows: rows, h: Math.round(grid.getBoundingClientRect().height),
               first: cells.slice(0,3).map(function(c){var r=c.getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)];}) };
    })()`
  );
  S.calLayout = calLayout;
  c.check(
    'picker.calGrid',
    !!calLayout &&
      String(calLayout.template).trim().split(/\s+/).length === 7 &&
      Object.keys(calLayout.rows || {}).length >= 5 &&
      calLayout.first.every(([w, h]) => w > 10 && h >= 24)
  );
  // 首帧就得在视口内（不是 (0,0)）：place() 同步估算 + computePosition 精修
  const p0 = await evaluate(
    cdp,
    `(function(){ var r = document.querySelector('.float-panel').getBoundingClientRect();
      return { l: Math.round(r.left), t: Math.round(r.top), rr: Math.round(r.right), b: Math.round(r.bottom),
               vw: innerWidth, vh: innerHeight }; })()`
  );
  S.pickerBox = p0;
  c.check('picker.inViewport', !!p0 && p0.l >= 8 && p0.t >= 8 && p0.rr <= p0.vw - 7 && p0.b <= p0.vh - 7, p0);

  // 滚动时跟随而不是关闭：面板顶边应跟着锚点一起上移同样的距离
  const follow = await evaluate(
    cdp,
    `(async function(){
      var p = document.querySelector('.float-panel');
      var b = document.querySelector('#modalRoot .m-body');
      if (!p || !b) return null;
      var t0 = p.getBoundingClientRect().top;
      b.scrollTop += 60;
      await new Promise(function(r){ requestAnimationFrame(function(){ requestAnimationFrame(r); }); });
      var p1 = document.querySelector('.float-panel');
      var out = { live: !!p1, dPanel: p1 ? Math.round(p1.getBoundingClientRect().top - t0) : null };
      b.scrollTop -= 60;
      await new Promise(function(r){ requestAnimationFrame(function(){ requestAnimationFrame(r); }); });
      return out;
    })()`
  );
  S.pickerFollow = follow;
  c.check('picker.followScroll', !!follow && follow.live === true && Math.abs(follow.dPanel + 60) <= 3, follow);

  await shot(cdp, OUT, 'date-picker.png');
  await evaluate(cdp, 'document.dispatchEvent(new MouseEvent("mousedown",{bubbles:true}))');
  await sleep(200);

  // ---------- 5. Esc 只关浮层（不关编辑器）----------
  await evaluate(cdp, 'document.querySelector("#edDate")?.click()');
  await sleep(300);
  const pickerOpen = await evaluate(cdp, '!!document.querySelector(".float-panel")');
  await key(cdp, 'Escape', 27);
  await sleep(300);
  const afterEsc = await evaluate(
    cdp,
    '({picker:!!document.querySelector(".float-panel"), editor:!!document.querySelector("#edTitle")})'
  );
  c.check('escape.picker', pickerOpen && !afterEsc.picker && afterEsc.editor, { pickerOpen, afterEsc });

  // 已知缺陷可能把编辑器一并关掉；后面的用例要有干净的编辑器
  await evaluate(cdp, 'closeModal(); openTaskEditor(null)');
  await sleep(400);

  // ---------- 6. 时间面板 ----------
  await evaluate(cdp, 'document.querySelector("#edTime")?.click()');
  await sleep(350);
  const timeCells = await evaluate(cdp, 'document.querySelectorAll(".float-panel .tm-cell").length');
  c.atLeast('picker.timeCells', timeCells, 24);
  await shot(cdp, OUT, 'time-picker.png');
  await evaluate(cdp, 'document.body.dispatchEvent(new MouseEvent("mousedown",{bubbles:true}))');
  await sleep(200);

  // ---------- 7. 标签多值 ----------
  const tagsBefore = await evaluate(cdp, 'document.querySelectorAll("#edTagsWrap [data-tagrm]").length');
  await evaluate(
    cdp,
    `(function(){var i=document.querySelector('#edTagInput');if(!i)return false;i.focus();i.value='工作 学习 健身';i.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));return true;})()`
  );
  await sleep(250);
  const tagsAfter = await evaluate(cdp, 'document.querySelectorAll("#edTagsWrap [data-tagrm]").length');
  c.check('tags.add', tagsBefore === 0 && tagsAfter === 3, { tagsBefore, tagsAfter });
  S.tagPickWidth = await evaluate(cdp, 'Math.round(document.querySelector("#edTagPick").getBoundingClientRect().width)');
  c.atLeast('tags.pickWidth', S.tagPickWidth, 40);
  await shot(cdp, OUT, 'tags.png');

  // ---------- 8. 模板选择器 ----------
  await evaluate(cdp, 'document.querySelector("#edTpl") && document.querySelector("#edTpl")?.click()');
  await sleep(400);
  const tplRows = await evaluate(cdp, 'document.querySelectorAll(".tpl-row").length');
  c.atLeast('tpl.rows', tplRows, 1);
  await shot(cdp, OUT, 'template.png');
  await evaluate(cdp, 'closeModal()');
  await sleep(250);
  c.check('tpl.closed', (await evaluate(cdp, '!document.querySelector(".tpl-row")')) === true);

  // ---------- 9. 悬停说明不压住输入框 ----------
  // 定位是异步的（floating-ui），必须等两帧再量；以前同步读，读到的其实是上一帧的空元素。
  const tip = await evaluate(
    cdp,
    `(async function(){
      var el = document.querySelector('.tip-i');
      if (!el) return null;
      showTip(el);
      await new Promise(function(r){ requestAnimationFrame(function(){ requestAnimationFrame(r); }); });
      var t = document.querySelector('.tip-layer').getBoundingClientRect();
      var f = document.querySelector('#edTitle').getBoundingClientRect();
      var a = el.getBoundingClientRect();
      var overlap = !(t.bottom <= f.top || t.top >= f.bottom || t.right <= f.left || t.left >= f.right);
      hideTip();
      return { text: (el.getAttribute('data-tip')||'').slice(0,12), overlapTitle: overlap,
               w: Math.round(t.width), h: Math.round(t.height),
               above: t.bottom <= a.top + 1,
               side: t.right <= a.left + 1 || t.left >= a.right - 1,
               ax: Math.round(a.left), ay: Math.round(a.top),
               l: Math.round(t.left), top: Math.round(t.top) };
    })()`
  );
  S.tip = tip;
  c.check(
    'tip.noOverlap',
    !!tip && tip.text.length > 0 && tip.overlapTitle === false && tip.w > 40 && tip.h > 10 &&
      (tip.above === true || tip.side === true) && tip.l >= 8 && tip.top >= 8,
    tip
  );

  // ---------- 9b. 图标：lucide 组件渲染，尺寸仍由 CSS 接管 ----------
  // .icon-btn svg 是 17px；若哪天忘了给 <Icon> 传 size，lucide 默认 24 会立刻在这里暴露
  const icon = await evaluate(
    cdp,
    `(function(){
      var s = document.querySelector('#btnBell svg');
      if (!s) return null;
      var cs = getComputedStyle(s);
      var r = s.getBoundingClientRect();
      return { cls: s.getAttribute('class'), fill: cs.fill, sw: cs.strokeWidth,
               w: Math.round(r.width), kids: s.children.length };
    })()`
  );
  S.icon = icon;
  c.check(
    'icon.render',
    !!icon && /lucide/.test(icon.cls || '') && icon.fill === 'none' && icon.kids > 0 && icon.w >= 15 && icon.w <= 19,
    icon
  );


  const tagPick = await evaluate(
    cdp,
    `(function(){
      var b = document.querySelector('#edTagPick');
      var before = Math.round(b.getBoundingClientRect().width);
      b?.click();
      var after = Math.round(b.getBoundingClientRect().width);
      document.body.dispatchEvent(new MouseEvent('mousedown', {bubbles:true}));
      return { before: before, after: after };
    })()`
  );
  S.tagPick = tagPick;
  c.check('tags.pickStable', !!tagPick && tagPick.before === tagPick.after, tagPick);

  // ---------- 11. 单次提醒下的「稍后提醒」 ----------
  await evaluate(cdp, 'document.querySelector("[data-rmode=\\"单次提醒\\"]")?.click()');
  await sleep(250);
  const snooze = await evaluate(
    cdp,
    "(function(){var c=document.querySelector('#edSnooze');return c?{exists:true,checked:c.checked,label:(c.parentNode.textContent||'').trim().slice(0,12)}:{exists:false};})()"
  );
  S.snooze = snooze;
  c.check('remind.snooze', !!snooze && snooze.exists === true, snooze);

  await evaluate(cdp, '(function(){var b=document.querySelector(".m-body"); if(b) b.scrollTop=b.scrollHeight; return true;})()');
  await sleep(300);
  await shot(cdp, OUT, 'editor-bottom.png');

  // ---------- 12. 时间面板写值 ----------
  // 先把可能残留的浮层关掉，保证从「面板已关」这个确定状态开始
  await evaluate(cdp, 'document.body.dispatchEvent(new MouseEvent("mousedown", {bubbles:true}))');
  await sleep(200);
  c.check('time.startsClosed', (await evaluate(cdp, '!!document.querySelector(".tm-panel")')) === false);

  await evaluate(cdp, 'document.querySelector("#edTime")?.click()');
  await sleep(350);
  c.check('time.opens', (await evaluate(cdp, '!!document.querySelector(".tm-panel")')) === true);

  await evaluate(cdp, `document.querySelector('.tm-col [data-h="15"]')?.click()`);
  await sleep(250);
  const afterHour = await evaluate(
    cdp,
    `(function(){return {value:(document.querySelector('#edTime').getAttribute('data-value')||''), open:!!document.querySelector('.tm-panel'), onHour:!!document.querySelector('.tm-cell.on[data-h="15"]')};})()`
  );
  S.timeAfterHour = afterHour;
  c.check('time.hour', afterHour.open === true && afterHour.onHour === true, afterHour);

  await evaluate(cdp, `document.querySelector('.tm-col [data-m="30"]')?.click()`);
  await sleep(280);
  const afterMinute = await evaluate(
    cdp,
    `(function(){return {value:(document.querySelector('#edTime').getAttribute('data-value')||''), open:!!document.querySelector('.tm-panel')};})()`
  );
  S.timeAfterMinute = afterMinute;
  c.check('time.minute', afterMinute.value === '15:30' && afterMinute.open === false, afterMinute);

  // 只点小时就点面板外，也要把小时写进去
  await evaluate(cdp, 'document.querySelector("#edTime")?.click()');
  await sleep(300);
  await evaluate(cdp, `document.querySelector('.tm-col [data-h="10"]')?.click()`);
  await sleep(180);
  await evaluate(cdp, 'document.body.dispatchEvent(new MouseEvent("mousedown", {bubbles:true}))');
  await sleep(300);
  const onBlur = await evaluate(
    cdp,
    `(function(){return {value:(document.querySelector('#edTime').getAttribute('data-value')||''), open:!!document.querySelector('.tm-panel')};})()`
  );
  S.timeOnBlur = onBlur;
  c.check('time.blur', onBlur.value.startsWith('10:') && onBlur.open === false, onBlur);

  // ---------- 13. 快速添加 ----------
  const quickDraft = await evaluate(
    cdp,
    "(function(){closeModal();openQuickAdd('');var v=document.querySelector('#qaInput').value;closeModal();return v;})()"
  );
  c.eq('quick.draft', quickDraft, '');

  const quickAdd = await evaluate(
    cdp,
    `(function(){
      closeModal(); openQuickAdd('明天下午3点开会 #工作');
      var i = document.querySelector('#qaInput');
      i.value = '明天下午3点开会 #工作';
      i.dispatchEvent(new Event('input', {bubbles:true}));
      document.querySelector('#qaMore')?.click();
      return new Promise(function(res){ setTimeout(function(){
        res({ title: (document.querySelector('#edTitle')||{}).value,
              date: (document.querySelector('#edDate')||{}).getAttribute('data-value'),
              time: (document.querySelector('#edTime')||{}).getAttribute('data-value') });
      }, 700); });
    })()`
  );
  S.quickAdd = quickAdd;
  const tomorrow = await evaluate(
    cdp,
    '(function(){var d=new Date();d.setDate(d.getDate()+1);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");})()'
  );
  c.check(
    'quick.more',
    !!quickAdd && quickAdd.title === '开会' && quickAdd.date === tomorrow && quickAdd.time === '15:00',
    { ...quickAdd, tomorrow }
  );
  await evaluate(cdp, 'closeModal()');
  await sleep(250);

  // ---------- 14. 套用模板 ----------
  const tplApply = await evaluate(
    cdp,
    `(function(){
      closeModal(); openTaskEditor(null);
      return new Promise(function(res){
        setTimeout(function(){
          document.querySelector('#edTpl')?.click();
          setTimeout(function(){
            var kw = document.querySelector('#tplKw');
            kw.value = '进行中';
            kw.dispatchEvent(new Event('input', {bubbles:true}));
            setTimeout(function(){
              var row = document.querySelector('.tpl-row');
              var srcTitle = row ? row.querySelector('.tpl-t').textContent : '';
              if (row) row?.click();
              setTimeout(function(){
                res({ srcTitle: srcTitle,
                      title: (document.querySelector('#edTitle')||{}).value,
                      list: (document.querySelector('#edList')||{}).value,
                      est: (document.querySelector('#edEst')||{}).value,
                      subs: document.querySelectorAll('#edSubs [data-subt]').length,
                      tplGone: !document.querySelector('.modal-mask.stacked') });
              }, 400);
            }, 250);
          }, 400);
        }, 500);
      });
    })()`
  );
  S.tplApply = tplApply;
  c.check(
    'tpl.apply',
    !!tplApply &&
      tplApply.srcTitle.length > 0 &&
      tplApply.title === '' &&
      tplApply.list.length > 0 &&
      tplApply.est !== '' &&
      tplApply.tplGone === true,
    tplApply
  );
  await evaluate(cdp, 'closeModal()');
  await sleep(250);

  // ---------- 15. 详情提醒节点 ----------
  const detailSingle = await evaluate(
    cdp,
    "(function(){openTaskDetail('t04');return Array.from(document.querySelectorAll('.eb-s')).map(n=>n.textContent);})()"
  );
  S.detailSingle = detailSingle;
  c.check(
    'detail.single',
    Array.isArray(detailSingle) && detailSingle.length > 0 && !detailSingle.includes('待复习'),
    detailSingle
  );
  await evaluate(cdp, 'closeModal()');
  await sleep(250);

  const detailEb = await evaluate(
    cdp,
    "(function(){openTaskDetail('t13');return {status:Array.from(document.querySelectorAll('.eb-s')).map(n=>n.textContent), labels:Array.from(document.querySelectorAll('.eb-l')).map(n=>n.textContent.trim())};})()"
  );
  S.detailEb = detailEb;
  c.check(
    'detail.eb',
    !!detailEb && detailEb.status.length > 0 && detailEb.labels.length > 0 && detailEb.labels.every((x) => x.length > 0),
    detailEb
  );
  await evaluate(cdp, 'closeModal()');
  await sleep(250);

  // ---------- 16. 切换详情必须换内容 ----------
  const detailSwitch = await evaluate(
    cdp,
    `(function(){
      var ta = __SD_TEST__.tasks.find(x=>x.id==='t04');
      var tb = __SD_TEST__.tasks.find(x=>x.id==='t13');
      openTaskDetail('t04');
      return new Promise(function(res){
        setTimeout(function(){
          openTaskDetail('t13');
          setTimeout(function(){
            res({ want: tb ? tb.title : '', got: (document.querySelector('.dt-title')||{}).textContent||'',
                  attr: (document.querySelector('[data-task]')?.getAttribute('data-task')) || '',
                  first: ta ? ta.title : '' });
          }, 400);
        }, 400);
      });
    })()`
  );
  S.detailSwitch = detailSwitch;
  c.check('detail.switch', !!detailSwitch && detailSwitch.got === detailSwitch.want && detailSwitch.attr === 't13', detailSwitch);
  await evaluate(cdp, 'closeModal()');
  await sleep(250);

  // ---------- 17. 确认框只挂一层 ----------
  const modalCount = await evaluate(
    cdp,
    `(function(){
      openTaskDetail('t04');
      return new Promise(function(res){
        setTimeout(function(){
          var del = document.querySelector('#dtDel');
          if (del) del?.click();
          setTimeout(function(){
            var n = document.querySelectorAll('#modalRoot .modal.sm').length;
            document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
            res({ sm: n });
          }, 350);
        }, 400);
      });
    })()`
  );
  S.modalCount = modalCount;
  c.eq('modal.single', modalCount && modalCount.sm, 1);
  await sleep(250);
  await evaluate(cdp, 'closeModal()');
  await sleep(200);

  // ---------- 18. 深色主题 ----------
  await evaluate(cdp, 'closeModal(); setTheme("dusk")');
  await sleep(450);
  await evaluate(cdp, 'openTaskEditor(null)');
  await sleep(400);
  await evaluate(cdp, 'document.querySelector("#edDate")?.click()');
  await sleep(350);
  await shot(cdp, OUT, 'dark-editor.png');
  const duskTokens = await evaluate(
    cdp,
    `(function(){var cs=getComputedStyle(document.documentElement);
      return { theme: document.documentElement.getAttribute('data-theme'),
               brand: cs.getPropertyValue('--brand').trim(), panel: cs.getPropertyValue('--panel').trim() };})()`
  );
  S.duskTokens = duskTokens;
  c.check('theme.dusk', !!duskTokens && duskTokens.theme === 'dusk' && duskTokens.brand.length > 0 && duskTokens.panel.length > 0, duskTokens);
  await evaluate(cdp, 'closeModal(); setTheme("paper")');
  await sleep(350);

  // ---------- 19. 铃铛 / 今日面板 / 时间面板紧凑度 ----------
  await evaluate(cdp, 'closeModal(); goView("today")');
  await sleep(350);

  const badge = await evaluate(
    cdp,
    `(function(){
      var b = document.getElementById('bellBadge');
      var i = document.querySelector('#btnBell svg');
      if (!b || !i) return { missing: true };
      var br = b.getBoundingClientRect(), ir = i.getBoundingClientRect();
      var overlap = !(br.bottom <= ir.top || br.top >= ir.bottom || br.right <= ir.left || br.left >= ir.right);
      return { missing:false, overlap: overlap, w: Math.round(br.width), top: Math.round(br.top),
               hidden: b.classList.contains('hidden'), alert: __SD_TEST__.alertCount() };
    })()`
  );
  S.badge = badge;
  c.check(
    'r3.badge',
    !!badge &&
      badge.missing === false &&
      (badge.alert === 0 || badge.hidden === false) &&
      (badge.hidden || (badge.w > 8 && badge.top >= 0)),
    badge
  );

  const ghostTransform = await evaluate(
    cdp,
    `(function(){var d=document.createElement('div');d.className='drag-ghost';document.body.appendChild(d);var t=getComputedStyle(d).transform;d.remove();return t;})()`
  );
  S.ghostTransform = ghostTransform;
  c.check('r3.ghost', ghostTransform === 'none', { ghostTransform });

  const todayPanel = await evaluate(
    cdp,
    `(function(){var rows=document.querySelectorAll('.today-row');var stat=document.querySelector('.today-head .stat');return {rows:rows.length, stat:stat?stat.textContent:'', titles:Array.from(rows).map(function(r){return (r.querySelector('.tt')||{}).textContent;})};})()`
  );
  S.todayPanel = todayPanel;
  c.check(
    'r3.todayPanel',
    !!todayPanel && todayPanel.rows > 0 && todayPanel.titles.every((x) => !!x) && String(todayPanel.stat).length > 0,
    todayPanel
  );

  const tm = await evaluate(
    cdp,
    `(function(){openTaskEditor(null);return new Promise(function(res){setTimeout(function(){
      document.querySelector('#edTime')?.click();
      setTimeout(function(){
        var body=document.querySelector('.tm-body'); var chip=document.querySelector('.tm-quick .cal-quick');
        res({ width: body?Math.round(body.getBoundingClientRect().width):0,
              quickClass: chip?chip.className:'',
              quickBg: chip?getComputedStyle(chip).backgroundColor:'' });
      }, 300);
    }, 400);});})()`
  );
  S.tm = tm;
  c.check('r3.tm', !!tm && tm.width > 100 && /cal-quick/.test(tm.quickClass));
  await shot(cdp, OUT, 'time-picker.png');
  await evaluate(cdp, 'document.body.dispatchEvent(new MouseEvent("mousedown",{bubbles:true}))');
  await sleep(200);

  // ---------- 20. 艾宾浩斯基准只读 ----------
  const ebAnchor = await evaluate(
    cdp,
    `(function(){
      document.querySelector('[data-rmode="艾宾浩斯"]')?.click();
      return new Promise(function(res){ setTimeout(function(){
        var ro = document.querySelector('#edAnchorRo');
        var date = document.querySelector('#edAnchorDate');
        var free = document.querySelector('#edAnchor');
        res({ hasRo: !!ro, roText: ro?(ro.textContent||''):'', hasDate: !!date, hasFreeInput: !!free });
      }, 350); });
    })()`
  );
  S.ebAnchor = ebAnchor;
  c.check(
    'r3.ebAnchor',
    !!ebAnchor &&
      (ebAnchor.hasRo || ebAnchor.hasDate) &&
      ebAnchor.hasFreeInput === false &&
      (!ebAnchor.hasRo || ebAnchor.roText.length > 0),
    ebAnchor
  );
  await evaluate(cdp, 'closeModal()');
  await sleep(250);

  // ---------- 21. 习惯视图与编辑器 ----------
  await evaluate(cdp, 'goView("habit")');
  await sleep(450);
  const habit = await evaluate(
    cdp,
    `(function(){
      var card=document.querySelector('.hcard');
      if(!card) return { cards: 0 };
      var hasEdit=!!card.querySelector('.h-edit');
      card.querySelector('.h-edit')?.click();
      return { cards: document.querySelectorAll('.hcard').length, hasEdit: hasEdit, grid: !!card.querySelector('.hheat') };
    })()`
  );
  S.habit = habit;
  c.check('r3.habit', !!habit && habit.cards > 0 && habit.hasEdit === true && habit.grid === true, habit);
  await sleep(500);
  const habitPanel = await evaluate(cdp, '!!document.querySelector(".modal-mask.panel")');
  c.check('r3.habitPanel', habitPanel === true, { habitPanel });
  await shot(cdp, OUT, 'habit-editor.png');
  await evaluate(cdp, 'closeModal()');
  await sleep(250);

  // ---------- 22. 年视图当天色块 ----------
  const yearToday = await evaluate(
    cdp,
    `(function(){
      goView('calendar'); setCal({ cursor: today0(), calMode: 'year' });
      return new Promise(function(res){ setTimeout(function(){
        var n=document.querySelector('.yday.today .ynum');
        if(!n) return res(null);
        var cs=getComputedStyle(n);
        res({ bg: cs.backgroundColor, color: cs.color, shadow: cs.boxShadow.slice(0,60),
              months: document.querySelectorAll('.ymini').length });
      }, 500); });
    })()`
  );
  S.yearToday = yearToday;
  c.check(
    'r3.yearToday',
    !!yearToday && yearToday.months === 12 && yearToday.bg !== 'rgba(0, 0, 0, 0)',
    yearToday
  );
  await shot(cdp, OUT, 'year-view.png');
  await evaluate(cdp, 'setCal({ calMode: "month" }); goView("today")');
  await sleep(350);

  // ---------- 22.5 窄屏抽屉入口 ----------
  await resize(cdp, 860, 800);
  await sleep(450);
  const menuBtn = await evaluate(
    cdp,
    `(function(){var b=document.getElementById('btnMenu');if(!b)return null;var cs=getComputedStyle(b);return {display:cs.display,w:Math.round(b.getBoundingClientRect().width)};})()`
  );
  c.check('nav.menuNarrow', !!menuBtn && menuBtn.display !== 'none' && menuBtn.w > 8, menuBtn);
  await evaluate(cdp, `document.getElementById('btnMenu')?.click()`);
  await sleep(350);
  c.check(
    'nav.drawerOpens',
    (await evaluate(cdp, `!!document.getElementById('drawerMask')?.classList.contains('in')`)) === true
  );
  await evaluate(cdp, `__SD_TEST__.goView('today')`);
  await sleep(250);
  await resize(cdp, 1280, 800);
  await sleep(300);

  // ---------- 22.6 设置：引用与致谢逐项登记 ----------
  // 这块在 R11 曾从「6 条逐项登记」被压成一段话，丢掉图标/配色/字体/节假日等条目，
  // 而当时所有断言都盖不到设置面板。这里钉住条目数与关键字。
  await evaluate(cdp, `__SD_TEST__.openSettings ? __SD_TEST__.openSettings() : document.getElementById('btnSettings')?.click()`);
  await sleep(450);
  const credits = await evaluate(
    cdp,
    `(function(){
       var f = Array.from(document.querySelectorAll('.m-body .field'))
         .find(function(x){ return /引用与致谢/.test(x.textContent); });
       if (!f) return null;
       var box = f.querySelector('div');
       var text = box ? box.textContent : '';
       var foot = document.querySelector('.m-foot');
       // 只取 label 自身文字，不含 <span class="hint">：使用说明的 hint 里会提到「艾宾浩斯」
       var labels = Array.from(document.querySelectorAll('.m-body .field > label'))
                        .map(function(l){ var n = l.childNodes[0];
                          return n ? String(n.textContent || '').trim() : ''; });
       var helpBtn = document.getElementById('stHelp');
       return { lines: box ? box.querySelectorAll('br').length + 1 : 0,
                hint: /外部依赖逐项登记/.test(f.querySelector('label').textContent),
                text: text,
                footAuthor: foot ? /作者 workbuddy & bjl101501/.test(foot.textContent) : false,
                has: ['Lucide', '@floating-ui/dom', 'Digital-7', 'holiday.ailcc.com',
                      'LXGW WenKai GB', 'Tauri 2', 'WebDAV', '#177CB0']
                       .filter(function(k){ return text.indexOf(k) === -1; }),
                // 使用说明必须自成一行（独占一个 field，按钮撑满该行），且挪出「数据存储」
                helpOwn: !!helpBtn && !!helpBtn.closest('.field') &&
                         helpBtn.closest('.field').querySelectorAll('button').length === 1 &&
                         Math.round(helpBtn.getBoundingClientRect().width) > 400,
                helpInStore: /使用说明/.test((document.querySelector('#sdOpenDir')||{}).parentElement?.textContent || ''),
                // 危险操作在致谢之前；艾宾浩斯已迁到使用说明
                dangerBeforeCredit: labels.indexOf('危险操作') > -1 &&
                                    labels.indexOf('危险操作') < labels.findIndex(function(x){ return /引用与致谢/.test(x); }),
                ebbinghausMoved: !labels.some(function(x){ return /艾宾浩斯/.test(x); }) };
     })()`
  );
  S.credits = credits;
  c.check(
    'settings.credits',
    !!credits && credits.lines >= 7 && credits.hint === true && credits.has.length === 0 && credits.footAuthor === true,
    credits ? { lines: credits.lines, hint: credits.hint, missing: credits.has, footAuthor: credits.footAuthor } : null
  );
  c.check(
    'settings.layout',
    !!credits && credits.helpOwn === true && credits.helpInStore === false &&
      credits.dangerBeforeCredit === true && credits.ebbinghausMoved === true,
    credits ? { helpOwn: credits.helpOwn, helpInStore: credits.helpInStore,
                dangerBeforeCredit: credits.dangerBeforeCredit, ebbinghausMoved: credits.ebbinghausMoved } : null
  );
  await shot(cdp, OUT, 'settings.png');
  await evaluate(cdp, `document.querySelector('.m-foot .btn-pri')?.click()`);
  await sleep(300);

  // ---------- 23. 未捕获异常 ----------
  const errs = exceptions(cdp);
  report.errors = errs;
  c.check('errors.none', errs.length === 0, errs);

  // ---------- 24. 更新通道（联网，只取样不断言）----------
  report.update = await probe(cdp, 'window.__TAURI_INTERNALS__.invoke("update_check")');

  // 把断言总数写进报告：文档里的「N 条断言」以这个数为准，别再手数
  report.total = c.checks.length;
  report.passed = c.checks.filter((x) => x.ok).length;
  settle(report, c, KNOWN_FAIL, STRICT);
  delete report.checks;
  fs.writeFileSync(path.join(OUT, 'ui-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  cdp.ws.close();
}

main().catch((e) => {
  console.error('UI_CHECK_FAILED:', e.message);
  process.exit(1);
});
