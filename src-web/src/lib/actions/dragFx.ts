/*
  拖拽视觉层：ghost 浮层、占位让位、落点高亮、底部提示、自动滚动。

  「让位」的做法：把源元素从布局里摘掉（display:none），原位换成等高的 .drag-slot 占位；
  拖动中把占位插到目标位置，其余卡片随之挪开，松手时按占位的位置落库。
  这样松手不会「啪」地跳一下 —— 视觉位置和最终位置始终是同一个。
*/
let ghost: HTMLElement | null = null;
let tip: HTMLElement | null = null;
let marked: HTMLElement | null = null;
let markedCls: string[] = [];
let markedShadow = '';

/** 占位与源元素，一次只有一个拖拽 */
let slotEl: HTMLElement | null = null;
/** 停顿多久才让位：拖到哪儿都立刻重排，整排卡片会跟着鼠标抖 */
const SLOT_HOLD = 180;
let slotTimer = 0;
let pendingSlot: { host: HTMLElement | null; ref: HTMLElement | null; pos: 'before' | 'after' } | null = null;
let srcEl: HTMLElement | null = null;
let homeParent: HTMLElement | null = null;
let homeNext: Node | null = null;

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

/** 让一段区域里的元素「滑」到新位置：先按旧位置反向位移，再过渡回 0 */
function flip(host: HTMLElement | null, before: Map<HTMLElement, number>): void {
  if (!host) return;
  Array.from(host.children).forEach((n) => {
    const el = n as HTMLElement;
    const y0 = before.get(el);
    if (y0 === undefined) return;
    const dy = y0 - el.getBoundingClientRect().top;
    if (Math.abs(dy) < 1) return;
    el.style.transition = 'none';
    el.style.transform = 'translateY(' + dy + 'px)';
    void el.offsetHeight; // 强制结算，否则下一帧不会产生过渡
    el.style.transition = 'transform .16s cubic-bezier(.2,.8,.3,1)';
    el.style.transform = '';
    window.setTimeout(() => {
      el.style.transition = '';
      el.style.transform = '';
    }, 200);
  });
}

function topMap(host: HTMLElement | null): Map<HTMLElement, number> {
  const m = new Map<HTMLElement, number>();
  if (!host) return m;
  Array.from(host.children).forEach((n) => {
    m.set(n as HTMLElement, (n as HTMLElement).getBoundingClientRect().top);
  });
  return m;
}

function restoreSlot(): void {
  if (!slotEl || !homeParent) return;
  if (slotEl.parentElement !== homeParent || slotEl.nextSibling !== homeNext) {
    homeParent.insertBefore(slotEl, homeNext);
  }
}

/** 真正把占位挪过去（调用前已确认目标变了） */
function placeSlot(host: HTMLElement | null, ref: HTMLElement | null, pos: 'before' | 'after'): void {
  if (!slotEl) return;
  if (!host || ref === srcEl) {
    restoreSlot();
    return;
  }
  const target = ref ? (pos === 'after' ? ref.nextSibling : ref) : null;
  if (slotEl.parentElement === host && slotEl.nextSibling === target) return;
  const from = slotEl.parentElement;
  const beforeFrom = topMap(from);
  const beforeTo = topMap(host);
  host.insertBefore(slotEl, target);
  flip(from, beforeFrom);
  flip(host, beforeTo);
}

/** 松手时调用：把还在等待的目标立刻落地，保证「停哪儿落哪儿」 */
function flushSlot(): void {
  if (!pendingSlot) return;
  const p = pendingSlot;
  pendingSlot = null;
  window.clearTimeout(slotTimer);
  slotTimer = 0;
  placeSlot(p.host, p.ref, p.pos);
}

function dropPending(): void {
  pendingSlot = null;
  window.clearTimeout(slotTimer);
  slotTimer = 0;
}

export interface DropWhere {
  host: HTMLElement | null;
  prev: HTMLElement | null;
  next: HTMLElement | null;
}

export interface DragFx {
  move(e: PointerEvent): void;
  mark(el: HTMLElement | null, mode: 'box' | 'insert-l' | 'insert-r', text?: string): void;
  /** 让位：占位插到 host 里 ref 的前/后；host 为空则回原位 */
  slot(host: HTMLElement | null, ref: HTMLElement | null, pos?: 'before' | 'after'): void;
  /** 占位现在落在谁前面/后面（松手时按它算顺序，比重新命中更准） */
  where(): DropWhere;
  end(): void;
}

