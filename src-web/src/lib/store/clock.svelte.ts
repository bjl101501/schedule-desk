/* 全应用唯一的 15 秒心跳 + 对齐整分钟的时钟。
   旧版有两个 15s 定时器（状态刷新、同步轮询）和一个 1s 时钟，这里合并成两处。 */
import { app } from './app.svelte';

export const clock = $state({
  now: Date.now(),
  minute: new Date()
});

/** 由 clock.now 推出「今天 0 点」，跨零点时所有派生会跟着变 */
export function todayD(): Date {
  const d = new Date(clock.now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

let timer: ReturnType<typeof setInterval> | null = null;
let minTimer: ReturnType<typeof setTimeout> | null = null;

export function startClock(onTick?: () => void): () => void {
  if (timer) return () => stopClock();
  timer = setInterval(() => {
    // 拖拽期间不推进，避免节点被重排
    if (!app.dragging) clock.now = Date.now();
    if (onTick) onTick();
  }, 15000);

  const tickMin = () => {
    clock.minute = new Date();
    const d = new Date();
    minTimer = setTimeout(tickMin, Math.max(200, (60 - d.getSeconds()) * 1000 - d.getMilliseconds() + 30));
  };
  tickMin();
  return () => stopClock();
}

export function stopClock(): void {
  if (timer) clearInterval(timer);
  timer = null;
  if (minTimer) clearTimeout(minTimer);
  minTimer = null;
}

export function clockRunning(): boolean {
  return !!timer;
}
