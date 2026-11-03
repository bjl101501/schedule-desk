<script lang="ts">
  /*
    清单 / 标签的选色浮层。

    色块按传统色的色族分列（红橙黄绿青蓝紫褐灰），和 sealuo 那个颜色库的分类一致。
    但清单只列冷色族、标签只列暖色族 —— 冷暖分开是「一眼分清哪个是清单、哪个是标签」
    的第一道保险，放开让清单选红色，这条保险就没了。
  */
  import { TRADITIONAL, type ColorFamily } from '$lib/domain/palette';
  import { isPinnedColor, setColorOf } from '$lib/store/meta.svelte';
  import { colorOwner, listColorFor, tagColorFor } from '$lib/store/palette.svelte';
  import { uiState } from '$lib/store/ui.svelte';
  import { popover } from '$lib/actions/popover';
  import { portal } from '$lib/actions/portal';
  import type { VirtualElement } from '@floating-ui/dom';
  import Icon from './Icon.svelte';

  const FAM_NAME: Record<ColorFamily, string> = {
    red: '红',
    orange: '橙',
    yellow: '黄',
    green: '绿',
    cyan: '青',
    blue: '蓝',
    purple: '紫',
    brown: '褐',
    gray: '灰'
  };
  const LIST_FAMS: ColorFamily[] = ['blue', 'cyan', 'green', 'purple', 'gray'];
  const TAG_FAMS: ColorFamily[] = ['red', 'orange', 'yellow', 'brown'];

  const st = $derived(uiState.colorPick);
  const fams = $derived<ColorFamily[]>(st ? (st.kind === 'list' ? LIST_FAMS : TAG_FAMS) : []);
  const cur = $derived(st ? (st.kind === 'list' ? listColorFor(st.name).hex : tagColorFor(st.name).hex) : '');
  const pinned = $derived(st ? isPinnedColor(st.kind, st.name) : false);

  function nameOf(hex: string): string {
    const up = String(hex || '').toUpperCase();
    for (const f of Object.keys(TRADITIONAL) as ColorFamily[]) {
      const hit = TRADITIONAL[f].find((c) => c.hex.toUpperCase() === up);
      if (hit) return hit.name;
    }
    return up;
  }

  /* 和 MiniMenu 一样：锚在鼠标点上，造一个零尺寸虚拟元素 */
  function pointAt(x: number, y: number): VirtualElement {
    const left = x - 6;
    return {
      getBoundingClientRect: () => ({ x: left, y, width: 0, height: 0, top: y, bottom: y, right: left, left })
    };
  }

  function close(): void {
    uiState.colorPick = null;
  }

  /* 选了就生效，不去动别的项 —— 用户要什么色就给什么色，撞了也是他的选择 */
  function choose(hex: string): void {
    if (!st) return;
    setColorOf(st.kind, st.name, hex);
    close();
  }

  function auto(): void {
    if (!st) return;
    setColorOf(st.kind, st.name, '');
    close();
  }
</script>

{#if st}
  <div
    id="colorPick"
    class="color-pick"
    data-cpkind={st.kind}
    data-cpname={st.name}
    use:portal
    use:popover={{
      anchor: pointAt(st.x, st.y),
      onClose: close,
      align: 'right',
      gap: 8,
      padding: 10
    }}
  >
    <div class="cp-head">
      <span class="cp-title">{st.kind === 'list' ? '清单' : '标签'}「{st.name}」</span>
      <button class="cp-auto{pinned ? ' on' : ''}" id="cpAuto" title="交回自动配色：用当前没被占用的颜色里排在最前的一个" onclick={auto}>
        <Icon name="refresh" />自动
      </button>
    </div>

    {#each fams as f (f)}
      <div class="cp-row">
        <span class="cp-fam">{FAM_NAME[f]}</span>
        <div class="cp-sw-row">
          {#each TRADITIONAL[f] as c (c.hex)}
            {@const owner = colorOwner(st.kind, c.hex, st.name)}
            <button
              class="cp-sw{cur.toUpperCase() === c.hex.toUpperCase() ? ' on' : ''}{owner ? ' used' : ''}"
              style="--sw:{c.hex}"
              data-color={c.hex}
              data-cname={c.name}
              title={owner ? c.name + '（' + owner + ' 已在用）' : c.name}
              aria-label={c.name}
              onclick={() => choose(c.hex)}
            ></button>
          {/each}
        </div>
      </div>
    {/each}

    <div class="cp-foot">
      <span class="cp-now"><i style="background:{cur}"></i>{nameOf(cur)}</span>
      <span class="cp-src{pinned ? ' manual' : ''}">{pinned ? '手动指定' : '自动分配'}</span>
    </div>
  </div>
{/if}
