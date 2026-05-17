# Lepu BA525 配置二进制格式规范

**日期**：2026-05-17（最后更新 2026-05-18，共 12 轮迭代完成）
**作者**：Brainstorming session
**状态**：✅ 所有 25 个用户可调 UI 参数已锁定，剩余字段为出厂常量/校准值/未启用功能位

---

## 1. 概览

`config_v{N}.bin` 是从 Lepu **BA525** 呼吸机 UI 导出的配置二进制文件，长度 **192 字节**。整套 12 个样本（`config_v1.bin` 到 `config_v12.bin`）都是同一种格式。

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
[  0,  40)   设备/模式参数         uint8/uint16LE 混合（Round 4/8/9/10/11 多次拆分）
[ 40,  68)   浮点统计/校准          7 × float32LE
[ 68,  96)   保留全零              —
[ 96, 112)   功能开关/枚举          16 × uint8
[112, 168)   治疗压力参数           14 × float32LE
[168, 192)   附加参数               uint8 混合（含 XOR 校验和）
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

### 区域 1 — 设备/模式参数（offset 0–39）

> **Round 4/8/9/10/11 结构修正**：Round 1 把 offset 0/2/4/6/8/18 都标成 uint16LE，但后续 diff 暴露其中 byte 1/2/5/6/7/8/18 都是独立的 UI 参数，byte 0/3/9/19 才是常量/marker。下表已重构成 uint8 + 偶尔 uint16LE。

| offset | size | type | name | scale | unit | status | source |
|---|---|---|---|---|---|---|---|
| 0  | 1 | uint8    | record_size_marker     | — | —   | 🟨 | v1-v5 = 0xCC（marker） |
| 1  | 1 | uint8    | **language**           | — | enum | 🔬 | 0=简体中文, 2=English（v1-v3=0, v4-v5=2；Round 5 排除法）|
| 2  | 1 | uint8    | **indicator_light**    | — | bool | 🔬 | v1-v9=0 (关), v10=1 (开)；Round 10 锁定（同 reserved_7 教训）|
| 3  | 1 | uint8    | reserved_3             | — | —   | 🟨 | v1-v10 = 0x02；原 uint16LE header_ref 假设错了 |
| 4  | 1 | uint8    | **screen_saver**       | — | bool | 🔬 | v1-v10=0 (关), v11=1 (开)；Round 11 锁定。原 reserved_4 又一次踩到 constant ≠ reserved |
| 5  | 1 | uint8    | **tube_size**          | — | enum | 🔬 | 0=22mm, 1=15mm（v1-v3=0, v4-v5=1；Round 5 排除法）|
| 6  | 1 | uint8    | **face_mask**          | — | enum | 🔬 | 0=鼻罩, 2=鼻枕（v1-v3=0, v4=2, v5-v8=0；Round 5 单变量改回）|
| 7  | 1 | uint8    | **smart_start**        | — | bool | 🔬 | v1-v7=1 (开), v8=0 (关)；Round 8 锁定。Round 4 误标 reserved 是错的——只是用户没改过 |
| 8  | 1 | uint8    | **smart_stop**         | — | bool | 🔬 | v1-v8=1 (开), v9=0 (关)；Round 9 锁定。原 enable_flag uint16LE 假设错了（同 reserved_7 教训）|
| 9  | 1 | uint8    | reserved_9             | — | —   | 🟨 | v1-v9=0；原假设是 enable_flag 的高字节 |
| 10 | 1 | uint8    | **temperature_unit**   | — | enum | 🔬 | 0=°C, 1=°F（v1-v3=0, v4=1, v5=0；Round 5 单变量改回）|
| 16 | 2 | uint16LE | **high_pressure_alarm** | /10 | cmH₂O | ✅ | config_v1 + 记录（25.0） |
| 18 | 1 | uint8    | **low_pressure_alarm** | — | bool | 🔬 | v1-v10=1 (开), v11=0 (关)；Round 11 锁定。原 uint16LE 假设错 |
| 19 | 1 | uint8    | reserved_19            | — | —   | 🟨 | v1-v11 = 0 |
| 20 | 2 | uint16LE | _unknown_20            | — | —   | ❓ | v1-v12 = 256（恒定，未跟 UI）|
| 28 | 2 | uint16LE | **timezone**           | — | enum | 🔬 | v1=19 (UTC+8), v4-v12=20 (UTC+9)；编码 value = UTC_offset + 11 |
| 32 | 2 | uint16LE | _unknown_32            | — | —    | ❓ | v1-v12=2；原推测 therapy_mode_primary 错的（therapy_mode 在 offset 96）|
| 34 | 2 | uint16LE | _unknown_34            | — | —   | ❓ | v1-v12 = 14（恒定）|
| 36 | 2 | uint16LE | _unknown_36            | — | —   | ❓ | v1-v12 = 13（恒定）|

