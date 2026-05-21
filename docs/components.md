# UI 组件文档

## 组件总览

| 组件 | 文件 | 职责 |
|------|------|------|
| `App` | `src/App.tsx` | 应用壳，管理全局状态和数据流 |
| `ImportPanel` | `src/components/ImportPanel.tsx` | 文件/文件夹导入入口 |
| `DateNavigator` | `src/components/DateNavigator.tsx` | 日期选择与热力图导航 |
| `SummaryCards` | `src/components/SummaryCards.tsx` | 当日数据摘要卡片 |
| `DayCharts` | `src/components/DayCharts.tsx` | 波形图表与事件列表 |
| `EventTable` | `src/components/EventTable.tsx` | 事件表格（含分类筛选和定位） |
| `RawFileBrowser` | `src/components/RawFileBrowser.tsx` | 原始文件浏览器与 CSV 导出 |

## 组件层级与数据流

```
App
├── ImportPanel          ← onImport 回调
├── DateNavigator        ← dataset, selectedDate
└── main-panel
    ├── SummaryCards     ← summary (DaySummary)
    ├── DayCharts        ← dayDetail (DayDetail)
    │   └── WaveformChart
    ├── EventTable       ← events, onSelectEvent
    └── RawFileBrowser   ← rawFiles (ParsedVentilatorFile[])
```

数据从 `App` 单向流下。`App` 维护三个核心状态：

- **`dataset: DatasetIndex | null`** — 导入后构建的全局索引，包含按日期分组的文件、摘要、解析结果。
- **`selectedDate: string | null`** — 当前选中日期（`YYYY-MM-DD`）。
- **`dayDetail: DayDetail | null`** — 选中日期的详细数据（信号、事件、原始文件），由 `loadDayDetail()` 异步加载。

`App` 启动时尝试从 IndexedDB 缓存恢复上次的导入文件；导入或恢复后自动选中最后一天。

## 各组件说明

### ImportPanel

文件导入入口。提供两种选择方式：

- **选择 DATAFILE 文件夹** — 使用 `webkitdirectory` 属性，递归选中整个目录。
- **选择 EDF 文件** — 手动选择 `.edf` / `.bin` 文件。

用户选择的文件通过 `onImport(files)` 回调传回 `App`，由 `App` 调用 `buildDatasetIndex()` 构建索引。导入期间按钮禁用。

### DateNavigator

侧栏日期导航，接收完整 `dataset` 和当前 `selectedDate`。

功能：

- **跳转日期** — 日期输入框 + 跳转按钮。
- **上一天 / 下一天** — 在有序日期列表中前后移动。
- **只看缺失文件日期** — 复选框过滤，通过 `filterDays()` 筛选。
- **热力图** — 近 90 天的色块网格，按数据完整性（完整/缺失/选中）着色。
- **筛选日期列表** — 显示最近 20 天及每天的高压事件数。

### SummaryCards

四张摘要卡片，展示当前选中日期的关键指标：

| 卡片 | 数据来源 |
|------|----------|
| 使用时长 | `summary.useDurationSeconds` |
| AI / HI 事件数 | `summary.eventCounts.ai` / `.hi` |
| 压力范围 | `summary.pressureRange` |
| 缺失文件数 | `summary.missingFiles.length` |

### DayCharts

波形图表区，使用 lazy load 加载以优化首屏性能。

核心逻辑：

- **信号选择** — Tab 切换不同信号（flow、pressure、real_pres 等），切换有 200ms 延迟渲染以避免频繁重建 ECharts 实例。
- **事件标记** — 根据当前信号的 label 匹配事件类型（ai/hi → flow，ascp → pressure），将事件作为标记线渲染在波形图上。
- **事件聚焦** — 点击事件表中的行可高亮对应的事件标记，`focusedIndex` 状态控制当前聚焦的事件。
- **事件列表** — 在图表下方展示当前信号相关的事件表格，显示类型、时间、参数值。

### EventTable

事件表格组件，支持按类型筛选（AI、HI、ASCP、usetime）和定位到波形图上的具体时间点。

- 筛选标签自动根据当前日期存在的事件类型生成。
- 不同事件类型显示不同的参数列（ASCP 显示 IPAP/EPAP，AI/HI 显示持续秒数，usetime 显示时长）。
- 点击「定位」按钮触发 `onSelectEvent(seconds, timestamp)`，由父组件联动波形图滚动到对应时间位置。

> 注意：当前 `App.tsx` 中 `EventTable` 已不再直接使用（事件表格功能已合并到 `DayCharts` 中），但组件仍保留以供其他场景复用。

### RawFileBrowser

原始文件浏览器，展示当天所有解析后的文件。

每个文件以 `<details>` 折叠面板展示：

- **文件描述** — 根据文件 label 和 kind 自动生成中文说明（如"气流波形""AI 事件"等）。
- **元数据** — Label、Header 大小、Payload 大小、起止时间、数据预览。
- **BA525 配置解析** — 对 `raw_config` 类型且 payload ≥ 192 字节的文件，解析并展示配置参数表格。
- **CSV 导出** — 对波形数据导出 `index,seconds,value` 格式，对事件数据导出 `index,source,value1,value2,timestamp` 格式。

## 用户交互流程

```
1. 导入数据
   ImportPanel → 选择文件夹/文件 → handleImport()
   → buildDatasetIndex() 解析并索引
   → saveImportedFiles() 缓存到 IndexedDB

2. 浏览日期
   DateNavigator 热力图/列表 → 点击日期
   → App 切换 selectedDate
   → loadDayDetail() 异步加载该日详情

3. 查看波形与事件
   SummaryCards → 当日概要
   DayCharts → Tab 切换信号 → WaveformChart 渲染
   事件标记线叠加在波形图上，点击事件行聚焦定位

4. 导出数据
   RawFileBrowser → 展开目标文件 → 点击"导出 CSV"
   → downloadCsv() 触发浏览器下载
```

## 关键数据类型

| 类型 | 用途 |
|------|------|
| `ImportedFileRef` | 用户选择的原始文件引用 |
| `DatasetIndex` | 全局索引：按日期分组的文件、摘要、解析结果 |
| `DaySummary` | 单日摘要：使用时长、事件计数、信号存在、压力范围、缺失文件 |
| `DayDetail` | 单日详情：信号、事件、使用会话、原始文件列表 |
| `ParsedVentilatorFile` | 单文件解析结果：header + payload + values/records |
| `EventRecord` | 事件记录：sourceLabel、value1、value2、timestamp |
