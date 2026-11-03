<script lang="ts">
  /* 清单、标签、优先级、四象限 */
  import { tick } from 'svelte';
  import type { TaskForm } from './form.svelte';
  import { PRIO_LABEL } from '$lib/domain/constants';
  import { quadAction, quadShort } from '$lib/domain/chips';
  import { addCustomList } from '$lib/store/meta.svelte';
  import { ensureColors, listColorFor } from '$lib/store/palette.svelte';
  import TagInput from '$lib/ui/TagInput.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { prepareForm } from '$lib/actions/prepare-form';
  import { portal } from '$lib/actions/portal';
  import { popover } from '$lib/actions/popover';

  let { form }: { form: TaskForm } = $props();
  let listMenu = $state(false);
  /** 常态是下拉选择框；只有用户在下拉第一位点了「新建清单」，才切到输入框让用户填新清单名 */
  let creating = $state(false);
  let listBox = $state<HTMLElement | null>(null);
  let listInput = $state<HTMLInputElement | null>(null);

  const suggestions = $derived.by(() => form.tagNames());
  const listOptions = $derived.by(() => form.listNames());

  function pick(nm: string): void {
    form.list = nm;
    creating = false;
    listMenu = false;
  }

  /* 点下拉第一项「新建清单」：下拉框变成输入框，清空并聚焦让用户输入新清单名称 */
  function startCreate(): void {
    listMenu = false;
    creating = true;
    form.list = '';
    void tick().then(() => listInput?.focus());
  }

  /* 输入完新清单名按回车或失焦：名字非空就登记进清单表，并切回下拉态显示该清单 */
  function commitNew(): void {
    const n = String(form.list || '').trim();
    if (n) {
      addCustomList(n);
      ensureColors();
      form.list = n;
      creating = false;
    }
  }

  function cancelCreate(): void {
    creating = false;
    if (!String(form.list || '').trim()) form.list = '收集箱';
  }
</script>

<section class="ed-sec">
  <div class="field">
    <label>清单<span class="tip-i" tabindex="0" role="note" data-tip="给日程归类。点下拉框选已有清单，或选第一项「新建清单」输入新名称。">?</span></label>
    <div class="list-combo{listMenu ? ' open' : ''}{creating ? ' creating' : ''}" bind:this={listBox}>
      {#if !creating}
        <span class="lc-cur-dot" style="background:{listColorFor(form.list || '收集箱').hex}"></span>
      {/if}
      <input
        class="inp"
        id="edList"
        bind:this={listInput}
        bind:value={form.list}
        readonly={!creating}
        placeholder={creating ? '输入新清单名称，回车确认' : '收集箱'}
        autocomplete="off"
        onclick={() => {
          if (!creating) listMenu = !listMenu;
        }}
        onblur={() => {
          if (creating) commitNew();
        }}
        onkeydown={(e) => {
          if (creating) {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitNew();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              cancelCreate();
            }
          } else if (e.key === 'Escape' && listMenu) {
            e.preventDefault();
            e.stopPropagation();
            listMenu = false;
          } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
            e.preventDefault();
            listMenu = !listMenu;
          }
        }}
        use:prepareForm
      />
      <button
        type="button"
        class="lc-arrow"
        id="edListPick"
        tabindex="-1"
        aria-label={listMenu ? '收起清单列表' : '展开清单列表'}
        aria-expanded={listMenu}
        onmousedown={(e) => e.preventDefault()}
        onclick={() => {
          if (creating && !String(form.list || '').trim()) {
            creating = false;
            form.list = '收集箱';
          }
          listMenu = !listMenu;
        }}
      >
        <Icon name="chevD" />
      </button>

      {#if listMenu}
        <div
          class="pick-menu lc-menu"
          id="edListMenu"
          use:portal
          use:popover={{
            anchor: listBox,
            onClose: () => (listMenu = false),
            minWidth: 180,
            gap: 5,
            beforePlace: (el) => {
              const r = listBox?.getBoundingClientRect();
              if (r) el.style.width = Math.round(r.width) + 'px';
            }
          }}
        >
          <button
            type="button"
            class="pick-opt lc-new"
            data-picklist="__new"
            onmousedown={(e) => e.preventDefault()}
            onclick={startCreate}
          >
            <Icon name="plus" /><span>新建清单</span>
          </button>
          {#if listOptions.length}
            <div class="lc-sep"></div>
            {#each listOptions as nm (nm)}
              {@const cur = (form.list || '收集箱') === nm && !creating}
              <button
                type="button"
                class="pick-opt{cur ? ' on' : ''}"
                data-pickv={nm}
                onmousedown={(e) => e.preventDefault()}
                onclick={() => pick(nm)}
              >
                <i class="lc-dot" style="background:{listColorFor(nm).hex}"></i>
                <span>{nm}</span>
              </button>
            {/each}
          {/if}
        </div>
      {/if}
    </div>
  </div>
  <div class="field">
    <label>标签<span class="hint">空格或回车分隔</span><span class="tip-i" tabindex="0" role="note" data-tip="支持空格、回车、逗号分隔，可以一次粘贴多个标签。">?</span></label>
    <TagInput bind:value={form.tags} {suggestions} />
  </div>
  <div class="field">
    <label>优先级<span class="tip-i" tabindex="0" role="note" data-tip="P0 最高、P3 最低，只影响排序和左侧色条。">?</span></label>
    <div class="chip-pick" id="edPrio">
      {#each ['P0', 'P1', 'P2', 'P3'] as p (p)}
        <button class="chip-p{p === 'P0' ? ' red' : ''}{form.prio === p ? ' on' : ''}" data-prio={p} onclick={() => (form.prio = p)}>{p} · {PRIO_LABEL[p]}</button>
      {/each}
      <button class="chip-p{!form.prio ? ' on' : ''}" data-prio="" onclick={() => (form.prio = '')}>无</button>
    </div>
  </div>
  <div class="field">
    <label>四象限<span class="tip-i" tabindex="0" role="note" data-tip="重要 × 紧急，只影响「四象限」视图的分组。">?</span></label>
    <div class="chip-pick">
      <button class="chip-p{form.important ? ' on' : ''}" data-imp="1" onclick={() => (form.important = !form.important)}>{form.important ? '✓ ' : ''}重要</button>
      <button class="chip-p{form.urgent ? ' on' : ''}" data-urg="1" onclick={() => (form.urgent = !form.urgent)}>{form.urgent ? '✓ ' : ''}紧急</button>
      <span class="hint" style="align-self:center">{quadShort(form.important, form.urgent)} · {quadAction(form.important, form.urgent)}</span>
    </div>
  </div>
</section>
