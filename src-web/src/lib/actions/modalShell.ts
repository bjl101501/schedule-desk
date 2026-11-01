/*
  弹窗拖动 / 双击复位 / 视口高度钳制（旧版 enableModalDrag）。
  用委托挂在 #modalRoot 上，12 个弹窗组件一个都不用改。
  面板模式（.modal-mask.panel）贴在右侧、标题栏 cursor:default，不允许拖。
*/
const SKIP = 'button, input, textarea, select, a, [data-nodrag]';

export function modalShell(node: HTMLElement): { destroy: () => void } {
  let drag: { modal: HTMLElement; head: HTMLElement; dx: number; dy: number } | null = null;

  function onDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement | null;
    const head = t?.closest('.m-head') as HTMLElement | null;
    if (!head || !node.contains(head)) return;
    if (t?.closest(SKIP)) return;
    const mask = head.closest('.modal-mask') as HTMLElement | null;
    if (!mask || mask.classList.contains('panel')) return;
    const modal = head.closest('.modal') as HTMLElement | null;
    if (!modal) return;
    const r = modal.getBoundingClientRect();
    // 第一次拖才转成 fixed，避免没拖就改变布局
    modal.style.position = 'fixed';
    modal.style.margin = '0';
    modal.style.left = r.left + 'px';
    modal.style.top = r.top + 'px';
    modal.style.width = r.width + 'px';
    modal.style.maxHeight = Math.min(r.height, window.innerHeight - 40) + 'px';
    modal.classList.add('floating');
    head.classList.add('dragging');
    drag = { modal, head, dx: e.clientX - r.left, dy: e.clientY - r.top };
    e.preventDefault();
  }

  function onMove(e: PointerEvent): void {
    if (!drag) return;
    const m = drag.modal;
    const w = m.offsetWidth;
    const h = m.offsetHeight;
    const x = Math.min(Math.max(8, e.clientX - drag.dx), Math.max(8, window.innerWidth - w - 8));
    const y = Math.min(Math.max(8, e.clientY - drag.dy), Math.max(8, window.innerHeight - h - 8));
    m.style.left = x + 'px';
    m.style.top = y + 'px';
  }

  function onUp(): void {
    if (!drag) return;
    drag.head.classList.remove('dragging');
    drag = null;
  }

  function onDouble(e: MouseEvent): void {
    const t = e.target as HTMLElement | null;
    if (!t?.closest('.m-head')) return;
    const modal = t.closest('.modal') as HTMLElement | null;
    if (!modal || !modal.classList.contains('floating')) return;
    modal.classList.remove('floating');
    modal.style.position = '';
    modal.style.margin = '';
    modal.style.left = '';
    modal.style.top = '';
    modal.style.width = '';
    modal.style.maxHeight = '';
  }

  node.addEventListener('pointerdown', onDown);
  document.addEventListener('pointermove', onMove, true);
  document.addEventListener('pointerup', onUp, true);
  document.addEventListener('pointercancel', onUp, true);
  node.addEventListener('dblclick', onDouble);

  return {
    destroy() {
      node.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onUp, true);
      node.removeEventListener('dblclick', onDouble);
    }
  };
}
