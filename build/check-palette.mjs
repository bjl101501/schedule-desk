/*
  色板自检：清单与标签两套色板里，同一类内部任意两色的 CIELAB 色差必须 ≥ 17。
  低于这个值，8px 的色点并排时肉眼分不出，等于色板白加了。

  为什么是 17：ΔE 10–20 属于「一眼能看出不同」，17 是这条区间的稳妥下限；
  清单实测 19、标签实测 17，留了一点余量给以后微调。
*/
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src-web/src/lib/domain/palette.ts');
const src = fs.readFileSync(SRC, 'utf8');

function takeArray(name) {
  const m = src.match(new RegExp(`export const ${name}: TraditionalColor\\[\\] = \\[([\\s\\S]*?)\\n\\];`));
  if (!m) throw new Error(`palette.ts 里找不到 ${name}`);
  const out = [];
  const re = /\{ name: '([^']+)', hex: '(#[0-9A-Fa-f]{6})' \}/g;
  let c;
  while ((c = re.exec(m[1]))) out.push({ name: c[1], hex: c[2].toUpperCase() });
  return out;
}

const srgb = (v) => {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
function lab(hex) {
  const r = srgb(parseInt(hex.slice(1, 3), 16));
  const g = srgb(parseInt(hex.slice(3, 5), 16));
  const b = srgb(parseInt(hex.slice(5, 7), 16));
  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
const dE = (a, b) => {
  const A = lab(a), B = lab(b);
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
};

const MIN = 17;
const problems = [];

for (const [label, name, minCount] of [
  ['清单', 'LIST_PALETTE', 12],
  ['标签', 'TAG_PALETTE', 10]
]) {
  const arr = takeArray(name);
  if (arr.length < minCount) {
    problems.push(`${label}色板只有 ${arr.length} 色，少于 ${minCount} 个：再挑几个同族不同明度的色`);
    continue;
  }
  const dup = new Set();
  arr.forEach((c) => {
    if (dup.has(c.hex)) problems.push(`${label}色板里 ${c.name} 的色值重复`);
    dup.add(c.hex);
  });
  let worst = { d: Infinity };
  for (let i = 0; i < arr.length; i++)
    for (let j = i + 1; j < arr.length; j++) {
      const d = dE(arr[i].hex, arr[j].hex);
      if (d < worst.d) worst = { d, a: arr[i].name, b: arr[j].name };
    }
  if (worst.d < MIN) {
    problems.push(
      `${label}色板「${worst.a}」与「${worst.b}」色差仅 ${Math.round(worst.d)}，低于 ${MIN}：并排时分不出，换掉其中一个`
    );
  } else {
    const hint = arr.filter((c) => c.hex).length;
    console.log(`  ${label} ${hint} 色，最小色差 ${Math.round(worst.d)}（${worst.a} / ${worst.b}）`);
  }
}

if (problems.length) {
  console.error('check-palette: 失败');
  problems.forEach((p) => console.error('  · ' + p));
  process.exit(1);
}
console.log('check-palette: OK');
