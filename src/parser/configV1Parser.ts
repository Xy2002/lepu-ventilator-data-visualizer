export type FieldStatus =
  | 'confirmed'
  | 'diff-verified'
  | 'inferred'
  | 'unknown'
  | 'reserved';

export type FieldType = 'uint8' | 'uint16LE' | 'uint32LE' | 'float32LE' | 'bytes';

export interface FieldSpec {
  offset: number;
  size: number;
  type: FieldType;
  name: string;
  label?: string;
  scale?: number;
  unit?: string;
  status: FieldStatus;
  notes?: string;
}

export const CONFIG_V1_FIELDS: ReadonlyArray<FieldSpec> = [
  // Region 1: device / mode (0-39)
  // Round 4 forced splitting offsets 0, 4, 6 into uint8 fields after observing
  // that bytes 1, 5, 6, 10 vary with UI changes while bytes 0, 4, 7 stay constant.
  { offset: 0,  size: 1, type: 'uint8',     name: 'record_size_marker', status: 'reserved', notes: 'constant 0xCC across v1-v5' },
  { offset: 1,  size: 1, type: 'uint8',     name: 'language',          label: '语言',   status: 'diff-verified', notes: 'v1-v3=0 (简体中文), v4=v5=2 (English); Round 5 kept v4 value while face_mask reverted' },
  { offset: 2,  size: 1, type: 'uint8',     name: 'indicator_light',   label: '指示灯', status: 'diff-verified', notes: 'v1-v9=0 (off), v10=1 (on); Round 10. Round 1 had assumed bytes 2-3 were uint16LE header_ref=512 — wrong, this is yet another byte that varies with UI' },
  { offset: 3,  size: 1, type: 'uint8',     name: 'reserved_3',         status: 'reserved', notes: 'v1-v10=0x02 (high byte of what Round 1 thought was uint16LE header_ref)' },
  { offset: 4,  size: 1, type: 'uint8',     name: 'screen_saver',      label: '屏保', status: 'diff-verified', notes: 'v1-v10=0 (off), v11=1 (on); Round 11. Round 1 wrongly marked this reserved' },
  { offset: 5,  size: 1, type: 'uint8',     name: 'tube_size',         label: '管道',   status: 'diff-verified', notes: 'v1-v3=0 (22mm), v4=v5=1 (15mm); Round 5 kept v4 value while temp_unit reverted' },
  { offset: 6,  size: 1, type: 'uint8',     name: 'face_mask',         label: '面罩',   status: 'diff-verified', notes: 'v1-v3=0 (鼻罩), v4=2 (鼻枕), v5=0 (back to 鼻罩, identified by Round 5 single-variable revert)' },
  { offset: 7,  size: 1, type: 'uint8',     name: 'smart_start',        label: '智能启动', status: 'diff-verified', notes: 'v1-v7=1 (on), v8=0 (off); was wrongly marked reserved in Round 4 because user never turned it off — Round 8 corrected this' },
  { offset: 8,  size: 1, type: 'uint8',     name: 'smart_stop',        label: '智能停止', status: 'diff-verified', notes: 'v1-v8=1 (on), v9=0 (off); Round 9. Round 1 originally treated bytes 8-9 as uint16LE enable_flag — was wrong, byte 9 is just zero padding' },
  { offset: 9,  size: 1, type: 'uint8',     name: 'reserved_9',         status: 'reserved', notes: 'v1-v9=0; high byte of what Round 1 thought was uint16LE enable_flag at offset 8' },
  { offset: 10, size: 1, type: 'uint8',     name: 'temperature_unit',  label: '温度单位', status: 'diff-verified', notes: 'v1-v3=0 (°C), v4=1 (°F), v5=0 (back to °C, identified by Round 5 single-variable revert)' },
  { offset: 16, size: 2, type: 'uint16LE',  name: 'high_pressure_alarm', label: '高吸气压力报警', scale: 0.1, unit: 'cmH2O', status: 'confirmed' },
  { offset: 18, size: 1, type: 'uint8',     name: 'low_pressure_alarm', label: '低气道压力报警', status: 'diff-verified', notes: 'v1-v10=1 (on), v11=0 (off); Round 11. Round 1 had uint16LE unknown_18 — yet another mis-grouping' },
  { offset: 19, size: 1, type: 'uint8',     name: 'reserved_19',        status: 'reserved', notes: 'v1-v11=0; high byte of what Round 1 thought was uint16LE unknown_18' },
  { offset: 20, size: 2, type: 'uint16LE',  name: 'unknown_20',         status: 'unknown' },
  { offset: 28, size: 2, type: 'uint16LE',  name: 'timezone',           label: '时区', status: 'diff-verified', notes: 'v1=19 (UTC+8), v4=20 (UTC+9); encoding: value = UTC_offset + 11' },
  { offset: 32, size: 2, type: 'uint16LE',  name: 'therapy_mode_primary', status: 'inferred', notes: 'v1-v4=2; Auto-S?' },
  { offset: 34, size: 2, type: 'uint16LE',  name: 'unknown_34',         status: 'unknown' },
  { offset: 36, size: 2, type: 'uint16LE',  name: 'unknown_36',         status: 'unknown' },

  // Region 2: float calibration block (40-67)
  { offset: 40, size: 4, type: 'float32LE', name: 'calibration_pressure_peak',  status: 'inferred' },
  { offset: 44, size: 4, type: 'float32LE', name: 'calibration_pressure_min',   status: 'inferred' },
  { offset: 48, size: 4, type: 'float32LE', name: 'calibration_std_or_leak',    status: 'inferred' },
  { offset: 52, size: 4, type: 'float32LE', name: 'calibration_pressure_95th',  status: 'inferred' },
  { offset: 56, size: 4, type: 'float32LE', name: 'calibration_pressure_mean',  status: 'inferred' },
  { offset: 60, size: 4, type: 'float32LE', name: 'calibration_pressure_range', status: 'inferred' },
  { offset: 64, size: 4, type: 'float32LE', name: 'calibration_sensor_coeff',   status: 'inferred' },

  // Region 4: uint8 enums (96-111)
  { offset: 96,  size: 1, type: 'uint8', name: 'therapy_mode_sub',         status: 'inferred', notes: 'v1-v6 = 3 (Auto-S?)' },
  { offset: 97,  size: 1, type: 'uint8', name: 'delay_time_minutes',      label: '延迟时间', unit: 'min', status: 'diff-verified', notes: 'v1-v5=0 (off), v6=10 (10 min), v7=0 (user reverted between Round 6 and Round 7, forgot to record); encoding: 0=off, N=N minutes (no separate switch byte)' },
  { offset: 98,  size: 1, type: 'uint8', name: 'humidifier_level',        label: '湿化水平', status: 'diff-verified', notes: 'v1=1, v2=3; matches UI humidifier 1->3' },
  { offset: 99,  size: 1, type: 'uint8', name: 'unknown_99',               status: 'unknown', notes: 'v1-v6 constant 20; previously suspected ramp_time_minutes but Round 6 showed delay time is at offset 97 not 99' },
  { offset: 100, size: 1, type: 'uint8', name: 'unknown_100',              status: 'unknown' },
  { offset: 101, size: 1, type: 'uint8', name: 'unknown_101',              status: 'unknown' },
  { offset: 102, size: 1, type: 'uint8', name: 'epr_level',                label: '呼气舒适度', status: 'diff-verified', notes: 'v1-v6=0 (off), v7=1; Round 7 diff. Corrects Round 1 mis-inference: face_mask is at offset 6, not here' },
  { offset: 103, size: 1, type: 'uint8', name: 'ipap_sensitivity',         label: '吸气灵敏度', status: 'diff-verified', notes: 'v2=1, v3=2 (unique +1 delta matches UI 1->2)' },
  { offset: 104, size: 1, type: 'uint8', name: 'unknown_104',              status: 'unknown', notes: 'v1-v8=1; was tentatively auto_start (Round 1 guess) but Round 8 located smart_start at offset 7 — this byte is something else' },
  { offset: 105, size: 1, type: 'uint8', name: 'rise_rate',                label: '升压速度', status: 'diff-verified', notes: 'v1=2, v2=v3=3; matches UI rise rate 2->3' },
  { offset: 106, size: 1, type: 'uint8', name: 'fall_rate',                label: '降压速度', status: 'diff-verified', notes: 'v1=3, v2=v3=1 (by elimination in Round 3: only fall_rate was kept unchanged at 1)' },
  { offset: 107, size: 1, type: 'uint8', name: 'unknown_107',              status: 'unknown' },
  { offset: 108, size: 1, type: 'uint8', name: 'apnea_threshold_seconds',  status: 'inferred', notes: 'v1=v2=v3=10 (unchanged); matches AI/HI event analysis' },
  { offset: 109, size: 1, type: 'uint8', name: 'epap_sensitivity',         label: '呼气灵敏度', status: 'diff-verified', notes: 'v2=1, v3=3 (unique +2 delta matches UI 1->3)' },
  { offset: 110, size: 1, type: 'uint8', name: 'unknown_110',              status: 'unknown' },
  { offset: 111, size: 1, type: 'uint8', name: 'unknown_111',              status: 'unknown' },

  // Region 5: float treatment pressures (112-167)
  { offset: 112, size: 4, type: 'float32LE', name: 'unknown_pressure_112', status: 'unknown' },
  { offset: 116, size: 4, type: 'float32LE', name: 'unknown_pressure_116', status: 'unknown' },
  { offset: 120, size: 4, type: 'float32LE', name: 'unknown_pressure_120', status: 'unknown' },
  { offset: 124, size: 4, type: 'float32LE', name: 'unknown_pressure_124', status: 'unknown' },
  { offset: 128, size: 4, type: 'float32LE', name: 'unknown_pressure_128', status: 'unknown' },
  { offset: 132, size: 4, type: 'float32LE', name: 'epap_max',          label: '最大呼气压力', unit: 'cmH2O', status: 'confirmed' },
  { offset: 136, size: 4, type: 'float32LE', name: 'epap_min',          label: '最低呼气压力', unit: 'cmH2O', status: 'confirmed' },
  { offset: 140, size: 4, type: 'float32LE', name: 'pressure_support',  label: '压力支持',     unit: 'cmH2O', status: 'confirmed' },
  { offset: 144, size: 4, type: 'float32LE', name: 'ramp_start_pressure', label: '起始压力', unit: 'cmH2O', status: 'diff-verified', notes: 'v1-v6=4.0, v7=6.0 (Round 7 diff); IEEE 754 only mantissa byte 146 actually changes' },
  { offset: 148, size: 4, type: 'float32LE', name: 'unknown_pressure_148', status: 'unknown' },
  { offset: 152, size: 4, type: 'float32LE', name: 'unknown_pressure_152', status: 'unknown' },
  { offset: 156, size: 4, type: 'float32LE', name: 'unknown_pressure_156', status: 'unknown' },
  { offset: 160, size: 4, type: 'float32LE', name: 'unknown_pressure_160', status: 'unknown' },
  { offset: 164, size: 4, type: 'float32LE', name: 'unknown_pressure_164', status: 'unknown', notes: 'old guess ramp_start_pressure but UI=4.0 not 3.0' },

  // Region 6: extras (168-191)
  { offset: 168, size: 1, type: 'uint8', name: 'unknown_168',       status: 'unknown' },
  { offset: 169, size: 1, type: 'uint8', name: 'backlight_seconds', label: '背光秒数', unit: 's', status: 'confirmed' },
  { offset: 182, size: 1, type: 'uint8', name: 'unknown_182',       status: 'unknown' },
  { offset: 184, size: 1, type: 'uint8', name: 'unknown_184',       status: 'unknown' },
  { offset: 185, size: 1, type: 'uint8', name: 'unknown_185',       status: 'unknown' },
  { offset: 186, size: 1, type: 'uint8', name: 'unknown_186',       status: 'unknown' },
  { offset: 191, size: 1, type: 'uint8', name: 'payload_xor_checksum', label: '校验和', status: 'confirmed', notes: 'XOR of bytes[0..190]; verified across v1/v2/v3' },
];

