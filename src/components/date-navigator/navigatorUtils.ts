import type { DateFilter, DatasetIndex } from "../../types";

export type RangeMode = "all" | "recent7" | "recent30" | "month" | "custom";

export interface FilterState {
  rangeMode: RangeMode;
  customStart: string;
  customEnd: string;
  requiredEvents: string[];
  missingOnly: boolean;
  minHours: string;
}

export const defaultFilterState: FilterState = {
  rangeMode: "all",
  customStart: "",
  customEnd: "",
  requiredEvents: [],
  missingOnly: false,
  minHours: "",
};

export function buildDateFilter(
  dataset: DatasetIndex,
  state: FilterState
): DateFilter {
  const days = dataset.days;
  const result: DateFilter = { missingFilesOnly: state.missingOnly };

  if (state.rangeMode === "recent7" || state.rangeMode === "recent30") {
    const size = state.rangeMode === "recent7" ? 7 : 30;
    if (days.length > size) result.startDate = days[days.length - size];
  } else if (state.rangeMode === "month") {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const first = days.find((day) => day.startsWith(currentMonth));
    if (first) result.startDate = first;
  } else if (state.rangeMode === "custom") {
    if (state.customStart) result.startDate = state.customStart;
    if (state.customEnd) result.endDate = state.customEnd;
  }

  if (state.requiredEvents.length > 0) {
    result.requireEvents = state.requiredEvents as DateFilter["requireEvents"];
  }
  const hours = Number(state.minHours);
  if (state.minHours !== "" && !Number.isNaN(hours) && hours > 0) {
    result.minUseDurationSeconds = Math.round(hours * 3600);
  }
  return result;
}

/** 日期输入框的 min/max 边界,收敛 dateRange 到 input 属性的重复换算。 */
export function dateInputBounds(dateRange: {
  start: string | null;
  end: string | null;
}) {
  return { min: dateRange.start ?? undefined, max: dateRange.end ?? undefined };
}

export function intensityByDay(dataset: DatasetIndex) {
  const counts = dataset.days.map((day) => {
    const summary = dataset.summariesByDay[day];
    return (summary?.eventCounts.ai ?? 0) + (summary?.eventCounts.hi ?? 0);
  });
  const max = Math.max(1, ...counts);
  const map: Record<string, number> = {};
  dataset.days.forEach((day, index) => {
    map[day] = Math.max(1, Math.ceil((counts[index] / max) * 4));
  });
  return map;
}

export function heatCellTitle(date: string, dataset: DatasetIndex) {
  const summary = dataset.summariesByDay[date];
  if (!summary) return date;
  const events = (summary.eventCounts.ai ?? 0) + (summary.eventCounts.hi ?? 0);
  const missing = summary.missingFiles.length;
  const missingText = missing === 0 ? "数据完整" : `缺失 ${missing} 个文件`;
  return `${date} — ${missingText} · AI+HI ${events} 次`;
}

/**
 * 在导航范围内找 selectedDate 沿 offset 方向的相邻日期。
 * selectedDate 不在范围内时,返回该方向上距离最近的日期
 * (例如筛选后当前日期被排除,下一天 = 范围内第一个晚于它的日期)。
 */
export function scopeNeighbor(
  scope: string[],
  selectedDate: string,
  offset: -1 | 1
): string | null {
  const index = scope.indexOf(selectedDate);
  if (index !== -1) return scope[index + offset] ?? null;
  if (offset === 1) {
    return scope.find((day) => day > selectedDate) ?? null;
  }
  for (let i = scope.length - 1; i >= 0; i -= 1) {
    if (scope[i] < selectedDate) return scope[i];
  }
  return null;
}

/** 找距离目标日期(按日历距离)最近的有数据日期;无数据时返回 null。 */
export function nearestAvailableDate(
  days: string[],
  target: string
): string | null {
  if (days.length === 0 || target === "") return null;
  const targetTime = new Date(`${target}T00:00:00`).getTime();
  if (Number.isNaN(targetTime)) return null;
  let best: string | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const day of days) {
    const diff = Math.abs(new Date(`${day}T00:00:00`).getTime() - targetTime);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = day;
    }
  }
  return best;
}
