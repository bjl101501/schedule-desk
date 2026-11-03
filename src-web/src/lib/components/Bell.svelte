<script lang="ts">
  import { attention } from '$lib/domain/selectors';
  import { clock } from '$lib/store/clock.svelte';
  import { data } from '$lib/store/data.svelte';
  import { uiState } from '$lib/store/ui.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  const items = $derived(attention(data.tasks, clock.now));
  const total = $derived(items.filter((i) => i.kind !== 'soon').length);
  const remind = $derived(items.filter((i) => i.kind === 'remind').length);
  const overdue = $derived(items.filter((i) => i.kind === 'overdue').length);
  const soon = $derived(items.filter((i) => i.kind === 'soon').length);

  const tip = $derived.by(() => {
    if (total) {
      const parts: string[] = [];
      if (overdue) parts.push('逾期 ' + overdue);
      if (remind) parts.push('到点提醒 ' + remind);
      return total + ' 条待处理（' + parts.join(' · ') + '）';
    }
    return soon ? '24 小时内 ' + soon + ' 条提醒' : '暂无提醒';
  });

  const badge = $derived(total > 99 ? '99+' : String(total));
</script>

<button
  aria-label="提醒"
  class="icon-btn"
  id="btnBell"
  data-tip={tip}
  onclick={() => (uiState.reminder = true)}
>
  <Icon name="bell" />
  <span class="dot-badge{total ? '' : ' hidden'}" id="bellBadge">{badge}</span>
</button>
