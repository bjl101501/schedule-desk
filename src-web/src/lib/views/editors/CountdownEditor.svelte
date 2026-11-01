<script lang="ts">
  import { LIST_COLORS } from '$lib/domain/constants';
  import { today0, uid, ymd } from '$lib/domain/date';
  import { apiDeleteCountdown, apiSaveCountdown, cacheLocal, data } from '$lib/store/data.svelte';
  import { uiState } from '$lib/store/ui.svelte';
  import { toast } from '$lib/store/toast.svelte';
  import DateField from '$lib/ui/DateField.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import ModalHead from '$lib/ui/ModalHead.svelte';
  import ColorPicker from '$lib/ui/ColorPicker.svelte';
  import { prepareForm } from '$lib/actions/prepare-form';

  const id = uiState.cdEditor?.id || '';
  const src = data.countdowns.find((c) => c.id === id);
  // 系统假期项由接口维护，只允许改颜色与备注
  const sysLocked = !!src?.sys;

  let name = $state(src?.name ?? '');
  let type = $state(src?.type ?? '倒数日');
  let date = $state(src?.date ?? ymd(today0()));
  let note = $state(src?.note ?? '');
  let group = $state(src?.group ?? '');
  let color = $state(src?.color ?? LIST_COLORS[0]);

  function close(): void {
    uiState.cdEditor = null;
  }

  function save(): void {
    const n = name.trim();
    if (!n) {
      toast.show('先写一个名字');
      return;
    }
    if (!date) {
      toast.show('选一个日期');
      return;
    }
    if (src) {
      if (!sysLocked) {
        src.name = n;
        src.type = type;
        src.date = date;
        src.group = group;
      }
      src.note = note;
      src.color = color;
      apiSaveCountdown(src);
      cacheLocal();
    } else {
      const c = { id: uid(), name: n, type, date, note, color, group, sys: '', createdAt: ymd(today0()) };
      data.countdowns.push(c);
      apiSaveCountdown(c);
      cacheLocal();
    }
    close();
    toast.show('已保存');
  }

  function del(): void {
    if (!src) return;
    uiState.confirm = {
      title: '删除纪念日',
      desc: '确定删除「' + src.name + '」？',
      okText: '删除',
      danger: true,
      onOk: () => {
        data.countdowns = data.countdowns.filter((x) => x.id !== src.id);
        apiDeleteCountdown(src.id);
        cacheLocal();
        close();
        toast.show('已删除');
      }
    };
  }
</script>

<ModalHead title={src ? '编辑纪念日' : '新建纪念日'} onclose={close} />
<div class="m-body">
  <div class="field">
    <label>名称</label>
    <input class="inp inp-title" id="cdName" bind:value={name} placeholder="比如：项目上线日" autofocus disabled={sysLocked} use:prepareForm />
  </div>
  <div class="field">
    <label>类型<span class="hint">纪念日每年重复</span></label>
    <div class="seg" id="cdType">
      <button class={type === '倒数日' ? 'on' : ''} onclick={() => (type = '倒数日')} disabled={sysLocked}>倒数日</button>
      <button class={type === '纪念日' ? 'on' : ''} onclick={() => (type = '纪念日')} disabled={sysLocked}>纪念日</button>
      <button class={type === '生日' ? 'on' : ''} onclick={() => (type = '生日')} disabled={sysLocked}>生日</button>
    </div>
  </div>
  <div class="field">
    <label>日期</label>
    {#if sysLocked}
      <div class="anchor-ro" id="cdDateRo">{date} · 由假期接口维护</div>
    {:else}
      <DateField fieldId="cdDate" bind:value={date} />
    {/if}
  </div>
  <div class="field">
    <label>分组<span class="hint">留空按类型归组</span></label>
    <input class="inp" id="cdGroup" bind:value={group} placeholder="比如：家人 / 假期" disabled={sysLocked} use:prepareForm />
    <div class="chip-pick" style="margin-top:6px">
      {#each ['家人', '朋友', '工作', '假期'] as g (g)}
        <button class="chip-p{group === g ? ' on' : ''}" data-cdgroupchip={g} onclick={() => (group = g)} disabled={sysLocked}>{g}</button>
      {/each}
    </div>
  </div>
  <div class="field">
    <label>备注</label>
    <input class="inp" id="cdNote" bind:value={note} placeholder="可选" use:prepareForm />
  </div>
  <div class="field">
    <label>颜色</label>
    <ColorPicker bind:value={color} attr="cdcolor" />
  </div>
</div>
<div class="m-foot">
  {#if src && src.sys !== 'holiday'}<button class="btn btn-danger btn-sm" onclick={del}><Icon name="trash" />删除</button>{/if}
  <div class="spacer"></div>
  <button class="btn btn-sec" onclick={close}>取消</button>
  <button class="btn btn-pri" id="cdSave" onclick={save}>保存</button>
</div>
