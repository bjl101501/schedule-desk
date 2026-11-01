/*
  浮层公共行为：定位 + 点外面关闭 + 锚点滚出视口关闭。

  定位与「跟随滚动 / 跟随尺寸变化」都在 float.track()（@floating-ui/dom 的 autoUpdate），
  这里只管生命周期：
    - 打开时登记到 float 的单例表（Esc 剥层要知道）
    - 外部 mousedown 关闭（延后一拍挂，否则打开它那一次点击会立刻把它关掉）
    - 卸载时清监听、清登记

  用法：`<div class="float-panel" use:popover={{ anchor, onClose: close }}>`
  —— 元素挂载即打开（父级用 {#if open} 控制），卸载即清理。
*/
import { clearPanel, registerPanel, track } from './float';
import type { AnchorLike, PlaceOpts } from './float';

export interface PopoverOpts {
  /** 定位参照；虚拟元素（鼠标坐标）也支持 */
  anchor: AnchorLike | null;
  onClose: () => void;
  /** 定位前必须先定的尺寸（例如按锚点宽度定面板宽） */
  beforePlace?: (panel: HTMLElement) => void;
  /** 首次定位后执行一次（例如把选中项滚到可视区中间） */
  afterPlace?: (panel: HTMLElement) => void;
  minWidth?: number;
  gap?: number;
  align?: PlaceOpts['align'];
  padding?: number;
}

/** 锚点整块滚出视口就该关掉，否则面板会贴在边缘盯着一个看不见的输入框 */
function anchorGone(anchor: AnchorLike): boolean {
  const r = anchor.getBoundingClientRect();
  if (!r.width && !r.height) return false;
  return r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth;
}

export function popover(node: HTMLElement, opts: PopoverOpts) {
  let cfg = opts;
  let stop: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let bound = false;
  // 锚点得先被看见过一次，之后滚出去才关。测试与快捷键会在面板外「盲点」打开浮层，
  // 那种情况下锚点本来就在视口外，一上来就判消失会把面板立刻关掉。
  let seenIn = false;

  function onDown(e: MouseEvent): void {
    const t = e.target as Node | null;
    if (node.contains(t)) return;
    const a = cfg.anchor;
    // 虚拟元素没有 contains()，只有真 DOM 锚点才需要排除
    if (a && a instanceof Element && a.contains(t)) return;
    cfg.onClose();
  }

  function attach(): void {
    if (bound) return;
    bound = true;
    document.addEventListener('mousedown', onDown, true);
  }

  function run(): void {
    stop?.();
    stop = null;
    const anchor = cfg.anchor;
    // 没有锚点就不定位，保持调用方自己的坐标写法（目前只有兜底路径会走到）
    if (!anchor) return;
    cfg.beforePlace?.(node);
    stop = track(
      node,
      anchor,
      { gap: cfg.gap, minWidth: cfg.minWidth, align: cfg.align, padding: cfg.padding },
      {
        onFirst: () => cfg.afterPlace?.(node),
        onMove: () => {
          const gone = anchorGone(anchor);
          if (!gone) seenIn = true;
          else if (seenIn) cfg.onClose();
        }
      }
    );
  }

  // 只登记一次：registerPanel 会顺手关掉上一个面板，update() 里绝不能重复登记
  registerPanel(cfg.onClose);
  run();
  // 延后一拍再挂监听：不然「打开它的那一次点击」会立刻把它关掉
  timer = setTimeout(attach, 0);

  return {
    update(next: PopoverOpts) {
      const prevAnchor = cfg.anchor;
      cfg = next;
      if (cfg.anchor !== prevAnchor || !stop) run();
    },
    destroy() {
      if (timer) clearTimeout(timer);
      if (bound) {
        bound = false;
        document.removeEventListener('mousedown', onDown, true);
      }
      stop?.();
      stop = null;
      clearPanel(cfg.onClose);
    }
  };
}
