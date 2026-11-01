/* 每种层的「外壳长什么样」只在这里定义一次。
   App 与 OverlayHost 都靠它决定 class 与行为，不再有 12 段复制粘贴。 */
import type { LayerKind } from '$lib/store/overlay.svelte';

export interface LayerSpec {
  /** 额外的 .modal class：wide / settings / shortcuts / sm */
  modal: string;
  /** 宽屏下可以变成右侧面板 */
  panel: boolean;
  /** 面板模式下的拖宽手柄 */
  grip: boolean;
  /** 叠在另一层上（模板选择器） */
  stacked: boolean;
  /** 输出 data-task 属性（只有详情需要） */
  taskAttr: boolean;
  /** 点遮罩空白处关闭：只有轻量提示类可以，危险确认与编辑器不行 */
  maskClose: boolean;
}

const base: LayerSpec = { modal: '', panel: false, grip: false, stacked: false, taskAttr: false, maskClose: false };

export const SPEC: Record<LayerKind, LayerSpec> = {
  detail: { ...base, modal: 'wide', panel: true, grip: true, taskAttr: true },
  editor: { ...base, modal: 'wide', panel: true, grip: true },
  habitEditor: { ...base, panel: true, grip: true },
  cdEditor: { ...base, panel: true, grip: true },
  settings: { ...base, modal: 'settings' },
  shortcuts: { ...base, modal: 'shortcuts' },
  // 提示类可以点空白关掉；确认类不行 —— 误触关掉会让人以为操作已取消
  quickAdd: { ...base },
  search: { ...base, maskClose: true },
  filter: { ...base },
  reminder: { ...base, maskClose: true },
  backup: { ...base },
  help: { ...base, maskClose: true },
  templatePicker: { ...base, stacked: true, maskClose: true },
  confirm: { ...base, modal: 'sm' },
  prompt: { ...base, modal: 'sm' },
  typed: { ...base, modal: 'sm' }
};
