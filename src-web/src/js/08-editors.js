/* ---------- 08-editors.js · 任务编辑器 / 快速添加 / 过滤器 / 提醒 / 习惯与纪念日编辑器 ---------- */
/* ---------- 任务编辑器 ---------- */
var SUB_TPLS = [
  { k: 'homework', t: '作业分科', items: [['语文作业', 30], ['数学作业', 40], ['英语作业', 30], ['其他科目', 20]] },
  { k: 'fitness', t: '健身分部', items: [['热身', 10], ['力量训练', 30], ['有氧', 20], ['拉伸放松', 10]] },
  { k: 'study', t: '学习分段', items: [['预习', 15], ['精读', 40], ['做题', 40], ['复盘整理', 15]] },
  { k: 'chores', t: '家务分工', items: [['整理房间', 20], ['洗衣', 15], ['做饭', 40], ['洗碗', 15]] }
];
function openTaskEditor(id, preset) {
  var t = id ? findTask(id) : null;
  var isNew = !t;
  var fromDetail = !!(preset && preset.fromDetail);
  if (isNew) {
    t = {
      id: '', title: '', note: '', list: '收集箱', tags: [], prio: '',
      important: false, urgent: false, done: false, remindMode: '不提醒', remindCfg: null,
      date: ymd(today0()), time: '', estimate: 0, doneAt: '', subs: [], sort: Math.floor(Date.now() / 1000) % 1000000, createdAt: ymd(today0())
    };
    if (S.selectedList) t.list = S.selectedList;
    if (preset && preset.presetGroup === 'list' && preset.value) t.list = preset.value;
    if (preset && preset.presetGroup === 'priority' && preset.value !== 'none') t.prio = preset.value;
    if (preset && preset.presetGroup === 'tags' && preset.value) t.tags = [preset.value];
    if (preset && preset.value === 'today') t.date = ymd(today0());
  }
  var tags = t.tags.slice();
  var allTagList = allTags();
  var listNames = allLists();
  var ebOffsets = (t.remindCfg && t.remindCfg.offsets) ? t.remindCfg.offsets.slice() : EB_OFFSETS.slice();
  var anchorVal = (t.remindCfg && t.remindCfg.anchor) ? toDtLocal(t.remindCfg.anchor) : (t.date ? t.date + 'T' + (t.time || '09:00') : '');

  function tagsHtml() {
    return tags.map(function (g, i) {
      return '<button class="chip-p on" data-tagrm="' + i + '">#' + esc(g) + ' ×</button>';
    }).join('');
  }
  var html = '<div class="modal wide">' +
    '<div class="m-head">' +
    (fromDetail ? '<button class="m-back" id="edBack" title="返回详情">' + svgIcon('chevL') + '</button>' : '') +
    '<h3>' + (isNew ? '新建日程' : (fromDetail ? '修改日程' : '编辑日程')) + '</h3>' +
    (isNew ? '<button type="button" class="m-tpl" id="edTpl">' + svgIcon('copy') + ' 用已有日程填充</button>' : '') +
    '<button class="m-close">' + svgIcon('close') + '</button></div>' +
    '<div class="m-body">' +
    '<div class="field"><input class="inp inp-title" id="edTitle" placeholder="要做什么？" value="' + esc(t.title) + '" ' + (isNew ? 'autofocus' : '') + '></div>' +
    '<div class="field"><textarea class="inp" id="edNote" placeholder="补充说明（可选）">' + esc(t.note) + '</textarea></div>' +

    '<section class="ed-sec">' +
    '<div class="ed-sec-t">时间安排</div>' +
    '<div class="row3">' +
    '<div class="field"><label>开始日期' + tipMark('日程从哪一天开始。需要连续几天完成，用右边的「持续」。') + '</label>' +
    '<button type="button" class="inp pick-field" id="edDate"></button></div>' +
    '<div class="field"><label>时间<span class="hint">留空＝全天</span>' + tipMark('留空就是全天日程：当天一直显示「进行中」，过了这一天才会逾期。') + '</label>' +
    '<button type="button" class="inp pick-field" id="edTime"></button></div>' +
    '<div class="field"><label>持续<span class="hint">可选</span>' + tipMark('连续多天完成的任务，逾期按最后一天算。') + '</label>' +
    '<div class="span-toggle' + (t.span > 1 ? ' on' : '') + '" id="edSpanWrap">' +
    '<input type="checkbox" id="edSpanOn"' + (t.span > 1 ? ' checked' : '') + '>' +
    '<span class="span-txt">多天</span>' +
    '<input class="span-num" type="number" id="edSpan" min="2" max="365" step="1" value="' +
    (t.span > 1 ? t.span : '') + '" placeholder="2">' +
    '<span class="span-u">天</span>' +
    '</div></div>' +
    '</div>' +
    '<div class="span-hint" id="edSpanHint"></div>' +
    '<div class="field"><label>重复<span class="hint">完成后自动排下一次</span>' + tipMark('勾选后，完成当前这条会自动生成下一次，适合固定习惯。') + '</label><div class="chip-pick" id="edRepeat">' +
    REPEAT_OPTS.map(function (r) {
      return '<button class="chip-p' + ((t.repeat || '不重复') === r ? ' on' : '') + '" data-repeat="' + r + '">' + r + '</button>';
    }).join('') + '</div></div>' +
    '</section>' +

    '<section class="ed-sec">' +
    '<div class="ed-sec-t">归属与时长</div>' +
    '<div class="field"><label>清单' + tipMark('给日程归类。左侧清单栏可以按清单查看。') + '</label>' +
    '<input class="inp" id="edList" value="' + esc(t.list) + '" placeholder="收集箱">' +
    '<div class="pick-row">' +
    '<button type="button" class="inp pick-multi" id="edListPick">' +
    '<span>选已有</span><i class="pm-c">' + svgIcon('chevD') + '</i></button>' +
    '<button class="chip-p" data-picklist="__new" style="border-style:dashed">＋ 新建清单</button>' +
    '</div></div>' +
    '<div class="field"><label>预计时长<span class="hint">留空＝全天</span>' + tipMark('填了时长：超过「开始时间 + 时长」还没完成才算逾期；留空按全天日程处理。') + '</label>' +
    '<div class="est-row">' +
    '<input class="inp" type="number" id="edEst" min="0" step="5" value="' + (t.estimate || '') + '" placeholder="留空＝全天">' +
    '<div class="seg est-unit" id="edEstUnit">' +
    '<button data-estunit="min" class="on">分钟</button><button data-estunit="hour">小时</button>' +
    '</div></div>' +
    '<div class="est-hint" id="edEstHint"></div>' +
    '</div>' +
    '</section>' +

    '<section class="ed-sec">' +
    '<div class="ed-sec-t">拆分</div>' +
    '<div class="field"><label>' + svgIcon('split') + '子项<span class="hint" id="edSubHint">拆成几段分别勾选</span>' + tipMark('把一件事拆成几个子项分别勾选；子项可以各自占用天数，逾期单独判定。') + '</label>' +
    '<div class="sub-edit" id="edSubs"></div>' +
    '<div class="sub-edit-foot">' +
    '<button class="chip-p" id="edSubAdd">＋ 添加子项</button>' +
    '<span class="hint" id="edSubSum"></span>' +
    '<button class="chip-p" id="edSubUseEst" style="display:none">用作预计时长</button>' +
    '</div>' +
    '<div class="chip-pick" style="margin-top:7px"><span class="hint" style="align-self:center;margin-right:2px">模板</span>' +
    SUB_TPLS.map(function (tp) {
      return '<button class="chip-p" data-subtpl="' + tp.k + '" style="border-style:dashed">' + tp.t + '</button>';
    }).join('') + '</div>' +
    '</div>' +
    '</section>' +

    '<section class="ed-sec">' +
    '<div class="ed-sec-t">优先级</div>' +
    '<div class="field"><label>优先级' + tipMark('P0 最高、P3 最低，只影响排序和左侧色条。') + '</label><div class="chip-pick" id="edPrio">' +
    ['P0', 'P1', 'P2', 'P3'].map(function (p) {
      return '<button class="chip-p' + (p === 'P0' ? ' red' : '') + (t.prio === p ? ' on' : '') + '" data-prio="' + p + '">' + p + ' · ' + PRIO_LABEL[p] + '</button>';
    }).join('') + '<button class="chip-p' + (!t.prio ? ' on' : '') + '" data-prio="">无</button></div></div>' +
    '<div class="field"><label>四象限' + tipMark('重要 × 紧急，只影响「四象限」视图的分组。') + '</label><div class="chip-pick">' +
    '<button class="chip-p' + (t.important ? ' on' : '') + '" data-imp="1">' + (t.important ? '✓ ' : '') + '重要</button>' +
    '<button class="chip-p' + (t.urgent ? ' on' : '') + '" data-urg="1">' + (t.urgent ? '✓ ' : '') + '紧急</button>' +
    '<span class="hint" style="align-self:center">' + quadName(t.important, t.urgent) + '</span></div></div>' +
    '</section>' +

    '<section class="ed-sec">' +
    '<div class="ed-sec-t">标签</div>' +
    '<div class="field"><label>标签<span class="hint">空格或回车分隔</span>' + tipMark('支持空格、回车、逗号分隔，可以一次粘贴多个标签。') + '</label>' +
    '<div class="chip-pick" id="edTagsWrap">' + tagsHtml() + '</div>' +
    '<div class="pick-row">' +
    '<input class="inp tag-inp" id="edTagInput" placeholder="输入后按空格或回车，可一次加多个">' +
    '<button type="button" class="inp pick-multi pick-compact" id="edTagPick">' +
    '<span>选已有</span><i class="pm-c"><b class="pm-n" id="edTagN"></b>' + svgIcon('chevD') + '</i></button>' +
    '</div></div>' +
    '</section>' +

    '<section class="ed-sec">' +
    '<div class="ed-sec-t">提醒</div>' +
    '<div class="field"><label>提醒方式' + tipMark('普通日程用「单次提醒」；需要复习记忆的内容用「艾宾浩斯」。') + '</label><div class="seg" id="edRemindMode">' +
    ['不提醒', '单次提醒', '艾宾浩斯'].map(function (m) {
      return '<button data-rmode="' + m + '" class="' + (t.remindMode === m ? 'on' : '') + '">' + m + '</button>';
    }).join('') + '</div></div>' +
    '<div id="edRemindBox"></div>' +
    '</section>' +
    '</div>' +
    '<div class="m-foot">' +
    (isNew ? '' : '<button class="btn btn-danger btn-sm" id="edDel">' + svgIcon('trash') + '删除</button>') +
    '<div class="spacer"></div>' +
    '<button class="btn btn-sec" id="edCancel">取消</button>' +
    '<button class="btn btn-pri" id="edSave">' + (isNew ? '添加任务' : '保存修改') + '</button>' +
    '</div></div>';

  var w = openModal(html, {
    onMount: function (root) {
      var subsDraft = (t.subs || []).map(function (x) {
        return { title: x.title, min: Number(x.min) || 0, days: Math.max(0, Number(x.days) || 0), done: !!x.done };
      });
      var subsBox = root.querySelector('#edSubs');
      var subsSum = root.querySelector('#edSubSum');
      var estInp = root.querySelector('#edEst');
      var spanWrap = root.querySelector('#edSpanWrap');
      var spanInp = root.querySelector('#edSpan');
      var spanChk = root.querySelector('#edSpanOn');
      // 日期 / 时间换成自研控件：原生弹层跟主题完全不搭，清空也麻烦
      var dateField = mountDateField(root.querySelector('#edDate'), {
        value: t.date || ymd(today0()),
        onChange: function () { syncPlan(); }
      });
      var timeField = mountTimeField(root.querySelector('#edTime'), {
        value: t.time || '',
        onChange: function () { syncPlan(); }
      });
      // 「持续」是个开关：不勾就是当天的日程，勾了才管天数（子项的「天」列同理）
      var spanOn = !!(spanChk && spanChk.checked);
      // 预计时长内部一律按分钟存，输入框按当前单位显示（整小时才用小时）
      var estMin = Math.max(0, Number(t.estimate) || 0);
      var estUnit = (estMin > 0 && estMin % 60 === 0) ? 'hour' : 'min';
      function estNum(v) { return String(Math.round(v * 100) / 100); }
      function paintEst() {
        if (!estInp) return;
        estInp.value = estMin ? (estUnit === 'hour' ? estNum(estMin / 60) : String(estMin)) : '';
        estInp.step = estUnit === 'hour' ? '0.5' : '5';
        estInp.placeholder = '留空＝全天';
        Array.prototype.forEach.call(root.querySelectorAll('[data-estunit]'), function (b) {
          b.className = b.getAttribute('data-estunit') === estUnit ? 'on' : '';
        });
      }
      function readEst() {
        var v = parseFloat(estInp ? estInp.value : '');
        estMin = (!v || v <= 0) ? 0 : Math.round(estUnit === 'hour' ? v * 60 : v);
        return estMin;
      }
      function setEstMin(v) {
        estMin = Math.max(0, Math.round(Number(v) || 0));
        // 程序填入的数值换成能整除的单位，免得出现 0.83 小时这种数
        if (estMin && estMin % 60 !== 0) estUnit = 'min';
        paintEst();
      }
      function syncSpanUI() {
        if (spanWrap) spanWrap.className = 'span-toggle' + (spanOn ? ' on' : '');
        if (spanInp) spanInp.disabled = !spanOn;
        if (subsBox) subsBox.className = 'sub-edit' + (spanOn ? ' has-span' : '');
        var sh = root.querySelector('#edSubHint');
        if (sh) sh.textContent = spanOn ? '拆成几段分别勾选；填「天」会自动按顺序排进日期' : '拆成几段分别勾选';
      }
      function subsTotal() {
        return subsDraft.reduce(function (a, x) { return a + (Number(x.min) || 0); }, 0);
      }
      function subsDays() {
        if (!spanOn) return 0;
        return subsDraft.reduce(function (a, x) { return a + (Number(x.days) || 0); }, 0);
      }
      // 跨度提示：把「开始日 + 持续 / 子项天数」算成一句人话
      function syncPlan() {
        var hint = root.querySelector('#edSpanHint');
        if (!hint) return;
        var dv = (root.querySelector('#edDate') || {}).value || '';
        var sv = spanOn ? Math.max(1, parseInt(spanInp ? spanInp.value : '', 10) || 1) : 1;
        var pd = subsDays();
        var span = Math.max(1, Math.max(sv, pd));
        if (!dv) {
          hint.className = 'span-hint' + (pd ? ' warn' : '');
          hint.innerHTML = pd ? svgIcon('alert') + '子项排了 ' + pd + ' 天，但还没选开始日期' : '';
          return;
        }
        var st = parseYmd(dv), en = addDays(st, span - 1);
        var segs = spanOn ? subsDraft.filter(function (x) { return (Number(x.days) || 0) > 0; }).length : 0;
        hint.className = 'span-hint' + (span > 1 ? ' on' : '');
        hint.innerHTML = '占 <b>' + span + '</b> 天：' + fmtRange(st, en) +
          (segs ? ' · ' + segs + ' 个阶段' : '') +
          (pd && pd > sv ? '（按子项合计）' : '');
      }
      function syncSubSum() {
        var n = subsDraft.filter(function (x) { return String(x.title || '').trim(); }).length;
        var sm = subsTotal();
        var pdSum = subsDays();
        if (subsSum) subsSum.innerHTML = n
          ? '共 <b>' + n + '</b> 项' + (sm ? ' · 合计 <b>' + durText(sm) + '</b>' : '') +
            (pdSum ? ' · 排期 <b>' + pdSum + ' 天</b>' : '')
          : '还没添加子项';
        var ub = root.querySelector('#edSubUseEst');
        var hint = root.querySelector('#edEstHint');
        var ev = readEst();
        var diff = sm > 0 && ev !== sm;
        if (ub) {
          ub.style.display = diff ? '' : 'none';
          ub.className = 'chip-p' + (diff ? ' on' : '');
          ub.textContent = '同步为 ' + durText(sm);
        }
        if (hint) {
          hint.className = 'est-hint' + (diff ? ' show' : '');
          hint.innerHTML = diff
            ? svgIcon('alert') + '子项合计 ' + durText(sm) + (ev ? '，与预计 ' + durText(ev) + '不一致' : '，还没填预计时长')
            : '';
        }
        syncPlan();
      }
      function renderSubs() {
        if (!subsBox) return;
        subsBox.innerHTML = subsDraft.map(function (x, i) {
          return '<div class="sub-edit-row">' +
            '<input class="inp sub-name" data-subt="' + i + '" value="' + esc(x.title) + '" placeholder="子项名称，如 调研">' +
            '<input class="inp sub-minin" type="number" min="0" step="5" data-subm="' + i + '" value="' + (x.min || '') + '" placeholder="分钟">' +
            '<input class="inp sub-dayin" type="number" min="0" max="365" step="1" data-subd="' + i + '" value="' + (x.days || '') + '" placeholder="天">' +
            '<button class="sub-del" data-subdel="' + i + '" title="删除这个子项">' + svgIcon('close') + '</button>' +
            '</div>';
        }).join('');
        Array.prototype.forEach.call(subsBox.querySelectorAll('[data-subt]'), function (inp) {
          inp.addEventListener('input', function () {
            var i = parseInt(inp.getAttribute('data-subt'), 10);
            if (subsDraft[i]) subsDraft[i].title = inp.value;
            syncSubSum();
          });
        });
        Array.prototype.forEach.call(subsBox.querySelectorAll('[data-subm]'), function (inp) {
          inp.addEventListener('input', function () {
            var i = parseInt(inp.getAttribute('data-subm'), 10);
            if (subsDraft[i]) subsDraft[i].min = Math.max(0, parseInt(inp.value, 10) || 0);
            syncSubSum();
          });
        });
        Array.prototype.forEach.call(subsBox.querySelectorAll('[data-subd]'), function (inp) {
          inp.addEventListener('input', function () {
            var i = parseInt(inp.getAttribute('data-subd'), 10);
            if (subsDraft[i]) subsDraft[i].days = Math.max(0, parseInt(inp.value, 10) || 0);
            syncSubSum();
          });
        });
        Array.prototype.forEach.call(subsBox.querySelectorAll('[data-subdel]'), function (b) {
          b.addEventListener('click', function () {
            var i = parseInt(b.getAttribute('data-subdel'), 10);
            subsDraft.splice(i, 1);
            renderSubs();
            syncSubSum();
          });
        });
        syncSubSum();
      }
      // 先把时长按单位画出来，再由 renderSubs 里的 syncSubSum 读回去，免得重复换算
      paintEst();
      syncSpanUI();
      renderSubs();
      if (spanChk) spanChk.addEventListener('change', function () {
        spanOn = !!spanChk.checked;
        if (spanOn) {
          if (spanInp && !(parseInt(spanInp.value, 10) > 1)) spanInp.value = '2';
        } else if (spanInp) {
          spanInp.value = '';
        }
        syncSpanUI();
        syncSubSum();
        if (spanOn && spanInp) { try { spanInp.focus(); } catch (e) { } }
      });
      // 整颗胶囊都可以点，点数字框本身不切换
      if (spanWrap) spanWrap.addEventListener('click', function (e) {
        if (e.target === spanChk || e.target === spanInp) return;
        spanChk.checked = !spanChk.checked;
        spanChk.dispatchEvent(new Event('change', { bubbles: true }));
      });
      if (spanInp) spanInp.addEventListener('input', syncPlan);
      syncPlan();
      var addSubBtn = root.querySelector('#edSubAdd');
      if (addSubBtn) addSubBtn.addEventListener('click', function () {
        subsDraft.push({ title: '', min: 0, days: 0, done: false });
        renderSubs();
        var inputs = subsBox.querySelectorAll('[data-subt]');
        var last = inputs[inputs.length - 1];
        if (last) last.focus();
      });
      var useEstBtn = root.querySelector('#edSubUseEst');
      if (useEstBtn) useEstBtn.addEventListener('click', function () {
        setEstMin(subsTotal());
        syncSubSum();
      });
      if (estInp) estInp.addEventListener('input', syncSubSum);
      // 分钟 / 小时单选：换单位时把已填的数换算过去，底层一直是分钟
      Array.prototype.forEach.call(root.querySelectorAll('[data-estunit]'), function (b) {
        b.addEventListener('click', function () {
          readEst();
          estUnit = b.getAttribute('data-estunit');
          paintEst();
          syncSubSum();
        });
      });
      Array.prototype.forEach.call(root.querySelectorAll('[data-subtpl]'), function (b) {
        b.addEventListener('click', function () {
          var tp = SUB_TPLS.filter(function (x) { return x.k === b.getAttribute('data-subtpl'); })[0];
          if (!tp) return;
          var exists = {};
          subsDraft.forEach(function (x) { exists[String(x.title || '').trim()] = true; });
          var added = 0;
          tp.items.forEach(function (it) {
            if (exists[it[0]]) return;
            subsDraft.push({ title: it[0], min: it[1], days: 0, done: false });
            exists[it[0]] = true;
            added++;
          });
          // 去掉开头的空行
          subsDraft = subsDraft.filter(function (x, i) {
            return !(i === 0 && !String(x.title || '').trim() && subsDraft.length > 1);
          });
          renderSubs();
          if (added) toast('已加入 ' + added + ' 个子项');
        });
      });
      var state = {
        repeat: t.repeat || '不重复',
        prio: t.prio, important: t.important, urgent: t.urgent,
        remindMode: t.remindMode || '不提醒', offsets: ebOffsets,
        onceOffset: (t.remindCfg && t.remindCfg.offsets && t.remindCfg.offsets.length) ? t.remindCfg.offsets[0] : -10
      };
      function renderRemindBox() {
        var box = root.querySelector('#edRemindBox');
        if (!box) return;
        if (state.remindMode === '不提醒') { box.innerHTML = ''; return; }
        if (state.remindMode === '单次提醒') {
          var opts = [{ v: 0, t: '准时' }, { v: -5, t: '提前 5 分钟' }, { v: -10, t: '提前 10 分钟' }, { v: -15, t: '提前 15 分钟' },
          { v: -30, t: '提前 30 分钟' }, { v: -60, t: '提前 1 小时' }, { v: -1440, t: '提前 1 天' }];
          box.innerHTML = '<div class="field"><label>提醒时机</label><div class="chip-pick">' +
            opts.map(function (o) {
              return '<button class="chip-p' + (state.onceOffset === o.v ? ' on' : '') + '" data-once="' + o.v + '">' + o.t + '</button>';
            }).join('') + '</div></div>';
          Array.prototype.forEach.call(box.querySelectorAll('[data-once]'), function (b) {
            b.addEventListener('click', function () { state.onceOffset = parseInt(b.getAttribute('data-once'), 10); renderRemindBox(); });
          });
          return;
        }
        box.innerHTML = '<div class="field"><label>复习时间点<span class="hint">按艾宾浩斯遗忘曲线，点选要提醒的节点</span></label>' +
          '<div class="chip-pick">' +
          EB_OFFSETS.map(function (off, i) {
            return '<button class="chip-p' + (state.offsets.indexOf(off) > -1 ? ' on' : '') + '" data-eb="' + off + '">' + EB_LABEL[i] + '</button>';
          }).join('') + '</div></div>' +
          '<div class="field"><label>基准时间<span class="hint">第一个提醒从这个时间开始计算</span></label>' +
          '<input class="inp" type="datetime-local" id="edAnchor" value="' + esc(anchorVal) + '"></div>' +
          '<div style="font-size:11.5px;color:var(--text-3);line-height:1.6">已选 <b>' + state.offsets.length + '</b> 个提醒节点，' +
          '总共跨 ' + ebSpan(state.offsets) + '。到点会发系统通知（常驻到手动关闭），同时进入顶部铃铛与「今天要处理」。</div>';
        Array.prototype.forEach.call(box.querySelectorAll('[data-eb]'), function (b) {
          b.addEventListener('click', function () {
            var off = parseInt(b.getAttribute('data-eb'), 10);
            var i = state.offsets.indexOf(off);
            if (i > -1) state.offsets.splice(i, 1); else state.offsets.push(off);
            state.offsets.sort(function (x, y) { return x - y; });
            renderRemindBox();
          });
        });
      }
      renderRemindBox();

      Array.prototype.forEach.call(root.querySelectorAll('[data-repeat]'), function (b) {
        b.addEventListener('click', function () {
          state.repeat = b.getAttribute('data-repeat');
          Array.prototype.forEach.call(root.querySelectorAll('[data-repeat]'), function (x) { x.className = 'chip-p'; });
          b.className = 'chip-p on';
        });
      });
      Array.prototype.forEach.call(root.querySelectorAll('[data-prio]'), function (b) {
        b.addEventListener('click', function () {
          state.prio = b.getAttribute('data-prio');
          Array.prototype.forEach.call(root.querySelectorAll('[data-prio]'), function (x) { x.className = 'chip-p' + (x.getAttribute('data-prio') === 'P0' ? ' red' : ''); });
          b.className = 'chip-p' + (state.prio === 'P0' ? ' red on' : ' on');
        });
      });
      Array.prototype.forEach.call(root.querySelectorAll('[data-imp]'), function (b) {
        b.addEventListener('click', function () {
          state.important = !state.important;
          b.className = 'chip-p' + (state.important ? ' on' : '');
          b.textContent = (state.important ? '✓ ' : '') + '重要';
          var hint = root.querySelector('[data-imp]').parentNode.querySelector('.hint');
          if (hint) hint.textContent = quadName(state.important, state.urgent);
        });
      });
      Array.prototype.forEach.call(root.querySelectorAll('[data-urg]'), function (b) {
        b.addEventListener('click', function () {
          state.urgent = !state.urgent;
          b.className = 'chip-p' + (state.urgent ? ' on' : '');
          b.textContent = (state.urgent ? '✓ ' : '') + '紧急';
          var hint = root.querySelector('[data-urg]').parentNode.querySelector('.hint');
          if (hint) hint.textContent = quadName(state.important, state.urgent);
        });
      });
      Array.prototype.forEach.call(root.querySelectorAll('[data-rmode]'), function (b) {
        b.addEventListener('click', function () {
          state.remindMode = b.getAttribute('data-rmode');
          Array.prototype.forEach.call(root.querySelectorAll('[data-rmode]'), function (x) { x.className = ''; });
          b.className = 'on';
          renderRemindBox();
        });
      });
      function rebindTags() {
        var wrap = root.querySelector('#edTagsWrap');
        if (!wrap) return;
        wrap.innerHTML = tagsHtml();
        Array.prototype.forEach.call(wrap.querySelectorAll('[data-tagrm]'), function (b) {
          b.addEventListener('click', function () {
            tags.splice(parseInt(b.getAttribute('data-tagrm'), 10), 1);
            rebindTags();
          });
        });
        syncTagBadge();
        paintPickMenu();
      }
      var listNewBtn = root.querySelector('[data-picklist="__new"]');
      if (listNewBtn) listNewBtn.addEventListener('click', function () {
        var inp = root.querySelector('#edList');
        if (!inp) return;
        inp.value = '';
        inp.placeholder = '输入新清单名称';
        inp.focus();
      });
      rebindTags();
      var tagInput = root.querySelector('#edTagInput');
      if (tagInput) mountTagInput(tagInput, {
        onAdd: function (v) {
          if (tags.indexOf(v) > -1) return false;
          tags.push(v);
          rebindTags();
          return true;
        },
        onBackspace: function () {
          if (!tags.length) return;
          tags.pop();
          rebindTags();
        }
      });
      /* ---- 「选已有」浮层：清单单选、标签多选共用一套壳和样式 ---- */
      var listPickBtn = root.querySelector('#edListPick');
      var tagPickBtn = root.querySelector('#edTagPick');
      var pickEl = null;
      var pickBtn = null;
      var pickMode = 'single';
      var pickBody = root.querySelector('.m-body');
      // 标签候选 = 全站已有标签 + 本次已选（可能刚手输进来）
      function tagsPool() {
        var pool = allTags().slice();
        tags.forEach(function (g) { if (pool.indexOf(g) === -1) pool.push(g); });
        return pool;
      }
      function syncTagBadge() {
        var n = root.querySelector('#edTagN');
        if (n) n.textContent = tags.length ? String(tags.length) : '';
      }
      function pickItems() {
        if (pickMode === 'multi') {
          return tagsPool().map(function (g) {
            return { v: g, label: '#' + g, on: tags.indexOf(g) > -1 };
          });
        }
        var inp = root.querySelector('#edList');
        var cur = (inp && inp.value ? inp.value : '收集箱');
        var names = allLists().slice();
        if (cur && names.indexOf(cur) === -1) names.push(cur);
        return names.map(function (n) { return { v: n, label: n, on: n === cur }; });
      }
      function paintPickMenu() {
        if (!pickEl) return;
        var items = pickItems();
        if (!items.length) {
          pickEl.innerHTML = '<div class="pick-menu-empty">' + (pickMode === 'multi'
            ? '还没有已有标签。<br>在左边输入框写名字回车，就建一个新的。'
            : '还没有清单。点右边的「＋ 新建清单」建一个。') + '</div>';
          return;
        }
        pickEl.innerHTML = items.map(function (it) {
          return '<button type="button" class="pick-opt' + (it.on ? ' on' : '') +
            '" data-pickv="' + esc(it.v) + '">' +
            '<i class="pick-box">' + (it.on && pickMode === 'multi' ? '✓' : '') + '</i>' +
            '<span>' + esc(it.label) + '</span></button>';
        }).join('');
        Array.prototype.forEach.call(pickEl.querySelectorAll('[data-pickv]'), function (b) {
          b.addEventListener('click', function () {
            var v = b.getAttribute('data-pickv');
            if (pickMode === 'multi') {
              var i = tags.indexOf(v);
              if (i > -1) tags.splice(i, 1); else tags.push(v);
              rebindTags();
              paintPickMenu();
              return;
            }
            var inp = root.querySelector('#edList');
            if (inp) { inp.value = v; inp.placeholder = '收集箱'; }
            closePickMenu();
          });
        });
      }
      function closePickMenu() {
        if (pickEl && pickEl.parentNode) pickEl.parentNode.removeChild(pickEl);
        pickEl = null;
        if (pickBtn) pickBtn.className = 'inp pick-multi';
        pickBtn = null;
        document.removeEventListener('mousedown', onPickDocDown, true);
        if (pickBody) pickBody.removeEventListener('scroll', closePickMenu, true);
        window.removeEventListener('resize', closePickMenu);
      }
      function onPickDocDown(e) {
        if (!pickEl) return;
        if (pickEl.contains(e.target)) return;
        if (pickBtn && pickBtn.contains(e.target)) return;
        closePickMenu();
      }
      function openPickMenu(btn, mode) {
        if (!btn) return;
        var same = !!pickEl && pickBtn === btn;
        if (pickEl) closePickMenu();
        if (same) return;
        pickBtn = btn;
        pickMode = mode;
        var r = btn.getBoundingClientRect();
        pickEl = document.createElement('div');
        pickEl.className = 'pick-menu ' + mode;
        document.body.appendChild(pickEl);
        paintPickMenu();
        // 标签是多选，面板按内容收窄；清单是单选，跟输入框同宽
        var mw = mode === 'multi'
          ? Math.min(260, Math.max(r.width || 0, 180))
          : Math.max(r.width || 0, 190);
        pickEl.style.width = mw + 'px';
        floatPanel(pickEl, r, { minWidth: mw, gap: 5 });
        btn.className = 'inp pick-multi open';
        setTimeout(function () { document.addEventListener('mousedown', onPickDocDown, true); }, 0);
        if (pickBody) pickBody.addEventListener('scroll', closePickMenu, true);
        window.addEventListener('resize', closePickMenu);
      }
      if (listPickBtn) listPickBtn.addEventListener('click', function () {
        openPickMenu(listPickBtn, 'single');
      });
      if (tagPickBtn) tagPickBtn.addEventListener('click', function () {
        openPickMenu(tagPickBtn, 'multi');
      });
      root.querySelector('#edCancel').addEventListener('click', closeModal);
      var backBtn = root.querySelector('#edBack');
      if (backBtn) backBtn.addEventListener('click', function () {
        closeModal();
        setTimeout(function () { openTaskDetail(t.id); }, 200);
      });
      var delBtn = root.querySelector('#edDel');
      if (delBtn) delBtn.addEventListener('click', function () {
        confirmModal('删除任务', '确定删除这条任务？', '删除', function () {
          S.tasks = S.tasks.filter(function (x) { return x.id !== t.id; });
          cacheLocal(); refreshAll(); apiDeleteTask(t.id); toast('已删除');
        }, true);
      });
      // 用已有日程填充：只带结构（清单 / 标签 / 时长 / 子项 / 提醒），日期时间保持当前值
      var tplBtn = root.querySelector('#edTpl');
      if (tplBtn) tplBtn.addEventListener('click', function () {
        openTaskTemplatePicker(function (src) {
          root.querySelector('#edTitle').value = src.title || '';
          root.querySelector('#edNote').value = src.note || '';
          root.querySelector('#edList').value = src.list || '收集箱';
          setEstMin(src.estimate || 0);
          subsDraft = (src.subs || []).map(function (x) {
            return { title: x.title, min: Number(x.min) || 0, days: Math.max(0, Number(x.days) || 0), done: false };
          });
          // 跨度也属于结构：模板占 5 天，新日程就从当前日期起占 5 天
          if (Number(src.span) > 1) {
            spanOn = true;
            if (spanChk) spanChk.checked = true;
            if (spanInp) spanInp.value = String(src.span);
          } else {
            spanOn = false;
            if (spanChk) spanChk.checked = false;
            if (spanInp) spanInp.value = '';
          }
          syncSpanUI();
          renderSubs();
          tags = (src.tags || []).slice();
          rebindTags();
          // 这些控件是「点一下改一个 state」的实现，直接点对应按钮复用同一套逻辑
          function pick(sel, want) {
            var el = root.querySelector(sel);
            if (el) el.click();
          }
          if (src.prio) pick('[data-prio="' + src.prio + '"]');
          if (src.important && !state.important) pick('[data-imp]');
          if (src.urgent && !state.urgent) pick('[data-urg]');
          if (src.repeat) pick('[data-repeat="' + src.repeat + '"]');
          if (src.remindMode) pick('[data-rmode="' + src.remindMode + '"]');
          if (src.remindCfg && src.remindCfg.offsets && src.remindCfg.offsets.length) {
            state.offsets = src.remindCfg.offsets.slice();
            state.onceOffset = src.remindCfg.offsets[0];
            renderRemindBox();
          }
          toast('已套用「' + src.title + '」，日期时间保持不变');
        });
      });
      root.querySelector('#edSave').addEventListener('click', function (e) {
        var btn = e.currentTarget;
        var title = (root.querySelector('#edTitle').value || '').trim();
        if (!title) { toast('先写一个任务标题'); return; }
        var dateV = root.querySelector('#edDate').value;
        var timeV = root.querySelector('#edTime').value;
        var estV = readEst();
        var anchorEl = root.querySelector('#edAnchor');
        var anchor = anchorEl ? anchorEl.value : '';
        var cfg = null;
        if (state.remindMode !== '不提醒' && !dateV) { toast('提醒需要先选开始日期'); return; }
        if (state.remindMode === '艾宾浩斯') {
          if (!state.offsets.length) { toast('至少选一个复习节点'); return; }
          cfg = { anchor: fromDtLocal(anchor || (dateV + 'T' + (timeV || '09:00'))), offsets: state.offsets.slice(), read: [] };
        } else if (state.remindMode === '单次提醒') {
          cfg = { anchor: fromDtLocal(dateV + 'T' + (timeV || '09:00')), offsets: [state.onceOffset], read: [] };
        }
        t.title = title;
        t.note = (root.querySelector('#edNote').value || '').trim();
        t.list = (root.querySelector('#edList').value || '').trim() || '收集箱';
        if (listNames.indexOf(t.list) === -1) addCustomList(t.list);
        t.prio = state.prio;
        t.important = state.important;
        t.urgent = state.urgent;
        t.tags = tags.slice();
        tags.forEach(function (g) { if (allTagList.indexOf(g) === -1) addCustomTag(g); });
        t.date = dateV;
        t.time = timeV;
        t.repeat = (state.repeat === '不重复') ? '' : state.repeat;
        var cleanSubs = subsDraft.map(function (x) {
          return {
            id: '', title: String(x.title || '').trim(), min: Number(x.min) || 0,
            days: spanOn ? Math.max(0, Number(x.days) || 0) : 0, done: !!x.done
          };
        }).filter(function (x) { return !!x.title; });
        t.subs = cleanSubs;
        // 总跨度：手填的「持续」和子项天数合计取大的那个，
        // 这样「安排 5 天但整件事占 7 天」也能表达；没勾「多天」就只占开始日一天
        var spanV = spanOn ? Math.max(1, parseInt(spanInp ? spanInp.value : '', 10) || 1) : 1;
        var planSum = cleanSubs.reduce(function (a, x) { return a + (x.days || 0); }, 0);
        t.span = Math.max(1, Math.min(365, Math.max(spanV, planSum)));
        if ((isNaN(estV) || estV <= 0) && cleanSubs.length) {
          var sumSub = cleanSubs.reduce(function (a, x) { return a + x.min; }, 0);
          if (sumSub > 0) estV = sumSub;
        }
        t.estimate = isNaN(estV) ? 0 : Math.max(0, estV);
        t.remindMode = state.remindMode;
        t.remindCfg = cfg;
        if (!t.createdAt) t.createdAt = ymd(today0());
        btn.disabled = true;
        if (!t.id) {
          var nt = t;
          nt.id = uid();
          S.tasks.push(nt);
          cacheLocal();
          closeModal();
          refreshAll();
          apiAddTask(nt).then(function () {
            cacheLocal(); refreshAll();
            toast('任务已添加');
          });
        } else {
          cacheLocal();
          var backId = t.id;
          closeModal();
          refreshAll();
          if (fromDetail) setTimeout(function () { openTaskDetail(backId); }, 200);
          apiUpdateTask(t).then(function () { cacheLocal(); refreshAll(); });
          toast('已保存');
        }
      });
    }
  });
  return w;
}
/* ---------- 以已有日程为模板 ---------- */
function openTaskTemplatePicker(onPick) {
  var pool = S.tasks.filter(function (t) { return String(t.title || '').trim(); });
  pool.sort(function (a, b) {
    var ad = a.date || '', bd = b.date || '';
    if (ad !== bd) return ad < bd ? 1 : -1;
    return (Number(b.sort) || 0) - (Number(a.sort) || 0);
  });

  function metaOf(t) {
    var m = [];
    if (t.date) m.push(shortDate(parseYmd(t.date)) + (t.time ? ' ' + t.time : ' · 全天'));
    if (t.estimate) m.push(durText(t.estimate));
    if (t.list && t.list !== '收集箱') m.push(t.list);
    (t.tags || []).slice(0, 2).forEach(function (g) { m.push('#' + g); });
    return m.join(' · ');
  }
  function rowsHtml(kw) {
    var list = pool.filter(function (t) {
      if (!kw) return true;
      var hay = (t.title + ' ' + (t.tags || []).join(' ') + ' ' + (t.list || '')).toLowerCase();
      return hay.indexOf(kw) > -1;
    }).slice(0, 40);
    if (!list.length) {
      return '<div class="tpl-empty">没有匹配的日程。<br>换个关键词，或先正常建一条再回来套用。</div>';
    }
    return list.map(function (t) {
      return '<button type="button" class="tpl-row" data-tpl="' + esc(t.id) + '">' +
        '<span class="tpl-t">' + esc(t.title) + '</span>' +
        '<span class="tpl-m">' + esc(metaOf(t)) + '</span>' +
        ((t.subs && t.subs.length) ? '<span class="tpl-n">' + t.subs.length + ' 个子项</span>' : '') +
        '</button>';
    }).join('');
  }

  openModal('<div class="modal mid">' +
    '<div class="m-head"><h3>用已有日程填充</h3><button class="m-close">' + svgIcon('close') + '</button></div>' +
    '<div class="m-body">' +
    '<div class="hint" style="font-size:12px;color:var(--text-3);line-height:1.7">' +
    '只带结构：清单、标签、优先级、预计时长、子项和提醒方式。日期与开始时间仍用当前填的。</div>' +
    '<input class="inp" id="tplKw" placeholder="搜标题、标签或清单">' +
    '<div class="tpl-list" id="tplList">' + rowsHtml('') + '</div>' +
    '</div>' +
    '<div class="m-foot"><div class="spacer"></div><button class="btn btn-sec" id="tplCancel">取消</button></div></div>', {
    onMount: function (root) {
      var listEl = root.querySelector('#tplList');
      var kwEl = root.querySelector('#tplKw');
      kwEl.addEventListener('input', function () {
        listEl.innerHTML = rowsHtml(String(kwEl.value || '').trim().toLowerCase());
      });
      listEl.addEventListener('click', function (e) {
        var b = e.target.closest('[data-tpl]');
        if (!b) return;
        var src = findTask(b.getAttribute('data-tpl'));
        if (!src) return;
        closeModal();
        if (onPick) onPick(src);
      });
      root.querySelector('#tplCancel').addEventListener('click', closeModal);
      setTimeout(function () { try { kwEl.focus(); } catch (e) { } }, 120);
    }
  });
}
function quadName(imp, urg) {
  if (imp && urg) return '· 重要且紧急';
  if (imp) return '· 重要不紧急';
  if (urg) return '· 紧急不重要';
  return '· 不重要不紧急';
}
function ebSpan(offsets) {
  if (!offsets.length) return '0 分钟';
  var max = Math.max.apply(null, offsets);
  if (max < 60) return max + ' 分钟';
  if (max < 1440) return Math.round(max / 60) + ' 小时';
  return Math.round(max / 1440) + ' 天';
}
function toDtLocal(s) {
  var m = String(s || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (!m) return '';
  return m[1] + '-' + pad2(parseInt(m[2], 10)) + '-' + pad2(parseInt(m[3], 10)) + 'T' + pad2(m[4] ? parseInt(m[4], 10) : 9) + ':' + (m[5] || '00');
}
function fromDtLocal(v) {
  if (!v) return '';
  return v.replace('T', ' ');
}

/* ---------- 快速添加（智能识别日期时间） ---------- */
function parseQuick(raw) {
  var text = String(raw || '').trim();
  var out = { title: '', date: '', time: '', tags: [], prio: '' };
  if (!text) return out;
  var t0 = today0();
  var rest = text;

  // 优先级 !p0 / !0
  var pm = rest.match(/!\s*(p?[0-3])/i);
  if (pm) {
    out.prio = 'P' + pm[1].replace(/[pP]/, '');
    rest = rest.replace(pm[0], ' ');
  }
  // 标签 #xxx
  rest = rest.replace(/#([^\s#，,。]+)/g, function (m, g) { out.tags.push(g); return ' '; });

  // 日期
  var dateFound = '';
  var dm = rest.match(/(\d{4})[-\/年](\d{1,2})[-\/月](\d{1,2})[日号]?/);
  if (dm) {
    dateFound = dm[1] + '-' + pad2(parseInt(dm[2], 10)) + '-' + pad2(parseInt(dm[3], 10));
    rest = rest.replace(dm[0], ' ');
  }
  if (!dateFound) {
    dm = rest.match(/(\d{1,2})月(\d{1,2})[日号]/);
    if (dm) {
      var y = t0.getFullYear();
      var cand = new Date(y, parseInt(dm[1], 10) - 1, parseInt(dm[2], 10));
      if (dayDiff(t0, cand) < -180) cand = new Date(y + 1, parseInt(dm[1], 10) - 1, parseInt(dm[2], 10));
      dateFound = ymd(cand);
      rest = rest.replace(dm[0], ' ');
    }
  }
  if (!dateFound) {
    dm = rest.match(/(\d{1,2})[\/\-](\d{1,2})(?!\d)/);
    if (dm) {
      var hit = rest.indexOf(dm[0]);
      var prevCh = hit > 0 ? rest.charAt(hit - 1) : '';
      var mm = parseInt(dm[1], 10), dd = parseInt(dm[2], 10);
      if (!/\d/.test(prevCh) && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        var cand2 = new Date(t0.getFullYear(), mm - 1, dd);
        if (dayDiff(t0, cand2) < -180) cand2 = new Date(t0.getFullYear() + 1, mm - 1, dd);
        dateFound = ymd(cand2);
        rest = rest.replace(dm[0], ' ');
      }
    }
  }
  if (!dateFound) {
    dm = rest.match(/(\d{1,2})\s*天[后後]/);
    if (dm) { dateFound = ymd(addDays(t0, parseInt(dm[1], 10))); rest = rest.replace(dm[0], ' '); }
  }
  if (!dateFound) {
    dm = rest.match(/(\d{1,2})\s*(?:周|个?星期)[后後]/);
    if (dm) { dateFound = ymd(addDays(t0, parseInt(dm[1], 10) * 7)); rest = rest.replace(dm[0], ' '); }
  }
  if (!dateFound) {
    var rel = [['大后天', 3], ['后天', 2], ['明天', 1], ['明日', 1], ['今天', 0], ['今日', 0], ['昨天', -1]];
    for (var ri = 0; ri < rel.length; ri++) {
      if (rest.indexOf(rel[ri][0]) > -1) {
        dateFound = ymd(addDays(t0, rel[ri][1]));
        rest = rest.replace(rel[ri][0], ' ');
        break;
      }
    }
  }
  if (!dateFound) {
    var wm = rest.match(/(下下|下|这|本)?\s*(?:周|星期)([一二三四五六日天])/);
    if (wm) {
      var wmap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 };
      var targetDow = wmap[wm[2]];
      var dowOffset = targetDow === 0 ? 6 : targetDow - 1;
      var monday = startOfWeek(t0);
      var base = monday;
      if (wm[1] === '下') base = addDays(monday, 7);
      else if (wm[1] === '下下') base = addDays(monday, 14);
      var candW = addDays(base, dowOffset);
      if (!wm[1] && dayDiff(t0, candW) < 0) candW = addDays(candW, 7);
      dateFound = ymd(candW);
      rest = rest.replace(wm[0], ' ');
    }
  }
  out.date = dateFound || ymd(t0);

  // 时间
  var timeFound = '';
  var tm = rest.match(/(凌晨|早上|上午|中午|下午|傍晚|晚上|夜里)?\s*(\d{1,2})\s*[:：]\s*(\d{2})/);
  if (tm) {
    var hh = parseInt(tm[2], 10);
    var mi = parseInt(tm[3], 10);
    if (tm[1]) hh = applyAmPm(hh, tm[1]);
    if (hh >= 0 && hh < 24 && mi < 60) timeFound = pad2(hh) + ':' + pad2(mi);
    rest = rest.replace(tm[0], ' ');
  }
  if (!timeFound) {
    tm = rest.match(/(凌晨|早上|上午|中午|下午|傍晚|晚上|夜里)?\s*(\d{1,2})\s*[点時时](半|\d{1,2})?/);
    if (tm) {
      var hh2 = parseInt(tm[2], 10);
      var mi2 = 0;
      if (tm[3] === '半') mi2 = 30;
      else if (tm[3]) mi2 = parseInt(tm[3], 10);
      if (tm[1]) hh2 = applyAmPm(hh2, tm[1]);
      if (hh2 >= 0 && hh2 < 24 && mi2 < 60) timeFound = pad2(hh2) + ':' + pad2(mi2);
      rest = rest.replace(tm[0], ' ');
    }
  }
  out.time = timeFound;

  out.title = rest.replace(/\s+/g, ' ').replace(/^[\s,，。、]+|[\s,，。、]+$/g, '').trim();
  if (!out.title) out.title = '新任务';
  return out;
}
function applyAmPm(h, kw) {
  if (kw === '下午' || kw === '傍晚' || kw === '晚上') return h < 12 ? h + 12 : h;
  if (kw === '中午') return h < 11 ? h + 12 : h;
  if (kw === '凌晨') return h === 12 ? 0 : h;
  return h;
}
function openQuickAdd(initial) {
  var html = '<div class="modal">' +
    '<div class="m-head"><h3>添加日程</h3><button class="m-close">' + svgIcon('close') + '</button></div>' +
    '<div class="m-body">' +
    '<div class="field"><input class="inp" id="qaInput" autofocus placeholder="例：明天下午 3 点开会 #工作 !p1" value="' + esc(initial || readDraft()) + '" style="height:46px;font-size:16px"></div>' +
    '<div id="qaPreview" style="min-height:52px;background:var(--panel-2);border:1px solid var(--line);border-radius:10px;padding:10px 12px"></div>' +
    '<div style="font-size:11.5px;color:var(--text-3);line-height:1.8">' +
    '支持识别：今天 / 明天 / 后天 / 周五 / 下周一 / 10月26日 / 10/26 / 3天后 · 下午 3 点 / 15:30 / 晚上 8 点<br>' +
    '用 <b>#标签</b> 打标签，<b>!p0</b> ~ <b>!p3</b> 设优先级</div>' +
    '</div>' +
    '<div class="m-foot"><div class="spacer"></div>' +
    '<button class="btn btn-sec" id="qaMore">更多选项</button>' +
    '<button class="btn btn-pri" id="qaSave">添加</button></div></div>';
  openModal(html, {
    onMount: function (root) {
      var input = root.querySelector('#qaInput');
      var prev = root.querySelector('#qaPreview');
      function updatePreview() {
        saveDraft(input.value);
        var r = parseQuick(input.value);
        if (!input.value.trim()) { prev.innerHTML = '<span style="font-size:12px;color:var(--text-3)">输入任务内容，这里会实时显示识别结果</span>'; return; }
        prev.innerHTML = '<div style="font-size:13px;font-weight:600;color:var(--text)">' + esc(r.title) + '</div>' +
          '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:5px;font-size:11.5px;color:var(--text-2)">' +
          '<span>' + svgIcon('calendar') + ' ' + esc(dateLabel(parseYmd(r.date))) + ' ' + r.date + '</span>' +
          (r.time ? '<span>' + svgIcon('clock') + ' ' + r.time + '</span>' : '<span style="color:var(--text-3)">未设时间</span>') +
          (r.prio ? '<span>' + svgIcon('flag') + ' ' + r.prio + '</span>' : '') +
          (r.tags.length ? '<span>' + r.tags.map(function (g) { return '#' + esc(g); }).join(' ') + '</span>' : '') +
          '</div>';
      }
      input.addEventListener('input', updatePreview);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); root.querySelector('#qaSave').click(); }
      });
      updatePreview();
      root.querySelector('#qaMore').addEventListener('click', function () {
        var raw = String(input.value || '').trim();
        var r = parseQuick(raw);
        closeModal();
        setTimeout(function () {
          openTaskEditor(null);
          setTimeout(function () {
            var w2 = document.getElementById('modalRoot');
            if (!w2) return;
            var ti = w2.querySelector('#edTitle');
            if (ti) {
              if (raw) ti.value = r.title;
              ti.focus();
            }
            if (!raw) return;
            var dd = w2.querySelector('#edDate'); if (dd) dd.value = r.date;
            var tt = w2.querySelector('#edTime'); if (tt) tt.value = r.time;
            var ll = w2.querySelector('#edList'); if (ll) ll.value = '收集箱';
            var est = w2.querySelector('#edEst'); if (est) est.value = '';
            if (r.tags.length) {
              var tagInp = w2.querySelector('#edTagInput');
              if (tagInp) {
                r.tags.forEach(function (g) {
                  tagInp.value = g;
                  var ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
                  tagInp.dispatchEvent(ev);
                });
                tagInp.value = '';
              }
            }
          }, 120);
        }, 200);
      });
      root.querySelector('#qaSave').addEventListener('click', function () {
        var r = parseQuick(input.value);
        if (!input.value.trim()) { toast('先写点内容'); return; }
        var t = {
          id: uid(), title: r.title, note: '', list: (S.selectedList || '收集箱'), tags: r.tags, prio: r.prio,
          important: r.prio === 'P0', urgent: r.prio === 'P0' || r.prio === 'P1',
          done: false, remindMode: '不提醒', remindCfg: null,
          date: r.date, time: r.time, estimate: 0, doneAt: '', sort: Math.floor(Date.now() / 1000) % 1000000, createdAt: ymd(today0())
        };
        if (S.selectedTag && t.tags.indexOf(S.selectedTag) === -1) t.tags.push(S.selectedTag);
        S.tasks.push(t);
        cacheLocal();
        clearDraft();
        closeModal();
        refreshAll();
        apiAddTask(t).then(function () { cacheLocal(); refreshAll(); });
        toast('已添加：' + r.title + (r.time ? ' · ' + r.time : ''));
      });
    }
  });
}

