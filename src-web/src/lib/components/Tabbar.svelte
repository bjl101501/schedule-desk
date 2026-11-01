<script lang="ts">
  import type { ViewKey } from '$lib/domain/types';
  import { app } from '$lib/store/app.svelte';
  import { goView } from '$lib/store/nav.svelte';
  import { openQuickAdd } from '$lib/store/ui.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  const items: { v: ViewKey; label: string; icon: string }[] = [
    { v: 'today', label: '今天', icon: 'calendar' },
    { v: 'calendar', label: '日历', icon: 'calendar' }
  ];
  const right: { v: ViewKey; label: string; icon: string }[] = [
    { v: 'quadrant', label: '四象限', icon: 'grid' },
    { v: 'stats', label: '统计', icon: 'trend' }
  ];

  const on = (v: ViewKey) => app.view === v && !app.selectedList && !app.selectedTag;
</script>

<nav class="tabbar" id="tabbar">
  {#each items as it (it.v)}
    <a class={on(it.v) ? 'on' : ''} data-view={it.v} onclick={() => goView(it.v)}>
      <Icon name={it.icon} />
      <span>{it.label}</span>
    </a>
  {/each}

  <button aria-label="添加事项" class="tab-fab" id="btnFabAdd" onclick={() => openQuickAdd()}>
    <Icon name="plus" />
  </button>

  {#each right as it (it.v)}
    <a class={on(it.v) ? 'on' : ''} data-view={it.v} onclick={() => goView(it.v)}>
      <Icon name={it.icon} />
      <span>{it.label}</span>
    </a>
  {/each}
</nav>
