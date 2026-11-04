/*
  编辑器表单状态与规则。组件只管画，判定（能不能存、存什么）都在这里，
  这样「改日期要不要平移计划」「提醒基准沿用旧 read 标记」之类的规则可以被单独读和测。
*/
import type { Sub, SubDraft, Task } from '$lib/domain/types';
import type { Layer } from '$lib/store/overlay.svelte';
import { EB_OFFSETS } from '$lib/domain/constants';
import { addDays, dayDiff, durText, fromDtLocal, parseYmd, toDtLocal, uid, ymd, today0 } from '$lib/domain/date';
import { taskSpan } from '$lib/domain/task';
import { allLists, allTags } from '$lib/domain/selectors';
import { app } from '$lib/store/app.svelte';
import { data, findTask } from '$lib/store/data.svelte';
import { meta, addCustomList, addCustomTag } from '$lib/store/meta.svelte';

export type EditorLayer = Extract<Layer, { kind: 'editor' }>;

export const SUB_TPLS = [
  { k: 'homework', t: '作业分科', items: [['语文作业', 30], ['数学作业', 40], ['英语作业', 30], ['其他科目', 20]] },
  { k: 'fitness', t: '健身分部', items: [['热身', 10], ['力量训练', 30], ['有氧', 20], ['拉伸放松', 10]] },
  { k: 'study', t: '学习分段', items: [['预习', 15], ['精读', 40], ['做题', 40], ['复盘整理', 15]] },
  { k: 'chores', t: '家务分工', items: [['整理房间', 20], ['洗衣', 15], ['做饭', 40], ['洗碗', 15]] }
] as const;

export class TaskForm {
  readonly layer: EditorLayer;
  readonly src: Task | null;
  readonly isNew: boolean;
  readonly fromDetail: boolean;
  readonly t0 = today0();

  title = $state('');
  note = $state('');
  list = $state('');
  tags = $state<string[]>([]);
  prio = $state('');
  important = $state(false);
  urgent = $state(false);
  date = $state('');
  time = $state('');
  planOn = $state(false);
  endDate = $state('');
  endTime = $state('');
  repeat = $state('不重复');
  remindMode = $state('不提醒');
  onceOffset = $state(-10);
  snooze = $state(false);
  endRemind = $state(false);
  offsets = $state<number[]>([]);
  anchorDate = $state('');
  anchorTime = $state('');
  subs = $state<SubDraft[]>([]);
  estMin = $state(0);
  estUnit = $state<'min' | 'hour'>('min');
  estValue = $state('');

  constructor(layer: EditorLayer) {
    this.layer = layer;
    this.isNew = layer.id === '__new__';
    this.src = this.isNew ? null : findTask(layer.id) ?? null;
    this.fromDetail = !!layer.preset?.fromDetail;

    const src = this.src;
    const init = layer.preset?.initial;
    const presetField = (key: string): string => {
      const p = layer.preset;
      if (!p) return '';
      if (p.group && p.group.kind === key) return p.group.key;
      if (p.presetGroup === key) return String(p.value || '');
      return '';
    };

    this.title = src?.title ?? init?.title ?? '';
    this.note = src?.note ?? '';
    this.list = src?.list ?? (presetField('list') || app.selectedList || '收集箱');
    this.tags = src ? [...src.tags] : init?.tags ? [...init.tags] : presetField('tags') ? [presetField('tags')] : [];
    this.prio = src?.prio ?? init?.prio ?? (presetField('priority') !== 'none' ? presetField('priority') : '');
    this.important = src?.important ?? false;
    this.urgent = src?.urgent ?? false;
    this.date = src?.date ?? init?.date ?? ymd(this.t0);
    this.time = src?.time ?? init?.time ?? '';
    this.planOn = src?.plan ?? false;
    this.endDate = src?.endDate ?? '';
    this.endTime = src?.endTime ?? '';
    this.repeat = src?.repeat || '不重复';
    this.remindMode = src?.remindMode || '不提醒';
    this.onceOffset = src?.remindCfg?.offsets?.[0] ?? -10;
    this.snooze = !!src?.remindCfg?.snooze;
    this.endRemind = !!(src?.remindCfg as Record<string, unknown> | null)?.end;
    this.offsets = src?.remindCfg?.offsets ? [...src.remindCfg.offsets] : [...EB_OFFSETS];
    this.anchorDate = (toDtLocal(src?.remindCfg?.anchor) || '').slice(0, 10);
    this.anchorTime = (toDtLocal(src?.remindCfg?.anchor) || '').slice(11, 16);
    this.subs = (src?.subs || []).map((x, i) => ({
      id: x.id || 's' + i,
      title: x.title,
      min: Number(x.min) > 0 ? Number(x.min) : null,
      days: Number(x.days) > 0 ? Number(x.days) : null,
      done: !!x.done,
      doneAt: x.doneAt || ''
    }));

    // 预计用时：内部一律存分钟，输入框按当前单位显示
    const initMin = Math.max(0, Number(src?.estimate) || 0);
    this.estMin = initMin;
    this.estUnit = initMin > 0 && initMin % 60 === 0 ? 'hour' : 'min';
    this.estValue = initMin ? (this.estUnit === 'hour' ? String(initMin / 60) : String(initMin)) : '';
  }

