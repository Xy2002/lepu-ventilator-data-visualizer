import {
  HEADER_BYTES,
  parseVentilatorFile,
  parseVentilatorFileHeader,
} from "../parser/edfParser";
import { parseEdfTimestampMs } from "../parser/edfTimestamp";
import type {
  DatasetIndex,
  DateFilter,
  DayDetail,
  DaySummary,
  EventRecord,
  ImportedFileRef,
  ParsedVentilatorFile,
  UseSession,
} from "../types";

const expectedSignalLabels = ["flow", "pressure", "real_pres", "real_flow"];

function normalizeDate(year: string, month: string, day: string) {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return null;
  }

  return `${year}-${month}-${day}`;
}

export function inferDateFromPath(path: string) {
  const compactMatch = path.match(
    /(?:^|[^\d])(\d{4})(\d{2})(\d{2})(?:[^\d]|$)/
  );
  if (compactMatch) {
    return normalizeDate(compactMatch[1], compactMatch[2], compactMatch[3]);
  }

  const dashedMatch = path.match(
    /(?:^|[^\d])(\d{4})-(\d{2})-(\d{2})(?:[^\d]|$)/
  );
  if (dashedMatch) {
    return normalizeDate(dashedMatch[1], dashedMatch[2], dashedMatch[3]);
  }

  return null;
}

function formatTimestamp(date: Date) {
  const pad = (value: number, length = 2) =>
    value.toString().padStart(length, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(
    date.getUTCHours()
  )}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

export function secondsBetween(start: string | null, end: string | null) {
  const startMs = parseEdfTimestampMs(start);
  const endMs = parseEdfTimestampMs(end);
  if (startMs === null || endMs === null) return null;

  const seconds = (endMs - startMs) / 1000;
  return seconds >= 0 ? seconds : null;
}

async function parseImportedFile(fileRef: ImportedFileRef) {
  const buffer = await fileRef.file.arrayBuffer();
  return parseVentilatorFile(fileRef.name, new Uint8Array(buffer));
}

// 索引阶段需要完整内容的类型：事件/配置直接参与摘要，invalid 文件本身很小
const INDEX_FULL_PARSE_KINDS = new Set(["events16", "raw_config", "invalid"]);

async function readBlobPart(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read blob"));
    reader.readAsArrayBuffer(blob);
  });
}

async function parseImportedFileForIndex(fileRef: ImportedFileRef) {
  const headerRaw = new Uint8Array(
    await readBlobPart(fileRef.file.slice(0, HEADER_BYTES))
  );
  const headerOnly = parseVentilatorFileHeader(
    fileRef.name,
    headerRaw,
    fileRef.file.size
  );
  if (INDEX_FULL_PARSE_KINDS.has(headerOnly.kind)) {
    return parseImportedFile(fileRef);
  }
  return headerOnly;
}

function sampleCountOf(file: ParsedVentilatorFile) {
  if (file.values.length > 0) return file.values.length;
  // 索引阶段的波形文件只读头部：payload 字节数 / 每采样字节数
  const bytesPerSample = file.kind === "waveform_u8" ? 1 : 2;
  return Math.floor(file.payloadBytes / bytesPerSample);
}

function isEventRecord(
  record: ParsedVentilatorFile["records"][number]
): record is EventRecord {
  return "sourceLabel" in record;
}

function isSignal(file: ParsedVentilatorFile) {
  return (
    file.kind === "waveform_u8" ||
    file.kind === "waveform_u16le" ||
    file.kind === "waveform_i16le"
  );
}

function buildUseSession(record: EventRecord): UseSession | null {
  if (
    record.sourceLabel !== "usetime" ||
    record.value1 <= 0 ||
    !record.timestamp
  )
    return null;

  const endMs = parseEdfTimestampMs(record.timestamp);
  if (endMs === null) return null;

  const startDate = new Date(endMs - record.value1 * 1000);
  return {
    startTime: formatTimestamp(startDate),
    endTime: record.timestamp,
    durationSeconds: record.value1,
  };
}

