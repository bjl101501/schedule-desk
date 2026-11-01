<script lang="ts">
  import { dateLabel, parseYmd, today0, uid, ymd } from '$lib/domain/date';
  import { parseQuick } from '$lib/domain/quickparse';
  import { app } from '$lib/store/app.svelte';
  import { data, saveTask } from '$lib/store/data.svelte';
  import { toast } from '$lib/store/toast.svelte';
  import { openTaskEditor, uiState } from '$lib/store/ui.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { prepareForm } from '$lib/actions/prepare-form';

  let raw = $state(uiState.quickDraft || '');
  let input: HTMLInputElement;

  const parsed = $derived(parseQuick(raw));

  function close(): void {
    uiState.quickAdd = false;
  }

  function save(): void {
    if (!raw.trim()) {
      toast.show('先写点内容');
      input?.focus();
      return;
    }
    const r = parsed;
    const list = app.selectedList || '收集箱';
    const tags = [...r.tags];
    if (app.selectedTag && tags.indexOf(app.selectedTag) === -1) tags.push(app.selectedTag);
    const t = {
      id: uid(),
      title: r.title,
      note: '',
      list,
      tags,
      prio: r.prio,
      important: r.prio === 'P0',
      urgent: r.prio === 'P0' || r.prio === 'P1',
      done: false,
      remindMode: '不提醒',
      remindCfg: null,
      date: r.date,
      time: r.time,
      estimate: 0,
      doneAt: '',
      sort: Math.floor(Date.now() / 1000) % 1000000,
      subs: [],
      repeat: '',
      plan: false,
      endDate: '',
      endTime: '',
      span: 1,
      createdAt: ymd(today0())
    };
    void data;
    saveTask(t);
    close();
    toast.show('已添加：' + r.title + (r.time ? ' · ' + r.time : ''));
  }

  function more(): void {
    const r = parsed;
    const initial = { title: raw.trim() ? r.title : '', date: r.date, time: r.time, tags: r.tags, prio: r.prio };
    close();
    setTimeout(() => openTaskEditor('', { initial }), 120);
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      save();
    }
  }

  setTimeout(() => input?.focus(), 80);
</script>

<div class="m-head">
  <h3>添加日程</h3>
  <button class="m-close" onclick={close}><Icon name="close" /></button>
</div>
<div class="m-body">
  <div class="field">
    <input class="inp" id="qaInput" bind:this={input} bind:value={raw} onkeydown={onKey} placeholder="例：明天下午 3 点开会 #工作 !p1" style="height:46px;font-size:16px" autofocus use:prepareForm />
  </div>
  <div id="qaPreview" style="min-height:52px;background:var(--panel-2);border:1px solid var(--line);border-radius:10px;padding:10px 12px">
    {#if !raw.trim()}
      <span style="font-size:12px;color:var(--text-3)">输入事项内容，这里会实时显示识别结果</span>
    {:else}
      <div style="font-size:13px;font-weight:600;color:var(--text)">{parsed.title}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:5px;font-size:11.5px;color:var(--text-2)">
        <span><Icon name="calendar" /> {dateLabel(parseYmd(parsed.date))} {parsed.date}</span>
        {#if parsed.time}
          <span><Icon name="clock" /> {parsed.time}</span>
        {:else}
          <span style="color:var(--text-3)">未设时间</span>
        {/if}
        {#if parsed.prio}<span><Icon name="flag" /> {parsed.prio}</span>{/if}
        {#if parsed.tags.length}<span>{parsed.tags.map((g) => '#' + g).join(' ')}</span>{/if}
      </div>
    {/if}
  </div>
  <div style="font-size:11.5px;color:var(--text-3);line-height:1.8">
    支持识别：今天 / 明天 / 后天 / 周五 / 下周一 / 10月26日 / 10/26 / 3天后 · 下午 3 点 / 15:30 / 晚上 8 点<br />
    用 <b>#标签</b> 打标签，<b>!p0</b> ~ <b>!p3</b> 设优先级
  </div>
</div>
<div class="m-foot">
  <div class="spacer"></div>
  <button class="btn btn-sec" id="qaMore" onclick={more}>更多选项</button>
  <button class="btn btn-pri" id="qaSave" onclick={save}>添加</button>
</div>
