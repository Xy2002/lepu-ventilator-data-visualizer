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
  { offset: 0,  size: 2, type: 'uint16LE',  name: 'record_size_marker', status: 'inferred', notes: 'old EDF analysis: 204' },
  { offset: 2,  size: 2, type: 'uint16LE',  name: 'header_ref',         status: 'inferred', notes: 'old EDF analysis: 512' },
  { offset: 6,  size: 2, type: 'uint16LE',  name: 'config_flags',       status: 'inferred' },
  { offset: 8,  size: 2, type: 'uint16LE',  name: 'enable_flag',        status: 'inferred' },
  { offset: 16, size: 2, type: 'uint16LE',  name: 'high_pressure_alarm', label: '高吸气压力报警', scale: 0.1, unit: 'cmH2O', status: 'confirmed' },
  { offset: 18, size: 2, type: 'uint16LE',  name: 'unknown_18',         status: 'unknown' },
  { offset: 20, size: 2, type: 'uint16LE',  name: 'unknown_20',         status: 'unknown' },
  { offset: 28, size: 2, type: 'uint16LE',  name: 'unknown_28',         status: 'unknown' },
  { offset: 32, size: 2, type: 'uint16LE',  name: 'therapy_mode_primary', status: 'inferred', notes: 'v1 = 2; Auto-S?' },
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
  { offset: 96,  size: 1, type: 'uint8', name: 'therapy_mode_sub',         status: 'inferred', notes: 'v1 = 3 (Auto-S?), unchanged in v2' },
  { offset: 97,  size: 1, type: 'uint8', name: 'unknown_97',               status: 'unknown' },
  { offset: 98,  size: 1, type: 'uint8', name: 'humidifier_level',        label: '湿化水平', status: 'diff-verified', notes: 'v1=1, v2=3; matches UI humidifier 1->3' },
  { offset: 99,  size: 1, type: 'uint8', name: 'ramp_time_minutes',        status: 'inferred', notes: 'v1=v2=20; UI says ramp off, so this stores duration only; on/off switch lives elsewhere' },
  { offset: 100, size: 1, type: 'uint8', name: 'unknown_100',              status: 'unknown' },
  { offset: 101, size: 1, type: 'uint8', name: 'unknown_101',              status: 'unknown' },
  { offset: 102, size: 1, type: 'uint8', name: 'mask_type',                status: 'inferred', notes: 'v1=v2=0 (nasal mask, unchanged in v2)' },
  { offset: 103, size: 1, type: 'uint8', name: 'sensitivity_or_fallrate_103', status: 'inferred', notes: 'v1=3, v2=1; one of {ipap_sens, epap_sens, fall_rate}; pending Round 3 disambiguation' },
  { offset: 104, size: 1, type: 'uint8', name: 'auto_start',               status: 'inferred', notes: 'v1=v2=1 (smart-start on, unchanged)' },
  { offset: 105, size: 1, type: 'uint8', name: 'rise_rate',                label: '升压速度', status: 'diff-verified', notes: 'v1=2, v2=3; matches UI rise rate 2->3' },
  { offset: 106, size: 1, type: 'uint8', name: 'sensitivity_or_fallrate_106', status: 'inferred', notes: 'v1=3, v2=1; one of {ipap_sens, epap_sens, fall_rate}; pending Round 3 disambiguation' },
  { offset: 107, size: 1, type: 'uint8', name: 'unknown_107',              status: 'unknown' },
  { offset: 108, size: 1, type: 'uint8', name: 'apnea_threshold_seconds',  status: 'inferred', notes: 'v1=v2=10 (unchanged); matches AI/HI event analysis' },
  { offset: 109, size: 1, type: 'uint8', name: 'sensitivity_or_fallrate_109', status: 'inferred', notes: 'v1=3, v2=1; one of {ipap_sens, epap_sens, fall_rate}; pending Round 3 disambiguation' },
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
  { offset: 144, size: 4, type: 'float32LE', name: 'unknown_pressure_144', status: 'unknown' },
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
  { offset: 191, size: 1, type: 'uint8', name: 'payload_xor_checksum', label: '校验和', status: 'confirmed', notes: 'XOR of bytes[0..190]; verified across v1 and v2 (XOR(bytes[0..190]) ^ byte[191] = 0)' },
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

export interface ConfirmedSummaryEntry {
  name: string;
  label: string;
  value: number | Uint8Array;
  unit: string;
}

export function summarizeConfirmed(parsed: ConfigV1): ConfirmedSummaryEntry[] {
  return parsed.fields
    .filter((f) => f.spec.status === 'confirmed')
    .map((f) => ({
      name: f.spec.name,
      label: f.spec.label ?? f.spec.name,
      value: f.value,
      unit: f.spec.unit ?? '',
    }));
}
