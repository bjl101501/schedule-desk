/*
  拖拽视觉层：ghost 浮层、落点高亮、底部提示、自动滚动。
  样式里 .drag-ghost / .dragover / .drop-before / .drag-tip / body.is-dragging
  早就写好了，只是一直没有生产者 —— 这里补上，避免改 styles.css。
*/
let ghost: HTMLElement | null = null;
let tip: HTMLElement | null = null;
let marked: HTMLElement | null = null;
let markedCls: string[] = [];
let markedShadow = '';

function floatRoot(): HTMLElement {
  return document.getElementById('float-root') || document.body;
}

function ensureTip(): HTMLElement {
  if (tip && tip.isConnected) return tip;
  tip = document.createElement('div');
  tip.className = 'drag-tip';
  floatRoot().appendChild(tip);
  return tip;
}

function clearMark(): void {
  if (!marked) return;
  marked.classList.remove(...markedCls);
  if (markedShadow) marked.style.boxShadow = markedShadow;
  marked = null;
  markedCls = [];
  markedShadow = '';
}

export interface DragFx {
  move(e: PointerEvent): void;
  mark(el: HTMLElement | null, mode: 'box' | 'insert-l' | 'insert-r', text?: string): void;
  end(): void;
}

export function beginDrag(opts: {
  source: HTMLElement;
  ghostClass?: string;
  scrollEl?: () => HTMLElement | null;
}): DragFx {
  const src = opts.source;
  const rect = src.getBoundingClientRect();

  ghost = src.cloneNode(true) as HTMLElement;
  // 克隆体不能带 id：否则 #edTitle 这类契约被复制，querySelector 会命中浮层
  ghost.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
  ghost.removeAttribute('id');
  ghost.className = 'drag-ghost' + (opts.ghostClass ? ' ' + opts.ghostClass : '');
  ghost.style.width = rect.width + 'px';
  ghost.style.height = rect.height + 'px';
  ghost.style.left = rect.left + 'px';
  ghost.style.top = rect.top + 'px';
  floatRoot().appendChild(ghost);

  const t = ensureTip();
  t.textContent = '';
  t.classList.remove('in');
  document.body.classList.add('is-dragging');

  function autoScroll(e: PointerEvent): void {
    const box = opts.scrollEl?.();
    if (!box) return;
    const r = box.getBoundingClientRect();
    const edge = 56;
    if (e.clientY < r.top + edge) box.scrollTop -= 14;
    else if (e.clientY > r.bottom - edge) box.scrollTop += 14;
  }

  return {
    move(e: PointerEvent): void {
      if (ghost) {
        const x = Math.min(Math.max(8, e.clientX + 12), window.innerWidth - ghost.offsetWidth - 8);
        const y = Math.min(Math.max(8, e.clientY + 10), window.innerHeight - ghost.offsetHeight - 8);
        ghost.style.left = x + 'px';
        ghost.style.top = y + 'px';
      }
      autoScroll(e);
    },
    mark(el: HTMLElement | null, mode: 'box' | 'insert-l' | 'insert-r', text?: string): void {
      if (marked !== el || !markedCls.length) {
        clearMark();
        if (el) {
          marked = el;
          markedShadow = el.style.boxShadow;
          if (mode === 'box') {
            markedCls = ['dragover'];
            el.classList.add('dragover');
          } else if (mode === 'insert-l') {
            markedCls = ['drop-before'];
            el.classList.add('drop-before');
          } else {
            // 右半区没有专用类，用一模一样的 3px 内描边顶上
            el.style.boxShadow = (markedShadow ? markedShadow + ', ' : '') + 'inset -3px 0 0 var(--brand)';
          }
        }
      }
      const box = ensureTip();
      if (text) {
        box.textContent = text;
        box.classList.add('in');
      } else {
        box.classList.remove('in');
      }
    },
    end(): void {
      clearMark();
      if (ghost) {
        ghost.remove();
        ghost = null;
      }
      if (tip) {
        tip.classList.remove('in');
        tip.textContent = '';
      }
      document.body.classList.remove('is-dragging');
    }
  };
}