export function beginDrag(opts: {
  source: HTMLElement;
  scrollEl?: () => HTMLElement | null;
  /** 按下时的指针位置：幽灵要「捏住原来的点」，不能固定偏移 */
  at?: { x: number; y: number };
  /** 关掉幽灵（时间线只要落点预览，不要一条跟着手走的色带） */
  ghost?: boolean;
  /**
   * 关掉占位让位（默认开）。时间线的色带是绝对定位、没有布局流，
   * 插占位会撑开泳道；这类视图自己画预览。
   */
  placeholder?: boolean;
}): DragFx {
  const src = opts.source;
  srcEl = src;
  const rect = src.getBoundingClientRect();

  // 捏住的位置 = 指针相对源元素左上角。捏哪跟哪，松手时鼠标才还在卡片上。
  const grabX = opts.at ? Math.min(Math.max(0, opts.at.x - rect.left), rect.width) : Math.min(12, rect.width / 2);
  const grabY = opts.at ? Math.min(Math.max(0, opts.at.y - rect.top), rect.height) : Math.min(10, rect.height / 2);

  if (opts.ghost !== false) {
    ghost = src.cloneNode(true) as HTMLElement;
    // 克隆体不能带 id：否则 #edTitle 这类契约被复制，querySelector 会命中浮层
    ghost.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    ghost.removeAttribute('id');
    // 必须保留原来的类（tcard / task / kcard）：padding、flex、gap、优先级色条都在那里。
    // 以前是整体替换成 drag-ghost，结果内容贴着边框、行距塌掉，看起来像「被放大」。
    ghost.classList.remove('dragging');
    ghost.classList.add('drag-ghost');
    ghost.style.width = rect.width + 'px';
    ghost.style.height = rect.height + 'px';
    ghost.style.left = rect.left + 'px';
    ghost.style.top = rect.top + 'px';
    floatRoot().appendChild(ghost);
  }

  // 占位顶替源元素的位置：源元素保留在 DOM 里（Svelte 的 keyed each 依赖它），只隐藏
  if (opts.placeholder !== false) {
    homeParent = src.parentElement;
    homeNext = src.nextSibling;
    slotEl = document.createElement('div');
    slotEl.className = 'drag-slot';
    slotEl.style.height = rect.height + 'px';
    const radius = getComputedStyle(src).borderRadius;
    if (radius) slotEl.style.borderRadius = radius;
    if (homeParent) homeParent.insertBefore(slotEl, src);
    src.style.display = 'none';
  }

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
        const x = Math.min(Math.max(8, e.clientX - grabX), window.innerWidth - ghost.offsetWidth - 8);
        const y = Math.min(Math.max(8, e.clientY - grabY), window.innerHeight - ghost.offsetHeight - 8);
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
    slot(host: HTMLElement | null, ref: HTMLElement | null, pos: 'before' | 'after' = 'before'): void {
      if (!slotEl) return;
      // 目标没变就不重排：拖动中每帧都会调到这里
      if (pendingSlot) {
        if (pendingSlot.host === host && pendingSlot.ref === ref && pendingSlot.pos === pos) return;
      } else if (!host || ref === srcEl) {
        if (slotEl.parentElement === homeParent && slotEl.nextSibling === homeNext) return;
      } else {
        const target = ref ? (pos === 'after' ? ref.nextSibling : ref) : null;
        if (slotEl.parentElement === host && slotEl.nextSibling === target) return;
      }
      // 悬停稳定 SLOT_HOLD 毫秒后才真的让位；中途换目标就重新计时
      pendingSlot = { host, ref, pos };
      window.clearTimeout(slotTimer);
      slotTimer = window.setTimeout(flushSlot, SLOT_HOLD);
    },
    where(): DropWhere {
      flushSlot();
      return {
        host: slotEl?.parentElement ?? null,
        prev: (slotEl?.previousElementSibling as HTMLElement | null) ?? null,
        next: (slotEl?.nextElementSibling as HTMLElement | null) ?? null
      };
    },
    end(): void {
      clearMark();
      dropPending();
      if (ghost) {
        ghost.remove();
        ghost = null;
      }
      if (tip) {
        tip.classList.remove('in');
        tip.textContent = '';
      }
      if (slotEl) {
        if (srcEl) srcEl.style.display = '';
        slotEl.remove();
        slotEl = null;
      }
      srcEl = null;
      homeParent = null;
      homeNext = null;
      document.body.classList.remove('is-dragging');
    }
  };
}
