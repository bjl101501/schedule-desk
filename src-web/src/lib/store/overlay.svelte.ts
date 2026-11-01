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

export interface TypedReq {
  title: string;
  desc: string;
  word: string;
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

export const overlay = $state({ stack: [] as Layer[] });

let seq = 0;
const nextUid = (): number => ++seq;

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
  overlay.stack.push({ ...o, uid: nextUid() } as Layer);
  return overlay.stack[overlay.stack.length - 1];
}

/** 关掉栈顶一层；返回是否真的关掉了 */
export function pop(): boolean {
  if (!overlay.stack.length) return false;
  overlay.stack.pop();
  return true;
}

export function closeKind(kind: LayerKind): boolean {
  for (let i = overlay.stack.length - 1; i >= 0; i--) {
    if (overlay.stack[i].kind === kind) {
      overlay.stack.splice(i, 1);
      return true;
    }
  }
  return false;
}

export function closeAll(): void {
  overlay.stack.splice(0, overlay.stack.length);
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
  const at = overlay.stack.findIndex((l) => l.kind === 'detail' && l.id === id);
  // 已经在栈顶：不动，避免重复打开把滚动位置重置
  // 注意 at >= 0：空栈时 findIndex 与「栈顶下标」都是 -1，漏了这个判断就永远打不开
  if (at >= 0 && at === overlay.stack.length - 1) return;
  if (at >= 0) {
    // 栈里已有这条（被编辑器压在下面）：提到栈顶，不重挂载
    const [hit] = overlay.stack.splice(at, 1);
    overlay.stack.push(hit);
    return;
  }
  const other = overlay.stack.findIndex((l) => l.kind === 'detail');
  if (other >= 0) {
    // 换一条：换 uid 强制重挂载，否则面板内容还停在上一条
    overlay.stack.splice(other, 1, { kind: 'detail', id, uid: nextUid() });
    return;
  }
  push({ kind: 'detail', id });
}

export function closeTaskDetail(): void {
  closeKind('detail');
}

/** 再点一次同一条就收起（旧版 toggleDetailFromClick 的语义） */
export function toggleTaskDetail(id: string): void {
  if (!id) return;
  if (detailIdOf() === id && !hasKind('editor')) closeTaskDetail();
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
  const at = overlay.stack.findIndex((l) => l.kind === 'editor');
  if (at >= 0) {
    const cur = overlay.stack[at];
    if (at === overlay.stack.length - 1 && cur.kind === 'editor' && cur.id === taskId && cur.preset === preset) return;
    // 只保留一个编辑器；换条就重挂载，保证表单读到的是新草稿
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
