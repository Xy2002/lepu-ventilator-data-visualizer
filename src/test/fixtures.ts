import type { DatasetIndex, DaySummary } from "../types";

/** 测试用的最小 DaySummary 构造器,按需覆盖字段。 */
export function makeDaySummary(
  date: string,
  overrides: Partial<DaySummary> = {}
): DaySummary {
  return {
    date,
    startTime: null,
    endTime: null,
    useDurationSeconds: null,
    useSessions: [],
    eventCounts: {},
    signalPresence: {},
    sampleCounts: {},
    pressureRange: null,
    missingFiles: [],
    warnings: [],
    ...overrides,
  };
}

/** 测试用的最小 DatasetIndex 构造器,日期升序;每天生成默认摘要,可按日覆盖字段。 */
export function makeDatasetIndex(
  days: string[],
  overrides: Record<string, Partial<DaySummary>> = {}
): DatasetIndex {
  return {
    days,
    dateRange: { start: days[0] ?? null, end: days[days.length - 1] ?? null },
    filesByDay: {},
    parsedFilesByDay: {},
    warnings: [],
    summariesByDay: Object.fromEntries(
      days.map((date) => [date, makeDaySummary(date, overrides[date])])
    ),
  };
}
