# config_v1.bin 格式规范

**日期**：2026-05-17
**作者**：Brainstorming session
**状态**：设计阶段 — 字段表会随后续轮次迭代更新

---

## 1. 概览

`config_v1.bin` 是从 Lepu 系列呼吸机 UI 导出的配置二进制文件，长度 **192 字节**。

与项目内已有的 `docs/config_edf_analysis.md` 分析的 EDF `config` 区别：

| 维度 | `config.edf` payload | `config_v1.bin` |
|---|---|---|
| 总长 | 400 字节（2 × 200B 快照） | 192 字节（单一配置块） |
| 是否含 EDF header | 是（512B） | 否 |
| 是否含时间戳 | 是（每块尾 8B） | 否 |
| 用途 | 治疗会话的现场记录 | UI 设置导出 |

**关键观察**：这个 192 字节的 bin 实际上就是 EDF config 中"配置数据"部分本身（无时间戳）。EDF 旧分析中提到的 6 区结构在本文件中同样成立（旧文档文字写"5 区"但实际列出 6 区，本文档统一作 6 区）。

---

## 2. 总体布局

```
[  0,  40)   设备/模式参数         uint16LE 为主
[ 40,  68)   浮点统计/校准          7 × float32LE
[ 68,  96)   保留全零              —
[ 96, 112)   功能开关/枚举          16 × uint8
[112, 168)   治疗压力参数           14 × float32LE
[168, 192)   附加参数               uint8 混合
```

---

## 3. 字段状态分类法

| 状态 | 含义 | 触发条件 |
|---|---|---|
| ✅ **confirmed** | 已确定 | bin 中数值与 UI 记录唯一对应，且后续轮次未推翻 |
| 🔬 **diff-verified** | diff 已验证 | 跨多轮 bin diff，改动该 UI 设置时此字节出现预期变化 |
| ⚠️ **inferred** | 推测 | 仅基于旧 EDF 分析或语义猜测，当前轮未独立证实 |
| ❓ **unknown** | 未知 | 没有任何线索 |
| 🟨 **reserved** | 保留 | 字节恒为 0 或在已知样本中从未变化 |

**晋升规则**：
- ⚠️ → ✅：本轮 bin 中数值与 UI 记录直接吻合
- ⚠️/❓ → 🔬：跨两轮 bin diff 出现预期变化
- 🔬 → ✅：两次以上独立 diff 都印证

**降级规则**：任何与新一轮 diff 矛盾的字段立即降回 ⚠️，并在第 6 节"矛盾与未解决问题"中登记。

---

## 4. 字段表

> 每轮迭代后更新本表。所有 `source` 标注 "config_v1 + 记录" 的字段表示在 v1 样本中已能与用户 UI 记录直接对应。

### 区域 1 — 设备/模式参数（offset 0–39, uint16LE 为主）

| offset | size | type | name | scale | unit | status | source |
|---|---|---|---|---|---|---|---|
| 0  | 2 | uint16LE | record_size_marker     | —   | —      | ⚠️ | 旧 EDF 分析（值=204） |
| 2  | 2 | uint16LE | header_ref             | —   | —      | ⚠️ | 旧 EDF 分析（值=512） |
| 4  | 2 | uint16LE | _reserved_4            | —   | —      | 🟨 | v1 = 0 |
| 6  | 2 | uint16LE | config_flags           | —   | —      | ⚠️ | 旧 EDF 分析（值=256） |
| 8  | 2 | uint16LE | enable_flag            | —   | —      | ⚠️ | 旧 EDF 分析（值=1） |
| 10 | 6 | bytes    | _reserved_10           | —   | —      | 🟨 | v1 全 0 |
| 16 | 2 | uint16LE | **high_pressure_alarm** | /10 | cmH₂O | ✅ | config_v1 + 记录（25.0） |
| 18 | 2 | uint16LE | _unknown_18            | —   | —      | ❓ | v1 = 1 |
| 20 | 2 | uint16LE | _unknown_20            | —   | —      | ❓ | v1 = 256 |
| 22 | 6 | bytes    | _reserved_22           | —   | —      | 🟨 | v1 全 0 |
| 28 | 2 | uint16LE | _unknown_28            | —   | —      | ❓ | v1 = 19 |
| 30 | 2 | uint16LE | _reserved_30           | —   | —      | 🟨 | v1 = 0 |
| 32 | 2 | uint16LE | therapy_mode_primary   | —   | enum   | ⚠️ | v1 = 2（Auto-S?）|
| 34 | 2 | uint16LE | _unknown_34            | —   | —      | ❓ | v1 = 14 |
| 36 | 2 | uint16LE | _unknown_36            | —   | —      | ❓ | v1 = 13 |
| 38 | 2 | uint16LE | _reserved_38           | —   | —      | 🟨 | v1 = 0 |

