/*
  拖拽会话：谁在拖、何时结束，全仓只有一个计数。

  之前是 app.dragging 布尔 + 每个视图自己写 true/false：
  - 组件在拖拽途中被卸载（切视图、关面板）时没人复位 → 永久 true
  - 时钟的 15s tick 靠它冻结，于是时钟也永久停住
  - 外部变更重载也靠它守卫，于是重载永久失效

  改成计数 + 统一开关，卸载时由 drag.ts 的 destroy 兜底收口。
*/
const session = $state({ n: 0 });

export function beginDragSession(): void {
  session.n += 1;
  document.body.classList.add('is-dragging');
}

export function endDragSession(): void {
  session.n = Math.max(0, session.n - 1);
  if (session.n === 0) document.body.classList.remove('is-dragging');
}

/** 兜底：异常路径下直接把会话清零 */
export function resetDragSession(): void {
  session.n = 0;
  document.body.classList.remove('is-dragging');
}

export function isDragging(): boolean {
  return session.n > 0;
}
