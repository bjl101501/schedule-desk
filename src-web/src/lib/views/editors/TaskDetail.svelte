<script lang="ts">
  import { addDays, dayDiff, durText, hmStr, mdShort, parseAnchor, parseHM, parseYmd, stampDay, stampTime, toDtLocal, weekdayName, tagColor as tagColorOf } from '$lib/domain/date';
  import { PRIO_LABEL, TAG_COLORS } from '$lib/domain/constants';
  import { quadName, ebStageName } from '$lib/domain/chips';
  import { repeatLabel, subPlan, subStats, subLate, segDateText, taskSpan } from '$lib/domain/task';
  import { taskState } from '$lib/domain/window';
  import { clock, todayD } from '$lib/store/clock.svelte';
  import { deleteTask, findTask, toggleDone, toggleSubAt } from '$lib/store/data.svelte';
  import { closeTaskDetail, openTaskEditor, uiState } from '$lib/store/ui.svelte';
  import type { Layer } from '$lib/store/overlay.svelte';
  import { toast } from '$lib/store/toast.svelte';
  import Icon from '$lib/ui/Icon.svelte';

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
    const rows: { icon: string; k: string; v: string; cls: string }[] = [];

    if (d) {
      let txt = d.getMonth() + 1 + ' 月 ' + d.getDate() + ' 日 ' + weekdayName(d);
      if (t.plan && t.endDate) {
        const ed0 = parseYmd(t.endDate);
        if (ed0) txt = mdShort(d) + ' – ' + mdShort(ed0) + ' · 共 ' + taskSpan(t) + ' 天';
      }
      let cls = 'dt-v';
      if (st.key === 'overdue') {
        txt += ' · ' + st.label;
        cls += ' warn';
      } else if (st.key === 'ongoing' || st.key === 'upcoming' || st.key === 'remindSoon') {
        txt += ' · ' + st.label;
        cls += ' brand';
      } else if (diff === 0) {
        txt += ' · 今天';
        cls += ' brand';
      } else if (diff === 1) txt += ' · 明天';
      else if (diff !== null && diff > 1) txt += ' · 还有 ' + diff + ' 天';
      rows.push({ icon: 'calendar', k: '日期', v: txt, cls });
    } else {
      rows.push({ icon: 'inbox', k: '日期', v: '未安排时间', cls: 'dt-v muted' });
    }

    if (t.time) {
      const endMin = (parseHM(t.time) || 0) + (t.estimate || 0);
      rows.push({ icon: 'clock', k: '时间', v: t.time + (t.estimate ? ' — ' + hmStr(endMin) : ''), cls: 'dt-v' });
    } else {
      rows.push({ icon: 'clock', k: '时间', v: t.estimate ? '全天日程 · 预计 ' + durText(t.estimate) : '全天日程', cls: 'dt-v' });
    }

    const sp = taskSpan(t);
    if (t.plan && d) {
      const endD = t.endDate ? parseYmd(t.endDate) : addDays(d, sp - 1);
      const segN = (t.subs || []).filter((x) => Number(x.days) > 0).length;
      rows.push({
        icon: 'repeat', k: '计划',
        v: sp + ' 天 · ' + mdShort(d) + ' – ' + mdShort(endD) + (t.endTime ? ' · 截止 ' + t.endTime : ' · 截止当天 24:00') + (segN ? ' · ' + segN + ' 个阶段' : ''),
        cls: 'dt-v brand'
      });
    }
    if (t.estimate) rows.push({ icon: 'target', k: '预计', v: durText(t.estimate), cls: 'dt-v' });
    if (repeatLabel(t)) rows.push({ icon: 'repeat', k: '重复', v: repeatLabel(t) + ' · 完成后自动排下一次', cls: 'dt-v brand' });
    if (t.list && t.list !== '收集箱') rows.push({ icon: 'inbox', k: '清单', v: t.list, cls: 'dt-v' });
    if (t.done && t.doneAt) {
      const dDay = stampDay(t.doneAt);
      const dHm = stampTime(t.doneAt);
      rows.push({ icon: 'check', k: '完成于', v: dDay + (dHm ? ' ' + dHm : ''), cls: 'dt-v brand' });
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

    return { rows, nodes, isEb: t.remindMode === '艾宾浩斯', hasRemind: nodes.length > 0, anchorText: t.remindCfg ? toDtLocal(t.remindCfg.anchor).replace('T', ' ') : '' };
  });

  const segs = $derived(t ? subPlan(t) : []);

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
  <div class="m-head">
    <h3>事项详情</h3>
    <button class="m-close" onclick={close}><Icon name="close" /></button>
  </div>
  <div class="m-body">
    <div class="dt-head">
      <button class="dt-chk{t.done ? ' on' : ''}" id="dtChk" title="标记完成" onclick={toggle}><Icon name="check" /></button>
      <h2 class="dt-title{t.done ? ' done' : ''}">{t.title}</h2>
    </div>

    <div class="dt-meta">
      {#each view.rows as r (r.k)}
        <div class="dt-row">
          <Icon name={r.icon} cls="dt-ico" />
          <span class="dt-k">{r.k}</span>
          <span class={r.cls}>{r.v}</span>
        </div>
      {/each}
      {#if t.prio}
        <div class="dt-row">
          <span class="dt-k">优先级</span>
          <span class="dt-v"><span class="tag-chip {t.prio === 'P0' ? 'c3' : t.prio === 'P1' ? 'c4' : 'c0'}">{String(t.prio).toUpperCase()} · {PRIO_LABEL[String(t.prio).toUpperCase()] || '无'}</span></span>
        </div>
      {/if}
      {#if t.tags.length}
        <div class="dt-row">
          <span class="dt-k">标签</span>
          <span class="dt-v">{#each t.tags as g (g)}<span class="tag-chip {tagColorOf(g, TAG_COLORS)}">#{g}</span>{/each}</span>
        </div>
      {/if}
      <div class="dt-row">
        <span class="dt-k">四象限</span>
        <span class="dt-v"><span class="tag-chip {t.important && t.urgent ? 'c3' : t.important ? 'c4' : t.urgent ? 'c0' : ''}">{quadName(t.important, t.urgent).replace(/^· /, '')}</span></span>
      </div>
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
              <button class="sub-item{x.done ? ' done' : ''}" data-subtoggle={i} onclick={() => toggleSubAt(t, i)}>
                <span class="sub-branch">{i === t.subs.length - 1 ? '└' : '├'}</span>
                <span class="sub-box"><Icon name="check" /></span>
                <span class="sub-t">{x.title}</span>
                {#if seg?.start}<span class="sub-day">{segDateText(seg)}</span>{/if}
                {#if x.min}<span class="sub-min">{durText(x.min)}</span>{/if}
                {#if subLate(seg, x.done, today)}<span class="sub-late">子项逾期</span>{/if}
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>

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

    {#if t.note}
      <div class="dt-sec"><label><Icon name="edit" /> 备注</label><div class="dt-note">{t.note}</div></div>
    {/if}
  </div>

  <div class="m-foot">
    <button class="btn btn-danger btn-sm" id="dtDel" onclick={del}><Icon name="trash" />删除</button>
    <div class="spacer"></div>
    <button class="btn btn-sec" id="dtToggle" onclick={toggle}>{t.done ? '标记未完成' : '标记完成'}</button>
    <button class="btn btn-pri" id="dtEdit" onclick={edit}><Icon name="edit" />修改</button>
  </div>
{/if}
