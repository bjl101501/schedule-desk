<script lang="ts">
  import type { Sub, Task } from '$lib/domain/types';
  import { EB_LABEL, EB_OFFSETS, PRIO_LABEL, REPEAT_OPTS } from '$lib/domain/constants';
  import {
    addDays, dayDiff, durText, fromDtLocal, mdShort, parseYmd, rangeShort, today0, toDtLocal, uid, ymd
  } from '$lib/domain/date';
  import { allLists, allTags } from '$lib/domain/selectors';
  import { taskSpan } from '$lib/domain/task';
  import { ebSpan, ebStageName, quadName } from '$lib/domain/chips';
  import { app } from '$lib/store/app.svelte';
  import { apiUpdateTask, cacheLocal, data, findTask, saveTask } from '$lib/store/data.svelte';
  import { meta, addCustomList, addCustomTag } from '$lib/store/meta.svelte';
  import { toast } from '$lib/store/toast.svelte';
  import { closeTaskEditor, openTaskDetail, uiState } from '$lib/store/ui.svelte';
  import { deleteTask } from '$lib/store/data.svelte';
  import DateField from '$lib/ui/DateField.svelte';
  import TimeField from '$lib/ui/TimeField.svelte';
  import TagInput from '$lib/ui/TagInput.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import TemplatePicker from './TemplatePicker.svelte';
  import { prepareForm } from '$lib/actions/prepare-form';

  const SUB_TPLS = [
    { k: 'homework', t: '作业分科', items: [['语文作业', 30], ['数学作业', 40], ['英语作业', 30], ['其他科目', 20]] },
    { k: 'fitness', t: '健身分部', items: [['热身', 10], ['力量训练', 30], ['有氧', 20], ['拉伸放松', 10]] },
    { k: 'study', t: '学习分段', items: [['预习', 15], ['精读', 40], ['做题', 40], ['复盘整理', 15]] },
    { k: 'chores', t: '家务分工', items: [['整理房间', 20], ['洗衣', 15], ['做饭', 40], ['洗碗', 15]] }
  ] as const;

  const isNew = $derived(uiState.editorId === '__new__');
  const src = $derived(isNew ? null : findTask(uiState.editorId));
  const fromDetail = $derived(!!(uiState.editorPreset && (uiState.editorPreset as Record<string, unknown>).fromDetail));

  const t0 = today0();
  void app;

  // 新建时的预设（看板列头 +、清单内新建）
  function presetField(key: string): string {
    const p = uiState.editorPreset as Record<string, unknown> | null;
    if (!p) return '';
    const g = p.group as { kind: string; key: string } | undefined;
    if (g && g.kind === key) return g.key;
    if (p.presetGroup === key) return String(p.value || '');
    return '';
  }

  const init = (uiState.editorPreset as Record<string, unknown> | null)?.initial as
    | { title?: string; date?: string; time?: string; tags?: string[]; prio?: string }
    | undefined;

  let title = $state(src?.title ?? init?.title ?? '');
  let note = $state(src?.note ?? '');
  let list = $state(src?.list ?? (presetField('list') || app.selectedList || '收集箱'));
  let tags = $state<string[]>(src ? [...src.tags] : init?.tags ? [...init.tags] : presetField('tags') ? [presetField('tags')] : []);
  let prio = $state(src?.prio ?? init?.prio ?? (presetField('priority') !== 'none' ? presetField('priority') : ''));
  let important = $state(src?.important ?? false);
  let urgent = $state(src?.urgent ?? false);
  let date = $state(src?.date ?? init?.date ?? ymd(t0));
  let time = $state(src?.time ?? init?.time ?? '');
  let planOn = $state(src?.plan ?? false);
  let endDate = $state(src?.endDate ?? '');
  let endTime = $state(src?.endTime ?? '');
  let repeat = $state(src?.repeat || '不重复');
  let remindMode = $state(src?.remindMode || '不提醒');
  let onceOffset = $state(src?.remindCfg?.offsets?.[0] ?? -10);
  let snooze = $state(!!src?.remindCfg?.snooze);
  let endRemind = $state(!!(src?.remindCfg as Record<string, unknown> | null)?.end);
  let offsets = $state<number[]>(src?.remindCfg?.offsets ? [...src.remindCfg.offsets] : [...EB_OFFSETS]);
  let anchorDate = $state((toDtLocal(src?.remindCfg?.anchor) || '').slice(0, 10));
  let anchorTime = $state((toDtLocal(src?.remindCfg?.anchor) || '').slice(11, 16));
  let subs = $state<Sub[]>(
    (src?.subs || []).map((x, i) => ({ id: x.id || 's' + i, title: x.title, min: Number(x.min) || 0, days: Number(x.days) || 0, done: !!x.done, doneAt: x.doneAt || '' }))
  );
  let showTpl = $state(false);
  let listMenu = $state(false);

  // 预计用时：内部一律存分钟，输入框按当前单位显示
  const initMin = Math.max(0, Number(src?.estimate) || 0);
  let estMin = $state(initMin);
  let estUnit = $state<'min' | 'hour'>(initMin > 0 && initMin % 60 === 0 ? 'hour' : 'min');
  let estValue = $state(initMin ? (initMin > 0 && initMin % 60 === 0 ? String(initMin / 60) : String(initMin)) : '');

  let titleEl: HTMLInputElement;
  let noteEl: HTMLTextAreaElement;

  const subSum = $derived(subs.reduce((a, x) => a + (Number(x.min) || 0), 0));
  const subDays = $derived(subs.reduce((a, x) => a + (Number(x.days) || 0), 0));
  const spanDays = $derived.by(() => {
    if (!planOn) return 1;
    const a = parseYmd(date);
    const b = parseYmd(endDate);
    if (!a || !b) return 1;
    return Math.max(1, dayDiff(a, b) + 1);
  });
  const hasExplicitEnd = $derived((planOn && !!endDate && !!endTime) || (!!time && estMin > 0));

  const planHint = $derived.by(() => {
    if (!date) return subDays ? '子项排了 ' + subDays + ' 天，但还没选开始日期' : '';
    if (!planOn) return subDays ? '子项排了 ' + subDays + ' 天，勾选「计划」才能跨天' : '';
    const st = parseYmd(date);
    if (!st) return '';
    const en = addDays(st, spanDays - 1);
    const segs = subs.filter((x) => (Number(x.days) || 0) > 0).length;
    const over = subDays > spanDays;
    return (
      '计划 **' + spanDays + '** 天：' + (spanDays === 1 ? mdShort(st) : rangeShort(st, en)) +
      (segs ? ' · ' + segs + ' 个阶段' : '') +
      (over ? ' ⚠ 子项排了 ' + subDays + ' 天，超出 ' + (subDays - spanDays) + ' 天' : '')
    );
  });

  const estHint = $derived(subSum > 0 && estMin !== subSum ? '子项合计 ' + durText(subSum) + (estMin ? '，与预计 ' + durText(estMin) + '不一致' : '，还没填预计用时') : '');

  function syncEstFromInput(): void {
    const v = parseFloat(estValue);
    estMin = !v || v <= 0 ? 0 : Math.round(estUnit === 'hour' ? v * 60 : v);
  }

  function setUnit(u: 'min' | 'hour'): void {
    syncEstFromInput();
    estUnit = u;
    estValue = estMin ? String(estUnit === 'hour' ? Math.round((estMin / 60) * 100) / 100 : estMin) : '';
  }

  function setEstMin(v: number): void {
    estMin = Math.max(0, Math.round(v || 0));
    if (estMin && estMin % 60 !== 0) estUnit = 'min';
    estValue = estMin ? String(estUnit === 'hour' ? Math.round((estMin / 60) * 100) / 100 : estMin) : '';
  }

  function onPlanToggle(): void {
    if (!planOn) {
      endDate = '';
      endTime = '';
    } else if (!endDate && date) {
      endDate = ymd(addDays(parseYmd(date)!, Math.max(1, subDays || 1) - 1));
    }
  }

  function addSub(): void {
    subs = [...subs, { id: 's' + subs.length, title: '', min: 0, days: 0, done: false, doneAt: '' }];
  }

  function delSub(i: number): void {
    subs = subs.filter((_, idx) => idx !== i);
  }

  function applyTpl(key: string): void {
    const tp = SUB_TPLS.find((x) => x.k === key);
    if (!tp) return;
    const exists: Record<string, boolean> = {};
    subs.forEach((x) => (exists[String(x.title || '').trim()] = true));
    const add: Sub[] = [];
    tp.items.forEach((it) => {
      if (exists[it[0]]) return;
      add.push({ id: 's' + (subs.length + add.length), title: it[0], min: it[1], days: 0, done: false, doneAt: '' });
      exists[it[0]] = true;
    });
    subs = [...subs, ...add].filter((x, i, arr) => !(i === 0 && !String(x.title || '').trim() && arr.length > 1));
    if (add.length) toast.show('已加入 ' + add.length + ' 个子项');
  }

  function useEst(): void {
    setEstMin(subSum);
  }

  function onStartDate(v: string): void {
    const prev = date;
    date = v;
    if (!planOn) return;
    if (!v) {
      endDate = '';
      return;
    }
    // 改开始日期时计划区间整体平移，跨度不变
    if (prev && endDate && prev !== v) {
      const a = parseYmd(prev);
      const b = parseYmd(v);
      const e = parseYmd(endDate);
      if (a && b && e) endDate = ymd(addDays(e, dayDiff(a, b)));
    }
    if (endDate && endDate < v) endDate = v;
  }

  function onEndDate(v: string): void {
    endDate = v && date && v < date ? date : v;
  }

  function close(): void {
    closeTaskEditor();
  }

  function back(): void {
    const id = uiState.editorId;
    closeTaskEditor();
    if (id && id !== '__new__') setTimeout(() => openTaskDetail(id), 160);
  }

  let saving = $state(false);

  function save(): void {
    if (saving) return;
    const ttl = title.trim();
    if (!ttl) {
      toast.show('先写一个事项标题');
      titleEl?.focus();
      return;
    }
    if (remindMode !== '不提醒' && remindMode !== '艾宾浩斯' && !date) {
      toast.show('提醒需要先选开始日期');
      return;
    }
    let cfg: Task['remindCfg'] = null;
    // 基准时间与节点都没变时沿用已读标记：只改标题保存不该把已确认的提醒重新点亮
    const keepRead = (next: NonNullable<Task['remindCfg']>): NonNullable<Task['remindCfg']> => {
      const prev = src?.remindCfg;
      if (!prev) return next;
      const sameAnchor = prev.anchor === next.anchor;
      const sameOffsets = JSON.stringify(prev.offsets || []) === JSON.stringify(next.offsets || []);
      return sameAnchor && sameOffsets ? { ...next, read: [...(prev.read || [])] } : next;
    };
    if (remindMode === '艾宾浩斯') {
      if (!offsets.length) {
        toast.show('至少选一个复习节点');
        return;
      }
      const base = date ? date + 'T' + (time || '09:00') : anchorDate ? anchorDate + 'T' + (anchorTime || '09:00') : '';
      if (!base) {
        toast.show('选一个开始日期，或手动填基准时间');
        return;
      }
      cfg = keepRead({ anchor: fromDtLocal(base), offsets: [...offsets], read: [] });
    } else if (remindMode === '单次提醒') {
      cfg = keepRead({
        anchor: fromDtLocal(date + 'T' + (time || '09:00')),
        offsets: [onceOffset],
        read: [],
        snooze: snooze ? 5 : 0,
        end: endRemind && hasExplicitEnd ? 1 : 0
      } as NonNullable<Task['remindCfg']>);
    }

    syncEstFromInput();
    const cleanSubs = subs
      .map((x, i) => ({ id: 's' + i, title: String(x.title || '').trim(), min: Number(x.min) || 0, days: planOn ? Math.max(0, Number(x.days) || 0) : 0, done: !!x.done, doneAt: x.doneAt || '' }))
      .filter((x) => !!x.title);

    let est = estMin;
    if (est <= 0 && cleanSubs.length) {
      const sum = cleanSubs.reduce((a, x) => a + x.min, 0);
      if (sum > 0) est = sum;
    }

    const patch: Partial<Task> = {
      title: ttl,
      note: note.trim(),
      list: list.trim() || '收集箱',
      tags: [...tags],
      prio,
      important,
      urgent,
      date,
      time,
      repeat: repeat === '不重复' ? '' : repeat,
      subs: cleanSubs,
      plan: planOn,
      endDate: planOn ? endDate || date : '',
      endTime: planOn ? endTime || '' : '',
      estimate: Math.max(0, est),
      remindMode,
      remindCfg: cfg
    };

    if (!listNames().includes(patch.list!)) addCustomList(patch.list!);
    tags.forEach((g) => {
      if (!tagNames().includes(g)) addCustomTag(g);
    });

    if (src) {
      saving = true;
      Object.assign(src, patch);
      src.span = taskSpan(src);
      cacheLocal();
      const backId = fromDetail ? src.id : '';
      apiUpdateTask(src).finally(() => {
        saving = false;
      });
      close();
      if (backId) setTimeout(() => openTaskDetail(backId), 160);
      toast.show('已保存');
      return;
    }

    const nt: Task = {
      id: '',
      title: patch.title!,
      note: patch.note!,
      list: patch.list!,
      tags: patch.tags!,
      prio: patch.prio!,
      important: patch.important!,
      urgent: patch.urgent!,
      done: false,
      remindMode: patch.remindMode!,
      remindCfg: patch.remindCfg ?? null,
      date: patch.date!,
      time: patch.time!,
      estimate: patch.estimate!,
      doneAt: '',
      sort: Math.floor(Date.now() / 1000) % 1000000,
      subs: patch.subs!,
      repeat: patch.repeat!,
      plan: patch.plan!,
      endDate: patch.endDate!,
      endTime: patch.endTime!,
      span: 1,
      createdAt: ymd(t0)
    };
    nt.span = taskSpan(nt);
    nt.id = uid();
    saving = true;
    saveTask(nt).finally(() => {
      saving = false;
    });
    close();
    toast.show('已添加');
  }

  function del(): void {
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

  function pickFromTemplate(t: Task): void {
    // 标题、备注、开始日期、开始时间都保持当前输入值，只搬「怎么排、怎么提醒」
    list = t.list || '收集箱';
    setEstMin(t.estimate || 0);
    subs = (t.subs || []).map((x, i) => ({ id: 's' + i, title: x.title, min: Number(x.min) || 0, days: Math.max(0, Number(x.days) || 0), done: false, doneAt: '' }));
    if (t.plan && t.endDate) {
      planOn = true;
      const ss = parseYmd(t.date);
      const se = parseYmd(t.endDate);
      const spanN = ss && se ? Math.max(1, dayDiff(ss, se) + 1) : 1;
      endDate = date ? ymd(addDays(parseYmd(date)!, spanN - 1)) : t.endDate;
      endTime = t.endTime || '';
    } else {
      planOn = false;
      endDate = '';
      endTime = '';
    }
    tags = [...(t.tags || [])];
    if (t.prio) prio = t.prio;
    important = t.important;
    urgent = t.urgent;
    repeat = t.repeat || '不重复';
    remindMode = t.remindMode || '不提醒';
    if (t.remindCfg?.offsets?.length) {
      offsets = [...t.remindCfg.offsets];
      onceOffset = t.remindCfg.offsets[0];
      snooze = !!t.remindCfg.snooze;
    }
    toast.show('已套用「' + t.title + '」，日期时间保持不变');
  }

  function listNames(): string[] {
    return allLists(data.tasks, meta.customLists, meta.listOrder);
  }
  function tagNames(): string[] {
    return allTags(data.tasks, meta.customTags, meta.tagOrder);
  }

  const suggestions = $derived.by(() => {
    void data.tasks.length;
    return allTags(data.tasks, meta.customTags, meta.tagOrder);
  });
  const listOptions = $derived.by(() => {
    void data.tasks.length;
    return allLists(data.tasks, meta.customLists, meta.listOrder);
  });

  $effect(() => {
    void note;
    if (noteEl) {
      noteEl.style.height = 'auto';
      noteEl.style.height = Math.max(34, noteEl.scrollHeight) + 'px';
    }
  });

  setTimeout(() => titleEl?.focus(), 80);
</script>

<div class="m-head">
  {#if fromDetail}
    <button class="m-back" id="edBack" title="返回详情" onclick={back}><Icon name="chevL" /></button>
  {/if}
  <h3>{isNew ? '新建日程' : fromDetail ? '修改日程' : '编辑日程'}</h3>
  {#if isNew}
    <button type="button" class="m-tpl" id="edTpl" onclick={() => (showTpl = true)}><Icon name="copy" /> 用已有日程填充</button>
  {/if}
  <button class="m-close" onclick={close}><Icon name="close" /></button>
</div>

<div class="m-body">
  <div class="field">
    <input class="inp inp-title" id="edTitle" bind:this={titleEl} bind:value={title} placeholder="要做什么？" autofocus use:prepareForm />
  </div>
  <div class="field">
    <textarea class="inp" id="edNote" bind:this={noteEl} bind:value={note} rows="1" placeholder="补充说明（可选）" use:prepareForm></textarea>
  </div>

  <section class="ed-sec">
    <div class="ed-sec-t">时间安排</div>
    <div class="row2">
      <div class="field">
        <label>开始日期<span class="tip-i" tabindex="0" role="note" data-tip="日程从哪一天开始。跨多天用下面的「计划」。">?</span></label>
        <DateField fieldId="edDate" bind:value={date} onchange={onStartDate} />
      </div>
      <div class="field">
        <label>开始时间<span class="tip-i" tabindex="0" role="note" data-tip="留空就是全天日程：当天一直显示「进行中」，过了这一天才会逾期。">?</span></label>
        <TimeField fieldId="edTime" bind:value={time} />
      </div>
    </div>
    <div class="field">
      <label>预计用时<span class="tip-i" tabindex="0" role="note" data-tip="填了时长：超过「开始 + 时长」还没完成才算逾期；留空按全天处理。">?</span></label>
      <div class="est-line">
        <input class="inp" type="number" id="edEst" min="0" step={estUnit === 'hour' ? 0.5 : 5} bind:value={estValue} placeholder="留空" oninput={syncEstFromInput} use:prepareForm />
        <div class="seg est-unit" id="edEstUnit">
          <button type="button" class={estUnit === 'min' ? 'on' : ''} data-estunit="min" onclick={() => setUnit('min')}>分钟</button>
          <button type="button" class={estUnit === 'hour' ? 'on' : ''} data-estunit="hour" onclick={() => setUnit('hour')}>小时</button>
        </div>
      </div>
      {#if estHint}<div class="est-hint show">⚠ {estHint}</div>{/if}
    </div>

    <div class="plan-block">
      <div class="plan-head">
        <label class="check-line" style="margin:0"><input type="checkbox" id="edPlanOn" bind:checked={planOn} onchange={onPlanToggle} use:prepareForm /><span>计划</span></label>
        <span class="tip-i" tabindex="0" role="note" data-tip="跨多天完成的事项。勾选后选结束日期；结束时间可留空，表示到结束日 24:00。">?</span>
        <span class="hint">
          {planOn ? '跨多天：到结束日之后才算逾期' : '不勾就是当天的日程'}
        </span>
      </div>
      <div class="row2 plan-dates{planOn ? '' : ' is-off'}" id="edPlanWrap">
        <div class="field">
          <label>结束日期</label>
          <DateField fieldId="edEndDate" bind:value={endDate} placeholder="结束日期" onchange={onEndDate} />
        </div>
        <div class="field">
          <label>结束时间<span class="hint">可留空</span></label>
          <TimeField fieldId="edEndTime" bind:value={endTime} emptyText="可留空" />
        </div>
      </div>
    </div>
    <div class="span-hint{planHint ? ' on' : ''}{subDays > spanDays ? ' warn' : ''}" id="edSpanHint">{@html planHint.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</div>

    <div class="field">
      <label>重复<span class="hint">完成后自动排下一次</span><span class="tip-i" tabindex="0" role="note" data-tip="勾选后，完成当前这条会自动生成下一次，适合固定习惯。">?</span></label>
      <div class="chip-pick" id="edRepeat">
        {#each REPEAT_OPTS as r (r)}
          <button class="chip-p{repeat === r ? ' on' : ''}" data-repeat={r} onclick={() => (repeat = r)}>{r}</button>
        {/each}
      </div>
    </div>
  </section>

  <section class="ed-sec">
    <div class="ed-sec-t">提醒</div>
    <div class="field">
      <label>提醒方式<span class="tip-i" tabindex="0" role="note" data-tip="普通日程用「单次提醒」；需要复习记忆的内容用「艾宾浩斯」。">?</span></label>
      <div class="seg" id="edRemindMode">
        {#each ['不提醒', '单次提醒', '艾宾浩斯'] as m (m)}
          <button data-rmode={m} class={remindMode === m ? 'on' : ''} onclick={() => (remindMode = m)}>{m}</button>
        {/each}
      </div>
    </div>
    <div id="edRemindBox">
      {#if remindMode === '单次提醒'}
        <div class="field">
          <label>提醒时机</label>
          <div class="chip-pick">
            {#each [[0, '准时'], [-5, '提前 5 分钟'], [-10, '提前 10 分钟'], [-15, '提前 15 分钟'], [-30, '提前 30 分钟'], [-60, '提前 1 小时'], [-1440, '提前 1 天']] as [v, txt] (v)}
              <button class="chip-p{onceOffset === v ? ' on' : ''}" data-once={v} onclick={() => (onceOffset = v as number)}>{txt}</button>
            {/each}
          </div>
          <label class="check-line">
            <input type="checkbox" id="edSnooze" bind:checked={snooze} use:prepareForm />
            <span>稍后提醒<span class="hint">5 分钟后再提醒一次</span></span>
          </label>
          <label class="check-line{hasExplicitEnd ? '' : ' is-off'}">
            <input type="checkbox" id="edEndRemind" bind:checked={endRemind} disabled={!hasExplicitEnd} use:prepareForm />
            <span>结束提醒<span class="hint">
              {hasExplicitEnd ? (onceOffset < 0 ? '结束前 ' + ebStageName(-onceOffset) + '再提醒一次' : '结束时再提醒一次') : '需要结束时间，或开始时间 + 预计用时'}
            </span></span>
          </label>
        </div>
      {:else if remindMode === '艾宾浩斯'}
        <div class="field">
          <label>复习时间点<span class="hint">按艾宾浩斯遗忘曲线，点选要提醒的节点</span></label>
          <div class="chip-pick">
            {#each EB_OFFSETS as off, i (off)}
              <button class="chip-p{offsets.indexOf(off) > -1 ? ' on' : ''}" data-eb={off} onclick={() => {
                offsets = offsets.indexOf(off) > -1 ? offsets.filter((x) => x !== off) : [...offsets, off].sort((a, b) => a - b);
              }}>{EB_LABEL[i]}</button>
            {/each}
          </div>
        </div>
        {#if date}
          <div class="field">
            <label>基准时间<span class="hint">跟随上面的开始日期与时间</span></label>
            <div class="anchor-ro" id="edAnchorRo">{date} {time || '09:00'}</div>
          </div>
        {:else}
          <div class="field">
            <label>基准时间<span class="hint">上面没填日期，这里手动指定</span></label>
            <div class="row2">
              <DateField fieldId="edAnchorDate" bind:value={anchorDate} placeholder="基准日期" />
              <TimeField fieldId="edAnchorTime" bind:value={anchorTime} emptyText="09:00" />
            </div>
          </div>
        {/if}
        <div style="font-size:11.5px;color:var(--text-3);line-height:1.6">
          已选 <b>{offsets.length}</b> 个提醒节点，总共跨 {ebSpan(offsets)}。到点会发系统通知（常驻到手动关闭），同时进入顶部铃铛与「今天要处理」。
        </div>
      {/if}
    </div>
  </section>

  <section class="ed-sec">
    <div class="ed-sec-t">子项</div>
    <div class="field">
      <label><Icon name="split" />子项<span class="hint" id="edSubHint">{planOn ? '拆成几段分别勾选；填「天」会自动按顺序排进计划' : '拆成几段分别勾选'}</span><span class="tip-i" tabindex="0" role="note" data-tip="把一件事拆成几个子项分别勾选；子项可以各自占用天数，逾期单独判定。">?</span></label>
      <div class="sub-edit{planOn ? ' has-span' : ''}" id="edSubs">
        {#each subs as x, i (i)}
          <div class="sub-edit-row">
            <input class="inp sub-name" data-subt={i} bind:value={x.title} placeholder="子项名称，如 调研" use:prepareForm />
            <input class="inp sub-minin" type="number" min="0" step="5" data-subm={i} bind:value={x.min} placeholder="分钟" use:prepareForm />
            <input class="inp sub-dayin" type="number" min="0" max="365" step="1" data-subd={i} bind:value={x.days} placeholder="天" use:prepareForm />
            <button class="sub-del" data-subdel={i} title="删除这个子项" onclick={() => delSub(i)}><Icon name="close" /></button>
          </div>
        {/each}
      </div>
      <div class="sub-edit-foot">
        <button class="chip-p" id="edSubAdd" onclick={addSub}>＋ 添加子项</button>
        <span class="hint" id="edSubSum">
          {#if subs.filter((x) => String(x.title || '').trim()).length}
            共 <b>{subs.filter((x) => String(x.title || '').trim()).length}</b> 项
            {#if subSum}· 合计 <b>{durText(subSum)}</b>{/if}
            {#if subDays}· 排期 <b>{subDays} 天</b>{/if}
          {:else}
            还没添加子项
          {/if}
        </span>
        <button class="chip-p{estMin !== subSum && subSum > 0 ? ' on' : ''}" id="edSubUseEst" style="display:{subSum > 0 && estMin !== subSum ? '' : 'none'}" onclick={useEst}>同步为 {durText(subSum)}</button>
      </div>
      <div class="chip-pick" style="margin-top:7px">
        <span class="hint" style="align-self:center;margin-right:2px">模板</span>
        {#each SUB_TPLS as tp (tp.k)}
          <button class="chip-p" data-subtpl={tp.k} style="border-style:dashed" onclick={() => applyTpl(tp.k)}>{tp.t}</button>
        {/each}
      </div>
    </div>
  </section>

  <section class="ed-sec">
    <div class="ed-sec-t">清单与标签</div>
    <div class="field">
      <label>清单<span class="tip-i" tabindex="0" role="note" data-tip="给日程归类。左侧清单栏可以按清单查看。">?</span></label>
      <div class="pick-row list-row">
        <input class="inp" id="edList" bind:value={list} placeholder="收集箱" use:prepareForm />
        <button type="button" class="inp pick-multi pick-compact{listMenu ? ' open' : ''}" id="edListPick" onclick={() => (listMenu = !listMenu)}>
          <span>选已有</span><i class="pm-c"><Icon name="chevD" /></i>
        </button>
        <button class="chip-p" data-picklist="__new" style="border-style:dashed" onclick={() => { list = ''; }}>＋ 新建</button>
      </div>
      {#if listMenu}
        <div class="pick-menu single" style="position:static;margin-top:6px;width:auto;box-shadow:none">
          {#if listOptions.length}
            {#each listOptions as nm (nm)}
              <button type="button" class="pick-opt{list === nm ? ' on' : ''}" data-pickv={nm} onclick={() => { list = nm; listMenu = false; }}>
                <i class="pick-box">{list === nm ? '✓' : ''}</i><span>{nm}</span>
              </button>
            {/each}
          {:else}
            <div class="pick-menu-empty">还没有清单。点右边的「＋ 新建」建一个。</div>
          {/if}
        </div>
      {/if}
    </div>
    <div class="field">
      <label>标签<span class="hint">空格或回车分隔</span><span class="tip-i" tabindex="0" role="note" data-tip="支持空格、回车、逗号分隔，可以一次粘贴多个标签。">?</span></label>
      <TagInput bind:value={tags} suggestions={suggestions} />
    </div>
  </section>

  <section class="ed-sec">
    <div class="ed-sec-t">优先级</div>
    <div class="field">
      <label>优先级<span class="tip-i" tabindex="0" role="note" data-tip="P0 最高、P3 最低，只影响排序和左侧色条。">?</span></label>
      <div class="chip-pick" id="edPrio">
        {#each ['P0', 'P1', 'P2', 'P3'] as p (p)}
          <button class="chip-p{p === 'P0' ? ' red' : ''}{prio === p ? ' on' : ''}" data-prio={p} onclick={() => (prio = p)}>{p} · {PRIO_LABEL[p]}</button>
        {/each}
        <button class="chip-p{!prio ? ' on' : ''}" data-prio="" onclick={() => (prio = '')}>无</button>
      </div>
    </div>
    <div class="field">
      <label>四象限<span class="tip-i" tabindex="0" role="note" data-tip="重要 × 紧急，只影响「四象限」视图的分组。">?</span></label>
      <div class="chip-pick">
        <button class="chip-p{important ? ' on' : ''}" data-imp="1" onclick={() => (important = !important)}>{important ? '✓ ' : ''}重要</button>
        <button class="chip-p{urgent ? ' on' : ''}" data-urg="1" onclick={() => (urgent = !urgent)}>{urgent ? '✓ ' : ''}紧急</button>
        <span class="hint" style="align-self:center">{quadName(important, urgent)}</span>
      </div>
    </div>
  </section>
</div>

<div class="m-foot">
  {#if !isNew}<button class="btn btn-danger btn-sm" id="edDel" onclick={del}><Icon name="trash" />删除</button>{/if}
  <div class="spacer"></div>
  <button class="btn btn-sec" id="edCancel" onclick={close}>取消</button>
  <button class="btn btn-pri" id="edSave" onclick={save} disabled={saving}>{saving ? '保存中…' : isNew ? '添加事项' : '保存修改'}</button>
</div>

{#if showTpl}
  <TemplatePicker onpick={pickFromTemplate} onclose={() => (showTpl = false)} />
{/if}
