import { parseVentilatorFile } from '../parser/edfParser';
import type {
  DatasetIndex,
  DateFilter,
  DayDetail,
  DaySummary,
  EventRecord,
  ImportedFileRef,
  ParsedVentilatorFile,
  UseSession,
} from '../types';

const expectedSignalLabels = ['flow', 'pressure', 'real_pres', 'real_flow'];

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
  const compactMatch = path.match(/(?:^|[^\d])(\d{4})(\d{2})(\d{2})(?:[^\d]|$)/);
  if (compactMatch) {
    return normalizeDate(compactMatch[1], compactMatch[2], compactMatch[3]);
  }

  const dashedMatch = path.match(/(?:^|[^\d])(\d{4})-(\d{2})-(\d{2})(?:[^\d]|$)/);
  if (dashedMatch) {
    return normalizeDate(dashedMatch[1], dashedMatch[2], dashedMatch[3]);
  }

  return null;
}

function parseTimestamp(timestamp: string | null) {
  if (!timestamp) return null;
  const match = timestamp.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/,
  );
  if (!match) return null;

  const [, year, month, day, hour, minute, second, fraction = '0'] = match;
  const millisecond = Number(fraction.padEnd(3, '0').slice(0, 3));
  const date = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      millisecond,
    ),
  );

  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTimestamp(date: Date) {
  const pad = (value: number, length = 2) => value.toString().padStart(length, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(
    date.getUTCHours(),
  )}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

export function secondsBetween(start: string | null, end: string | null) {
  const startDate = parseTimestamp(start);
  const endDate = parseTimestamp(end);
  if (!startDate || !endDate) return null;

  const seconds = (endDate.getTime() - startDate.getTime()) / 1000;
  return seconds >= 0 ? seconds : null;
}

async function parseImportedFile(fileRef: ImportedFileRef) {
  const buffer = await fileRef.file.arrayBuffer();
  return parseVentilatorFile(fileRef.name, new Uint8Array(buffer));
}

function isEventRecord(record: ParsedVentilatorFile['records'][number]): record is EventRecord {
  return 'sourceLabel' in record;
}

function isSignal(file: ParsedVentilatorFile) {
  return file.kind === 'waveform_u8' || file.kind === 'waveform_u16le' || file.kind === 'waveform_i16le';
}

function buildUseSession(record: EventRecord): UseSession | null {
  if (record.sourceLabel !== 'usetime' || record.value1 <= 0 || !record.timestamp) return null;

  const endDate = parseTimestamp(record.timestamp);
  if (!endDate) return null;

  const startDate = new Date(endDate.getTime() - record.value1 * 1000);
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
    signalPresence: Object.fromEntries(expectedSignalLabels.map((label) => [label, false])),
    sampleCounts: {},
    pressureRange: null,
    missingFiles: [...expectedSignalLabels],
    warnings: [],
  };
}

function addPressureValue(summary: DaySummary, value: number) {
  if (summary.pressureRange) {
    summary.pressureRange.min = Math.min(summary.pressureRange.min, value);
    summary.pressureRange.max = Math.max(summary.pressureRange.max, value);
    return;
  }

  summary.pressureRange = { min: value, max: value };
}

async function summarizeDay(date: string, fileRefs: ImportedFileRef[], skipPressureScan: boolean) {
  const summary = makeEmptySummary(date);
  const files = await Promise.all(fileRefs.map(parseImportedFile));

  for (const parsed of files) {
    const label = parsed.header.label;

    summary.warnings.push(...parsed.warnings);

    if (parsed.header.startTime && (!summary.startTime || parsed.header.startTime < summary.startTime)) {
      summary.startTime = parsed.header.startTime;
    }

    if (parsed.header.endTime && (!summary.endTime || parsed.header.endTime > summary.endTime)) {
      summary.endTime = parsed.header.endTime;
    }

    if (isSignal(parsed)) {
      summary.signalPresence[label] = true;
      summary.sampleCounts[label] = (summary.sampleCounts[label] ?? 0) + parsed.values.length;

      if (!skipPressureScan && label === 'pressure') {
        for (const value of parsed.values) {
          addPressureValue(summary, value);
        }
      }
    }

    if (parsed.kind === 'events16') {
      const count = parsed.records.filter(isEventRecord).length;
      summary.eventCounts[label] = (summary.eventCounts[label] ?? 0) + count;
    }
  }

  summary.useSessions = buildUseSessions(files);
  if (summary.useSessions.length > 0) {
    summary.startTime = summary.useSessions[0].startTime;
    summary.endTime = summary.useSessions[summary.useSessions.length - 1].endTime;
    summary.useDurationSeconds = summary.useSessions.reduce((total, session) => total + session.durationSeconds, 0);
  } else {
    summary.useDurationSeconds = secondsBetween(summary.startTime, summary.endTime);
  }
  summary.missingFiles = expectedSignalLabels.filter((label) => !summary.signalPresence[label]);

  return { summary, files };
}

export type IndexProgress = { completed: number; total: number };

export async function buildDatasetIndex(
  importedFiles: ImportedFileRef[],
  onProgress?: (progress: IndexProgress) => void,
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

  const results = await Promise.all(
    days.map((day) => summarizeDay(day, filesByDay[day], true)),
  );

  for (let i = 0; i < days.length; i++) {
    const { summary, files } = results[i];
    summariesByDay[days[i]] = summary;
    parsedFilesByDay[days[i]] = files;
    onProgress?.({ completed: i + 1, total: days.length });
  }

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

export function filterDays(index: DatasetIndex, filter: DateFilter) {
  return index.days.filter((day) => {
    if (filter.startDate && day < filter.startDate) return false;
    if (filter.endDate && day > filter.endDate) return false;

    const summary = index.summariesByDay[day];
    if (filter.requireEvent && (summary.eventCounts[filter.requireEvent] ?? 0) === 0) return false;
    if (filter.missingFilesOnly && summary.missingFiles.length === 0) return false;

    return true;
  });
}

function secondsFromDayStart(timestamp: string | null, startTime: string | null) {
  return secondsBetween(startTime, timestamp) ?? undefined;
}

function withSecondsFromDayStart(record: EventRecord, startTime: string | null): EventRecord {
  const seconds = secondsFromDayStart(record.timestamp, startTime);
  return seconds === undefined ? record : { ...record, secondsFromDayStart: seconds };
}

export async function loadDayDetail(index: DatasetIndex, date: string): Promise<DayDetail> {
  const cached = index.parsedFilesByDay[date];
  const files = cached ?? await Promise.all((index.filesByDay[date] ?? []).map(parseImportedFile));
  const summary = index.summariesByDay[date];
  const signals = files.filter(isSignal);
  const useSessions = buildUseSessions(files);
  const events = files.flatMap((file) =>
    file.records.filter(isEventRecord).map((record) => withSecondsFromDayStart(record, summary.startTime)),
  );

  // Compute pressure range on demand if not available
  if (summary && !summary.pressureRange) {
    for (const signal of signals) {
      if (signal.header.label === 'pressure') {
        for (const value of signal.values) {
          addPressureValue(summary, value);
        }
      }
    }
  }

  return {
    summary,
    files,
    signals,
    events,
    useSessions,
    rawFiles: files,
  };
}