### 区域 2 — 浮点统计/校准（offset 40–67, 7 × float32LE）

> 旧 EDF 分析推断这 7 个 float 是设备出厂校准 / 传感器系数。v1-v12 全程恒定，不响应任何 UI 操作：

| offset | size | type | name | scale | unit | status | source |
|---|---|---|---|---|---|---|---|
| 40 | 4 | float32LE | calibration_pressure_peak    | — | cmH₂O | ⚠️ | v1-v12 = 18.5 |
| 44 | 4 | float32LE | calibration_pressure_min     | — | cmH₂O | ⚠️ | v1-v12 = 9.5 |
| 48 | 4 | float32LE | calibration_std_or_leak      | — | —     | ⚠️ | v1-v12 = 2.032 |
| 52 | 4 | float32LE | calibration_pressure_95th    | — | cmH₂O | ⚠️ | v1-v12 = 18.6 |
| 56 | 4 | float32LE | calibration_pressure_mean    | — | cmH₂O | ⚠️ | v1-v12 = 10.3 |
| 60 | 4 | float32LE | calibration_pressure_range   | — | cmH₂O | ⚠️ | v1-v12 = 8.3 |
| 64 | 4 | float32LE | calibration_sensor_coeff     | — | —     | ⚠️ | v1-v12 = 0.0321 |

### 区域 3 — 保留全零（offset 68–95）

| offset | size | type | name | status | source |
|---|---|---|---|---|---|
| 68 | 28 | bytes | _reserved_block | 🟨 | v1 全 0 |

### 区域 4 — 功能开关/枚举（offset 96–111, 16 × uint8）

| offset | size | type | name | scale | unit | status | source |
|---|---|---|---|---|---|---|---|
| 96  | 1 | uint8 | **therapy_mode**        | — | enum    | 🔬 | v1-v11=3 (Auto-S), v12=0 (CPAP)；Round 12 锁定 |
| 97  | 1 | uint8 | **delay_time_minutes**  | — | min     | 🔬 | v1-v5=0, v6=10, v7-v12=0；编码 0=关闭, N=N 分钟（Round 6 单变量锁定）|
| 98  | 1 | uint8 | **humidifier_level**    | — | level   | 🔬 | v1=1, v2-v12=3（Round 2 diff 锁定）|
| 99  | 1 | uint8 | _unknown_99             | — | —       | ❓ | v1-v12=20；Round 6 排除：不是延迟时间，可能是出厂常量 |
| 100 | 1 | uint8 | _unknown_100            | — | enum    | ❓ | v1-v12=2 |
| 101 | 1 | uint8 | _unknown_101            | — | enum    | ❓ | v1-v12=2 |
| 102 | 1 | uint8 | **epr_level**           | — | level   | 🔬 | v1-v6=0, v7-v12=1（Round 7 锁定；原推测 mask_type 是错的，face_mask 在 offset 6）|
| 103 | 1 | uint8 | **ipap_sensitivity**    | — | level   | 🔬 | v1=3, v2=1, v3-v12=2（Round 3 唯一 +1 变化）|
| 104 | 1 | uint8 | _unknown_104            | — | —       | ❓ | v1-v12=1；Round 1 推测 auto_start 但 Round 8 已锁定 smart_start 在 offset 7 |
| 105 | 1 | uint8 | **rise_rate**           | — | level   | 🔬 | v1=2, v2-v12=3（Round 2）|
| 106 | 1 | uint8 | **fall_rate**           | — | level   | 🔬 | v1=3, v2-v12=1（Round 3 排除法：唯一未变的候选）|
| 107 | 1 | uint8 | _unknown_107            | — | enum    | ❓ | v1-v12=1 |
| 108 | 1 | uint8 | apnea_threshold_seconds | — | second  | ⚠️ | v1-v12=10 |
| 109 | 1 | uint8 | **epap_sensitivity**    | — | level   | 🔬 | v1=3, v2=1, v3-v12=3（Round 3 唯一 +2 变化）|
| 110 | 1 | uint8 | _unknown_110            | — | —       | ❓ | v1-v12=20 |
| 111 | 1 | uint8 | _unknown_111            | — | enum    | ❓ | v1-v12=3 |

