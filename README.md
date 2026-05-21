# 呼吸机数据可视化

浏览器本地解析的乐普 BA525 呼吸机 EDF-like 数据可视化工具。所有数据在本地解析和渲染，原始数据不会上传到任何服务器。

## 功能

- **文件夹导入** — 选择 `DATAFILE` 文件夹，自动按日期（`20260427`、`20260428` 等）分组索引
- **日期导航** — 快速切换日期查看不同天的数据
- **每日摘要** — 使用时长、会话数、压力范围、事件统计
- **波形图表** — 基于 ECharts 渲染 flow、pressure、real_pres、real_flow 等波形，支持 min-max 降采样
- **事件表** — 查看 AI（呼吸暂停）、HI（低通气）、ASCP 等事件记录
- **原始文件浏览** — 查看每个文件的解析结果和原始 payload
- **CSV 导出** — 单个波形或事件文件导出为 CSV
- **导入缓存** — 文件缓存至 IndexedDB，刷新页面无需重新选择

## 使用

1. 点击"选择 DATAFILE 文件夹"。
2. 选择包含 `20260427`、`20260428` 这类日期目录的 `DATAFILE`。
3. 用日期导航选择日期。
4. 查看摘要、波形、事件表和原始文件解析。
5. 对单个波形或事件文件导出 CSV。

如果浏览器不支持文件夹选择，可以使用"选择 EDF 文件"批量选择文件。

## 开发

```bash
npm install
npm run dev
```

打开 Vite 输出的本地地址（默认 `127.0.0.1`）。

### 其他命令

```bash
npm run build       # TypeScript 编译 + Vite 构建
npm run preview     # 预览构建产物
npm run test        # 运行测试 (Vitest)
npm run test:watch  # 监听模式运行测试
```

需要 Node >= 20.19.0。

## 部署

### Docker

使用多阶段构建（Node 构建 → nginx 静态服务）：

```bash
# 构建并启动
docker compose up -d --build

# 访问 http://localhost:3000
```

手动构建：

```bash
docker build -t ventilator-web .
docker run -d -p 3000:80 ventilator-web
```

### Railway

在 Railway 中连接 GitHub 仓库，Railway 会自动识别 `railway.toml` 并使用 Dockerfile 构建。

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Xy2002/lepu-ventilator-data-visualizer)

或手动：导入 GitHub 仓库到 Vercel，框架自动识别为 Vite，无需额外配置。

## 技术栈

React 19 · TypeScript · Vite · Tailwind CSS 4 · ECharts 6 · HeroUI · Vitest + Testing Library

## 数据格式

这些 `.edf` 文件不是标准 EDF。应用按 512 字节 ASCII header + 厂商 payload 的格式解析。

| Label（header offset 256） | 解析类型 | 编码方式 |
|---|---|---|
| `flow`, `difleak` | `waveform_u8` | unsigned 8-bit |
| `pressure`, `real_pres` | `waveform_u16le` | uint16 little-endian |
| `real_flow` | `waveform_i16le` | int16 little-endian |
| `ai`, `hi`, `ascp`, `usetime` | `events16` | 16-byte 事件记录 |
| `mvtvbr` | `triples_u16le` | 3 × uint16 LE |
| `config` | `raw_config` | BA525 配置 payload |

## 项目结构

```
src/
├── parser/          # 二进制解析（EDF header、BA525 配置）
├── data/            # 数据集索引、IndexedDB 缓存、CSV 导出
├── charts/          # ECharts 波形渲染、降采样
├── components/      # React 组件（DateNavigator、DayCharts、EventTable 等）
├── App.tsx          # 主应用，状态管理
└── types.ts         # 类型定义
```

路径别名：`@` → `src/`（配置于 `vite.config.ts`）。

## 文档

- [架构文档](docs/architecture.md) — 系统架构与数据流
- [组件文档](docs/components.md) — UI 组件层级与交互
- [数据格式文档](docs/data-format.md) — 二进制文件格式详解
- [设计系统](DESIGN.md) — Vercel 风格设计规范

## 辅助工具

`read_ventilator_data.py` — Python 脚本，用于在命令行中快速验证和解析呼吸机数据文件。
