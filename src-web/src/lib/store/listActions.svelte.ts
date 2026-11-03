/* 清单与标签的管理动作：重命名、归档、删除、新建 */
import { toast } from './toast.svelte';
import { apiUpdateTask, cacheLocal, data } from './data.svelte';
import {
  addCustomList, addCustomTag, archiveList, dropColorKey, isArchived, meta, moveColorKey,
  setListOrder, setTagOrder, unarchiveList
} from './meta.svelte';
import { ensureColors } from './palette.svelte';
import { app } from './app.svelte';
import { uiState } from './ui.svelte';

export function renameList(oldName: string): void {
  const n = data.tasks.filter((t) => (t.list || '收集箱') === oldName).length;
  uiState.prompt = {
    title: '重命名清单',
    label: '清单里的 ' + n + ' 条日程会一起改到新名字。',
    value: oldName,
    placeholder: '清单名称',
    okText: '确定',
    onOk: (v) => {
      const arr = meta.customLists.filter((x) => x !== oldName);
      if (arr.indexOf(v) === -1) arr.push(v);
      meta.customLists = arr;
      addCustomList(v);
      setListOrder(meta.listOrder.map((x) => (x === oldName ? v : x)));
      moveColorKey('list', oldName, v);
      data.tasks.forEach((t) => {
        if ((t.list || '收集箱') === oldName) {
          t.list = v;
          apiUpdateTask(t, ['清单']);
        }
      });
      if (app.selectedList === oldName) app.selectedList = v;
      cacheLocal();
      toast.show('已重命名为「' + v + '」');
    }
  };
}

export function removeList(name: string): void {
  const n = data.tasks.filter((t) => (t.list || '收集箱') === name).length;
  uiState.confirm = {
    title: '删除清单',
    desc:
      '「' + name + '」' + (n ? '里有 ' + n + ' 条日程，删除后这些日程会移到「收集箱」。' : '目前没有日程。') +
      '\n\n清单本身会被移除，事项不会被删除。',
    okText: '删除清单',
    danger: true,
    onOk: () => {
      meta.customLists = meta.customLists.filter((x) => x !== name);
      setListOrder(meta.listOrder.filter((x) => x !== name));
      data.tasks.forEach((t) => {
        if ((t.list || '收集箱') === name) {
          t.list = '收集箱';
          apiUpdateTask(t, ['清单']);
        }
      });
      if (app.selectedList === name) app.selectedList = null;
      dropColorKey('list', name);
      cacheLocal();
      toast.show('已删除清单「' + name + '」');
    }
  };
}

export function renameTag(oldName: string): void {
  uiState.prompt = {
    title: '重命名标签',
    label: '会给所有用到 #' + oldName + ' 的日程换成新标签。',
    value: oldName,
    placeholder: '标签名（不含 #）',
    okText: '确定',
    onOk: (raw) => {
      const v = String(raw || '').replace(/^#/, '').trim();
      if (!v || v === oldName) return;
      meta.customTags = meta.customTags.filter((x) => x !== oldName);
      addCustomTag(v);
      setTagOrder(meta.tagOrder.map((x) => (x === oldName ? v : x)));
      moveColorKey('tag', oldName, v);
      data.tasks.forEach((t) => {
        const j = (t.tags || []).indexOf(oldName);
        if (j > -1) {
          if (t.tags.indexOf(v) === -1) t.tags[j] = v;
          else t.tags.splice(j, 1);
          apiUpdateTask(t, ['标签']);
        }
      });
      if (app.selectedTag === oldName) app.selectedTag = v;
      cacheLocal();
      toast.show('已重命名为 #' + v);
    }
  };
}

export function removeTag(name: string): void {
  const n = data.tasks.filter((t) => (t.tags || []).indexOf(name) > -1).length;
  uiState.confirm = {
    title: '删除标签',
    desc: n
      ? '有 ' + n + ' 条日程带着 #' + name + '，删除后只是去掉这个标签，日程本身不受影响。'
      : '这个标签还没有被使用。',
    okText: '删除标签',
    danger: true,
    onOk: () => {
      meta.customTags = meta.customTags.filter((x) => x !== name);
      setTagOrder(meta.tagOrder.filter((x) => x !== name));
      data.tasks.forEach((t) => {
        const j = (t.tags || []).indexOf(name);
        if (j > -1) {
          t.tags.splice(j, 1);
          apiUpdateTask(t, ['标签']);
        }
      });
      if (app.selectedTag === name) app.selectedTag = null;
      dropColorKey('tag', name);
      cacheLocal();
      toast.show('已删除标签 #' + name);
    }
  };
}

export function toggleArchive(name: string): void {
  if (isArchived(name)) {
    unarchiveList(name);
    toast.show('已取消归档「' + name + '」');
    return;
  }
  archiveList(name);
  if (app.selectedList === name) app.selectedList = null;
  toast.show('已归档「' + name + '」，在侧栏底部可以找回');
}

export function createList(): void {
  uiState.prompt = {
    title: '新建清单',
    label: '清单用来把日程分组，比如「工作」「生活」。',
    value: '',
    placeholder: '清单名称',
    okText: '创建',
    onOk: (v) => {
      addCustomList(v);
      ensureColors();
      toast.show('已创建清单「' + v + '」');
    }
  };
}

export function createTag(): void {
  uiState.prompt = {
    title: '新建标签',
    label: '标签可以跨清单使用，比如「会议」「阅读」。',
    value: '',
    placeholder: '标签名（不含 #）',
    okText: '创建',
    onOk: (raw) => {
      const v = String(raw || '').replace(/^#/, '').trim();
      if (!v) return;
      addCustomTag(v);
      ensureColors();
      toast.show('已创建标签 #' + v);
    }
  };
}

