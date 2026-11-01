<script lang="ts">
  import { THEMES } from '$lib/domain/constants';
  import { uiState } from '$lib/store/ui.svelte';
  import { theme, setTheme } from '$lib/store/theme.svelte';
  import { createList, createTag, removeList, removeTag, renameList, renameTag, toggleArchive } from '$lib/store/listActions.svelte';
  import { isArchived } from '$lib/store/meta.svelte';
  import { popover } from '$lib/actions/popover';
  import Icon from './Icon.svelte';

  let menu = $state<HTMLElement | null>(null);
  let left = $state(0);
  let top = $state(0);

  interface Item {
    label: string;
    icon?: string;
    danger?: boolean;
    fn: () => void;
  }

  const items = $derived.by<Item[]>(() => {
    const m = uiState.miniMenu;
    if (!m) return [];
    if (m.kind === 'theme') return [];
    if (m.name === '__add__') {
      return m.kind === 'list'
        ? [{ label: '新建清单', icon: 'plus', fn: createList }]
        : [{ label: '新建标签', icon: 'plus', fn: createTag }];
    }
    if (m.kind === 'list') {
      const out: Item[] = [{ label: '重命名清单', icon: 'edit', fn: () => renameList(m.name) }];
      out.push(
        isArchived(m.name)
          ? { label: '取消归档', icon: 'refresh', fn: () => toggleArchive(m.name) }
          : { label: '归档清单', icon: 'box', fn: () => toggleArchive(m.name) }
      );
      out.push({ label: '删除清单', icon: 'trash', danger: true, fn: () => removeList(m.name) });
      return out;
    }
    return [
      { label: '重命名标签', icon: 'edit', fn: () => renameTag(m.name) },
      { label: '删除标签', icon: 'trash', danger: true, fn: () => removeTag(m.name) }
    ];
  });

  // 贴着锚点右下角出，放不下就往上翻
  $effect(() => {
    const m = uiState.miniMenu;
    if (!m || !menu) return;
    const w = menu.offsetWidth || 160;
    const h = menu.offsetHeight || 120;
    left = Math.min(window.innerWidth - w - 10, Math.max(10, m.x - w - 6));
    top = m.y + 6;
    if (top + h > window.innerHeight - 10) top = Math.max(10, m.y - h - 12);
  });

  function close(): void {
    uiState.miniMenu = null;
  }




</script>

{#if uiState.miniMenu}
  <div
    id="miniMenu"
    class="mini-menu{uiState.miniMenu.kind === 'theme' ? ' theme-menu' : ''}"
    bind:this={menu}
    style="left:{left}px;top:{top}px"
    use:popover={{ anchor: null, onClose: close }}
  >
    {#if uiState.miniMenu.kind === 'theme'}
      {#each THEMES as t (t.k)}
        <button class="theme-row{theme.key === t.k ? ' on' : ''}" data-th={t.k} onclick={() => { close(); setTheme(t.k); }}>
          <span class="tdots"><i style="background:{t.bg}"></i><i style="background:{t.panel}"></i><i style="background:{t.brand}"></i></span>
          <span class="tn">{t.name}</span>
          {#if theme.key === t.k}<Icon name="check" />{/if}
        </button>
      {/each}
    {:else}
      {#each items as it (it.label)}
        <button class={it.danger ? 'danger' : ''} onclick={() => { close(); it.fn(); }}>
          {#if it.icon}<Icon name={it.icon} />{/if}<span>{it.label}</span>
        </button>
      {/each}
    {/if}
  </div>
{/if}
