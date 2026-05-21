# 乐普呼吸机数据格式文档

基于 `src/parser/edfParser.ts` 和 `src/parser/ba525ConfigParser.ts` 的解析逻辑编写。

## 目录结构

```
DATAFILE/
  20260429/
    20260429_flow.edf
    20260429_pressure.edf
    20260429_real_pres.edf
    20260429_real_flow.edf
    20260429_ai.edf
    20260429_hi.edf
    20260429_ascp.edf
    20260429_usetime.edf
    20260429_mvtvbr.edf
    20260429_difleak.edf
    20260429_config.edf
  20260430/
    ...
```

- 根目录名为 `DATAFILE`，下按日期建子目录
- 日期目录名格式：`YYYYMMDD`（如 `20260429`）
- 文件名格式：`YYYYMMDD_<label>.edf`，其中 `<label>` 为信号/事件类型标识
- 应用通过 `webkitdirectory` 选择整个 `DATAFILE` 文件夹导入，依赖文件路径中的日期字符串归组

## 通用二进制格式

所有 `.edf` 文件共享相同的基础结构：**512 字节 header + 变长 payload**。

### Header（512 字节）

所有字段均为 ASCII 文本，左对齐，空格填充（0x20）。

| 偏移 | 长度 | 字段 | 说明 |
|------|------|------|------|
| 0 | 8 | version | 版本号，如 `V2.12` |
| 8 | 80 | patientId | 设备序列号 |
| 88 | 80 | recordingId | 录制标识 |
| 168 | 8 | startTime | 起始时间戳（二进制，见下方） |
| 176 | 8 | endTime | 结束时间戳（二进制，见下方） |
| 184 | 8 | headerBytes | header 字节数，ASCII 数字，固定为 `512`；解析器对非法值统一回退到 512 |
| 192 | 44 | firmware | 固件版本，如 `V2.12-00001` |
| 236 | 8 | field236 | 未知文本字段 |
| 244 | 8 | field244 | 采样间隔（毫秒），仅对采样型文件有效（见下方） |
| 252 | 4 | signalCount | 信号数量（ASCII 整数） |
| 256 | 16 | **label** | 文件类型标识，决定 payload 解析方式 |
| 352 | 8 | physicalDimension | 物理单位 |
| 360 | 8 | physicalMin | 物理最小值 |
| 368 | 8 | physicalMax | 物理最大值 |
| 376 | 8 | digitalMin | 数字最小值 |
| 384 | 8 | digitalMax | 数字最大值 |

> 272–351 以及 392–511 的区域在当前代码中未读取，内容未知。

### 时间戳格式（8 字节二进制）

| 偏移 | 类型 | 内容 |
|------|------|------|
| 0 | uint16LE | 年 |
| 2 | uint8 | 月（1–12） |
| 3 | uint8 | 日（1–31） |
| 4 | uint8 | 星期（解析时忽略） |
| 5 | uint8 | 时（0–23） |
| 6 | uint8 | 分（0–59） |
| 7 | uint8 | 秒（0–59） |

有效范围校验：年 1900–2200，月 1–12，日 1–31，时 0–23，分/秒 0–59。不满足时返回 `null`。

### field244 与采样率

- `field244` 存储的是**采样间隔（毫秒）**，仅当文件 label 属于采样类型时才解读为数值
- 采样型 label：`flow`、`pressure`、`real_pres`、`real_flow`、`difleak`、`mvtvbr`
- 波形采样率计算：`sampleRateHz = 1000 / field244`，仅对 `flow`、`pressure`、`real_pres`、`real_flow`、`difleak` 生效
- 测试用例中 `field244 = 80` → `sampleRateHz = 12.5 Hz`

### Payload 区域

从文件第 512 字节开始，一直到文件末尾。不同 label 有不同的 payload 格式（见下文）。

## 文件类型详解

### 波形文件

#### flow / difleak — 8 位无符号波形

- **label**: `flow` 或 `difleak`
- **kind**: `waveform_u8`
- **payload 格式**: 每个字节为一个采样值，直接读取（`Uint8Array`）
- **采样率**: 由 header `field244` 决定（如 `80ms → 12.5 Hz`）

#### pressure / real_pres — 16 位无符号波形

