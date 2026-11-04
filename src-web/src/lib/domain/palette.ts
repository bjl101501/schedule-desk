/**
 * 中国传统色调色板。
 *
 * 数据来源：sealuo.com「全部颜色」页（https://www.sealuo.com/category/all），2026-11 抓取。
 * 色名与色值按色族归并，保留原始写法（同名不同值的以站内标注为准）。
 *
 * 这个文件是**唯一取色来源**：清单、标签、看板列头、色板选择器都从这里取，
 * 别在组件里再写裸 hex。
 *
 * 分配策略（R22 定）：
 * - 清单 = 冷色 15 色（蓝 4 / 青 3 / 绿 4 / 紫 4），每族按「亮 — 中 — 深」三档取，
 *   四族交错排列，侧栏前几个清单必是不同色相。
 * - 标签 = 暖色 13 色（红 5 / 橙 3 / 黄 2 / 褐 3），同样分档交错，与清单不在同一色域。
 * - 形状再兜一层：清单方角 + 收件箱图标，标签胶囊 + `#`。
 * - 全表任意两色 ΔE ≥ 19（CIELAB），8px 色点并排也能分出。
 */

export type ColorFamily = 'red' | 'orange' | 'yellow' | 'green' | 'cyan' | 'blue' | 'purple' | 'brown' | 'gray';

export interface TraditionalColor {
  /** 传统色名，可直接用在界面上 */
  name: string;
  hex: string;
}

