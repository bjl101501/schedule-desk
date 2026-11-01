<script lang="ts">
  import { HABIT_ICONS, LIST_COLORS } from '$lib/domain/constants';
  import { today0, uid, ymd } from '$lib/domain/date';
  import { calcStreak } from '$lib/domain/selectors';
  import { apiDeleteHabit, apiSaveHabit, cacheLocal, data } from '$lib/store/data.svelte';
  import { uiState } from '$lib/store/ui.svelte';
  import { toast } from '$lib/store/toast.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  const id = uiState.habitEditor?.id || '';
  const src = data.habits.find((h) => h.id === id);

  let name = $state(src?.name ?? '');
  let icon = $state(src?.icon ?? 'sun');
  let color = $state(src?.color ?? LIST_COLORS[0]);
  let target = $state(src?.target ?? 7);

  function close(): void {
    uiState.habitEditor = null;
  }

  function save(): void {
    const n = name.trim();
    if (!n) {
      toast.show('先写一个习惯名称');
      return;
    }
    if (src) {
      src.name = n;
      src.icon = icon;
      src.color = color;
      src.target = Math.max(1, Math.min(7, Number(target) || 7));
      src.streak = calcStreak(src, today0());
      apiSaveHabit(src);
      cacheLocal();
    } else {
      const h = {
        id: uid(), name: n, icon, color, target: Math.max(1, Math.min(7, Number(target) || 7)),
        streak: 0, total: 0, log: [], createdAt: ymd(today0())
      };
      data.habits.push(h);
      apiSaveHabit(h);
      cacheLocal();
    }
    close();
    toast.show('已保存习惯');
  }

  function del(): void {
    if (!src) return;
    uiState.confirm = {
      title: '删除习惯',
      desc: '确定删除「' + src.name + '」？打卡记录会一起删除。',
      okText: '删除',
      danger: true,
      onOk: () => {
        data.habits = data.habits.filter((x) => x.id !== src.id);
        apiDeleteHabit(src.id);
        cacheLocal();
        close();
        toast.show('已删除');
      }
    };
  }
</script>

<div class="m-head">
  <h3>{src ? '编辑习惯' : '新建习惯'}</h3>
  <button class="m-close" onclick={close}><Icon name="close" /></button>
</div>
<div class="m-body">
  <div class="field">
    <label>名称</label>
    <input class="inp inp-title" id="hdName" bind:value={name} placeholder="比如：早起 6:30" autofocus />
  </div>
  <div class="field">
    <label>图标</label>
    <div class="chip-pick">
      {#each HABIT_ICONS as k (k)}
        <button class="chip-p{icon === k ? ' on' : ''}" data-hicon={k} onclick={() => (icon = k)}><Icon name={k} /></button>
      {/each}
    </div>
  </div>
  <div class="field">
    <label>颜色</label>
    <div class="chip-pick">
      {#each LIST_COLORS as c (c)}
        <button
          data-hcolor={c}
          style="width:28px;height:28px;border-radius:50%;background:{c};border:3px solid {color === c ? 'var(--panel)' : 'transparent'};box-shadow:0 0 0 {color === c ? '2px ' + c : '0 transparent'}"
          onclick={() => (color = c)}
        ></button>
      {/each}
    </div>
  </div>
  <div class="field">
    <label>每周目标<span class="hint">1–7 天</span></label>
    <input class="inp" id="hdTarget" type="number" min="1" max="7" bind:value={target} />
  </div>
</div>
<div class="m-foot">
  {#if src}<button class="btn btn-danger btn-sm" onclick={del}><Icon name="trash" />删除</button>{/if}
  <div class="spacer"></div>
  <button class="btn btn-sec" onclick={close}>取消</button>
  <button class="btn btn-pri" id="hdSave" onclick={save}>保存</button>
</div>
