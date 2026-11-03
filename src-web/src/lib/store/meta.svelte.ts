/*
  藏在 localStorage 里的视图元数据：清单、标签、归档、排序、面板宽度。
  旧代码每次 render 现读 localStorage，所以看不出「读的不是响应式」；
  改到 Svelte 必须收编成 $state，否则拖完侧栏不重排。
*/
import { STORAGE_KEYS as K, readArr, readJson, readRaw, writeArr, writeJson, writeRaw } from './storage';

/** 一个分组（清单 / 标签）的配色状态：名字→色值，外加哪些是用户手动定的 */
export interface ColorBook {
  /** 名字 → #RRGGBB。自动分配的色也在这里，否则删掉中间一项会让后面全体换色 */
  c: Record<string, string>;
  /** 用户手动指定过颜色的名字。冲突时它们优先，自动色让位 */
  p: string[];
}

function emptyBook(): ColorBook {
  return { c: {}, p: [] };
}

function readBook(key: string): ColorBook {
  const v = readJson<ColorBook | null>(key, null);
  if (!v || typeof v !== 'object') return emptyBook();
  return {
    c: v.c && typeof v.c === 'object' ? v.c : {},
    p: Array.isArray(v.p) ? v.p.filter((x) => typeof x === 'string') : []
  };
}

export const meta = $state({
  customLists: [] as string[],
  customTags: [] as string[],
  archived: [] as string[],
  listOrder: [] as string[],
  tagOrder: [] as string[],
  cdGroupOrder: [] as string[],
  panelW: 440,
  listColors: emptyBook(),
  tagColors: emptyBook(),
  /* 本地偏好是否已读回来。颜色补全要等它为 true，否则会用空表算一遍并把磁盘上的覆盖掉 */
  ready: false
});

export function hydrateMeta(): void {
  meta.customLists = readArr(K.lists);
  meta.customTags = readArr(K.tags);
  meta.archived = readArr(K.archived);
  meta.listOrder = readArr(K.listOrder);
  meta.tagOrder = readArr(K.tagOrder);
  meta.cdGroupOrder = readArr(K.cdGroupOrder);
  meta.listColors = readBook(K.listColors);
  meta.tagColors = readBook(K.tagColors);
  const w = Number(readRaw(K.panelW) || 0);
  meta.panelW = w >= 360 && w <= 760 ? Math.round(w) : 440;
  applyPanelWidth(meta.panelW);
  meta.ready = true;
}

/* ---------------- 清单 / 标签配色 ---------------- */

function writeBook(kind: 'list' | 'tag', book: ColorBook): void {
  if (kind === 'list') {
    meta.listColors = book;
    writeJson(K.listColors, book);
  } else {
    meta.tagColors = book;
    writeJson(K.tagColors, book);
  }
}

/** 手动指定颜色；hex 传空 = 交回自动分配 */
export function setColorOf(kind: 'list' | 'tag', name: string, hex: string): void {
  if (!name) return;
  const cur = kind === 'list' ? meta.listColors : meta.tagColors;
  const c = { ...cur.c };
  const p = cur.p.filter((x) => x !== name);
  if (hex) {
    c[name] = hex;
    p.push(name);
  } else {
    delete c[name];
  }
  writeBook(kind, { c, p });
}

/** 自动分配结果落盘（由 palette 的 ensureColors 调用，用户看不到这一步） */
export function writeAutoColors(kind: 'list' | 'tag', c: Record<string, string>): void {
  const cur = kind === 'list' ? meta.listColors : meta.tagColors;
  writeBook(kind, { c, p: cur.p });
}

/** 改名时把颜色跟着搬过去 */
export function moveColorKey(kind: 'list' | 'tag', from: string, to: string): void {
  if (!from || !to || from === to) return;
  const cur = kind === 'list' ? meta.listColors : meta.tagColors;
  if (!(from in cur.c)) return;
  const c = { ...cur.c };
  c[to] = c[from];
  delete c[from];
  const p = cur.p.map((x) => (x === from ? to : x));
  writeBook(kind, { c, p });
}

/** 删除清单 / 标签时清掉它的颜色记录 */
export function dropColorKey(kind: 'list' | 'tag', name: string): void {
  const cur = kind === 'list' ? meta.listColors : meta.tagColors;
  if (!(name in cur.c)) return;
  const c = { ...cur.c };
  delete c[name];
  writeBook(kind, { c, p: cur.p.filter((x) => x !== name) });
}

/** 是否用户手动定的色（选色面板据此显示「自动 / 自定义」） */
export function isPinnedColor(kind: 'list' | 'tag', name: string): boolean {
  const cur = kind === 'list' ? meta.listColors : meta.tagColors;
  return cur.p.indexOf(name) > -1;
}

export function applyPanelWidth(w: number): void {
  const v = Math.max(360, Math.min(760, Math.round(w || 440)));
  meta.panelW = v;
  document.documentElement.style.setProperty('--panel-w', v + 'px');
}

export function savePanelWidth(): void {
  writeRaw(K.panelW, String(meta.panelW));
}

export function addCustomList(name: string): string {
  const n = String(name || '').trim();
  if (!n) return '';
  if (meta.customLists.indexOf(n) === -1) {
    meta.customLists.push(n);
    writeArr(K.lists, meta.customLists);
  }
  return n;
}

export function addCustomTag(name: string): string {
  const n = String(name || '')
    .trim()
    .replace(/^#/, '');
  if (!n) return '';
  if (meta.customTags.indexOf(n) === -1) {
    meta.customTags.push(n);
    writeArr(K.tags, meta.customTags);
  }
  return n;
}

export function isArchived(name: string): boolean {
  return meta.archived.indexOf(name) > -1;
}

export function archiveList(name: string): void {
  if (meta.archived.indexOf(name) === -1) {
    meta.archived.push(name);
    writeArr(K.archived, meta.archived);
  }
}

export function unarchiveList(name: string): void {
  meta.archived = meta.archived.filter((x) => x !== name);
  writeArr(K.archived, meta.archived);
}

export function setListOrder(order: string[]): void {
  meta.listOrder = order.slice();
  writeArr(K.listOrder, meta.listOrder);
}

export function setTagOrder(order: string[]): void {
  meta.tagOrder = order.slice();
  writeArr(K.tagOrder, meta.tagOrder);
}

export function setCdGroupOrder(order: string[]): void {
  meta.cdGroupOrder = order.slice();
  writeArr(K.cdGroupOrder, meta.cdGroupOrder);
}
