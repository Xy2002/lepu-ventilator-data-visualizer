# UI 组件文档

本文档描述呼吸机数据可视化工具的各 UI 组件、它们的层级关系、核心 props 以及用户交互流程。

## 组件层级

```
App
├── ImportPanel            （顶部栏，文件导入）
├── DateNavigator          （左侧栏，日期选择与导航）
└── main-panel             （右侧主内容区）
    ├── SummaryCards       （摘要卡片）
    ├── DayCharts          （波形图表 + 事件列表，懒加载）
    │   └── WaveformChart  （ECharts 波形渲染）
    ├── AiAnalysisPanel    （AI 分析面板）
    └── RawFileBrowser     （原始文件浏览 + CSV 导出）
```

所有状态集中在 `App` 中管理（`useState`），通过 props 向下传递。没有使用 Context 或状态管理库。

---

## 各组件说明

### App（`src/App.tsx`）

应用根组件。负责全局状态管理和数据生命周期：

- **dataset**：`DatasetIndex | null` — 导入后的全部数据索引
- **selectedDate**：当前选中日期
- **dayDetail**：选中日期的完整解析数据（含波形、事件、原始文件）
- **aiPanelOpen**：AI 分析面板展开状态

启动时自动尝试从 IndexedDB 缓存恢复上次导入（`loadParsedDatasetDirect` → `loadImportedFiles` → `buildDatasetIndex`）。选中日期变化时自动调用 `loadDayDetail` 加载当天详情。

`DayCharts` 通过 `React.lazy` 懒加载，减少首屏包体积。

---

### ImportPanel（`src/components/ImportPanel.tsx`）

文件导入入口。提供两个按钮：

| 按钮 | 行为 |
|------|------|
| 选择 DATAFILE 文件夹 | 打开文件夹选择器（`webkitdirectory`），接收整个 DATAFILE 目录 |
| 选择 EDF 文件 | 打开多文件选择器（`.edf`, `.bin`） |

将选中的文件转为 `ImportedFileRef[]` 后通过 `onImport` 回调交给 `App.handleImport`。

核心 props：

- **disabled**：索引进行中时禁用按钮
- **onImport(files)**：用户选择文件后触发

---

### DateNavigator（`src/components/DateNavigator.tsx`）

左侧栏日期导航组件。提供三种导航方式：

1. **日期跳转**：`<input type="date">` 输入框 + "跳转"按钮
2. **前后翻页**："上一天" / "下一天" 按钮
3. **热力图**：近 90 天的可视化热力图，颜色区分"完整"和"缺失文件"状态，点击直接跳转

筛选功能：勾选"只看缺失文件日期"可过滤出数据不完整的日期，下方列表显示最近 20 天及高压事件计数。

核心 props：

- **dataset**：`DatasetIndex`，提供全部日期、摘要和日期范围
- **selectedDate**：当前选中日期
- **onSelectDate(date)**：日期变更回调

---

### SummaryCards（`src/components/SummaryCards.tsx`）

4 张摘要卡片，展示当日关键指标：

| 卡片 | 数据来源 |
|------|---------|
| 使用时长 | `summary.useDurationSeconds`，格式化为 `Xh XXm` |
| AI / HI | `summary.eventCounts` 中的计数 |
| 压力范围 | `summary.pressureRange`（`min - max`），仅当波形含压力信号时可用 |
| 缺失文件 | `summary.missingFiles.length` |

核心 props：

- **summary**：`DaySummary`，当日汇总数据

---

### DayCharts（`src/components/DayCharts.tsx`）

**懒加载组件**。显示选中日期的波形信号和关联事件，是交互最丰富的区域。

#### 波形 Tab 切换

按信号类型（气流、压力、实际压力、实际气流、漏气）分 Tab 展示。切换时有 200ms 延迟，避免快速切换时的闪烁。

每个 Tab 渲染一个 `WaveformChart`，传入该信号的采样值、采样率、时间戳、使用会话和事件标记。

#### 事件列表

根据当前选中的信号类型，筛选关联事件：
- 气流类信号 → AI/HI 事件
- 压力类信号 → ASCP 压力记录

点击事件行可将图表缩放定位到对应时间点（通过 `focusedIndex` → `focusedSecond`/`focusedTimestamp` 传递给 `WaveformChart`）。

核心 props：

- **detail**：`DayDetail`，含 `signals`、`events`、`useSessions` 等

---

### WaveformChart（`src/charts/WaveformChart.tsx`）

基于 ECharts 的波形图渲染组件。核心功能：

- **降采样渲染**：配合 `downsampleMinMax` 按像素宽度降采样，支持百万级数据点流畅显示
- **事件标记线**：通过 `markLine` 在图表上标注 AI/HI/ASCP 事件位置，带颜色区分
- **缩放与平移**：ECharts 内置 `dataZoom`，滚轮缩放、拖动平移，"重置缩放"按钮恢复全量视图
- **事件定位**：接收 `focusedSecond` 或 `focusedTimestamp`，自动将视窗缩放到该时间点附近（±10~20 秒窗口）
- **自适应容器**：通过 `ResizeObserver` 监听容器尺寸变化自动 resize

核心 props：

