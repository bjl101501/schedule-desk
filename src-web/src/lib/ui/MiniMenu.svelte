<script lang="ts">
  import { THEMES } from '$lib/domain/constants';
  import { uiState } from '$lib/store/ui.svelte';
  import { theme, setTheme } from '$lib/store/theme.svelte';
  import { createList, createTag, removeList, removeTag, renameList, renameTag, toggleArchive } from '$lib/store/listActions.svelte';
  import { isArchived } from '$lib/store/meta.svelte';
  import { popover } from '$lib/actions/popover';
  import type { VirtualElement } from '@floating-ui/dom';
  import Icon from './Icon.svelte';

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

  /*
    菜单锚在鼠标点上，没有真实元素可挂 —— 造一个零尺寸虚拟元素：
    右边缘放在 x-6，正好等于旧公式 left = m.x - w - 6；top 同 y，
    配 placement:bottom-end + gap 6，即「贴点击点左侧、下方不够往上翻」。
  */
  function pointAt(x: number, y: number): VirtualElement {
    const left = x - 6;
    return {
      getBoundingClientRect: () => ({ x: left, y, width: 0, height: 0, top: y, bottom: y, right: left, left })
    };
  }

  function close(): void {
    uiState.miniMenu = null;
  }




</script>

{#if uiState.miniMenu}
  <div
    id="miniMenu"
    class="mini-menu{uiState.miniMenu.kind === 'theme' ? ' theme-menu' : ''}"
    use:popover={{
      anchor: pointAt(uiState.miniMenu.x, uiState.miniMenu.y),
      onClose: close,
      align: 'right',
      gap: 6,
      padding: 10
    }}
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
