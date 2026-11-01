/* 一次性提示：同一时刻只有一条，2100ms 后自动收起 */
export const toastState = $state({ text: '', on: false });

let timer: ReturnType<typeof setTimeout> | null = null;

export const toast = {
  show(msg: string): void {
    toastState.text = msg;
    toastState.on = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      toastState.on = false;
    }, 2100);
  }
};