export interface ParsedField {
  spec: FieldSpec;
  raw: number | Uint8Array;
  value: number | Uint8Array;
}

export interface ConfigV1 {
  raw: Uint8Array;
  fields: ParsedField[];
  byName: Record<string, ParsedField>;
}

const PAYLOAD_BYTES = 192;

function toUint8Array(input: ArrayBuffer | Uint8Array): Uint8Array {
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(input);
}

function readField(view: DataView, spec: FieldSpec): number | Uint8Array {
  switch (spec.type) {
    case 'uint8':
      return view.getUint8(spec.offset);
    case 'uint16LE':
      return view.getUint16(spec.offset, true);
    case 'uint32LE':
      return view.getUint32(spec.offset, true);
    case 'float32LE':
      return view.getFloat32(spec.offset, true);
    case 'bytes':
      return new Uint8Array(view.buffer, view.byteOffset + spec.offset, spec.size);
  }
}

function applyScale(raw: number | Uint8Array, scale: number | undefined): number | Uint8Array {
  if (typeof raw !== 'number' || scale === undefined) return raw;
  return raw * scale;
}

export function parseConfigV1(input: ArrayBuffer | Uint8Array): ConfigV1 {
  const raw = toUint8Array(input);
  if (raw.byteLength < PAYLOAD_BYTES) {
    throw new Error(`config_v1 payload must be at least ${PAYLOAD_BYTES} bytes (got ${raw.byteLength})`);
  }
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const fields: ParsedField[] = CONFIG_V1_FIELDS.map((spec) => {
    const rawValue = readField(view, spec);
    return { spec, raw: rawValue, value: applyScale(rawValue, spec.scale) };
  });
  const byName: Record<string, ParsedField> = {};
  for (const f of fields) byName[f.spec.name] = f;
  return { raw, fields, byName };
}

export interface LockedSummaryEntry {
  name: string;
  label: string;
  value: number | Uint8Array;
  unit: string;
  status: 'confirmed' | 'diff-verified';
}

// Returns every field whose status is 'confirmed' or 'diff-verified' — i.e. anything
// we've locked down through UI match or cross-version diff, ready for UI display.
export function summarizeLocked(parsed: ConfigV1): LockedSummaryEntry[] {
  return parsed.fields
    .filter((f) => f.spec.status === 'confirmed' || f.spec.status === 'diff-verified')
    .map((f) => ({
      name: f.spec.name,
      label: f.spec.label ?? f.spec.name,
      value: f.value,
      unit: f.spec.unit ?? '',
      status: f.spec.status as 'confirmed' | 'diff-verified',
    }));
}
