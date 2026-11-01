import { describe, expect, test } from 'bun:test';
import { blocksOf, segOn, DAY_MIN, HOUR_H } from './calendar';
import type { Task } from './types';

/** 只造 blocksOf 关心的字段，其余留默认 */
function task(p: Partial<Task>): Task {
  return {
    id: 'a', title: 't', note: '', list: '收集箱', tags: [], prio: '', important: false, urgent: false,
    done: false, remindMode: '不提醒', remindCfg: null, date: '2026-11-01', time: '', estimate: 0,
    doneAt: '', sort: 0, subs: [], repeat: '', plan: false, endDate: '', endTime: '', span: 1,
    createdAt: '2026-11-01', ...p
  } as Task;
}

describe('blocksOf 时间栅格分道', () => {
  test('不重叠：各占满宽', () => {
    const out = blocksOf([task({ id: 'a', time: '09:00' }), task({ id: 'b', time: '14:00' })], '2026-11-01');
    expect(out.length).toBe(2);
    expect(out[0].laneCount).toBe(1);
    expect(out[0].leftPct).toBe(0);
    expect(out[0].wPct).toBe(100);
    expect(out[1].laneCount).toBe(1);
  });

  test('重叠：两条车道各占一半', () => {
    const out = blocksOf([task({ id: 'a', time: '09:00', estimate: 60 }), task({ id: 'b', time: '09:30', estimate: 60 })], '2026-11-01');
    expect(out.map((b) => b.laneCount)).toEqual([2, 2]);
    expect(out.map((b) => b.lane)).toEqual([0, 1]);
    expect(out[1].leftPct).toBe(50);
    expect(out[1].wPct).toBe(50);
  });

  test('链式相接不算重叠：9:00-10:00 与 10:00-11:00 同车道', () => {
    const out = blocksOf([task({ id: 'a', time: '09:00', estimate: 60 }), task({ id: 'b', time: '10:00', estimate: 60 })], '2026-11-01');
    expect(out.every((b) => b.laneCount === 1)).toBe(true);
  });

  test('没填时长按 30 分钟，最小高度 22px', () => {
    const out = blocksOf([task({ time: '09:00', estimate: 0 })], '2026-11-01');
    expect(out[0].dur).toBe(30);
    expect(out[0].hgt).toBe(22);
  });

  test('顶到 24:00 的块整体上移，不掉出栅格', () => {
    const out = blocksOf([task({ time: '23:50', estimate: 60 })], '2026-11-01');
    const dayPx = (DAY_MIN / 60) * HOUR_H;
    expect(out[0].top + out[0].hgt).toBeLessThanOrEqual(dayPx);
    expect(out[0].top).toBe(dayPx - out[0].hgt);
  });

  test('没有时间的日程不进栅格', () => {
    expect(blocksOf([task({ time: '' })], '2026-11-01').length).toBe(0);
  });

  test('结束时间按开始 + 时长算', () => {
    const out = blocksOf([task({ time: '09:00', estimate: 90 })], '2026-11-01');
    expect(out[0].endT).toBe('10:30');
  });

  test('子项进度带在块上', () => {
    const t = task({ time: '09:00', estimate: 60, subs: [{ id: 's0', title: 'a', min: 30, days: 0, done: true, doneAt: '' }] });
    const out = blocksOf([t], '2026-11-01');
    expect(out[0].hasSubs).toBe(true);
    expect(out[0].subTxt).toBe(' · 1/1');
    expect(out[0].subPct).toBe(100);
  });
});

describe('segOn 子项分段', () => {
  const t = task({
    date: '2026-11-01',
    plan: true,
    endDate: '2026-11-03',
    subs: [
      { id: 's0', title: '调研', min: 0, days: 2, done: false, doneAt: '' },
      { id: 's1', title: '落地', min: 0, days: 1, done: false, doneAt: '' }
    ]
  });

  test('第 1、2 天落在第一段', () => {
    expect(segOn(t, '2026-11-01')?.title).toBe('调研');
    expect(segOn(t, '2026-11-02')?.title).toBe('调研');
  });

  test('第 3 天落在第二段', () => {
    expect(segOn(t, '2026-11-03')?.title).toBe('落地');
  });

  test('超出计划区间返回 null', () => {
    expect(segOn(t, '2026-11-04')).toBeNull();
    expect(segOn(t, '2026-10-31')).toBeNull();
  });

  test('没排天数的子项不占段', () => {
    const noDays = task({ date: '2026-11-01', subs: [{ id: 's0', title: 'x', min: 10, days: 0, done: false, doneAt: '' }] });
    expect(segOn(noDays, '2026-11-01')).toBeNull();
  });
});
