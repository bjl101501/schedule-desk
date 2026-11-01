<script lang="ts">
  import { alertSummary } from '$lib/domain/selectors';
  import { reminderState } from '$lib/domain/window';
  import { clock } from '$lib/store/clock.svelte';
  import { data } from '$lib/store/data.svelte';
  import { uiState } from '$lib/store/ui.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  const alert = $derived(alertSummary(data.tasks, clock.now));

  const tip = $derived.by(() => {
    if (alert.total) {
      const parts: string[] = [];
      if (alert.remind) parts.push('提醒 ' + alert.remind);
      if (alert.overdue) parts.push('逾期 ' + alert.overdue);
      return alert.total + ' 条待处理（' + parts.join(' · ') + '）';
    }
    let soon = 0;
    data.tasks.forEach((t) => {
      const r = reminderState(t, clock.now);
      if (r && !r.overdue && r.at - clock.now < 86400000) soon++;
    });
    return soon ? '24 小时内 ' + soon + ' 条提醒' : '暂无提醒';
  });

  const badge = $derived(alert.total > 99 ? '99+' : String(alert.total));
</script>

<button
  aria-label="提醒"
  class="icon-btn"
  id="btnBell"
  data-tip={tip}
  onclick={() => (uiState.reminder = true)}
>
  <Icon name="bell" />
  <span class="dot-badge{alert.total ? '' : ' hidden'}" id="bellBadge">{badge}</span>
</button>
