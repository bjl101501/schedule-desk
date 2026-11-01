/* 拖完不能顺手打开详情：松手后 420ms 内的点击一律忽略 */
let until = 0;

export function suppressNextClick(ms = 420): void {
  until = Date.now() + ms;
}

export function isSuppressed(): boolean {
  return Date.now() < until;
}