- **label**: `pressure` 或 `real_pres`
- **kind**: `waveform_u16le`
- **payload 格式**: 小端序 uint16 序列，每个采样占 2 字节
- **采样率**: 由 header `field244` 决定

#### real_flow — 16 位有符号波形

- **label**: `real_flow`
- **kind**: `waveform_i16le`
- **payload 格式**: 小端序 int16 序列，每个采样占 2 字节（支持负值，表示双向流量）
- **采样率**: 由 header `field244` 决定

### 事件文件

#### ai / hi / ascp / usetime — 16 字节事件记录

- **label**: `ai`、`hi`、`ascp`、`usetime`
- **kind**: `events16`
- **payload 格式**: 每 16 字节为一条记录

| 偏移（记录内） | 长度 | 类型 | 内容 |
|----------------|------|------|------|
| 0 | 4 | uint32LE | value1 |
| 4 | 4 | uint32LE | value2 |
| 8 | 8 | 时间戳 | 事件发生时间 |

- **value1 / value2 的含义因 label 而异**：
  - `ai`（呼吸暂停事件）：value1 = 持续秒数
  - `hi`（低通气事件）：value1 = 持续秒数
  - `ascp`（中枢性睡眠呼吸暂停）：value1 = 持续秒数
  - `usetime`（使用时长）：value1 = 使用秒数，timestamp 为结束时间，可据此推算起始时间

- 尾部不足 16 字节的部分会被忽略并产生警告

### 特殊格式文件

#### mvtvbr — 三元组记录

- **label**: `mvtvbr`
- **kind**: `triples_u16le`
- **payload 格式**: 每 6 字节为一条记录

| 偏移（记录内） | 长度 | 类型 | 内容 |
|----------------|------|------|------|
| 0 | 2 | uint16LE | value1 |
| 2 | 2 | uint16LE | value2 |
| 4 | 2 | uint16LE | value3 |

- 尾部不足 6 字节的部分会被忽略并产生警告

#### config — 设备配置

- **label**: `config`
- **kind**: `raw_config`
- **payload 格式**: 200 字节一条记录（192 字节配置数据 + 8 字节时间戳）

config 文件的 payload 由 `ba525ConfigParser` 单独解析，结构如下。

## BA525 配置记录格式

每条记录 200 字节：192 字节配置载荷 + 8 字节时间戳。

### 配置载荷（192 字节）

以下按功能分区列出已确认或已推断的字段。

#### 设备/模式区（偏移 0–39）

| 偏移 | 大小 | 类型 | 名称 | 标签 | 取值/说明 |
|------|------|------|------|------|-----------|
| 0 | 1 | uint8 | record_size_marker | — | 常量 `0xCC` |
| 1 | 1 | uint8 | language | 语言 | `0`=简体中文, `2`=English |
| 2 | 1 | uint8 | indicator_light | 指示灯 | `0`=关闭, `1`=开启 |
| 4 | 1 | uint8 | screen_saver | 屏保 | `0`=关闭, `1`=开启 |
| 5 | 1 | uint8 | tube_size | 管道 | `0`=22mm, `1`=15mm |
| 6 | 1 | uint8 | face_mask | 面罩 | `0`=鼻罩, `2`=鼻枕 |
| 7 | 1 | uint8 | smart_start | 智能启动 | `0`=关闭, `1`=开启 |
| 8 | 1 | uint8 | smart_stop | 智能停止 | `0`=关闭, `1`=开启 |
| 10 | 1 | uint8 | temperature_unit | 温度单位 | `0`=°C, `1`=°F |
| 16 | 2 | uint16LE | high_pressure_alarm | 高吸气压力报警 | ×0.1 cmH₂O |
| 18 | 1 | uint8 | low_pressure_alarm | 低气道压力报警 | `0`=关闭, `1`=开启 |
| 28 | 2 | uint16LE | timezone | 时区 | 编码：值 = UTC偏移 + 11 |

#### 浮点校准区（偏移 40–67）

| 偏移 | 大小 | 类型 | 名称 | 状态 |
|------|------|------|------|------|
| 40 | 4 | float32LE | calibration_pressure_peak | inferred |
| 44 | 4 | float32LE | calibration_pressure_min | inferred |
| 48 | 4 | float32LE | calibration_std_or_leak | inferred |
| 52 | 4 | float32LE | calibration_pressure_95th | inferred |
| 56 | 4 | float32LE | calibration_pressure_mean | inferred |
| 60 | 4 | float32LE | calibration_pressure_range | inferred |
| 64 | 4 | float32LE | calibration_sensor_coeff | inferred |

