/* 拖拽落地后的数据变更：集中一处，视图只负责算落点 */
import { addDays, parseYmd, stampNow, ymd } from '$lib/domain/date';
import { apiUpdateTask, cacheLocal, data } from './data.svelte';
import { setListOrder, setTagOrder, meta } from './meta.svelte';
import { syncRemindAnchor } from '$lib/domain/selectors';
import { applyDateChange, taskById } from './taskActions.svelte';

/** 列表 / 卡片：按可见顺序重排，只给这批任务重写 sort */
export function applyVisibleOrder(ids: string[]): void {
  ids.forEach((id, i) => {
    const t = taskById(id);
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
  const t = taskById(taskId);
  if (!t) return;

  // 日期列单独走 applyDateChange（要平移计划、同步提醒基准）
  if (kind === 'date') {
    if (key === 'none') {
      const oldTime = t.time;
      t.date = '';
      syncRemindAnchor(t, oldTime);
      cacheLocal();
      apiUpdateTask(t, ['日期', '提醒设置']);
      return;
    }
    const base = ymd(new Date());
    const delta = key === 'over' ? -1 : key === 'today' ? 0 : key === 'week' ? 3 : 10;
    const day = parseYmd(base);
    if (!day) return;
    applyDateChange(t, { date: ymd(addDays(day, delta)) });
    return;
  }

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
  }
  if (fields.length) apiUpdateTask(t, Array.from(new Set(fields)));
  cacheLocal();
}

/** 四象限：拖到别的格子就改重要/紧急 */
export function dropQuadrant(taskId: string, cls: string): void {
  const t = taskById(taskId);
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
  const t = taskById(taskId);
  if (!t) return;
  applyDateChange(t, { date: ds }, { toast: '已改到 ' + ds });
}

/** 日/多日视图：拖到某列某个时刻，日期与时间一起改 */
export function dropToDateTime(taskId: string, ds: string, hm: string): void {
  const t = taskById(taskId);
  if (!t || !hm) return;
  applyDateChange(t, { date: ds, time: hm }, { toast: '已改到 ' + ds.slice(5) + ' ' + hm });
}

/** 拖到「全天」行：清掉时间，任务变全天 */
export function dropToAllDay(taskId: string, ds: string): void {
  const t = taskById(taskId);
  if (!t) return;
  applyDateChange(t, { date: ds, time: '' }, { toast: '已改为全天' });
}

/** 时间线：移动条改开始日，拖右手柄改天数 */
export function dropTimeline(taskId: string, newStart: string, newSpan?: number): void {
  const t = taskById(taskId);
  if (!t) return;
  if (newStart) applyDateChange(t, { date: newStart });
  if (newSpan && newSpan > 0 && t.plan) {
    const d = parseYmd(t.date);
    if (!d) return;
    t.endDate = ymd(addDays(d, newSpan - 1));
    cacheLocal();
    apiUpdateTask(t, ['结束日期']);
  }
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

