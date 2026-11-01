/* 首次运行的示例数据：纯生成，不写库。落库由 store/data 负责。 */
import type { Countdown, Habit, Pomodoro, Task } from './types';
import { addDays, hmStr, today0, ymd } from './date';
import { EB_OFFSETS } from './constants';
import { fallbackHoliday } from './holiday';

export interface SeedBundle {
  tasks: Task[];
  habits: Habit[];
  countdowns: Countdown[];
  pomodoros: Pomodoro[];
}

export function buildSeed(): SeedBundle {
  const t = today0();
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const hmAgo = (mins: number) => hmStr(Math.max(0, Math.min(23 * 60 + 59, nowMin - mins)));
  const overDate = nowMin >= 180 ? ymd(t) : ymd(addDays(t, -1));
  const overTime = nowMin >= 180 ? hmAgo(180) : '18:00';

  const base = (p: Partial<Task>): Task => ({
    id: '',
    title: '',
    note: '',
    list: '收集箱',
    tags: [],
    prio: '',
    important: false,
    urgent: false,
    done: false,
    remindMode: '不提醒',
    remindCfg: null,
    date: '',
    time: '',
    estimate: 0,
    doneAt: '',
    sort: 0,
    subs: [],
    repeat: '',
    plan: false,
    endDate: '',
    endTime: '',
    span: 1,
    createdAt: ymd(t),
    ...p
  });

  const demo: Task[] = [
    base({
      title: '整理今天的会议记录', list: '工作', tags: ['工作'], prio: 'P2', important: true,
      date: ymd(t), time: hmAgo(25), estimate: 60, note: '超过预计时长才算逾期'
    }),
    base({
      title: '提交本周项目周报', list: '工作', tags: ['工作'], prio: 'P1', important: true, urgent: true,
      date: overDate, time: overTime, estimate: 45, remindMode: '单次提醒',
      remindCfg: { anchor: overDate + ' ' + overTime, offsets: [-30], read: [], snooze: 5 },
      note: '超过预计时长才算逾期'
    }),
    base({
      title: '把书桌和资料收一遍', list: '生活', tags: ['生活'], prio: 'P3',
      date: ymd(t), note: '没填时间＝全天'
    }),
    base({
      title: '日程台二期开发', list: '工作', tags: ['工作', '项目'], prio: 'P0', important: true, urgent: true,
      date: ymd(addDays(t, -1)), time: '09:00', plan: true, endDate: ymd(addDays(t, 1)),
      subs: [
        { id: 's0', title: '接口与数据结构', min: 0, days: 1, done: true, doneAt: '' },
        { id: 's1', title: '前端交互与状态', min: 0, days: 1, done: false, doneAt: '' },
        { id: 's2', title: '打包与回归', min: 0, days: 1, done: false, doneAt: '' }
      ],
      note: '到结束日之后才算逾期'
    }),
    base({
      title: '准备季度复盘材料', list: '工作', tags: ['工作'], prio: 'P1', important: true,
      date: ymd(addDays(t, -2)), time: '10:00', plan: true, endDate: ymd(addDays(t, 1)),
      subs: [
        { id: 's0', title: '收集各组数据', min: 0, days: 1, done: false, doneAt: '' },
        { id: 's1', title: '写复盘初稿', min: 0, days: 2, done: false, doneAt: '' }
      ],
      note: '第一步已过排期'
    }),
    base({
      title: '产品面试 · 候选人 A', list: '工作', tags: ['会议', '工作'], prio: 'P0', important: true, urgent: true,
      date: ymd(addDays(t, 1)), time: '15:00', estimate: 60, remindMode: '单次提醒',
      remindCfg: { anchor: ymd(addDays(t, 1)) + ' 15:00', offsets: [-30], read: [], snooze: 5 },
      note: '提前 30 分钟 + 稍后提醒'
    }),
    base({
      title: '交房租', list: '生活', tags: ['生活'], prio: 'P2', urgent: true,
      date: ymd(addDays(t, 3)), remindMode: '单次提醒',
      remindCfg: { anchor: ymd(addDays(t, 3)) + ' 09:00', offsets: [0], read: [] },
      note: '全天提醒基准 09:00'
    }),
    base({
      title: '背完《长难句》第 5 单元', list: '学习', tags: ['学习', '英语'], prio: 'P2',
      date: ymd(addDays(t, 1)), time: '21:00', remindMode: '艾宾浩斯',
      remindCfg: { anchor: ymd(addDays(t, 1)) + ' 21:00', offsets: EB_OFFSETS.slice(), read: [] },
      note: '唯一一条艾宾浩斯'
    }),
    base({ title: '想去看看新开的美术馆', list: '收集箱', tags: ['生活'] }),
    base({
      title: '晨间拉伸 10 分钟', list: '生活', tags: ['运动'], prio: 'P3',
      date: ymd(t), time: '08:00', estimate: 10, done: true, doneAt: ymd(t)
    }),
    base({
      title: '周末大扫除', list: '生活', tags: ['生活'], prio: 'P3',
      date: ymd(addDays(t, 2)), time: '10:00',
      subs: [
        { id: 's0', title: '厨房', min: 20, days: 0, done: false, doneAt: '' },
        { id: 's1', title: '卫生间', min: 20, days: 0, done: false, doneAt: '' },
        { id: 's2', title: '客厅', min: 30, days: 0, done: false, doneAt: '' }
      ],
      note: '按时长拆分'
    })
  ];

  const history = [
    { title: '写周报并同步给团队', list: '工作', tags: ['工作'], prio: 'P1', day: -1 },
    { title: '整理会议纪要', list: '工作', tags: ['会议'], prio: 'P2', day: -1 },
    { title: '跑步 5 公里', list: '生活', tags: ['运动'], prio: 'P3', day: -2 },
    { title: '学完一节数据分析课', list: '学习', tags: ['学习'], prio: 'P2', day: -3 },
    { title: '给客户回邮件', list: '工作', tags: ['工作'], prio: 'P1', day: -3 },
    { title: '读完《深度工作》第 2 章', list: '学习', tags: ['学习', '阅读'], prio: 'P2', day: -4 },
    { title: '整理本月账单', list: '生活', tags: ['生活'], prio: 'P3', day: -5 },
    { title: '准备产品需求文档', list: '工作', tags: ['工作'], prio: 'P0', day: -5 },
    { title: '复盘上周目标完成情况', list: '工作', tags: ['工作'], prio: 'P1', day: -7 },
    { title: '做一次冥想', list: '生活', tags: ['生活'], prio: 'P3', day: -8 }
  ];

  history.forEach((x) => {
    demo.push(
      base({
        title: x.title, list: x.list, tags: x.tags, prio: x.prio, done: true,
        date: ymd(addDays(t, x.day)), estimate: 30, doneAt: ymd(addDays(t, x.day)),
        createdAt: ymd(addDays(t, x.day))
      })
    );
  });

  const mkLog = (rate: number, span: number): string[] => {
    const log: string[] = [];
    for (let i = 1; i <= span; i++) {
      if (Math.random() < rate) log.push(ymd(addDays(t, -i)));
    }
    return log.reverse();
  };

  const habits: Habit[] = [
    { id: '', name: '早起 6:30', icon: 'sun', color: '#C8892B', target: 7, streak: 0, total: 0, log: mkLog(0.78, 34), createdAt: ymd(t) },
    { id: '', name: '阅读 30 分钟', icon: 'book', color: '#177CB0', target: 7, streak: 0, total: 0, log: mkLog(0.62, 34), createdAt: ymd(t) },
    { id: '', name: '运动打卡', icon: 'fire', color: '#C3272B', target: 4, streak: 0, total: 0, log: mkLog(0.45, 34), createdAt: ymd(t) }
  ];
  habits.forEach((h) => (h.total = h.log.length));

  const fh = fallbackHoliday(ymd(t));
  const countdowns: Countdown[] = [
    { id: '', name: '项目上线日', type: '倒数日', date: ymd(addDays(t, 23)), note: '二期正式发布', color: '#177CB0', group: '', sys: '', createdAt: ymd(t) },
    { id: '', name: '和老婆的纪念日', type: '纪念日', date: '2021-06-18', note: '每年都要记住', color: '#7A4E63', group: '', sys: '', createdAt: ymd(t) },
    { id: '', name: '年度旅行出发', type: '倒数日', date: ymd(addDays(t, 47)), note: '大理 · 7 天', color: '#5E8C6A', group: '', sys: '', createdAt: ymd(t) },
    { id: '', name: '下一个假期 · ' + fh.name, type: '倒数日', date: fh.date, note: '预估 · 官方未公布', color: '#C3272B', group: '假期', sys: 'holiday', createdAt: ymd(t) }
  ];

  const pomodoros: Pomodoro[] = [];
  for (let i = 0; i < 9; i++) {
    const day = -Math.floor(i / 3);
    pomodoros.push({
      id: '', task: i % 2 ? '写方案' : '读文档', type: '专注', duration: 25,
      start: ymd(addDays(t, day)), date: ymd(addDays(t, day)), sub: '', pauseCount: 0, pauseSec: 0
    });
  }

  return { tasks: demo, habits, countdowns, pomodoros };
}
