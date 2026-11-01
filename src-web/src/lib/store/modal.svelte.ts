/* 模态栈：宽弹窗在宽屏下改用右侧停靠面板；小弹窗叠在面板之上；关闭有 180ms 退场 */
import type { Component } from 'svelte';

type AnyComp = Component<Record<string, unknown>>;

export interface ModalEntry {
  id: number;
  comp: AnyComp;
  props: Record<string, unknown>;
  wide: boolean;
  cls: string;
  stacked: boolean;
  closing: boolean;
  maskClose: boolean;
}

export const modalState = $state({
  stack: [] as ModalEntry[],
  panelOpen: false
});

let seq = 0;

export function isPanelWanted(wide: boolean): boolean {
  return wide && window.innerWidth >= 1000;
}

function recomputePanel(): void {
  const top = modalState.stack[modalState.stack.length - 1];
  modalState.panelOpen = !!top && !top.closing && isPanelWanted(top.wide);
}

export function openModal(
  comp: AnyComp,
  props: Record<string, unknown> = {},
  opts: { wide?: boolean; stack?: boolean; reuse?: boolean; maskClose?: boolean; cls?: string } = {}
): number {
  const wide = !!opts.wide;
  const cls = opts.cls || '';
  const top = modalState.stack[modalState.stack.length - 1];

  // 详情 → 编辑 → 返回：复用同一个面板壳，只换内容，避免整块重建时闪一下
  if (opts.reuse && top && isPanelWanted(top.wide)) {
    top.comp = comp;
    top.props = props;
    top.wide = wide;
    top.cls = cls;
    top.closing = false;
    recomputePanel();
    return top.id;
  }

  const entry: ModalEntry = {
    id: ++seq,
    comp,
    props,
    wide,
    cls,
    stacked: !!(top && (opts.stack || (isPanelWanted(top.wide) && !wide))),
    closing: false,
    maskClose: opts.maskClose !== false
  };

  if (!entry.stacked) modalState.stack = [entry];
  else modalState.stack = [...modalState.stack, entry];
  recomputePanel();
  return entry.id;
}

export function closeModal(id?: number): void {
  const stack = modalState.stack;
  const idx = id ? stack.findIndex((x) => x.id === id) : stack.length - 1;
  if (idx < 0) return;
  const entry = stack[idx];
  entry.closing = true;
  recomputePanel();
  setTimeout(() => {
    modalState.stack = modalState.stack.filter((x) => x.id !== entry.id);
    recomputePanel();
  }, 180);
}

export function closeAllModals(): void {
  while (modalState.stack.length) closeModal();
}

export function hasModal(): boolean {
  return modalState.stack.length > 0;
}
