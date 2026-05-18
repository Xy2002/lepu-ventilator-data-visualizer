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
  /** Display labels for known raw enum values. Lookup wins over `decode`. */
  enumMap?: Record<number, string>;
  /** Raw integer keys in `enumMap` whose labels are inferred (no direct UI text confirmation). */
  inferredKeys?: number[];
  /** Formula-based decoder used when the value isn't a finite enum (e.g. timezone, delay_time_minutes). */
  decode?: (raw: number) => string;
  /** Decimal places for numeric display (e.g. 1 for cmH₂O pressures). */
  precision?: number;
}

const SENSITIVITY_LEVELS: Record<number, string> = { 1: '低', 2: '中', 3: '高' };
const RATE_LEVELS: Record<number, string> = { 1: '慢', 2: '中', 3: '快' };
const ONOFF: Record<number, string> = { 0: '关闭', 1: '开启' };

export const BA525_CONFIG_FIELDS: ReadonlyArray<FieldSpec> = [
  // Region 1: device / mode (0-39)
  // Round 4/8/9/10/11 progressively split offsets 0/2/4/6/7/8/18 from
  // uint16LE-or-reserved into per-byte UI fields.
  { offset: 0,  size: 1, type: 'uint8',     name: 'record_size_marker', status: 'reserved', notes: 'constant 0xCC across v1-v12' },
  { offset: 1,  size: 1, type: 'uint8',     name: 'language',          label: '语言',   status: 'diff-verified',
    enumMap: { 0: '简体中文', 2: 'English' },
    notes: 'v1-v3=0, v4-v9=2, v10-v12=0; Round 5 disambiguated; other raw values (1, 3+) unsampled' },
  { offset: 2,  size: 1, type: 'uint8',     name: 'indicator_light',   label: '指示灯', status: 'diff-verified',
    enumMap: ONOFF,
    notes: 'v1-v9=0, v10=1, v11-v12=0; Round 10. Round 1 had assumed bytes 2-3 were uint16LE header_ref=512 — wrong' },
  { offset: 3,  size: 1, type: 'uint8',     name: 'reserved_3',         status: 'reserved', notes: 'v1-v12=0x02 (high byte of what Round 1 thought was uint16LE header_ref)' },
  { offset: 4,  size: 1, type: 'uint8',     name: 'screen_saver',      label: '屏保', status: 'diff-verified',
    enumMap: ONOFF,
    notes: 'v1-v10=0, v11-v12=1; Round 11. Round 1 wrongly marked this reserved (constant ≠ reserved)' },
  { offset: 5,  size: 1, type: 'uint8',     name: 'tube_size',         label: '管道',   status: 'diff-verified',
    enumMap: { 0: '22mm', 1: '15mm' },
    notes: 'v1-v3=0, v4-v12=1; Round 5 disambiguated' },
  { offset: 6,  size: 1, type: 'uint8',     name: 'face_mask',         label: '面罩',   status: 'diff-verified',
    enumMap: { 0: '鼻罩', 2: '鼻枕' },
    notes: 'v1-v3=0, v4=2, v5-v12=0; Round 5 single-variable revert. Raw value 1 unsampled' },
  { offset: 7,  size: 1, type: 'uint8',     name: 'smart_start',        label: '智能启动', status: 'diff-verified',
    enumMap: ONOFF,
    notes: 'v1-v7=1, v8-v12=0; was wrongly marked reserved in Round 4 because user never turned it off — Round 8 corrected' },
  { offset: 8,  size: 1, type: 'uint8',     name: 'smart_stop',        label: '智能停止', status: 'diff-verified',
    enumMap: ONOFF,
    notes: 'v1-v8=1, v9-v12=0; Round 9. Round 1 originally treated bytes 8-9 as uint16LE enable_flag — wrong, byte 9 is zero padding' },
  { offset: 9,  size: 1, type: 'uint8',     name: 'reserved_9',         status: 'reserved', notes: 'v1-v12=0; high byte of what Round 1 thought was uint16LE enable_flag at offset 8' },
  { offset: 10, size: 1, type: 'uint8',     name: 'temperature_unit',  label: '温度单位', status: 'diff-verified',
    enumMap: { 0: '°C', 1: '°F' },
    notes: 'v1-v3=0, v4=1, v5-v12=0; Round 5 single-variable revert' },
  { offset: 16, size: 2, type: 'uint16LE',  name: 'high_pressure_alarm', label: '高吸气压力报警',
    scale: 0.1, unit: 'cmH2O', precision: 1, status: 'confirmed' },
  { offset: 18, size: 1, type: 'uint8',     name: 'low_pressure_alarm', label: '低气道压力报警', status: 'diff-verified',
    enumMap: ONOFF,
    notes: 'v1-v10=1, v11-v12=0; Round 11. Round 1 had uint16LE unknown_18 — yet another mis-grouping' },
  { offset: 19, size: 1, type: 'uint8',     name: 'reserved_19',        status: 'reserved', notes: 'v1-v12=0; high byte of what Round 1 thought was uint16LE unknown_18' },
  { offset: 20, size: 2, type: 'uint16LE',  name: 'unknown_20',         status: 'unknown' },
  { offset: 28, size: 2, type: 'uint16LE',  name: 'timezone',           label: '时区', status: 'diff-verified',
    decode: (raw) => `UTC${raw - 11 >= 0 ? '+' : ''}${raw - 11}`,
    notes: 'v1=19 (UTC+8), v4-v12=20 (UTC+9); encoding: value = UTC_offset + 11' },
  { offset: 32, size: 2, type: 'uint16LE',  name: 'unknown_32',         status: 'unknown', notes: 'v1-v12 constant=2; Round 1 wrongly inferred as therapy_mode_primary, but Round 12 located therapy_mode at offset 96' },
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
  { offset: 96,  size: 1, type: 'uint8', name: 'therapy_mode',            label: '治疗模式', status: 'diff-verified',
    enumMap: { 0: 'CPAP', 3: 'Auto-S' },
    notes: 'v1-v11=3, v12=0; Round 12 locked. Other modes (BiPAP/CPAP-S/...) unsampled' },
  { offset: 97,  size: 1, type: 'uint8', name: 'delay_time_minutes',      label: '延迟时间', unit: 'min', status: 'diff-verified',
    decode: (raw) => raw === 0 ? '关闭' : `${raw} 分钟`,
    notes: 'v1-v5=0, v6=10, v7-v12=0; encoding: 0=off, N=N minutes (no separate switch byte)' },
  { offset: 98,  size: 1, type: 'uint8', name: 'humidifier_level',        label: '湿化水平', status: 'diff-verified',
    decode: (raw) => `${raw}档`,
    notes: 'v1=1, v2-v12=3; matches UI humidifier 1->3. Label "档" is inferred Chinese convention; actual UI text unverified' },
  { offset: 99,  size: 1, type: 'uint8', name: 'unknown_99',               status: 'unknown', notes: 'v1-v12 constant 20; previously suspected ramp_time_minutes but Round 6 showed delay time is at offset 97 not 99' },
  { offset: 100, size: 1, type: 'uint8', name: 'unknown_100',              status: 'unknown' },
  { offset: 101, size: 1, type: 'uint8', name: 'unknown_101',              status: 'unknown' },
  { offset: 102, size: 1, type: 'uint8', name: 'epr_level',                label: '呼气舒适度', status: 'diff-verified',
    decode: (raw) => raw === 0 ? '关闭' : `${raw}档`,
    notes: 'v1-v6=0, v7-v12=1; Round 7. Label "档" inferred (Chinese UI convention); UI label for nonzero levels unverified. Corrects Round 1 mis-inference as mask_type' },
  { offset: 103, size: 1, type: 'uint8', name: 'ipap_sensitivity',         label: '吸气灵敏度', status: 'diff-verified',
    enumMap: SENSITIVITY_LEVELS, inferredKeys: [1, 2],
    notes: 'v1=3 (UI confirmed 高), v2=1, v3-v12=2; only label "高" is UI-confirmed, 1=低 / 2=中 inferred' },
  { offset: 104, size: 1, type: 'uint8', name: 'unknown_104',              status: 'unknown', notes: 'v1-v12=1; was tentatively auto_start (Round 1 guess) but Round 8 located smart_start at offset 7 — this byte is something else' },
  { offset: 105, size: 1, type: 'uint8', name: 'rise_rate',                label: '升压速度', status: 'diff-verified',
    enumMap: RATE_LEVELS, inferredKeys: [1, 3],
    notes: 'v1=2 (UI confirmed 中), v2-v12=3; only label "中" is UI-confirmed, 1=慢 / 3=快 inferred' },
  { offset: 106, size: 1, type: 'uint8', name: 'fall_rate',                label: '降压速度', status: 'diff-verified',
    enumMap: RATE_LEVELS, inferredKeys: [1, 2],
    notes: 'v1=3 (UI confirmed 快), v2-v12=1 (Round 3 elimination); only label "快" is UI-confirmed, 1=慢 / 2=中 inferred' },
  { offset: 107, size: 1, type: 'uint8', name: 'unknown_107',              status: 'unknown' },
  { offset: 108, size: 1, type: 'uint8', name: 'apnea_threshold_seconds',  status: 'inferred', notes: 'v1-v12=10; matches AI/HI event analysis' },
  { offset: 109, size: 1, type: 'uint8', name: 'epap_sensitivity',         label: '呼气灵敏度', status: 'diff-verified',
    enumMap: SENSITIVITY_LEVELS, inferredKeys: [1, 2],
    notes: 'v1=3 (UI confirmed 高), v2=1, v3-v12=3; only label "高" is UI-confirmed, 1=低 / 2=中 inferred' },
  { offset: 110, size: 1, type: 'uint8', name: 'unknown_110',              status: 'unknown' },
  { offset: 111, size: 1, type: 'uint8', name: 'unknown_111',              status: 'unknown' },

  // Region 5: float treatment pressures (112-167)
  { offset: 112, size: 4, type: 'float32LE', name: 'unknown_pressure_112', status: 'unknown' },
  { offset: 116, size: 4, type: 'float32LE', name: 'unknown_pressure_116', status: 'unknown' },
  { offset: 120, size: 4, type: 'float32LE', name: 'unknown_pressure_120', status: 'unknown' },
  { offset: 124, size: 4, type: 'float32LE', name: 'unknown_pressure_124', status: 'unknown' },
  { offset: 128, size: 4, type: 'float32LE', name: 'unknown_pressure_128', status: 'unknown' },
  { offset: 132, size: 4, type: 'float32LE', name: 'epap_max',          label: '最大呼气压力', unit: 'cmH2O', precision: 1, status: 'confirmed' },
  { offset: 136, size: 4, type: 'float32LE', name: 'epap_min',          label: '最低呼气压力', unit: 'cmH2O', precision: 1, status: 'confirmed' },
  { offset: 140, size: 4, type: 'float32LE', name: 'pressure_support',  label: '压力支持',     unit: 'cmH2O', precision: 1, status: 'confirmed' },
  { offset: 144, size: 4, type: 'float32LE', name: 'ramp_start_pressure', label: '起始压力', unit: 'cmH2O', precision: 1, status: 'diff-verified', notes: 'v1-v6=4.0, v7-v12=6.0 (Round 7 diff); IEEE 754 only mantissa byte 146 actually changes' },
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
  { offset: 191, size: 1, type: 'uint8', name: 'payload_xor_checksum', label: '校验和', status: 'confirmed',
    decode: (raw) => `0x${raw.toString(16).padStart(2, '0').toUpperCase()}`,
    notes: 'XOR of bytes[0..190]; verified across v1-v12' },
];

