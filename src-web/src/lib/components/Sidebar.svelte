<script lang="ts">
  import { LIST_COLORS } from '$lib/domain/constants';
  import { dayDiff, parseYmd, ymd } from '$lib/domain/date';
  import { allLists, allTags } from '$lib/domain/selectors';
  import { app } from '$lib/store/app.svelte';
  import { clock, todayD } from '$lib/store/clock.svelte';
  import { data } from '$lib/store/data.svelte';
  import { isArchived, meta } from '$lib/store/meta.svelte';
  import { goView, selectList, selectTag } from '$lib/store/nav.svelte';
  import { isSuppressed } from '$lib/actions/suppress';
  import { createList, createTag } from '$lib/store/listActions.svelte';
  import { openQuickAdd, uiState } from '$lib/store/ui.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { pointerDrag, hitAt } from '$lib/actions/drag';
  import { reorderSidebar } from '$lib/store/dndActions.svelte';

  const tick = $derived(clock.now);
  const today = $derived(todayD());
  const t0 = $derived(ymd(today));

  const counts = $derived.by(() => {
    void tick;
    const notDone = data.tasks.filter((t) => !t.done);
    return {
      today: notDone.filter((t) => t.date && t.date <= t0).length,
      next7: notDone.filter((t) => {
        if (!t.date) return false;
        const d = dayDiff(today, parseYmd(t.date));
        return d >= 0 && d < 7;
      }).length,
      inbox: notDone.filter((t) => !t.date || (t.list || '收集箱') === '收集箱').length,
      habit: data.habits.filter((h) => h.log.indexOf(t0) === -1).length
    };
  });

  const lists = $derived.by(() => {
    void tick;
    const all = allLists(data.tasks, meta.customLists, meta.listOrder);
    return {
      live: all.filter((n) => !isArchived(n)),
      archived: all.filter((n) => isArchived(n))
    };
  });

  const tags = $derived.by(() => {
    void tick;
    return allTags(data.tasks, meta.customTags, meta.tagOrder);
  });

  function listCount(nm: string): number {
    return data.tasks.filter((t) => !t.done && (t.list || '收集箱') === nm).length;
  }

  function tagCount(g: string): number {
    return data.tasks.filter((t) => !t.done && t.tags.indexOf(g) > -1).length;
  }

  function more(kind: 'list' | 'tag', name: string, e: MouseEvent): void {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    uiState.miniMenu = { kind, name, x: r.right, y: r.bottom };
  }

  interface NavItem {
    v: 'today' | 'next7' | 'inbox' | 'calendar' | 'quadrant' | 'habit' | 'countdown' | 'focus' | 'stats';
    label: string;
    icon: string;
    cnt: number;
    cntId: string;
  }

  const navItems = $derived<NavItem[]>([
    { v: 'today', label: '今天', icon: 'check', cnt: counts.today, cntId: 'cntToday' },
    { v: 'next7', label: '最近 7 天', icon: 'calendar', cnt: counts.next7, cntId: 'cntNext7' },
    { v: 'inbox', label: '收集箱', icon: 'inbox', cnt: counts.inbox, cntId: 'cntInbox' },
    { v: 'calendar', label: '日历', icon: 'calendar', cnt: 0, cntId: '' },
    { v: 'quadrant', label: '四象限', icon: 'grid', cnt: 0, cntId: '' },
    { v: 'habit', label: '习惯打卡', icon: 'repeat', cnt: counts.habit, cntId: 'cntHabit' },
    { v: 'countdown', label: '倒数纪念日', icon: 'clock', cnt: 0, cntId: '' },
    { v: 'focus', label: '番茄专注', icon: 'target', cnt: 0, cntId: '' },
    { v: 'stats', label: '数据统计', icon: 'trend', cnt: 0, cntId: '' }
  ]);

</script>

