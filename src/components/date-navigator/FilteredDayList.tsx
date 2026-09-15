import { useState } from "react";
import { downloadCsv, exportDateSummariesCsv } from "../../data/csv";
import { computePressureRange } from "../../data/dataset";
import type { DatasetIndex } from "../../types";

interface FilteredDayListProps {
  dataset: DatasetIndex;
  filteredDays: string[];
  missingOnly: boolean;
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

const MAX_VISIBLE_DAYS = 20;

/** 筛选结果列表 + 摘要 CSV 导出。 */
export function FilteredDayList({
  dataset,
  filteredDays,
  missingOnly,
  selectedDate,
  onSelectDate,
}: FilteredDayListProps) {
  const [exportError, setExportError] = useState<string | null>(null);

  async function exportSummaries() {
    // 索引阶段跳过压力扫描;导出前为未加载过的日期补算压力范围
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
        `以下日期的压力数据读取失败,已取消导出:${failedDates.join("、")}`
      );
      return;
    }
    setExportError(null);
    const fileName =
      filteredDays.length > 0
        ? `summaries-${filteredDays[0]}-to-${
            filteredDays[filteredDays.length - 1]
          }.csv`
        : "summaries.csv";
    downloadCsv(fileName, exportDateSummariesCsv(summaries));
  }

  return (
    <section className="bounded-results" aria-label="筛选日期列表">
      <h3>筛选日期{missingOnly ? "(仅缺失)" : ""}</h3>
      <button
        type="button"
        className="export-filtered-btn"
        disabled={filteredDays.length === 0}
        onClick={exportSummaries}
      >
        导出筛选日期摘要
      </button>
      {exportError ? <p className="export-error">{exportError}</p> : null}
      <p className="results-hint">
        共 {filteredDays.length} 天,显示最近 {MAX_VISIBLE_DAYS} 天(新→旧)
      </p>
      {filteredDays
        .slice(-MAX_VISIBLE_DAYS)
        .reverse()
        .map((date) => (
          <button
            type="button"
            key={date}
            className={`result-row${date === selectedDate ? " result-row-active" : ""}`}
            aria-pressed={date === selectedDate}
            onClick={() => onSelectDate(date)}
          >
            <strong>{date}</strong>
            <span>
              低通气 {dataset.summariesByDay[date]?.eventCounts.hi ?? 0}
            </span>
          </button>
        ))}
    </section>
  );
}