### 区域 5 — 治疗压力参数（offset 112–167, 14 × float32LE）

| offset | size | type | name | scale | unit | status | source |
|---|---|---|---|---|---|---|---|
| 112 | 4 | float32LE | _unknown_112      | — | cmH₂O | ❓ | v1-v12 = 8.0  |
| 116 | 4 | float32LE | _unknown_116      | — | cmH₂O | ❓ | v1-v12 = 10.0 |
| 120 | 4 | float32LE | _unknown_120      | — | cmH₂O | ❓ | v1-v12 = 4.0  |
| 124 | 4 | float32LE | _unknown_124      | — | cmH₂O | ❓ | v1-v12 = 10.0 |
| 128 | 4 | float32LE | _unknown_128      | — | cmH₂O | ❓ | v1-v12 = 4.0  |
| 132 | 4 | float32LE | **epap_max**      | — | cmH₂O | ✅ | v1-v12 = 14.0（config_v1 + 记录）|
| 136 | 4 | float32LE | **epap_min**      | — | cmH₂O | ✅ | v1-v12 = 7.0（config_v1 + 记录）|
| 140 | 4 | float32LE | **pressure_support** | — | cmH₂O | ✅ | v1-v12 = 3.0（config_v1 + 记录）|
| 144 | 4 | float32LE | **ramp_start_pressure** | — | cmH₂O | 🔬 | v1-v6=4.0, v7-v12=6.0（Round 7 锁定起始压力）|
| 148 | 4 | float32LE | _unknown_148      | — | cmH₂O | ❓ | v1-v12 = 10.0 |
| 152 | 4 | float32LE | _unknown_152      | — | cmH₂O | ❓ | v1-v12 = 4.0  |
| 156 | 4 | float32LE | _unknown_156      | — | cmH₂O | ❓ | v1-v12 = 10.0 |
| 160 | 4 | float32LE | _unknown_160      | — | cmH₂O | ❓ | v1-v12 = 4.0  |
| 164 | 4 | float32LE | _unknown_164      | — | cmH₂O | ❓ | v1-v12 = 3.0；旧分析猜"起始压力"被否定，真实位置在 offset 144 |

### 区域 6 — 附加参数（offset 168–191）

| offset | size | type | name | scale | unit | status | source |
|---|---|---|---|---|---|---|---|
| 168 | 1  | uint8 | _unknown_168           | — | enum   | ❓ | v1-v12 = 5 |
| 169 | 1  | uint8 | **backlight_seconds**  | — | second | ✅ | v1-v12 = 60（config_v1 + 记录）|
| 170 | 12 | bytes | _reserved_170          | — | —      | 🟨 | v1-v12 全 0 |
| 182 | 1  | uint8 | _unknown_182           | — | —      | ❓ | v1-v12 = 20（与 99 同值）|
| 183 | 1  | uint8 | _reserved_183          | — | —      | 🟨 | v1-v12 = 0 |
| 184 | 1  | uint8 | _unknown_184           | — | enum   | ❓ | v1-v12 = 2 |
| 185 | 1  | uint8 | _unknown_185           | — | —      | ❓ | v1-v12 = 12 |
| 186 | 1  | uint8 | _unknown_186           | — | —      | ❓ | v1-v12 = 77 (0x4D) |
| 187 | 4  | bytes | _reserved_187          | — | —      | 🟨 | v1-v12 全 0 |
| 191 | 1  | uint8 | **payload_xor_checksum** | — | —    | ✅ | XOR(bytes[0..190])；v1-v12 全部数学验证通过 |