  /* 勾选「计划」后子项只填「天」、不填「分钟」；未勾计划只填「分钟」 */
  subSum = $derived(this.planOn ? 0 : this.subs.reduce((a, x) => a + (Number(x.min) || 0), 0));
  subDays = $derived(this.planOn ? this.subs.reduce((a, x) => a + (Number(x.days) || 0), 0) : 0);

  spanDays = $derived.by(() => {
    if (!this.planOn) return 1;
    const a = parseYmd(this.date);
    const b = parseYmd(this.endDate);
    if (!a || !b) return 1;
    return Math.max(1, dayDiff(a, b) + 1);
  });

  hasExplicitEnd = $derived((this.planOn && !!this.endDate && !!this.endTime) || (!!this.time && this.estMin > 0));

  /*
    计划提示。原来这里会把「天数 + 起止区间 + 阶段数 + 超期」全部重拼一遍，
    而这四样上面刚填过的地方都能看到 —— 于是出现「3 天：11/1 – 11/3 · 2 个阶段」
    这种一长串重复。现在只在「确实有信息增量」时才说话：
      - 没选开始日期 / 没勾计划，但子项排了天 → 提示怎么才能跨天
      - 子项排期超出计划天数 → 提示超出多少
    其余情况（天数、区间、阶段数都能从上面读到）一律不吭声。
  */
  planHint = $derived.by(() => {
    if (!this.date) return this.subDays ? '子项排了 ' + this.subDays + ' 天，先选开始日期' : '';
    if (!this.planOn) return this.subDays ? '子项排了 ' + this.subDays + ' 天，勾选「计划」才能跨天' : '';
    if (this.subDays > this.spanDays) return '⚠ 子项排期超出 ' + (this.subDays - this.spanDays) + ' 天';
    return '';
  });

  estHint = $derived(
    this.subSum > 0 && this.estMin !== this.subSum
      ? '子项合计 ' + durText(this.subSum) + (this.estMin ? '，与预计 ' + durText(this.estMin) + '不一致' : '，还没填预计用时')
      : ''
  );

  syncEstFromInput(): void {
    const v = parseFloat(this.estValue);
    this.estMin = !v || v <= 0 ? 0 : Math.round(this.estUnit === 'hour' ? v * 60 : v);
  }

  setUnit(u: 'min' | 'hour'): void {
    this.syncEstFromInput();
    this.estUnit = u;
    this.estValue = this.estMin ? String(this.estUnit === 'hour' ? Math.round((this.estMin / 60) * 100) / 100 : this.estMin) : '';
  }

  setEstMin(v: number): void {
    this.estMin = Math.max(0, Math.round(v || 0));
    if (this.estMin && this.estMin % 60 !== 0) this.estUnit = 'min';
    this.estValue = this.estMin ? String(this.estUnit === 'hour' ? Math.round((this.estMin / 60) * 100) / 100 : this.estMin) : '';
  }

  onPlanToggle(): void {
    if (!this.planOn) {
      this.endDate = '';
      this.endTime = '';
    } else if (!this.endDate && this.date) {
      this.endDate = ymd(addDays(parseYmd(this.date)!, Math.max(1, this.subDays || 1) - 1));
    }
  }

