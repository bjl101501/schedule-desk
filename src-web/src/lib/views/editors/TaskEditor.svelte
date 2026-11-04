<script lang="ts">
  /*
    编辑器外壳：只负责装配 —— 表单状态在 task/form.svelte.ts，分区在 task/*.svelte。
    这里留下的是「存哪去」：改现有条目走 apiUpdateTask，新建走 saveTask。
  */
  import { untrack } from 'svelte';
  import type { Layer } from '$lib/store/overlay.svelte';
  import { openTemplatePicker } from '$lib/store/overlay.svelte';
  import { apiUpdateTask, cacheLocal, deleteTask, saveTask } from '$lib/store/data.svelte';
  import { closeTaskEditor, openTaskDetail, uiState } from '$lib/store/ui.svelte';
  import { toast } from '$lib/store/toast.svelte';
  import { taskSpan } from '$lib/domain/task';
  import Icon from '$lib/ui/Icon.svelte';
  import ModalHead from '$lib/ui/ModalHead.svelte';
  import { prepareForm } from '$lib/actions/prepare-form';
  import { TaskForm } from './task/form.svelte';
  import TimeSection from './task/TimeSection.svelte';
  import RemindSection from './task/RemindSection.svelte';
  import SubsSection from './task/SubsSection.svelte';
  import MetaSection from './task/MetaSection.svelte';

  let { layer }: { layer: Extract<Layer, { kind: 'editor' }> } = $props();
  const form = untrack(() => new TaskForm(layer));

  let titleEl = $state<HTMLInputElement | null>(null);
  let noteEl = $state<HTMLTextAreaElement | null>(null);
  let saving = $state(false);

  function close(): void {
    closeTaskEditor();
  }

  function back(): void {
    const id = layer.id;
    closeTaskEditor();
    // 详情层在编辑器下面，关掉就露出来了；直接打开会把它的 uid 换掉（白丢滚动位置）
    if (id && id !== '__new__') openTaskDetail(id);
  }

  function save(): void {
    if (saving) return;
    const bad = form.validate();
    if (bad) {
      toast.show(bad);
      if (!form.title.trim()) titleEl?.focus();
      return;
    }
    const patch = form.toPatch();
    form.ensureMeta(patch);

    if (form.src) {
      const src = form.src;
      saving = true;
      Object.assign(src, patch);
      src.span = taskSpan(src);
      cacheLocal();
      const backId = form.fromDetail ? src.id : '';
      apiUpdateTask(src).finally(() => {
        saving = false;
      });
      close();
      // 从详情点「修改」进来时，底层 detail 本来就留在栈里，close() 之后直接露出来；
      // 若底层 detail 已被替换或不存在，则同步补回，不再用 160ms setTimeout 延迟闪一下。
      if (backId) openTaskDetail(backId);
      toast.show('已保存');
      return;
    }

    saving = true;
    saveTask(form.toNewTask(patch)).finally(() => {
      saving = false;
    });
    close();
    toast.show('已添加');
  }

  function del(): void {
    const src = form.src;
    if (!src) return;
    uiState.confirm = {
      title: '删除事项',
      desc: '确定删除这条事项？',
      okText: '删除',
      danger: true,
      onOk: () => {
        deleteTask(src.id);
        close();
        toast.show('已删除');
      }
    };
  }

  function pickFromTemplate(t: Parameters<TaskForm['pickFromTemplate']>[0]): void {
    form.pickFromTemplate(t);
    toast.show('已套用「' + t.title + '」，日期时间保持不变');
  }

  $effect(() => {
    void form.note;
    if (noteEl) {
      noteEl.style.height = 'auto';
      noteEl.style.height = Math.max(34, noteEl.scrollHeight) + 'px';
    }
  });

  setTimeout(() => titleEl?.focus(), 80);
</script>

<ModalHead
  title={form.isNew ? '新建日程' : form.fromDetail ? '修改日程' : '编辑日程'}
  back={form.fromDetail ? back : undefined}
  backId="edBack"
  onclose={close}
>
  {#snippet actions()}
    {#if form.isNew}
      <button type="button" class="m-tpl" id="edTpl" onclick={() => openTemplatePicker(pickFromTemplate)}><Icon name="copy" /> 用已有日程填充</button>
    {/if}
  {/snippet}
</ModalHead>

<div class="m-body">
  <div class="field">
    <input class="inp inp-title" id="edTitle" bind:this={titleEl} bind:value={form.title} placeholder="要做什么？" autofocus use:prepareForm />
  </div>
  <div class="field">
    <textarea class="inp" id="edNote" bind:this={noteEl} bind:value={form.note} rows="1" placeholder="补充说明（可选）" use:prepareForm></textarea>
  </div>

  <TimeSection {form} />
  <RemindSection {form} />
  <SubsSection {form} />
  <MetaSection {form} />
</div>

<div class="m-foot">
  {#if !form.isNew}<button class="btn btn-danger btn-sm" id="edDel" onclick={del}><Icon name="trash" />删除</button>{/if}
  <div class="spacer"></div>
  <button class="btn btn-sec" id="edCancel" onclick={close}>取消</button>
  <button class="btn btn-pri" id="edSave" onclick={save} disabled={saving}>{saving ? '保存中…' : form.isNew ? '添加事项' : '保存修改'}</button>
</div>
