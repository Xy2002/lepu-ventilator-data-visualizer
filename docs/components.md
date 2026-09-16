# UI 组件文档

## 组件总览

| 组件              | 文件                                              | 职责                                     |
| ----------------- | ------------------------------------------------- | ---------------------------------------- |
| `App`             | `src/App.tsx`                                     | 应用壳，管理全局状态和数据流             |
| `ImportPanel`     | `src/components/ImportPanel.tsx`                  | 文件/文件夹导入入口                      |
| `DateNavigator`   | `src/components/date-navigator/DateNavigator.tsx` | 日期选择与热力图导航                     |
| `SummaryCards`    | `src/components/SummaryCards.tsx`                 | 当日数据摘要卡片                         |
| `DayCharts`       | `src/components/DayCharts.tsx`                    | 波形图表与内嵌事件列表                   |
| `RawFileBrowser`  | `src/components/RawFileBrowser.tsx`               | 原始文件浏览器与 CSV 导出                |
| `AiAnalysisPanel` | `src/components/AiAnalysisPanel.tsx`              | AI 分析面板（OpenAI/Anthropic 流式生成） |

## 组件层级与数据流

```
App
├── ImportPanel              ← onImport 回调
├── DateNavigator            ← dataset, selectedDate, onSelectDate
└── main-panel
    ├── SummaryCards         ← summary (DaySummary)
    ├── DayCharts (lazy)     ← dayDetail (DayDetail)
    │   └── WaveformChart    ← label, values, sampleRateHz, startTime, useSessions, eventMarkers, focusedSecond/Timestamp
    ├── AiAnalysisPanel      ← summary, selectedDate, open, onToggle
    └── RawFileBrowser       ← rawFiles (ParsedVentilatorFile[])
```

数据从 `App` 单向流下。`App` 维护三个核心状态：

- **`dataset: DatasetIndex | null`** — 导入后构建的全局索引，包含按日期分组的文件、摘要、解析结果。
- **`selectedDate: string | null`** — 当前选中日期（`YYYY-MM-DD`）。
- **`dayDetail: DayDetail | null`** — 选中日期的详细数据（信号、事件、原始文件），由 `loadDayDetail()` 异步加载。

`App` 启动时尝试从 IndexedDB 缓存恢复上次的导入数据；导入或恢复后自动选中最后一天。

## 各组件说明

### ImportPanel

文件导入入口。提供两种选择方式：

- **选择 DATAFILE 文件夹** — 使用 `webkitdirectory` 属性，递归选中整个目录。
- **选择 EDF 文件** — 手动选择 `.edf` / `.bin` 文件。

Props：

- `disabled: boolean` — 索引进行中时禁用按钮
- `onImport: (files: ImportedFileRef[]) => void` — 选择完成回调

用户选择的文件通过 `onImport(files)` 回调传回 `App`，由 `App` 调用 `buildDatasetIndex()` 构建索引。

### DateNavigator

侧栏日期导航，接收完整 `dataset` 和当前 `selectedDate`。位于 `src/components/date-navigator/`，由多个子组件组成：

| 子组件              | 职责                                                    |
| ------------------- | ------------------------------------------------------- |
| `NavigatorControls` | 跳转输入、上一天/下一天、位置指示、无效日期提示         |
| `FilterPanel`       | 可折叠的筛选面板（时间范围/事件类型/缺失文件/最短时长） |
| `DayHeatmap`        | 全量日期热力图（限高滚动）与图例                        |
| `FilteredDayList`   | 筛选结果列表与摘要 CSV 导出                             |
| `navigatorUtils.ts` | 纯函数：筛选条件构建、热力强度、范围内相邻日期计算等    |

Props：

- `dataset: DatasetIndex` — 全局数据索引
- `selectedDate: string` — 当前选中日期
- `onSelectDate: (date: string) => void` — 日期变更回调

功能：

- **跳转日期** — 输入框始终跟随当前选中日期；输入有效日期后立即跳转，无需单独的跳转按钮
- **无效日期提示** — 输入没有数据的日期时提示最近的有数据日期，可一键跳转（不再静默失败）
- **上一天 / 下一天** — 在「导航范围」内前后移动；未启用筛选时范围为全部日期，启用筛选后只在筛选结果内切换，并显示「第 x / n 天」位置指示；支持侧栏内 ← / → 键盘切换
- **筛选** — 时间范围、事件类型、只看缺失文件日期、最短使用时长，通过 `filterDays()` 计算，同时约束前后切换、热力图下的列表与 CSV 导出
- **热力图** — 全量日期的色块网格（容器限高滚动，选中格自动滚入视野），按数据完整性着色（完整 = 绿色，缺失 = 黄色，选中 = 高亮）
- **筛选日期列表** — 显示最近 20 天及每天的低通气（HI）事件数，当前选中日期高亮

### SummaryCards

四张摘要卡片，展示当前选中日期的关键指标：