  addSub(): void {
    // min / days 留 null 而不是 0：给 0 的话输入框里显示一个「0」，
    // 用户不知道那里该填分钟还是天。留空才能让 placeholder 起作用。
    this.subs = [...this.subs, { id: 's' + this.subs.length, title: '', min: null, days: null, done: false, doneAt: '' }];
  }

  delSub(i: number): void {
    this.subs = this.subs.filter((_, idx) => idx !== i);
  }

  applyTpl(key: string): number {
    const tp = SUB_TPLS.find((x) => x.k === key);
    if (!tp) return 0;
    const exists: Record<string, boolean> = {};
    this.subs.forEach((x) => (exists[String(x.title || '').trim()] = true));
    const add: SubDraft[] = [];
    tp.items.forEach((it) => {
      if (exists[it[0]]) return;
      add.push({
        id: 's' + (this.subs.length + add.length),
        title: it[0],
        min: this.planOn ? null : it[1],
        days: this.planOn ? 1 : null,
        done: false,
        doneAt: ''
      });
      exists[it[0]] = true;
    });
    this.subs = [...this.subs, ...add].filter((x, i, arr) => !(i === 0 && !String(x.title || '').trim() && arr.length > 1));
    return add.length;
  }

  useEst(): void {
    this.setEstMin(this.subSum);
  }

  onStartDate(v: string): void {
    const prev = this.date;
    this.date = v;
    if (!this.planOn) return;
    if (!v) {
      this.endDate = '';
      return;
    }
    // 改开始日期时计划区间整体平移，跨度不变
    if (prev && this.endDate && prev !== v) {
      const a = parseYmd(prev);
      const b = parseYmd(v);
      const e = parseYmd(this.endDate);
      if (a && b && e) this.endDate = ymd(addDays(e, dayDiff(a, b)));
    }
    if (this.endDate && this.endDate < v) this.endDate = v;
  }

  onEndDate(v: string): void {
    this.endDate = v && this.date && v < this.date ? this.date : v;
  }

  /** 校验：返回第一条不能存的原因 */
  validate(): string | null {
    if (!this.title.trim()) return '先写一个事项标题';
    if (this.remindMode !== '不提醒' && this.remindMode !== '艾宾浩斯' && !this.date) return '提醒需要先选开始日期';
    if (this.remindMode === '艾宾浩斯') {
      if (!this.offsets.length) return '至少选一个复习节点';
      if (!this.remindBase()) return '选一个开始日期，或手动填基准时间';
    }
    return null;
  }

  remindBase(): string {
    if (this.date) return this.date + 'T' + (this.time || '09:00');
    if (this.anchorDate) return this.anchorDate + 'T' + (this.anchorTime || '09:00');
    return '';
  }

  /** 基准时间与节点都没变时沿用已读标记：只改标题保存不该把已确认的提醒重新点亮 */
  private keepRead(next: NonNullable<Task['remindCfg']>): NonNullable<Task['remindCfg']> {
    const prev = this.src?.remindCfg;
    if (!prev) return next;
    const sameAnchor = prev.anchor === next.anchor;
    const sameOffsets = JSON.stringify(prev.offsets || []) === JSON.stringify(next.offsets || []);
    return sameAnchor && sameOffsets ? { ...next, read: [...(prev.read || [])] } : next;
  }

  buildCfg(): Task['remindCfg'] {
    if (this.remindMode === '艾宾浩斯') {
      return this.keepRead({ anchor: fromDtLocal(this.remindBase()), offsets: [...this.offsets], read: [] });
    }
    if (this.remindMode === '单次提醒') {
      return this.keepRead({
        anchor: fromDtLocal(this.date + 'T' + (this.time || '09:00')),
        offsets: [this.onceOffset],
        read: [],
        snooze: this.snooze ? 5 : 0,
        end: this.endRemind && this.hasExplicitEnd ? 1 : 0
      } as NonNullable<Task['remindCfg']>);
    }
    return null;
  }

  cleanSubs(): Sub[] {
    return this.subs
      .map((x, i) => ({
        id: 's' + i,
        title: String(x.title || '').trim(),
        min: this.planOn ? 0 : Math.max(0, Number(x.min) || 0),
        days: this.planOn ? Math.max(0, Number(x.days) || 0) : 0,
        done: !!x.done,
        doneAt: x.doneAt || ''
      }))
      .filter((x) => !!x.title);
  }

