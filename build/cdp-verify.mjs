// Verify the desktop build through the WebView2 DevTools protocol.
// Usage: node cdp-verify.mjs [screenshot.png]
import fs from "node:fs";

const ENDPOINT = "http://127.0.0.1:9222";
const shotPath = process.argv[2] || null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getPageTarget() {
  for (let i = 0; i < 60; i++) {
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
  throw new Error("WebView2 debugging endpoint not reachable");
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

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

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
    return { __error: res.exceptionDetails.exception?.description || "evaluation failed" };
  }
  return res.result?.value;
}

async function main() {
  const target = await getPageTarget();
  const cdp = connect(target.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  await sleep(2500);

  const report = {};

  report.title = await evaluate(cdp, "document.title");
  report.readyState = await evaluate(cdp, "document.readyState");
  report.hasBridge = await evaluate(cdp, "!!(window.__SMART_PAGE__ && window.__SMART_PAGE__.database)");
  report.views = await evaluate(cdp, "Array.from(document.querySelectorAll('[data-view]')).map(e=>e.dataset.view)");
  report.sidebarItems = await evaluate(
    cdp,
    "Array.from(document.querySelectorAll('.sidebar .nav-item, .sidebar a, .sidebar button')).map(e=>e.textContent.trim()).filter(Boolean).slice(0,20)"
  );
  report.state = await evaluate(
    cdp,
    "typeof S !== 'undefined' ? {tasks:S.tasks.length, habits:S.habits.length, countdowns:S.countdowns.length, pomodoros:S.pomodoros.length, online:S.online, loaded:S.loaded, view:S.view} : null"
  );
  report.storageKeys = await evaluate(cdp, "Object.keys(localStorage)");
  report.dbBuckets = await evaluate(
    cdp,
    "Object.fromEntries(Object.entries(JSON.parse(localStorage.getItem('sd_database_v1')||'{}')).map(([k,v])=>[k, Array.isArray(v)?v.length:-1]))"
  );
  report.visibleTaskCards = await evaluate(cdp, "document.querySelectorAll('.task-card, .task-item, .tk').length");
  report.syncText = await evaluate(cdp, "document.getElementById('syncText')?.textContent || null");
  report.bodyTextSample = await evaluate(cdp, "(document.getElementById('content')?.innerText||'').slice(0,300)");
  report.errors = cdp.events
    .filter((e) => e.method === "Runtime.exceptionThrown")
    .map((e) => e.params?.exceptionDetails?.text || "exception")
    .slice(0, 10);

  console.log(JSON.stringify(report, null, 2));

  if (shotPath) {
    const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(shotPath, Buffer.from(shot.data, "base64"));
    console.log(`screenshot saved: ${shotPath}`);
  }

  cdp.ws.close();
}

main().catch((err) => {
  console.error("VERIFY_FAILED:", err.message);
  process.exit(1);
});