---

## 5. 已锁定字段汇总（Round 1–12）

**✅ Confirmed / 🔬 Diff-verified（共 25 个）— 所有用户可调 UI 参数已全部锁定**

| offset | name | v1→...→v12 | 来源 |
|---|---|---|---|
| 1   | language             | 0→0→0→2→2→2→2→2→2→0→0→0 | 🔬 Round 5 |
| 2   | indicator_light      | 0→0→0→0→0→0→0→0→0→1→0→0 | 🔬 Round 10 |
| 4   | screen_saver         | 0→0→0→0→0→0→0→0→0→0→1→1 | 🔬 Round 11 |
| 5   | tube_size            | 0→0→0→1→1→1→1→1→1→1→1→1 | 🔬 Round 5 |
| 6   | face_mask            | 0→0→0→2→0→0→0→0→0→0→0→0 | 🔬 Round 5 |
| 7   | smart_start          | 1→1→1→1→1→1→1→0→0→0→0→0 | 🔬 Round 8 |
| 8   | smart_stop           | 1→1→1→1→1→1→1→1→0→0→0→0 | 🔬 Round 9 |
| 10  | temperature_unit     | 0→0→0→1→0→0→0→0→0→0→0→0 | 🔬 Round 5 |
| 16  | high_pressure_alarm  | 250 (25.0 cmH₂O，v1-v12 unchanged) | ✅ Round 1 |
| 18  | low_pressure_alarm   | 1→1→1→1→1→1→1→1→1→1→0→0 | 🔬 Round 11 |
| 28  | timezone             | 19→19→19→20→20→20→20→20→20→20→20→20 | 🔬 Round 4 |
| 96  | therapy_mode         | 3→3→3→3→3→3→3→3→3→3→3→0 | 🔬 Round 12 |
| 97  | delay_time_minutes   | 0→0→0→0→0→10→0→0→0→0→0→0 | 🔬 Round 6 |
| 98  | humidifier_level     | 1→3→3→3→3→3→3→3→3→3→3→3 | 🔬 Round 2 |
| 102 | epr_level            | 0→0→0→0→0→0→1→1→1→1→1→1 | 🔬 Round 7 |
| 103 | ipap_sensitivity     | 3→1→2→2→2→2→2→2→2→2→2→2 | 🔬 Round 3 |
| 105 | rise_rate            | 2→3→3→3→3→3→3→3→3→3→3→3 | 🔬 Round 2 |
| 106 | fall_rate            | 3→1→1→1→1→1→1→1→1→1→1→1 | 🔬 Round 3 |
| 109 | epap_sensitivity     | 3→1→3→3→3→3→3→3→3→3→3→3 | 🔬 Round 3 |
| 132 | epap_max             | 14.0 cmH₂O（v1-v12 unchanged） | ✅ Round 1 |
| 136 | epap_min             | 7.0 cmH₂O（v1-v12 unchanged）  | ✅ Round 1 |
| 140 | pressure_support     | 3.0 cmH₂O（v1-v12 unchanged）  | ✅ Round 1 |
| 144 | ramp_start_pressure  | 4.0→4.0→4.0→4.0→4.0→4.0→6.0→6.0→6.0→6.0→6.0→6.0 | 🔬 Round 7 |
| 169 | backlight_seconds    | 60 秒（v1-v12 unchanged）      | ✅ Round 1 |
| 191 | payload_xor_checksum | 0xB7→0xB6→0xB7→0xB0→0xB3→0xB9→0xF2→0xF3→0xF2→0xF1→0xF0→0xF3 | ✅ Round 2（数学验证）|

---

## 6. 矛盾与未解决问题

1. ~~**延迟时间开关位置**~~：✅ Round 6 解决 — 延迟时间在 **offset 97**，编码 0=关闭, N=N 分钟（无独立开关位）。原推测 offset 99/182 不是延迟时间，是别的常量。

