<script lang="ts">
  import { pendingReminders } from '$lib/domain/selectors';
  import { reminderState } from '$lib/domain/window';
  import { ebStageName, relTime } from '$lib/domain/chips';
  import { clock } from '$lib/store/clock.svelte';
  import { data } from '$lib/store/data.svelte';
  import { openTaskDetail, uiState } from '$lib/store/ui.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  const pend = $derived(pendingReminders(data.tasks, clock.now));

  const soon = $derived.by(() => {
    const out: { id: string; title: string; text: string; at: number }[] = [];
    data.tasks.forEach((t) => {
      const r = reminderState(t, clock.now);
      if (r && !r.overdue && r.at - clock.now < 86400000) {
        out.push({ id: t.id, title: t.title, text: relTime(r.at, clock.now) + ' · ' + ebStageName(r.offset), at: r.at });
      }
    });
    return out.sort((a, b) => a.at - b.at);
  });

  function close(): void {
    uiState.reminder = false;
  }

  function open(id: string): void {
    close();
    openTaskDetail(id);
  }
</script>

<div class="m-head">
  <h3>提醒中心</h3>
  <button class="m-close" onclick={close}><Icon name="close" /></button>
</div>
<div class="m-body">
  <div class="field">
    <label>已到点<span class="hint">{pend.length} 条</span></label>
    {#if pend.length}
      {#each pend as p (p.task.id + p.r.idx)}
        <button class="tpl-row" data-remind-open={p.task.id} onclick={() => open(p.task.id)}>
          <span class="tpl-t"><Icon name="bell" /> {p.task.title}</span>
          <span class="tpl-m">{ebStageName(p.r.offset)} · {relTime(p.r.at, clock.now)}</span>
        </button>
      {/each}
    {:else}
      <div style="font-size:12.5px;color:var(--text-3)">现在没有到点的提醒。</div>
    {/if}
  </div>
  <div class="field">
    <label>24 小时内<span class="hint">{soon.length} 条</span></label>
    {#if soon.length}
      {#each soon as s (s.id + s.at)}
        <button class="tpl-row" onclick={() => open(s.id)}>
          <span class="tpl-t">{s.title}</span>
          <span class="tpl-m">{s.text}</span>
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
