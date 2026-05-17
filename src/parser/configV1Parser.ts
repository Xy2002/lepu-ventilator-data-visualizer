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
  { offset: 96,  size: 1, type: 'uint8', name: 'therapy_mode_sub',         status: 'inferred', notes: 'v1 = 3' },
  { offset: 97,  size: 1, type: 'uint8', name: 'unknown_97',               status: 'unknown' },
  { offset: 98,  size: 1, type: 'uint8', name: 'epr_or_expiratory_relief', status: 'inferred', notes: 'v1 = 1 conflicts with UI record off' },
  { offset: 99,  size: 1, type: 'uint8', name: 'ramp_time_minutes',        status: 'inferred', notes: 'v1 = 20 conflicts with UI off; switch may be elsewhere' },
  { offset: 100, size: 1, type: 'uint8', name: 'unknown_100',              status: 'unknown' },
  { offset: 101, size: 1, type: 'uint8', name: 'unknown_101',              status: 'unknown', notes: 'old guess humidifier=2 but UI=1' },
  { offset: 102, size: 1, type: 'uint8', name: 'mask_type',                status: 'inferred', notes: 'v1 = 0 (nasal mask)' },
  { offset: 103, size: 1, type: 'uint8', name: 'unknown_103',              status: 'unknown' },
  { offset: 104, size: 1, type: 'uint8', name: 'auto_start',               status: 'inferred', notes: 'v1 = 1 (smart-start on)' },
  { offset: 105, size: 1, type: 'uint8', name: 'unknown_105',              status: 'unknown' },
  { offset: 106, size: 1, type: 'uint8', name: 'unknown_106',              status: 'unknown' },
  { offset: 107, size: 1, type: 'uint8', name: 'unknown_107',              status: 'unknown' },
  { offset: 108, size: 1, type: 'uint8', name: 'apnea_threshold_seconds',  status: 'inferred', notes: 'v1 = 10' },
  { offset: 109, size: 1, type: 'uint8', name: 'unknown_109',              status: 'unknown' },
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
  { offset: 191, size: 1, type: 'uint8', name: 'unknown_191',       status: 'unknown' },
];
