/* 写库映射：properties 的中文列名逐字段照抄旧实现，改了就会与既有数据不一致 */
import type { Countdown, Habit, Pomodoro, Props, Task } from './types';
import { ymd, today0 } from './date';
import { packSubs, taskSpan } from './task';

export function taskToProps(t: Task, partial?: string[]): Props {
  const p: Props = {};
  const put = (k: string, v: Props[string]) => {
    if (!partial || partial.indexOf(k) > -1) p[k] = v;
  };
  put('标题', { text: t.title || '' });
  put('备注', { text: t.note || '' });
  put('清单', { text: t.list || '收集箱' });
  put('标签', { text: (t.tags || []).join(',') });
  put('优先级', { select: String(t.prio || '').toUpperCase() });
  put('重要', { checkbox: !!t.important });
  put('紧急', { checkbox: !!t.urgent });
  put('已完成', { checkbox: !!t.done });
  put('提醒模式', { select: t.remindMode || '不提醒' });
  put('提醒设置', { text: t.remindCfg ? JSON.stringify(t.remindCfg) : '' });
  put('日期', { date: t.date || '' });
  put('时间', { text: t.time || '' });
  put('预计时长', { number: Number(t.estimate) || 0 });
  // 既有行为：完成时间存 "YYYY-MM-DD HH:mm" 到 date 类型里
  put('完成时间', { date: t.doneAt || '' });
  put('拆分', { text: packSubs(t.subs) });
  put('重复', { text: t.repeat || '' });
  put('计划', { checkbox: !!t.plan });
  put('结束日期', { date: t.endDate || '' });
  put('结束时间', { text: t.endTime || '' });
  // 兼容旧版本：仍然写一个换算后的天数
  put('持续', { number: taskSpan(t) });
  put('排序', { number: Number(t.sort) || 0 });
  put('创建时间', { date: t.createdAt || ymd(today0()) });
  return p;
}

export function habitToProps(h: Habit): Props {
  return {
    名称: { text: h.name },
    图标: { text: h.icon },
    颜色: { text: h.color },
    每周目标: { number: Number(h.target) || 7 },
    连续天数: { number: Number(h.streak) || 0 },
    总打卡: { number: Number(h.total) || 0 },
    打卡记录: { text: JSON.stringify(h.log || []) },
    创建时间: { date: h.createdAt || ymd(today0()) }
  };
}

export function cdToProps(c: Countdown): Props {
  return {
    名称: { text: c.name },
    类型: { select: c.type || '倒数日' },
    日期: { date: c.date || '' },
    备注: { text: c.note || '' },
    颜色: { text: c.color },
    分组: { text: c.group || '' },
    系统: { text: c.sys || '' },
    创建时间: { date: c.createdAt || ymd(today0()) }
  };
}

export function pomoToProps(p: Pomodoro): Props {
  return {
    任务: { text: p.task || '未命名专注' },
    类型: { select: p.type || '专注' },
    时长: { number: Number(p.duration) || 0 },
    开始时间: { date: p.start || '' },
    日期: { date: p.date || '' },
    子项: { text: p.sub || '' },
    暂停次数: { number: Number(p.pauseCount) || 0 },
    暂停时长: { number: Number(p.pauseSec) || 0 }
  };
}

/**
 * 把存档里的 {text/date/number/select/checkbox} 还原成标量。
 * 桥接层读库、导入解析存档、备份恢复三处都要这一步；
 * 之前 db.ts 与 backup.ts 各写一份，导入时字段名对不上会静默变 [object Object]。
 */
export function flattenProps(props: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!props || typeof props !== 'object') return out;
  for (const k of Object.keys(props)) {
    const v = props[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      if ('text' in o) out[k] = o.text;
      else if ('date' in o) out[k] = o.date;
      else if ('number' in o) out[k] = o.number;
      else if ('select' in o) out[k] = o.select;
      else if ('checkbox' in o) out[k] = !!o.checkbox;
      else out[k] = v;
    } else {
      out[k] = v;
    }
  }
  return out;
}
