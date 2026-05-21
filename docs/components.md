# 组件文档

本文档描述 `src/components/` 下各 UI 组件的职责、层级关系、数据传递方式及用户交互流程。所有内容基于实际代码分析。

## 组件概览

| 组件 | 文件 | 职责 |
|------|------|------|
| ImportPanel | `ImportPanel.tsx` | 文件/文件夹导入入口 |
| DateNavigator | `DateNavigator.tsx` | 日期选择与热力图导航 |
| SummaryCards | `SummaryCards.tsx` | 当日统计摘要卡片 |
| DayCharts | `DayCharts.tsx` | 波形图表展示与事件定位 |
| EventTable | `EventTable.tsx` | 事件列表筛选与表格展示 |
| RawFileBrowser | `RawFileBrowser.tsx` | 原始文件浏览与 CSV 导出 |

## 组件层级与数据流

```
App
├── ImportPanel              (props: disabled, onImport)
├── [通知区域: error / cacheNotice / 索引进度]
└── workbench (条件渲染，需 dataset && selectedDate)
    ├── DateNavigator        (props: dataset, selectedDate, onSelectDate)
    └── main-panel
        ├── 使用会话摘要 (App 内联渲染 usageWindow)
        ├── SummaryCards     (props: summary)
        ├── DayCharts        (props: detail)        ← 懒加载
        │   └── WaveformChart (来自 charts/)
        └── RawFileBrowser   (props: files → dayDetail.rawFiles)
```

**数据流向：** App 持有全局状态（`dataset: DatasetIndex`、`selectedDate: string`、`dayDetail: DayDetail`），通过 props 向下单向传递。子组件通过回调函数（`onImport`、`onSelectDate`）将用户操作上报给 App。

App 维护三个核心状态：

- **`dataset: DatasetIndex | null`** — 导入后构建的全局索引，包含按日期分组的文件、摘要、解析结果。
- **`selectedDate: string | null`** — 当前选中日期（`YYYY-MM-DD`）。
- **`dayDetail: DayDetail | null`** — 选中日期的详细数据（信号、事件、原始文件），由 `loadDayDetail()` 异步加载。

App 启动时尝试从 IndexedDB 缓存恢复上次的导入文件；导入或恢复后自动选中最后一天。

### 关键回调

- `onImport(files: ImportedFileRef[])` — ImportPanel 触发，App 调用 `buildDatasetIndex` 构建索引并更新全局状态。
- `onSelectDate(date: string)` — DateNavigator 触发，App 更新 `selectedDate`，触发 `loadDayDetail` 加载该日详情。

## 各组件说明

### ImportPanel

文件导入面板，提供两种导入方式：

1. **选择 DATAFILE 文件夹** — 使用 `webkitdirectory` 属性，用户选择整个文件夹，读取其中所有文件。
2. **选择 EDF 文件** — 多文件选择，仅接受 `.edf` 和 `.bin` 后缀。

用户选择的文件通过 `onImport(files)` 回调传回 App，由 App 调用 `buildDatasetIndex()` 构建索引。导入期间按钮禁用（`disabled` prop）。

### DateNavigator

左侧日期导航侧边栏，包含以下交互区域：

- **日期跳转** — `<input type="date">` 配合「跳转」按钮，min/max 限定在数据集日期范围内。
- **前后导航** — 「上一天」「下一天」按钮在有序日期列表中移动。
- **缺失文件筛选** — 复选框控制，调用 `filterDays(dataset, { missingFilesOnly })` 过滤。
- **热力图** — 近 90 天日期色块网格，按数据完整性着色：绿色（complete）表示数据完整，橙色（partial）表示有缺失文件，蓝色（active）表示当前选中日期。悬停提示显示缺失文件数。
- **筛选结果列表** — 显示最近 20 天，每行显示日期和高压事件（HI）计数。

### SummaryCards

当日统计摘要卡片组，以网格布局显示四张卡片：

| 卡片 | 数据来源 |
|------|---------|
| 使用时长 | `summary.useDurationSeconds`（自动格式化为 `Xh XXm` 或 `M:SS`） |
| AI / HI | `summary.eventCounts.ai` 和 `summary.eventCounts.hi` |
| 压力范围 | `summary.pressureRange`（min - max） |
| 缺失文件 | `summary.missingFiles.length` |

### DayCharts

