// 触发一条系统通知，用于人工核对文案与常驻效果
// 用法：node notify-check.mjs [端口]
const PORT = process.argv[2] || "9222";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let page = null;
  for (let i = 0; i < 60 && !page; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
    } catch {}
    if (!page) await sleep(500);
  }
  if (!page) throw new Error("CDP not reachable");

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", rej, { once: true });
  });
  let seq = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m.result);
      pending.delete(m.id);
    }
  });
  const send = (method, params = {}) =>
    new Promise((res) => {
      const id = ++seq;
      pending.set(id, res);
      ws.send(JSON.stringify({ id, method, params }));
    });

  await send("Runtime.evaluate", { expression: "Runtime.enable && 1" });
  const out = await send("Runtime.evaluate", {
    expression:
      "window.__TAURI_INTERNALS__.invoke('notify_now',{title:'整理本周项目周报',body:'现在开始，预计 45 分钟（09:30）'})",
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  console.log(JSON.stringify(out?.result || out));
  ws.close();
}

main().catch((e) => {
  console.error("NOTIFY_CHECK_FAILED:", e.message);
  process.exit(1);
});