/* ---------- 过滤器 ---------- */
function openSearch() {
  openModal('<div class="modal wide">' +
    '<div class="m-head"><h3>搜索</h3><button class="m-close">' + svgIcon('close') + '</button></div>' +
    '<div class="m-body">' +
    '<input class="inp" id="scInput" placeholder="搜日程、备注、标签、子项…" value="' + esc(S.filters.kw || '') + '" style="height:44px;font-size:16px">' +
    '<div class="sc-res" id="scRes"></div>' +
    '</div>' +
    '<div class="m-foot"><div style="font-size:11px;color:var(--text-3)" id="scCount"></div></div>' +
    '</div>', {
    onMount: function (root) {
      var inp = root.querySelector('#scInput');
      var box = root.querySelector('#scRes');
      var cnt = root.querySelector('#scCount');
      function run() {
        var kw = String(inp.value || '').trim().toLowerCase();
        if (!kw) { box.innerHTML = '<div class="sc-empty">输入关键词开始搜索，标题、备注、标签、子项都能搜</div>'; cnt.textContent = ''; return; }
        var hit = S.tasks.filter(function (t) {
          var subTxt = (t.subs || []).map(function (x) { return x.title; }).join(' ');
          var hay = (t.title + ' ' + t.note + ' ' + (t.tags || []).join(' ') + ' ' + (t.list || '') + ' ' + subTxt).toLowerCase();
          return hay.indexOf(kw) > -1;
        }).slice(0, 40);
        cnt.textContent = hit.length ? '找到 ' + hit.length + ' 条' : '';
        if (!hit.length) { box.innerHTML = '<div class="sc-empty">没有匹配的日程</div>'; return; }
        box.innerHTML = hit.map(function (t) {
          return '<div class="sc-item" data-scid="' + esc(t.id) + '">' + flagHtml(t) +
            '<span class="sc-t">' + esc(t.title) + '</span>' +
            '<span class="sc-m">' + (t.date ? shortDate(parseYmd(t.date)) : '未安排') + (t.time ? ' ' + t.time : '') + '</span></div>';
        }).join('');
      }
      inp.addEventListener('input', run);
      box.addEventListener('click', function (e) {
        var it = e.target.closest('[data-scid]');
        if (!it) return;
        var id = it.getAttribute('data-scid');
        closeModal();
        setTimeout(function () { openTaskDetail(id); }, 180);
      });
      setTimeout(function () { try { inp.focus(); inp.select(); } catch (e) { } }, 80);
      run();
    }
  });
}
function openFilter() {
  var f = { prio: S.filters.prio.slice(), tags: S.filters.tags.slice(), status: S.filters.status, from: S.filters.from, to: S.filters.to, kw: S.filters.kw };
  var tags = allTags();
  var html = '<div class="modal">' +
    '<div class="m-head"><h3>筛选任务</h3><button class="m-close">' + svgIcon('close') + '</button></div>' +
    '<div class="m-body">' +
    '<div class="field"><label>完成状态</label><div class="seg" id="ftStatus">' +
    [{ v: 'todo', t: '未完成' }, { v: 'done', t: '已完成' }, { v: 'all', t: '全部' }].map(function (o) {
      return '<button data-st="' + o.v + '" class="' + (f.status === o.v ? 'on' : '') + '">' + o.t + '</button>';
    }).join('') + '</div></div>' +
    '<div class="field"><label>优先级</label><div class="chip-pick" id="ftPrio">' +
    ['P0', 'P1', 'P2', 'P3'].map(function (p) {
      return '<button class="chip-p' + (f.prio.indexOf(p) > -1 ? ' on' : '') + '" data-fp="' + p + '">' + p + ' · ' + PRIO_LABEL[p] + '</button>';
    }).join('') + '</div></div>' +
    '<div class="field"><label>标签<span class="hint">可多选，满足任一即可</span></label><div class="chip-pick" id="ftTags">' +
    (tags.length ? tags.map(function (g) {
      return '<button class="chip-p' + (f.tags.indexOf(g) > -1 ? ' on' : '') + '" data-ft="' + esc(g) + '">#' + esc(g) + '</button>';
    }).join('') : '<span class="hint">暂无标签</span>') + '</div></div>' +
    '<div class="row2"><div class="field"><label>起始日期</label><input class="inp" type="date" id="ftFrom" value="' + esc(f.from) + '"></div>' +
    '<div class="field"><label>截止日期</label><input class="inp" type="date" id="ftTo" value="' + esc(f.to) + '"></div></div>' +
    '<div class="field"><label>关键词</label><input class="inp" id="ftKw" value="' + esc(f.kw) + '" placeholder="搜索标题 / 备注 / 标签"></div>' +
    '</div>' +
    '<div class="m-foot"><button class="btn btn-sec btn-sm" id="ftReset">重置</button><div class="spacer"></div>' +
    '<button class="btn btn-sec" id="ftCancel">取消</button>' +
    '<button class="btn btn-pri" id="ftApply">应用筛选</button></div></div>';
  openModal(html, {
    onMount: function (root) {
      Array.prototype.forEach.call(root.querySelectorAll('[data-st]'), function (b) {
        b.addEventListener('click', function () {
          f.status = b.getAttribute('data-st');
          Array.prototype.forEach.call(root.querySelectorAll('[data-st]'), function (x) { x.className = ''; });
          b.className = 'on';
        });
      });
      Array.prototype.forEach.call(root.querySelectorAll('[data-fp]'), function (b) {
        b.addEventListener('click', function () {
          var v = b.getAttribute('data-fp'), i = f.prio.indexOf(v);
          if (i > -1) f.prio.splice(i, 1); else f.prio.push(v);
          b.className = 'chip-p' + (i > -1 ? '' : ' on');
        });
      });
      Array.prototype.forEach.call(root.querySelectorAll('[data-ft]'), function (b) {
        b.addEventListener('click', function () {
          var v = b.getAttribute('data-ft'), i = f.tags.indexOf(v);
          if (i > -1) f.tags.splice(i, 1); else f.tags.push(v);
          b.className = 'chip-p' + (i > -1 ? '' : ' on');
        });
      });
      root.querySelector('#ftReset').addEventListener('click', function () {
        f = { prio: [], tags: [], status: 'todo', from: '', to: '', kw: '' };
        S.filters = f; closeModal(); refreshAll(); toast('筛选已重置');
      });
      root.querySelector('#ftCancel').addEventListener('click', closeModal);
      root.querySelector('#ftApply').addEventListener('click', function () {
        f.from = root.querySelector('#ftFrom').value;
        f.to = root.querySelector('#ftTo').value;
        f.kw = root.querySelector('#ftKw').value.trim();
        S.filters = f;
        closeModal();
        refreshAll();
        var n = activeFilterCount();
        toast(n ? '已应用 ' + n + ' 个筛选条件' : '筛选已清空');
      });
    }
  });
}