<aside class="sidebar{app.drawer ? ' open' : ''}" id="sidebar">
  <div class="brand">
    <div class="brand-mark">
      <svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
    </div>
    <div>
      <div class="brand-name">日程台</div>
      <div class="brand-sub">SCHEDULE DESK</div>
    </div>
  </div>

  <button class="quick-add" id="btnQuickAdd" onclick={() => openQuickAdd()}>
    <Icon name="plus" />
    添加日程
  </button>

  <div class="side-scroll">
    <nav class="nav" id="navMain">
      {#each navItems as it (it.v)}
        <div
          class="nav-item{app.view === it.v && !app.selectedList && !app.selectedTag ? ' on' : ''}"
          data-view={it.v}
          onclick={() => goView(it.v)}
        >
          <Icon name={it.icon} />
          <span class="lbl">{it.label}</span>
          <span class="cnt{it.cntId === 'cntToday' && it.cnt ? ' warn' : ''}" id={it.cntId || undefined}>{it.cnt || ''}</span>
        </div>
      {/each}
    </nav>

    <div class="side-head">
      <span>清单</span>
      <button id="btnAddList" title="新建清单" onclick={createList}><Icon name="plus" /></button>
    </div>
    <div
      id="listNav"
      use:pointerDrag={{
        handle: '[data-drag-name]',
        threshold: 6,
        onStart: (el) => el.classList.add('side-dragging'),
        onEnd: (el, e, moved) => {
          el.classList.remove('side-dragging');
          if (!moved) return;
          const hit = hitAt(e, '[data-drag-name]');
          const from = el.getAttribute('data-drag-name') || '';
          const to = hit?.getAttribute('data-drag-name') || '';
          if (from && to) reorderSidebar('list', from, to);
        }
      }}
    >
      {#each lists.live as nm, i (nm)}
        <div
          class="side-item{app.selectedList === nm ? ' on' : ''}"
          data-list={nm}
          data-drag-name={nm}
          onclick={() => { if (!isSuppressed()) selectList(nm); }}
        >
          <span class="dot" style="background:{LIST_COLORS[i % LIST_COLORS.length]}"></span>
          <span class="nm">{nm}</span>
          {#if listCount(nm)}<span class="cnt">{listCount(nm)}</span>{/if}
          {#if nm !== '收集箱'}
            <button class="side-more" data-listmore={nm} title="管理清单" onclick={(e) => more('list', nm, e)}><Icon name="more" /></button>
          {/if}
        </div>
      {/each}
    </div>
    <div id="archivedNav">
      {#if lists.archived.length}
        <div class="side-sub"><span>已归档</span><b>{lists.archived.length}</b></div>
        {#each lists.archived as nm (nm)}
          <div class="side-item archived{app.selectedList === nm ? ' on' : ''}" data-list={nm} onclick={() => { if (!isSuppressed()) selectList(nm); }}>
            <span class="dot" style="background:#B9AE9C"></span>
            <span class="nm">{nm}</span>
            <button class="side-more show" data-listmore={nm} title="管理清单" onclick={(e) => more('list', nm, e)}><Icon name="more" /></button>
          </div>
        {/each}
      {/if}
    </div>

    <div class="side-head">
      <span>标签</span>
      <button id="btnAddTag" title="新建标签" onclick={createTag}><Icon name="plus" /></button>
    </div>
    <div
      id="tagNav"
      use:pointerDrag={{
        handle: '[data-drag-name]',
        threshold: 6,
        onStart: (el) => el.classList.add('side-dragging'),
        onEnd: (el, e, moved) => {
          el.classList.remove('side-dragging');
          if (!moved) return;
          const hit = hitAt(e, '[data-drag-name]');
          const from = el.getAttribute('data-drag-name') || '';
          const to = hit?.getAttribute('data-drag-name') || '';
          if (from && to) reorderSidebar('tag', from, to);
        }
      }}
    >
      {#if tags.length}
        {#each tags as g (g)}
          <div class="side-item{app.selectedTag === g ? ' on' : ''}" data-tag={g} data-drag-name={g} onclick={() => { if (!isSuppressed()) selectTag(g); }}>
            <span class="nm"># {g}</span>
            {#if tagCount(g)}<span class="cnt">{tagCount(g)}</span>{/if}
            <button class="side-more" data-tagmore={g} title="管理标签" onclick={(e) => more('tag', g, e)}><Icon name="more" /></button>
          </div>
        {/each}
      {:else}
        <div style="font-size:11.5px;color:var(--text-3);padding:4px 10px">暂无标签，加事项时用 #标签</div>
      {/if}
    </div>
  </div>

  <div class="side-foot">
    <button class="foot-btn" id="btnBackup" onclick={() => (uiState.backup = true)}>
      <Icon name="download" />
      备份
    </button>
    <button class="foot-btn" id="btnSettings" onclick={() => (uiState.settings = true)}>
      <Icon name="settings" />
      设置
    </button>
  </div>
</aside>
