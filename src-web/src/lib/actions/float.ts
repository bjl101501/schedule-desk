/* 浮层定位与「同时只开一个」：与旧 floatPanel / openPanel 同一套口径 */
export interface PlaceOpts {
  gap?: number;
  align?: 'left' | 'right';
  minWidth?: number;
}

let active: (() => void) | null = null;

export function registerPanel(close: () => void): void {
  if (active && active !== close) active();
  active = close;
}

export function clearPanel(close: () => void): boolean {
  if (active !== close) return false;
  active = null;
  return true;
}

export function closeActivePanel(): void {
  if (!active) return;
  const f = active;
  active = null;
  f();
}

export function place(el: HTMLElement, anchor: HTMLElement, opts: PlaceOpts = {}): void {
  const gap = opts.gap === undefined ? 5 : opts.gap;
  const width = el.offsetWidth || opts.minWidth || 190;
  const height = el.offsetHeight || 0;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const r = anchor.getBoundingClientRect();
  let left = Math.max(8, Math.min(r.left, vw - width - 8));
  let top = r.bottom + gap;
  if (top + height > vh - 8) {
    const above = r.top - height - gap;
    top = above >= 8 ? above : Math.max(8, vh - height - 8);
  }
  if (opts.align === 'right') left = Math.max(8, Math.min(r.right - width, vw - width - 8));
  el.style.left = left + 'px';
  el.style.top = top + 'px';
}
