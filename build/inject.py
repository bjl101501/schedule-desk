#!/usr/bin/env python3
"""Build the desktop-ready index.html from the pristine web page.

Design goals
------------
* The web app's own markup, CSS and business logic stay byte-for-byte intact.
* Only three things are added, each inside a marked block so the script is
  idempotent:
    1. a database bridge that maps the cloud-table API onto the Rust store,
    2. a desktop layer (first-run wizard, settings section, sync pill),
    3. an exporter that writes through the native side.
"""

from __future__ import annotations

import pathlib
import re
import sys

WEB = pathlib.Path(__file__).resolve().parent.parent / "src-web"
# 拆分后的唯一源：index.html / styles.css / app.js
SRC_DIR = WEB / "src"
# Tauri 的 frontendDist 指向这里
OUT_DIR = WEB / "build"


BRIDGE_BEGIN = "<!-- ==== desktop bridge: begin (generated) ==== -->"
BRIDGE_END = "<!-- ==== desktop bridge: end ==== -->"
DESK_BEGIN = "<!-- ==== desktop layer: begin (generated) ==== -->"
DESK_END = "<!-- ==== desktop layer: end ==== -->"
EXPORT_BEGIN = "<!-- ==== desktop exporter: begin (generated) ==== -->"
EXPORT_END = "<!-- ==== desktop exporter: end ==== -->"