2. ~~**湿化水平字段位置**~~：✅ Round 2 解决 — 湿化水平在 offset 98（不在 offset 101）。

3. ~~**呼气舒适度（EPR）开关位置未知**~~：✅ Round 7 解决 — EPR 在 **offset 102**（编码 0=关闭, N=等级）。同时纠正了 Round 1 把 offset 102 误标为 mask_type 的错误。

4. ~~**起始压力定位**~~：✅ Round 7 解决 — 起始压力在 **offset 144**（float32, v1-v6=4.0, v7-v12=6.0）。原推测的 offset 164 不是起始压力，仍是 unknown_164。

5. ~~**治疗模式编码**~~：✅ Round 12 解决 — 治疗模式在 **offset 96**（uint8, 编码 0=CPAP, 3=Auto-S）。原推测的 offset 32 (uint16LE = 2) 与 UI 完全不相关，已降级为 unknown_32。

6. ~~**"用户设定"区与"治疗设置"区同名参数关系**~~：✅ Round 2 副发现 — 同名灵敏度/速度字段**共享底层字节**（diff 字节数 = UI 改动数，不是 2 倍）。一个底层 byte 在 UI 上显示在两个不同位置。

7. **区域 5 中其余 10 个 float 仍未识别**（offsets 112/116/120/124/128/148/152/156/160/164）：v1-v12 全部恒定，没有 UI 操作能让它们变化。推测是各模式独立的最大/最小压力配置项，或冗余/向后兼容字段。需要切换治疗模式 + 改压力来探测。

---

## 7. 比对历史

### Round 1 — `config_v1.bin` (2026-05-17)

- 锁定字段 (5)：`high_pressure_alarm`, `epap_max`, `epap_min`, `pressure_support`, `backlight_seconds`
- 推翻字段 (4)：旧 EDF 分析中 `humidifier_level (101)`、`ramp_time (99)`、`epr_enabled (98)`、`ramp_start_pressure (164)` 全部降级为 ⚠️/❓，因为与用户 UI 记录矛盾
- 新增 ⚠️：`therapy_mode_primary (32)`, `mask_type (102)`, `auto_start (104)`, `apnea_threshold_seconds (108)` —— 这些 v1 值与记录在数值上无直接冲突，但需 diff 验证

### Round 2 — `config_v2.bin` (2026-05-17)

**改动**：吸气灵敏度 3→1、呼气灵敏度 3→1、升压速度 2→3、降压速度 3→1、湿化水平 1→3。

**diff 结果**：完全可解释，6 字节变化 = 5 个 UI 改动 + 1 个校验和。

- 🔬 锁定字段 (2)：
  - **offset 98 = humidifier_level**（湿化水平，diff 1→3 匹配 UI）—— 同时纠正了 Round 1 旧分析的 `epr_or_expiratory_relief` 错位
  - **offset 105 = rise_rate**（升压速度，diff 2→3 匹配 UI）
- ✅ 新发现 (1)：
  - **offset 191 = payload_xor_checksum**（数学验证：v1/v2 上都满足 XOR(bytes[0..190]) == byte[191]）
- ⚠️ 收窄字段 (3)：
  - offsets {103, 106, 109} 全部 3→1，候选集 {吸气灵敏度, 呼气灵敏度, 降压速度}，但单轮 diff 无法区分。Round 3 用单变量法区分。
- ⚠️ 副发现：
  - "用户设定区"和"治疗设置区"同名灵敏度/速度字段**确实共享底层字节**（变化数 = UI 改动数，不是 2 倍）
  - 旧推测 offset 101 = 湿化水平 **彻底否定**（湿化在 98，101 在 v1/v2 都是 2，未参与本轮 UI 改动）

### Round 3 — `config_v3.bin` (2026-05-17)

**改动**（在 v2 基础上）：吸气灵敏度 1→2、呼气灵敏度 1→3、降压速度保持 1。

**diff 结果**：3 字节变化 = 2 个 UI 改动 + 1 个校验和。

