/*
  日期 / 时间字段是个 <button>，旧版用 Object.defineProperty 给它挂了 value。
  外部代码（回归脚本、少量业务逻辑）一直按 el.value 读值，这里保留同一套契约，
  避免为了「组件化」把调用方全改一遍。
*/
export function valueProp(
  node: HTMLElement,
  params: { get: () => string; set: (v: string) => void }
): { update: (p: typeof params) => void; destroy: () => void } {
  let p = params;
  Object.defineProperty(node, 'value', {
    configurable: true,
    get: () => p.get(),
    set: (v: string) => p.set(String(v ?? ''))
  });
  return {
    update(np) {
      p = np;
    },
    destroy() {
      delete (node as unknown as Record<string, unknown>).value;
    }
  };
}