BRIDGE = BRIDGE_BEGIN + r"""
<script>
/* 本地数据库桥：把资料库云表格接口映射到 Rust 侧文件存储 */
(function () {
  'use strict';
  var ALIAS = { 'gVxrS4S2Zb2xddhphNdjT': 'gVxrxS4S2Zb2xddhphNdjT' };
  var state = { tables: {}, config: {}, firstRun: false, version: '' };
  var ready = null;
  var pending = [];
  var flushTimer = null;
  var seq = 0;

  function host() {
    var t = window.__TAURI_INTERNALS__;
    return (t && typeof t.invoke === 'function') ? t : null;
  }
  function invoke(cmd, args) {
    var t = host();
    return t ? t.invoke(cmd, args) : Promise.reject(new Error('no native host'));
  }

  /* 启动时主动拉取全量数据，避免依赖注入脚本的执行时机 */
  function bootstrap() {
    if (ready) return ready;
    ready = invoke('db_bootstrap').then(function (r) {
      if (r && typeof r === 'object') {
        state.tables = r.tables || {};
        state.config = r.config || {};
        state.firstRun = !!r.firstRun;
        state.version = r.version || '';
      }
      return state;
    }).catch(function () { return state; });
    return ready;
  }

  function bucket(id) {
    id = ALIAS[id] || id;
    if (!Array.isArray(state.tables[id])) state.tables[id] = [];
    return state.tables[id];
  }

  function flush() {
    flushTimer = null;
    if (!pending.length) return;
    var ops = pending;
    pending = [];
    invoke('db_apply', { ops: ops }).catch(function () { });
  }
  function queue(op) {
    pending.push(op);
    if (!flushTimer) flushTimer = setTimeout(flush, 80);
  }

  function newId() {
    seq += 1;
    return 'r' + Date.now().toString(36) + seq.toString(36) +
      Math.random().toString(36).slice(2, 6);
  }

  /* 云端返回的是已解包的标量，这里做等价还原 */
  function flatten(rec) {
    var out = { id: rec.id, record_id: rec.id, _id: rec.id };
    var props = rec.properties || {};
    for (var k in props) {
      if (!Object.prototype.hasOwnProperty.call(props, k)) continue;
      var v = props[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        if ('text' in v) out[k] = v.text;
        else if ('date' in v) out[k] = v.date;
        else if ('number' in v) out[k] = v.number;
        else if ('select' in v) out[k] = v.select;
        else if ('checkbox' in v) out[k] = !!v.checkbox;
        else out[k] = v;
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  function liveRows(id) {
    return bucket(id).filter(function (r) { return !r.deleted; });
  }

  var database = {
    query: function (opts) {
      return bootstrap().then(function () {
        opts = opts || {};
        var rows = liveRows(opts.databaseId);
        var start = 0;
        if (opts.startCursor) {
          for (var i = 0; i < rows.length; i++) {
            if (rows[i].id === opts.startCursor) { start = i + 1; break; }
          }
        }
        var size = opts.pageSize || 200;
        var page = rows.slice(start, start + size);
        var hasMore = start + size < rows.length;
        return {
          results: page.map(flatten),
          hasMore: hasMore,
          nextCursor: hasMore && page.length ? page[page.length - 1].id : null
        };
      });
    },
    addRecord: function (opts) {
      return bootstrap().then(function () {
        opts = opts || {};
        var now = Date.now();
        var rec = {
          id: newId(),
          properties: opts.properties || {},
          createdAt: now,
          updatedAt: now
        };
        bucket(opts.databaseId).push(rec);
        queue({
          table: ALIAS[opts.databaseId] || opts.databaseId,
          id: rec.id,
          properties: rec.properties,
          createdAt: now,
          updatedAt: now,
          deleted: false
        });
        return { id: rec.id, record_id: rec.id };
      });
    },
    updateRecord: function (opts) {
      return bootstrap().then(function () {
        opts = opts || {};
        var rows = bucket(opts.databaseId);
        var incoming = opts.properties || {};
        var now = Date.now();
        for (var i = 0; i < rows.length; i++) {
          if (rows[i].id === opts.recordId) {
            var props = rows[i].properties || (rows[i].properties = {});
            for (var k in incoming) {
              if (Object.prototype.hasOwnProperty.call(incoming, k)) props[k] = incoming[k];
            }
            rows[i].updatedAt = now;
            queue({
              table: ALIAS[opts.databaseId] || opts.databaseId,
              id: rows[i].id,
              properties: props,
              createdAt: rows[i].createdAt || now,
              updatedAt: now,
              deleted: false
            });
            break;
          }
        }
        return {};
      });
    },
    deleteRecord: function (opts) {
      return bootstrap().then(function () {
        opts = opts || {};
        var rows = bucket(opts.databaseId);
        var now = Date.now();
        for (var i = 0; i < rows.length; i++) {
          if (rows[i].id === opts.recordId) {
            rows[i].deleted = true;
            rows[i].updatedAt = now;
            queue({
              table: ALIAS[opts.databaseId] || opts.databaseId,
              id: rows[i].id,
              properties: rows[i].properties || {},
              createdAt: rows[i].createdAt || now,
              updatedAt: now,
              deleted: true
            });
            break;
          }
        }
        return {};
      });
    }
  };

  window.__SMART_PAGE__ = window.__SMART_PAGE__ || {};
  window.__SMART_PAGE__.database = database;
  window.__SD_DESKTOP__ = {
    database: database,
    ready: bootstrap(),
    state: state,
    invoke: invoke,
    theTables: function () { return state.tables; },
    snapshot: function () { return JSON.parse(JSON.stringify(state.tables)); },
    flushNow: function () { if (flushTimer) { clearTimeout(flushTimer); flush(); } }
  };
  bootstrap();
})();
</script>
""" + BRIDGE_END