- 🔬 锁定字段 (3)：
  - **offset 103 = ipap_sensitivity**（吸气灵敏度，唯一 +1 变化）
  - **offset 109 = epap_sensitivity**（呼气灵敏度，唯一 +2 变化）
  - **offset 106 = fall_rate**（降压速度，排除法：候选集中唯一保持不变的字段）
- ✅ 校验和再次自证：v3 上 `XOR(bytes[0..190]) == byte[191] == 0xB7`，连续三个文件都满足

锁定字段累计：5（R1）+ 3（R2，含 XOR）+ 3（R3）= **11 个**。

### Round 4 — `config_v4.bin` (2026-05-18)

**改动**（在 v3 基础上）：温度单位 °C→°F、时区 UTC+8→UTC+9、面罩 鼻罩→鼻枕、管道 22mm→15mm、语言 简体中文→English。

**diff 结果**：6 字节变化 = 5 个 UI 改动 + 1 个校验和。

- 🔬 锁定字段 (1)：
  - **offset 28 = timezone**（时区，编码 `value = UTC_offset + 11`：v1=19 ↔ UTC+8、v4=20 ↔ UTC+9，两个独立数据点完美吻合）
- ⚠️ 结构错误纠正（Round 1）：原假设 offset 0/4/6 是 uint16LE，v4 diff 暴露 byte 1、5、6、10 都是独立 UI 参数。重构为 uint8 组：
  - offset 0  = `record_size_marker` 常量 0xCC
  - offset 1  = `enum_face_mask_or_language_1`（+2 delta，候选 {面罩, 语言}）
  - offset 4  = `reserved_4` 常量 0
  - offset 5  = `enum_temp_unit_or_tube_5`（+1 delta，候选 {温度单位, 管道}）
  - offset 6  = `enum_face_mask_or_language_6`（+2 delta，候选 {面罩, 语言}）
  - offset 7  = `reserved_7` 常量 0x01
  - offset 10 = `enum_temp_unit_or_tube_10`（+1 delta，候选 {温度单位, 管道}）
- ⚠️ 收窄字段 (4)：4 个 UI 枚举字节定位完成但成对模糊，需 Round 5 单变量 disambiguate。
- ✅ 校验和验证：v4 上 `XOR(bytes[0..190]) == byte[191] == 0xB0`，连续四个文件都满足。

锁定字段累计：5（R1）+ 3（R2）+ 3（R3）+ 1（R4）= **12 个**。

### Round 5 — `config_v5.bin` (2026-05-18)

**改动**（在 v4 基础上）：温度单位 °F→°C（改回）、面罩 鼻枕→鼻罩（改回）。其他保持 v4 状态。

> 用户记录里写"面罩：面罩"，根据字节变化（offset 6 从 2→0）判断应为"面罩：鼻罩"的笔误（"鼻"字漏写）。

**diff 结果**：3 字节变化 = 2 个 UI 改动 + 1 个校验和。

- 🔬 锁定字段 (4)：
  - **offset 6 = face_mask**（鼻枕→鼻罩，唯一的 2→0 变化）
  - **offset 10 = temperature_unit**（°F→°C，唯一的 1→0 变化）
  - **offset 5 = tube_size**（排除法：v4 中候选 +1 delta 对中未改回的那个 = 管道）
  - **offset 1 = language**（排除法：v4 中候选 +2 delta 对中未改回的那个 = 语言）

锁定字段累计：12（R1-R4）+ 4（R5）= **16 个**。

### Round 6 — `config_v6.bin` (2026-05-18)

**改动**（在 v5 基础上）：延迟时间 关闭→10min。其他全部保持 v5。

**diff 结果**：仅 2 字节变化 = 1 个 UI 改动 + 1 个校验和。

- 🔬 锁定字段 (1)：
  - **offset 97 = delay_time_minutes**（v1-v5=0=关闭，v6=10=10 分钟；编码就是直接的分钟数，**没有独立 on/off 开关字节**）
- ⚠️ Round 1 推测再次纠正：原以为 offset 99 = `ramp_time_minutes`（基于旧 EDF 分析数值=20），但 v1-v6 中 offset 99 始终保持 20、不随 UI 变化。重命名为 `unknown_99`，可能是出厂常量。

