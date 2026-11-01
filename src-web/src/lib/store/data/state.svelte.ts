/*
  唯一数据源。所有写库动作都改这里，组件靠 $state 代理数组自动失效。
*/
import type { Countdown, Habit, Pomodoro, Task } from '$lib/domain/types';

export const data = $state({
  tasks: [] as Task[],
  habits: [] as Habit[],
  countdowns: [] as Countdown[],
  pomodoros: [] as Pomodoro[]
});

export function findTask(id: string): Task | undefined {
  return data.tasks.find((t) => t.id === id);
}

/*
  $state 的数组会把元素包成代理并缓存读到的值：
  先 push 再改原始对象的 id，代理视图读到的仍是空串。
  所以凡是「推入后还要写 id」的地方，都必须拿数组里那个代理元素再写。
*/
export function pushProxied<T extends object>(arr: T[], item: T): T {
  arr.push(item);
  return arr[arr.length - 1];
}
