export type ParsedKind =
  | "waveform_u8"
  | "waveform_u16le"
  | "waveform_i16le"
  | "events16"
  | "triples_u16le"
  | "raw_config"
  | "raw"
  | "invalid";

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
  sampleIntervalMs: number | null;
  sampleRateHz: number | null;
}

export interface EventRecord {
  sourceLabel: string;
  value1: number;
  value2: number;
  timestamp: string | null;
  secondsFromDayStart?: number;
}

export interface UseSession {
  startTime: string;
  endTime: string;
  durationSeconds: number;
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
  /** 字节数与最后修改时间:恢复路径仅凭元数据即可校验缓存清单,无需读取内容 */
  size: number;
  lastModified: number;
  /** 读取 [start, end) 字节区间;end 省略表示读到文件末尾 */
  read: (start?: number, end?: number) => Promise<ArrayBuffer>;
}

export interface DaySummary {
  date: string;
  startTime: string | null;
  endTime: string | null;
  useDurationSeconds: number | null;
  useSessions: UseSession[];
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
  parsedFilesByDay: Record<string, ParsedVentilatorFile[]>;
  warnings: string[];
}

export interface DayDetail {
  summary: DaySummary;
  files: ParsedVentilatorFile[];
  signals: ParsedVentilatorFile[];
  events: EventRecord[];
  useSessions: UseSession[];
  rawFiles: ParsedVentilatorFile[];
}

export interface DateFilter {
  startDate?: string;
  endDate?: string;
  requireEvent?: "ai" | "hi" | "ascp";
  /** 多选事件类型:所选类型都必须有记录(与 requireEvent 并存) */
  requireEvents?: Array<"ai" | "hi" | "ascp">;
  missingFilesOnly?: boolean;
  /** 最短使用时长(秒);当天无使用记录视为不满足 */
  minUseDurationSeconds?: number;
}