锁定字段累计：16（R1-R5）+ 1（R6）= **17 个**。

### Round 7 — `config_v7.bin` (2026-05-18)

**改动**（在 v6 基础上）：呼气舒适度 关闭→1、起始压力 4.0→6.0。

> 副作用：v7 中 byte 97 (`delay_time_minutes`) 从 10 变回 0。用户记录未提及，按"用户漏记，顺手关掉了延迟时间"处理（也可能是设备改 EPR 时的自动复位行为，但本轮无法区分）。

**diff 结果**：4 字节变化 = 1 (EPR) + 1 (float mantissa) + 1 (delay 副作用) + 1 (校验和)。

- 🔬 锁定字段 (2)：
  - **offset 102 = epr_level**（呼气舒适度，0→1；纠正 Round 1 错误推测的 mask_type）
  - **offset 144 = ramp_start_pressure**（float32，4.0→6.0；IEEE 754 实际只有 1 个尾数字节变化）
- ⚠️ 副效应：byte 97 (delay_time) 从 10→0 — 不影响已锁定的 delay_time_minutes 结论
- ✅ 校验和 v7 上 `XOR(bytes[0..190]) == byte[191] == 0xF2`，连续 7 文件全通过

锁定字段累计：17（R1-R6）+ 2（R7）= **19 个**。

### Round 8 — `config_v8.bin` (2026-05-18)

**改动**（在 v7 基础上）：智能启动 开启→关闭。其他保持。

> 用户确认 v7 中 delay_time_minutes 的 10→0 是手动改的，不是设备副作用。spec 已更新对应 note。

**diff 结果**：仅 2 字节变化 = 1 个 UI 改动 + 1 个校验和。

- 🔬 锁定字段 (1)：
  - **offset 7 = smart_start**（v1-v7=1, v8=0；Round 4 误标 `reserved_7` 是错的——只是用户从没改过）
- ⚠️ 推断纠正：原 offset 104 推测 `auto_start` 被否定（v1-v8 一直是 1，与 smart_start 行为不一致），降级为 `unknown_104`
- 💡 教训：跨样本恒定的字节 **不等于** reserved，可能只是"用户没动过"。后续标 reserved 时要慎重

锁定字段累计：19（R1-R7）+ 1（R8）= **20 个**。

### Round 9 — `config_v9.bin` (2026-05-18)

**改动**（在 v8 基础上）：智能停止 开启→关闭。

**diff 结果**：仅 2 字节变化 = 1 个 UI 改动 + 1 个校验和。

- 🔬 锁定字段 (1)：
  - **offset 8 = smart_stop**（v1-v8=1, v9=0；同 Round 8 模式，原 uint16LE `enable_flag` 假设错了，byte 9 才是 padding）
- 💡 与 Round 8 同样的教训再次成立：跨样本恒定 ≠ reserved

锁定字段累计：20（R1-R8）+ 1（R9）= **21 个**。

### Round 10 — `config_v10.bin` (2026-05-18)

**改动**（在 v9 基础上）：语言 English→简体中文、指示灯 关闭→开启。

**diff 结果**：3 字节变化 = 2 个 UI 改动 + 1 个校验和。

- 🔬 锁定字段 (1)：
  - **offset 2 = indicator_light**（v1-v9=0, v10=1；又一次 uint16LE 拆分纠正——Round 1 的 `header_ref` 假设错了）
- ✅ 自验：language 反向变化 2→0 完美匹配 Round 5 锁定（English→简体中文）

锁定字段累计：21（R1-R9）+ 1（R10）= **22 个**。

### Round 11 — `config_v11.bin` (2026-05-18)

**改动**（在 v10 基础上）：屏保 关→开、低气道压力报警 开→关、指示灯 开→关。

> 第一次导出与 v10 字节完全一致；用户怀疑文件复制错误，重新导出后才出现实际差异。流程提醒：UI 改完要完整退出菜单确认保存后再导出。

**diff 结果**：4 字节变化 = 3 个 UI 改动 + 1 个校验和。

- 🔬 锁定字段 (2)：
  - **offset 4 = screen_saver**（v1-v10=0, v11=1；又一次 constant ≠ reserved 教训）
  - **offset 18 = low_pressure_alarm**（v1-v10=1, v11=0；再次 uint16LE 拆分纠正）