/* ---------- 提醒中心 ---------- */
function openReminderCenter() {
  var pend = pendingReminders();
  var upcoming = [];
  S.tasks.forEach(function (t) {
    var r = nextReminder(t);
    if (r && !r.overdue && r.at - Date.now() < 86400000) upcoming.push({ task: t, r: r });
  });
  upcoming.sort(function (a, b) { return a.r.at - b.r.at; });
  var bodyHtml = '';
  if (!pend.length && !upcoming.length) {
    bodyHtml = '<div style="text-align:center;padding:22px 0;color:var(--text-3);font-size:12.5px">暂时没有到点的提醒</div>';
  } else {
    if (pend.length) {
      bodyHtml += '<div class="sec-head" style="margin-top:0"><h3 style="color:var(--red)">已到点提醒</h3><span class="meta">' + pend.length + ' 条</span><span class="line"></span></div>';
      bodyHtml += pend.map(function (it) {
        var stage = remindStageText(it.task, it.r.offset);
        return '<div style="display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:9px;background:var(--red-soft);margin-bottom:5px">' +
          '<span style="font-size:10.5px;font-weight:700;color:var(--red);white-space:nowrap">' + esc(stage) + '</span>' +
          '<span style="flex:1;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(it.task.title) + '</span>' +
          '<button class="btn btn-sm btn-sec" data-rack="' + esc(it.task.id) + '|' + it.r.idx + '">知道了</button>' +
          '<button class="btn btn-sm btn-pri" data-rdone="' + esc(it.task.id) + '">完成</button></div>';
      }).join('');
    }
    if (upcoming.length) {
      bodyHtml += '<div class="sec-head"><h3>24 小时内</h3><span class="meta">' + upcoming.length + ' 条</span><span class="line"></span></div>';
      bodyHtml += upcoming.slice(0, 12).map(function (it) {
        var d = new Date(it.r.at);
        return '<div style="display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:9px;background:var(--purple-soft);margin-bottom:5px">' +
          '<span style="font-size:10.5px;font-weight:700;color:var(--purple);white-space:nowrap">' + esc(remindStageText(it.task, it.r.offset)) + '</span>' +
          '<span style="flex:1;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(it.task.title) + '</span>' +
          '<span style="font-size:11px;color:var(--text-3);white-space:nowrap">' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + '</span></div>';
      }).join('');
    }
  }
  openModal('<div class="modal mid">' +
    '<div class="m-head"><h3>提醒中心</h3><button class="m-close">' + svgIcon('close') + '</button></div>' +
    '<div class="m-body">' + bodyHtml + '</div>' +
    '<div class="m-foot"><div style="font-size:11px;color:var(--text-3)">艾宾浩斯提醒会按 5 分钟 → 30 分钟 → 12 小时 → 1/2/4/7/15 天递增推送</div></div></div>', {
    onMount: function (root) {
      root.addEventListener('click', function (e) {
        var ack = e.target.closest('[data-rack]');
        if (ack) {
          var parts = ack.getAttribute('data-rack').split('|');
          var t = findTask(parts[0]);
          if (t && t.remindCfg) {
            t.remindCfg.read = t.remindCfg.read || [];
            t.remindCfg.read.push(parseInt(parts[1], 10));
            cacheLocal(); apiUpdateTask(t, ['提醒设置']); closeModal(); refreshAll();
            toast('已标记为已读');
          }
          return;
        }
        var dn = e.target.closest('[data-rdone]');
        if (dn) { var id = dn.getAttribute('data-rdone'); closeModal(); toggleDone(id); }
      });
    }
  });
}
function ebStageName(off) {
  if (off === 0) return '准时';
  if (off < 60) return off + ' 分钟';
  if (off < 1440) return Math.round(off / 60) + ' 小时';
  return Math.round(off / 1440) + ' 天';
}
/* 提醒中心里的节点名：艾宾浩斯按复习阶段，单次提醒按提前量 */
function remindStageText(t, off) {
  if (t && t.remindMode === '艾宾浩斯') return ebStageName(off);
  if (off === 0) return '准时';
  if (off < 0) return '提前 ' + ebStageName(-off);
  return ebStageName(off);
}
/* ---------- 习惯编辑器 ---------- */
var HABIT_ICONS = ['sun', 'book', 'fire', 'heart', 'coffee', 'target', 'moon', 'star'];
function openHabitEditor(id) {
  var h = id ? findHabit(id) : null;
  var isNew = !h;
  if (isNew) h = { id: '', name: '', icon: 'target', color: '#177CB0', target: 7, streak: 0, total: 0, log: [], createdAt: ymd(today0()) };
  var sel = { icon: h.icon, color: h.color };
  function iconHtml() {
    return HABIT_ICONS.map(function (k) {
      return '<button class="chip-p' + (sel.icon === k ? ' on' : '') + '" data-hi="' + k + '" style="width:42px;height:38px;padding:0;display:flex;align-items:center;justify-content:center">' + svgIcon(k) + '</button>';
    }).join('');
  }
  openModal('<div class="modal">' +
    '<div class="m-head"><h3>' + (isNew ? '新建习惯' : '编辑习惯') + '</h3><button class="m-close">' + svgIcon('close') + '</button></div>' +
    '<div class="m-body">' +
    '<div class="field"><label>习惯名称</label><input class="inp" id="hbName" autofocus value="' + esc(h.name) + '" placeholder="例：早起 6:30 / 阅读 30 分钟"></div>' +
    '<div class="field"><label>图标</label><div class="chip-pick" id="hbIcons">' + iconHtml() + '</div></div>' +
    '<div class="field"><label>颜色</label><div style="display:flex;gap:9px;flex-wrap:wrap" id="hbColors">' + colorSwatches(sel.color, 'data-hc') + '</div></div>' +
    '<div class="field"><label>每周目标<span class="hint">天 / 周</span></label>' +
    '<div class="chip-pick" id="hbTarget">' + [1, 2, 3, 4, 5, 6, 7].map(function (n) {
      return '<button class="chip-p' + (h.target === n ? ' on' : '') + '" data-ht="' + n + '">' + n + ' 天</button>';
    }).join('') + '</div></div>' +
    '</div>' +
    '<div class="m-foot">' + (isNew ? '' : '<button class="btn btn-danger btn-sm" id="hbDel">删除</button>') +
    '<div class="spacer"></div><button class="btn btn-sec" id="hbCancel">取消</button>' +
    '<button class="btn btn-pri" id="hbSave">' + (isNew ? '创建习惯' : '保存') + '</button></div></div>', {
    onMount: function (root) {
      var target = h.target;
      Array.prototype.forEach.call(root.querySelectorAll('[data-hi]'), function (b) {
        b.addEventListener('click', function () {
          sel.icon = b.getAttribute('data-hi');
          root.querySelector('#hbIcons').innerHTML = iconHtml();
          bindIcons();
        });
      });
      function bindIcons() {
        Array.prototype.forEach.call(root.querySelectorAll('[data-hi]'), function (b) {
          b.addEventListener('click', function () {
            sel.icon = b.getAttribute('data-hi');
            root.querySelector('#hbIcons').innerHTML = iconHtml();
            bindIcons();
          });
        });
      }
      bindIcons();
      Array.prototype.forEach.call(root.querySelectorAll('[data-hc]'), function (b) {
        b.addEventListener('click', function () {
          sel.color = b.getAttribute('data-hc');
          root.querySelector('#hbColors').innerHTML = colorHtml();
          bindColors();
        });
      });
      function bindColors() {
        Array.prototype.forEach.call(root.querySelectorAll('[data-hc]'), function (b) {
          b.addEventListener('click', function () {
            sel.color = b.getAttribute('data-hc');
            root.querySelector('#hbColors').innerHTML = colorHtml();
            bindColors();
          });
        });
      }
      bindColors();
      Array.prototype.forEach.call(root.querySelectorAll('[data-ht]'), function (b) {
        b.addEventListener('click', function () {
          target = parseInt(b.getAttribute('data-ht'), 10);
          Array.prototype.forEach.call(root.querySelectorAll('[data-ht]'), function (x) { x.className = 'chip-p'; });
          b.className = 'chip-p on';
        });
      });
      root.querySelector('#hbCancel').addEventListener('click', closeModal);
      var del = root.querySelector('#hbDel');
      if (del) del.addEventListener('click', function () {
        confirmModal('删除习惯', '删除后所有打卡记录都会消失，确定吗？', '删除', function () {
          S.habits = S.habits.filter(function (x) { return x.id !== h.id; });
          cacheLocal(); refreshAll(); apiDeleteHabit(h.id); toast('已删除');
        }, true);
      });
      root.querySelector('#hbSave').addEventListener('click', function () {
        var nm = (root.querySelector('#hbName').value || '').trim();
        if (!nm) { toast('给习惯起个名字'); return; }
        h.name = nm; h.icon = sel.icon; h.color = sel.color; h.target = target;
        if (isNew) {
          h.id = uid();
          h.createdAt = ymd(today0());
          S.habits.push(h);
          closeModal(); cacheLocal(); refreshAll();
          apiSaveHabit(h).then(function () { cacheLocal(); refreshAll(); toast('习惯已创建'); });
        } else {
          closeModal(); cacheLocal(); refreshAll();
          apiSaveHabit(h).then(function () { toast('已保存'); });
        }
      });
    }
  });
}