### 区域 2 — 浮点统计/校准（offset 40–67, 7 × float32LE）

> 旧 EDF 分析推断这 7 个 float 是设备出厂校准 / 传感器系数。v1 数值与旧分析一致：

| offset | size | type | name | scale | unit | status | source |
|---|---|---|---|---|---|---|---|
| 40 | 4 | float32LE | calibration_pressure_peak    | — | cmH₂O | ⚠️ | v1 = 18.5 |
| 44 | 4 | float32LE | calibration_pressure_min     | — | cmH₂O | ⚠️ | v1 = 9.5 |
| 48 | 4 | float32LE | calibration_std_or_leak      | — | —     | ⚠️ | v1 = 2.032 |
| 52 | 4 | float32LE | calibration_pressure_95th    | — | cmH₂O | ⚠️ | v1 = 18.6 |
| 56 | 4 | float32LE | calibration_pressure_mean    | — | cmH₂O | ⚠️ | v1 = 10.3 |
| 60 | 4 | float32LE | calibration_pressure_range   | — | cmH₂O | ⚠️ | v1 = 8.3 |
| 64 | 4 | float32LE | calibration_sensor_coeff     | — | —     | ⚠️ | v1 = 0.0321 |

### 区域 3 — 保留全零（offset 68–95）

| offset | size | type | name | status | source |
|---|---|---|---|---|---|
| 68 | 28 | bytes | _reserved_block | 🟨 | v1 全 0 |

### 区域 4 — 功能开关/枚举（offset 96–111, 16 × uint8）

| offset | size | type | name | scale | unit | status | source |
|---|---|---|---|---|---|---|---|
| 96  | 1 | uint8 | therapy_mode_sub        | — | enum    | ⚠️ | v1 = 3 |
| 97  | 1 | uint8 | _unknown_97             | — | —       | ❓ | v1 = 0 |
| 98  | 1 | uint8 | epr_or_expiratory_relief| — | enum    | ⚠️ | v1 = 1（旧分析=开，但记录"呼气舒适度=关闭"矛盾）|
| 99  | 1 | uint8 | ramp_time_minutes       | — | minute  | ⚠️ | v1 = 20；记录"延迟时间=关闭"矛盾——开关字节可能在别处 |
| 100 | 1 | uint8 | _unknown_100            | — | enum    | ❓ | v1 = 2 |
| 101 | 1 | uint8 | _unknown_101            | — | enum    | ❓ | v1 = 2；旧分析猜湿化水平=2，但记录湿化=1 矛盾 |
| 102 | 1 | uint8 | mask_type               | — | enum    | ⚠️ | v1 = 0（记录"面罩=鼻罩"）|
| 103 | 1 | uint8 | _unknown_103            | — | enum    | ❓ | v1 = 3 |
| 104 | 1 | uint8 | auto_start              | — | bool    | ⚠️ | v1 = 1（记录"智能启动=开"）|
| 105 | 1 | uint8 | _unknown_105            | — | enum    | ❓ | v1 = 2 |
| 106 | 1 | uint8 | _unknown_106            | — | enum    | ❓ | v1 = 3 |
| 107 | 1 | uint8 | _unknown_107            | — | enum    | ❓ | v1 = 1 |
| 108 | 1 | uint8 | apnea_threshold_seconds | — | second  | ⚠️ | v1 = 10（旧 EDF 分析） |
| 109 | 1 | uint8 | _unknown_109            | — | enum    | ❓ | v1 = 3 |
| 110 | 1 | uint8 | _unknown_110            | — | —       | ❓ | v1 = 20 |
| 111 | 1 | uint8 | _unknown_111            | — | enum    | ❓ | v1 = 3 |

