import { useEffect, useMemo, useRef } from "react";
import type { DatasetIndex } from "../../types";
import { heatCellTitle, intensityByDay } from "./navigatorUtils";

interface DayHeatmapProps {
  dataset: DatasetIndex;
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

/**
 * 全量日期热力图(不再截断 90 天):容器限高滚动,
 * 切换日期后自动把选中格滚入可视区域;单元格带可读的 aria 标签。
 */
export function DayHeatmap({
  dataset,
  selectedDate,
  onSelectDate,
}: DayHeatmapProps) {
  const intensity = useMemo(() => intensityByDay(dataset), [dataset]);
  const activeCellRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    // jsdom 等测试环境未实现 scrollIntoView
    activeCellRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [selectedDate]);

  return (
    <section aria-label="日期热力图">
      <span className="heatmap-label">
        数据概览(全部 {dataset.days.length} 天,颜色越深事件越多)
      </span>
      <div className="heatmap">
        {dataset.days.map((date) => {
          const isActive = date === selectedDate;
          const summary = dataset.summariesByDay[date];
          const completeness =
            !summary || summary.missingFiles.length === 0
              ? " complete"
              : " partial";
          return (
            <button
              type="button"
              key={date}
              ref={isActive ? activeCellRef : undefined}
              className={`heat-cell${completeness} intensity-${
                intensity[date] ?? 1
              }${isActive ? " active" : ""}`}
              title={heatCellTitle(date, dataset)}
              aria-label={heatCellTitle(date, dataset)}
              aria-pressed={isActive}
              onClick={() => onSelectDate(date)}
            />
          );
        })}
      </div>
      <div className="heatmap-legend">
        <span className="legend-dot legend-complete" /> 完整
        <span className="legend-dot legend-partial" /> 缺失
        <span className="legend-dot legend-active" /> 选中
      </div>
    </section>
  );
}
