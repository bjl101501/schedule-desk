<script lang="ts">
  import { portal } from '$lib/actions/portal';
  import { place, registerPanel, clearPanel } from '$lib/actions/float';
  import Icon from './Icon.svelte';

  let {
    value = $bindable([] as string[]),
    suggestions = [] as string[],
    onchange,
    fieldId = 'edTagInput',
    wrapId = 'edTagsWrap',
    pickId = 'edTagPick'
  }: {
    value?: string[];
    suggestions?: string[];
    onchange?: (v: string[]) => void;
    fieldId?: string;
    wrapId?: string;
    pickId?: string;
  } = $props();

  let open = $state(false);
  let pickBtn = $state<HTMLButtonElement | null>(null);
  let menu = $state<HTMLElement | null>(null);
  let input: HTMLInputElement;

  const count = $derived(value.length);

  function commit(raw: string): number {
    const parts = String(raw || '').split(/[\s,，、;；]+/);
    let added = 0;
    for (const p of parts) {
      const v = p.trim().replace(/^#/, '');
      if (!v) continue;
      if (value.indexOf(v) === -1) {
        value = [...value, v];
        added++;
      }
    }
    if (added) onchange?.(value);
    return added;
  }

  function onKey(e: KeyboardEvent): void {
    if (e.isComposing || e.keyCode === 229) return;
    const el = e.currentTarget as HTMLInputElement;
    const k = e.key;
    if (k === 'Enter' || k === ' ' || k === 'Spacebar' || k === ',' || k === '，' || k === '、' || k === ';' || k === '；') {
      e.preventDefault();
      commit(el.value);
      el.value = '';
      return;
    }
    if (k === 'Backspace' && !el.value && value.length) {
      e.preventDefault();
      value = value.slice(0, -1);
      onchange?.(value);
    }
  }

  function onPaste(e: ClipboardEvent): void {
    const txt = e.clipboardData?.getData('text') || '';
    if (!txt || !/[\s,，、;；]/.test(txt)) return;
    e.preventDefault();
    commit(txt);
    if (input) input.value = '';
  }

  function onBlur(): void {
    if (!input) return;
    if (input.value.trim()) {
      commit(input.value);
      input.value = '';
    }
  }

  function removeAt(i: number): void {
    value = value.filter((_, idx) => idx !== i);
    onchange?.(value);
  }

  function close(): void {
    if (!open) return;
    open = false;
    clearPanel(close);
  }

  function toggle(): void {
    if (open) {
      close();
      return;
    }
    open = true;
    registerPanel(close);
  }

  $effect(() => {
    if (!open || !menu || !pickBtn) return;
    const r = pickBtn.getBoundingClientRect();
    const w = Math.min(260, Math.max(r.width || 0, 180));
    menu.style.width = w + 'px';
    place(menu, pickBtn, { minWidth: w, gap: 5 });
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (menu?.contains(t) || pickBtn?.contains(t)) return;
      close();
    };
    const id = setTimeout(() => document.addEventListener('mousedown', onDown, true), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', onDown, true);
    };
  });

  function pick(v: string): void {
    const i = value.indexOf(v);
    value = i > -1 ? value.filter((x) => x !== v) : [...value, v];
    onchange?.(value);
  }
</script>

<div class="chip-pick" id={wrapId}>
  {#each value as g, i (g)}
    <button class="chip-p on" data-tagrm={i} onclick={() => removeAt(i)}>#{g} ×</button>
  {/each}
</div>
<div class="pick-row">
  <input
    class="inp tag-inp"
    id={fieldId}
    bind:this={input}
    placeholder="输入后按空格或回车，可一次加多个"
    autocomplete="off"
    onkeydown={onKey}
    onpaste={onPaste}
    onblur={onBlur}
  />
  <button type="button" class="inp pick-multi pick-compact{open ? ' open' : ''}" id={pickId} bind:this={pickBtn} onclick={toggle}>
    <span>选已有</span><i class="pm-c"><b class="pm-n" id="edTagN">{count || ''}</b><Icon name="chevD" /></i>
  </button>
</div>

{#if open}
  <div class="pick-menu multi" bind:this={menu} use:portal>
    {#if !suggestions.length}
      <div class="pick-menu-empty">还没有已有标签。<br />在左边输入框写名字回车，就建一个新的。</div>
    {:else}
      {#each suggestions as s (s)}
        <button type="button" class="pick-opt{value.indexOf(s) > -1 ? ' on' : ''}" data-pickv={s} onclick={() => pick(s)}>
          <i class="pick-box">{value.indexOf(s) > -1 ? '✓' : ''}</i><span>{s}</span>
        </button>
      {/each}
    {/if}
  </div>
{/if}