  /** 表单 → 字段补丁；保存路径与新建路径共用 */
  toPatch(): Partial<Task> {
    this.syncEstFromInput();
    const cleanSubs = this.cleanSubs();
    let est = this.estMin;
    if (est <= 0 && cleanSubs.length) {
      const sum = cleanSubs.reduce((a, x) => a + x.min, 0);
      if (sum > 0) est = sum;
    }
    return {
      title: this.title.trim(),
      note: this.note.trim(),
      list: this.list.trim() || '收集箱',
      tags: [...this.tags],
      prio: this.prio,
      important: this.important,
      urgent: this.urgent,
      date: this.date,
      time: this.time,
      repeat: this.repeat === '不重复' ? '' : this.repeat,
      subs: cleanSubs,
      plan: this.planOn,
      endDate: this.planOn ? this.endDate || this.date : '',
      endTime: this.planOn ? this.endTime || '' : '',
      estimate: Math.max(0, est),
      remindMode: this.remindMode,
      remindCfg: this.buildCfg()
    };
  }

  /** 清单 / 标签里新写的名字要进元数据，否则下次选不到 */
  ensureMeta(patch: Partial<Task>): void {
    if (patch.list && !this.listNames().includes(patch.list)) addCustomList(patch.list);
    this.tags.forEach((g) => {
      if (!this.tagNames().includes(g)) addCustomTag(g);
    });
  }

  listNames(): string[] {
    return allLists(data.tasks, meta.customLists, meta.listOrder);
  }

  tagNames(): string[] {
    return allTags(data.tasks, meta.customTags, meta.tagOrder);
  }

  /** 用已有日程填充：标题、备注、开始日期时间保持当前值，只搬「怎么排、怎么提醒」 */
  pickFromTemplate(t: Task): void {
    this.list = t.list || '收集箱';
    this.setEstMin(t.estimate || 0);
    this.subs = (t.subs || []).map((x, i) => ({
      id: 's' + i,
      title: x.title,
      min: Number(x.min) > 0 ? Number(x.min) : null,
      days: Number(x.days) > 0 ? Number(x.days) : null,
      done: false,
      doneAt: ''
    }));
    if (t.plan && t.endDate) {
      this.planOn = true;
      const ss = parseYmd(t.date);
      const se = parseYmd(t.endDate);
      const spanN = ss && se ? Math.max(1, dayDiff(ss, se) + 1) : 1;
      this.endDate = this.date ? ymd(addDays(parseYmd(this.date)!, spanN - 1)) : t.endDate;
      this.endTime = t.endTime || '';
    } else {
      this.planOn = false;
      this.endDate = '';
      this.endTime = '';
    }
    this.tags = [...(t.tags || [])];
    if (t.prio) this.prio = t.prio;
    this.important = t.important;
    this.urgent = t.urgent;
    this.repeat = t.repeat || '不重复';
    this.remindMode = t.remindMode || '不提醒';
    if (t.remindCfg?.offsets?.length) {
      this.offsets = [...t.remindCfg.offsets];
      this.onceOffset = t.remindCfg.offsets[0];
      this.snooze = !!t.remindCfg.snooze;
      this.endRemind = !!t.remindCfg.end;
    }
  }

  /** 新建时补上落库需要的其余字段 */
  toNewTask(patch: Partial<Task>): Task {
    const nt: Task = {
      id: '',
      title: patch.title!,
      note: patch.note!,
      list: patch.list!,
      tags: patch.tags!,
      prio: patch.prio!,
      important: patch.important!,
      urgent: patch.urgent!,
      done: false,
      remindMode: patch.remindMode!,
      remindCfg: patch.remindCfg ?? null,
      date: patch.date!,
      time: patch.time!,
      estimate: patch.estimate!,
      doneAt: '',
      sort: Math.floor(Date.now() / 1000) % 1000000,
      subs: patch.subs!,
      repeat: patch.repeat!,
      plan: patch.plan!,
      endDate: patch.endDate!,
      endTime: patch.endTime!,
      span: 1,
      createdAt: ymd(this.t0)
    };
    nt.span = taskSpan(nt);
    nt.id = uid();
    return nt;
  }
}
