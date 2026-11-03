/*
  给清单和标签分配颜色。

  规则（R24 定，R25 修正）：

  1. **颜色存下来，不是每次按位置算。**
     上一版用「排序位置 → 色板下标」，看着省事，但一删中间那项，后面全体往前挪一格，
     颜色全变。现在首次分配就写进 meta，之后只读。

  2. **自动分配：取第一个没被占用的色。**
     所以新建标签一定是当前屏幕上还没有的颜色，不用比对色差。
     超过色板长度（清单 16 / 标签 13）才回退到「用得最少的那个」。

  3. **手动色就是用户说了算，允许重复，也绝不动别人。**
     上一版让「手动色优先、自动色让位」，结果是：用户把 B 设成和 A 同色，
     系统立刻把 A 改掉 —— 用户没动过的东西自己变了。这一版改掉：
     - 手动选的色原样保留，撞了也不管，这是用户的选择；
     - 自动分配的色只在自己那一格范围内重排（即：只影响自动的，且只影响还没被占的）；
     - **任何一次 ensureColors 都不改动已存在的自动色**，只给「还没有色」的补。

  4. 自动 vs 手动是两个状态，界面上要能看出来（选色面板底部标注）。
     手动色可以一键「交回自动」，交回后按规则 2 重新取空闲色。
*/
import { allLists, allTags } from '$lib/domain/selectors';
import { LIST_PALETTE, TAG_PALETTE, type TraditionalColor } from '$lib/domain/palette';
import { data } from './data.svelte';
import { meta, writeAutoColors } from './meta.svelte';

const listOrder = $derived(allLists(data.tasks, meta.customLists, meta.listOrder));
const tagOrder = $derived(allTags(data.tasks, meta.customTags, meta.tagOrder));

function hash(name: string): number {
  let n = 0;
  for (let i = 0; i < name.length; i++) n = (n * 31 + name.charCodeAt(i)) % 997;
  return n;
}

function byHex(palette: TraditionalColor[], hex: string): TraditionalColor | undefined {
  return palette.find((c) => c.hex.toUpperCase() === hex.toUpperCase());
}

/**
 * 补全一个分组的颜色表：只给「还没有色」的补，已有的一个都不动。
 * 幂等，可以反复调用。
 */
function ensure(kind: 'list' | 'tag', palette: TraditionalColor[], order: string[]): void {
  const book = kind === 'list' ? meta.listColors : meta.tagColors;
  const out: Record<string, string> = {};
  const used = new Set<string>();

  // 已记录的色一律保留 —— 不管它是手动还是自动，也允许和别人重复。
  // 重复只在「自动分配新色」时避开，不影响已经定下来的项。
  for (const name of order) {
    const h = book.c[name];
    if (h) {
      out[name] = h;
      used.add(h);
    }
  }

  // 只给没色的补：取第一个空闲色；色板用完就挑用得最少的，尽量摊开
  let changed = false;
  for (const name of order) {
    if (out[name]) continue;
    let pick = palette.find((c) => !used.has(c.hex));
    if (!pick) {
      const cnt = new Map<string, number>();
      for (const h of Object.values(out)) cnt.set(h, (cnt.get(h) || 0) + 1);
      pick = palette.slice().sort((a, b) => (cnt.get(a.hex) || 0) - (cnt.get(b.hex) || 0))[0];
    }
    out[name] = pick.hex;
    used.add(pick.hex);
    changed = true;
  }

  // 有新增才写，避免 effect 自激
  if (changed) writeAutoColors(kind, out);
}

/** 数据加载完、标签或清单有增减时调一次；幂等，不会改动已有颜色 */
export function ensureColors(): void {
  ensure('list', LIST_PALETTE, listOrder);
  ensure('tag', TAG_PALETTE, tagOrder);
}

/** 清单颜色；还没分配时按名字哈希兜一个，保证同屏不会全同色 */
export function listColorFor(name: string): TraditionalColor {
  const nm = name || '收集箱';
  const h = meta.listColors.c[nm];
  return (h && byHex(LIST_PALETTE, h)) || LIST_PALETTE[hash(nm) % LIST_PALETTE.length];
}

/** 标签颜色 */
export function tagColorFor(name: string): TraditionalColor {
  const h = meta.tagColors.c[name];
  return (h && byHex(TAG_PALETTE, h)) || TAG_PALETTE[hash(name) % TAG_PALETTE.length];
}

/** 色值 → 传统色名，选色面板和 tooltip 用；找不到就返回空串 */
export function colorName(palette: TraditionalColor[], hex: string): string {
  return byHex(palette, hex)?.name || '';
}

/**
 * 新建清单 / 标签时，如果不想等 effect，可以先问一下「下一个会是什么色」。
 * 只读，不写。用于提示语里告诉用户「已分配「竹绿」」这类信息。
 */
export function peekNextColor(kind: 'list' | 'tag'): TraditionalColor {
  const palette = kind === 'list' ? LIST_PALETTE : TAG_PALETTE;
  const book = kind === 'list' ? meta.listColors : meta.tagColors;
  const used = new Set(Object.values(book.c));
  return palette.find((c) => !used.has(c.hex)) || palette[0];
}

/** 该色是否已被同类别的别人占着（选色面板给个「已被 X 使用」的提示，但不阻止） */
export function colorOwner(kind: 'list' | 'tag', hex: string, except: string): string {
  const book = kind === 'list' ? meta.listColors : meta.tagColors;
  const up = hex.toUpperCase();
  for (const n of Object.keys(book.c)) {
    if (n !== except && String(book.c[n]).toUpperCase() === up) return n;
  }
  return '';
}
