/*
  浮层定位与「同时只开一个」。

  定位交给 @floating-ui/dom：flip / shift / size / autoUpdate 都是它维护的，
  这里只保留两件业务：
    1. registerPanel / clearPanel / closeActivePanel —— Esc 剥层要知道当前有没有浮层；
    2. place() —— 同步首帧估算。computePosition 是异步的，算出来之前元素会停在 (0,0)，
       所以先按旧公式摆一次，再由 track() 精修。

  旧实现里「滚动就关闭」的做法也一并去掉：autoUpdate 会跟着锚点走，
  锚点整体滚出视口才由调用方（popover）决定关闭。
*/
import { autoUpdate, computePosition, flip, offset, shift, size } from '@floating-ui/dom';
import type { Middleware, Placement, VirtualElement } from '@floating-ui/dom';

export type AnchorLike = Element | VirtualElement;

export interface PlaceOpts {
  /** 主轴向间距，默认 5 */
  gap?: number;
  /** right = 面板右边缘贴锚点右边缘（bottom-end） */
  align?: 'left' | 'right';
  /** 首帧尺寸兜底：面板还没量到宽度时用它 */
  minWidth?: number;
  /** 视口边界，默认 8 */
  padding?: number;
  /** 可用高度是否钳制到视口内（写 --fp-AH，CSS 侧消费），默认 true */
  clamp?: boolean;
}

const PAD = 8;

const placementOf = (o: PlaceOpts): Placement => (o.align === 'right' ? 'bottom-end' : 'bottom-start');

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

/** 关掉当前浮层；返回「真的关掉了一个」，Esc 靠这个决定要不要继续往上剥 */
export function closeActivePanel(): boolean {
  if (!active) return false;
  const f = active;
  active = null;
  f();
  return true;
}

/** 同步首帧估算：公式与旧 place() 逐行一致，保证首帧不会停在 (0,0) */
export function place(el: HTMLElement, anchor: AnchorLike, opts: PlaceOpts = {}): void {
  const gap = opts.gap === undefined ? 5 : opts.gap;
  const pad = opts.padding === undefined ? PAD : opts.padding;
  const width = el.offsetWidth || opts.minWidth || 190;
  const height = el.offsetHeight || 0;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const r = anchor.getBoundingClientRect();
  let left = Math.max(pad, Math.min(r.left, vw - width - pad));
  let top = r.bottom + gap;
  if (top + height > vh - pad) {
    const above = r.top - height - gap;
    top = above >= pad ? above : Math.max(pad, vh - height - pad);
  }
  if (opts.align === 'right') left = Math.max(pad, Math.min(r.right - width, vw - width - pad));
  el.style.left = Math.round(left) + 'px';
  el.style.top = Math.round(top) + 'px';
}

export interface TrackHooks {
  /** 首次精修完成（此时位置、尺寸都定了），afterPlace 挂这里 */
  onFirst?: () => void;
  /** 每次重算之后 */
  onMove?: () => void;
}

/**
 * 先同步摆一次，再交给 floating-ui 精修并持续跟随。
 * 返回取消函数：组件卸载时必须调，否则 scroll / ResizeObserver 的监听会留着。
 */
export function track(el: HTMLElement, anchor: AnchorLike, opts: PlaceOpts = {}, hooks: TrackHooks = {}): () => void {
  const pad = opts.padding === undefined ? PAD : opts.padding;
  let dead = false;
  let first = true;

  place(el, anchor, opts);

  const middleware: Middleware[] = [
    offset(opts.gap === undefined ? 5 : opts.gap),
    flip({ padding: pad }),
    shift({ padding: pad, crossAxis: true })
  ];
  if (opts.clamp !== false) {
    middleware.push(
      size({
        padding: pad,
        apply({ availableHeight, elements }) {
          // 只给一个 CSS 变量，具体怎么用交给样式表（面板/菜单各自不同）
          elements.floating.style.setProperty('--fp-AH', Math.max(96, Math.floor(availableHeight)) + 'px');
        }
      })
    );
  }

  const run = (): void => {
    computePosition(anchor, el, { placement: placementOf(opts), strategy: 'fixed', middleware })
      .then(({ x, y }) => {
        if (dead) return;
        el.style.left = Math.round(x) + 'px';
        el.style.top = Math.round(y) + 'px';
        if (first) {
          first = false;
          hooks.onFirst?.();
        }
        hooks.onMove?.();
      })
      .catch(() => {
        /* 元素已脱离文档：destroy 里会清掉监听，这里静默 */
      });
  };

  // autoUpdate 挂上就会立刻跑一次，不用额外再调 run()
  const stop = autoUpdate(anchor, el, run);

  return () => {
    dead = true;
    stop();
  };
}
