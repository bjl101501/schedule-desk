/*
  运行时挂在 window 上的东西：Tauri 宿主、浏览器预览的假宿主、CDP 测试门面。
  集中声明，避免满仓 `window as unknown as {...}`。
*/
export {};

declare global {
  interface TauriInternals {
    invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  }

  interface Window {
    /** 真机：Tauri 2 注入；浏览器预览下不存在 */
    __TAURI_INTERNALS__?: TauriInternals;
    /** 测试门面，由 lib/test/facade.svelte.ts 安装 */
    __SD_TEST__?: Record<string, unknown>;
    /** 数据门面，调试脚本读取；cdp-verify 已删，但保留给手工排障 */
    __SD_DESKTOP__?: Record<string, unknown>;
    __SMART_PAGE__?: Record<string, unknown>;
  }
}
