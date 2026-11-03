<script lang="ts">
  import { attention, type AttentionItem } from '$lib/domain/selectors';
  import { taskState } from '$lib/domain/window';
  import { ebStageName, relTime } from '$lib/domain/chips';
  import { clock } from '$lib/store/clock.svelte';
  import { data } from '$lib/store/data.svelte';
  import { openTaskDetail, uiState } from '$lib/store/ui.svelte';
  import { completeFromReminder, markRemindRead, remindStage } from '$lib/store/remind.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import ModalHead from '$lib/ui/ModalHead.svelte';

  // 唯一的待处理来源：角标与列表同源，不会再出现「有红点、点开空」
  const items = $derived(attention(data.tasks, clock.now));
  const late = $derived(items.filter((i) => i.kind === 'overdue'));
  const pend = $derived(items.filter((i) => i.kind === 'remind'));
  const soon = $derived(items.filter((i) => i.kind === 'soon'));

  function close(): void {
    uiState.reminder = false;
  }

  function open(id: string): void {
    close();
    openTaskDetail(id);
  }

  function ack(p: AttentionItem, e: MouseEvent): void {
    e.stopPropagation();
    if (p.idx < 0) return;
    markRemindRead(p.task.id, p.idx);
  }

  function done(id: string, e: MouseEvent): void {
    e.stopPropagation();
    completeFromReminder(id);
  }

  function rowKey(e: KeyboardEvent, id: string): void {
    // 只认落在行本身的回车：行内的「知道了 / 完成」自己处理按键，
    // 不拦的话会先触发按钮、再冒泡到行，一次回车干两件事
    if (e.key !== 'Enter' || e.target !== e.currentTarget) return;
    e.preventDefault();
    e.stopPropagation();
    open(id);
  }
</script>

<ModalHead title="提醒中心" onclose={close} />
<div class="m-body">
  <div class="field">
    <label>已逾期<span class="hint">{late.length} 条</span></label>
    {#if late.length}
      {#each late as p (p.task.id)}
        <div class="tpl-row" data-remind-over={p.task.id} onclick={() => open(p.task.id)} role="button" tabindex="0" onkeydown={(e) => rowKey(e, p.task.id)}>
          <span class="tpl-t"><Icon name="alert" /> {p.task.title}</span>
          <span class="tpl-m">{taskState(p.task, clock.now).label}{p.task.plan ? ' · 含计划' : ''}</span>
          <span style="display:flex;gap:6px;margin-left:auto;flex:0 0 auto">
            <button class="btn btn-pri btn-sm" data-rdone={p.task.id} onclick={(e) => done(p.task.id, e)}>完成</button>
          </span>
        </div>
      {/each}
    {:else}
      <div style="font-size:12.5px;color:var(--text-3)">没有逾期的事项。</div>
    {/if}
  </div>

  <div class="field">
    <label>已到点<span class="hint">{pend.length} 条</span></label>
    {#if pend.length}
      {#each pend as p (p.task.id + p.idx)}
        <div class="tpl-row" data-remind-open={p.task.id} onclick={() => open(p.task.id)} role="button" tabindex="0" onkeydown={(e) => rowKey(e, p.task.id)}>
          <span class="tpl-t"><Icon name="bell" /> {p.task.title}</span>
          <span class="tpl-m">
            {#if p.task.remindMode === '艾宾浩斯'}
              {remindStage(p.task, p.idx)} · {ebStageName(p.offset)}
            {:else}
              {ebStageName(p.offset)}
            {/if}
            · {relTime(p.at, clock.now)}
          </span>
          <span style="display:flex;gap:6px;margin-left:auto;flex:0 0 auto">
            <button class="btn btn-sec btn-sm" data-rack={p.task.id + ':' + p.idx} onclick={(e) => ack(p, e)}>知道了</button>
            <button class="btn btn-pri btn-sm" data-rdone={p.task.id} onclick={(e) => done(p.task.id, e)}>完成</button>
          </span>
        </div>
      {/each}
    {:else}
      <div style="font-size:12.5px;color:var(--text-3)">现在没有到点的提醒。</div>
    {/if}
  </div>

  <div class="field">
    <label>24 小时内<span class="hint">{soon.length} 条</span></label>
    {#if soon.length}
      {#each soon as s (s.task.id + s.at)}
        <button class="tpl-row" onclick={() => open(s.task.id)}>
          <span class="tpl-t">{s.task.title}</span>
          <span class="tpl-m">{relTime(s.at, clock.now)} · {ebStageName(s.offset)}</span>
        </button>
      {/each}
    {:else}
      <div style="font-size:12.5px;color:var(--text-3)">24 小时内没有新的提醒。</div>
    {/if}
  </div>
</div>
<div class="m-foot">
  <div class="spacer"></div>
  <button class="btn btn-sec" onclick={close}>关闭</button>
</div>
