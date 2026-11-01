import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath, URL } from 'node:url';

/*
  root 指向 src-web，产物仍落 src-web/build —— tauri.conf.json 的 frontendDist 保持不动。
  base 必须是相对路径：WebView2 通过 tauri:// 协议加载，绝对 /assets 会 404。
*/
export default defineConfig({
  root: fileURLToPath(new URL('./src-web', import.meta.url)),
  base: './',
  plugins: [
    svelte({
      onwarn(warning, handler) {
        // 这套 1:1 移植的标记里有大量 div/span 承载点击（.nav-item/.today-row/.side-item），
        // 换成 button 会改盒模型、把 1fr 栅格挤歪，所以只静音 a11y 提示，不改结构。
        if (warning.code.startsWith('a11y_')) return;
        handler(warning);
      }
    })
  ],
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL('./src-web/src/lib', import.meta.url))
    }
  },
  build: {
    outDir: 'build',
    emptyOutDir: true,
    target: 'chrome110',
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    sourcemap: false,
    chunkSizeWarningLimit: 900
  },
  server: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: true
  }
});
