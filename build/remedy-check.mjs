// R8 收口验收：数据安全、导入、提醒闭环、拖拽、面板调宽、弹窗复位
// 用法：node remedy-check.mjs <输出目录> [端口]
import fs from 'node:fs';

const OUT = process.argv[2] || '.';
const PORT = process.argv[3] || '9222';
const ENDPOINT = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

async function target() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`${ENDPOINT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error('CDP endpoint not reachable');
}

function connect(url) {
  const ws = new WebSocket(url);
  const pending = new Map();
  const events = [];
  let seq = 0;
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    } else if (msg.method) events.push(msg);
  });
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
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
  const res = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  });
  if (res.exceptionDetails) {
    const d = res.exceptionDetails;
    throw new Error(d.exception?.description || d.text);
  }
  return res.result?.value;
}

async function shot(cdp, name) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'));
}

async function mouse(cdp, type, x, y, extra = {}) {
  await cdp.send('Input.dispatchMouseEvent', {
    type,
    x: Math.round(x),
    y: Math.round(y),
    button: 'left',
    buttons: type === 'mouseReleased' ? 0 : 1,
    clickCount: 1,
    ...extra
  });
}


async function doubleClick(cdp, x, y) {
  const px = Math.round(x);
  const py = Math.round(y);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: px, y: py, buttons: 0 });
  for (const count of [1, 2]) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: px, y: py, button: 'left', buttons: 1, clickCount: count });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: px, y: py, button: 'left', buttons: 0, clickCount: count });
    await sleep(40);
  }
  await sleep(200);
}

async function drag(cdp, from, to, steps = 12) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y, buttons: 0 });
  await mouse(cdp, 'mousePressed', from.x, from.y);
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(y), button: 'left', buttons: 1 });
    await sleep(16);
  }
  await mouse(cdp, 'mouseReleased', to.x, to.y);
  await sleep(220);
}

async function main() {
  const t = await target();
  const cdp = connect(t.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  const report = {};

  // ---------- 2. 提醒闭环：知道了之后角标下降，reload 后不回弹 ----------
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
    await sleep(2400);
    report.remind.afterReload = await evaluate(
      cdp,
      `(() => { const t = __SD_TEST__.tasks.find(x => x.id === ${JSON.stringify(pend.id)}); return t ? (t.remindCfg.read || []).length : -1; })()`
    );
    report.remind.ok = report.remind.after <= report.remind.before && report.remind.afterReload > 0;
  } else {
    report.remind.ok = false;
  }

  // ---------- 1. 真清空：清完 + reload 仍为空 ----------
  report.clear = {};
  report.clear.before = await evaluate(cdp, '__SD_TEST__.counts.tasks');
  await evaluate(cdp, 'window.__SD_TEST__.clearAll()');
  await sleep(600);
  report.clear.after = await evaluate(cdp, '__SD_TEST__.counts.tasks');
  report.clear.seeded = await evaluate(cdp, "localStorage.getItem('wb_schedule_seeded')");
  await cdp.send('Page.reload');
  await sleep(2600);
  report.clear.afterReload = await evaluate(cdp, '__SD_TEST__.counts.tasks');
  report.clear.ok = report.clear.before > 0 && report.clear.after === 0 && report.clear.afterReload === 0;

  // ---------- 2. 真追加导入：导两次 = 两倍，reload 后仍在 ----------
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
  await sleep(2600);
  const afterReload = await evaluate(cdp, '__SD_TEST__.counts');
  report.import.afterReload = afterReload.tasks;
  report.import.ok =
    first.tasks === 2 && second.tasks === 4 && report.import.unique && report.import.noEmpty && afterReload.tasks === 4;

  // ---------- 4. 快捷键 3 → 四象限 ----------
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: '3', text: '3', windowsVirtualKeyCode: 51 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: '3', windowsVirtualKeyCode: 51 });
  await sleep(300);
  report.keyboard = { view: await evaluate(cdp, '__SD_TEST__.counts.view') };
  report.keyboard.ok = report.keyboard.view === 'quadrant';

  // ---------- 5. 列表拖拽排序 ----------
  await evaluate(cdp, "__SD_TEST__.goView('next7')");
  await sleep(600);
  const rows = await evaluate(
    cdp,
    `Array.from(document.querySelectorAll('.task-list [data-tid]')).slice(0, 2).map(n => {
       const r = n.getBoundingClientRect();
       return { id: n.getAttribute('data-tid'), x: r.left + r.width / 2, y: r.top + r.height / 2 };
     })`
  );
  report.drag = { rows: rows.map((r) => r.id) };
  if (rows.length === 2) {
    await drag(cdp, rows[0], rows[1]);
    const order = await evaluate(cdp, "Array.from(document.querySelectorAll('.task-list [data-tid]')).slice(0, 2).map(n => n.getAttribute('data-tid'))");
    report.drag.after = order;
    report.drag.sortText = await evaluate(cdp, "document.querySelector('#btnSort .txt')?.textContent");
    report.drag.ghostGone = await evaluate(cdp, "!document.querySelector('.drag-ghost')");
    report.drag.ok = order[0] === rows[1].id && order[1] === rows[0].id && report.drag.ghostGone;
  } else {
    report.drag.ok = false;
  }

  // ---------- 6. 日历改时刻：日视图里把色块往下拖 1 小时 ----------
  await evaluate(cdp, "__SD_TEST__.goView('calendar')");
  await evaluate(
    cdp,
    `(() => {
       const t = __SD_TEST__.tasks.find(x => x.time);
       const d = t && t.date ? new Date(t.date + 'T00:00:00') : new Date();
       __SD_TEST__.setCal({ calMode: 'day', cursor: d });
     })()`
  );
  await sleep(600);
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
    const now = await evaluate(cdp, `(() => { const t = __SD_TEST__.tasks.find(x => x.id === ${JSON.stringify(block.id)}); return t ? t.time : ''; })()`);
    report.calDrag.after = now;
    report.calDrag.ok = now !== block.time;
  } else {
    report.calDrag.ok = false;
  }

  // ---------- 7. 面板调宽 + 双击复位 ----------
  await evaluate(cdp, "__SD_TEST__.goView('today')");
  await sleep(400);
  await evaluate(cdp, "__SD_TEST__.openTaskDetail(__SD_TEST__.tasks[0].id)");
  await sleep(500);
  const grip = await evaluate(
    cdp,
    `(() => { const g = document.querySelector('.panel-grip'); if (!g) return null; const r = g.getBoundingClientRect(); return { x: r.left + 4, y: r.top + 200 }; })()`
  );
  report.panel = { grip: !!grip };
  if (grip) {
    const w0 = await evaluate(cdp, "parseInt(getComputedStyle(document.documentElement).getPropertyValue('--panel-w')) || 440");
    await drag(cdp, grip, { x: grip.x - 120, y: grip.y }, 8);
    const w1 = await evaluate(cdp, "parseInt(getComputedStyle(document.documentElement).getPropertyValue('--panel-w')) || 440");
    const grip2 = await evaluate(
      cdp,
      `(() => { const g = document.querySelector('.panel-grip'); const r = g.getBoundingClientRect(); return { x: r.left + 4, y: r.top + 200 }; })()`
    );
    await doubleClick(cdp, grip2.x, grip2.y);
    await sleep(250);
    const w2 = await evaluate(cdp, "parseInt(getComputedStyle(document.documentElement).getPropertyValue('--panel-w')) || 440");
    report.panel.widths = [w0, w1, w2];
    report.panel.ok = w1 > w0 && w2 === 440;
  } else {
    report.panel.ok = false;
  }
  await shot(cdp, 'panel');
  await evaluate(cdp, '__SD_TEST__.closeModal()');

  // ---------- 8. 弹窗拖动 / 双击复位 ----------
  await evaluate(cdp, "__SD_TEST__.closeModal(); __SD_TEST__.uiState.settings = true");
  await sleep(450);
  const head = await evaluate(
    cdp,
    `(() => { const h = document.querySelector('#modalRoot .m-head h3'); const r = h.getBoundingClientRect(); return { x: r.left + 12, y: r.top + r.height / 2 }; })()`
  );
  await drag(cdp, head, { x: head.x + 80, y: head.y + 40 }, 8);
  const floated = await evaluate(cdp, "!!document.querySelector('#modalRoot .modal.floating')");
  const movedTo = await evaluate(cdp, "(() => { const m = document.querySelector('#modalRoot .modal.floating'); return m ? Math.round(m.getBoundingClientRect().left) : -1; })()");
  await doubleClick(cdp, head.x + 80, head.y + 40);
  await sleep(250);
  const back = await evaluate(cdp, "!document.querySelector('#modalRoot .modal.floating')");
  report.modal = { floated, movedTo, back, ok: floated && back };
  await evaluate(cdp, '__SD_TEST__.closeModal()');

  // ---------- 9. 页面异常 ----------
  report.errors = cdp.events
    .filter((e) => e.method === 'Runtime.exceptionThrown')
    .map((e) => e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text)
    .filter((x) => !String(x).includes('ResizeObserver'));

  report.pass =
    report.clear.ok &&
    report.import.ok &&
    report.remind.ok &&
    report.keyboard.ok &&
    report.drag.ok &&
    report.calDrag.ok &&
    report.panel.ok &&
    report.modal.ok &&
    report.errors.length === 0;

  fs.writeFileSync(`${OUT}/remedy-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  cdp.ws.close();
  if (!report.pass) process.exitCode = 2;
}

main().catch((e) => {
  console.error('REMEDY_CHECK_FAILED:', e.message);
  process.exitCode = 1;
});
