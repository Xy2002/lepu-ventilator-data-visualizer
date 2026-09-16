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

/** 已启用的筛选条件数量,显示为标题旁的徽标。 */
function activeFilterCount(state: FilterState): number {
  let count = state.requiredEvents.length;
  if (state.rangeMode !== "all") count += 1;
  if (state.missingOnly) count += 1;
  if (state.minHours.trim() !== "") count += 1;
  return count;
}

/** 筛选面板。用 details 折叠,收起后不遮挡主要导航操作;生效条件数用徽标提示。 */
export function FilterPanel({ dataset, state, onChange }: FilterPanelProps) {
  const { dateRange } = dataset;
  const activeCount = activeFilterCount(state);

  function toggleEvent(key: "ai" | "hi" | "ascp") {
    const requiredEvents = state.requiredEvents.includes(key)
      ? state.requiredEvents.filter((item) => item !== key)
      : [...state.requiredEvents, key];
    onChange({ requiredEvents });
  }

  return (
    <details className="filter-panel" open>
      <summary>
        <svg
          className="filter-chevron"
          width="12"
          height="12"
          viewBox="0 0 16 16"
          aria-hidden="true"
        >
          <path
            d="M6 3.5 10.5 8 6 12.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        筛选
        {activeCount > 0 ? (
          <span className="filter-badge">{activeCount} 项生效</span>
        ) : null}
      </summary>
      <div className="filter-body">
        <p className="filter-hint">条件同时约束前后切换与下方日期列表</p>
        <label className="filter-row">
          <span className="filter-label">时间范围</span>
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
          <div className="filter-custom-range">
            <label className="filter-bound">
              <span aria-hidden="true">起</span>
              <input
                type="date"
                aria-label="起始日期"
                value={state.customStart}
                {...dateInputBounds(dateRange)}
                onChange={(event) =>
                  onChange({ customStart: event.target.value })
                }
              />
            </label>
            <label className="filter-bound">
              <span aria-hidden="true">止</span>
              <input
                type="date"
                aria-label="结束日期"
                value={state.customEnd}
                {...dateInputBounds(dateRange)}
                onChange={(event) =>
                  onChange({ customEnd: event.target.value })
                }
              />
            </label>
          </div>
        ) : null}
        <div className="filter-row">
          <span className="filter-label" id="filter-event-label">
            必含事件
          </span>
          <div
            className="filter-chip-row"
            role="group"
            aria-labelledby="filter-event-label"
          >
            {EVENT_OPTIONS.map(({ key, label }) => {
              const checked = state.requiredEvents.includes(key);
              return (
                <label
                  key={key}
                  className={checked ? "filter-chip checked" : "filter-chip"}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleEvent(key)}
                  />
                  {label}
                </label>
              );
            })}
          </div>
        </div>
        <label
          className={state.missingOnly ? "filter-chip checked" : "filter-chip"}
        >
          <input
            type="checkbox"
            checked={state.missingOnly}
            onChange={(event) =>
              onChange({ missingOnly: event.target.checked })
            }
          />
          只看缺失文件日期
        </label>
        <label className="filter-row">
          <span className="filter-label">最短使用时长（小时）</span>
          <input
            type="number"
            min="0"
            step="0.5"
            placeholder="不限"
            value={state.minHours}
            onChange={(event) => onChange({ minHours: event.target.value })}
          />
        </label>
      </div>
    </details>
  );
}
