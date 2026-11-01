<script lang="ts">
  import { addDays, parseYmd, startOfWeek, today0, weekdayName, ymd } from '$lib/domain/date';
  import { portal } from '$lib/actions/portal';
  import { valueProp } from '$lib/actions/value-prop';
  import { place, registerPanel, clearPanel } from '$lib/actions/float';
  import Icon from './Icon.svelte';

  let {
    value = $bindable(''),
    onchange,
    placeholder = '选择日期',
    fieldId = ''
  }: { value?: string; onchange?: (v: string) => void; placeholder?: string; fieldId?: string } = $props();

  let open = $state(false);
  let anchor = $state<HTMLButtonElement | null>(null);
  let panel = $state<HTMLElement | null>(null);
  let view = $state(new Date());

  const display = $derived.by(() => {
    if (!value) return placeholder;
    const d = parseYmd(value);
    if (!d) return placeholder;
    return d.getMonth() + 1 + '/' + d.getDate() + ' ' + weekdayName(d);
  });

  const title = $derived.by(() => {
    const d = parseYmd(value);
    if (!d) return '';
    return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 ' + weekdayName(d);
  });

  function close(): void {
    if (!open) return;
    open = false;
    clearPanel(close);
  }

  function setValue(v: string): void {
    if (v === value) return;
    value = v;
    onchange?.(v);
  }

  function toggle(): void {
    if (open) {
      close();
      return;
    }
    const cur = value ? parseYmd(value) : today0();
    view = new Date((cur || today0()).getFullYear(), (cur || today0()).getMonth(), 1);
    open = true;
    registerPanel(close);
  }

  // 打开后按实际尺寸摆一次，翻转判断才准
  $effect(() => {
    if (!open || !panel || !anchor) return;
    place(panel, anchor, { minWidth: 252 });
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (panel?.contains(t as Node) || anchor?.contains(t as Node)) return;
      close();
    };
    const onScroll = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (t && panel?.contains(t)) return;
      close();
    };
    const id = setTimeout(() => {
      document.addEventListener('mousedown', onDown, true);
      window.addEventListener('resize', close);
      document.addEventListener('scroll', onScroll, true);
    }, 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('scroll', onScroll, true);
    };
  });

  const cells = $derived.by(() => {
    const y = view.getFullYear();
    const m = view.getMonth();
    const first = new Date(y, m, 1);
    const startOffset = (first.getDay() + 6) % 7; // 周一起始
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const out: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(new Date(y, m, d));
    while (out.length % 7 !== 0) out.push(null);
    return out;
  });

  const todayStr = $derived(ymd(today0()));

  function nav(step: number): void {
    view = new Date(view.getFullYear(), view.getMonth() + step, 1);
  }

  function pick(ds: string): void {
    setValue(ds);
    close();
  }

  function quick(add: number): void {
    const d = add === 7 ? addDays(startOfWeek(today0()), 7) : addDays(today0(), add);
    pick(ymd(d));
  }

  function onKey(e: KeyboardEvent, btn: HTMLElement): void {
    const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -7 : e.key === 'ArrowDown' ? 7 : 0;
    if (!step) return;
    e.preventDefault();
    if (!panel) return;
    const all = Array.from(panel.querySelectorAll<HTMLElement>('[data-day]'));
    const i = all.indexOf(btn) + step;
    all[i]?.focus();
  }
</script>

<button
  type="button"
  class="inp pick-field{value ? '' : ' is-empty'}{open ? ' open' : ''}"
  id={fieldId || undefined}
  data-value={value}
  bind:this={anchor}
  title={title}
  use:valueProp={{ get: () => value, set: setValue }}
  onclick={toggle}
>
  <span class="pf-txt">{display}</span><i class="pf-c"><Icon name="chevD" /></i>
</button>

{#if open}
  <div class="float-panel cal-panel" bind:this={panel} data-for={fieldId || undefined} use:portal>
    <div class="cal-pop">
      <div class="cal-head">
        <button type="button" class="cal-nav" aria-label="上个月" onclick={() => nav(-1)}><Icon name="chevL" /></button>
        <b>{view.getFullYear()} 年 {view.getMonth() + 1} 月</b>
        <button type="button" class="cal-nav" aria-label="下个月" onclick={() => nav(1)}><Icon name="chevR" /></button>
      </div>
      <div class="cal-grid cal-dow">
        {#each ['一', '二', '三', '四', '五', '六', '日'] as x (x)}<span>{x}</span>{/each}
      </div>
      <div class="cal-grid cal-days">
        {#each cells as c, i (i)}
          {#if !c}
            <button type="button" class="cal-cell cal-blank" disabled aria-hidden="true" tabindex="-1"></button>
          {:else}
            {@const s = ymd(c)}
            {@const wd = c.getDay()}
            <button
              type="button"
              class="cal-cell{s === value ? ' on' : ''}{s === todayStr ? ' today' : ''}{wd === 0 || wd === 6 ? ' weekend' : ''}"
              data-day={s}
              onclick={() => pick(s)}
              onkeydown={(e) => onKey(e, e.currentTarget as HTMLElement)}
            >{c.getDate()}</button>
          {/if}
        {/each}
      </div>
      <div class="cal-foot">
        <button type="button" class="cal-quick" data-quick="0" onclick={() => quick(0)}>今天</button>
        <button type="button" class="cal-quick" data-quick="1" onclick={() => quick(1)}>明天</button>
        <button type="button" class="cal-quick" data-quick="7" onclick={() => quick(7)}>下周一</button>
        <span class="sp"></span>
        <button type="button" class="cal-quick muted" data-clear="1" onclick={() => { setValue(''); close(); }}>清除</button>
      </div>
    </div>
  </div>
{/if}