### 区域 5 — 治疗压力参数（offset 112–167, 14 × float32LE）

| offset | size | type | name | scale | unit | status | source |
|---|---|---|---|---|---|---|---|
| 112 | 4 | float32LE | _unknown_112      | — | cmH₂O | ❓ | v1 = 8.0  |
| 116 | 4 | float32LE | _unknown_116      | — | cmH₂O | ❓ | v1 = 10.0 |
| 120 | 4 | float32LE | _unknown_120      | — | cmH₂O | ❓ | v1 = 4.0  |
| 124 | 4 | float32LE | _unknown_124      | — | cmH₂O | ❓ | v1 = 10.0 |
| 128 | 4 | float32LE | _unknown_128      | — | cmH₂O | ❓ | v1 = 4.0  |
| 132 | 4 | float32LE | **epap_max**      | — | cmH₂O | ✅ | config_v1 + 记录（14.0）|
| 136 | 4 | float32LE | **epap_min**      | — | cmH₂O | ✅ | config_v1 + 记录（7.0）|
| 140 | 4 | float32LE | **pressure_support** | — | cmH₂O | ✅ | config_v1 + 记录（3.0）|
| 144 | 4 | float32LE | _unknown_144      | — | cmH₂O | ❓ | v1 = 4.0  |
| 148 | 4 | float32LE | _unknown_148      | — | cmH₂O | ❓ | v1 = 10.0 |
| 152 | 4 | float32LE | _unknown_152      | — | cmH₂O | ❓ | v1 = 4.0  |
| 156 | 4 | float32LE | _unknown_156      | — | cmH₂O | ❓ | v1 = 10.0 |
| 160 | 4 | float32LE | _unknown_160      | — | cmH₂O | ❓ | v1 = 4.0  |
| 164 | 4 | float32LE | _unknown_164      | — | cmH₂O | ❓ | v1 = 3.0；旧分析猜"起始压力"，但记录起始压力=4.0 矛盾 |

### 区域 6 — 附加参数（offset 168–191）

| offset | size | type | name | scale | unit | status | source |
|---|---|---|---|---|---|---|---|
| 168 | 1  | uint8 | _unknown_168           | — | enum   | ❓ | v1 = 5 |
| 169 | 1  | uint8 | **backlight_seconds**  | — | second | ✅ | config_v1 + 记录（60）|
| 170 | 12 | bytes | _reserved_170          | — | —      | 🟨 | v1 全 0 |
| 182 | 1  | uint8 | _unknown_182           | — | —      | ❓ | v1 = 20（与 99 同值）|
| 183 | 1  | uint8 | _reserved_183          | — | —      | 🟨 | v1 = 0 |
| 184 | 1  | uint8 | _unknown_184           | — | enum   | ❓ | v1 = 2 |
| 185 | 1  | uint8 | _unknown_185           | — | —      | ❓ | v1 = 12 |
| 186 | 1  | uint8 | _unknown_186           | — | —      | ❓ | v1 = 77 (0x4D) |
| 187 | 4  | bytes | _reserved_187          | — | —      | 🟨 | v1 全 0 |
| 191 | 1  | uint8 | _unknown_191           | — | —      | ❓ | v1 = 0xB7 (183) |

