/*
  表单准备：浏览器的自动填充、拼写检查与「记住上次输入」会污染日程编辑器
  （弹出账号密码、把标题标红、把前一次的内容塞回来）。旧版在 10-ui-kit.js
  里统一处理过，这里做成 action，挂到每个输入框上。
*/
type Field = HTMLInputElement | HTMLTextAreaElement;

export function prepareForm(node: Field): { destroy: () => void } {
  node.setAttribute('autocomplete', 'off');
  node.setAttribute('autocapitalize', 'off');
  node.setAttribute('spellcheck', 'false');
  node.setAttribute('data-lpignore', 'true');
  if (!node.getAttribute('name')) {
    node.setAttribute('name', 'f' + Math.random().toString(36).slice(2, 8));
  }
  return {
    destroy() {
      /* 无需清理：属性随节点一起销毁 */
    }
  };
}
