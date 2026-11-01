/* 番茄计时：全应用第三个定时器（只在运行时存在） */
import { FOCUS_MODES, type FocusMode } from '$lib/domain/constants';
import { stampNow, today0, ymd } from '$lib/domain/date';
import { data, apiAddPomo } from './data.svelte';
import { toast } from './toast.svelte';

export const focus = $state({
  mode: 'focus' as FocusMode,
  total: 25 * 60,
  left: 25 * 60,
  running: false,
  taskId: '',
  taskTitle: '',
  subIndex: '',
  subTitle: '',
  pauseCount: 0,
  pauseSec: 0,
  pauseStart: 0,
  round: 1
});

let timer: ReturnType<typeof setInterval> | null = null;

function tick(): void {
  if (!focus.running) return;
  focus.left = Math.max(0, focus.left - 1);
  if (focus.left <= 0) finish();
}

function ensureTimer(): void {
  if (timer) return;
  timer = setInterval(tick, 1000);
}

export function startFocus(): void {
  focus.running = true;
  if (focus.pauseStart) {
    focus.pauseSec += Math.round((Date.now() - focus.pauseStart) / 1000);
    focus.pauseStart = 0;
  }
  ensureTimer();
}

export function pauseFocus(): void {
  focus.running = false;
  focus.pauseCount++;
  focus.pauseStart = Date.now();
}

export function toggleFocus(): void {
  if (focus.running) pauseFocus();
  else startFocus();
}

export function setMode(k: FocusMode): void {
  focus.mode = k;
  focus.total = FOCUS_MODES[k].min * 60;
  focus.left = focus.total;
  focus.running = false;
}

export function resetFocus(): void {
  focus.left = focus.total;
  focus.running = false;
  focus.pauseCount = 0;
  focus.pauseSec = 0;
  focus.pauseStart = 0;
}

export function finish(): void {
  const wasFocus = focus.mode === 'focus';
  const minutes = Math.round(focus.total / 60);
  const rec = {
    id: '',
    task: focus.taskTitle || '未命名专注',
    type: wasFocus ? '专注' : FOCUS_MODES[focus.mode].name,
    duration: minutes,
    start: stampNow(new Date(Date.now() - focus.total * 1000)),
    date: ymd(today0()),
    sub: focus.subTitle || '',
    pauseCount: focus.pauseCount,
    pauseSec: focus.pauseSec
  };
  if (wasFocus) {
    data.pomodoros.push(rec);
    apiAddPomo(rec);
    toast.show('完成一个番茄：' + minutes + ' 分钟');
    focus.round++;
  } else {
    toast.show('休息结束，继续加油');
  }
  focus.running = false;
  focus.left = FOCUS_MODES[focus.mode].min * 60;
  focus.pauseCount = 0;
  focus.pauseSec = 0;
}

export function skipFocus(): void {
  focus.running = false;
  focus.left = focus.total;
}

export function focusTickRunning(): boolean {
  return !!timer;
}
