/* 2×2 象限小格子：选中那格实心、其余淡底，13px 下也能看出在哪一象限 */
export function quadGlyph(q: string): string {
  const cell = [
    ['0.6', '0.6'],
    ['5.4', '0.6'],
    ['0.6', '5.4'],
    ['5.4', '5.4']
  ];
  const on = q === 'q1' ? 0 : q === 'q2' ? 1 : q === 'q3' ? 3 : 2;
  let r = '';
  for (let i = 0; i < 4; i++) {
    r +=
      '<rect x="' + cell[i][0] + '" y="' + cell[i][1] + '" width="4" height="4" rx="1.2" ' +
      (i === on ? 'fill="currentColor" opacity=".95"' : 'fill="currentColor" opacity=".16"') +
      '/>';
  }
  return '<svg viewBox="0 0 10 10" width="13" height="13" aria-hidden="true">' + r + '</svg>';
}
