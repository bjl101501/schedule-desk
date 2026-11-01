<script lang="ts">
  /* 提醒：不提醒 / 单次提醒 / 艾宾浩斯 */
  import type { TaskForm } from './form.svelte';
  import { EB_LABEL, EB_OFFSETS } from '$lib/domain/constants';
  import { ebSpan, ebStageName } from '$lib/domain/chips';
  import DateField from '$lib/ui/DateField.svelte';
  import TimeField from '$lib/ui/TimeField.svelte';
  import { prepareForm } from '$lib/actions/prepare-form';

  let { form }: { form: TaskForm } = $props();

  const ONCE = [[0, '准时'], [-5, '提前 5 分钟'], [-10, '提前 10 分钟'], [-15, '提前 15 分钟'], [-30, '提前 30 分钟'], [-60, '提前 1 小时'], [-1440, '提前 1 天']] as const;
</script>

<section class="ed-sec">
  <div class="ed-sec-t">提醒</div>
  <div class="field">
    <label>提醒方式<span class="tip-i" tabindex="0" role="note" data-tip="普通日程用「单次提醒」；需要复习记忆的内容用「艾宾浩斯」。">?</span></label>
    <div class="seg" id="edRemindMode">
      {#each ['不提醒', '单次提醒', '艾宾浩斯'] as m (m)}
        <button data-rmode={m} class={form.remindMode === m ? 'on' : ''} onclick={() => (form.remindMode = m)}>{m}</button>
      {/each}
    </div>
  </div>
  <div id="edRemindBox">
    {#if form.remindMode === '单次提醒'}
      <div class="field">
        <label>提醒时机</label>
        <div class="chip-pick">
          {#each ONCE as [v, txt] (v)}
            <button class="chip-p{form.onceOffset === v ? ' on' : ''}" data-once={v} onclick={() => (form.onceOffset = v)}>{txt}</button>
          {/each}
        </div>
        <label class="check-line">
          <input type="checkbox" id="edSnooze" bind:checked={form.snooze} use:prepareForm />
          <span>稍后提醒<span class="hint">5 分钟后再提醒一次</span></span>
        </label>
        <label class="check-line{form.hasExplicitEnd ? '' : ' is-off'}">
          <input type="checkbox" id="edEndRemind" bind:checked={form.endRemind} disabled={!form.hasExplicitEnd} use:prepareForm />
          <span>结束提醒<span class="hint">
            {form.hasExplicitEnd ? (form.onceOffset < 0 ? '结束前 ' + ebStageName(-form.onceOffset) + '再提醒一次' : '结束时再提醒一次') : '需要结束时间，或开始时间 + 预计用时'}
          </span></span>
        </label>
      </div>
    {:else if form.remindMode === '艾宾浩斯'}
      <div class="field">
        <label>复习时间点<span class="hint">按艾宾浩斯遗忘曲线，点选要提醒的节点</span></label>
        <div class="chip-pick">
          {#each EB_OFFSETS as off, i (off)}
            <button class="chip-p{form.offsets.indexOf(off) > -1 ? ' on' : ''}" data-eb={off} onclick={() => {
              form.offsets = form.offsets.indexOf(off) > -1 ? form.offsets.filter((x) => x !== off) : [...form.offsets, off].sort((a, b) => a - b);
            }}>{EB_LABEL[i]}</button>
          {/each}
        </div>
      </div>
      {#if form.date}
        <div class="field">
          <label>基准时间<span class="hint">跟随上面的开始日期与时间</span></label>
          <div class="anchor-ro" id="edAnchorRo">{form.date} {form.time || '09:00'}</div>
        </div>
      {:else}
        <div class="field">
          <label>基准时间<span class="hint">上面没填日期，这里手动指定</span></label>
          <div class="row2">
            <DateField fieldId="edAnchorDate" bind:value={form.anchorDate} placeholder="基准日期" />
            <TimeField fieldId="edAnchorTime" bind:value={form.anchorTime} emptyText="09:00" />
          </div>
        </div>
      {/if}
      <div style="font-size:11.5px;color:var(--text-3);line-height:1.6">
        已选 <b>{form.offsets.length}</b> 个提醒节点，总共跨 {ebSpan(form.offsets)}。到点会发系统通知（常驻到手动关闭），同时进入顶部铃铛与「今天要处理」。
      </div>
    {/if}
  </div>
</section>
