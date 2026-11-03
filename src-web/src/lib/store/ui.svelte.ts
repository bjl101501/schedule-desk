/*
  uiState 是「界面意图」的兼容门面：读是派生，写是动作。

  真实状态在 overlay.stack（见 overlay.svelte.ts）。保留这个名字是因为
  二十多个组件都在读它，改签名会把 diff 摊到每个视图；但写入一律转成
  open/close，组件不再直接改布尔。

  迷你菜单与换肤菜单是浮层（不占层栈），单独放 popover。
*/
import type { EditorPreset } from '$lib/domain/types';
import {
  closeKind,
  closeTaskDetail,
  closeTaskEditor,
  detailIdOf,
  editorIdOf,
  hasKind,
  layerOf,
  openTaskDetail,
  openTaskEditor,
  push,
  toggleTaskDetail
} from './overlay.svelte';
import type { ConfirmReq, PromptReq, TypedReq } from './overlay.svelte';

export type { ConfirmReq, PromptReq, TypedReq };

export interface MiniMenuState {
  kind: 'list' | 'tag' | 'theme';
  name: string;
  x: number;
  y: number;
}

/** 选色浮层：kind 决定给谁换色，x/y 是弹出位置 */
export interface ColorPickState {
  kind: 'list' | 'tag';
  name: string;
  x: number;
  y: number;
}

export const popover = $state({ menu: null as MiniMenuState | null, color: null as ColorPickState | null });

type FlagKind = 'quickAdd' | 'search' | 'filter' | 'reminder' | 'settings' | 'backup' | 'help' | 'shortcuts';

/** 一层「只有开关、没有负载」的弹窗 */
function flag(kind: FlagKind) {
  return {
    get(): boolean {
      return hasKind(kind);
    },
    set(on: boolean) {
      if (on) {
        if (!hasKind(kind)) push(kind === 'quickAdd' ? { kind, draft: '' } : { kind });
      } else {
        closeKind(kind);
      }
    }
  };
}

const quickAddFlag = flag('quickAdd');
const searchFlag = flag('search');
const filterFlag = flag('filter');
const reminderFlag = flag('reminder');
const settingsFlag = flag('settings');
const backupFlag = flag('backup');
const helpFlag = flag('help');
const shortcutsFlag = flag('shortcuts');

export const uiState = {
  /* 任务详情 / 编辑器 */
  get detailId(): string {
    return detailIdOf();
  },
  set detailId(v: string) {
    if (v) openTaskDetail(v);
    else closeTaskDetail();
  },
  get editorId(): string {
    return editorIdOf();
  },
  set editorId(v: string) {
    if (v) openTaskEditor(v);
    else closeTaskEditor();
  },
  get editorPreset(): EditorPreset | null {
    return layerOf('editor')?.preset ?? null;
  },

  /* 轻量弹窗 */
  get quickAdd() {
    return quickAddFlag.get();
  },
  set quickAdd(v: boolean) {
    quickAddFlag.set(v);
  },
  get quickDraft(): string {
    return layerOf('quickAdd')?.draft ?? '';
  },
  set quickDraft(v: string) {
    closeKind('quickAdd');
    push({ kind: 'quickAdd', draft: v });
  },
  get search() {
    return searchFlag.get();
  },
  set search(v: boolean) {
    searchFlag.set(v);
  },
  get filter() {
    return filterFlag.get();
  },
  set filter(v: boolean) {
    filterFlag.set(v);
  },
  get reminder() {
    return reminderFlag.get();
  },
  set reminder(v: boolean) {
    reminderFlag.set(v);
  },
  get settings() {
    return settingsFlag.get();
  },
  set settings(v: boolean) {
    settingsFlag.set(v);
  },
  get backup() {
    return backupFlag.get();
  },
  set backup(v: boolean) {
    backupFlag.set(v);
  },
  get help() {
    return helpFlag.get();
  },
  set help(v: boolean) {
    helpFlag.set(v);
  },
  get shortcuts() {
    return shortcutsFlag.get();
  },
  set shortcuts(v: boolean) {
    shortcutsFlag.set(v);
  },

  /* 浮层菜单 */
  get miniMenu(): MiniMenuState | null {
    return popover.menu;
  },
  set miniMenu(v: MiniMenuState | null) {
    popover.menu = v;
  },
  get themeMenu(): boolean {
    return popover.menu?.kind === 'theme';
  },
  set themeMenu(v: boolean) {
    popover.menu = v ? { kind: 'theme', name: '', x: 0, y: 0 } : null;
  },
  /* 选色浮层 */
  get colorPick(): ColorPickState | null {
    return popover.color;
  },
  set colorPick(v: ColorPickState | null) {
    popover.color = v;
  },

  /* 确认类 */
  get confirm(): ConfirmReq | null {
    return layerOf('confirm')?.req ?? null;
  },
  set confirm(v: ConfirmReq | null) {
    closeKind('confirm');
    if (v) push({ kind: 'confirm', req: v });
  },
  get prompt(): PromptReq | null {
    return layerOf('prompt')?.req ?? null;
  },
  set prompt(v: PromptReq | null) {
    closeKind('prompt');
    if (v) push({ kind: 'prompt', req: v });
  },
  get typed(): TypedReq | null {
    return layerOf('typed')?.req ?? null;
  },
  set typed(v: TypedReq | null) {
    closeKind('typed');
    if (v) push({ kind: 'typed', req: v });
  },

  /* 习惯 / 纪念日编辑器 */
  get habitEditor(): { id: string } | null {
    const l = layerOf('habitEditor');
    return l ? { id: l.id } : null;
  },
  set habitEditor(v: { id: string } | null) {
    closeKind('habitEditor');
    if (v) push({ kind: 'habitEditor', id: v.id });
  },
  get cdEditor(): { id: string } | null {
    const l = layerOf('cdEditor');
    return l ? { id: l.id } : null;
  },
  set cdEditor(v: { id: string } | null) {
    closeKind('cdEditor');
    if (v) push({ kind: 'cdEditor', id: v.id });
  }
};

/* ---------------- 动作 ---------------- */

export function openQuickAdd(draft = ''): void {
  closeKind('quickAdd');
  push({ kind: 'quickAdd', draft });
}

export function closeQuickAdd(): void {
  closeKind('quickAdd');
}

export function openSearch(): void {
  searchFlag.set(true);
}

export function openFilter(): void {
  filterFlag.set(true);
}

export function openReminder(): void {
  reminderFlag.set(true);
}

export function openSettings(): void {
  settingsFlag.set(true);
}

export function openBackup(): void {
  backupFlag.set(true);
}

export function openHelp(): void {
  helpFlag.set(true);
}

export function openShortcuts(): void {
  shortcutsFlag.set(true);
}

export function openHabitEditor(id: string): void {
  closeKind('habitEditor');
  push({ kind: 'habitEditor', id });
}

export function openCountdownEditor(id: string): void {
  closeKind('cdEditor');
  push({ kind: 'cdEditor', id });
}

export function askDeleteTask(title: string, onOk: () => void): void {
  uiState.confirm = {
    title: '删除事项',
    desc: '确定删除「' + title + '」？删除后无法恢复。',
    okText: '删除',
    danger: true,
    onOk
  };
}

export { closeTaskDetail, closeTaskEditor, openTaskDetail, openTaskEditor, toggleTaskDetail };