---

## 5. 已 ✅ 字段汇总（v1 锁定）

| offset | name | v1 value | UI 记录 |
|---|---|---|---|
| 16  | high_pressure_alarm | 250 → 25.0 cmH₂O | 高吸气压力报警 25.0 |
| 132 | epap_max            | 14.0 cmH₂O       | 最大呼气压力 14.0 |
| 136 | epap_min            | 7.0 cmH₂O        | 最低呼气压力 7.0 |
| 140 | pressure_support    | 3.0 cmH₂O        | 压力支持 3.0 |
| 169 | backlight_seconds   | 60 秒            | 背光 60 秒 |

---

## 6. 矛盾与未解决问题

按优先级降序：

1. **延迟时间开关位置**：记录"延迟时间=关闭"，但 offset 99 = 20 且 offset 182 = 20。旧分析将 99/182 都解读为 "ramp time 20 分钟"。
   - 假设：UI 上"延迟时间"是开关，"20 分钟"是配置值；开关字节在别处（可能是 offset 97/100/105/106 等中的某个）。
   - 验证方案：第三轮单变量——把"延迟时间"切到 10 分钟，再切回关闭，观察哪个字节随开关变化、哪个字节随时长变化。

2. **湿化水平字段位置**：记录"湿化=1"，旧分析说 offset 101 = humidifier=2，与 v1 字节 (101=2) 不匹配。
   - 假设：旧分析定位错误，真正的湿化水平在区域 4 的其他字节。
   - 验证方案：第一轮把湿化从 1 改到 3，看哪个字节变成 3。

3. **呼气舒适度（EPR）开关**：记录"呼气舒适度=关闭"，但 offset 98 = 1（旧分析=EPR 开）。
   - 假设：旧分析定位错误，或字段含义不同。
   - 验证方案：单变量——把呼气舒适度切到开/关，观察变化字节。

4. **起始压力定位**：记录"起始压力=4.0"，但旧分析定位的 offset 164 = 3.0。
   - 假设：旧分析定位错误。
   - 验证方案：单变量——把起始压力从 4.0 改到 6.0，观察哪个 float 变化。

5. **治疗模式编码**：记录"Auto-S"。offset 32 (uint16) = 2 与 offset 96 (uint8) = 3 至少有一个是治疗模式枚举，但需要切换治疗模式才能确认。
   - 验证方案：单变量——切到 CPAP 或 BiPAP 模式，观察哪个字节变化。

6. **"用户设定"区与"治疗设置"区同名参数关系**：
   - 用户记录中 `吸气灵敏度/呼气灵敏度/升压速度/降压速度/延迟时间` 在两个区都出现。
   - 假设：底层是同一字段，UI 显示两次。
   - 验证方案：第一轮 v2 改动只动一处（比如治疗设置区的吸气灵敏度），看是否只有一个字节变。

7. **区域 5 的 14 个 float**：大量重复值（4.0, 10.0），尚不清楚哪些是真正用到的参数、哪些是冗余/向后兼容字段。

---

## 7. 比对历史

### Round 1 — `config_v1.bin` (2026-05-17)

- 锁定字段 (5)：`high_pressure_alarm`, `epap_max`, `epap_min`, `pressure_support`, `backlight_seconds`
- 推翻字段 (4)：旧 EDF 分析中 `humidifier_level (101)`、`ramp_time (99)`、`epr_enabled (98)`、`ramp_start_pressure (164)` 全部降级为 ⚠️/❓，因为与用户 UI 记录矛盾
- 新增 ⚠️：`therapy_mode_primary (32)`, `mask_type (102)`, `auto_start (104)`, `apnea_threshold_seconds (108)` —— 这些 v1 值与记录在数值上无直接冲突，但需 diff 验证

---

## 8. 后续轮次计划

### Round 2 (v2) — B 法批量推理灵敏度/速度/湿化组

