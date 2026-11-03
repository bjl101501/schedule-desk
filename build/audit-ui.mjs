/*
  界面静态巡检（R21 新增，挂进 bun run check）。
  专门抓「读一眼代码就能看出来」的低级缺陷：
    - 确认按钮文案写死成「确认删除」，在恢复/导入/清空场景下张冠李戴
    - 勾选框 / 子项行没有从拖拽里排除，点一下就变成拖走整行
    - 用户输入（标题 / 清单名 / 标签名）被塞进 {@html}，含 < 会截断、含脚本会执行
    - 纯图标按钮没有 aria-label 或 title，读屏只会念 "button"
*/

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', 'src-web', 'src');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(svelte|ts|css)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk(ROOT);

// 允许使用 {@html} 的白名单（内容固定来自代码常量，不含任何用户输入）：
// - Icon.svelte：静态 SVG 片段
// - Flags.svelte：四象限小图标的 4 个固定 SVG 矩形（quadGlyph）
const HTML_OK = new Set(['lib/ui/Icon.svelte', 'lib/components/Flags.svelte']);

const severe = [];
const hints = [];
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');

for (const f of files) {
  const name = rel(f);
  const src = fs.readFileSync(f, 'utf8');

  // 1）用户内容进 HTML 解析：标题里带 < 就会截断文案，带 <img onerror> 更糟
  if (/\.svelte$/.test(name) && src.includes('{@html') && !HTML_OK.has(name)) {
    severe.push(`${name} 使用了 {@html}；若插值里可能含用户输入，改用纯文本或先转义`);
  }

  // 2）共用弹窗把按钮文案写死：恢复类操作会显示成「确认删除」
  if (/^lib\/(ui|components)\//.test(name) && />(确认删除|确认清空|确认恢复|确认替换)</.test(src) && !/okText/.test(src)) {
    severe.push(`${name} 里确认按钮文案写死；应读 req.okText，让调用方决定`);
  }

  // 3）勾选框是 div 时，必须被 drag.ts 的 NO_DRAG 排除，或显式标 data-nodrag
  if (/\.svelte$/.test(name) && /class="chk\b/.test(src)) {
    const dragSrc = fs.readFileSync(path.join(ROOT, 'lib/actions/drag.ts'), 'utf8');
    if (!dragSrc.includes('.chk') && !src.includes('data-nodrag')) {
      severe.push(`${name} 含 .chk 但未被拖拽排除：在勾选框上按下并移动会拖走整行`);
    }
  }

  // 4）纯图标按钮缺可读名称：读屏只会念 "button"（必须紧跟 </button> 才算纯图标按钮，带文字标签的不算）
  if (/\.svelte$/.test(name)) {
    const btns = src.match(/<button\b[^>]*>\s*<Icon\b[^>]*\/>\s*<\/button>/g) || [];
    const bare = btns.filter((s) => !/aria-label|title=/.test(s));
    if (bare.length) hints.push(`${name} 有 ${bare.length} 个纯图标按钮没有 aria-label / title`);
  }
}

console.log(`audit-ui: 扫描 ${files.length} 个文件，严重 ${severe.length} 项，提示 ${hints.length} 项`);
for (const s of severe) console.error('  [严重] ' + s);
for (const h of hints) console.log('  [提示] ' + h);

if (severe.length) process.exit(1);