DESKTOP = DESK_BEGIN + r"""
<script>
/* 桌面层：首次引导、设置区块、同步指示、说明与更新 */
(function () {
  'use strict';
  var D = window.__SD_DESKTOP__;
  if (!D) return;
  var config = {};

  function invoke(cmd, args) {
    return D.invoke(cmd, args).catch(function (e) { return { __error: String(e) }; });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(msg) {
    if (typeof window.toast === 'function') window.toast(msg);
  }

  /* ---------- 同步指示 ---------- */
  var syncState = { mode: 'local', text: '本地模式' };
  function paintSync() {
    var pill = document.getElementById('syncPill');
    var txt = document.getElementById('syncText');
    if (!pill || !txt) return;
    var cls = syncState.mode === 'syncing' ? 'syncing' : syncState.mode === 'error' ? 'offline' : '';
    pill.className = 'sync-pill' + (cls ? ' ' + cls : '');
    txt.textContent = syncState.text || '本地模式';
    pill.title = syncState.detail || syncState.text || '';
  }
  function refreshSync() {
    invoke('sync_status').then(function (s) {
      if (!s || s.__error) return;
      syncState = s;
      paintSync();
    });
  }
  if (typeof window.setSync === 'function') {
    window.setSync = function (state) {
      if (state === 'syncing') {
        syncState.mode = 'syncing';
        syncState.text = '同步中';
        paintSync();
      }
      return undefined;
    };
  }
  refreshSync();
  setInterval(refreshSync, 15000);

  /* ---------- 设置区块 ---------- */
  function sectionHtml() {
    var dav = config.webdav || {};
    return '' +
      '<div class="field" data-sd-block="desktop"><label>数据目录<span class="hint">本机文件，可放同步盘</span></label>' +
      '<div id="sdDirPath" style="font-size:13px;color:var(--text-2);line-height:1.8;word-break:break-all">' +
      esc(config.dataDir || '默认目录') + '</div>' +
      '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">' +
      '<button class="btn btn-sec" id="sdChangeDir" style="height:34px;font-size:12.5px">更换目录</button>' +
      '<button class="btn btn-sec" id="sdOpenDir" style="height:34px;font-size:12.5px">打开目录</button>' +
      '<button class="btn btn-sec" id="sdHelp" style="height:34px;font-size:12.5px">使用说明</button>' +
      '</div></div>' +

      '<div class="field" data-sd-block="desktop"><label>WebDAV 同步<span class="hint">多设备共用一份数据</span></label>' +
      '<div style="display:flex;flex-direction:column;gap:7px">' +
      '<input class="inp" id="sdDavUrl" placeholder="https://dav.example.com/remote.php/dav/files/me/" value="' + esc(dav.url || '') + '">' +
      '<div style="display:flex;gap:7px">' +
      '<input class="inp" id="sdDavUser" placeholder="用户名" value="' + esc(dav.username || '') + '" style="flex:1">' +
      '<input class="inp" id="sdDavPass" type="password" placeholder="密码 / 应用专用密码" value="' + esc(dav.password || '') + '" style="flex:1">' +
      '</div>' +
      '<div style="display:flex;gap:8px">' +
      '<button class="btn btn-sec" id="sdDavTest" style="height:34px;font-size:12.5px">测试连接</button>' +
      '<button class="btn" id="sdDavSave" style="height:34px;font-size:12.5px">保存并同步</button>' +
      '</div>' +
      '<div id="sdDavMsg" style="font-size:12px;color:var(--text-3)">' + esc(config.syncHint || '未配置时只在本机保存') + '</div>' +
      '</div></div>' +

      '<div class="field" data-sd-block="desktop"><label>软件更新<span class="hint">当前 ' + esc(config.version || '') + '</span></label>' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
      '<button class="btn btn-sec" id="sdCheckUpdate" style="height:34px;font-size:12.5px">检查更新</button>' +
      '<span id="sdUpdMsg" style="font-size:12px;color:var(--text-3)"></span>' +
      '</div></div>';
  }

  function bindDesktopSection(root) {
    var pick = root.querySelector('#sdChangeDir');
    if (pick) pick.addEventListener('click', function () {
      invoke('choose_data_dir').then(function (r) {
        if (r && r.ok) {
          toast('目录已切换，正在重启…');
          setTimeout(function () { invoke('restart_app'); }, 700);
        } else if (r && r.error) { toast(r.error); }
      });
    });
    var openBtn = root.querySelector('#sdOpenDir');
    if (openBtn) openBtn.addEventListener('click', function () { invoke('open_data_dir'); });
    var helpBtn = root.querySelector('#sdHelp');
    if (helpBtn) helpBtn.addEventListener('click', function () { showHelp(); });

    var test = root.querySelector('#sdDavTest');
    if (test) test.addEventListener('click', function () {
      var msg = root.querySelector('#sdDavMsg');
      if (msg) msg.textContent = '正在测试…';
      invoke('webdav_test', {
        url: root.querySelector('#sdDavUrl').value.trim(),
        username: root.querySelector('#sdDavUser').value.trim(),
        password: root.querySelector('#sdDavPass').value
      }).then(function (r) {
        if (msg) msg.textContent = r && r.ok ? '连接成功' : ('连接失败：' + ((r && r.error) || '未知错误'));
      });
    });
    var save = root.querySelector('#sdDavSave');
    if (save) save.addEventListener('click', function () {
      var msg = root.querySelector('#sdDavMsg');
      if (msg) msg.textContent = '正在保存并同步…';
      invoke('webdav_save_and_sync', {
        url: root.querySelector('#sdDavUrl').value.trim(),
        username: root.querySelector('#sdDavUser').value.trim(),
        password: root.querySelector('#sdDavPass').value
      }).then(function (r) {
        if (msg) msg.textContent = r && r.ok ? ('同步完成 · ' + (r.text || '')) : ('同步失败：' + ((r && r.error) || '未知错误'));
        refreshSync();
      });
    });
    var upd = root.querySelector('#sdCheckUpdate');
    if (upd) upd.addEventListener('click', function () {
      var msg = root.querySelector('#sdUpdMsg');
      if (msg) msg.textContent = '正在检查…';
      invoke('update_check').then(function (r) {
        if (!msg) return;
        if (!r || r.__error) { msg.textContent = '检查失败：' + ((r && r.__error) || '未知错误'); return; }
        if (r.error) { msg.textContent = '检查失败：' + r.error; return; }
        if (r.available) {
          msg.innerHTML = '发现新版本 ' + esc(r.version) + '　<a href="#" id="sdDoUpdate" style="color:var(--brand)">立即更新</a>';
          var link = msg.querySelector('#sdDoUpdate');
          if (link) link.addEventListener('click', function (e) {
            e.preventDefault();
            msg.textContent = '正在下载…';
            invoke('update_install').then(function (x) {
              msg.textContent = x && x.ok ? '正在安装并重启…' : ('更新失败：' + ((x && x.error) || ''));
            });
          });
        } else {
          msg.textContent = '已是最新版本';
        }
      });
    });
  }

  var observer = new MutationObserver(function () {
    var modal = document.querySelector('.modal.settings');
    if (!modal || modal.querySelector('[data-sd-block="desktop"]')) return;
    var body = modal.querySelector('.m-body');
    if (!body) return;
    body.insertAdjacentHTML('afterbegin', sectionHtml());
    // 原页面这套文案是写给云表格的，桌面版要换成文件口径
    Array.prototype.forEach.call(body.querySelectorAll('.field'), function (f) {
      if (f.hasAttribute('data-sd-block')) return;
      var text = f.textContent || '';
      if (text.indexOf('资料库在线表格') > -1) {
        f.innerHTML = '<label>数据存储</label><div style="font-size:13.5px;color:var(--text-2);line-height:1.85">' +
          '数据保存在本机文件，路径见上方「数据目录」。<br>' +
          '配置 WebDAV 后，改动会同步到你自己指定的网盘目录。</div>';
      } else if (text.indexOf('同步状态') > -1 && f.querySelector('#stSync')) {
        f.innerHTML = '<label>同步状态</label><div style="font-size:13.5px;color:var(--text-2)">' +
          '当前状态见右上角标记：本地模式 / 同步中 / 已同步 / 同步失败。</div>';
      }
    });
    var reload = modal.querySelector('#stReload');
    if (reload) reload.style.display = 'none';
    bindDesktopSection(modal);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  /* ---------- 使用说明 ---------- */
  function showHelp() {
    if (typeof window.openModal !== 'function') return;
    var icon = window.svgIcon ? window.svgIcon('close') : '×';
    var html = '<div class="modal sm"><div class="m-head"><h3>使用说明</h3>' +
      '<button class="m-close">' + icon + '</button></div>' +
      '<div class="m-body" style="font-size:13.5px;line-height:1.95;color:var(--text-2)">' +
      '<p><b>数据在哪</b><br>全部保存在本机文件，路径见设置里的「数据目录」。不上传任何服务器，除非你主动配置 WebDAV。</p>' +
      '<p><b>换电脑</b><br>把数据目录复制到新机器，在首次引导或设置里指向它；也可以在「备份」里导出 JSON。</p>' +
      '<p><b>多设备同步</b><br>设置里填 WebDAV 地址与账号，各设备指向同一个远端文件。同步按「每条记录的修改时间」合并，较新的改动覆盖较旧的，删除也会同步。</p>' +
      '<p><b>提醒</b><br>到点由 Windows 原生通知弹出；关闭窗口会留在托盘继续计时与提醒，右键托盘图标可退出。</p>' +
      '<p><b>更新</b><br>设置里点「检查更新」，发现新版本可一键下载替换并自动重启。</p>' +
      '</div><div class="m-foot"><button class="btn m-close" style="white-space:nowrap;padding:0 22px">知道了</button></div></div>';
    window.openModal(html, { stack: true });
  }
  window.__SD_SHOW_HELP__ = showHelp;

  /* ---------- 首次引导 ---------- */
  function showOnboarding() {
    var layer = document.createElement('div');
    layer.id = 'sdOnboard';
    layer.style.cssText = 'position:fixed;inset:0;z-index:99999;background:var(--bg,#f7f3ea);' +
      'display:flex;align-items:center;justify-content:center;padding:24px;overflow:auto';
    layer.innerHTML = '' +
      '<div style="max-width:620px;width:100%;background:var(--panel,#fff);border:1px solid var(--line,#e8ecf2);' +
      'border-radius:16px;padding:28px 30px;box-shadow:0 18px 48px rgba(0,0,0,.12)">' +
      '<div style="font-size:12px;letter-spacing:.18em;color:var(--text-3,#9aa3b0)">SCHEDULE DESK · 桌面版</div>' +
      '<h2 style="margin:8px 0 6px;font-size:22px">先选一个数据存放位置</h2>' +
      '<p style="font-size:13.5px;color:var(--text-2,#67707e);line-height:1.9;margin:0 0 16px">' +
      '日程、习惯、纪念日、专注记录都会存成这里的文件。选默认目录最省事；' +
      '如果你用 OneDrive 同步盘，选它就能在多台电脑之间自动保持一致。</p>' +
      '<div style="border:1px solid var(--line,#e8ecf2);border-radius:12px;padding:14px 16px;margin-bottom:14px">' +
      '<div style="font-size:12px;color:var(--text-3,#9aa3b0);margin-bottom:4px">当前选择</div>' +
      '<div id="sdObDir" style="font-size:13.5px;word-break:break-all">' + esc(config.dataDir || '默认目录') + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px">' +
      '<button class="btn" id="sdObPick" style="height:38px">选择其他目录</button>' +
      '<button class="btn btn-sec" id="sdObDefault" style="height:38px">用默认目录</button>' +
      '</div>' +
      '<div style="background:var(--panel-2,#fbfcfd);border-radius:12px;padding:14px 16px;font-size:12.5px;' +
      'line-height:1.9;color:var(--text-2,#67707e);margin-bottom:18px">' +
      '<b>三条要知道的事</b><br>' +
      '1. 关闭窗口不会退出，程序留在任务栏托盘继续提醒；右键托盘图标可真正退出。<br>' +
      '2. 提醒由 Windows 原生通知弹出，不需要把窗口开着。<br>' +
      '3. 换电脑时把这个目录整体复制过去，或在设置里配置 WebDAV 同步。' +
      '</div>' +
      '<button class="btn" id="sdObStart" style="height:42px;width:100%;justify-content:center">开始使用</button>' +
      '</div>';

    document.body.appendChild(layer);
    var chosen = '';

    layer.querySelector('#sdObPick').addEventListener('click', function () {
      invoke('choose_data_dir_quiet').then(function (r) {
        if (r && r.ok) {
          chosen = r.dir;
          layer.querySelector('#sdObDir').textContent = r.dir;
        } else if (r && r.error) { toast(r.error); }
      });
    });
    layer.querySelector('#sdObDefault').addEventListener('click', function () {
      invoke('default_data_dir').then(function (r) {
        if (r && r.dir) {
          chosen = r.dir;
          layer.querySelector('#sdObDir').textContent = r.dir;
        }
      });
    });
    layer.querySelector('#sdObStart').addEventListener('click', function () {
      var btn = layer.querySelector('#sdObStart');
      btn.textContent = '正在启动…';
      invoke('finish_onboarding', { dir: chosen }).then(function (r) {
        if (r && r.ok) {
          invoke('restart_app');
        } else {
          btn.textContent = '开始使用';
          toast((r && r.error) || '保存失败');
        }
      });
    });
  }

  function startDesktop(st) {
    config = (st && st.config) || {};
    refreshSync();
    if (st && st.firstRun) showOnboarding();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      D.ready.then(startDesktop);
    });
  } else {
    D.ready.then(startDesktop);
  }
})();
</script>
""" + DESK_END

