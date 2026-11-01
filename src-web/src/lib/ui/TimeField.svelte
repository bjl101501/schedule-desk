<script lang="ts">
  import { pad2 } from '$lib/domain/date';
  import { portal } from '$lib/actions/portal';
  import { valueProp } from '$lib/actions/value-prop';
  import { clearPanel } from '$lib/actions/float';
  import { popover } from '$lib/actions/popover';
  import Icon from './Icon.svelte';

  let {
    value = $bindable(''),
    onchange,
    emptyText = '留空默认为全天',
    fieldId = ''
  }: { value?: string; onchange?: (v: string) => void; emptyText?: string; fieldId?: string } = $props();

  const QUICK = ['08:00', '09:00', '12:00', '14:00', '18:00', '20:00'];

  let open = $state(false);
  let anchor = $state<HTMLButtonElement | null>(null);
  let selH = $state(9);
  let selM = $state(0);
  let dirty = false;

  const display = $derived(value || emptyText);

  function setValue(v: string): void {
    // 只接受 HH:mm，4 位的补前导零
    const ok = /^\d{1,2}:\d{2}$/.test(v || '');
    const next = ok ? (v.length === 4 ? '0' + v : v) : '';
    if (next === value) return;
    value = next;
    onchange?.(next);
  }

  function close(): void {
    if (!open) return;
    // 点了小时没点分钟就关掉：按当前选择提交，别让用户的点击白费
    if (dirty) setValue(pad2(selH) + ':' + pad2(selM));
    dirty = false;
    open = false;
    clearPanel(close);
  }

  function toggle(): void {
    if (open) {
      close();
      return;
    }
    selH = value ? parseInt(value.slice(0, 2), 10) : 9;
    selM = value ? parseInt(value.slice(3, 5), 10) : 0;
    dirty = false;
    open = true;
  }

  function pickHour(h: number): void {
    selH = h;
    dirty = true;
  }

  function pickMin(m: number): void {
    selM = m;
    dirty = true;
    setValue(pad2(selH) + ':' + pad2(selM));
    dirty = false;
    open = false;
    clearPanel(close);
  }

  function quick(q: string): void {
    setValue(q);
    dirty = false;
    open = false;
    clearPanel(close);
  }
</script>

<button
  type="button"
  class="inp pick-field{value ? '' : ' is-empty'}{open ? ' open' : ''}"
  id={fieldId || undefined}
  data-value={value}
  bind:this={anchor}
  use:valueProp={{ get: () => value, set: setValue }}
  onclick={toggle}
>
  <span class="pf-txt">{display}</span><i class="pf-c"><Icon name="chevD" /></i>
</button>

{#if open}
  <div
    class="float-panel tm-panel"
    data-for={fieldId || undefined}
    use:portal
    use:popover={{
      anchor,
      onClose: close,
      minWidth: 206,
      // 打开时把选中项滚到中间，否则 24 小时里默认选中项在视野外
      afterPlace: (el) => {
        for (const k of ['h', 'm']) {
          const col = el.querySelector<HTMLElement>('[data-col="' + k + '"]');
          const on = col?.querySelector<HTMLElement>('.on');
          if (col && on) col.scrollTop = Math.max(0, on.offsetTop - col.clientHeight / 2 + 14);
        }
      }
    }}
  >
    <div class="tm-pop">
      <div class="tm-head"><b>{pad2(selH)}:{pad2(selM)}</b><span>选小时 / 分钟</span></div>
      <div class="tm-body">
        <div class="tm-col" data-col="h">
          {#each Array.from({ length: 24 }, (_, i) => i) as h (h)}
            <button type="button" class="tm-cell{h === selH ? ' on' : ''}" data-h={h} onclick={() => pickHour(h)}>{pad2(h)}</button>
          {/each}
        </div>
        <div class="tm-col" data-col="m">
          {#each Array.from({ length: 60 }, (_, i) => i) as m (m)}
            <button type="button" class="tm-cell{m === selM ? ' on' : ''}" data-m={m} onclick={() => pickMin(m)}>{pad2(m)}</button>
          {/each}
        </div>
      </div>
      <div class="tm-quick">
        {#each QUICK as q (q)}
          <button type="button" class="cal-quick{q === value ? ' on' : ''}" data-q={q} onclick={() => quick(q)}>{q}</button>
        {/each}
      </div>
      <div class="cal-foot">
        <span class="sp"></span>
        <button type="button" class="cal-quick muted" data-clear="1" onclick={() => { setValue(''); dirty = false; open = false; clearPanel(close); }}>留空（全天）</button>
      </div>
    </div>
  </div>
{/if}
