/* 换肤：paper 时要 removeAttribute（不是 data-theme="paper"），并同步 meta theme-color */
import { THEMES } from '$lib/domain/constants';
import { toast } from './toast.svelte';

export const theme = $state({ key: currentTheme() });

export function currentTheme(): string {
  return document.documentElement.getAttribute('data-theme') || 'paper';
}

export function setTheme(k: string): void {
  theme.key = k;
  if (k === 'paper') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', k);
  try {
    localStorage.setItem('wb_theme', k);
  } catch {
    /* ignore */
  }
  const th = THEMES.filter((x) => x.k === k)[0] || THEMES[0];
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', th.bg);
  toast.show('已切换到「' + th.name + '」');
}
