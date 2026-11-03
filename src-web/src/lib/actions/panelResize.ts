/*
  右侧面板调宽：样式里 .panel-grip（styles.css:944，仅 ≥1000px 生效）一直没人用。
  宽度只改 --panel-w 变量，CSS 的 min(var(--panel-w),40vw) 保证不超过 40vw。
*/
import { applyPanelWidth, meta, savePanelWidth } from '$lib/store/meta.svelte';

export function panelResize(node: HTMLElement): { destroy: () => void } {
  let startX = 0;
  let startW = 0;
  let active = false;

  function onDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    active = true;
    startX = e.clientX;
    // 起始宽度按「视觉宽度」算：--panel-w 可能存着 760，但 CSS 被 40vw 截断，
    // 用存值算会让前几十像素的拖动完全没反应
    startW = Math.min(meta.panelW, window.innerWidth * 0.4);
    // 拖动期间关掉内容区的过渡，否则内容滞后面板一步
    document.documentElement.classList.add('resizing');
    node.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onMove(e: PointerEvent): void {
    if (!active) return;
    // 面板贴右边：指针左移 = 变宽
    applyPanelWidth(startW - (e.clientX - startX));
  }

  function onUp(e: PointerEvent): void {
    if (!active) return;
    active = false;
    document.documentElement.classList.remove('resizing');
    node.releasePointerCapture(e.pointerId);
    savePanelWidth();
  }

  function onDouble(): void {
    applyPanelWidth(440);
    savePanelWidth();
  }

  node.addEventListener('pointerdown', onDown);
  node.addEventListener('pointermove', onMove);
  node.addEventListener('pointerup', onUp);
  node.addEventListener('pointercancel', onUp);
  node.addEventListener('dblclick', onDouble);

  return {
    destroy() {
      document.documentElement.classList.remove('resizing');
      node.removeEventListener('pointerdown', onDown);
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerup', onUp);
      node.removeEventListener('pointercancel', onUp);
      node.removeEventListener('dblclick', onDouble);
    }
  };
}
