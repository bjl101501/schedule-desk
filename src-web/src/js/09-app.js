/* ---------- 09-app.js · 备份导出 / 导航事件 / 启动 / 每日快照 / 快捷键 ---------- */
/* ---------- 备份与导出 ---------- */
function downloadBlob(name, content, mime) {
  try {
    var blob = new Blob([content], { type: (mime || 'application/json') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 300);
    return true;
  } catch (e) { toast('导出失败，请换个浏览器试试'); return false; }
}
function exportJson() {
  var data = {
    app: 'schedule-desk', version: 1, exportedAt: new Date().toISOString(),
    tasks: S.tasks, habits: S.habits, countdowns: S.countdowns, pomodoros: S.pomodoros
  };
  if (downloadBlob('日程台备份-' + ymd(today0()) + '.json', JSON.stringify(data, null, 2))) {
    toast('已导出 ' + S.tasks.length + ' 个任务 · ' + S.habits.length + ' 个习惯');
  }
}
function exportCsv() {
  var head = ['标题', '清单', '标签', '优先级', '重要', '紧急', '已完成', '日期', '时间', '预计时长(分钟)', '完成时间', '重复', '备注'];
  var rows = S.tasks.map(function (t) {
    return [t.title, t.list, t.tags.join(' '), t.prio, t.important ? '是' : '否', t.urgent ? '是' : '否',
      t.done ? '是' : '否', t.date, t.time, t.estimate, t.doneAt, t.repeat || '', t.note].map(function (v) {
        var s = String(v === null || v === undefined ? '' : v).replace(/"/g, '""');
        return '"' + s + '"';
      }).join(',');
  });
  var csv = '\ufeff' + head.join(',') + '\n' + rows.join('\n');
  if (downloadBlob('日程台任务-' + ymd(today0()) + '.csv', csv, 'text/csv')) toast('已导出 CSV');
}
function parseBackupText(text) {
  var o = JSON.parse(String(text));
  if (!o || typeof o !== 'object') throw new Error('bad');
  return {
    tasks: o.tasks || [], habits: o.habits || [],
    countdowns: o.countdowns || [], pomodoros: o.pomodoros || []
  };
}
function importCount(d) {
  return d.tasks.length + d.habits.length + d.countdowns.length + d.pomodoros.length;
}
function normSubsInput(v) {
  if (!v) return [];
  if (Object.prototype.toString.call(v) === '[object Array]') {
    return v.map(function (x, i) {
      return {
        id: 's' + i,
        title: String(x.t || x.title || ''),
        min: Number(x.m || x.min) || 0,
        done: !!(x.d || x.done)
      };
    }).filter(function (x) { return !!x.title; });
  }
  return unpackSubs(v);
}
function applyBackup(data) {
  var queue = [];
  data.tasks.forEach(function (x) {
    var t = {
      id: '', title: x.title || '未命名', note: x.note || '', list: x.list || '收集箱',
      tags: x.tags || [], prio: x.prio || '', important: !!x.important, urgent: !!x.urgent,
      done: !!x.done, remindMode: x.remindMode || '不提醒', remindCfg: x.remindCfg || null,
      date: x.date || '', time: x.time || '', estimate: x.estimate || 0,
      subs: normSubsInput(x.subs || x['拆分']),
      repeat: x.repeat || x['重复'] || '',
      doneAt: x.doneAt || '', sort: x.sort || 0, createdAt: x.createdAt || ymd(today0())
    };
    (t.tags || []).forEach(function (g) { addCustomTag(g); });
    if (t.list && t.list !== '收集箱') addCustomList(t.list);
    queue.push(function () { S.tasks.push(t); return apiAddTask(t); });
  });
  data.habits.forEach(function (x) {
    var h = {
      id: '', name: x.name || '习惯', icon: x.icon || 'target', color: x.color || '#177CB0',
      target: x.target || 7, streak: x.streak || 0, total: x.total || 0,
      log: x.log || [], createdAt: x.createdAt || ymd(today0())
    };
    queue.push(function () { S.habits.push(h); return apiSaveHabit(h); });
  });
  data.countdowns.forEach(function (x) {
    var c = {
      id: '', name: x.name || '纪念日', type: x.type || '倒数日', date: x.date || '',
      note: x.note || '', color: x.color || '#177CB0', createdAt: x.createdAt || ymd(today0())
    };
    queue.push(function () { S.countdowns.push(c); return apiSaveCountdown(c); });
  });
  data.pomodoros.forEach(function (x) {
    var p = {
      id: '', task: x.task || '', type: x.type || '专注', duration: x.duration || 0,
      start: x.start || '', date: x.date || ''
    };
    queue.push(function () { S.pomodoros.push(p); return apiAddPomo(p); });
  });
  var i = 0, total = queue.length;
  if (!total) { toast('没有可导入的数据'); return; }
  toast('开始导入 ' + total + ' 条数据…');
  function step() {
    if (i >= total) {
      cacheLocal(); refreshAll();
      toast('导入完成：' + total + ' 条数据');
      return;
    }
    var fn = queue[i++];
    fn().then(function () {
      if (i % 10 === 0) toast('正在导入 ' + i + ' / ' + total);
      step();
    }).catch(function (e) { console.error('导入单条失败:', e); step(); });
  }
  step();
}
function openImport() {
  var pending = null;
  var html = '<div class="modal">' +
    '<div class="m-head"><h3>导入数据</h3><button class="m-close">' + svgIcon('close') + '</button></div>' +
    '<div class="m-body">' +
    '<div class="banner" style="background:var(--brand-softer);border-color:#dbe6ff;color:var(--brand-2);margin:0">' +
    svgIcon('bulb') + '<span>导入是「追加」模式，不会覆盖现有数据。支持本工作台导出的 JSON 备份。</span></div>' +
    '<label class="file-drop" id="impDrop" for="impFile">' + svgIcon('upload') +
    '<b>点击选择备份文件</b><span>或把 .json 文件拖到这里</span></label>' +
    '<input type="file" id="impFile" accept=".json,application/json" class="file-input">' +
    '<div class="field"><label>或者粘贴备份内容</label>' +
    '<textarea class="inp" id="impText" placeholder="把备份文件里的内容整段粘贴到这里也可以" style="min-height:86px;font-size:12px"></textarea></div>' +
    '<div class="imp-info" id="impInfo"></div>' +
    '</div>' +
    '<div class="m-foot"><div class="spacer"></div>' +
    '<button class="btn btn-sec" id="impCancel">取消</button>' +
    '<button class="btn btn-pri" id="impOk" disabled>确认导入</button>' +
    '</div></div>';
  openModal(html, {
    onMount: function (root) {
      var info = root.querySelector('#impInfo');
      var okBtn = root.querySelector('#impOk');
      var drop = root.querySelector('#impDrop');
      var fileIn = root.querySelector('#impFile');
      var textIn = root.querySelector('#impText');
      function reset(msg) {
        pending = null;
        okBtn.disabled = true;
        okBtn.style.opacity = '.5';
        info.innerHTML = msg ? '<span class="warn">' + msg + '</span>' : '';
      }
      function setPending(data, from) {
        var n = importCount(data);
        if (!n) { reset('这个文件里没有可导入的数据（任务 / 习惯 / 纪念日 / 专注记录都是空的）。'); return; }
        pending = data;
        okBtn.disabled = false;
        okBtn.style.opacity = 1;
        info.innerHTML = '已识别（' + esc(from) + '）：任务 <b>' + data.tasks.length + '</b> · 习惯 <b>' +
          data.habits.length + '</b> · 纪念日 <b>' + data.countdowns.length + '</b> · 专注记录 <b>' +
          data.pomodoros.length + '</b><br>确认后会追加到现有数据末尾，已有数据不受影响。';
      }
      function readFile(f) {
        if (!f) return;
        var rd = new FileReader();
        rd.onload = function () {
          try { setPending(parseBackupText(rd.result), f.name); }
          catch (e) { console.error('解析失败:', e); reset('这个文件不是有效的 JSON 备份，请选择本工作台导出的 .json 文件。'); }
        };
        rd.onerror = function () { reset('文件读取失败，换一个文件试试。'); };
        rd.readAsText(f);
      }
      fileIn.addEventListener('change', function (e) { readFile(e.target.files && e.target.files[0]); });
      ['dragenter', 'dragover'].forEach(function (ev) {
        drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); });
      });
      ['dragleave', 'drop'].forEach(function (ev) {
        drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); });
      });
      drop.addEventListener('drop', function (e) {
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) readFile(f);
      });
      textIn.addEventListener('input', function () {
        var v = textIn.value.trim();
        if (!v) { reset(''); return; }
        try { setPending(parseBackupText(v), '粘贴内容'); }
        catch (e) { reset('内容还不是完整的 JSON，可能没复制全。'); }
      });
      root.querySelector('#impCancel').addEventListener('click', closeModal);
      okBtn.addEventListener('click', function () {
        if (!pending) return;
        var data = pending;
        closeModal();
        applyBackup(data);
      });
    }
  });
}
function openBackup() {
  openModal('<div class="modal">' +
    '<div class="m-head"><h3>数据备份</h3><button class="m-close">' + svgIcon('close') + '</button></div>' +
    '<div class="m-body">' +
    '<div class="banner" style="background:var(--green-soft);border-color:var(--green);color:var(--text);margin:0">' +
    svgIcon('check') + '<span>数据保存在本机，路径见设置里的「数据目录」。配置 WebDAV 或把目录放进同步盘即可多设备共用。</span></div>' +
    '<div class="field"><label>当前数据</label><div style="font-size:12.5px;color:var(--text-2);line-height:1.9">' +
    '任务 <b>' + S.tasks.length + '</b> 条 · 习惯 <b>' + S.habits.length + '</b> 个 · 纪念日 <b>' + S.countdowns.length + '</b> 个 · 专注记录 <b>' + S.pomodoros.length + '</b> 条</div></div>' +
    '<div style="display:flex;flex-direction:column;gap:8px">' +
    '<button class="btn btn-pri" id="bkExportJson" style="justify-content:flex-start;height:44px">' + svgIcon('download') + ' 导出 JSON 完整备份</button>' +
    '<button class="btn btn-sec" id="bkExportCsv" style="justify-content:flex-start;height:44px">' + svgIcon('download') + ' 导出任务 CSV（Excel 可打开）</button>' +
    '<button class="btn btn-sec" id="bkImport" style="justify-content:flex-start;height:44px">' + svgIcon('upload') + ' 导入备份 / 从文件恢复</button>' +
    '<button class="btn btn-sec" id="bkRestore" style="justify-content:flex-start;height:44px">' + svgIcon('refresh') + ' 恢复上次快照</button>' +
    '<button class="btn btn-sec" id="bkReseed" style="justify-content:flex-start;height:44px">' + svgIcon('refresh') + ' 重新生成示例数据</button>' +
    '<button class="btn btn-danger" id="bkClear" style="justify-content:flex-start;height:44px">' + svgIcon('trash') + ' 清空全部任务</button>' +
    '</div>' +
    '</div><div class="m-foot"><div style="font-size:11px;color:var(--text-3)">导出为完整备份，导入时逐条追加，可与旧备份合并</div></div></div>', {
    onMount: function (root) {
      root.querySelector('#bkExportJson').addEventListener('click', exportJson);
      root.querySelector('#bkExportCsv').addEventListener('click', exportCsv);
      root.querySelector('#bkImport').addEventListener('click', function () {
        closeModal();
        setTimeout(openImport, 200);
      });
      var snapBtn = root.querySelector('#bkRestore');
      if (snapBtn) {
        var snap = readSnapshot();
        if (!snap) { snapBtn.disabled = true; snapBtn.style.opacity = .5; snapBtn.title = '还没有快照'; }
        else {
          var dt = new Date(snap.at);
          snapBtn.innerHTML = svgIcon('refresh') + ' 恢复上次快照（' + (dt.getMonth() + 1) + '/' + dt.getDate() +
            ' ' + pad2(dt.getHours()) + ':' + pad2(dt.getMinutes()) + '，' + (snap.tasks || []).length + ' 条任务）';
        }
        snapBtn.addEventListener('click', function () {
          var sn = readSnapshot();
          if (!sn) return;
          confirmModal('恢复快照', '会用快照里的 ' + (sn.tasks || []).length + ' 条任务覆盖当前任务（当前 ' + S.tasks.length + ' 条）。', '恢复', function () {
            S.tasks = sn.tasks || [];
            S.habits = sn.habits || S.habits;
            S.countdowns = sn.countdowns || S.countdowns;
            cacheLocal(); refreshAll();
            toast('已恢复快照');
          });
        });
      }
      root.querySelector('#bkReseed').addEventListener('click', function () {
        confirmModal('重新生成示例数据', '会再写入一批示例任务（不影响已有数据）。确定吗？', '生成', function () {
          closeModal();
          setTimeout(function () { seedDemo(); }, 200);
          toast('正在写入示例数据…');
        });
      });
      root.querySelector('#bkClear').addEventListener('click', function () {
        takeSnapshot('清空任务前');
        typedConfirm('清空全部任务', '这会删除 <b>' + S.tasks.length + '</b> 条任务，且无法撤销。<br>删除前已在本机留了一份快照，可在「数据备份」里恢复。', '清空', function () {
          Promise.all(S.tasks.map(function (t) { return apiDeleteTask(t.id); })).then(function () {
            var _db = getDB();
            if (!_db) return null;
            return Promise.all(S.pomodoros.map(function (p) {
              return _db.deleteRecord({ databaseId: DB_IDS.pomodoros, recordId: p.id });
            }));
          }).then(function () {
            S.tasks = []; S.pomodoros = []; markSeeded(); cacheLocal(); refreshAll(); toast('已清空');
          });
        }, true);
      });
    }
  });
}
function openSettings() {
  openModal('<div class="modal settings">' +
    '<div class="m-head"><h3>设置</h3><button class="m-close">' + svgIcon('close') + '</button></div>' +
    '<div class="m-body">' +
    '<div class="field"><label>本地快照<span class="hint">每天首次打开自动存一份，保留 7 天</span></label>' +
    '<div id="stSnaps" style="display:flex;flex-direction:column;gap:7px">' + dailySnapHtml() + '</div></div>' +
    '<div class="field"><label>艾宾浩斯提醒</label><div style="font-size:13.5px;color:var(--text-2);line-height:1.85">' +
    '在任务里开启「艾宾浩斯」后，按 准时 → 5 分钟 → 30 分钟 → 12 小时 → 1 / 2 / 4 / 7 / 15 天 共 9 个节点安排复习提醒，' +
    '节点会显示成「第 6/9 次」。到点由 Windows 原生通知弹出（常驻到手动关闭），也出现在顶部铃铛和「今天要处理」区域。' +
    '</div></div>' +
    '<div class="field"><label>外观<span class="hint">选一套配色，立即生效，重新打开也记得</span></label>' +
    '<div class="theme-chips" id="stTheme">' + THEMES.map(function (t) {
      return '<button class="theme-chip' + (currentTheme() === t.k ? ' on' : '') + '" data-ththeme="' + t.k + '">' +
        themeDots(t) + t.name + '</button>';
    }).join('') + '</div></div>' +
    '<div class="field"><label>引用与致谢<span class="hint">外部依赖逐项登记</span></label>' +
    '<div style="font-size:13.5px;color:var(--text-2);line-height:1.955">' +
    '· <b>图标</b>：全部内联 SVG 手写，未使用图标库<br>' +
    '· <b>图表</b>：手写 SVG / CSS 绘制，未使用图表库<br>' +
    '· <b>数据存储</b>：本机 JSON 文件，可选 WebDAV 同步<br>' +
    '· <b>配色</b>：中国传统色 —— 靛青 #177CB0（主色）、朱砂 #C3272B、杏黄 #C8892B、竹青 #5E8C6A、绛紫 #7A4E63、石青 #1685A9、宣纸 #F7F3EA（底）、玄色 #2A2925（字）；色名与色值参照 sealuo.com/category/all 传统色卡整理<br>' +
    '· <b>字体</b>：霞鹜文楷 GB — LXGW WenKai GB，作者 LXGW，SIL Open Font License 1.1；经 jsDelivr CDN 分片加载（lxgw-wenkai-gb-web），加载失败自动回落到系统字体<br>' +
    '· <b>节假日数据</b>：holiday.ailcc.com 公开接口（GET /api/holiday/next/{date}），仅取「下一个法定节假日」，每日缓存 6 小时；接口不可用时用内置的固定日期表兜底，并标注「预估」' +
    '</div></div>' +
    '<div style="display:flex;flex-direction:column;gap:8px">' +
    '<button class="btn btn-danger" id="stClearAll" style="justify-content:flex-start;height:42px">' + svgIcon('trash') + ' 清空全部数据（含习惯 / 纪念日）</button>' +
    '</div></div>' +
    '<div class="m-foot"><div style="font-size:11px;color:var(--text-3)">日程台 · 作者 workbuddy &amp; bjl101501</div></div></div>', {
    onMount: function (root) {
      Array.prototype.forEach.call(root.querySelectorAll('[data-ththeme]'), function (b) {
        b.addEventListener('click', function () {
          setTheme(b.getAttribute('data-ththeme'));
          Array.prototype.forEach.call(root.querySelectorAll('[data-ththeme]'), function (x) {
            x.className = 'theme-chip' + (x.getAttribute('data-ththeme') === currentTheme() ? ' on' : '');
          });
        });
      });
      Array.prototype.forEach.call(root.querySelectorAll('[data-snaprestore]'), function (b) {
        b.addEventListener('click', function () {
          var day = b.getAttribute('data-snaprestore');
          closeModal();
          setTimeout(function () { restoreDailySnap(day); }, 220);
        });
      });
      root.querySelector('#stClearAll').addEventListener('click', function () {
        takeSnapshot('清空全部数据前');
        typedConfirm('清空全部数据', '会删除所有任务、习惯、纪念日、专注记录，且无法撤销。<br>删除前已在本机留了一份快照。', '全部清空', function () {
          var jobs = [];
          S.tasks.forEach(function (t) { jobs.push(apiDeleteTask(t.id)); });
          S.habits.forEach(function (h) { jobs.push(apiDeleteHabit(h.id)); });
          S.countdowns.forEach(function (c) { jobs.push(apiDeleteCountdown(c.id)); });
          S.pomodoros.forEach(function (p) {
            var _pdb = getDB();
            if (_pdb) jobs.push(_pdb.deleteRecord({ databaseId: DB_IDS.pomodoros, recordId: p.id }));
          });
          Promise.all(jobs).then(function () {
            S.tasks = []; S.habits = []; S.countdowns = []; S.pomodoros = [];
            markSeeded(); cacheLocal(); refreshAll(); toast('已全部清空');
          });
        }, true);
      });
    }
  });
}

