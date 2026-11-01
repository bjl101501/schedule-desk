<script lang="ts">
  /*
    图标出口。name 沿用旧 ICONS 的键名，调用点不用改。
    lucide 的组件自带 svg 根与表现属性（fill:none / stroke:currentColor / stroke-width:2），
    所以这里不再手写 viewBox；自制图标继续走 {@html}。

    size 默认必须留 '1em'：lucide 自己的默认值是 24，漏传会让所有图标一下变大。
  */
  import { CUSTOM_ICONS, LUCIDE_ICONS } from './icons';

  let { name, cls = '', size }: { name: string; cls?: string; size?: number | string } = $props();

  const box = $derived(size ? (typeof size === 'number' ? size + 'px' : size) : '1em');
  const Comp = $derived(LUCIDE_ICONS[name]);
  const path = $derived(CUSTOM_ICONS[name] || '');
</script>

{#if Comp}
  <Comp class="ico {cls}" size={box} />
{:else if path}
  <svg class="ico {cls}" viewBox="0 0 24 24" width={box} height={box} aria-hidden="true">{@html path}</svg>
{/if}
