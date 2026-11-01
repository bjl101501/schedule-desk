/*
  悬浮说明：上方优先，上方不够就放右、再放左，永不默认落到下方（下方是输入框）。

  tip.left/top 这个 store 形状保留：TipLayer 用 style="left/top" 摆位，
  CSS 入场动画走 opacity + translateY，与 floating-ui 写的 left/top 不冲突。
*/
import { computePosition, flip, offset, shift } from '@floating-ui/dom';

export const tip = $state({ text: '', on: false, left: 0, top: 0 });

let timer: ReturnType<typeof setTimeout> | null = null;
// 元素被移出 DOM 时浏览器会同步触发 focusout，而这一刻往往正处在 Svelte 的
// 提交流程里；此时直接写 $state 会抛 state_unsafe_mutation。
// 所以隐藏一律推到微任务，并用代次号避免把随后新弹出的提示误关掉。
let hideEpoch = 0;
// 显示也有代次号：computePosition 是异步的，连开两次时旧结果不能写回。
let showEpoch = 0;

const PAD = 8;

/** 同步兜底：先按旧公式摆一次，避免精修结果回来前提示停在 (0,0) */
function placeSync(el: HTMLElement, target: HTMLElement): void {
  const r = target.getBoundingClientRect();
  const w = el.offsetWidth || 180;
  const h = el.offsetHeight || 30;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let top = r.top - h - PAD;
  let left = r.left + r.width / 2 - w / 2;
  if (top < PAD) {
    top = Math.max(PAD, Math.min(r.top + r.height / 2 - h / 2, vh - h - PAD));
    const right = r.right + 10;
    left = right + w <= vw - PAD ? right : r.left - w - 10;
  }
  tip.left = Math.max(PAD, Math.min(left, vw - w - PAD));
  tip.top = Math.max(PAD, Math.min(top, vh - h - PAD));
}

export function showTipEl(target: HTMLElement): void {
  const text = target.getAttribute('data-tip');
  if (!text) return;
  hideEpoch++;
  const mine = ++showEpoch;
  tip.text = text;
  tip.on = true;

  // 先显示再量尺寸，否则 offsetWidth 为 0
  const el = document.querySelector<HTMLElement>('.tip-layer');
  if (el) placeSync(el, target);

  requestAnimationFrame(() => {
    const box = document.querySelector<HTMLElement>('.tip-layer');
    if (!box) return;
    computePosition(target, box, {
      placement: 'top',
      strategy: 'fixed',
      middleware: [
        offset(PAD),
        // 不写 'bottom'：上方、右、左都放不下时宁可贴边，也不压住下面的输入框
        flip({ padding: PAD, fallbackPlacements: ['right', 'left'] }),
        shift({ padding: PAD, crossAxis: true })
      ]
    })
      .then(({ x, y }) => {
        if (mine !== showEpoch || !tip.on) return;
        tip.left = Math.round(x);
        tip.top = Math.round(y);
      })
      .catch(() => {
        /* 元素已被移除：保持同步兜底的位置即可 */
      });
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
