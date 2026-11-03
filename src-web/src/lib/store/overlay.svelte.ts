/*
  界面层栈：谁能盖住谁，只由「打开顺序」决定。

  之前是 18 个布尔 + 一个按优先级排列的 if 链（closeTopLayer）：
  优先级顺序与真实打开顺序无关，日期浮层根本不在链上，
  所以「编辑器里点开日期面板按 Esc」会把整个编辑器关掉。

  现在只有一份 stack：
  - 组件渲染 = 按 stack 顺序渲染，天然保证上层盖下层
  - Esc = 关栈顶，一次一层
  - 同 kind 同 key 重复打开是 no-op（顺带根治三套确认框被挂两遍）
*/
import { closeActivePanel } from '$lib/actions/float';
import type { EditorPreset, Task } from '$lib/domain/types';

export interface ConfirmReq {
  title: string;
  desc: string;
  okText: string;
  danger: boolean;
  onOk: () => void;
}

export interface PromptReq {
  title: string;
  label: string;
  value: string;
  placeholder: string;
  okText: string;
  onOk: (v: string) => void;
}

/** 输入确认框：同一个组件同时承担「删除 / 恢复 / 导入」三类动作，文案必须由调用方给 */
export interface TypedReq {
  title: string;
  desc: string;
  word: string;
  /** 确认按钮文案，缺省「确认」；删除类传「确认删除」，恢复类传「确认恢复」 */
  okText?: string;
  /** 是否危险动作（红按钮）。恢复 / 导入不是删除，传 false 用主色 */
  danger?: boolean;
  /** 输入框下方提示，缺省「此操作无法撤销」；可逆动作应换掉这句 */
  hint?: string;
  onOk: () => void;
}

export type Overlay =
  | { kind: 'detail'; id: string }
  | { kind: 'editor'; id: string; preset: EditorPreset | null }
  | { kind: 'quickAdd'; draft: string }
  | { kind: 'search' }
  | { kind: 'filter' }
  | { kind: 'reminder' }
  | { kind: 'settings' }
  | { kind: 'backup' }
  | { kind: 'help' }
  | { kind: 'shortcuts' }
  | { kind: 'habitEditor'; id: string }
  | { kind: 'cdEditor'; id: string }
  | { kind: 'templatePicker'; onpick: (t: Task) => void }
  | { kind: 'confirm'; req: ConfirmReq }
  | { kind: 'prompt'; req: PromptReq }
  | { kind: 'typed'; req: TypedReq };

export type Layer = Overlay & { uid: number };
export type LayerKind = Overlay['kind'];

export const overlay = $state({ stack: [] as Layer[], closing: [] as Layer[] });

let seq = 0;
const nextUid = (): number => ++seq;

/** 退场动画时长：面板滑出 200ms，留 40ms 缓冲再销毁节点 */
const EXIT_MS = 240;

const reduceMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const PANEL_KINDS = new Set<LayerKind>(['detail', 'editor', 'habitEditor', 'cdEditor']);
const isPanelKind = (k: LayerKind): boolean => PANEL_KINDS.has(k);

/**
 * 关掉一层时不立刻销毁节点，先放进 closing 队列让 CSS 播完退场动画。
 * 注意两条边界：
 *   1. 只有右侧面板（panel 类）有 sdPanelOut 退场关键帧；居中弹窗没有 .out 规则，
 *      放进 closing 只会让它在屏幕上多留 240ms 闪一下。
 *   2. 如果栈里还留着另一层面板（例如从编辑器点「返回」回到详情），侧栏槽位本身没收起，
 *      此时做滑出动画会让上层滑走、下层露底，视觉上像弹窗闪了一下 —— 直接瞬切。
 */
function retire(l: Layer): void {
  if (reduceMotion()) return;
  if (!isPanelKind(l.kind)) return;
  if (overlay.stack.some((x) => isPanelKind(x.kind))) return;
  overlay.closing = overlay.closing.filter((x) => !isPanelKind(x.kind));
  overlay.closing.push(l);
  setTimeout(() => {
    const i = overlay.closing.findIndex((x) => x.uid === l.uid);
    if (i > -1) overlay.closing.splice(i, 1);
  }, EXIT_MS);
}

const last = (): Layer | undefined => overlay.stack[overlay.stack.length - 1];

/** 取栈顶某类层；多数场景只关心「有没有」 */
export function layerOf<K extends LayerKind>(kind: K): Extract<Layer, { kind: K }> | undefined {
  for (let i = overlay.stack.length - 1; i >= 0; i--) {
    const l = overlay.stack[i];
    if (l.kind === kind) return l as Extract<Layer, { kind: K }>;
  }
  return undefined;
}

export function hasKind(kind: LayerKind): boolean {
  return overlay.stack.some((l) => l.kind === kind);
}

export function push(o: Overlay): Layer {
  // 新面板进场时清掉正在退场的旧面板，避免一进一出叠在同一槽位里闪
  if (overlay.closing.length) {
    overlay.closing = isPanelKind(o.kind)
      ? overlay.closing.filter((x) => !isPanelKind(x.kind))
      : overlay.closing.filter((x) => x.kind !== o.kind);
  }
  overlay.stack.push({ ...o, uid: nextUid() } as Layer);
  return overlay.stack[overlay.stack.length - 1];
}

/** 关掉栈顶一层；返回是否真的关掉了 */
export function pop(): boolean {
  if (!overlay.stack.length) return false;
  retire(overlay.stack.pop()!);
  return true;
}

export function closeKind(kind: LayerKind): boolean {
  for (let i = overlay.stack.length - 1; i >= 0; i--) {
    if (overlay.stack[i].kind === kind) {
      const [hit] = overlay.stack.splice(i, 1);
      retire(hit);
      return true;
    }
  }
  return false;
}

