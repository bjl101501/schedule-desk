/*
  浮层公共行为：定位 + 点外面关闭 + 窗口缩放关闭。

  之前 DateField / TimeField / TagInput / MiniMenu 各抄一份，
  每份都带一个 `setTimeout(...,0)` 和一套 add/removeEventListener，
  改一处漏三处。这里收成一份 action。

  用法：`<div class="float-panel" use:popover={{ anchor, onClose: close }}>`
  —— 元素挂载即打开（父级用 {#if open} 控制），卸载即清理。
*/
import { clearPanel, place, registerPanel } from './float';

export interface PopoverOpts {
  /** 定位参照；null 表示组件自己算坐标（迷你菜单） */
  anchor: HTMLElement | null;
  onClose: () => void;
  minWidth?: number;
  gap?: number;
  /** 面板内的滚动不该关掉面板，外部滚动才关 */
  closeOnScroll?: boolean;
  /** 摆好位置后的额外动作（例如把选中项滚到可视区中间） */
  afterPlace?: (panel: HTMLElement) => void;
}

export function popover(node: HTMLElement, opts: PopoverOpts) {
  let cfg = opts;
  let raf = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let bound = false;

  function onDown(e: MouseEvent): void {
    const t = e.target as Node | null;
    if (node.contains(t) || cfg.anchor?.contains(t)) return;
    cfg.onClose();
  }

  function onScroll(e: Event): void {
    const t = e.target as Node | null;
    if (t && node.contains(t)) return;
    cfg.onClose();
  }

  function onResize(): void {
    cfg.onClose();
  }

  function attach(): void {
    if (bound) return;
    bound = true;
    document.addEventListener('mousedown', onDown, true);
    window.addEventListener('resize', onResize);
    if (cfg.closeOnScroll) document.addEventListener('scroll', onScroll, true);
  }

  function detach(): void {
    if (!bound) return;
    bound = false;
    document.removeEventListener('mousedown', onDown, true);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('scroll', onScroll, true);
  }

  registerPanel(cfg.onClose);

  raf = requestAnimationFrame(() => {
    if (cfg.anchor) place(node, cfg.anchor, { minWidth: cfg.minWidth, gap: cfg.gap });
    cfg.afterPlace?.(node);
    // 延后一拍再挂监听：不然「打开它的那一次点击」会立刻把它关掉
    timer = setTimeout(attach, 0);
  });

  return {
    update(next: PopoverOpts) {
      cfg = next;
      if (cfg.anchor) place(node, cfg.anchor, { minWidth: cfg.minWidth, gap: cfg.gap });
    },
    destroy() {
      if (raf) cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
      detach();
      clearPanel(cfg.onClose);
    }
  };
}
