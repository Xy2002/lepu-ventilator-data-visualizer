import type { DatasetIndex } from "../../types";
import { dateInputBounds } from "./navigatorUtils";
import type { FilterState, RangeMode } from "./navigatorUtils";

interface FilterPanelProps {
  dataset: DatasetIndex;
  state: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
}

const EVENT_OPTIONS: Array<{ key: "ai" | "hi" | "ascp"; label: string }> = [
  { key: "ai", label: "AI 有记录" },
  { key: "hi", label: "HI 有记录" },
  { key: "ascp", label: "ASCP 有记录" },
];

/** 筛选面板。用 details 折叠,收起后不遮挡主要导航操作。 */
export function FilterPanel({ dataset, state, onChange }: FilterPanelProps) {
  const { dateRange } = dataset;

  function toggleEvent(key: "ai" | "hi" | "ascp") {
    const requiredEvents = state.requiredEvents.includes(key)
      ? state.requiredEvents.filter((item) => item !== key)
      : [...state.requiredEvents, key];
    onChange({ requiredEvents });
  }

  return (
    <details className="filter-panel" open>
      <summary>筛选（约束前后切换与下方列表）</summary>
      <label className="filter-row">
        时间范围
        <select
          value={state.rangeMode}
          onChange={(event) =>
            onChange({ rangeMode: event.target.value as RangeMode })
          }
        >
          <option value="all">全部日期</option>
          <option value="recent7">近 7 天</option>
          <option value="recent30">近 30 天</option>
          <option value="month">本月</option>
          <option value="custom">自定义区间</option>
        </select>
      </label>
      {state.rangeMode === "custom" ? (
        <div className="filter-row filter-range">
          <input
            type="date"
            aria-label="起始日期"
            value={state.customStart}
            {...dateInputBounds(dateRange)}
            onChange={(event) => onChange({ customStart: event.target.value })}
          />
          <span>~</span>
          <input
            type="date"
            aria-label="结束日期"
            value={state.customEnd}
            {...dateInputBounds(dateRange)}
            onChange={(event) => onChange({ customEnd: event.target.value })}
          />
        </div>
      ) : null}
      <div className="filter-row filter-checks">
        {EVENT_OPTIONS.map(({ key, label }) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={state.requiredEvents.includes(key)}
              onChange={() => toggleEvent(key)}
            />
            {label}
          </label>
        ))}
        <label>
          <input
            type="checkbox"
            checked={state.missingOnly}
            onChange={(event) =>
              onChange({ missingOnly: event.target.checked })
            }
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
          value={state.minHours}
          onChange={(event) => onChange({ minHours: event.target.value })}
        />
      </label>
    </details>
  );
}
