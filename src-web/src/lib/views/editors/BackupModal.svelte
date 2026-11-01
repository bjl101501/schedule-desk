<script lang="ts">
  import { today0, ymd } from '$lib/domain/date';
  import {
    clearTables, data, dataJob, importBundle, readDailySnaps, readSafetySnapshot, seedDemo, writeSafetySnapshot
  } from '$lib/store/data.svelte';
  import { bundleCount, parseBundleText } from '$lib/domain/backup';
  import { downloadBlob } from '$lib/bridge/export';
  import { uiState } from '$lib/store/ui.svelte';
  import { toast } from '$lib/store/toast.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { prepareForm } from '$lib/actions/prepare-form';


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
    toast.show(writeSafetySnapshot('手动备份') ? '已生成本地快照' : '快照失败，存储空间可能不足');
  }

  let pendingText = $state('');
  let pasteText = $state('');
  let over = $state(false);

  const canImport = $derived(!!(pendingText.trim() || pasteText.trim()));

  function currentText(): string {
    return pendingText.trim() || pasteText.trim();
  }

  async function doImport(text: string, mode: 'append' | 'replace'): Promise<void> {
    try {
      const bundle = parseBundleText(text);
      const n = await importBundle(bundle, mode);
      toast.show((mode === 'replace' ? '已替换为 ' : '已导入 ') + n + ' 条数据');
      pendingText = '';
      pasteText = '';
      close();
    } catch (err) {
      toast.show('导入失败：' + (err instanceof Error ? err.message : String(err)));
    }
  }

  function importAppend(): void {
    void doImport(currentText(), 'append');
  }

  function importReplace(): void {
    const text = currentText();
    uiState.typed = {
      title: '先清空再导入',
      desc: '会先删除现有全部数据，再用备份内容替换。删除前会自动存一份快照。',
      word: '替换',
      onOk: () => void doImport(text, 'replace')
    };
  }

  function restoreSnapshot(): void {
    const raw = readSafetySnapshot();
    if (!raw) {
      toast.show('还没有可恢复的快照');
      return;
    }
    let at = 0;
    try {
      at = Number(JSON.parse(raw).at) || 0;
    } catch {
      toast.show('快照已损坏');
      return;
    }
    uiState.typed = {
      title: '恢复上次快照',
      desc:
        '会用 ' + new Date(at).toLocaleString() +
        ' 的快照覆盖当前数据。恢复前会自动再存一份当前快照。',
      word: '恢复',
      onOk: () => void doImport(raw, 'replace')
    };
  }

  async function readFile(f: File): Promise<void> {
    pendingText = await f.text();
    try {
      toast.show('已读取 ' + bundleCount(parseBundleText(pendingText)) + ' 条，点下面的按钮确认导入');
    } catch (err) {
      pendingText = '';
      toast.show('读取失败：' + (err instanceof Error ? err.message : String(err)));
    }
  }

  async function importFile(e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (f) await readFile(f);
  }

  async function onDrop(e: DragEvent): Promise<void> {
    e.preventDefault();
    over = false;
    const f = e.dataTransfer?.files?.[0];
    if (f) await readFile(f);
  }

  function clearTasks(): void {
    uiState.typed = {
      title: '清空事项',
      desc: '只删除全部事项，习惯与纪念日保留。',
      word: '清空',
      onOk: () => {
        writeSafetySnapshot('清空事项前');
        void clearTables(['tasks'], '正在清空事项').then(() => {
          toast.show('已清空事项');
          close();
        });
      }
    };
  }

  function regen(): void {
    seedDemo();
    close();
  }

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
    <label>导入<span class="hint">追加到现有数据；也可以先清空再导入</span></label>
    <div
      data-bkdrop
      ondragover={(e) => { e.preventDefault(); over = true; }}
      ondragleave={() => (over = false)}
      ondrop={onDrop}
      style="border:1.5px dashed {over ? 'var(--brand)' : 'var(--line-2)'};border-radius:12px;padding:16px;text-align:center;font-size:13px;color:var(--text-3);background:{over ? 'var(--brand-softer)' : 'transparent'}"
    >
      把备份 JSON 拖到这里，或
      <label class="btn btn-sec btn-sm" style="margin-left:6px;display:inline-flex">
        选文件
        <input type="file" accept="application/json,.json" id="bkImport" onchange={importFile} style="display:none" use:prepareForm />
      </label>
    </div>
    <textarea
      class="inp"
      id="bkPaste"
      rows="3"
      bind:value={pasteText}
      placeholder="也可以把备份 JSON 直接粘贴到这里"
      style="margin-top:8px;height:auto;padding:8px 10px;line-height:1.5"
      use:prepareForm
    ></textarea>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
      <button class="btn btn-pri btn-sm" data-bkimport="append" onclick={importAppend} disabled={!canImport || dataJob.on}>
        追加导入
      </button>
      <button class="btn btn-danger btn-sm" data-bkimport="replace" onclick={importReplace} disabled={!canImport || dataJob.on}>
        先清空再导入
      </button>
    </div>
    {#if dataJob.on}
      <div style="margin-top:8px;font-size:12px;color:var(--text-3)" data-job>
        {dataJob.label} {dataJob.done} / {dataJob.total}
      </div>
    {/if}
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
