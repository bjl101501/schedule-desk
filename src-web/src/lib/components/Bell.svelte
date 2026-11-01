<script lang="ts">
  import { pendingReminders } from '$lib/domain/selectors';
  import { reminderState } from '$lib/domain/window';
  import { clock } from '$lib/store/clock.svelte';
  import { data } from '$lib/store/data.svelte';
  import { uiState } from '$lib/store/ui.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  const pend = $derived(pendingReminders(data.tasks, clock.now));

  const tip = $derived.by(() => {
    if (pend.length) return pend.length + ' 条提醒';
    let soon = 0;
    data.tasks.forEach((t) => {
      const r = reminderState(t, clock.now);
      if (r && !r.overdue && r.at - clock.now < 86400000) soon++;
    });
    return soon ? '24 小时内 ' + soon + ' 条提醒' : '暂无提醒';
  });

  const badge = $derived(pend.length > 99 ? '99+' : String(pend.length));
</script>

<button
  aria-label="提醒"
  class="icon-btn"
  id="btnBell"
  data-tip={tip}
  onclick={() => (uiState.reminder = true)}
>
  <Icon name="bell" />
  <span class="dot-badge{pend.length ? '' : ' hidden'}" id="bellBadge">{badge}</span>
</button>
