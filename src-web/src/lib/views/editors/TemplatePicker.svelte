<script lang="ts">
  /* 内容层：外壳（mask / modal / stacked）由 OverlayHost 提供，这里只管列表 */
  import type { Task } from '$lib/domain/types';
  import { parseYmd, shortDate } from '$lib/domain/date';
  import { data } from '$lib/store/data.svelte';
  import { todayD } from '$lib/store/clock.svelte';
  import ModalHead from '$lib/ui/ModalHead.svelte';
  import { prepareForm } from '$lib/actions/prepare-form';

  let { onpick, onclose }: { onpick: (t: Task) => void; onclose: () => void } = $props();

  let kw = $state('');
  const today = $derived(todayD());

  const rows = $derived.by(() => {
    const k = kw.trim().toLowerCase();
    const list = data.tasks.filter((t) => (k ? (t.title + ' ' + t.note).toLowerCase().indexOf(k) > -1 : true));
    return list.slice(0, 40);
  });
</script>

<ModalHead title="用已有日程填充" onclose={onclose} />
<div class="m-body">
  <div class="field">
    <input class="inp" id="tplKw" bind:value={kw} placeholder="搜索已有日程的标题或备注" use:prepareForm />
  </div>
  {#if rows.length}
    {#each rows as t (t.id)}
      <button class="tpl-row" onclick={() => { onpick(t); onclose(); }}>
        <span class="tpl-t">{t.title}</span>
        <span class="tpl-m">
          {t.date ? shortDate(parseYmd(t.date), today) : '未安排'}
          {#if t.list}· {t.list}{/if}
          {#if t.estimate}· {t.estimate} 分钟{/if}
        </span>
      </button>
    {/each}
  {:else}
    <div class="pick-menu-empty">没有匹配的日程。</div>
  {/if}
</div>
<div class="m-foot">
  <div class="spacer"></div>
  <button class="btn btn-sec" onclick={onclose}>取消</button>
</div>