/* ---------- 纪念日编辑器 ---------- */
function openCountdownEditor(id) {
  var c = null;
  if (id) {
    c = S.countdowns.filter(function (x) { return x.id === id; })[0];
    if (!c && String(id).indexOf('sys:') === 0) {
      var sy = String(id).slice(4);
      c = S.countdowns.filter(function (x) { return x.sys === sy; })[0];
    }
  }
  var isNew = !c;
  if (isNew) c = { id: '', name: '', type: '倒数日', date: ymd(addDays(today0(), 30)), note: '', color: '#177CB0', createdAt: ymd(today0()) };
  var sel = { type: c.type, color: c.color };
  openModal('<div class="modal">' +
    '<div class="m-head"><h3>' + (isNew ? '添加纪念日' : '编辑纪念日') + '</h3><button class="m-close">' + svgIcon('close') + '</button></div>' +
    '<div class="m-body">' +
    (c.sys ? '<div class="banner" style="background:var(--red-soft);border-color:#F0CFCB;color:#A61F23;margin:0">' +
      svgIcon('alert') + '<span>系统项：日期由假期接口每天自动更新，不能删除，也不能改日期。</span></div>' : '') +
    '<div class="field"><label>名称</label><input class="inp" id="cdName" autofocus value="' + esc(c.name) + '" placeholder="例：项目上线日 / 结婚纪念日"' + (c.sys ? ' disabled' : '') + '></div>' +
    '<div class="field"><label>类型</label><div class="seg" id="cdType">' +
    ['倒数日', '纪念日', '生日'].map(function (t) {
      return '<button data-cdt="' + t + '" class="' + (c.type === t ? 'on' : '') + '">' + t + '</button>';
    }).join('') + '</div>' +
    '<div class="hint">倒数日只算一次；纪念日 / 生日每年自动循环</div></div>' +
    '<div class="field"><label>日期</label><input class="inp" type="date" id="cdDate" value="' + esc(c.date) + '"' + (c.sys ? ' disabled' : '') + '></div>' +
    '<div class="field"><label>分组<span class="hint">同类日子放一起，标题可拖动排序</span></label>' +
    '<input class="inp" id="cdGroup" value="' + esc(c.group || '') + '" placeholder="假期 / 生日 / 纪念日 / 旅行">' +
    '<div class="chip-pick" id="cdGroupPick">' + ['假期', '生日', '纪念日', '旅行', '目标', '其他'].map(function (g) {
      return '<button class="chip-p' + (cdGroupOf(c) === g ? ' on' : '') + '" data-cdg="' + g + '">' + g + '</button>';
    }).join('') + '</div></div>' +
    '<div class="field"><label>备注</label><input class="inp" id="cdNote" value="' + esc(c.note) + '" placeholder="可选"></div>' +
    '<div class="field"><label>颜色</label><div style="display:flex;gap:9px;flex-wrap:wrap" id="cdColors">' + colorSwatches(sel.color, 'data-cdc') + '</div></div>' +
    '</div><div class="m-foot">' + (isNew || c.sys ? '' : '<button class="btn btn-danger btn-sm" id="cdDel">删除</button>') +
    '<div class="spacer"></div><button class="btn btn-sec" id="cdCancel">取消</button>' +
    '<button class="btn btn-pri" id="cdSave">' + (isNew ? '添加' : '保存') + '</button></div></div>', {
    onMount: function (root) {
      Array.prototype.forEach.call(root.querySelectorAll('[data-cdt]'), function (b) {
        b.addEventListener('click', function () {
          sel.type = b.getAttribute('data-cdt');
          Array.prototype.forEach.call(root.querySelectorAll('[data-cdt]'), function (x) { x.className = ''; });
          b.className = 'on';
        });
      });
      function bindColors() {
        Array.prototype.forEach.call(root.querySelectorAll('[data-cdc]'), function (b) {
          b.addEventListener('click', function () {
            sel.color = b.getAttribute('data-cdc');
            root.querySelector('#cdColors').innerHTML = colorHtml();
            bindColors();
          });
        });
      }
      bindColors();
      var gInp = root.querySelector('#cdGroup');
      Array.prototype.forEach.call(root.querySelectorAll('[data-cdg]'), function (b) {
        b.addEventListener('click', function () {
          gInp.value = b.getAttribute('data-cdg');
          Array.prototype.forEach.call(root.querySelectorAll('[data-cdg]'), function (x) { x.className = 'chip-p'; });
          b.className = 'chip-p on';
        });
      });
      root.querySelector('#cdCancel').addEventListener('click', closeModal);
      var del = root.querySelector('#cdDel');
      if (del) del.addEventListener('click', function () {
        confirmModal('删除纪念日', '确定删除「' + esc(c.name) + '」？', '删除', function () {
          S.countdowns = S.countdowns.filter(function (x) { return x.id !== c.id; });
          cacheLocal(); refreshAll(); apiDeleteCountdown(c.id); toast('已删除');
        }, true);
      });
      root.querySelector('#cdSave').addEventListener('click', function () {
        var nm = (root.querySelector('#cdName').value || '').trim();
        var dv = root.querySelector('#cdDate').value;
        if (!nm) { toast('写个名字'); return; }
        if (!dv) { toast('选一个日期'); return; }
        if (!c.sys) { c.name = nm; c.type = sel.type; c.date = dv; }
        c.color = sel.color;
        c.group = (root.querySelector('#cdGroup').value || '').trim();
        c.note = (root.querySelector('#cdNote').value || '').trim();
        if (isNew) {
          c.id = uid(); c.createdAt = ymd(today0());
          S.countdowns.push(c);
          closeModal(); cacheLocal(); refreshAll();
          apiSaveCountdown(c).then(function () { cacheLocal(); refreshAll(); toast('已添加'); });
        } else {
          closeModal(); cacheLocal(); refreshAll();
          apiSaveCountdown(c).then(function () { toast('已保存'); });
        }
      });
    }
  });
}
