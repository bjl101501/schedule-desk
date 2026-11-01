/* 悬浮说明：优先放上方，上方不够放左右，永不默认落到下方（下方是输入框） */
export const tip = $state({ text: '', on: false, left: 0, top: 0 });

let timer: ReturnType<typeof setTimeout> | null = null;
// 元素被移出 DOM 时浏览器会同步触发 focusout，而这一刻往往正处在 Svelte 的
// 提交流程里；此时直接写 $state 会抛 state_unsafe_mutation。
// 所以隐藏一律推到微任务，并用代次号避免把随后新弹出的提示误关掉。
let hideEpoch = 0;

export function showTipEl(target: HTMLElement): void {
  const text = target.getAttribute('data-tip');
  if (!text) return;
  hideEpoch++;
  tip.text = text;
  tip.on = true;
  // 先显示再量尺寸，否则 offsetWidth 为 0
  requestAnimationFrame(() => {
    const el = document.querySelector('.tip-layer') as HTMLElement | null;
    if (!el) return;
    const r = target.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = r.top - h - 8;
    let left = r.left + r.width / 2 - w / 2;
    if (top < 8) {
      top = Math.max(8, Math.min(r.top + r.height / 2 - h / 2, vh - h - 8));
      const right = r.right + 10;
      left = right + w <= vw - 8 ? right : r.left - w - 10;
    }
    tip.left = Math.max(8, Math.min(left, vw - w - 8));
    tip.top = Math.max(8, Math.min(top, vh - h - 8));
  });
}

export function showTip(target: HTMLElement | string): void {
  const el = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
  if (el) showTipEl(el);
}

export function hideTip(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!tip.on) return;
  const mine = ++hideEpoch;
  queueMicrotask(() => {
    if (mine === hideEpoch) tip.on = false;
  });
}

export function scheduleTip(target: HTMLElement): void {
  hideTip();
  timer = setTimeout(() => showTipEl(target), 320);
}

export function bindTips(): void {
  document.addEventListener(
    'pointerover',
    (e) => {
      const t = (e.target as HTMLElement | null)?.closest?.('[data-tip]') as HTMLElement | null;
      if (t) scheduleTip(t);
    },
    true
  );
  document.addEventListener(
    'pointerout',
    (e) => {
      const t = (e.target as HTMLElement | null)?.closest?.('[data-tip]');
      if (t) hideTip();
    },
    true
  );
  document.addEventListener(
    'focusin',
    (e) => {
      const t = (e.target as HTMLElement | null)?.closest?.('[data-tip]') as HTMLElement | null;
      if (t) showTipEl(t);
    },
    true
  );
  document.addEventListener('focusout', hideTip, true);
  document.addEventListener('scroll', hideTip, true);
  window.addEventListener('blur', hideTip);
}
