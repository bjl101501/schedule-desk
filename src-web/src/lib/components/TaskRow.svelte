<script lang="ts">
  import type { Task } from '$lib/domain/types';
  import { doneText, durText, parseYmd, shortDate, dayDiff } from '$lib/domain/date';
  import { listColorFor } from '$lib/store/palette.svelte';
  import { repeatLabel, subStats, timeRangeText } from '$lib/domain/task';
  import { taskState } from '$lib/domain/window';
  import { clock, todayD } from '$lib/store/clock.svelte';
  import { deleteTask, toggleDone } from '$lib/store/data.svelte';
  import { askDeleteTask, toggleTaskDetail, openTaskEditor } from '$lib/store/ui.svelte';
  import { isDetailOpen } from '$lib/store/overlay.svelte';
  import { isSuppressed } from '$lib/actions/suppress';
  import Icon from '$lib/ui/Icon.svelte';
  import TagChips from '$lib/components/TagChips.svelte';
  import Flags from './Flags.svelte';
  import SubRows from './SubRows.svelte';
  import StateChip from './StateChip.svelte';
  import RemindChip from './RemindChip.svelte';

  let { t }: { t: Task } = $props();

  const tick = $derived(clock.now);
  const today = $derived(todayD());
  const st = $derived(taskState(t, tick));
  const subs = $derived(subStats(t));

  const due = $derived.by(() => {
    if (!t.date) return null;
    const d = parseYmd(t.date);
    if (!d) return null;
    const diff = dayDiff(today, d);
    // 日期本身只表达「哪天」，是不是逾期交给状态胶囊
    const cls = st.key === 'overdue' ? 'due-over' : diff === 0 ? 'due-today' : '';
    return { cls, text: shortDate(d, today) + (t.time ? ' ' + timeRangeText(t) : '') };
  });

  function onRowClick(): void {
    if (isSuppressed()) return;
    toggleTaskDetail(t.id);
  }

  // 拖拽松手会补发一次 click：这几个动作都在行内，必须一起挡掉，
  // 否则「拖完顺手把任务勾掉 / 删掉」是真会发生的
  function onDone(e: MouseEvent): void {
    e.stopPropagation();
    if (isSuppressed()) return;
    toggleDone(t.id);
  }

  function onEdit(e: MouseEvent): void {
    e.stopPropagation();
    if (isSuppressed()) return;
    openTaskEditor(t.id);
  }

  function onDel(e: MouseEvent): void {
    e.stopPropagation();
    if (isSuppressed()) return;
    askDeleteTask(t.title, () => deleteTask(t.id));
  }
</script>

<div
  class="task{t.done ? ' done' : ''}{isDetailOpen(t.id) ? ' active' : ''}"
  data-tid={t.id}
  onclick={onRowClick}
>
  {#if t.prio}<span class="prio-bar {String(t.prio).toLowerCase()}"></span>{/if}
  <div class="chk" data-done={t.id} onclick={onDone}><Icon name="check" /></div>
  <div class="task-main">
    <div class="task-title-row">
      <Flags {t} />
      <div class="task-title">{t.title}</div>
      {#if subs.n}
        <span class="sub-count{subs.all ? ' full' : ''}">{subs.done}/{subs.n}</span>
      {/if}
    </div>
    <SubRows {t} />
    {#if t.note}<div class="task-note">{t.note}</div>{/if}
    <div class="task-meta">
      {#if due}<span class="m {due.cls}"><Icon name="calendar" />{due.text}</span>{/if}
      <StateChip {t} />
      {#if t.done && t.doneAt}
        <span class="m due-done"><Icon name="check" />完成于 {doneText(t.doneAt)}</span>
      {/if}
      {#if repeatLabel(t)}
        <span class="m due-repeat"><Icon name="repeat" />{repeatLabel(t)}</span>
      {/if}
      <RemindChip {t} />
      <TagChips tags={t.tags} />
      {#if t.list && t.list !== '收集箱'}
        <span class="list-chip" style="--lc:{listColorFor(t.list).hex}" title={'清单：' + t.list + ' · ' + listColorFor(t.list).name}>
          <Icon name="inbox" /><span class="lc-t">{t.list}</span>
        </span>
      {/if}
    </div>
  </div>
  <div class="task-right">
    {#if t.estimate}<span class="est-badge">{durText(t.estimate)}</span>{/if}
    <button class="task-act" data-edit={t.id} title="编辑" onclick={onEdit}><Icon name="edit" /></button>
    <button class="task-act" data-del={t.id} title="删除" onclick={onDel}><Icon name="trash" /></button>
  </div>
</div>
