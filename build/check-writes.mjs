// 静态约束：视图与组件只能读状态，不能直接改。
// 用法：node build/check-writes.mjs   （已挂进 bun run check）
//
// 为什么用文本扫描而不是 ESLint：
// 规则只有两条，正则足够；加 ESLint 要把整套 JS 生态拖进来，收益不抵成本。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'src-web/src/lib';
const TARGETS = ['views', 'components'];

/** 允许直接写 app 的地方（动作层自身） */
const ALLOW_FILES = new Set([]);

const RULES = [
  {
    id: 'app.write',
    re: /\bapp\.[A-Za-z_$][\w$]*\s*=(?!=)/g,
    why: '视图/组件不要直接改 app 字段，改用 store 里导出的动作（如 setCalMode / beginDragSession）'
  },
  {
    id: 'overlay.write',
    re: /\boverlay\.stack\s*(\.push|\.pop|\.splice\s*\(|=(?!=))/g,
    why: '层栈只能通过 openX / closeX / pop 修改'
  },
  {
    id: 'drag.session',
    re: /\bapp\.dragging\b/g,
    why: '拖拽会话改用 beginDragSession / endDragSession，卸载时才不会漏收尾'
  }
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(svelte|ts)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = TARGETS.flatMap((t) => walk(path.join(ROOT, t)));
const hits = [];

for (const f of files) {
  if (ALLOW_FILES.has(f)) continue;
  const src = fs.readFileSync(f, 'utf8');
  const lines = src.split('\n');
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(src))) {
      const line = src.slice(0, m.index).split('\n').length;
      const text = (lines[line - 1] || '').trim().slice(0, 120);
      // 注释里提到规则名不算违规
      if (/^\s*(\/\/|\*|\/\*)/.test(text)) continue;
      hits.push({ file: f, line, rule: rule.id, text });
    }
  }
}

if (hits.length) {
  console.error(`check-writes: ${hits.length} 处直接写入\n`);
  for (const h of hits) {
    const rule = RULES.find((r) => r.id === h.rule);
    console.error(`  ${h.file}:${h.line}  [${h.rule}]  ${h.text}`);
    if (rule) console.error(`    → ${rule.why}`);
  }
  process.exitCode = 1;
} else {
  console.log(`check-writes: OK（扫描 ${files.length} 个文件，0 处直接写入）`);
}