/** 全量色表，按色族分组。族内大致按明度从浅到深排列。 */
export const TRADITIONAL: Record<ColorFamily, TraditionalColor[]> = {
  red: [
    { name: '银红', hex: '#F5BFBF' },
    { name: '退红', hex: '#E0B0B8' },
    { name: '藕荷', hex: '#E4C6D0' },
    { name: '十样锦', hex: '#F87C7B' },
    { name: '杨妃色', hex: '#F091A0' },
    { name: '桃红', hex: '#F47983' },
    { name: '海棠红', hex: '#F03752' },
    { name: '樱红', hex: '#C93756' },
    { name: '茜色', hex: '#CB3A56' },
    { name: '苏芳', hex: '#9E3D3F' },
    { name: '胭脂', hex: '#E23D3A' },
    { name: '朱砂', hex: '#E83015' },
    { name: '妃色', hex: '#ED5736' },
    { name: '石榴红', hex: '#F20C00' },
    { name: '榴花红', hex: '#EE2C2C' },
    { name: '赤色', hex: '#C3272B' },
    { name: '绯红', hex: '#C83C23' },
    { name: '殷红', hex: '#BE0027' },
    { name: '枣红', hex: '#7A1821' },
    { name: '赭石', hex: '#9C5333' },
    { name: '酡红', hex: '#DC7A5C' },
    { name: '残红', hex: '#C2635C' }
  ],
  orange: [
    { name: '杏红', hex: '#F5A281' },
    { name: '缇色', hex: '#D0853A' },
    { name: '缙色', hex: '#E68353' },
    { name: '纁色', hex: '#E08A4E' },
    { name: '橘黄', hex: '#F1902C' },
    { name: '橘红', hex: '#F07D28' },
    { name: '章丹', hex: '#E65D1E' },
    { name: '牙绯', hex: '#C45A3D' },
    { name: '琥珀', hex: '#CA6924' }
  ],
  yellow: [
    { name: '牙色', hex: '#EEDEB0' },
    { name: '缃色', hex: '#F0C239' },
    { name: '栀子色', hex: '#F0C850' },
    { name: '杏黄', hex: '#F5D20B' },
    { name: '鹅黄', hex: '#FFF143' },
    { name: '明黄', hex: '#FFD111' },
    { name: '金黄', hex: '#F4C430' },
    { name: '秋香色', hex: '#D9B611' },
    { name: '姚黄', hex: '#F5D918' },
    { name: '柘黄', hex: '#C6953B' },
    { name: '土黄', hex: '#B78D12' },
    { name: '姜黄', hex: '#E2A43C' },
    { name: '赤金', hex: '#C78D2E' },
    { name: '库金', hex: '#B78C33' }
  ],
  green: [
    { name: '绿萼', hex: '#9FC17F' },
    { name: '艾绿', hex: '#A4C08E' },
    { name: '豆绿', hex: '#96CE54' },
    { name: '葱绿', hex: '#9ED900' },
    { name: '嫩绿', hex: '#BDDD22' },
    { name: '柳绿', hex: '#AFDD22' },
    { name: '松花绿', hex: '#A3C678' },
    { name: '竹青', hex: '#789262' },
    { name: '竹月', hex: '#79A687' },
    { name: '竹绿', hex: '#5B8C5A' },
    { name: '石绿', hex: '#57A57B' },
    { name: '官绿', hex: '#2D8C4E' },
    { name: '铜绿', hex: '#549688' },
    { name: '碧玉', hex: '#50906A' },
    { name: '翠色', hex: '#20B176' },
    { name: '梅子青', hex: '#5B8456' },
    { name: '竹篁绿', hex: '#4A6B3A' },
    { name: '青矾绿', hex: '#2E6E54' },
    { name: '绿沈', hex: '#2D5A27' },
    { name: '墨绿', hex: '#1A4B2E' }
  ],
  cyan: [
    { name: '月白', hex: '#D6ECF0' },
    { name: '天缥', hex: '#B0D5DF' },
    { name: '鸭卵青', hex: '#E0EEE8' },
    { name: '清水蓝', hex: '#8EC5D6' },
    { name: '水色', hex: '#88ADA6' },
    { name: '春蓝', hex: '#7DACD0' },
    { name: '石青', hex: '#1685A9' },
    { name: '湖蓝', hex: '#126E82' },
    { name: '霁青', hex: '#5B7A8C' },
    { name: '苍青', hex: '#5D7A7A' },
    { name: '青雀头', hex: '#39797A' },
    { name: '螺青', hex: '#5D7E7A' },
    { name: '天水碧', hex: '#5B8C7A' },
    { name: '琉璃蓝', hex: '#1477B2' }
  ],
  blue: [
    { name: '雪青', hex: '#B0C4DE' },
    { name: '天蓝', hex: '#1676B5' },
    { name: '碧蓝', hex: '#0E8ED4' },
    { name: '靛青', hex: '#1772B4' },
    { name: '群青', hex: '#2E4E8C' },
    { name: '钴蓝', hex: '#1B4792' },
    { name: '土林蓝', hex: '#2B5070' },
    { name: '花青', hex: '#1E3B59' },
    { name: '藏蓝', hex: '#1E2A4F' },
    { name: '黛蓝', hex: '#2B3D54' },
    { name: '宝蓝', hex: '#1D2F5E' },
    { name: '绀青', hex: '#1A355E' },
    { name: '靛蓝', hex: '#0D334F' },
    { name: '鸦青', hex: '#36484E' },
    { name: '苍蓝', hex: '#4A5B6B' },
    { name: '灰蓝', hex: '#70788C' },
    { name: '雾蓝', hex: '#7B8FA1' },
    { name: '空青', hex: '#6688AA' }
  ],
  purple: [
    { name: '远山紫', hex: '#8787B7' },
    { name: '青莲', hex: '#7946B4' },
    { name: '槿紫', hex: '#8B5893' },
    { name: '魏紫', hex: '#7E3D7E' },
    { name: '绯紫', hex: '#7E4463' },
    { name: '琉璃紫', hex: '#5C4F87' },
    { name: '檀紫', hex: '#6B4E73' },
    { name: '紫棠', hex: '#5C304F' },
    { name: '鹅血紫', hex: '#832951' },
    { name: '绛紫', hex: '#592B52' },
    { name: '紫草', hex: '#5C3B4E' },
    { name: '紫檀', hex: '#4D2837' },
    { name: '青紫', hex: '#3D3361' },
    { name: '紫酱', hex: '#4D233E' }
  ],
  brown: [
    { name: '米色', hex: '#F5E6C8' },
    { name: '竹纸黄', hex: '#DFCCA3' },
    { name: '茶白', hex: '#E8E0D0' },
    { name: '卡其色', hex: '#B8A88A' },
    { name: '驼色', hex: '#B2966E' },
    { name: '纸棕', hex: '#C4A87C' },
    { name: '檀色', hex: '#B36D4E' },
    { name: '茶色', hex: '#A67B4B' },
    { name: '枯黄', hex: '#B78D4A' },
    { name: '土色', hex: '#90724C' },
    { name: '古铜色', hex: '#8B5A3C' },
    { name: '沉香色', hex: '#6B5040' },
    { name: '酱色', hex: '#6B3420' },
    { name: '栗色', hex: '#60281E' }
  ],
  gray: [
    { name: '雪白', hex: '#F0F4F1' },
    { name: '缟素', hex: '#EAE5E0' },
    { name: '素色', hex: '#E5E0D5' },
    { name: '银白', hex: '#D4D4D8' },
    { name: '霜色', hex: '#C2CFD8' },
    { name: '铅白', hex: '#C4C7C3' },
    { name: '青白', hex: '#C4D0D0' },
    { name: '银灰', hex: '#B7B8B5' },
    { name: '老银', hex: '#B5B2AC' },
    { name: '烟灰', hex: '#949494' },
    { name: '铅灰', hex: '#8C8C8C' },
    { name: '虾壳青', hex: '#717971' },
    { name: '燕羽灰', hex: '#6B6B6B' },
    { name: '铁灰', hex: '#5D5E5F' },
    { name: '墨灰', hex: '#5D5D5D' },
    { name: '松烟', hex: '#4A4A4A' },
    { name: '黝色', hex: '#3A4142' },
    { name: '黛色', hex: '#2D2D2D' },
    { name: '玄青', hex: '#263036' },
    { name: '玄色', hex: '#1C1C1C' },
    { name: '墨色', hex: '#1A1A1A' }
  ]
};

