// 行为验收：数据安全、导入、提醒闭环、拖拽、面板调宽、弹窗复位
// 用法：node remedy-check.mjs <输出目录> [端口]
import fs from 'node:fs';
import { target, connect, evaluate, shot, sleep, drag, doubleClick, key, resize, exceptions } from './lib/cdp.mjs';

const OUT = process.argv[2] || '.';
const PORT = process.argv[3] || '9222';
fs.mkdirSync(OUT, { recursive: true });

async function main() {
  const t = await target(PORT);
  const cdp = connect(t.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  // 面板相关断言依赖视口宽度，钉死 1280×800
  await resize(cdp, 1280, 800);

  const report = {};
  const rows = [];
  const ck = (id, ok, detail) => {
    rows.push({ id, ok: !!ok, detail });
    return !!ok;
  };

  // ---------- 1. 提醒闭环：知道了之后角标下降，reload 后不回弹 ----------
  const pend = await evaluate(
    cdp,
    `(() => {
      const t = __SD_TEST__.tasks.find(x => x.remindCfg && x.remindCfg.anchor);
      if (!t) return null;
      const st = __SD_TEST__.reminderState(t, Date.now());
      return { id: t.id, idx: st ? st.idx : -1, hasCfg: !!t.remindCfg };
    })()`
  );
  report.remind = { target: pend };
  if (pend && pend.idx >= 0) {
    report.remind.before = await evaluate(cdp, '__SD_TEST__.alertCount()');
    await evaluate(cdp, `window.__SD_TEST__.markRead(${JSON.stringify(pend.id)}, ${pend.idx})`);
    await sleep(350);
    report.remind.after = await evaluate(cdp, '__SD_TEST__.alertCount()');
    await cdp.send('Page.reload');
    await sleep(2600);
    report.remind.afterReload = await evaluate(
      cdp,
      `(() => { const t = __SD_TEST__.tasks.find(x => x.id === ${JSON.stringify(pend.id)}); return t ? (t.remindCfg.read || []).length : -1; })()`
    );
    report.remind.ok = report.remind.after <= report.remind.before && report.remind.afterReload > 0;
  } else {
    report.remind.ok = false;
  }
  ck('remind.read', report.remind.ok, report.remind);

  // ---------- 2. 真清空：清完 + reload 仍为空 ----------
  report.clear = {};
  report.clear.before = await evaluate(cdp, '__SD_TEST__.counts.tasks');
  await evaluate(cdp, 'window.__SD_TEST__.clearAll()');
  await sleep(600);
  report.clear.after = await evaluate(cdp, '__SD_TEST__.counts.tasks');
  report.clear.seeded = await evaluate(cdp, "localStorage.getItem('wb_schedule_seeded')");
  await cdp.send('Page.reload');
  await sleep(2800);
  report.clear.afterReload = await evaluate(cdp, '__SD_TEST__.counts.tasks');
  report.clear.ok = report.clear.before > 0 && report.clear.after === 0 && report.clear.afterReload === 0;
  ck('clear.persist', report.clear.ok, report.clear);

  // ---------- 3. 真追加导入：导两次 = 两倍，reload 后仍在 ----------
  const bundle = JSON.stringify({
    app: '日程台',
    tasks: [
      { title: '导入样例 A', date: '2026-11-02', time: '09:30', estimate: 30, tags: ['导入'] },
      { title: '导入样例 B', date: '2026-11-03', list: '测试', prio: 'P1' }
    ],
    habits: [{ name: '导入习惯', icon: 'sun', color: '#177CB0', target: 5 }],
    countdowns: [{ name: '导入纪念日', type: '生日', date: '2026-12-01', group: '' }]
  });
  await evaluate(cdp, `window.__SD_TEST__.importText(${JSON.stringify(bundle)}, 'append')`);
  await sleep(400);
  const first = await evaluate(cdp, '__SD_TEST__.counts');
  await evaluate(cdp, `window.__SD_TEST__.importText(${JSON.stringify(bundle)}, 'append')`);
  await sleep(400);
  const second = await evaluate(cdp, '__SD_TEST__.counts');
  const ids = await evaluate(cdp, '__SD_TEST__.tasks.map(t => t.id)');
  report.import = {
    first: first.tasks,
    second: second.tasks,
    unique: new Set(ids).size === ids.length,
    noEmpty: ids.every((x) => !!x),
    habits: second.habits,
    countdowns: second.countdowns
  };
  await cdp.send('Page.reload');
  await sleep(2800);
  const afterReload = await evaluate(cdp, '__SD_TEST__.counts');
  report.import.afterReload = afterReload.tasks;
  report.import.ok =
    first.tasks === 2 && second.tasks === 4 && report.import.unique && report.import.noEmpty && afterReload.tasks === 4;
  ck('import.append', report.import.ok, report.import);

  // ---------- 4. 快捷键 3 → 四象限 ----------
  await key(cdp, '3', 51);
  await sleep(350);
  report.keyboard = { view: await evaluate(cdp, '__SD_TEST__.counts.view') };
  report.keyboard.ok = report.keyboard.view === 'quadrant';
  ck('keyboard.digit', report.keyboard.ok, report.keyboard);

  // ---------- 5. 列表拖拽排序 ----------
  await evaluate(cdp, "__SD_TEST__.goView('next7')");
  await sleep(650);
  const rows2 = await evaluate(
    cdp,
    `Array.from(document.querySelectorAll('.task-list [data-tid]')).slice(0, 2).map(n => {
       const r = n.getBoundingClientRect();
       return { id: n.getAttribute('data-tid'), x: r.left + r.width / 2, y: r.top + r.height / 2 };
     })`
  );
  report.drag = { rows: rows2.map((r) => r.id) };
  if (rows2.length === 2) {
    await drag(cdp, rows2[0], rows2[1]);
    const order = await evaluate(
      cdp,
      "Array.from(document.querySelectorAll('.task-list [data-tid]')).slice(0, 2).map(n => n.getAttribute('data-tid'))"
    );
    report.drag.after = order;
    report.drag.sortText = await evaluate(cdp, "document.querySelector('#btnSort .txt')?.textContent");
    report.drag.ghostGone = await evaluate(cdp, "!document.querySelector('.drag-ghost')");
    report.drag.ok = order[0] === rows2[1].id && order[1] === rows2[0].id && report.drag.ghostGone;
  } else {
    report.drag.ok = false;
  }
  ck('drag.list', report.drag.ok, report.drag);

  // ---------- 5b. 幽灵跟手：抓点相对光标不能漂 ----------
  const startPt = await evaluate(
    cdp,
    `(function(){
       const row = document.querySelector('.task-list [data-tid]');
       if (!row) return null;
       const r = row.getBoundingClientRect();
       return { x: Math.round(r.left + 120), y: Math.round(r.top + 20), grab: 20 };
     })()`
  );
  if (startPt) {
    const move = (y, buttons) =>
      cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: startPt.x, y, buttons });
    await move(startPt.y, 0);
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x: startPt.x, y: startPt.y, button: 'left', clickCount: 1
    });
    const offs = [];
    for (const dy of [12, 40, 70]) {
      await move(startPt.y + dy, 1);
      await sleep(60);
      offs.push(
        await evaluate(
          cdp,
          `(function(){ const g = document.querySelector('.drag-ghost'); if (!g) return null;
             return Math.round(g.getBoundingClientRect().top) - ${startPt.y + dy}; })()`
        )
      );
    }
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: startPt.x, y: startPt.y + 70, button: 'left', clickCount: 1
    });
    await sleep(250);
    report.follow = { offs, grab: startPt.grab };
    report.follow.ok = offs.every((o) => o !== null && Math.abs(o + startPt.grab) <= 1);
    ck('drag.follow', report.follow.ok, report.follow);
  } else {
    ck('drag.follow', false, { reason: 'no row' });
  }

  // ---------- 5c. 列表里拖到另一日期分组 = 改日期 ----------
  const regroup = await evaluate(
    cdp,
    `(function(){
       const lists = Array.from(document.querySelectorAll('.task-list'))
         .filter(l => { const d = l.getAttribute('data-gdate'); return d && d !== 'done'; });
       if (lists.length < 2) return null;
       const home = lists[0], target = lists[1];
       const row = home.querySelector('[data-tid]');
       if (!row) return null;
       const trow = target.querySelector('[data-tid]') || target;
       const a = row.getBoundingClientRect(), b = trow.getBoundingClientRect();
       const id = row.getAttribute('data-tid');
       return { id,
                from: { x: Math.round(a.left + 120), y: Math.round(a.top + a.height / 2) },
                to: { x: Math.round(b.left + 120), y: Math.round(b.top + b.height / 2) },
                want: target.getAttribute('data-gdate'),
                was: (__SD_TEST__.tasks.find(x => x.id === id) || {}).date };
     })()`
  );
  if (regroup && regroup.was !== regroup.want) {
    await drag(cdp, regroup.from, regroup.to);
    const got = await evaluate(
      cdp,
      `(function(){
         const t = __SD_TEST__.tasks.find(x => x.id === ${JSON.stringify(regroup.id)});
         return { date: t && t.date, toast: (document.querySelector('.toast') || {}).textContent || '' };
       })()`
    );
    report.regroup = { ...regroup, got, ok: got.date === regroup.want && /已改到/.test(got.toast) };
  } else {
    report.regroup = { regroup, ok: false };
  }
  ck('drag.regroup', report.regroup.ok, report.regroup);

  // ---------- 5d. 卡片视图重排：sort 必须压过日期 ----------
  // 清空 + 导入之后只剩两条，正好够验「把第一张拖到第二张右半边」。
  await evaluate(cdp, "__SD_TEST__.goView('next7')");
  await sleep(300);
  await evaluate(cdp, "document.querySelector('[data-vmode=\"card\"]')?.click()");
  await sleep(500);
  const cards = await evaluate(
    cdp,
    `(function(){
       const cs = Array.from(document.querySelectorAll('.card-grid [data-tid]')).slice(0, 2);
       if (cs.length < 2) return null;
       const a = cs[0].getBoundingClientRect(), b = cs[1].getBoundingClientRect();
       return { ids: cs.map((x) => x.getAttribute('data-tid')),
                from: { x: Math.round(a.left + a.width * 0.3), y: Math.round(a.top + 20) },
                to: { x: Math.round(b.left + b.width * 0.8), y: Math.round(b.top + 20) } };
     })()`
  );
  if (cards) {
    await drag(cdp, cards.from, cards.to);
    const after = await evaluate(
      cdp,
      "Array.from(document.querySelectorAll('.card-grid [data-tid]')).slice(0,2).map((x) => x.getAttribute('data-tid'))"
    );
    report.cardDrag = {
      before: cards.ids,
      after,
      ok: after[0] === cards.ids[1] && after[1] === cards.ids[0]
    };
  } else {
    report.cardDrag = { ok: false, reason: 'less than 2 cards' };
  }
  // 不论成败都退回列表形态：后面的用例按 .task-list 取行
  await evaluate(cdp, "document.querySelector('[data-vmode=\"list\"]')?.click()");
  await sleep(350);
  ck('drag.card', report.cardDrag.ok, report.cardDrag);

  // ---------- 6. 日历改时刻 ----------
  await evaluate(cdp, "__SD_TEST__.goView('calendar')");
  await evaluate(
    cdp,
    `(() => {
       const t = __SD_TEST__.tasks.find(x => x.time);
       const d = t && t.date ? new Date(t.date + 'T00:00:00') : new Date();
       __SD_TEST__.setCal({ calMode: 'day', cursor: d });
     })()`
  );
  await sleep(650);
  const block = await evaluate(
    cdp,
    `(() => {
       const n = document.querySelector('.md-day [data-tid]');
       if (!n) return null;
       const r = n.getBoundingClientRect();
       const id = n.getAttribute('data-tid');
       const t = __SD_TEST__.tasks.find(x => x.id === id);
       return { id, time: t ? t.time : '', x: r.left + r.width / 2, y: r.top + 8 };
     })()`
  );
  report.calDrag = { block };
  if (block && block.time) {
    await drag(cdp, { x: block.x, y: block.y }, { x: block.x, y: block.y + 72 });
    const now = await evaluate(
      cdp,
      `(() => { const t = __SD_TEST__.tasks.find(x => x.id === ${JSON.stringify(block.id)}); return t ? t.time : ''; })()`
    );
    report.calDrag.after = now;
    report.calDrag.ok = now !== block.time;
  } else {
    report.calDrag.ok = false;
  }
  ck('drag.calendar', report.calDrag.ok, report.calDrag);

  // ---------- 7. 面板调宽 + 双击复位 ----------
  await evaluate(cdp, "__SD_TEST__.goView('today')");
  await sleep(400);
  await evaluate(cdp, '__SD_TEST__.openTaskDetail(__SD_TEST__.tasks[0].id)');
  await sleep(550);
  const grip = await evaluate(
    cdp,
    `(() => { const g = document.querySelector('.panel-grip'); if (!g) return null; const r = g.getBoundingClientRect(); return { x: r.left + 4, y: r.top + 200 }; })()`
  );
  report.panel = { grip: !!grip };
  if (grip) {
    const w0 = await evaluate(
      cdp,
      "parseInt(getComputedStyle(document.documentElement).getPropertyValue('--panel-w')) || 440"
    );
    await drag(cdp, grip, { x: grip.x - 120, y: grip.y }, 8);
    const w1 = await evaluate(
      cdp,
      "parseInt(getComputedStyle(document.documentElement).getPropertyValue('--panel-w')) || 440"
    );
    const grip2 = await evaluate(
      cdp,
      `(() => { const g = document.querySelector('.panel-grip'); const r = g.getBoundingClientRect(); return { x: r.left + 4, y: r.top + 200 }; })()`
    );
    await doubleClick(cdp, grip2.x, grip2.y);
    await sleep(280);
    const w2 = await evaluate(
      cdp,
      "parseInt(getComputedStyle(document.documentElement).getPropertyValue('--panel-w')) || 440"
    );
    report.panel.widths = [w0, w1, w2];
    report.panel.ok = w0 === 440 && w1 > w0 && w2 === 440;
  } else {
    report.panel.ok = false;
  }
  ck('panel.resize', report.panel.ok, report.panel);
  await shot(cdp, OUT, 'panel');
  await evaluate(cdp, '__SD_TEST__.closeModal()');

  // ---------- 8. 弹窗拖动 / 双击复位 ----------
  await evaluate(cdp, '__SD_TEST__.closeModal(); __SD_TEST__.uiState.settings = true');
  await sleep(500);
  const head = await evaluate(
    cdp,
    `(() => { const h = document.querySelector('#modalRoot .m-head h3'); const r = h.getBoundingClientRect(); return { x: r.left + 12, y: r.top + r.height / 2 }; })()`
  );
  await drag(cdp, head, { x: head.x + 80, y: head.y + 40 }, 8);
  const floated = await evaluate(cdp, "!!document.querySelector('#modalRoot .modal.floating')");
  const movedTo = await evaluate(
    cdp,
    "(() => { const m = document.querySelector('#modalRoot .modal.floating'); return m ? Math.round(m.getBoundingClientRect().left) : -1; })()"
  );
  await doubleClick(cdp, head.x + 80, head.y + 40);
  await sleep(280);
  const back = await evaluate(cdp, "!document.querySelector('#modalRoot .modal.floating')");
  report.modal = { floated, movedTo, back, ok: floated && back };
  ck('modal.drag', report.modal.ok, report.modal);
  await evaluate(cdp, '__SD_TEST__.closeModal()');

  // ---------- 9. 拖拽中断：卸载/失焦后不留残留 ----------
  await evaluate(cdp, "__SD_TEST__.goView('next7')");
  await sleep(550);
  const abortAt = await evaluate(
    cdp,
    `(() => {
       const n = document.querySelector('.task-list [data-tid]');
       if (!n) return null;
       const r = n.getBoundingClientRect();
       return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
     })()`
  );
  if (abortAt) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: abortAt.x, y: abortAt.y, buttons: 0 });
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: abortAt.x,
      y: abortAt.y,
      button: 'left',
      buttons: 1,
      clickCount: 1
    });
    for (let i = 1; i <= 4; i++) {
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: abortAt.x,
        y: abortAt.y + i * 6,
        button: 'left',
        buttons: 1
      });
      await sleep(20);
    }
    report.abort = { dragging: await evaluate(cdp, '__SD_TEST__.isDragging()') };
    // 拖到一半切视图：组件卸载，必须自动收尾
    await evaluate(cdp, "__SD_TEST__.goView('today')");
    await sleep(450);
    report.abort.afterUnmount = await evaluate(
      cdp,
      `(() => ({ dragging: __SD_TEST__.isDragging(), ghost: !!document.querySelector('.drag-ghost'),
                 bodyCls: document.body.classList.contains('is-dragging') }))()`
    );
    const t0 = await evaluate(cdp, '__SD_TEST__.nowTick()');
    await sleep(16000); // 跨过 15s tick
    report.abort.tickMoved = (await evaluate(cdp, '__SD_TEST__.nowTick()')) > t0;
    report.abort.ok =
      report.abort.dragging === true &&
      report.abort.afterUnmount.dragging === false &&
      report.abort.afterUnmount.ghost === false &&
      report.abort.afterUnmount.bodyCls === false &&
      report.abort.tickMoved === true;
  } else {
    report.abort = { ok: false, reason: 'no task row' };
  }
  ck('drag.abort', report.abort.ok, report.abort);

  // ---------- 10. 页面异常 ----------
  report.errors = exceptions(cdp);
  ck('errors.none', report.errors.length === 0, report.errors);

  report.checks = rows;
  report.fails = rows.filter((r) => !r.ok).map((r) => r.id);
  report.pass = report.fails.length === 0;
  fs.writeFileSync(`${OUT}/remedy-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  cdp.ws.close();
  if (!report.pass) process.exitCode = 2;
}

main().catch((e) => {
  console.error('REMEDY_CHECK_FAILED:', e.message);
  process.exitCode = 1;
});
