/*
  统一的指针拖拽底座：
  启动意图、指针捕获、拖完抑制点击（suppressNextClick）都在这里，
  各视图只提供「怎么算落点、落地做什么」。

  旧版 05-dnd.js 里 7 处拖拽共用的是同一套 pointermove/up 骨架，
  落点判定却各不相同（列表项 / 看板列 / 时间格 / 日宽换算），
  所以这里只抽骨架，落点仍由调用方给。

  R21 起加了「启动意图」：以前唯一闸门是 4px 位移，手一抖就开始拖，
  松手还要写库。现在两条通道任选其一先满足：
  - 位移越过 slop（默认 8px）→ 立刻拖，保留快速拖拽；
  - 按住 holdMs（默认 160ms）不动 → 进入 armed（视觉提示），之后 2px 就能拖。
  这样既不误触，也不用每次都等长按。
*/
import { suppressNextClick } from './suppress';
import { endDragSession } from '$lib/store/dragSession.svelte';

/**
 * 按下这些区域不参与拖拽：它们自己有点击语义。
 * 集中在常量里 —— 12 个注册点与 modalShell 共用同一串，别再各写一遍。
 * .chk / .sub-row / .sub-item / .today-sub 都是 div 或 span 实现的伪控件，
 * 之前只列 button/input，于是「在勾选框上按下并移动」会拖走整条事项。
 */
export const NO_DRAG = [
  'button',
  'input',
  'textarea',
  'select',
  'label',
  'a',
  '[contenteditable="true"]',
  '[data-nodrag]',
  '.chk',
  '.sub-row',
  '.sub-item',
  '.today-sub',
  '.task-act'
].join(',');

export interface PointerDragOpts {
  /** 触发拖拽的选择器（相对 node） */
  handle: string;
  /** 位移阈值：越过即开拖 */
  slop?: number;
  /** 兼容旧调用：等价于 slop */
  threshold?: number;
  /** 按住多久进入 armed；0 = 关闭长按通道 */
  holdMs?: number;
  /** armed 之后多少位移开始拖 */
  armSlop?: number;
  /** 进入 armed：加视觉提示，告诉用户「现在可以拖了」 */
  onArm?: (el: HTMLElement, origin: { x: number; y: number }) => void;
  /** 退出 armed 但没拖：去掉提示 */
  onDisarm?: (el: HTMLElement) => void;
  /**
   * 开始拖（已越过阈值）。
   * origin 是按下那一刻的坐标 —— 阈值判定发生在之后的某次 move，
   * 用 e 当抓点会让幽灵比真实抓点偏出阈值那几像素。
   */
  onStart?: (el: HTMLElement, e: PointerEvent, origin: { x: number; y: number }) => void;
  onMove?: (el: HTMLElement, e: PointerEvent) => void;
  onEnd?: (el: HTMLElement, e: PointerEvent, moved: boolean) => void;
}

type Phase = 'idle' | 'pressing' | 'armed' | 'dragging';

export function pointerDrag(node: HTMLElement, opts: PointerDragOpts) {
  let current: PointerDragOpts = opts;

  let down: { x: number; y: number; el: HTMLElement; id: number } | null = null;
  let phase: Phase = 'idle';
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let lastEvent: PointerEvent | null = null;

  const slop = (): number => current.slop ?? current.threshold ?? 8;

  function clearHold(): void {
    if (holdTimer !== null) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  }

  function onDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    const el = target?.closest(current.handle) as HTMLElement | null;
    if (!el || !node.contains(el)) return;
    // 拖动手柄 / 勾选框 / 按钮上按下时，交给元素自己处理
    const skip = target?.closest(NO_DRAG);
    if (skip && skip !== el && !skip.matches('[data-drag-handle]')) return;
    down = { x: e.clientX, y: e.clientY, el, id: e.pointerId };
    phase = 'pressing';
    const hold = current.holdMs ?? 160;
    if (hold > 0) {
      holdTimer = setTimeout(() => {
        holdTimer = null;
        if (phase !== 'pressing' || !down) return;
        phase = 'armed';
        // 视觉提示统一在底座加，12 个注册点不用各写一遍
        down.el.classList.add('drag-armed');
        current.onArm?.(down.el, { x: down.x, y: down.y });
      }, hold);
    }
  }

  function begin(el: HTMLElement, e: PointerEvent): void {
    el.classList.remove('drag-armed');
    phase = 'dragging';
    current.onStart?.(el, e, { x: down!.x, y: down!.y });
  }

  function onPointerMove(e: PointerEvent): void {
    if (!down) return;
    lastEvent = e;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    const dist = Math.max(Math.abs(dx), Math.abs(dy));

    if (phase === 'pressing') {
      if (dist < slop()) return;
      clearHold();
      begin(down.el, e);
    } else if (phase === 'armed') {
      // armed 之后只需一点点位移：此时用户已经在「按住」状态，不会误触
      if (dist < (current.armSlop ?? 2)) return;
      begin(down.el, e);
    } else if (phase !== 'dragging') {
      return;
    }
    e.preventDefault();
    current.onMove?.(down.el, e);
  }

  function finish(e: PointerEvent): void {
    if (!down) return;
    lastEvent = e;
    clearHold();
    const el = down.el;
    const ph = phase;
    const moved = ph === 'dragging';
    el.classList.remove('drag-armed');
    if (ph === 'armed') current.onDisarm?.(el);
    current.onEnd?.(el, e, moved);
    if (moved) suppressNextClick();
    down = null;
    phase = 'idle';
  }

  /** 拖到一半按 Esc：只取消这一次拖拽，不要顺手把面板也关掉 */
  function onKey(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    if (phase !== 'armed' && phase !== 'dragging') return;
    if (!down) return;
    e.preventDefault();
    e.stopPropagation();
    clearHold();
    const el = down.el;
    el.classList.remove('drag-armed');
    if (phase === 'armed') current.onDisarm?.(el);
    if (lastEvent) current.onEnd?.(el, lastEvent, false);
    if (phase === 'dragging') suppressNextClick();
    down = null;
    phase = 'idle';
  }

  node.addEventListener('pointerdown', onDown);
  document.addEventListener('pointermove', onPointerMove, true);
  document.addEventListener('pointerup', finish, true);
  document.addEventListener('pointercancel', finish, true);
  document.addEventListener('keydown', onKey, true);

  return {
    update(next: PointerDragOpts) {
      current = next;
    },
    destroy() {
      // 拖到一半组件被卸载（切视图 / 关面板）：必须走一次收尾，
      // 否则 app.dragging 永远为真 → 时钟与外部重载一起卡死
      clearHold();
      if (down) {
        if (lastEvent) current.onEnd?.(down.el, lastEvent, phase === 'dragging');
        down = null;
        phase = 'idle';
        endDragSession();
      }
      node.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('pointerup', finish, true);
      document.removeEventListener('pointercancel', finish, true);
      document.removeEventListener('keydown', onKey, true);
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
