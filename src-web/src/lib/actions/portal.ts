/*
  把节点搬到 body 级的 #float-root。
  原因：.modal 有 transform，会给 position:fixed 的后代创建包含块，
  日期 / 时间面板一旦留在弹窗里，坐标就全错。
*/
export function portal(node: HTMLElement) {
  const root = document.getElementById('float-root') || document.body;
  root.appendChild(node);
  return {
    destroy() {
      if (node.parentNode) node.parentNode.removeChild(node);
    }
  };
}