- ✅ 自验：indicator_light 反向变化 1→0 完美匹配 Round 10 锁定

锁定字段累计：22（R1-R10）+ 2（R11）= **24 个**。

### Round 12 — `config_v12.bin` (2026-05-18) — **最终 UI 参数**

**改动**（在 v11 基础上）：治疗模式 Auto-S → CPAP。

**diff 结果**：仅 2 字节变化 = 1 个 UI 改动 + 1 个校验和。**所有治疗压力 float（epap_max/min, PS, ramp_start）保持不变**，证明治疗模式只是个"选择器"，不会自动重置其他配置。

- 🔬 锁定字段 (1)：
  - **offset 96 = therapy_mode**（编码 0=CPAP, 3=Auto-S；其他模式如 BiPAP/CPAP-S 等尚未采样）
- ⚠️ 推断纠正：原 offset 32 (uint16LE = 2) 被 Round 1 推测为 `therapy_mode_primary`，但 v1-v12 全是 2，从未跟随 UI 变化。降级为 `unknown_32`。

锁定字段累计：24（R1-R11）+ 1（R12）= **25 个**。

🎉 **所有 25 个用户可调 UI 参数已全部锁定**。剩下的 unknown_* 字节都不响应任何 UI 操作（推测为出厂常量/校准值/未启用功能位）。

---

## 8. 后续轮次计划

### 所有计划轮次已完成（Round 1–12）

所有用户可调 UI 参数已 diff-verified。未来如需进一步研究：

- **采样治疗模式枚举**：当前只有 0 (CPAP) 和 3 (Auto-S) 两个值。可以试 BiPAP、CPAP-S 等其他模式以补全编码。
- **校准 float（offset 40-67, 7 个）**：v1-v12 全部恒定，没有 UI 暴露。可能是出厂校准。
- **区域 5 中其余未识别 float（offset 112-128, 148-164）**：可能是各模式独立的最大/最小压力配置项，可以通过切换治疗模式 + 改压力来探测。
- **未知 uint8（offset 100, 101, 104, 107, 110, 111 等）**：v1-v12 全部恒定，目前没有线索。

---

## 9. TS 解析器交付

### 模块位置

`src/parser/ba525ConfigParser.ts`（零依赖，仅用 DataView；与现有 `edfParser.ts` 同目录）

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

export const BA525_CONFIG_FIELDS: ReadonlyArray<FieldSpec>;

export interface ParsedField {
  spec: FieldSpec;
  raw: number | Uint8Array;   // 原始读出值
  value: number | Uint8Array; // 应用 scale 后的值
}

export interface Ba525Config {
  raw: Uint8Array;        // 原始 192 字节
  fields: ParsedField[];  // 按 BA525_CONFIG_FIELDS 顺序的解析结果
  byName: Record<string, ParsedField>;  // 用 name 索引
}

export function parseBa525Config(buf: ArrayBuffer | Uint8Array): Ba525Config;
```

### 约束

- 模块零依赖（不引入 React / 任何 UI 类型）
- 字段定义集中在 `BA525_CONFIG_FIELDS` 数组，`parseBa525Config` 由它驱动——字段表更新只改一个地方
- 提供 fixture 测试 `src/parser/ba525ConfigParser.test.ts`，断言所有 25 个已锁定字段在 v1-v12 fixture 上的值正确

### 不做（本设计范围外）

- 修改 RawFileBrowser 或其他 UI 组件
- 添加 UI 路由 / 渲染逻辑

未来接入 RawFileBrowser 时，只需新增一个展示组件遍历 `summarizeLocked()` 的结果，无需改解析器代码。

---

## 10. 命名约定

- 每轮新 bin：`src/docs/config_v{N}.bin`（N=2,3,...）
- 每轮记录：在 `src/docs/ventilator_config.md` 末尾追加 `## Round {N}` 节，只列**与上一轮的差异**，不重复全量参数
- spec 文档（本文件）每轮迭代后更新字段表的 status 和"比对历史"节
