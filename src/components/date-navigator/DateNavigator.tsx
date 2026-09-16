import { useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { filterDays } from "../../data/dataset";
import type { DatasetIndex } from "../../types";
import { DayHeatmap } from "./DayHeatmap";
import { FilteredDayList } from "./FilteredDayList";
import { FilterPanel } from "./FilterPanel";
import { NavigatorControls } from "./NavigatorControls";
import {
  buildDateFilter,
  defaultFilterState,
  scopeNeighbor,
  type FilterState,
} from "./navigatorUtils";

interface DateNavigatorProps {
  dataset: DatasetIndex;
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

/**
 * 日期导航侧栏容器。
 * 前后切换与跳转共用同一个导航范围:未启用筛选时是全部日期,
 * 启用筛选后只在筛选结果内切换,保证导航与所见列表一致。
 */
export function DateNavigator({
  dataset,
  selectedDate,
  onSelectDate,
}: DateNavigatorProps) {
  const [filterState, setFilterState] =
    useState<FilterState>(defaultFilterState);

  const scope = useMemo(
    () => filterDays(dataset, buildDateFilter(dataset, filterState)),
    [dataset, filterState]
  );

  function step(offset: -1 | 1) {
    const next = scopeNeighbor(scope, selectedDate, offset);
    if (next) onSelectDate(next);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("input, select, textarea")) return;
    // 不劫持浏览器/系统级组合键(如 Alt+← 后退)
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      step(1);
    }
  }

  return (
    <aside className="date-navigator" onKeyDown={handleKeyDown}>
      <h2>日期导航</h2>
      <NavigatorControls
        days={dataset.days}
        dateRange={dataset.dateRange}
        selectedDate={selectedDate}
        scope={scope}
        onSelectDate={onSelectDate}
      />
      <FilterPanel
        dataset={dataset}
        state={filterState}
        onChange={(patch) => setFilterState((prev) => ({ ...prev, ...patch }))}
      />
      <DayHeatmap
        dataset={dataset}
        selectedDate={selectedDate}
        onSelectDate={onSelectDate}
      />
      <FilteredDayList
        dataset={dataset}
        filteredDays={scope}
        missingOnly={filterState.missingOnly}
        selectedDate={selectedDate}
        onSelectDate={onSelectDate}
      />
      <p className="navigator-tip">提示:按 ← / → 键快速切换上一天/下一天</p>
    </aside>
  );
}