- **label**：信号标识（如 `flow`、`pressure`），用于图表标题
- **values**：采样数据（`Uint8Array | Uint16Array | Int16Array`）
- **sampleRateHz**：采样率，用于计算时间轴
- **startTime**：起始时间戳，用于生成真实时间轴
- **useSessions**：使用会话，用于对齐时间轴跨度
- **eventMarkers**：事件标记信息数组
- **focusedSecond / focusedTimestamp**：当前聚焦的事件时间点

---

### EventTable（`src/components/EventTable.tsx`）

独立的事件表格组件，支持按事件类型筛选（全部 / AI / HI / ASCP / usetime）。每种类型有不同列：
- AI/HI → 持续时间
- ASCP → IPAP / EPAP 压力值
- usetime → 时长

每行有"定位"按钮，通过 `onSelectEvent(seconds, timestamp)` 回调将父组件定位到对应时间点。

> 注：当前 `App` 中未直接使用此组件，`DayCharts` 内部有独立的事件列表实现。`EventTable` 作为通用组件可供未来复用。

核心 props：

- **events**：`EventRecord[]`
- **onSelectEvent(seconds, timestamp)**：定位回调

---

### AiAnalysisPanel（`src/components/AiAnalysisPanel.tsx`）

AI 分析面板，可折叠。将当日数据摘要发送给大语言模型生成分析报告。

功能：

- **Provider 配置**：支持 OpenAI 兼容和 Anthropic 兼容两种 API，可自定义 Endpoint、模型、API Key
- **流式生成**：通过 `streamChat` 逐 chunk 渲染报告，支持中途停止
- **报告缓存**：生成的报告按日期 + provider + model + prompt 组合存入 IndexedDB，重复查看直接加载缓存
- **自定义 Prompt**：用户可追加额外分析要求
- **Markdown 渲染**：使用 `react-markdown` + `remark-gfm` + `rehype-highlight` 渲染报告

API Key 存储在 `localStorage`，面板内有安全提示。

核心 props：

- **summary**：`DaySummary | null`，用于构建数据摘要
- **selectedDate**：当前日期，用于报告缓存 key
- **open**：面板展开状态
- **onToggle**：展开/折叠回调

---

### RawFileBrowser（`src/components/RawFileBrowser.tsx`）

原始文件浏览器。以 `<details>` 折叠列表展示当天所有解析文件的元信息：

- 文件名、类型（`kind`）、Label、Header/Payload 大小、起止时间
- 前 12 个采样值或前 3 条事件记录的预览
- 每种文件类型有中文功能说明
- **BA525 配置**：对 `raw_config` 类型文件（payload ≥ 192 字节）自动解析并展示配置参数表（含字段验证状态）
- **CSV 导出**：波形文件和事件文件可点击"导出 CSV"，生成带 index/seconds/value 的 CSV 并触发浏览器下载（Blob URL 下载后自动 revoke）

核心 props：

- **files**：`ParsedVentilatorFile[]`，当天的全部解析文件

---

## 数据传递方式

所有数据通过 props 自上而下流动，没有 Context 或全局状态：

```
App (dataset, selectedDate, dayDetail)
 │
 ├─→ ImportPanel.onImport → App.handleImport → buildDatasetIndex → dataset
 │
 ├─→ DateNavigator(dataset, selectedDate) → onSelectDate → selectedDate
 │
 ├─→ SummaryCards(summary)          ← dataset.summariesByDay[selectedDate]
 ├─→ DayCharts(detail)              ← dayDetail (从 loadDayDetail 异步获取)
 ├─→ AiAnalysisPanel(summary, date) ← summary + selectedDate
 └─→ RawFileBrowser(files)          ← dayDetail.rawFiles
```

`DayCharts` 内部的数据流：

```
DayCharts(detail)
 ├─→ detail.signals → Tab 切换 → WaveformChart(selectedSignal + filtered events)
 └─→ detail.events → 按信号类型筛选 → 内联事件表格
       └─→ 点击事件 → focusedIndex → focusedSecond → WaveformChart 自动缩放定位
```

---

## 用户交互流程

### 1. 导入数据

用户点击「选择 DATAFILE 文件夹」或「选择 EDF 文件」→ 文件解析为 `ImportedFileRef[]` → `App.handleImport` 调用 `buildDatasetIndex` 建立索引（显示进度） → 自动选中最后一天 → 数据缓存到 IndexedDB。

刷新页面时自动从缓存恢复，无需重新选择文件。

### 2. 浏览日期

左侧 DateNavigator 提供日期跳转、前后翻页和热力图点击三种方式切换日期。切换后右侧主面板自动加载该天的详情。

### 3. 查看摘要

四张 SummaryCards 实时显示当前日期的使用时长、AI/HI 事件数、压力范围和缺失文件数。

### 4. 查看波形和事件

DayCharts 以 Tab 形式展示各信号波形。点击事件列表中的某条事件，波形图会自动缩放到该时间点附近。可通过滚轮缩放和拖动进一步探索波形细节。

### 5. AI 分析

点击「AI 分析」展开面板（首次需配置 API Key 和模型）。点击「生成分析」将当日数据摘要发送给选定模型，流式返回分析报告。报告自动缓存，切换日期后可再次查看。

### 6. 查看原始文件

RawFileBrowser 展示当天所有原始文件的元信息和预览。BA525 配置文件会自动解析展示参数表。

### 7. 导出 CSV

在 RawFileBrowser 中，波形文件和事件文件均有「导出 CSV」按钮，点击后生成对应 CSV 文件并触发浏览器下载。
