<script lang="ts">
  /* 时间安排：开始日期/时间、预计用时、跨天计划、重复 */
  import type { TaskForm } from './form.svelte';
  import { REPEAT_OPTS } from '$lib/domain/constants';
  import DateField from '$lib/ui/DateField.svelte';
  import TimeField from '$lib/ui/TimeField.svelte';
  import { prepareForm } from '$lib/actions/prepare-form';

  let { form }: { form: TaskForm } = $props();
</script>

<section class="ed-sec">
  <div class="row2">
    <div class="field">
      <label>开始日期<span class="tip-i" tabindex="0" role="note" data-tip="日程从哪一天开始。跨多天用下面的「计划」。">?</span></label>
      <DateField fieldId="edDate" bind:value={form.date} onchange={(v) => form.onStartDate(v)} />
    </div>
    <div class="field">
      <label>开始时间<span class="tip-i" tabindex="0" role="note" data-tip="留空就是全天日程：当天一直显示「进行中」，过了这一天才会逾期。">?</span></label>
      <TimeField fieldId="edTime" bind:value={form.time} />
    </div>
  </div>
  <div class="field">
    <label>预计用时<span class="tip-i" tabindex="0" role="note" data-tip="填了时长：超过「开始 + 时长」还没完成才算逾期；留空按全天处理。">?</span></label>
    <div class="est-line">
      <input class="inp" type="number" id="edEst" min="0" step={form.estUnit === 'hour' ? 0.5 : 5} bind:value={form.estValue} placeholder="可留空" oninput={() => form.syncEstFromInput()} use:prepareForm />
      <div class="seg est-unit" id="edEstUnit">
        <button type="button" class={form.estUnit === 'min' ? 'on' : ''} data-estunit="min" onclick={() => form.setUnit('min')}>分钟</button>
        <button type="button" class={form.estUnit === 'hour' ? 'on' : ''} data-estunit="hour" onclick={() => form.setUnit('hour')}>小时</button>
      </div>
    </div>
    {#if form.estHint}<div class="est-hint show">⚠ {form.estHint}</div>{/if}
  </div>

  <div class="plan-block">
    <div class="plan-head">
      <label class="check-line" style="margin:0"><input type="checkbox" id="edPlanOn" bind:checked={form.planOn} onchange={() => form.onPlanToggle()} use:prepareForm /><span>计划</span></label>
      <span class="hint">{form.planOn ? '跨多天，到结束日之后才算逾期' : '不勾就是当天的日程'}</span>
      <span class="tip-i" tabindex="0" role="note" data-tip="跨多天完成的事项。勾选后选结束日期；结束时间可留空，表示到结束日 24:00。">?</span>
    </div>
    <div class="row2 plan-dates{form.planOn ? '' : ' is-off'}" id="edPlanWrap">
      <div class="field">
        <label>结束日期</label>
        <DateField fieldId="edEndDate" bind:value={form.endDate} placeholder="结束日期" onchange={(v) => form.onEndDate(v)} />
      </div>
      <div class="field">
        <label>结束时间<span class="hint">可留空</span></label>
        <TimeField fieldId="edEndTime" bind:value={form.endTime} emptyText="可留空" />
      </div>
    </div>
  </div>
  <div class="span-hint{form.planHint ? ' on' : ''}{form.subDays > form.spanDays ? ' warn' : ''}" id="edSpanHint">{form.planHint}</div>

  <div class="field">
    <label>重复<span class="hint">完成后自动排下一次</span><span class="tip-i" tabindex="0" role="note" data-tip="勾选后，完成当前这条会自动生成下一次，适合固定习惯。">?</span></label>
    <div class="chip-pick" id="edRepeat">
      {#each REPEAT_OPTS as r (r)}
        <button class="chip-p{form.repeat === r ? ' on' : ''}" data-repeat={r} onclick={() => (form.repeat = r)}>{r}</button>
      {/each}
    </div>
  </div>
</section>
