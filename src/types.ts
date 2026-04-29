export type ParsedKind =
  | 'waveform_u8'
  | 'waveform_u16le'
  | 'waveform_i16le'
  | 'events16'
  | 'triples_u16le'
  | 'raw_config'
  | 'raw'
  | 'invalid';

export interface VentilatorHeader {
  version: string;
  patientId: string;
  recordingId: string;
  startTime: string | null;
  endTime: string | null;
  headerBytes: number;
  firmware: string;
  field236: string;
  field244: string;
  signalCount: number | null;
  label: string;
  physicalDimension: string;
  physicalMin: string;
  physicalMax: string;
  digitalMin: string;
  digitalMax: string;
  sampleRateHz: number | null;
}

export interface EventRecord {
  sourceLabel: string;
  value1: number;
  value2: number;
  timestamp: string | null;
  secondsFromDayStart?: number;
}

export interface TripleRecord {
  value1: number;
  value2: number;
  value3: number;
}

export interface ParsedVentilatorFile {
  fileName: string;
  kind: ParsedKind;
  header: VentilatorHeader;
  payloadBytes: number;
  values: Uint8Array | Uint16Array | Int16Array;
  records: Array<EventRecord | TripleRecord>;
  rawPayload: Uint8Array;
  warnings: string[];
}

export interface ImportedFileRef {
  name: string;
  path: string;
  file: File;
}

export interface DaySummary {
  date: string;
  startTime: string | null;
  endTime: string | null;
  useDurationSeconds: number | null;
  eventCounts: Record<string, number>;
  signalPresence: Record<string, boolean>;
  sampleCounts: Record<string, number>;
  pressureRange: { min: number; max: number } | null;
  missingFiles: string[];
  warnings: string[];
}

export interface DatasetIndex {
  days: string[];
  dateRange: { start: string | null; end: string | null };
  filesByDay: Record<string, ImportedFileRef[]>;
  summariesByDay: Record<string, DaySummary>;
  warnings: string[];
}

export interface DayDetail {
  summary: DaySummary;
  files: ParsedVentilatorFile[];
  signals: ParsedVentilatorFile[];
  events: EventRecord[];
  rawFiles: ParsedVentilatorFile[];
}

export interface DateFilter {
  startDate?: string;
  endDate?: string;
  requireEvent?: 'ai' | 'hi' | 'ascp';
  missingFilesOnly?: boolean;
}