EXPORT_PATCH = EXPORT_BEGIN + r"""
<script>
/* 导出落盘：接管 downloadBlob，改由本地进程写入下载目录 */
(function () {
  'use strict';
  var original = window.downloadBlob;
  if (typeof original !== 'function') return;
  window.downloadBlob = function (name, content, mime) {
    var t = window.__TAURI_INTERNALS__;
    if (!t || typeof t.invoke !== 'function') return original.apply(window, arguments);
    try {
      t.invoke('export_file', { name: String(name), content: String(content) })
        .then(function (path) {
          if (typeof window.toast === 'function') window.toast('已导出到 ' + path);
        })
        .catch(function (err) {
          if (typeof window.toast === 'function') window.toast('导出失败：' + err);
        });
      return true;
    } catch (e) {
      return original.apply(window, arguments);
    }
  };
})();
</script>
""" + EXPORT_END




def script_body(block: str) -> str:
    """把带注释标记与 <script> 包裹的片段还原成纯 JS/CSS 文本。"""
    block = re.sub(r"<!--[^>]*-->", "", block)
    block = re.sub(r"</?script[^>]*>", "", block)
    return block.strip() + "\n"


def main() -> int:
    src_index = SRC_DIR / "index.html"
    src_css = SRC_DIR / "styles.css"
    js_dir = SRC_DIR / "js"
    for p in (src_index, src_css, js_dir):
        if not p.exists():
            print(f"missing source: {p}", file=sys.stderr)
            return 1

    html = src_index.read_text(encoding="utf-8")
    css = src_css.read_text(encoding="utf-8")

    js_files = sorted(js_dir.glob("*.js"))
    if not js_files:
        print("no js sources found", file=sys.stderr)
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "js").mkdir(exist_ok=True)

    total = 0
    for f in js_files:
        text = f.read_text(encoding="utf-8")
        (OUT_DIR / "js" / f.name).write_text(text, encoding="utf-8", newline="")
        total += len(text.encode())

    files = {
        "index.html": html,
        "styles.css": css,
        "shim-head.js": script_body(BRIDGE),
        "shim-body.js": script_body(DESKTOP) + "\n" + script_body(EXPORT_PATCH),
    }
    for name, content in files.items():
        (OUT_DIR / name).write_text(content, encoding="utf-8", newline="")
        total += len(content.encode())

    print(f"built into {OUT_DIR}:")
    print(f"  index.html + styles.css + 2 shims + {len(js_files)} js modules")
    print(f"  total {total/1024:.1f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
