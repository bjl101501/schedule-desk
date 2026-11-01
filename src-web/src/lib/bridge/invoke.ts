/* 前端 ↔ Rust 的唯一通道：Tauri 2 的 __TAURI_INTERNALS__.invoke
   不引入 @tauri-apps/api，保持运行时零依赖。 */

export type Transport = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

let override: Transport | null = null;

/** 浏览器预览用：把 transport 换成内存实现 */
export function setTransport(fn: Transport | null): void {
  override = fn;
}

function hostTransport(): Transport | null {
  const t = window.__TAURI_INTERNALS__;
  return t && typeof t.invoke === 'function' ? (t.invoke.bind(t) as Transport) : null;
}

export function transport(): Transport | null {
  return override || hostTransport();
}

export function hasHost(): boolean {
  return !!transport();
}

export function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const t = transport();
  if (!t) return Promise.reject(new Error('no native host'));
  return t(cmd, args) as Promise<T>;
}

/** 桌面命令统一错误形状：{__error}。调用点不用到处 try/catch */
export async function invokeSafe<T = Record<string, unknown>>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T | { __error: string }> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    return { __error: String(e) };
  }
}

export function errText(r: unknown): string {
  if (r && typeof r === 'object' && '__error' in r) return String((r as { __error: unknown }).__error);
  return '';
}