export function closeAll(): void {
  const all = overlay.stack.splice(0, overlay.stack.length);
  // 一次关掉一摞时只给最上面那层做退场，其余直接消失，避免糊成一片
  const top = all[all.length - 1];
  if (top) retire(top);
}

/* ---------------- 任务详情 ---------------- */

export function detailIdOf(): string {
  return layerOf('detail')?.id || '';
}

export function isDetailOpen(id: string): boolean {
  return !!id && overlay.stack.some((l) => l.kind === 'detail' && l.id === id);
}

export function openTaskDetail(id: string): void {
  if (!id) return;
  // 右侧栏是单槽位：点开一条日程看详情时，栈里若还留着编辑器（例如之前点过「添加日程」），
  // 必须顺手收掉 —— 否则关掉详情时底下的编辑器会突然蹦出来闪一下。
  for (let i = overlay.stack.length - 1; i >= 0; i--) {
    const k = overlay.stack[i].kind;
    if (k === 'editor' || k === 'habitEditor' || k === 'cdEditor') {
      overlay.stack.splice(i, 1);
    }
  }
  const at = overlay.stack.findIndex((l) => l.kind === 'detail' && l.id === id);
  // 已经在栈顶：不动，避免重复打开把滚动位置重置
  // 注意 at >= 0：空栈时 findIndex 与「栈顶下标」都是 -1，漏了这个判断就永远打不开
  if (at >= 0 && at === overlay.stack.length - 1) return;
  if (at >= 0) {
    const [hit] = overlay.stack.splice(at, 1);
    overlay.stack.push(hit);
    return;
  }
  const other = overlay.stack.findIndex((l) => l.kind === 'detail');
  if (other >= 0) {
    // 换一条：换 uid 强制重挂载，否则面板内容还停在上一条
    if (overlay.closing.length) overlay.closing = overlay.closing.filter((x) => !isPanelKind(x.kind));
    overlay.stack.splice(other, 1, { kind: 'detail', id, uid: nextUid() });
    return;
  }
  push({ kind: 'detail', id });
}

export function closeTaskDetail(): void {
  closeKind('detail');
}

/** 再点一次同一条就收起（旧版 toggleDetailFromClick 的语义） */
/**
 * 点同一条日程：已开着就关掉，没开就打开。
 *
 * 原条件里多了一句 `&& !hasKind('editor')` —— 本意是「编辑器压在上面时，
 * 点日程应该切到详情而不是关掉它」。但结果是：新建日程面板开着 → 点一条日程
 * 打开详情 → 再点同一条时，编辑器还在栈里，于是永远不关，用户只能按 Esc。
 *
 * 现在改成按「详情是不是栈顶」判断：详情在最上面就关掉它；
 * 被别的层压着就先提到最上面（切换而不是关）。
 */
export function toggleTaskDetail(id: string): void {
  if (!id) return;
  if (detailIdOf() !== id) {
    openTaskDetail(id);
    return;
  }
  // 详情就是这条：栈顶 = 再点收起，被压着 = 先提到顶层
  if (last()?.kind === 'detail') closeTaskDetail();
  else openTaskDetail(id);
}

/* ---------------- 任务编辑器 ---------------- */

export function editorLayer(): Extract<Layer, { kind: 'editor' }> | undefined {
  return layerOf('editor');
}

export function editorIdOf(): string {
  return editorLayer()?.id || '';
}

export function openTaskEditor(id = '', preset: EditorPreset | null = null): void {
  const taskId = id && id !== '__new__' ? id : '__new__';
  // 不是从详情点「修改」进来的（例如点「添加日程」或行内编辑按钮）：
  // 清掉栈里旧的 detail / 其它面板，避免关掉编辑器时底下又露出上一条详情闪一下。
  if (!preset?.fromDetail) {
    for (let i = overlay.stack.length - 1; i >= 0; i--) {
      const k = overlay.stack[i].kind;
      if (k === 'detail' || k === 'habitEditor' || k === 'cdEditor') {
        overlay.stack.splice(i, 1);
      }
    }
  }
  const at = overlay.stack.findIndex((l) => l.kind === 'editor');
  if (at >= 0) {
    const cur = overlay.stack[at];
    if (at === overlay.stack.length - 1 && cur.kind === 'editor' && cur.id === taskId && cur.preset === preset) return;
    // 只保留一个编辑器；换条就重挂载，保证表单读到的是新草稿
    if (overlay.closing.length) overlay.closing = overlay.closing.filter((x) => !isPanelKind(x.kind));
    overlay.stack.splice(at, 1, { kind: 'editor', id: taskId, preset, uid: nextUid() });
    if (at !== overlay.stack.length - 1) {
      const [hit] = overlay.stack.splice(at, 1);
      overlay.stack.push(hit);
    }
    return;
  }
  push({ kind: 'editor', id: taskId, preset });
}

export function closeTaskEditor(): void {
  closeKind('editor');
}

/* ---------------- 模板选择器（叠在编辑器上的独立层） ---------------- */

export function openTemplatePicker(onpick: (t: Task) => void): void {
  if (hasKind('templatePicker')) return;
  push({ kind: 'templatePicker', onpick });
}

export function closeTemplatePicker(): void {
  closeKind('templatePicker');
}

/* ---------------- Esc：浮层 → 栈顶 → 抽屉 ---------------- */

export function escapeLayer(): boolean {
  // 浮层（日期 / 时间 / 标签 / 迷你菜单）永远先于弹层
  if (closeActivePanel()) return true;
  if (pop()) return true;
  return false;
}

/** 栈顶一层（渲染顺序的最后一项） */
export function topLayer(): Layer | undefined {
  return last();
}
