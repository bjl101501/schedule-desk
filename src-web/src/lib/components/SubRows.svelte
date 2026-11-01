<script lang="ts">
  import type { Task } from '$lib/domain/types';
  import { durText } from '$lib/domain/date';
  import { segDateText, subLate, subPlan, subStats } from '$lib/domain/task';
  import { app } from '$lib/store/app.svelte';
  import { clock, todayD } from '$lib/store/clock.svelte';
  import { toggleSubAt } from '$lib/store/data.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  let { t }: { t: Task } = $props();

  const st = $derived(subStats(t));
  const plan = $derived(subPlan(t));
  const only = $derived(!!app.subOnly[t.id]);
  const today = $derived(todayD());
  // clock.now 进派生，跨天时子项逾期标记会跟着变
  const tick = $derived(clock.now);

  const subs = $derived(t.subs || []);
  const visIdx = $derived(subs.map((_, i) => i).filter((i) => !only || !subs[i].done));
  const lastVis = $derived(visIdx.length ? visIdx[visIdx.length - 1] : -1);
  const shown = $derived(visIdx.length);

  function onRow(e: MouseEvent, i: number): void {
    e.stopPropagation();
    void tick;
    toggleSubAt(t, i);
  }

  function toggleOnly(e: MouseEvent): void {
    e.stopPropagation();
    app.subOnly[t.id] = !app.subOnly[t.id];
  }
</script>

{#if subs.length}
  <div class="sub-rows{subs.length > 10 ? ' dense' : ''}">
    {#if subs.length > 6}
      <div class="sub-tools">
        <button class="sub-only{only ? ' on' : ''}" onclick={toggleOnly}>{only ? '显示全部' : '只看未完成'}</button>
        <span>{st.done} / {st.n} 已完成</span>
      </div>
    {/if}
    {#each visIdx as i (i)}
      {@const x = subs[i]}
      {@const seg = plan[i]}
      <div
        class="sub-row{x.done ? ' done' : ''}"
        data-subrow={i}
        data-subrow-parent={t.id}
        title="点一下勾选 / 取消"
        onclick={(e) => onRow(e, i)}
      >
        <span class="sub-branch">{i === lastVis ? '└' : '├'}</span>
        <span class="sub-box"><Icon name="check" /></span>
        <span class="sub-t">{x.title}</span>
        {#if seg?.start}<span class="sub-day">{segDateText(seg)}</span>{/if}
        {#if x.min}<span class="sub-min">{durText(x.min)}</span>{/if}
        {#if subLate(seg, x.done, today)}<span class="sub-late">子项逾期</span>{/if}
      </div>
    {/each}
    {#if !shown}
      <div class="sub-row-more">全部子项都完成了</div>
    {/if}
  </div>
{/if}
