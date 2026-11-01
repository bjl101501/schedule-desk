/* 拖拽落地后的数据变更：集中一处，视图只负责算落点 */
import type { Task } from '$lib/domain/types';
import { addDays, dayDiff, parseYmd, stampNow, ymd } from '$lib/domain/date';
import { apiUpdateTask, cacheLocal, data } from './data.svelte';
import { setListOrder, setTagOrder, meta } from './meta.svelte';
import { toast } from './toast.svelte';
import { syncRemindAnchor } from '$lib/domain/selectors';

/** 列表 / 卡片：按可见顺序重排，只给这批任务重写 sort */
export function applyVisibleOrder(ids: string[]): void {
  ids.forEach((id, i) => {
    const t = data.tasks.find((x) => x.id === id);
    if (!t) return;
    const next = i * 10;
    if (Number(t.sort) !== next) {
      t.sort = next;
      apiUpdateTask(t, ['排序']);
    }
  });
  cacheLocal();
}

/** 看板：落到哪一列就改成那一列代表的字段 */
export function dropKanban(taskId: string, key: string, kind: string): void {
  const t = data.tasks.find((x) => x.id === taskId);
  if (!t) return;
  const fields: string[] = [];
  if (kind === 'priority') {
    t.prio = key === 'none' ? '' : key;
    fields.push('优先级');
  } else if (kind === 'list') {
    t.list = key;
    fields.push('清单');
  } else if (kind === 'tags') {
    if (key !== '__none' && t.tags.indexOf(key) === -1) {
      t.tags.push(key);
      fields.push('标签');
    }
  } else if (kind === 'status') {
    if (key === 'done') {
      t.done = true;
      t.doneAt = stampNow();
      fields.push('已完成', '完成时间');
    } else {
      if (t.done) {
        t.done = false;
        t.doneAt = '';
        fields.push('已完成', '完成时间');
      }
      if (key === 'doing' && !t.date) {
        t.date = ymd(new Date());
        fields.push('日期');
      }
    }
  } else if (kind === 'date') {
    if (key === 'none') {
            const oldTime = t.time;
      t.date = '';
      syncRemindAnchor(t, oldTime);
      fields.push('日期', '提醒设置');
    } else {
      const base = parseYmd(ymd(new Date()))!;
      const delta = key === 'over' ? -1 : key === 'today' ? 0 : key === 'week' ? 3 : 10;
            const oldTime = t.time;
      const d = addDays(base, delta);
      if (t.plan && t.endDate && t.date) {
        const shift = dayDiff(parseYmd(t.date)!, d);
        t.endDate = ymd(addDays(parseYmd(t.endDate)!, shift));
        fields.push('结束日期');
      }
      t.date = ymd(d);
      syncRemindAnchor(t, oldTime);
      fields.push('日期', '提醒设置');
    }
  }
  if (fields.length) apiUpdateTask(t, Array.from(new Set(fields)));
  cacheLocal();
}

/** 四象限：拖到别的格子就改重要/紧急 */
export function dropQuadrant(taskId: string, cls: string): void {
  const t = data.tasks.find((x) => x.id === taskId);
  if (!t) return;
  const want = cls === 'q2' ? { i: true, u: true } : cls === 'q1' ? { i: true, u: false } : cls === 'q3' ? { i: false, u: true } : { i: false, u: false };
  if (t.important === want.i && t.urgent === want.u) return;
  t.important = want.i;
  t.urgent = want.u;
  cacheLocal();
  apiUpdateTask(t, ['重要', '紧急']);
}

/** 日历：拖到另一天 → 改开始日，计划区间整体平移 */
export function dropToDate(taskId: string, ds: string): void {
  const t = data.tasks.find((x) => x.id === taskId);
  if (!t || !ds || t.date === ds) return;
    const oldTime = t.time;
  if (t.plan && t.endDate && t.date) {
    const delta = dayDiff(parseYmd(t.date)!, parseYmd(ds)!);
    t.endDate = ymd(addDays(parseYmd(t.endDate)!, delta));
  }
  t.date = ds;
  syncRemindAnchor(t, oldTime);
  cacheLocal();
  apiUpdateTask(t, ['日期', '结束日期', '提醒设置']);
  toast.show('已改到 ' + ds);
}

/** 日/多日视图：拖到某列某个时刻，日期与时间一起改 */
export function dropToDateTime(taskId: string, ds: string, hm: string): void {
  const t = data.tasks.find((x) => x.id === taskId);
  if (!t || !ds || !hm) return;
  if (t.date === ds && t.time === hm) return;
    const oldTime = t.time;
  if (t.plan && t.endDate && t.date && ds !== t.date) {
    const delta = dayDiff(parseYmd(t.date)!, parseYmd(ds)!);
    t.endDate = ymd(addDays(parseYmd(t.endDate)!, delta));
  }
  t.date = ds;
  t.time = hm;
  syncRemindAnchor(t, oldTime);
  cacheLocal();
  apiUpdateTask(t, ['日期', '时间', '结束日期', '提醒设置']);
  toast.show('已改到 ' + ds.slice(5) + ' ' + hm);
}

/** 拖到「全天」行：清掉时间，任务变全天 */
export function dropToAllDay(taskId: string, ds: string): void {
  const t = data.tasks.find((x) => x.id === taskId);
  if (!t || !ds) return;
  if (t.date === ds && !t.time) return;
    const oldTime = t.time;
  if (t.plan && t.endDate && t.date && ds !== t.date) {
    const delta = dayDiff(parseYmd(t.date)!, parseYmd(ds)!);
    t.endDate = ymd(addDays(parseYmd(t.endDate)!, delta));
  }
  t.date = ds;
  t.time = '';
  syncRemindAnchor(t, oldTime);
  cacheLocal();
  apiUpdateTask(t, ['日期', '时间', '结束日期', '提醒设置']);
  toast.show('已改为全天');
}

/** 时间线：移动条改开始日，拖右手柄改天数 */
export function dropTimeline(taskId: string, newStart: string, newSpan?: number): void {
  const t = data.tasks.find((x) => x.id === taskId);
  if (!t) return;
  if (newStart) {
        const oldTime = t.time;
    if (t.plan && t.endDate && t.date && newStart !== t.date) {
      const delta = dayDiff(parseYmd(t.date)!, parseYmd(newStart)!);
      t.endDate = ymd(addDays(parseYmd(t.endDate)!, delta));
    }
    t.date = newStart;
    syncRemindAnchor(t, oldTime);
  }
  if (newSpan && newSpan > 0 && t.plan) {
    t.endDate = ymd(addDays(parseYmd(t.date)!, newSpan - 1));
  }
  cacheLocal();
  apiUpdateTask(t, ['日期', '结束日期', '提醒设置']);
}

/** 侧栏：清单 / 标签排序 */
export function reorderSidebar(kind: 'list' | 'tag', from: string, to: string): void {
  const cur = kind === 'list' ? meta.listOrder.slice() : meta.tagOrder.slice();
  const base = cur.length
    ? cur
    : kind === 'list'
      ? data.tasks.map((t) => t.list || '收集箱')
      : data.tasks.flatMap((t) => t.tags);
  const order = Array.from(new Set(base));
  const i = order.indexOf(from);
  const j = order.indexOf(to);
  if (i < 0 || j < 0 || i === j) return;
  order.splice(i, 1);
  order.splice(j, 0, from);
  if (kind === 'list') setListOrder(order);
  else setTagOrder(order);
}

export function taskById(id: string): Task | undefined {
  return data.tasks.find((x) => x.id === id);
}
