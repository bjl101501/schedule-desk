/*
  CDP 底座：三个回归脚本（ui-check / remedy-check / notify-check）共用。

  只做「连上 WebView2、发命令、取值、截图、模拟鼠标」，
  不认识任何业务选择器 —— 断言的期望值留在各自的脚本里。
*/

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function makeEndpoint(port) {
  return `http://127.0.0.1:${port}`;
}

/** 等页面出现；WebView2 冷启动可能要几秒 */
export async function target(port, tries = 80, gap = 500) {
  const endpoint = makeEndpoint(port);
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${endpoint}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      /* 还没起来 */
    }
    await sleep(gap);
  }
  throw new Error('CDP endpoint not reachable: ' + endpoint);
}

export function connect(url) {
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
    } else if (msg.method) {
      events.push(msg);
    }
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

/** 取值；页面抛异常时抛出，用于「必须成功」的调用 */
export async function evaluate(cdp, expression) {
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

/** 取值；页面抛异常时返回 {__error}，用于「可能是坏的」的探测 */
export async function probe(cdp, expression) {
  try {
    return await evaluate(cdp, expression);
  } catch (e) {
    return { __error: String(e.message || e) };
  }
}

export async function shot(cdp, dir, name) {
  const res = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const fs = await import('node:fs');
  fs.mkdirSync(dir, { recursive: true });
  const base = String(name).replace(/\.png$/i, '');
  fs.writeFileSync(`${dir}/${base}.png`, Buffer.from(res.data, 'base64'));
}

export async function mouse(cdp, type, x, y, extra = {}) {
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

/** 真双击：两次完整 press/release，clickCount 1 → 2 */
export async function doubleClick(cdp, x, y) {
  const px = Math.round(x);
  const py = Math.round(y);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: px, y: py, buttons: 0 });
  for (const count of [1, 2]) {
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: px,
      y: py,
      button: 'left',
      buttons: 1,
      clickCount: count
    });
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: px,
      y: py,
      button: 'left',
      buttons: 0,
      clickCount: count
    });
    await sleep(40);
  }
  await sleep(200);
}

export async function drag(cdp, from, to, steps = 12) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y, buttons: 0 });
  await mouse(cdp, 'mousePressed', from.x, from.y);
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: Math.round(x),
      y: Math.round(y),
      button: 'left',
      buttons: 1
    });
    await sleep(16);
  }
  await mouse(cdp, 'mouseReleased', to.x, to.y);
  await sleep(220);
}

export async function key(cdp, k, vk) {
  // text 只对可打印字符合法；Escape/Enter 这类必须省略，否则 CDP 报 -32602
  const down = { type: 'keyDown', key: k, windowsVirtualKeyCode: vk };
  if (typeof k === 'string' && k.length === 1) down.text = k;
  await cdp.send('Input.dispatchKeyEvent', down);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, windowsVirtualKeyCode: vk });
}

/** 固定窗口尺寸：面板模式相关断言依赖视口宽度 */
export async function resize(cdp, width, height) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 0,
    mobile: false
  });
  await sleep(250);
}

/** 页面里的未捕获异常（已过滤 ResizeObserver 噪音） */
export function exceptions(cdp, limit = 8) {
  return cdp.events
    .filter((e) => e.method === 'Runtime.exceptionThrown')
    .map((e) => e.params?.exceptionDetails?.exception?.description || e.params?.exceptionDetails?.text)
    .filter((x) => !String(x).includes('ResizeObserver'))
    .slice(0, limit);
}

/* ---------------- 断言 harness ---------------- */

export function makeChecker() {
  const checks = [];
  const row = (id, ok, detail) => {
    checks.push({ id, ok: !!ok, detail });
    return !!ok;
  };
  return {
    checks,
    /** ok 为真就算通过；detail 只用于失败时定位 */
    check: row,
    eq(id, got, want, extra) {
      return row(id, got === want, { got, want, ...(extra || {}) });
    },
    /** 数值/字符串非空 */
    has(id, got, extra) {
      const ok = got !== null && got !== undefined && got !== '' && !(typeof got === 'number' && Number.isNaN(got));
      return row(id, ok, { got, ...(extra || {}) });
    },
    /** >= n */
    atLeast(id, got, n, extra) {
      return row(id, typeof got === 'number' && got >= n, { got, min: n, ...(extra || {}) });
    },
    /** 全部满足谓词 */
    every(id, list, fn, extra) {
      const arr = Array.isArray(list) ? list : [];
      const bad = arr.filter((x, i) => !fn(x, i));
      return row(id, arr.length > 0 && bad.length === 0, { len: arr.length, bad: bad.slice(0, 3), ...(extra || {}) });
    },
    fails() {
      return checks.filter((c) => !c.ok);
    }
  };
}

/**
 * 生成退出码：
 * - 有「未知失败」→ 2
 * - strict 下任何失败（含已知）→ 2
 * 已知失败用于重构期：每修完一个 bug 就从 KNOWN_FAIL 里删一条。
 */
export function settle(report, checker, knownFail, strict) {
  const fails = checker.fails();
  const known = new Set(knownFail || []);
  const unknown = fails.filter((f) => !known.has(f.id));
  report.checks = checker.checks;
  report.fails = fails.map((f) => f.id);
  report.knownFail = [...known];
  report.unknownFails = unknown.map((f) => f.id);
  report.pass = strict ? fails.length === 0 : unknown.length === 0;
  if (!report.pass) process.exitCode = 2;
  return report;
}
