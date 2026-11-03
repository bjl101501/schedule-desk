<script lang="ts">
  import { dayDiff, durText, hmStr, mdShort, parseAnchor, parseHM, parseYmd, stampDay, stampTime, toDtLocal, weekdayName } from '$lib/domain/date';
  import { PRIO_LABEL } from '$lib/domain/constants';
  import { listColorFor } from '$lib/store/palette.svelte';
  import { ebStageName, prioTone, quadShort, quadTone, stateChip } from '$lib/domain/chips';
  import { repeatLabel, subPlan, subStats, subLate, segDateText, taskSpan } from '$lib/domain/task';
  import { taskState } from '$lib/domain/window';
  import { clock, todayD } from '$lib/store/clock.svelte';
  import { deleteTask, findTask, toggleDone, toggleSubAt } from '$lib/store/data.svelte';
  import { closeTaskDetail, openTaskEditor, uiState } from '$lib/store/ui.svelte';
  import type { Layer } from '$lib/store/overlay.svelte';
  import { toast } from '$lib/store/toast.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import ModalHead from '$lib/ui/ModalHead.svelte';
  import TagChips from '$lib/components/TagChips.svelte';
  import StateChip from '$lib/components/StateChip.svelte';

  // 由层栈传入：换一条任务时整层会换 uid 重挂载，不会再拿旧快照
  let { layer }: { layer: Extract<Layer, { kind: 'detail' }> } = $props();
  const id = $derived(layer.id);
  const t = $derived(findTask(id));
  const tick = $derived(clock.now);
  const today = $derived(todayD());

  const view = $derived.by(() => {
    void tick;
    if (!t) return null;
    const d = t.date ? parseYmd(t.date) : null;
    const diff = d ? dayDiff(today, d) : null;
    const st = taskState(t, tick);
    // 两列信息网格：标签 44px + 值域 ~143px，超出用省略号，完整内容进 title
    const cells: { k: string; v: string; cls?: string; span?: boolean; title?: string }[] = [];

    if (d) {
      let txt = d.getMonth() + 1 + ' 月 ' + d.getDate() + ' 日 ' + weekdayName(d);
      if (t.plan && t.endDate) {
        const ed0 = parseYmd(t.endDate);
        // 起止区间本身就是「日期」，天数与截止挪到「计划」行，避免两行说同一件事
        if (ed0) txt = mdShort(d) + ' – ' + mdShort(ed0);
      }
      cells.push({ k: '日期', v: txt });
    } else {
      cells.push({ k: '日期', v: '未安排', cls: 'muted' });
    }

    if (t.time) {
      const endMin = (parseHM(t.time) || 0) + (t.estimate || 0);
      cells.push({ k: '时间', v: t.time + (t.estimate ? ' – ' + hmStr(endMin) : '') });
    } else {
      cells.push({ k: '时间', v: t.estimate ? '全天 · 预计 ' + durText(t.estimate) : '全天' });
    }

    const sp = taskSpan(t);
    if (t.plan && d) {
      const segN = (t.subs || []).filter((x) => Number(x.days) > 0).length;
      let txt = sp + ' 天';
      if (t.endTime) txt += ' · 截止 ' + t.endTime;
      if (segN) txt += ' · ' + segN + ' 个阶段';
      cells.push({ k: '计划', v: txt, cls: 'brand' });
    }
    if (t.estimate) cells.push({ k: '预计', v: durText(t.estimate) });
    if (repeatLabel(t)) cells.push({ k: '重复', v: repeatLabel(t), title: '完成后自动排下一次' });
    // 清单与优先级不进 cells：它们要渲染成带颜色的 chip，见模板

    // 状态胶囊独立成行：它描述「这条事项现在的处境」，不属于日期字段
    let when: { text: string; cls: string } | null = null;
    if (!t.done && diff !== null && diff >= 0 && st.key === 'planned') {
      if (diff === 0) when = { text: '今天', cls: 'soon' };
      else if (diff === 1) when = { text: '明天', cls: '' };
      else when = { text: '还有 ' + diff + ' 天', cls: 'soon' };
    }

    const nodes: { label: string; n: string; at: string; status: string; cls: string }[] = [];
    if (t.remindCfg && t.remindCfg.anchor && (t.remindCfg.offsets || []).length) {
      const anchor = parseAnchor(t.remindCfg.anchor);
      const offs = t.remindCfg.offsets;
      const read = t.remindCfg.read || [];
      const isEb = t.remindMode === '艾宾浩斯';
      offs.forEach((off, i) => {
        const at = anchor ? anchor.getTime() + off * 60000 : tick;
        const isPast = at < tick;
        const isRead = read.indexOf(i) > -1;
        const cls = isRead ? 'past' : isPast ? 'now' : 'future';
        const ad = new Date(at);
        const txt = ad.getMonth() + 1 + '/' + ad.getDate() + ' ' + String(ad.getHours()).padStart(2, '0') + ':' + String(ad.getMinutes()).padStart(2, '0');
        // 待复习是艾宾浩斯专属：单次提醒过期就是「已提醒」，不能混用
        const status = isEb ? (isRead ? '已确认' : isPast ? '待复习' : '待触发') : isRead ? '已确认' : isPast ? '已提醒' : '待提醒';
        nodes.push({ label: ebStageName(off), n: isEb ? i + 1 + '/' + offs.length : '', at: txt, status, cls });
      });
    }

    let doneText = '';
    if (t.done && t.doneAt) {
      const dDay = stampDay(t.doneAt);
      const dHm = stampTime(t.doneAt);
      doneText = dDay + (dHm ? ' ' + dHm : '');
    }

    return {
      cells,
      when,
      doneText,
      nodes,
      isEb: t.remindMode === '艾宾浩斯',
      hasRemind: nodes.length > 0,
      anchorText: t.remindCfg ? toDtLocal(t.remindCfg.anchor).replace('T', ' ') : ''
    };
  });

  const segs = $derived(t ? subPlan(t) : []);
  const chipInfo = $derived(t ? stateChip(t, tick) : null);

  // 备注超 6 行折叠：按内容高度判，不能拿 scrollHeight 和 clientHeight 比 ——
  // 初始没有 clamp 时两者恒等，永远判不出「太长」
  let noteEl = $state<HTMLDivElement | null>(null);
  let noteOpen = $state(false);
  let noteLong = $state(false);
  $effect(() => {
    const el = noteEl;
    void t?.note;
    if (!el || noteOpen) return;
    noteLong = el.scrollHeight > 140;
  });

  function close(): void {
    closeTaskDetail();
  }

  function edit(): void {
    if (!t) return;
    openTaskEditor(t.id, { fromDetail: true });
  }

  function del(): void {
    if (!t) return;
    uiState.confirm = {
      title: '删除事项',
      desc: '确定删除「' + t.title + '」？删除后无法恢复。',
      okText: '删除',
      danger: true,
      onOk: () => {
        deleteTask(t.id);
        close();
        toast.show('已删除');
      }
    };
  }

  function toggle(): void {
    if (!t) return;
    toggleDone(t.id);
  }

  $effect(() => {
    if (!t && id) {
      toast.show('这条事项已被删除');
      closeTaskDetail();
    }
  });
