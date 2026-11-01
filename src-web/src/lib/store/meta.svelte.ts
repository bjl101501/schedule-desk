/*
  藏在 localStorage 里的视图元数据：清单、标签、归档、排序、面板宽度。
  旧代码每次 render 现读 localStorage，所以看不出「读的不是响应式」；
  改到 Svelte 必须收编成 $state，否则拖完侧栏不重排。
*/
const K = {
  lists: 'wb_schedule_custom_lists',
  tags: 'wb_schedule_custom_tags',
  archived: 'wb_schedule_archived_lists',
  listOrder: 'wb_schedule_list_order',
  tagOrder: 'wb_schedule_tag_order',
  cdGroupOrder: 'wb_schedule_cdgroup_order',
  panelW: 'wb_schedule_panel_w'
};

function readArr(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    return Object.prototype.toString.call(v) === '[object Array]' ? (v as string[]) : [];
  } catch {
    return [];
  }
}

function writeArr(key: string, arr: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(arr));
  } catch {
    /* 容量满时忽略 */
  }
}

export const meta = $state({
  customLists: [] as string[],
  customTags: [] as string[],
  archived: [] as string[],
  listOrder: [] as string[],
  tagOrder: [] as string[],
  cdGroupOrder: [] as string[],
  panelW: 440
});

export function hydrateMeta(): void {
  meta.customLists = readArr(K.lists);
  meta.customTags = readArr(K.tags);
  meta.archived = readArr(K.archived);
  meta.listOrder = readArr(K.listOrder);
  meta.tagOrder = readArr(K.tagOrder);
  meta.cdGroupOrder = readArr(K.cdGroupOrder);
  const w = Number(localStorage.getItem(K.panelW) || 0);
  meta.panelW = w >= 360 && w <= 760 ? Math.round(w) : 440;
  applyPanelWidth(meta.panelW);
}

export function applyPanelWidth(w: number): void {
  const v = Math.max(360, Math.min(760, Math.round(w || 440)));
  meta.panelW = v;
  document.documentElement.style.setProperty('--panel-w', v + 'px');
}

export function savePanelWidth(): void {
  try {
    localStorage.setItem(K.panelW, String(meta.panelW));
  } catch {
    /* ignore */
  }
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
  const n = String(name || '').trim().replace(/^#/, '');
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