#### 治疗参数区（偏移 96–111）

| 偏移 | 大小 | 类型 | 名称 | 标签 | 取值/说明 |
|------|------|------|------|------|-----------|
| 96 | 1 | uint8 | therapy_mode | 治疗模式 | `0`=CPAP, `3`=Auto-S |
| 97 | 1 | uint8 | delay_time_minutes | 延迟时间 | `0`=关闭, `N`=N 分钟 |
| 98 | 1 | uint8 | humidifier_level | 湿化水平 | `N` 档 |
| 102 | 1 | uint8 | epr_level | 呼气舒适度 | `0`=关闭, `N`=N 档 |
| 103 | 1 | uint8 | ipap_sensitivity | 吸气灵敏度 | `1`=低, `2`=中, `3`=高 |
| 105 | 1 | uint8 | rise_rate | 升压速度 | `1`=慢, `2`=中, `3`=快 |
| 106 | 1 | uint8 | fall_rate | 降压速度 | `1`=慢, `2`=中, `3`=快 |
| 108 | 1 | uint8 | apnea_threshold_seconds | — | 推断：呼吸暂停判定阈值秒数 |
| 109 | 1 | uint8 | epap_sensitivity | 呼气灵敏度 | `1`=低, `2`=中, `3`=高 |

#### 浮点治疗压力区（偏移 112–167）

所有 float32LE，单位 cmH₂O，精度 1 位小数。

| 偏移 | 名称 | 标签 | 状态 |
|------|------|------|------|
| 132 | epap_max | 最大呼气压力 | confirmed |
| 136 | epap_min | 最低呼气压力 | confirmed |
| 140 | pressure_support | 压力支持 | confirmed |
| 144 | ramp_start_pressure | 起始压力 | diff-verified |

偏移 112–131、148–164 为浮点压力值，具体含义尚未确认（`unknown`）。

#### 其他字段

| 偏移 | 大小 | 类型 | 名称 | 标签 | 说明 |
|------|------|------|------|------|------|
| 169 | 1 | uint8 | backlight_seconds | 背光秒数 | 单位 s |
| 191 | 1 | uint8 | payload_xor_checksum | 校验和 | bytes[0..190] 的 XOR |

配置记录末尾的 8 字节时间戳格式与 header 中相同。

## 文件类型汇总

| label | kind | payload 类型 | 采样率 |
|-------|------|-------------|--------|
| flow | waveform_u8 | uint8 序列 | field244 决定 |
| pressure | waveform_u16le | uint16LE 序列 | field244 决定 |
| real_pres | waveform_u16le | uint16LE 序列 | field244 决定 |
| real_flow | waveform_i16le | int16LE 序列 | field244 决定 |
| difleak | waveform_u8 | uint8 序列 | field244 决定 |
| mvtvbr | triples_u16le | 6 字节/条 uint16LE×3 | — |
| ai | events16 | 16 字节/条事件记录 | — |
| hi | events16 | 16 字节/条事件记录 | — |
| ascp | events16 | 16 字节/条事件记录 | — |
| usetime | events16 | 16 字节/条事件记录 | — |
| config | raw_config | 200 字节/条配置记录 | — |

## 与标准 EDF 的差异

本格式虽使用 `.edf` 扩展名，但与标准 EDF/BDF 格式存在显著差异：

1. **Header 长度**：固定 512 字节，而非标准 EDF 的 256 字节基本 header + 信号描述区
2. **Header 编码**：部分字段为 ASCII 文本，但时间戳（偏移 168–184）使用二进制编码，标准 EDF 全部为 ASCII
3. **每文件单信号**：每个 `.edf` 文件只包含一个 label 对应的数据，标准 EDF 支持多信号复用
4. **无 data record 分帧**：payload 区域直接存储连续采样值，没有标准 EDF 的 data record 分帧结构
5. **采样间隔字段位置**：`field244`（偏移 244）存储采样间隔毫秒数，标准 EDF 的 duration 字段位于偏移 236
6. **信号标签位置**：label 位于偏移 256（标准 EDF 的 label 字段位于信号描述区）
