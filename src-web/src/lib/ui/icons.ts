/*
  图标表。能对上 lucide 的走 lucide，形状差太多的保留自制 path。

  逐路径导入（`@lucide/svelte/icons/xxx`）而不是包根 named import：
  包根是 8600+ 文件的 barrel，虽然 sideEffects:false 能摇掉，
  但每次冷构建都要多解析一遍；逐路径导入只带走真正用到的 42 个。

  key 沿用旧 ICONS 的名字（chevL / chevD / close …），<Icon name="…"> 的
  94 处调用点一行不用改。
*/
import type { Component } from 'svelte';

import Archive from '@lucide/svelte/icons/archive';
import Bell from '@lucide/svelte/icons/bell';
import BookOpen from '@lucide/svelte/icons/book-open';
import Calendar from '@lucide/svelte/icons/calendar';
import Check from '@lucide/svelte/icons/check';
import ChevronDown from '@lucide/svelte/icons/chevron-down';
import ChevronLeft from '@lucide/svelte/icons/chevron-left';
import ChevronRight from '@lucide/svelte/icons/chevron-right';
import Clock from '@lucide/svelte/icons/clock';
import Coffee from '@lucide/svelte/icons/coffee';
import Copy from '@lucide/svelte/icons/copy';
import Download from '@lucide/svelte/icons/download';
import Ellipsis from '@lucide/svelte/icons/ellipsis';
import Filter from '@lucide/svelte/icons/filter';
import Flag from '@lucide/svelte/icons/flag';
import Flame from '@lucide/svelte/icons/flame';
import GripVertical from '@lucide/svelte/icons/grip-vertical';
import Heart from '@lucide/svelte/icons/heart';
import Inbox from '@lucide/svelte/icons/inbox';
import LayoutGrid from '@lucide/svelte/icons/layout-grid';
import Lightbulb from '@lucide/svelte/icons/lightbulb';
import List from '@lucide/svelte/icons/list';
import Menu from '@lucide/svelte/icons/menu';
import Moon from '@lucide/svelte/icons/moon';
import Palette from '@lucide/svelte/icons/palette';
import Pause from '@lucide/svelte/icons/pause';
import Play from '@lucide/svelte/icons/play';
import Plus from '@lucide/svelte/icons/plus';
import RefreshCw from '@lucide/svelte/icons/refresh-cw';
import Repeat from '@lucide/svelte/icons/repeat';
import Rocket from '@lucide/svelte/icons/rocket';
import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
import RotateCw from '@lucide/svelte/icons/rotate-cw';
import Search from '@lucide/svelte/icons/search';
import Settings from '@lucide/svelte/icons/settings';
import SquarePen from '@lucide/svelte/icons/square-pen';
import Star from '@lucide/svelte/icons/star';
import Sun from '@lucide/svelte/icons/sun';
import Tag from '@lucide/svelte/icons/tag';
import Target from '@lucide/svelte/icons/target';
import Trash2 from '@lucide/svelte/icons/trash-2';
import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
import Upload from '@lucide/svelte/icons/upload';
import X from '@lucide/svelte/icons/x';

/** 名字 → lucide 组件。图标组件的 `size` / `class` 由 <Icon> 统一传。 */
export const LUCIDE_ICONS: Record<string, Component<any>> = {
  check: Check,
  box: Archive,
  plus: Plus,
  clock: Clock,
  calendar: Calendar,
  bell: Bell,
  tag: Tag,
  flag: Flag,
  trash: Trash2,
  edit: SquarePen,
  close: X,
  chevL: ChevronLeft,
  chevR: ChevronRight,
  chevD: ChevronDown,
  play: Play,
  pause: Pause,
  reset: RotateCcw,
  redo: RotateCw,
  more: Ellipsis,
  drag: GripVertical,
  target: Target,
  fire: Flame,
  refresh: RefreshCw,
  download: Download,
  upload: Upload,
  bulb: Lightbulb,
  inbox: Inbox,
  grid: LayoutGrid,
  list: List,
  repeat: Repeat,
  copy: Copy,
  filter: Filter,
  search: Search,
  menu: Menu,
  alert: TriangleAlert,
  rocket: Rocket,
  star: Star,
  book: BookOpen,
  heart: Heart,
  coffee: Coffee,
  moon: Moon,
  palette: Palette,
  sun: Sun,
  settings: Settings
};

/*
  这 5 个没有 lucide 同形，换过去会变成另一张图：
  split    子项拆分的「三节点分叉」，Split / GitBranch 都不是这个形状
  card     卡片视图的 18×16 圆角卡片 + 分隔线
  kanban   三根不等高的圆角柱，SquareKanban 是「外框 + 三竖线」
  timeline 横轴 + 两个错位圆角块
  trend    坐标轴 + 折线，ChartLine 少了左侧纵轴
*/
export const CUSTOM_ICONS: Record<string, string> = {
  split: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="12" r="2"/><path d="M6 7v10"/><path d="M18 10V7.5A2.5 2.5 0 0 0 15.5 5H8"/><path d="M18 14v.5a2.5 2.5 0 0 1-2.5 2.5H8"/>',
  card: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/>',
  kanban: '<rect x="3" y="3" width="5" height="18" rx="1.5"/><rect x="10" y="3" width="5" height="12" rx="1.5"/><rect x="17" y="3" width="4" height="15" rx="1.5"/>',
  timeline: '<path d="M3 12h18"/><rect x="6" y="6" width="6" height="4" rx="1"/><rect x="13" y="15" width="6" height="4" rx="1"/>',
  trend: '<path d="M3 3v18h18"/><path d="M7 15l3.5-4 3 2.5L20 7"/>'
};