</script>

{#if t && view}
  <ModalHead title="事项详情" onclose={close} />
  <div class="m-body">
    <div class="dt-head">
      <h2 class="dt-title{t.done ? ' done' : ''}">{t.title}</h2>
      <button class="dt-chk{t.done ? ' on' : ''}" id="dtChk" title={t.done ? '取消完成' : '标记完成'} onclick={toggle}><Icon name="check" /></button>
    </div>

    {#if chipInfo || view.when}
      <div class="dt-chips">
        <StateChip {t} />
        {#if view.when}<span class="dt-when {view.when.cls}">{view.when.text}</span>{/if}
      </div>
    {/if}

    <div class="dt-meta">
      {#each view.cells as c (c.k)}
        <div class="dt-cell{c.span ? ' span2' : ''}">
          <span class="dt-k">{c.k}</span>
          <span class="dt-v {c.cls || ''}" title={c.title || c.v}>{c.v}</span>
        </div>
      {/each}
      {#if t.prio}
        <div class="dt-cell">
          <span class="dt-k">优先级</span>
          <span class="dt-v">
            <span class="tag-chip {prioTone(String(t.prio))}">{String(t.prio).toUpperCase()} · {PRIO_LABEL[String(t.prio).toUpperCase()] || '无'}</span>
          </span>
        </div>
      {/if}
      <div class="dt-cell">
        <span class="dt-k">四象限</span>
        <span class="dt-v">
          <span class="tag-chip {quadTone(t.important, t.urgent)}">{quadShort(t.important, t.urgent)}</span>
        </span>
      </div>
      {#if t.list && t.list !== '收集箱'}
        <div class="dt-cell">
          <span class="dt-k">清单</span>
          <span class="dt-v">
            <span class="list-chip" style="--lc:{listColorFor(t.list).hex}" title={'清单：' + t.list + ' · ' + listColorFor(t.list).name}>
              <Icon name="inbox" /><span class="lc-t">{t.list}</span>
            </span>
          </span>
        </div>
      {/if}
      {#if t.tags.length}
        <div class="dt-cell span2">
          <span class="dt-k">标签</span>
          <span class="dt-v wrap"><TagChips tags={t.tags} /></span>
        </div>
      {/if}
      {#if view.doneText}
        <div class="dt-cell span2">
          <span class="dt-k">完成于</span>
          <span class="dt-v brand">{view.doneText}</span>
        </div>
      {/if}
    </div>

    <div id="dtSubs">
      {#if !t.subs.length}
        <div class="dt-sec">
          <label><Icon name="split" /> 拆分<span>把一条日程拆成几段分别勾选</span></label>
          <div class="sub-empty">还没有拆分子项。点「修改」可以拆成比如「语文 / 数学 / 英语」，或「热身 / 力量 / 有氧」。</div>
        </div>
      {:else}
        {@const st = subStats(t)}
        <div class="dt-sec" id="dtSubsSec">
          <label><Icon name="split" /> 拆分<span>{st.n} 个子项{st.min ? ' · 合计 ' + durText(st.min) : ''}</span></label>
          <div class="sub-prog">
            <span class="sub-bar{st.all ? ' full' : ''}"><i id="dtSubBar" style="width:{st.pct}%"></i></span>
            <span class="sub-prog-num" id="dtSubNum">{st.done} / {st.n} <em>{st.pct}%</em></span>
          </div>
          <div class="sub-list" id="dtSubList">
            {#each t.subs as x, i (i)}
              {@const seg = segs[i]}
              <div class="sub-item{x.done ? ' done' : ''}" data-subrow={i} data-nodrag>
                <button class="sub-box" data-subtoggle={i} title={x.done ? '取消勾选' : '勾选完成'} onclick={() => toggleSubAt(t, i)}><Icon name="check" /></button>
                <span class="sub-t">{x.title}</span>
                {#if seg?.start}<span class="sub-day">{segDateText(seg)}</span>{/if}
                {#if x.min}<span class="sub-min">{durText(x.min)}</span>{/if}
                {#if subLate(seg, x.done, today)}<span class="sub-late">子项逾期</span>{/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    {#if t.note}
      <div class="dt-sec">
        <label>
          <Icon name="edit" /> 备注
          {#if noteLong}
            <button class="dt-more" onclick={() => (noteOpen = !noteOpen)}>{noteOpen ? '收起' : '展开全文'}</button>
          {/if}
        </label>
        <div class="dt-note{noteLong && !noteOpen ? ' clamp' : ''}" bind:this={noteEl}>{t.note}</div>
      </div>
    {/if}

    {#if view.hasRemind}
      <div class="dt-sec">
        <label><Icon name="bell" /> {view.isEb ? '艾宾浩斯复习计划' : '单次提醒'}<span>{view.nodes.length} 个节点 · 起点 {view.anchorText}</span></label>
        <div class="eb-track">
          {#each view.nodes as n (n.label + n.at)}
            <div class="eb-node {n.cls}">
              <span class="eb-dot"></span>
              <span class="eb-l">{n.label}{#if view.isEb}<i class="eb-n">{n.n}</i>{/if}</span>
              <span class="eb-t">{n.at}</span>
              <span class="eb-s">{n.status}</span>
            </div>
          {/each}
        </div>
      </div>
    {:else}
      <div class="dt-sec">
        <label><Icon name="bell" /> 提醒</label>
        <div class="dt-note" style="color:var(--text-3)">未设置提醒。点「修改」可以加单次提醒或艾宾浩斯复习计划。</div>
      </div>
    {/if}
  </div>

  <div class="m-foot">
    <button class="btn btn-danger btn-sm" id="dtDel" onclick={del}><Icon name="trash" />删除</button>
    <div class="spacer"></div>
    <button class="btn btn-sec" id="dtToggle" onclick={toggle}>{t.done ? '标记未完成' : '标记完成'}</button>
    <button class="btn btn-pri" id="dtEdit" onclick={edit}><Icon name="edit" />修改</button>
  </div>
{/if}
