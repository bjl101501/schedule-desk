// UI 回归检查：状态矩阵 + 编辑器交互 + 截图
// 用法：node ui-check.mjs <输出目录> [端口]
import fs from "node:fs";
import path from "node:path";

const OUT = process.argv[2] || ".";
const PORT = process.argv[3] || "9222";
const ENDPOINT = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`${ENDPOINT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error("CDP endpoint not reachable");
}

function connect(url) {
  const ws = new WebSocket(url);
  const pending = new Map();
  const events = [];
  let seq = 0;
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    } else if (msg.method) {
      events.push(msg);
    }
  });
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  return { ws, ready, send, events };
}

async function evaluate(cdp, expression) {
  const res = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (res.exceptionDetails) {
    return { __error: res.exceptionDetails.exception?.description || "eval failed" };
  }
  return res.result?.value;
}

async function shot(cdp, name) {
  const res = await cdp.send("Page.captureScreenshot", { format: "png" });
  const file = path.join(OUT, name);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(file, Buffer.from(res.data, "base64"));
  return file;
}

// v2.2.0 口径：结束时刻看「计划结束 / 开始+用时 / 全天 24:00」三者
const EXPECT = {
  t01: "ongoing",     // 开始+时长，已过 20 分
  t02: "overdue",     // 开始+时长，已过 90 分
  t03: "overdue",     // 定时无时长，到点即逾期
  t04: "remindSoon",  // 未开始，提前提醒已到点，无时长
  t05: "ongoing",     // 全天
  t06: "overdue",     // 全天，昨天
  t07: "ongoing",     // 计划到结束日 24:00
  t08: "overdue",     // 计划 + 结束时间已过
  t09: "upcoming",    // 未开始，有时长，提前提醒已到点
  t10: "planned",     // 明天
  t11: "done",
  t12: "ongoing",     // 全天 + 时长仍是全天
  t13: "overdue",     // 艾宾浩斯，基准已过
  t14: "ongoing",     // 定时 1 分钟前开始，用时 45 分钟
  t15: "ongoing",     // 计划与用时取更晚（计划 2 小时后）
  t17: "overdue",     // 计划结束日是昨天 24:00
  t18: "planned",     // 计划跨天，还没开始
};

async function main() {
  const page = await target();
  const cdp = connect(page.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  await sleep(3500);

  const report = {};
  report.hasState = await evaluate(cdp, "typeof taskState === 'function'");
  report.hasKit = await evaluate(cdp, "typeof mountDateField === 'function'");
  report.hasScheduler = await evaluate(cdp, "typeof Scheduler === 'object' && !!Scheduler.timer");
  report.count = await evaluate(cdp, "S.tasks.length");

  report.states = await evaluate(
    cdp,
    `S.tasks.map(t => { const s = taskState(t); return { id: t.id, title: t.title, key: s.key, label: s.label }; })`
  );

  const mismatches = [];
  (report.states || []).forEach((s) => {
    if (!s || !s.id) return;
    const want = EXPECT[s.id];
    if (want && s.key !== want) mismatches.push({ id: s.id, want, got: s.key, label: s.label });
  });
  report.mismatches = mismatches;

  // 列表与今日面板渲染
  report.listText = await evaluate(cdp, "(document.querySelector('.content, #content')||{}).innerText?.slice(0,200)");
  report.chips = await evaluate(
    cdp,
    `Array.from(document.querySelectorAll('[data-state-id]')).map(n => ({id:n.dataset.stateId, text:n.textContent, cls:n.className}))`
  );

  // 打开新建日程
  await evaluate(cdp, "openTaskEditor(null)");
  await sleep(500);
  report.editorOpen = await evaluate(cdp, "!!document.querySelector('#edTitle')");
  report.dateText = await evaluate(cdp, "document.querySelector('#edDate')?.textContent");
  report.estPlaceholder = await evaluate(cdp, "document.querySelector('#edEst')?.placeholder");
  report.autocomplete = await evaluate(
    cdp,
    `Array.from(document.querySelectorAll('#modalRoot input, #modalRoot textarea')).map(e => e.getAttribute('autocomplete'))`
  );
  report.labels = await evaluate(
    cdp,
    `Array.from(document.querySelectorAll('#modalRoot .ed-sec .field > label')).map(l => {
      const r = l.getBoundingClientRect();
      const t = l.querySelector('.tip-i');
      const tr = t ? t.getBoundingClientRect() : null;
      return { text: (l.textContent||'').slice(0,10), w: Math.round(r.width), h: Math.round(r.height),
               tipY: tr ? Math.round(tr.y - r.y) : null };
    })`
  );
  await shot(cdp, "editor.png");

  // 日期面板
  await evaluate(cdp, "document.querySelector('#edDate').click()");
  await sleep(350);
  report.calCells = await evaluate(cdp, "document.querySelectorAll('.float-panel [data-day]').length");
  report.calOpen = report.calCells > 0;
  report.calLayout = await evaluate(
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
    })()`);
  await shot(cdp, "date-picker.png");
  await evaluate(cdp, "document.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}))");
  await sleep(200);

  // 时间面板
  await evaluate(cdp, "document.querySelector('#edTime').click()");
  await sleep(350);
  report.timeOpen = await evaluate(cdp, "document.querySelectorAll('.float-panel .tm-cell').length");
  await shot(cdp, "time-picker.png");
  await evaluate(cdp, "document.body.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}))");
  await sleep(200);

  // 标签多值
  report.tagsBefore = await evaluate(cdp, "document.querySelectorAll('#edTagsWrap [data-tagrm]').length");
  await evaluate(
    cdp,
    `(function(){var i=document.querySelector('#edTagInput');i.focus();i.value='工作 学习 健身';i.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));return true;})()`
  );
  await sleep(200);
  report.tagsAfter = await evaluate(cdp, "document.querySelectorAll('#edTagsWrap [data-tagrm]').length");
  report.tagPickWidth = await evaluate(
    cdp,
    "Math.round(document.querySelector('#edTagPick').getBoundingClientRect().width)"
  );
  await shot(cdp, "tags.png");

  // 模板选择器
  await evaluate(cdp, "document.querySelector('#edTpl') && document.querySelector('#edTpl').click()");
  await sleep(350);
  report.tplRows = await evaluate(cdp, "document.querySelectorAll('.tpl-row').length");
  await shot(cdp, "template.png");
  await evaluate(cdp, "closeModal()");
  await sleep(200);

  // 悬停说明：直接调用显示，检查是否压住输入框
  report.tip = await evaluate(
    cdp,
    `(function(){
      var el = document.querySelector('.tip-i');
      if (!el) return null;
      showTip(el);
      var tip = document.querySelector('.tip-layer').getBoundingClientRect();
      var field = document.querySelector('#edTitle').getBoundingClientRect();
      var overlap = !(tip.bottom <= field.top || tip.top >= field.bottom || tip.right <= field.left || tip.left >= field.right);
      hideTip();
      return { text: el.getAttribute('data-tip').slice(0,12), overlapTitle: overlap };
    })()`
  );

  // R2：标签按钮打开后宽度不应变化
  report.tagPick = await evaluate(
    cdp,
    `(function(){
      var b = document.querySelector('#edTagPick');
      var before = Math.round(b.getBoundingClientRect().width);
      b.click();
      var after = Math.round(b.getBoundingClientRect().width);
      document.body.dispatchEvent(new MouseEvent('mousedown', {bubbles:true}));
      return { before: before, after: after };
    })()`
  );

  // R2：单次提醒下的「稍后提醒」
  await evaluate(cdp, "document.querySelector('[data-rmode=\"单次提醒\"]').click()");
  await sleep(250);
  report.snooze = await evaluate(
    cdp,
    "(function(){var c=document.querySelector('#edSnooze');return c?{exists:true,checked:c.checked,label:(c.parentNode.textContent||'').trim()}:{exists:false};})()"
  );

  await evaluate(cdp, "(function(){var b=document.querySelector('.m-body'); if(b) b.scrollTop=b.scrollHeight; return true;})()");
  await sleep(300);
  await shot(cdp, "editor-bottom.png");

  // R2：选时间后应写入并关闭
  await evaluate(cdp, "document.querySelector('[data-rmode=\"不提醒\"]').click()");
  await sleep(150);
  await evaluate(cdp, "document.querySelector('#edTime').click()");
  await sleep(300);
  await evaluate(cdp, "document.querySelector('.tm-col [data-h=\"15\"]').click()");
  await sleep(150);
  report.timeAfterHour = await evaluate(
    cdp,
    "(function(){return {value:document.querySelector('#edTime').value, open:!!document.querySelector('.tm-panel')};})()"
  );
  await evaluate(cdp, "document.querySelector('.tm-col [data-m=\"30\"]').click()");
  await sleep(250);
  report.timeAfterMinute = await evaluate(
    cdp,
    "(function(){return {value:document.querySelector('#edTime').value, open:!!document.querySelector('.tm-panel')};})()"
  );

  // R2：只点小时、点面板外，也要把小时写进去
  await evaluate(cdp, "document.querySelector('#edTime').click()");
  await sleep(250);
  await evaluate(cdp, "document.querySelector('.tm-col [data-h=\"10\"]').click()");
  await sleep(120);
  await evaluate(cdp, "document.body.dispatchEvent(new MouseEvent('mousedown', {bubbles:true}))");
  await sleep(250);
  report.timeOnBlur = await evaluate(
    cdp,
    "(function(){return {value:document.querySelector('#edTime').value, open:!!document.querySelector('.tm-panel')};})()"
  );

  // R2：快速添加不再回填草稿
  report.quickDraft = await evaluate(
    cdp,
    "(function(){closeModal();openQuickAdd('');var v=document.querySelector('#qaInput').value;closeModal();return v;})()"
  );

  // 快速添加 → 更多选项
  report.quickAdd = await evaluate(
    cdp,
    `(function(){
      closeModal(); openQuickAdd('明天下午3点开会 #工作');
      var i = document.querySelector('#qaInput');
      i.value = '明天下午3点开会 #工作';
      i.dispatchEvent(new Event('input', {bubbles:true}));
      document.querySelector('#qaMore').click();
      return new Promise(function(res){ setTimeout(function(){
        res({ title: (document.querySelector('#edTitle')||{}).value,
              date: (document.querySelector('#edDate')||{}).value,
              time: (document.querySelector('#edTime')||{}).value });
      }, 700); });
    })()`
  );
  await evaluate(cdp, "closeModal()");
  await sleep(200);

  // 套用模板
  report.tplApply = await evaluate(
    cdp,
    `(function(){
      openTaskEditor(null);
      return new Promise(function(res){
        setTimeout(function(){
          document.querySelector('#edTpl').click();
          setTimeout(function(){
            var kw = document.querySelector('#tplKw');
            kw.value = '子项';
            kw.dispatchEvent(new Event('input', {bubbles:true}));
            setTimeout(function(){
              var row = document.querySelector('.tpl-row');
              var srcTitle = row ? row.querySelector('.tpl-t').textContent : '';
              if (row) row.click();
              setTimeout(function(){
                res({ srcTitle: srcTitle,
                      title: (document.querySelector('#edTitle')||{}).value,
                      list: (document.querySelector('#edList')||{}).value,
                      est: (document.querySelector('#edEst')||{}).value,
                      tags: document.querySelectorAll('#edTagsWrap [data-tagrm]').length,
                      subs: document.querySelectorAll('#edSubs [data-subt]').length,
                      planOn: !!(document.querySelector('#edPlanOn')||{}).checked, endDate: (document.querySelector('#edEndDate')||{}).value });
              }, 400);
            }, 250);
          }, 400);
        }, 500);
      });
    })()`
  );
  await evaluate(cdp, "closeModal()");
  await sleep(200);

  // 详情里的提醒节点状态：单次提醒不能出现「待复习」
  await evaluate(cdp, "closeModal()");
  await sleep(200);
  report.detailSingle = await evaluate(
    cdp,
    "(function(){openTaskDetail('t04');return Array.from(document.querySelectorAll('.eb-s')).map(n=>n.textContent);})()"
  );
  await evaluate(cdp, "closeModal()");
  await sleep(200);
  report.detailEb = await evaluate(
    cdp,
    "(function(){openTaskDetail('t13');return {status:Array.from(document.querySelectorAll('.eb-s')).map(n=>n.textContent), labels:Array.from(document.querySelectorAll('.eb-l')).map(n=>n.textContent.trim())};})()"
  );
  await evaluate(cdp, "closeModal()");
  await sleep(200);

  // 深色主题下的编辑器与日期面板
  await evaluate(cdp, "closeModal(); setTheme('dusk')");
  await sleep(400);
  await evaluate(cdp, "openTaskEditor(null)");
  await sleep(400);
  await evaluate(cdp, "document.querySelector('#edDate').click()");
  await sleep(350);
  await shot(cdp, "dark-editor.png");
  await evaluate(cdp, "closeModal(); setTheme('paper')");
  await sleep(300);

  // ---------- R3 ----------
  await evaluate(cdp, "closeModal(); goView('today')");
  await sleep(300);
  report.r3 = {};
  report.r3.select = await evaluate(cdp, "getComputedStyle(document.body).userSelect");
  report.r3.badge = await evaluate(
    cdp,
    `(function(){
      var b = document.getElementById('bellBadge');
      var i = document.querySelector('#btnBell svg');
      if (!b || !i) return null;
      var br = b.getBoundingClientRect(), ir = i.getBoundingClientRect();
      var overlap = !(br.bottom <= ir.top || br.top >= ir.bottom || br.right <= ir.left || br.left >= ir.right);
      return { overlap: overlap, badge: [Math.round(br.left), Math.round(br.top)] };
    })()`
  );
  report.r3.ghost = await evaluate(
    cdp,
    `(function(){var d=document.createElement('div');d.className='drag-ghost';document.body.appendChild(d);var t=getComputedStyle(d).transform;d.remove();return t;})()`
  );
  report.r3.todayPanel = await evaluate(
    cdp,
    `(function(){var rows=document.querySelectorAll('.today-row');var stat=document.querySelector('.today-head .stat');return {rows:rows.length, stat:stat?stat.textContent:'', titles:Array.from(rows).map(function(r){return (r.querySelector('.tt')||{}).textContent;})};})()`
  );

  // 时间面板紧凑度
  await evaluate(cdp, "openTaskEditor(null)");
  await sleep(400);
  await evaluate(cdp, "document.querySelector('#edTime').click()");
  await sleep(300);
  report.r3.tm = await evaluate(
    cdp,
    `(function(){
      var body=document.querySelector('.tm-body'); var chip=document.querySelector('.tm-quick .cal-quick');
      return { width: body?Math.round(body.getBoundingClientRect().width):0,
               quickClass: chip?chip.className:'',
               quickBg: chip?getComputedStyle(chip).backgroundColor:'' };
    })()`
  );
  await shot(cdp, "time-picker.png");
  await evaluate(cdp, "document.body.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}))");
  await sleep(200);

  // 艾宾浩斯基准时间跟随
  report.r3.eb = await evaluate(
    cdp,
    `(function(){
      document.querySelector('[data-rmode="艾宾浩斯"]').click();
      var ro = document.querySelector('#edAnchorRo');
      var inp = document.querySelector('#edAnchor');
      return { hasRo: !!ro, roText: ro?ro.textContent:'', hasInput: !!inp };
    })()`
  );
  await evaluate(cdp, "closeModal()");
  await sleep(200);

  // 习惯卡与习惯编辑面板
  await evaluate(cdp, "goView('habit')");
  await sleep(400);
  report.r3.habit = await evaluate(
    cdp,
    `(function(){
      var card=document.querySelector('.hcard');
      if(!card) return null;
      var hasEdit=!!card.querySelector('.h-edit');
      var hasDel=!!card.querySelector('[data-hdel]');
      if(card.querySelector('.h-edit')) card.querySelector('.h-edit').click();
      return { hasEdit: hasEdit, hasDel: hasDel, panel: !!document.querySelector('.modal-mask.panel') };
    })()`
  );
  await sleep(400);
  report.r3.habitPanel = await evaluate(cdp, "!!document.querySelector('.modal-mask.panel')");
  await shot(cdp, "habit-editor.png");
  await evaluate(cdp, "closeModal()");
  await sleep(200);

  // 年视图当天色块
  await evaluate(cdp, "goView('calendar'); S.cursor = today0(); S.calMode = 'year'; refreshAll()");
  await sleep(500);
  report.r3.yearToday = await evaluate(
    cdp,
    `(function(){
      var n=document.querySelector('.yday.today .ynum');
      if(!n) return null;
      var cs=getComputedStyle(n);
      return { bg: cs.backgroundColor, color: cs.color, shadow: cs.boxShadow.slice(0,60) };
    })()`
  );
  await shot(cdp, "year-view.png");
  await evaluate(cdp, "S.calMode='month'; goView('today')");
  await sleep(300);

  // 更新通道：验证 https 真的能走通（TLS 修复的验收点）
  report.update = await evaluate(cdp, "window.__TAURI_INTERNALS__.invoke('update_check')");

  report.errors = cdp.events
    .filter((e) => e.method === "Runtime.exceptionThrown")
    .map((e) => e.params?.exceptionDetails?.exception?.description || e.params?.exceptionDetails?.text)
    .slice(0, 8);

  console.log(JSON.stringify(report, null, 2));
  cdp.ws.close();
  if (mismatches.length) process.exitCode = 2;
}

main().catch((e) => {
  console.error("UI_CHECK_FAILED:", e.message);
  process.exit(1);
});