export interface ParsedField {
  spec: FieldSpec;
  raw: number | Uint8Array;
  /** raw * scale when scale is defined, otherwise equal to raw. Stays numeric for downstream comparisons. */
  value: number | Uint8Array;
  /** Human-readable rendering: enum label, decode output, or formatted "value unit". */
  display: string;
}

export interface Ba525Config {
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

function formatDisplay(
  raw: number | Uint8Array,
  value: number | Uint8Array,
  spec: FieldSpec,
): string {
  if (raw instanceof Uint8Array || value instanceof Uint8Array) {
    const arr = (value instanceof Uint8Array ? value : raw) as Uint8Array;
    return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join(' ');
  }
  if (spec.enumMap && Object.prototype.hasOwnProperty.call(spec.enumMap, raw)) {
    return spec.enumMap[raw];
  }
  if (spec.decode) {
    return spec.decode(raw);
  }
  const numText = spec.precision !== undefined
    ? value.toFixed(spec.precision)
    : String(value);
  if (spec.unit) {
    return `${numText} ${spec.unit}`;
  }
  return numText;
}

export function parseBa525Config(input: ArrayBuffer | Uint8Array): Ba525Config {
  const raw = toUint8Array(input);
  if (raw.byteLength < PAYLOAD_BYTES) {
    throw new Error(`BA525 config payload must be at least ${PAYLOAD_BYTES} bytes (got ${raw.byteLength})`);
  }
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const fields: ParsedField[] = BA525_CONFIG_FIELDS.map((spec) => {
    const rawValue = readField(view, spec);
    const value = applyScale(rawValue, spec.scale);
    return { spec, raw: rawValue, value, display: formatDisplay(rawValue, value, spec) };
  });
  const byName: Record<string, ParsedField> = {};
  for (const f of fields) byName[f.spec.name] = f;
  return { raw, fields, byName };
}

export interface LockedSummaryEntry {
  name: string;
  label: string;
  value: number | Uint8Array;
  /** Human-readable rendering of the value (with enum label / unit / etc). */
  display: string;
  unit: string;
  status: 'confirmed' | 'diff-verified';
}

// Returns every field whose status is 'confirmed' or 'diff-verified' — i.e. anything
// we've locked down through UI match or cross-version diff, ready for UI display.
export function summarizeLocked(parsed: Ba525Config): LockedSummaryEntry[] {
  return parsed.fields
    .filter((f) => f.spec.status === 'confirmed' || f.spec.status === 'diff-verified')
    .map((f) => ({
      name: f.spec.name,
      label: f.spec.label ?? f.spec.name,
      value: f.value,
      display: f.display,
      unit: f.spec.unit ?? '',
      status: f.spec.status as 'confirmed' | 'diff-verified',
    }));
}

const TIMESTAMP_BYTES = 8;

function parseTimestamp(raw: Uint8Array): string | null {
  if (raw.length < TIMESTAMP_BYTES) return null;
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const year = view.getUint16(0, true);
  const month = raw[2];
  const day = raw[3];
  const hour = raw[5];
  const minute = raw[6];
  const second = raw[7];
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

export interface Ba525ConfigRecord {
  index: number;
  timestamp: string | null;
  config: Ba525Config;
  locked: LockedSummaryEntry[];
}

const RECORD_BYTES = PAYLOAD_BYTES + TIMESTAMP_BYTES; // 192 + 8 = 200

export function parseBa525ConfigRecords(payload: ArrayBuffer | Uint8Array): Ba525ConfigRecord[] {
  const raw = toUint8Array(payload);
  if (raw.byteLength < PAYLOAD_BYTES) {
    throw new Error(`Config payload must be at least ${PAYLOAD_BYTES} bytes (got ${raw.byteLength})`);
  }
  const records: Ba525ConfigRecord[] = [];
  for (let offset = 0; offset + PAYLOAD_BYTES <= raw.byteLength; offset += RECORD_BYTES) {
    const config = parseBa525Config(raw.slice(offset, offset + PAYLOAD_BYTES));
    const tsBytes = offset + RECORD_BYTES <= raw.byteLength
      ? raw.slice(offset + PAYLOAD_BYTES, offset + RECORD_BYTES)
      : null;
    records.push({
      index: records.length,
      timestamp: tsBytes ? parseTimestamp(tsBytes) : null,
      config,
      locked: summarizeLocked(config),
    });
  }
  return records;
}