波形图表展示区域，**通过 `React.lazy` 懒加载**，以优化首屏性能。功能包括：

- **信号 Tab 切换** — 将 `detail.signals`（解析后的波形文件）按信号类型（气流 flow、压力 pressure、实际压力 real_pres、实际气流 real_flow、漏气 difleak）以 Tab 形式展示。切换时有 200ms 延迟（`CHART_SWITCH_DELAY_MS`）避免快速切换时频繁重建 ECharts 实例。
- **波形渲染** — 调用 `WaveformChart` 组件（来自 `charts/`），传入采样值、采样率、时间范围、使用会话、事件标记。
- **事件标记** — 根据当前信号 label 匹配事件类型并叠加在波形图上。对应关系：`ai`/`hi` → `flow`，`ascp` → `pressure`。
- **事件表格** — 在图表下方展示当前信号相关的事件表格，显示类型、时间、参数值。点击事件行可聚焦定位到波形图上的对应时间点（`focusedIndex` 状态控制）。

### EventTable

事件列表组件，支持分类筛选与表格展示：

- **分类 Tab 筛选** — 按事件类型（AI、HI、ASCP、usetime）过滤，Tab 上显示各类型计数。Tab 自动根据当前日期存在的事件类型生成。
- **动态列** — 根据筛选类型显示不同列：ASCP 显示 IPAP/EPAP，AI/HI 显示持续秒数，usetime 显示使用时长，「全部」模式下显示详情列。
- **「定位」按钮** — 每行事件有定位按钮，调用 `onSelectEvent(secondsFromDayStart, timestamp)` 回调。

> 注意：当前 `App.tsx` 中未直接使用 EventTable 组件（事件表格功能已合并到 DayCharts 中），但组件仍保留以供其他场景复用。

### RawFileBrowser

原始文件浏览器，展示当日所有解析文件的详细信息：

- **折叠式列表** — 每个文件一个 `<details>` 折叠面板，摘要行显示文件名、自动生成的说明文字和文件类型（kind）。
- **文件说明** — 根据信号标签（label）和解析类型（kind）自动生成中文描述（如"气流波形：呼吸气流采样…""AI 事件：治疗过程中的呼吸暂停明细"等）。
- **详细元数据** — 展开后显示 Label、Header 大小、Payload 大小、起止时间、数据预览（前 12 个采样值 / 前 3 条事件记录 / 十六进制）。
- **BA525 配置解析** — 对 `raw_config` 类型且 payload ≥ 192 字节的文件，自动调用 `parseBa525ConfigRecords` 解析设备配置参数，以表格形式展示参数名、值、确认状态。多条配置记录中重复的会标注"配置与 #1 相同"。
- **CSV 导出** — 波形文件和事件文件提供「导出 CSV」按钮，调用 `downloadCsv` 在浏览器端生成并下载。波形导出 `index,seconds,value` 格式，事件导出事件记录表格。

## 用户交互流程

### 1. 导入数据

用户点击「选择 DATAFILE 文件夹」或「选择 EDF 文件」，选择文件后触发 `onImport`。App 调用 `buildDatasetIndex` 解析文件、构建索引、生成每日摘要。同时尝试将文件引用缓存到 IndexedDB（`saveImportedFiles`），下次打开页面时自动恢复。

### 2. 浏览日期

数据导入后进入工作台视图。左侧 DateNavigator 显示日期热力图和列表。用户可通过以下方式切换日期：

- 点击热力图色块
- 点击筛选结果列表中的日期行
- 使用「上一天 / 下一天」按钮
- 输入具体日期后点击「跳转」

切换日期时，App 调用 `loadDayDetail(dataset, selectedDate)` 加载该日的完整详情（波形数据、事件记录等）。

### 3. 查看摘要与波形

选中日期后，主面板上方显示：

- **使用会话摘要** — 使用时段数及各时段起止时间（App 内联渲染的 `usageWindow` 函数）。
- **SummaryCards** — 四张统计卡片：使用时长、AI/HI 事件数、压力范围、缺失文件数。
- **DayCharts** — 波形图表，通过 Tab 切换不同信号通道，事件标记叠加在波形上，下方事件表格支持聚焦定位。

### 4. 导出 CSV

在 RawFileBrowser 中，用户展开波形文件或事件文件的详情面板，点击「导出 CSV」按钮，浏览器自动下载对应 CSV 文件。