function buildUseSessions(files: ParsedVentilatorFile[]) {
  const sessions = files
    .flatMap((file) => file.records.filter(isEventRecord).map(buildUseSession))
    .filter((session): session is UseSession => session !== null);

  return sessions.sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function makeEmptySummary(date: string): DaySummary {
  return {
    date,
    startTime: null,
    endTime: null,
    useDurationSeconds: null,
    useSessions: [],
    eventCounts: {},
    signalPresence: Object.fromEntries(
      expectedSignalLabels.map((label) => [label, false])
    ),
    sampleCounts: {},
    pressureRange: null,
    missingFiles: [...expectedSignalLabels],
    warnings: [],
  };
}

// pressure 通道原始采样以 0.1 cmH2O 为分辨率（与 config 字段、ascp 记录的 ×10 编码一致，
// 见 docs/data-format.md），摘要统一换算为 cmH2O 存储。
const PRESSURE_CMH2O_PER_UNIT = 0.1;

function extendPressureRange(
  range: DaySummary["pressureRange"],
  value: number
): { min: number; max: number } {
  const cmH2O = Math.round(value * PRESSURE_CMH2O_PER_UNIT * 10) / 10;
  if (!range) return { min: cmH2O, max: cmH2O };
  return { min: Math.min(range.min, cmH2O), max: Math.max(range.max, cmH2O) };
}

async function summarizeDay(
  date: string,
  fileRefs: ImportedFileRef[],
  skipPressureScan: boolean
) {
  const summary = makeEmptySummary(date);
  const files = await Promise.all(
    fileRefs.map((fileRef) => parseImportedFileForIndex(fileRef))
  );

  for (const parsed of files) {
    const label = parsed.header.label;

    summary.warnings.push(...parsed.warnings);

    if (
      parsed.header.startTime &&
      (!summary.startTime || parsed.header.startTime < summary.startTime)
    ) {
      summary.startTime = parsed.header.startTime;
    }

    if (
      parsed.header.endTime &&
      (!summary.endTime || parsed.header.endTime > summary.endTime)
    ) {
      summary.endTime = parsed.header.endTime;
    }

    if (isSignal(parsed)) {
      summary.signalPresence[label] = true;
      summary.sampleCounts[label] =
        (summary.sampleCounts[label] ?? 0) + sampleCountOf(parsed);

      if (!skipPressureScan && label === "pressure") {
        for (const value of parsed.values) {
          summary.pressureRange = extendPressureRange(
            summary.pressureRange,
            value
          );
        }
      }
    }

    if (parsed.kind === "events16") {
      const count = parsed.records.filter(isEventRecord).length;
      summary.eventCounts[label] = (summary.eventCounts[label] ?? 0) + count;
    }
  }

  summary.useSessions = buildUseSessions(files);
  if (summary.useSessions.length > 0) {
    summary.startTime = summary.useSessions[0].startTime;
    summary.endTime =
      summary.useSessions[summary.useSessions.length - 1].endTime;
    summary.useDurationSeconds = summary.useSessions.reduce(
      (total, session) => total + session.durationSeconds,
      0
    );
  } else {
    summary.useDurationSeconds = secondsBetween(
      summary.startTime,
      summary.endTime
    );
  }
  summary.missingFiles = expectedSignalLabels.filter(
    (label) => !summary.signalPresence[label]
  );

  return { summary, files };
}

export type IndexProgress = { completed: number; total: number };

export async function buildDatasetIndex(
  importedFiles: ImportedFileRef[],
  onProgress?: (progress: IndexProgress) => void
): Promise<DatasetIndex> {
  const filesByDay: Record<string, ImportedFileRef[]> = {};
  const warnings: string[] = [];

  for (const fileRef of importedFiles) {
    const sourcePath = fileRef.path || fileRef.name;
    const date = inferDateFromPath(sourcePath);
    if (!date) {
      warnings.push(`Could not infer date from "${sourcePath}"`);
      continue;
    }

    filesByDay[date] ??= [];
    filesByDay[date].push(fileRef);
  }

  const days = Object.keys(filesByDay).sort();
  const summariesByDay: Record<string, DaySummary> = {};
  const parsedFilesByDay: Record<string, ParsedVentilatorFile[]> = {};

  let completed = 0;
  let runSettled = false;
  await Promise.all(
    days.map(async (day) => {
      const { summary, files } = await summarizeDay(day, filesByDay[day], true);
      summariesByDay[day] = summary;
      parsedFilesByDay[day] = files;
      if (runSettled) return;
      completed += 1;
      onProgress?.({ completed, total: days.length });
    })
  ).finally(() => {
    // 某日解析失败使 Promise.all 先行拒绝后,其余日任务不得再向调用方发进度
    runSettled = true;
  });

  return {
    days,
    dateRange: {
      start: days[0] ?? null,
      end: days[days.length - 1] ?? null,
    },
    filesByDay,
    summariesByDay,
    parsedFilesByDay,
    warnings,
  };
}

// 导出场景：索引阶段跳过了压力扫描，按需对单日 pressure 文件补算范围
export async function computePressureRange(
  index: DatasetIndex,
  date: string
): Promise<DaySummary["pressureRange"]> {
  // 已完整解析的缓存条目优先(legacy 缓存或已加载的日),避免重复读盘
  for (const file of index.parsedFilesByDay[date] ?? []) {
    if (file.header.label !== "pressure" || file.values.length === 0) continue;
    return scanPressureRange(file.values);
  }
  for (const ref of index.filesByDay[date] ?? []) {
    const parsed = await parseImportedFile(ref);
    if (
      parsed.header.label !== "pressure" ||
      parsed.kind !== "waveform_u16le"
    ) {
      continue;
    }
    return scanPressureRange(parsed.values);
  }
  return null;
}

function scanPressureRange(
  values: ParsedVentilatorFile["values"]
): DaySummary["pressureRange"] {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (!Number.isFinite(min)) return null;
  const toCmH2O = (value: number) =>
    Math.round(value * PRESSURE_CMH2O_PER_UNIT * 10) / 10;
  return { min: toCmH2O(min), max: toCmH2O(max) };
}

export function filterDays(index: DatasetIndex, filter: DateFilter) {
  return index.days.filter((day) => {
    if (filter.startDate && day < filter.startDate) return false;
    if (filter.endDate && day > filter.endDate) return false;

    const summary = index.summariesByDay[day];
    if (
      filter.requireEvent &&
      (summary.eventCounts[filter.requireEvent] ?? 0) === 0
    )
      return false;
    if (filter.requireEvents) {
      const missingRequired = filter.requireEvents.some(
        (label) => (summary.eventCounts[label] ?? 0) === 0
      );
      if (missingRequired) return false;
    }
    if (filter.missingFilesOnly && summary.missingFiles.length === 0)
      return false;
    if (
      filter.minUseDurationSeconds !== undefined &&
      (summary.useDurationSeconds ?? 0) < filter.minUseDurationSeconds
    ) {
      return false;
    }

    return true;
  });
}

function secondsFromDayStart(
  timestamp: string | null,
  startTime: string | null
) {
  return secondsBetween(startTime, timestamp) ?? undefined;
}

function withSecondsFromDayStart(
  record: EventRecord,
  startTime: string | null
): EventRecord {
  const seconds = secondsFromDayStart(record.timestamp, startTime);
  return seconds === undefined
    ? record
    : { ...record, secondsFromDayStart: seconds };
}

// 按日粒度的 LRU：仅保留最近 N 天的完整解析结果，波形 payload 不再常驻内存。
// 以 dataset 实例为键（WeakMap），重新导入后旧缓存可整体回收、不会跨数据集污染。
const dayDetailCache = new WeakMap<
  DatasetIndex,
  Map<string, ParsedVentilatorFile[]>
>();
const DAY_DETAIL_CACHE_LIMIT = 4;

function getDayCache(index: DatasetIndex) {
  let perIndex = dayDetailCache.get(index);
  if (!perIndex) {
    perIndex = new Map();
    dayDetailCache.set(index, perIndex);
  }
  return perIndex;
}

/** 测试辅助：查看某 dataset 的按日缓存 */
export function inspectDayDetailCache(index: DatasetIndex) {
  const perIndex = dayDetailCache.get(index);
  return {
    keys: perIndex ? [...perIndex.keys()] : [],
    size: perIndex ? perIndex.size : 0,
  };
}

async function resolveDayFiles(
  index: DatasetIndex,
  date: string
): Promise<ParsedVentilatorFile[]> {
  const perIndex = getDayCache(index);
  const cached = perIndex.get(date);
  if (cached) {
    // 命中时刷新 LRU 顺序，避免退化为 FIFO
    perIndex.delete(date);
    perIndex.set(date, cached);
    return cached;
  }

  const indexFiles = index.parsedFilesByDay[date] ?? [];
  const refsByName = new Map(
    (index.filesByDay[date] ?? []).map((ref) => [ref.name, ref])
  );
  const files = await Promise.all(
    indexFiles.map(async (file) => {
      // 索引阶段仅读头部的文件在此补齐完整 payload
      if (file.rawPayload.length > 0 || file.values.length > 0) return file;
      const ref = refsByName.get(file.fileName);
      if (!ref) return file;
      return parseImportedFile(ref);
    })
  );

  perIndex.set(date, files);
  while (perIndex.size > DAY_DETAIL_CACHE_LIMIT) {
    const oldest = perIndex.keys().next().value;
    if (oldest === undefined) break;
    perIndex.delete(oldest);
  }
  return files;
}

export async function loadDayDetail(
  index: DatasetIndex,
  date: string
): Promise<DayDetail> {
  const files = await resolveDayFiles(index, date);
  const summary = index.summariesByDay[date];
  const signals = files.filter(isSignal);
  const useSessions = buildUseSessions(files);
  const events = files.flatMap((file) =>
    file.records
      .filter(isEventRecord)
      .map((record) => withSecondsFromDayStart(record, summary.startTime))
  );

  // 按需计算压力范围:返回新的 summary 对象,不突变 dataset 索引中的共享状态
  let pressureRange = summary?.pressureRange ?? null;
  if (summary && !pressureRange) {
    for (const signal of signals) {
      if (signal.header.label === "pressure") {
        for (const value of signal.values) {
          pressureRange = extendPressureRange(pressureRange, value);
        }
      }
    }
  }
  const detailSummary = summary
    ? { ...summary, pressureRange: pressureRange ?? summary.pressureRange }
    : summary;

  // 惰性解析新发现的 payload 警告(如尾部字节)并入 summary,供数据集状态条聚合。
  // 以索引条目判断哪些文件是延迟解析的(resolveDayFiles 后 full 文件也有 payload,
  // 不能再据此判断);不去重——不同文件的同款警告都应保留;
  // 头部长度警告在索引阶段的头部解析中已计入,跳过以免重复。
  const deferredNames = new Set(
    (index.parsedFilesByDay[date] ?? [])
      .filter(
        (file) => file.rawPayload.length === 0 && file.values.length === 0
      )
      .map((file) => file.fileName)
  );
  for (const file of files) {
    if (!deferredNames.has(file.fileName)) continue;
    for (const warning of file.warnings) {
      if (warning.startsWith("头部长度字段无效")) continue;
      summary.warnings.push(warning);
    }
  }

  return {
    summary: detailSummary,
    files,
    signals,
    events,
    useSessions,
    rawFiles: files,
  };
}
