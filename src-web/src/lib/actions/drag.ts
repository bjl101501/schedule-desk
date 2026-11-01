/*
  统一的指针拖拽底座：
  阈值、指针捕获、拖完抑制点击（suppressNextClick）都在这里，
  各视图只提供「怎么算落点、落地做什么」。

  旧版 05-dnd.js 里 7 处拖拽共用的是同一套 pointermove/up 骨架，
  落点判定却各不相同（列表项 / 看板列 / 时间格 / 日宽换算），
  所以这里只抽骨架，落点仍由调用方给。
*/
import { suppressNextClick } from './suppress';

export interface PointerDragOpts {
  /** 触发拖拽的选择器（相对 node） */
  handle: string;
  threshold?: number;
  /** 开始拖（已越过阈值） */
  onStart?: (el: HTMLElement, e: PointerEvent) => void;
  onMove?: (el: HTMLElement, e: PointerEvent) => void;
  onEnd?: (el: HTMLElement, e: PointerEvent, moved: boolean) => void;
}

export function pointerDrag(node: HTMLElement, opts: PointerDragOpts) {
  let current: PointerDragOpts = opts;

  let down: { x: number; y: number; el: HTMLElement; id: number } | null = null;
  let dragging = false;

  function onDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    const el = target?.closest(current.handle) as HTMLElement | null;
    if (!el || !node.contains(el)) return;
    // 拖动手柄 / 复选框 / 按钮上按下时，交给元素自己处理
    const skip = target?.closest('button, input, textarea, select, a, [data-nodrag]');
    if (skip && skip !== el && !skip.matches('[data-drag-handle]')) return;
    down = { x: e.clientX, y: e.clientY, el, id: e.pointerId };
    dragging = false;
  }

  function onPointerMove(e: PointerEvent): void {
    if (!down) return;
    if (!dragging) {
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      if (Math.abs(dx) < (current.threshold ?? 4) && Math.abs(dy) < (current.threshold ?? 4)) return;
      dragging = true;
      current.onStart?.(down.el, e);
    }
    e.preventDefault();
    current.onMove?.(down.el, e);
  }

  function finish(e: PointerEvent): void {
    if (!down) return;
    const el = down.el;
    const moved = dragging;
    current.onEnd?.(el, e, moved);
    if (moved) suppressNextClick();
    down = null;
    dragging = false;
  }

  node.addEventListener('pointerdown', onDown);
  document.addEventListener('pointermove', onPointerMove, true);
  document.addEventListener('pointerup', finish, true);
  document.addEventListener('pointercancel', finish, true);

  return {
    update(next: PointerDragOpts) {
      current = next;
    },
    destroy() {
      node.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('pointerup', finish, true);
      document.removeEventListener('pointercancel', finish, true);
    }
  };
}

/** 命中检测：返回指针下最近的匹配元素 */
export function hitAt<T extends HTMLElement>(e: PointerEvent, selector: string): T | null {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  return (el?.closest(selector) as T | null) ?? null;
}

/** 指针在容器内的横向位置（0–1），用于按日宽换算 */
export function ratioX(e: PointerEvent, el: HTMLElement): number {
  const r = el.getBoundingClientRect();
  return Math.min(1, Math.max(0, (e.clientX - r.left) / Math.max(1, r.width)));
}