/* ---------- 导航与事件 ---------- */
function goView(v) {
  S.view = v;
  S.selectedList = null;
  S.selectedTag = null;
  // 换视图回到第一屏
  S.listLimit = LIST_PAGE;
  S._listKey = '';
  if (v === 'calendar' && !S.cursor) S.cursor = today0();
  closeDrawer();
  refreshAll();
  var c = document.getElementById('content');
  if (c) c.scrollTop = 0;
}
function openDrawer() {
  var sb = document.getElementById('sidebar');
  var dm = document.getElementById('drawerMask');
  if (sb) sb.classList.add('open');
  if (dm) dm.classList.add('in');
  document.body.classList.add('drawer-open');
}
function closeDrawer() {
  var sb = document.getElementById('sidebar');
  var dm = document.getElementById('drawerMask');
  if (sb) sb.classList.remove('open');
  if (dm) dm.classList.remove('in');
  document.body.classList.remove('drawer-open');
}
function bindGlobalEvents() {
  var nav = document.getElementById('navMain');
  if (nav) nav.addEventListener('click', function (e) {
    var it = e.target.closest('[data-view]');
    if (it) goView(it.getAttribute('data-view'));
  });
  var tb = document.getElementById('tabbar');
  if (tb) tb.addEventListener('click', function (e) {
    var it = e.target.closest('[data-view]');
    if (it) goView(it.getAttribute('data-view'));
  });
  // 顶栏的列表 / 卡片 / 看板 / 时间线切换（按钮在 #content 外面，得单独绑）
  var vsw = document.querySelector('.view-switch');
  if (vsw) vsw.addEventListener('click', function (e) {
    var b = e.target.closest('[data-vmode]');
    if (!b) return;
    var want = b.getAttribute('data-vmode');
    if (S.vmode === want) return;
    S.vmode = want;
    S.listLimit = LIST_PAGE;
    Array.prototype.forEach.call(vsw.querySelectorAll('[data-vmode]'), function (x) {
      x.className = x.getAttribute('data-vmode') === want ? 'on' : '';
    });
    refreshAll();
  });
  var ln = document.getElementById('listNav');
  if (ln) ln.addEventListener('click', onSideListClick);
  var anv = document.getElementById('archivedNav');
  if (anv) anv.addEventListener('click', onSideListClick);
  function onSideListClick(e) {
    var mb = e.target.closest('[data-listmore]');
    if (mb) {
      e.stopPropagation(); e.preventDefault();
      var nm0 = mb.getAttribute('data-listmore');
      var items = [
        { label: '重命名清单', icon: 'edit', fn: function () { renameList(nm0); } }
      ];
      if (isArchived(nm0)) items.push({ label: '取消归档', icon: 'refresh', fn: function () { unarchiveList(nm0); } });
      else items.push({ label: '归档清单', icon: 'box', fn: function () { archiveList(nm0); } });
      items.push({ label: '删除清单', icon: 'trash', danger: true, fn: function () { removeList(nm0); } });
      openMiniMenu(mb, items);
      return;
    }
    var it = e.target.closest('[data-list]');
    if (!it) return;
    S.selectedList = it.getAttribute('data-list');
    S.selectedTag = null;
    if (S.view !== 'today' && S.view !== 'next7' && S.view !== 'inbox') S.view = 'today';
    closeDrawer(); refreshAll();
  }
  var tn = document.getElementById('tagNav');
  if (tn) tn.addEventListener('click', function (e) {
    var mb = e.target.closest('[data-tagmore]');
    if (mb) {
      e.stopPropagation(); e.preventDefault();
      var g0 = mb.getAttribute('data-tagmore');
      openMiniMenu(mb, [
        { label: '重命名标签', icon: 'edit', fn: function () { renameTag(g0); } },
        { label: '删除标签', icon: 'trash', danger: true, fn: function () { removeTag(g0); } }
      ]);
      return;
    }
    var it = e.target.closest('[data-tag]');
    if (!it) return;
    S.selectedTag = it.getAttribute('data-tag');
    S.selectedList = null;
    if (S.view !== 'today' && S.view !== 'next7' && S.view !== 'inbox') S.view = 'today';
    closeDrawer(); refreshAll();
  });
  var sw = document.getElementById('viewSwitch');
  if (sw) sw.addEventListener('click', function (e) {
    var b = e.target.closest('[data-vmode]');
    if (!b) return;
    S.vmode = b.getAttribute('data-vmode');
    refreshAll();
  });
  var qa = document.getElementById('btnQuickAdd');
  if (qa) qa.addEventListener('click', function () { closeDrawer(); openQuickAdd(''); });
  var fab = document.getElementById('btnFabAdd');
  if (fab) fab.addEventListener('click', function () { openQuickAdd(''); });
  var sbtn = document.getElementById('btnSort');
  if (sbtn) sbtn.addEventListener('click', function () {
    S.sortMode = (S.sortMode === 'manual') ? 'time' : 'manual';
    try { localStorage.setItem('wb_schedule_sort', S.sortMode); } catch (e) { }
    refreshAll();
    toast(S.sortMode === 'manual' ? '已切换为手动排序 · 按住任务可拖动' : '已恢复按时间排序');
  });
  var bf = document.getElementById('btnFilter');
  if (bf) bf.addEventListener('click', openFilter);
  var bt = document.getElementById('btnTheme');
  if (bt) bt.addEventListener('click', function () { openThemeMenu(bt); });
  var bs = document.getElementById('btnSearch');
  if (bs) bs.addEventListener('click', function () { openSearch(); });
  var bb = document.getElementById('btnBell');
  if (bb) bb.addEventListener('click', openReminderCenter);
  var bm = document.getElementById('btnMenu');
  if (bm) bm.addEventListener('click', openDrawer);
  var dm = document.getElementById('drawerMask');
  if (dm) dm.addEventListener('click', closeDrawer);
  var bk = document.getElementById('btnBackup');
  if (bk) bk.addEventListener('click', function () { openBackup(); closeDrawer(); });
  var st = document.getElementById('btnSettings');
  if (st) st.addEventListener('click', function () { openSettings(); closeDrawer(); });
  var al = document.getElementById('btnAddList');
  if (al) al.addEventListener('click', function () {
    closeDrawer();
    promptModal('新建清单', '给这一类日程起个名字，比如「工作」「健身」「论文」。', '', '清单名称', function (name) {
      var nm = addCustomList(name);
      S.selectedList = nm;
      S.selectedTag = null;
      refreshAll();
      toast('已创建清单「' + nm + '」');
    });
  });
  var at = document.getElementById('btnAddTag');
  if (at) at.addEventListener('click', function () {
    closeDrawer();
    promptModal('新建标签', '标签可以跨清单使用，比如「会议」「阅读」。', '', '标签名（不含 #）', function (name) {
      var nm = addCustomTag(name);
      S.selectedTag = nm;
      S.selectedList = null;
      refreshAll();
      toast('已创建标签「#' + nm + '」');
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeModal(); closeDrawer(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openQuickAdd(''); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'n') { e.preventDefault(); openQuickAdd(''); }
  });
  window.addEventListener('resize', function () {
    var bm2 = document.getElementById('btnMenu');
    if (bm2) bm2.style.display = window.innerWidth <= 860 ? '' : 'none';
    var wrap2 = document.querySelector('#modalRoot .modal-mask');
    if (wrap2) applyModalMode(wrap2);
  });
  var bm3 = document.getElementById('btnMenu');
  if (bm3) bm3.style.display = window.innerWidth <= 860 ? '' : 'none';
  enableSideDrag(document.getElementById('listNav'), 'wb_schedule_list_order');
  enableSideDrag(document.getElementById('tagNav'), 'wb_schedule_tag_order');
}

/* ---------- 启动 ---------- */
function watchMainWidth() {
  var el = document.querySelector('.main');
  if (!el) return;
  function apply() {
    var w = el.getBoundingClientRect().width;
    el.classList.toggle('condensed', w < 860);
    el.classList.toggle('tight', w < 700);
  }
  apply();
  if (window.ResizeObserver) {
    new ResizeObserver(apply).observe(el);
  } else {
    window.addEventListener('resize', apply);
  }
}
/* ---------- 每日自动快照 ---------- */
var DAILY_KEY = 'wb_schedule_daily';
function readDailySnaps() {
  try { return JSON.parse(localStorage.getItem(DAILY_KEY) || '[]') || []; } catch (e) { return []; }
}
function autoSnapshotDaily() {
  try {
    var day = ymd(today0());
    var arr = readDailySnaps();
    if (arr.some(function (x) { return x.day === day; })) return;
    if (!S.tasks.length && !S.habits.length && !S.countdowns.length) return;
    arr.push({ day: day, at: Date.now(), tasks: S.tasks, habits: S.habits, countdowns: S.countdowns });
    // 只留最近 7 份，避免把 localStorage 撑爆
    if (arr.length > 7) arr = arr.slice(arr.length - 7);
    localStorage.setItem(DAILY_KEY, JSON.stringify(arr));
  } catch (e) { }
}
function dailySnapHtml() {
  var arr = readDailySnaps();
  if (!arr.length) {
    return '<div style="font-size:13px;color:var(--text-3)">还没有快照，明天首次打开时会自动生成一份。</div>';
  }
  return arr.slice().reverse().map(function (x) {
    var n = (x.tasks || []).length, h = (x.habits || []).length, c = (x.countdowns || []).length;
    return '<div style="display:flex;align-items:center;gap:10px;font-size:13px">' +
      '<span style="flex:1;color:var(--text-2)">' + x.day + ' · ' + n + ' 条日程 / ' + h + ' 个习惯 / ' + c + ' 个纪念日</span>' +
      '<button class="btn btn-sm btn-sec" data-snaprestore="' + x.day + '">恢复</button></div>';
  }).join('');
}
function restoreDailySnap(day) {
  var arr = readDailySnaps();
  var hit = arr.filter(function (x) { return x.day === day; })[0];
  if (!hit) { toast('这份快照已经不在了'); return; }
  typedConfirm('恢复 ' + day + ' 的快照',
    '会用 ' + day + ' 当天的数据覆盖现在的 ' + S.tasks.length + ' 条日程、' + S.habits.length + ' 个习惯、' + S.countdowns.length + ' 个纪念日。当前数据会先存一份快照。',
    '恢复', function () {
      takeSnapshot('恢复每日快照前');
      S.tasks = hit.tasks || [];
      S.habits = hit.habits || [];
      S.countdowns = hit.countdowns || [];
      flushCache();
      refreshAll();
      toast('已恢复到 ' + day);
    });
}

/* ---------- 全局快捷键 ---------- */
var VIEW_KEYS = { '1': 'today', '2': 'calendar', '3': 'quadrant', '4': 'habit', '5': 'countdown', '6': 'focus', '7': 'stats' };
var KEY_HELP = [
  ['N', '新建日程'],
  ['/', '搜索'],
  ['T', '回到今天'],
  ['1 – 7', '切换 清单 / 日历 / 四象限 / 习惯 / 纪念日 / 番茄 / 统计'],
  ['Esc', '关闭弹窗或侧栏'],
  ['?', '打开这份快捷键表']
];
function openShortcuts() {
  openModal('<div class="modal sm shortcuts">' +
    '<div class="m-head"><h3>键盘快捷键</h3><button class="m-close">' + svgIcon('close') + '</button></div>' +
    '<div class="m-body">' + KEY_HELP.map(function (r) {
      return '<div class="sc-row"><kbd>' + r[0] + '</kbd><span>' + r[1] + '</span></div>';
    }).join('') +
    '<div class="hint" style="margin-top:6px">在输入框里打字时不会触发这些快捷键。</div>' +
    '</div></div>');
}
/* 表盘时钟：等宽字体显示时:分，小号秒跟在后面 */
function startClock() {
  var tEl = document.getElementById('clockTime');
  var sEl = document.getElementById('clockSec');
  if (!tEl) return;
  function tick() {
    var d = new Date();
    tEl.textContent = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    if (sEl) sEl.textContent = pad2(d.getSeconds());
  }
  tick();
  // 对齐到整秒再进 1 秒循环，秒数不跳格
  setTimeout(function () {
    tick();
    setInterval(tick, 1000);
  }, 1000 - (Date.now() % 1000));
}

function bindShortcuts() {
  document.addEventListener('keydown', function (e) {
    var t = e.target || {};
    var tag = String(t.tagName || '').toLowerCase();
    var typing = tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable;

    // Esc 任何时候都能关掉最上层
    if (e.key === 'Escape') {
      var top = document.querySelectorAll('.modal-mask.in');
      if (top.length) { closeModal(); e.preventDefault(); return; }
      if (document.body.classList.contains('drawer-open')) { closeDrawer(); return; }
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

    var hasModal = !!document.querySelector('.modal-mask.in');
    var k = e.key;

    if (k === '?') { e.preventDefault(); openShortcuts(); return; }
    if (hasModal) return;

    if (k === 'n' || k === 'N') { e.preventDefault(); openTaskEditor(null); return; }
    if (k === '/') { e.preventDefault(); openSearch(); return; }
    if (k === 't' || k === 'T') { e.preventDefault(); S.cursor = today0(); goView('today'); return; }
    if (VIEW_KEYS[k]) { e.preventDefault(); goView(VIEW_KEYS[k]); return; }
  });
}

function boot() {
  try { if (localStorage.getItem('wb_schedule_sort') === 'manual') S.sortMode = 'manual'; } catch (e) { }
  try {
    var pw = parseInt(localStorage.getItem('wb_schedule_panel_w') || '', 10);
    setPanelWidth(pw || 440);
  } catch (e) { setPanelWidth(440); }
  bindGlobalEvents();
  bindShortcuts();
  startClock();
  // 统一调度器：每 15 秒检查一次。状态发生迁移才整页重排，否则只改状态文字。
  Scheduler.on(function () {
    if (statesChanged()) refreshAll();
    else patchLiveState();
    renderBell();
  });
  Scheduler.start();
  bindTips();
  watchMainWidth();
  (function () {
    var th = THEMES.filter(function (x) { return x.k === currentTheme(); })[0] || THEMES[0];
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', th.bg);
  })();
  loadAll();
  var db = getDB();
  if (db && typeof db.onUpdated === 'function') {
    db.onUpdated(function (payload) {
      var ids = (payload && payload.databaseIds) || [];
      var mine = [DB_IDS.tasks, DB_IDS.habits, DB_IDS.countdowns, DB_IDS.pomodoros];
      var hit = ids.some(function (x) { return mine.indexOf(x) > -1; });
      if (!hit) return;
      clearTimeout(window.__updT);
      window.__updT = setTimeout(function () { loadAll(); }, 320);
    });
  }
  setTimeout(function () {
    if (!S.loaded) {
      var c = document.getElementById('content');
      if (c && c.querySelector('.empty')) {
        c.innerHTML = '<div class="empty"><div class="empty-ico">' + svgIcon('alert') + '</div>' +
          '<h4>暂时读不到云端数据</h4><p>可能是网络或登录状态问题。可以先点下面重试，或继续使用本机缓存。</p>' +
          '<button id="retryLoad">重新加载</button></div>';
        var r = document.getElementById('retryLoad');
        if (r) r.addEventListener('click', function () { S.loaded = false; loadAll(); });
      }
    }
  }, 9000);
}
document.addEventListener('DOMContentLoaded', boot);
