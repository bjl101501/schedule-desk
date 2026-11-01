/*
  界面层的「意图」状态：谁要打开编辑器、详情、快速添加、筛选……
  组件只读这里，不互相 import 编辑器，避免循环依赖。
*/
import { app } from './app.svelte';

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

export interface TypedConfirmReq {
  title: string;
  desc: string;
  word: string;
  onOk: () => void;
}

export const uiState = $state({
  detailId: '',
  editorId: '' as string,
  editorPreset: null as Record<string, unknown> | null,
  quickAdd: false,
  quickDraft: '',
  search: false,
  filter: false,
  reminder: false,
  settings: false,
  backup: false,
  shortcuts: false,
  help: false,
  themeMenu: false,
  miniMenu: null as null | { kind: 'list' | 'tag' | 'theme'; name: string; x: number; y: number },
  confirm: null as ConfirmReq | null,
  prompt: null as PromptReq | null,
  typed: null as TypedConfirmReq | null,
  habitEditor: null as null | { id: string },
  cdEditor: null as null | { id: string }
});

export function openTaskDetail(id: string): void {
  app.detailId = id;
  uiState.detailId = id;
}

export function closeTaskDetail(): void {
  app.detailId = '';
  uiState.detailId = '';
}

export function openTaskEditor(id = '', preset: Record<string, unknown> | null = null): void {
  uiState.editorId = id || '__new__';
  uiState.editorPreset = preset;
  uiState.quickAdd = false;
  uiState.detailId = '';
  app.detailId = '';
}

export function closeTaskEditor(): void {
  uiState.editorId = '';
  uiState.editorPreset = null;
}

export function openQuickAdd(draft = ''): void {
  uiState.quickDraft = draft;
  uiState.quickAdd = true;
}

export function askDeleteTask(id: string, title: string, onOk: () => void): void {
  uiState.confirm = {
    title: '删除事项',
    desc: '确定删除「' + title + '」？删除后无法恢复。',
    okText: '删除',
    danger: true,
    onOk
  };
}

export function closeTopLayer(): boolean {
  if (uiState.typed) {
    uiState.typed = null;
    return true;
  }
  if (uiState.prompt) {
    uiState.prompt = null;
    return true;
  }
  if (uiState.confirm) {
    uiState.confirm = null;
    return true;
  }
  if (uiState.miniMenu) {
    uiState.miniMenu = null;
    return true;
  }
  if (uiState.themeMenu) {
    uiState.themeMenu = false;
    return true;
  }
  if (uiState.quickAdd) {
    uiState.quickAdd = false;
    return true;
  }
  if (uiState.search) {
    uiState.search = false;
    return true;
  }
  if (uiState.filter) {
    uiState.filter = false;
    return true;
  }
  if (uiState.reminder) {
    uiState.reminder = false;
    return true;
  }
  if (uiState.backup) {
    uiState.backup = false;
    return true;
  }
  if (uiState.settings) {
    uiState.settings = false;
    return true;
  }
  if (uiState.shortcuts) {
    uiState.shortcuts = false;
    return true;
  }
  if (uiState.help) {
    uiState.help = false;
    return true;
  }
  if (uiState.editorId) {
    uiState.editorId = '';
    return true;
  }
  if (uiState.detailId) {
    closeTaskDetail();
    return true;
  }
  if (uiState.habitEditor) {
    uiState.habitEditor = null;
    return true;
  }
  if (uiState.cdEditor) {
    uiState.cdEditor = null;
    return true;
  }
  if (app.drawer) {
    app.drawer = false;
    return true;
  }
  return false;
}