| 卡片           | 数据来源                                                    |
| -------------- | ----------------------------------------------------------- |
| 使用时长       | `summary.useDurationSeconds`（格式化为 `Xh XXm` 或 `M:SS`） |
| AI / HI 事件数 | `summary.eventCounts.ai` / `.hi`                            |
| 压力范围       | `summary.pressureRange.min` - `.max`                        |
| 缺失文件数     | `summary.missingFiles.length`                               |

Props：

- `summary: DaySummary` — 当日摘要

### DayCharts

波形图表区，使用 `React.lazy` + `Suspense` 延迟加载以优化首屏性能。

Props：

- `detail: DayDetail` — 当日完整详情

核心逻辑：

- **信号选择** — Tab 切换不同信号（flow=气流、pressure=压力、real_pres=实际压力、real_flow=实际气流、difleak=漏气），切换有 200ms 延迟渲染以避免频繁重建 ECharts 实例
- **事件匹配** — 根据当前信号的 label 匹配事件类型：`ai`/`hi` → `flow`，`ascp` → `pressure`
- **事件标记** — 匹配的事件作为标记线（markLine）渲染在波形图上，样式由 `EVENT_STYLES` 定义
- **事件聚焦** — 点击内嵌事件表中的行可触发波形图滚动到对应时间位置（通过 `focusedSecond` / `focusedTimestamp` 控制 dataZoom）
- **内嵌事件表** — 图表下方展示当前信号相关的事件，按类型显示不同列（ASCP: IPAP/EPAP，AI/HI: 持续秒数）

### RawFileBrowser

原始文件浏览器，展示当天所有解析后的文件。

Props：

- `files: ParsedVentilatorFile[]` — 当日所有解析文件

每个文件以 `<details>` 折叠面板展示：

- **文件描述** — 根据文件 label 和 kind 自动生成中文说明（如"气流波形""AI 事件""配置快照"等）
- **元数据** — Label、Header 大小、Payload 大小、起止时间、数据预览（前 12 个采样值或前 3 条事件）
- **BA525 配置解析** — 对 `raw_config` 类型且 payload ≥ 192 字节的文件，解析为配置记录表格，显示已确认/交叉验证字段的参数、值和状态
- **CSV 导出** — 对波形数据导出 `index,seconds,value` 格式，对事件数据导出 `index,source,value1,value2,timestamp,secondsFromDayStart` 格式

### AiAnalysisPanel

AI 分析面板，支持调用 OpenAI 或 Anthropic 兼容 API 流式生成当日数据分析报告。

Props：

- `summary: DaySummary | null` — 当日摘要
- `selectedDate: string | null` — 当前选中日期
- `open: boolean` — 面板展开状态
- `onToggle: () => void` — 展开/收起切换

核心逻辑：

- **折叠/展开** — 折叠时显示为带 🤖 图标的触发按钮
- **API 设置** — 支持 OpenAI 兼容和 Anthropic 兼容两种 provider，可配置 endpoint、API Key、模型名称。设置存储在 localStorage
- **自定义 Prompt** — 支持附加用户自定义 prompt，与数据摘要拼接发送
- **报告生成** — 调用 `streamChat()` SSE 流式生成，实时更新报告内容
- **报告缓存** — 以日期 + provider + model + customPrompt 组合为 key 缓存到 IndexedDB，避免重复调用 API
- **缓存恢复** — 切换日期或修改设置时自动加载已有缓存报告

## 用户交互流程

```
1. 导入数据
   ImportPanel → 选择文件夹/文件 → handleImport()
   → buildDatasetIndex() 解析并索引
   → saveImportedFiles() + saveParsedDataset() 缓存到 IndexedDB

2. 浏览日期
   DateNavigator 热力图/列表 → 点击日期
   → App 切换 selectedDate
   → loadDayDetail() 异步加载该日详情

3. 查看波形与事件
   SummaryCards → 当日概要
   DayCharts → Tab 切换信号 → WaveformChart 渲染
   事件标记线叠加在波形图上，点击内嵌事件表中的行聚焦定位

4. AI 分析
   AiAnalysisPanel → 配置 API 设置 → 点击「生成分析」
   → 流式接收报告 → 自动缓存

5. 导出数据
   RawFileBrowser → 展开目标文件 → 点击"导出 CSV"
   → downloadCsv() 触发浏览器下载
```

## 关键数据类型

| 类型                   | 用途                                                                  |
| ---------------------- | --------------------------------------------------------------------- |
| `ImportedFileRef`      | 用户选择的原始文件引用（name + path + File 对象）                     |
| `DatasetIndex`         | 全局索引：按日期分组的文件、摘要、解析结果                            |
| `DaySummary`           | 单日摘要：使用时长、事件计数、信号存在、压力范围、缺失文件            |
| `DayDetail`            | 单日详情：信号、事件、使用会话、原始文件列表                          |
| `ParsedVentilatorFile` | 单文件解析结果：header + payload + values/records                     |
| `EventRecord`          | 事件记录：sourceLabel、value1、value2、timestamp、secondsFromDayStart |
| `UseSession`           | 使用会话：startTime、endTime、durationSeconds                         |
