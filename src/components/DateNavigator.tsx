import { useMemo, useState } from "react";
import { downloadCsv, exportDateSummariesCsv } from "../data/csv";
import { computePressureRange, filterDays } from "../data/dataset";
import type { DateFilter, DatasetIndex } from "../types";

interface DateNavigatorProps {
  dataset: DatasetIndex;
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

type RangeMode = "all" | "recent7" | "recent30" | "month" | "custom";

function intensityByDay(dataset: DatasetIndex) {
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

function heatCellClass(
  date: string,
  selectedDate: string,
  dataset: DatasetIndex,
  intensity: number
) {
  const base = date === selectedDate ? "heat-cell active" : "heat-cell";
  const summary = dataset.summariesByDay[date];
  const completeness =
    !summary || summary.missingFiles.length === 0 ? " complete" : " partial";
  return `${base}${completeness} intensity-${intensity}`;
}

function heatCellTitle(date: string, dataset: DatasetIndex) {
  const summary = dataset.summariesByDay[date];
  if (!summary) return date;
  const events = (summary.eventCounts.ai ?? 0) + (summary.eventCounts.hi ?? 0);
  const missing = summary.missingFiles.length;
  const missingText = missing === 0 ? "数据完整" : `缺失 ${missing} 个文件`;
  return `${date} — ${missingText} · AI+HI ${events} 次`;
}

export function DateNavigator({
  dataset,
  selectedDate,
  onSelectDate,
}: DateNavigatorProps) {
  const [jumpDate, setJumpDate] = useState(selectedDate);
  const [missingOnly, setMissingOnly] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [rangeMode, setRangeMode] = useState<RangeMode>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [requiredEvents, setRequiredEvents] = useState<string[]>([]);
  const [minHours, setMinHours] = useState("");

  const filter = useMemo<DateFilter>(() => {
    const days = dataset.days;
    const result: DateFilter = { missingFilesOnly: missingOnly };

    if (rangeMode === "recent7" || rangeMode === "recent30") {
      const size = rangeMode === "recent7" ? 7 : 30;
      if (days.length > size) result.startDate = days[days.length - size];
    } else if (rangeMode === "month") {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const first = days.find((day) => day.startsWith(currentMonth));
      if (first) result.startDate = first;
    } else if (rangeMode === "custom") {
      if (customStart) result.startDate = customStart;
      if (customEnd) result.endDate = customEnd;
    }

    if (requiredEvents.length > 0) {
      result.requireEvents = requiredEvents as DateFilter["requireEvents"];
    }
    const hours = Number(minHours);
    if (minHours !== "" && !Number.isNaN(hours) && hours > 0) {
      result.minUseDurationSeconds = Math.round(hours * 3600);
    }
    return result;
  }, [
    dataset,
    missingOnly,
    rangeMode,
    customStart,
    customEnd,
    requiredEvents,
    minHours,
  ]);

  const filteredDays = useMemo(
    () => filterDays(dataset, filter),
    [dataset, filter]
  );
  const intensity = useMemo(() => intensityByDay(dataset), [dataset]);
  const selectedIndex = dataset.days.indexOf(selectedDate);

  function move(offset: number) {
    const nextDate = dataset.days[selectedIndex + offset];
    if (nextDate) onSelectDate(nextDate);
  }

  function toggleEvent(label: string) {
    setRequiredEvents((prev) =>
      prev.includes(label)
        ? prev.filter((item) => item !== label)
        : [...prev, label]
    );
  }

  return (
    <aside className="date-navigator">
      <h2>日期导航</h2>
      <label>
        跳转日期
        <input
          type="date"
          min={dataset.dateRange.start ?? undefined}
          max={dataset.dateRange.end ?? undefined}
          value={jumpDate}
          onChange={(event) => setJumpDate(event.target.value)}
        />
      </label>
      <div className="nav-row">
        <button
          type="button"
          onClick={() => move(-1)}
          disabled={selectedIndex <= 0}
        >
          上一天
        </button>
        <button
          type="button"
          onClick={() => move(1)}
          disabled={selectedIndex >= dataset.days.length - 1}
        >
          下一天
        </button>
        <button
          type="button"
          onClick={() =>
            dataset.days.includes(jumpDate) && onSelectDate(jumpDate)
          }
        >
          跳转
        </button>
      </div>

      <fieldset className="filter-panel">
        <legend>筛选</legend>
        <label className="filter-row">
          时间范围
          <select
            value={rangeMode}
            onChange={(event) => setRangeMode(event.target.value as RangeMode)}
          >
            <option value="all">全部日期</option>
            <option value="recent7">近 7 天</option>
            <option value="recent30">近 30 天</option>
            <option value="month">本月</option>
            <option value="custom">自定义区间</option>
          </select>
        </label>
        {rangeMode === "custom" ? (
          <div className="filter-row filter-range">
            <input
              type="date"
              aria-label="起始日期"
              value={customStart}
              min={dataset.dateRange.start ?? undefined}
              max={dataset.dateRange.end ?? undefined}
              onChange={(event) => setCustomStart(event.target.value)}
            />
            <span>~</span>
            <input
              type="date"
              aria-label="结束日期"
              value={customEnd}
              min={dataset.dateRange.start ?? undefined}
              max={dataset.dateRange.end ?? undefined}
              onChange={(event) => setCustomEnd(event.target.value)}
            />
          </div>
        ) : null}
        <div className="filter-row filter-checks">
          <label>
            <input
              type="checkbox"
              checked={requiredEvents.includes("ai")}
              onChange={() => toggleEvent("ai")}
            />
            AI 有记录
          </label>
          <label>
            <input
              type="checkbox"
              checked={requiredEvents.includes("hi")}
              onChange={() => toggleEvent("hi")}
            />
            HI 有记录
          </label>
          <label>
            <input
              type="checkbox"
              checked={requiredEvents.includes("ascp")}
              onChange={() => toggleEvent("ascp")}
            />
            ASCP 有记录
          </label>
          <label>
            <input
              type="checkbox"
              checked={missingOnly}
              onChange={(event) => setMissingOnly(event.target.checked)}
            />
            只看缺失文件日期
          </label>
        </div>
        <label className="filter-row">
          最短使用时长（小时）
          <input
            type="number"
            min="0"
            step="0.5"
            placeholder="不限"
            value={minHours}
            onChange={(event) => setMinHours(event.target.value)}
          />
        </label>
      </fieldset>

      <span className="heatmap-label">
        数据概览（近90天，颜色越深事件越多）
      </span>
      <div className="heatmap" aria-label="日期热力图">
        {dataset.days.slice(-90).map((date) => (
          <button
            type="button"
            key={date}
            className={heatCellClass(
              date,
              selectedDate,
              dataset,
              intensity[date] ?? 1
            )}
            title={heatCellTitle(date, dataset)}
            onClick={() => onSelectDate(date)}
          />
        ))}
      </div>
      <div className="heatmap-legend">
        <span className="legend-dot legend-complete" /> 完整
        <span className="legend-dot legend-partial" /> 缺失
        <span className="legend-dot legend-active" /> 选中
      </div>

      <div className="bounded-results">
        <h3>筛选日期{missingOnly ? "（仅缺失）" : ""}</h3>
        <button
          type="button"
          className="export-filtered-btn"
          disabled={filteredDays.length === 0}
          onClick={async () => {
            // 索引阶段跳过压力扫描；导出前为未加载过的日期补算压力范围
            const failedDates: string[] = [];
            const summaries = await Promise.all(
              filteredDays.map(async (date) => {
                const summary = dataset.summariesByDay[date];
                let pressureRange = summary.pressureRange;
                if (!pressureRange) {
                  try {
                    pressureRange = await computePressureRange(dataset, date);
                  } catch {
                    failedDates.push(date);
                  }
                }
                return pressureRange ? { ...summary, pressureRange } : summary;
              })
            );

            // 读取失败时中止导出,避免空白压力列被误当作「无压力数据」
            if (failedDates.length > 0) {
              setExportError(
                `以下日期的压力数据读取失败，已取消导出：${failedDates.join("、")}`
              );
              return;
            }
            setExportError(null);
            const fileName =
              filteredDays.length > 0
                ? `summaries-${filteredDays[0]}-to-${filteredDays[filteredDays.length - 1]}.csv`
                : "summaries.csv";
            downloadCsv(fileName, exportDateSummariesCsv(summaries));
          }}
        >
          导出筛选日期摘要
        </button>
        {exportError ? <p className="export-error">{exportError}</p> : null}
        <p className="results-hint">
          共 {filteredDays.length} 天，显示最近 20 天
        </p>
        {filteredDays
          .slice(-20)
          .reverse()
          .map((date) => (
            <button
              type="button"
              key={date}
              className="result-row"
              onClick={() => onSelectDate(date)}
            >
              <strong>{date}</strong>
              <span>
                低通气 {dataset.summariesByDay[date].eventCounts.hi ?? 0}
              </span>
            </button>
          ))}
      </div>
    </aside>
  );
}
