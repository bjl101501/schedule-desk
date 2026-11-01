<script lang="ts">
  import { onMount } from 'svelte';
  import { clock } from '$lib/store/clock.svelte';

  const hh = $derived(String(clock.minute.getHours()).padStart(2, '0'));
  const mm = $derived(String(clock.minute.getMinutes()).padStart(2, '0'));

  let root: HTMLElement;

  /* 冒号两点按物理像素对齐：3px 在 1.5 倍屏上是 4.5 个物理像素，
     上点会被抹成 4 行、下点 5 行，看起来「上小下大」。 */
  function fitClockDots(): void {
    const ck = root?.querySelector('.ck-c') as HTMLElement | null;
    if (!ck) return;
    const dpr = window.devicePixelRatio || 1;
    const snap = (v: number) => Math.round(v * dpr) / dpr;
    const dot = Math.max(1, Math.round(3 * dpr)) / dpr;
    const style = document.documentElement.style;
    style.setProperty('--ck-dot', dot + 'px');
    style.setProperty('--ck-y1', snap(11) + 'px');
    style.setProperty('--ck-y2', snap(20) + 'px');
    ck.style.transform = '';
    const top = ck.getBoundingClientRect().top;
    const fix = Math.round(top * dpr) / dpr - top;
    if (Math.abs(fix) > 0.01) ck.style.transform = 'translateY(' + fix + 'px)';
  }

  onMount(() => {
    fitClockDots();
    window.addEventListener('resize', fitClockDots);
    return () => window.removeEventListener('resize', fitClockDots);
  });
</script>

<div class="clock" id="clock" title="当前时间" bind:this={root}>
  <b class="tm">
    <span class="dg"><span class="on {hh.charAt(0) === '1' ? 'one' : ''}" id="clockH1">{hh.charAt(0)}</span><span class="off">8</span></span>
    <span class="dg"><span class="on {hh.charAt(1) === '1' ? 'one' : ''}" id="clockH2">{hh.charAt(1)}</span><span class="off">8</span></span>
    <span class="ck-c"></span>
    <span class="dg"><span class="on {mm.charAt(0) === '1' ? 'one' : ''}" id="clockM1">{mm.charAt(0)}</span><span class="off">8</span></span>
    <span class="dg"><span class="on {mm.charAt(1) === '1' ? 'one' : ''}" id="clockM2">{mm.charAt(1)}</span><span class="off">8</span></span>
  </b>
</div>
