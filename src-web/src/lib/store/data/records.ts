/*
  习惯 / 纪念日的保存入口。

  「新建还是更新」不看调用方传没传 id，而看这条记录在不在内存列表里 —— 和 saveTask 一条口径。
  原来编辑器的做法是「自己 push 进数组 + apiSaveHabit(h)」，而对象里的 id 是本地 uid()，
  apiSaveHabit 见 id 非空就走 update，于是新建永远写到不存在的 recordId 上：
  界面上多出一条（内存里有），重启就消失。v3.0.0 起就是这样。
*/
import type { Countdown, Habit } from '$lib/domain/types';
import { uid } from '$lib/domain/date';
import { cacheLocal } from './cache.svelte';
import { data, pushProxied } from './state.svelte';
import { apiAddCountdown, apiAddHabit, apiUpdateCountdown, apiUpdateHabit } from './write';

export function saveHabit(h: Habit): Promise<void> {
  const known = !!h.id && data.habits.some((x) => x.id === h.id);
  cacheLocal();
  if (known) return apiUpdateHabit(h);
  // 先给一个本地 id 占位：列表是 keyed each，空键会直接报错
  if (!h.id) h.id = uid();
  return apiAddHabit(pushProxied(data.habits, h));
}

export function saveCountdown(c: Countdown): Promise<void> {
  const known = !!c.id && data.countdowns.some((x) => x.id === c.id);
  cacheLocal();
  if (known) return apiUpdateCountdown(c);
  if (!c.id) c.id = uid();
  return apiAddCountdown(pushProxied(data.countdowns, c));
}