**改动清单**（在呼吸机 UI 上）：

| 参数 | v1 | v2 | 目的 |
|---|---|---|---|
| 吸气灵敏度 | 3 | **1** | 定位灵敏度字节 |
| 呼气灵敏度 | 3 | **1** | 定位灵敏度字节 |
| 升压速度   | 2 | **3** | 定位速度字节 |
| 降压速度   | 3 | **1** | 定位速度字节 |
| 湿化水平   | 1 | **3** | 修复湿化定位 |

其他参数保持不变。导出 `config_v2.bin`，在 `ventilator_config.md` 追加 `## Round 2` 节记录改动。

**预期 diff 字节数**：5 个独立字段 → 至少 5 个字节变化；如果某些参数在 v1 中同时显示于"用户设定"和"治疗设置"两区且共享底层字段，diff 字节数应仍为 5；若是独立字段，可能有更多变化。

### Round 3 (v3) — B 法推理枚举组

| 参数 | v1 | v3 |
|---|---|---|
| 温度单位 | °C | **°F** |
| 时区     | UTC+8 | **UTC+9** |
| 面罩     | 鼻罩 | **鼻枕** |
| 管道     | 22mm | **15mm** |
| 语言     | 简体中文 | **English** |

### Round 4 (v4) — A 法精确定位"延迟时间"开关

只改延迟时间：关闭 → 10 分钟。其他全部保持 v3 状态。预期只有 1-2 个字节变化，能精确锁定"延迟时间开关字节"和（如需）"延迟时长字节"。

---

## 9. TS 解析器交付

### 模块位置

`src/lib/configV1Parser.ts`（零依赖，仅用 DataView）

### API

```typescript
export type FieldStatus = 'confirmed' | 'diff-verified' | 'inferred' | 'unknown' | 'reserved';

export interface FieldSpec {
  offset: number;
  size: number;
  type: 'uint8' | 'uint16LE' | 'uint32LE' | 'float32LE' | 'bytes';
  name: string;
  label?: string;       // 中文 UI 标签
  scale?: number;       // 例如 high_pressure_alarm 的 0.1
  unit?: string;        // cmH₂O / 秒 / 分钟 / —
  status: FieldStatus;
  notes?: string;       // 矛盾说明 / 推测理由
}

export const CONFIG_V1_FIELDS: ReadonlyArray<FieldSpec>;

export interface ParsedField {
  spec: FieldSpec;
  raw: number | Uint8Array;   // 原始读出值
  value: number | Uint8Array; // 应用 scale 后的值
}

export interface ConfigV1 {
  raw: Uint8Array;        // 原始 192 字节
  fields: ParsedField[];  // 按 CONFIG_V1_FIELDS 顺序的解析结果
  byName: Record<string, ParsedField>;  // 用 name 索引
}

export function parseConfigV1(buf: ArrayBuffer | Uint8Array): ConfigV1;
```

### 约束

- 模块零依赖（不引入 React / 任何 UI 类型）
- 字段定义集中在 `CONFIG_V1_FIELDS` 数组，`parseConfigV1` 由它驱动——字段表更新只改一个地方
- 提供 fixture 测试 `src/lib/configV1Parser.test.ts`，断言 v1 五个 ✅ 字段值正确

### 不做（本设计范围外）

- 修改 RawFileBrowser 或其他 UI 组件
- 添加 UI 路由 / 渲染逻辑

未来接入 RawFileBrowser 时，只需新增一个展示组件遍历 `CONFIG_V1_FIELDS`，无需改解析器代码。

---

## 10. 命名约定

- 每轮新 bin：`src/docs/config_v{N}.bin`（N=2,3,...）
- 每轮记录：在 `src/docs/ventilator_config.md` 末尾追加 `## Round {N}` 节，只列**与上一轮的差异**，不重复全量参数
- spec 文档（本文件）每轮迭代后更新字段表的 status 和"比对历史"节
