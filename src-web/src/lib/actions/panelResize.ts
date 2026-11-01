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
    startW = meta.panelW;
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
      node.removeEventListener('pointerdown', onDown);
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerup', onUp);
      node.removeEventListener('pointercancel', onUp);
      node.removeEventListener('dblclick', onDouble);
    }
  };
}
