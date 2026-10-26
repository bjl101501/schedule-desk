# 日程台 · Schedule Desk

一个本地优先的个人日程工作台：任务、习惯、倒数日、番茄专注、数据统计。
数据存成本机文件，可选 WebDAV 多设备同步，Windows 原生提醒，关闭窗口留驻托盘。

![界面预览](docs/preview.png)

## 功能

- **九个视图**：今天 / 最近 7 天 / 收集箱 / 日历 / 四象限 / 习惯打卡 / 倒数纪念日 / 番茄专注 / 数据统计
- **四种布局**：列表、卡片、看板（按优先级 / 清单 / 标签 / 状态 / 日期分列）、时间线
- **任务**：子任务与多天拆分、标签、清单、优先级、四象限、重复规则、艾宾浩斯复习提醒
- **日历**：年 / 月 / 周 / 多周 / 日 / 多日六种模式，拖拽改期改时
- **五套主题**：宣纸、青瓷、月白、暮色、墨蓝
- **本地优先**：数据是磁盘上的一个 JSON 文件，不依赖任何在线服务
- **可选同步**：WebDAV（坚果云、Nextcloud、群晖等），按记录时间戳合并
- **原生能力**：Windows 通知提醒、托盘常驻、关闭最小化、应用内更新

## 下载与安装

1. 到 [Releases](../../releases) 下载 `ScheduleDesk.zip`，或直接取 `ScheduleDesk.exe`
2. 解压到任意目录，双击 `ScheduleDesk.exe`
3. 首次运行会引导选择数据目录

Release 里的 exe 是**单文件**：WebView2 加载器已静态链接进程序，不需要旁边放 DLL。
只有自行用 GNU 工具链构建时，才需要把 `WebView2Loader.dll` 放在同目录。

**关于 SmartScreen**：未签名的程序首次运行可能提示「Windows 已保护你的电脑」。
两种处理方式，选一种即可：

- 解压前右键 zip → 属性 → 勾选「解除锁定」→ 确定（推荐，之后不再提示）
- 或在提示里点「更多信息 → 仍要运行」

已经解压的，可在程序目录执行 `Get-ChildItem -Recurse | Unblock-File`，
效果相同。这个提示与程序本身无关，是 Windows 对「来自网络且无下载记录的文件」
的默认拦截；用的人多了会自行消失。

运行环境：Windows 10 1809+ / Windows 11，需要 WebView2 运行时
（Windows 11 与装了 Edge 的系统自带）。

## 数据放在哪

默认 `%APPDATA%\ScheduleDesk\data\`：

```
schedule.json          主数据（schemaVersion + 记录 + 时间戳）
schedule.backup.json   上一版备份
notified.json          已发送的提醒记录
snapshots/             每日快照，保留 7 天
```

设置里可改到任意目录。指向 OneDrive / 坚果云同步盘，等于用网盘做多端同步。

### 网盘目录与 WebDAV 的区别

| | 网盘目录 | WebDAV 同步 |
|---|---|---|
| 原理 | 整个文件由网盘客户端搬运 | 应用自己拉取、按记录合并、再上传 |
| 冲突 | 网盘生成「副本」文件 | 按每条记录的修改时间取新 |
| 删除 | 依赖网盘行为 | 墓碑标记，会同步到其他设备 |

两者不要同时用在同一个目录上，否则会互相干扰。

## 更新

设置 →「检查更新」读取 GitHub Releases 的最新版本，确认后自动下载、
替换程序并重启。Release 同时提供裸 exe 与 zip：更新器取 exe，手动下载取 zip。
更新源是 `config.json` 里的 `repo` 字段（`owner/repo`）。

未认证的 GitHub API 每小时有 60 次配额，被限流时设置面板会显示具体原因，
不会提示「已是最新」。

## 从源码构建

```bash
python build/inject.py                 # src/ → src-web/build/
cd src-tauri
cargo build --release                  # 产物 target/release/schedule-desk.exe
```

`build/inject.py` 只做组装：复制 `src/` 的三个部分到 `build/`，再生成两个
桌面桥接脚本（`shim-head.js` 负责本地存储映射，`shim-body.js` 负责界面适配与导出）。
业务逻辑全部在 `src/js/` 里，构建过程不修改任何源码。

装有 Visual Studio Build Tools 的机器可直接构建，产物为单文件；
CI 使用 `windows-latest`，同样输出无需 DLL 的 exe。
本仓库开发机没有 MSVC，本地走 Rust GNU 目标，需要 MinGW binutils
（`dlltool`、`windres`）与 `WebView2Loader.dll` 同目录运行。

## 目录

```
build/inject.py               构建：src/ → build/，只做复制与组装
src-web/src/index.html        页面骨架（177 行）
src-web/src/styles.css        样式（1578 行）
src-web/src/js/               应用脚本，按功能域拆成 9 个模块：
  01-core.js                    数据库绑定 / 全局状态 / 工具
  02-model.js                   数据层 / 拆分与排期 / 示例数据
  03-ui.js                      通用 UI / 桌面面板 / 快照 / 换肤 / 计算 / 刷新
  04-views.js                   侧栏 / 清单视图
  05-dnd.js                     拖拽：排序 / 看板换列 / 日历改期 / 时间线
  06-boards.js                  四象限 / 习惯打卡 / 倒数纪念日 / 数据统计
  07-pomodoro.js                番茄专注 / 任务详情
  08-editors.js                 任务编辑器 / 快速添加 / 过滤器 / 提醒 / 习惯与纪念日编辑器
  09-app.js                     备份导出 / 导航事件 / 启动 / 每日快照 / 快捷键
src-web/build/                构建产物，不入库（Tauri 的 frontendDist）
src-tauri/src/store.rs        数据模型、原子写、快照、记录级合并
src-tauri/src/sync.rs         WebDAV 客户端
src-tauri/src/remind.rs       提醒调度
src-tauri/src/update.rs       GitHub 更新
docs/                         截图与使用说明
dist/                         本地构建输出，不入库
CHANGELOG.md                  版本记录
```

**这些源文件是唯一维护对象**，改动直接写进对应模块。`inject.py` 不再做文本替换，
只把 `src/` 复制到 `build/` 并拼上桌面桥接脚本。

## 数据兼容

`schemaVersion` 随结构演进，加载时自动迁移。v1 桌面版留在
`%APPDATA%\com.scheduledesk.app\data.json` 的数据会在首次启动时自动导入。

## 许可

界面与交互设计：workbuddy & bjl101501。
桌面端代码：MIT。