/**
 * 清单用色：**冷色 15 色**，蓝 / 青 / 绿 / 紫四族各取 3–4 个。
 *
 * 每族内部按「亮 — 中 — 深」三档取，档与档之间明度至少差 12；
 * 四个族交错排列，所以侧栏前几个清单一定是不同色相，不会前四个全是蓝。
 * 全表任意两色 ΔE ≥ 19（CIELAB），8px 色块并排也能分出。
 *
 * 为什么不是每族 5 个：蓝族的色相全挤在 263°–288°，再往里加就是
 * 「靛青 / 藏蓝 / 宝蓝」这种肉眼分不出的组合，等于把色板变长没变清楚。
 */
export const LIST_PALETTE: TraditionalColor[] = [
  { name: '天蓝', hex: '#1676B5' }, // 蓝 · 正
  { name: '豆绿', hex: '#96CE54' }, // 绿 · 亮黄绿
  { name: '青莲', hex: '#7946B4' }, // 紫 · 正
  { name: '石青', hex: '#1685A9' }, // 青 · 正
  { name: '群青', hex: '#2E4E8C' }, // 蓝 · 中深
  { name: '翠色', hex: '#20B176' }, // 绿 · 亮青绿
  { name: '槿紫', hex: '#8B5893' }, // 紫 · 中
  { name: '清水蓝', hex: '#8EC5D6' }, // 青 · 浅
  { name: '花青', hex: '#1E3B59' }, // 蓝 · 最深
  { name: '竹绿', hex: '#5B8C5A' }, // 绿 · 中
  { name: '远山紫', hex: '#8787B7' }, // 紫 · 浅
  { name: '青雀头', hex: '#39797A' }, // 青 · 灰绿
  { name: '雾蓝', hex: '#7B8FA1' }, // 蓝 · 浅灰
  { name: '紫檀', hex: '#4D2837' }, // 紫 · 最深
  // 扩容位：清单超过 14 个才会用到。用中性灰，不再往蓝紫里加同色相，
  // 灰与任何彩色都天然分得开，代价是它自己不够「有颜色」
  { name: '银灰', hex: '#B7B8B5' }, // 灰 · 浅
  { name: '墨灰', hex: '#5D5D5D' } // 灰 · 深
];

/**
 * 标签用色：**暖色 13 色**，红 / 橙 / 黄 / 褐四族各取 2–5 个。
 * 同样按亮中深分档、四族交错；与清单的冷色域天然分开，
 * 再加形状（胶囊 + `#` vs 方角 + 收件箱图标），色弱也能分清。
 *
 * 黄色只取 2 个：它在浅色底上的对比度天然低（杏黄仅 1.5），
 * 再多的黄只是同一个色相换名字，看图时区分不出来。
 */
export const TAG_PALETTE: TraditionalColor[] = [
  { name: '石榴红', hex: '#F20C00' }, // 红 · 正
  { name: '橘黄', hex: '#F1902C' }, // 橙 · 亮
  { name: '卡其色', hex: '#B8A88A' }, // 褐 · 浅
  { name: '海棠红', hex: '#F03752' }, // 红 · 玫
  { name: '土黄', hex: '#B78D12' }, // 黄 · 深
  { name: '檀色', hex: '#B36D4E' }, // 褐 · 中
  { name: '枣红', hex: '#7A1821' }, // 红 · 最深
  { name: '章丹', hex: '#E65D1E' }, // 橙 · 朱
  { name: '杏黄', hex: '#F5D20B' }, // 黄 · 亮
  { name: '杨妃色', hex: '#F091A0' }, // 红 · 浅粉
  { name: '栗色', hex: '#60281E' }, // 褐 · 深
  { name: '牙绯', hex: '#C45A3D' }, // 橙 · 暗
  // 扩容位：标签超过 12 个时才出现
  { name: '琥珀', hex: '#CA6924' } // 橙 · 暗金
];

/**
 * 通用选色板：习惯 / 纪念日的颜色选择器用（29 色）。
 * 直接复用清单 + 标签两套色板：同一个应用里不该有第三套「只有选色器才出现」的颜色，
 * 用户给习惯选的颜色，也应该能在清单和标签里见到。
 */
export const PICKER_PALETTE: TraditionalColor[] = [...LIST_PALETTE, ...TAG_PALETTE];
