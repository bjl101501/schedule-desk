/*
  拖拽落点计算：用「按下那一刻的矩形快照」判断，而不是拖动中实时读 DOM。

  为什么要快照：让位一旦发生，卡片会实时挪位置，实时读 DOM 会得到「目标卡已经被推走」的
  矩形，命中在两张卡之间来回跳，占位跟着抖。快照冻结了布局，鼠标走过哪张卡就一直是那张，
  视觉上占位平滑滑动，判定也稳定。
*/

export interface DropItem {
  el: HTMLElement;
  r: DOMRect;
}

export interface DropGroup {
  host: HTMLElement;
  r: DOMRect;
  /** 顺序即视觉顺序，用于「落在空白处」时找最近的一条 */
  items: DropItem[];
}

export interface DropHit {
  host: HTMLElement;
  /** 命中的条目；空白处为 null（表示放到该容器末尾或开头） */
  el: HTMLElement | null;
  /** true = 插到 el 之后 */
  after: boolean;
}

/** 拍快照：每个容器的矩形 + 容器内每条目的矩形 */
export function snapGroups(hosts: HTMLElement[], itemSel: string): DropGroup[] {
  const out: DropGroup[] = [];
  hosts.forEach((host) => {
    const r = host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const items = Array.from(host.querySelectorAll<HTMLElement>(itemSel))
      // 只认直接子级：嵌套的子项（子任务行）不该成为落点
      .filter((el) => el.parentElement === host)
      .map((el) => ({ el, r: el.getBoundingClientRect() }));
    out.push({ host, r, items });
  });
  return out;
}

const cx = (r: DOMRect): number => r.left + r.width / 2;
const cy = (r: DOMRect): number => r.top + r.height / 2;
const inside = (r: DOMRect, x: number, y: number): boolean =>
  x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

/**
 * 找落点。
 * axis='y' 按上下半区判断前后（列表），'x' 按左右半区（卡片网格）。
 */
export function pickDrop(
  x: number,
  y: number,
  groups: DropGroup[],
  axis: 'y' | 'x' = 'y'
): DropHit | null {
  // 1. 点在哪个容器里；不在任何容器里就不给落点（松手等于取消）
  const host = groups.find((g) => inside(g.r, x, y));
  if (!host) return null;

  const after = (r: DOMRect): boolean => (axis === 'x' ? x > cx(r) : y > cy(r));

  // 2. 直接压在某一条上
  const hit = host.items.find((it) => inside(it.r, x, y));
  if (hit) return { host: host.host, el: hit.el, after: after(hit.r) };

  // 3. 落在容器空白处（组内行之间、卡片行末尾）：取中心最近的一条
  if (!host.items.length) return { host: host.host, el: null, after: true };
  let near = host.items[0];
  let best = Infinity;
  host.items.forEach((it) => {
    const d = Math.hypot(cx(it.r) - x, cy(it.r) - y);
    if (d < best) {
      best = d;
      near = it;
    }
  });
  return { host: host.host, el: near.el, after: after(near.r) };
}
