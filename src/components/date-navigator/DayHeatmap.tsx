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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeCellRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const cell = activeCellRef.current;
    if (!container || !cell) return;
    // 只调整容器自身 scrollTop:scrollIntoView 会带动祖先一起滚,
    // 初次挂载时可能把整页拉到侧栏处
    const containerRect = container.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    if (cellRect.top < containerRect.top) {
      container.scrollTop += cellRect.top - containerRect.top;
    } else if (cellRect.bottom > containerRect.bottom) {
      container.scrollTop += cellRect.bottom - containerRect.bottom;
    }
  }, [selectedDate]);

  return (
    <section aria-label="日期热力图">
      <span className="heatmap-label">
        数据概览(全部 {dataset.days.length} 天,颜色越深事件越多)
      </span>
      <div className="heatmap" ref={containerRef}>
        {dataset.days.map((date) => {
          const isActive = date === selectedDate;
          const summary = dataset.summariesByDay[date];
          const completenessClass =
            !summary || summary.missingFiles.length === 0
              ? " complete"
              : " partial";
          const label = heatCellTitle(date, dataset);
          return (
            <button
              type="button"
              key={date}
              ref={isActive ? activeCellRef : undefined}
              className={`heat-cell${completenessClass} intensity-${
                intensity[date] ?? 1
              }${isActive ? " active" : ""}`}
              title={label}
              aria-label={label}
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
