<script lang="ts">
  import { stampNow, today0, uid, ymd } from '$lib/domain/date';
  import { data, cacheLocal, readDailySnaps, replaceAll, seedDemo } from '$lib/store/data.svelte';
  import { apiAddTask, apiSaveHabit, apiSaveCountdown } from '$lib/store/data.svelte';
  import { downloadBlob } from '$lib/bridge/export';
  import { uiState } from '$lib/store/ui.svelte';
  import { toast } from '$lib/store/toast.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  const SNAP_KEY = 'wb_schedule_snapshot';

  const snaps = $derived(readDailySnaps());

  function close(): void {
    uiState.backup = false;
  }

  function payload() {
    return {
      app: '日程台',
      version: 2,
      exportedAt: new Date().toISOString(),
      tasks: $state.snapshot(data.tasks),
      habits: $state.snapshot(data.habits),
      countdowns: $state.snapshot(data.countdowns),
      pomodoros: $state.snapshot(data.pomodoros)
    };
  }

  async function exportJson(): Promise<void> {
    await downloadBlob('日程台备份-' + ymd(today0()) + '.json', JSON.stringify(payload(), null, 2));
  }

  async function exportCsv(): Promise<void> {
    const head = ['标题', '备注', '清单', '标签', '优先级', '日期', '时间', '预计时长', '已完成', '完成时间', '计划', '结束日期', '结束时间'];
    const esc = (v: unknown) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const rows = data.tasks.map((t) =>
      [t.title, t.note, t.list, t.tags.join(' '), t.prio, t.date, t.time, t.estimate, t.done ? 1 : 0, t.doneAt, t.plan ? 1 : 0, t.endDate, t.endTime]
        .map(esc)
        .join(',')
    );
    await downloadBlob('日程台-' + ymd(today0()) + '.csv', '\ufeff' + head.map(esc).join(',') + '\n' + rows.join('\n'), 'text/csv');
  }

  function snapshotNow(): void {
    try {
      localStorage.setItem(
        SNAP_KEY,
        JSON.stringify({ at: Date.now(), reason: '手动备份', tasks: $state.snapshot(data.tasks), habits: $state.snapshot(data.habits), countdowns: $state.snapshot(data.countdowns) })
      );
      toast.show('已生成本地快照');
    } catch {
      toast.show('快照失败，存储空间可能不足');
    }
  }

  function restoreSnapshot(): void {
    try {
      const o = JSON.parse(localStorage.getItem(SNAP_KEY) || 'null');
      if (!o || !o.tasks) {
        toast.show('还没有可恢复的快照');
        return;
      }
      data.tasks = o.tasks;
      data.habits = o.habits || [];
      data.countdowns = o.countdowns || [];
      cacheLocal();
      toast.show('已恢复 ' + stampNow(new Date(o.at)) + ' 的快照');
      close();
    } catch {
      toast.show('快照已损坏');
    }
  }

  async function importFile(e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      const o = JSON.parse(text);
      const tasks = Array.isArray(o.tasks) ? o.tasks : Array.isArray(o) ? o : [];
      if (!tasks.length && !o.habits) {
        toast.show('这个文件里没有可导入的事项');
        return;
      }
      replaceAll({ tasks, habits: o.habits || [], countdowns: o.countdowns || [], pomodoros: o.pomodoros || [] });
      for (const t of data.tasks) await apiAddTask(t);
      for (const h of data.habits) await apiSaveHabit(h);
      for (const c of data.countdowns) await apiSaveCountdown(c);
      toast.show('已导入 ' + tasks.length + ' 条事项');
      close();
    } catch (err) {
      toast.show('导入失败：' + String(err));
    } finally {
      input.value = '';
    }
  }

  function clearTasks(): void {
    uiState.typed = {
      title: '清空事项',
      desc: '只删除全部事项，习惯与纪念日保留。',
      word: '清空',
      onOk: () => {
        data.tasks = [];
        cacheLocal();
        toast.show('已清空事项');
        close();
      }
    };
  }

  function regen(): void {
    seedDemo();
    close();
  }

  void snaps;
  void uid;
</script>

<div class="m-head">
  <h3>备份与恢复</h3>
  <button class="m-close" onclick={close}><Icon name="close" /></button>
</div>
<div class="m-body">
  <div class="field">
    <label>导出<span class="hint">JSON 可再导入，CSV 给表格用</span></label>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-pri btn-sm" id="bkExportJson" onclick={exportJson}><Icon name="download" />导出 JSON</button>
      <button class="btn btn-sec btn-sm" id="bkExportCsv" onclick={exportCsv}><Icon name="download" />导出 CSV</button>
    </div>
  </div>

  <div class="field">
    <label>导入<span class="hint">会追加到现有数据</span></label>
    <input class="inp" type="file" accept="application/json,.json" id="bkImport" onchange={importFile} />
  </div>

  <div class="field">
    <label>本地快照</label>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-sec btn-sm" onclick={snapshotNow}>立即快照</button>
      <button class="btn btn-sec btn-sm" onclick={restoreSnapshot}>恢复上次快照</button>
    </div>
    {#if snaps.length}
      <div style="margin-top:8px;font-size:12px;color:var(--text-3)">每日快照：{snaps.map((s) => s.day).join(' / ')}</div>
    {/if}
  </div>

  <div class="field">
    <label>示例数据</label>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-sec btn-sm" onclick={regen}>重新生成示例</button>
      <button class="btn btn-danger btn-sm" onclick={clearTasks}>清空事项</button>
    </div>
  </div>
</div>
<div class="m-foot">
  <div class="spacer"></div>
  <button class="btn btn-sec" onclick={close}>关闭</button>
</div>
