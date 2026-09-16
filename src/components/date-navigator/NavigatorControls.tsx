import { useEffect, useMemo, useState } from "react";
import {
  dateInputBounds,
  nearestAvailableDate,
  scopeNeighbor,
} from "./navigatorUtils";

interface NavigatorControlsProps {
  days: string[];
  dateRange: { start: string | null; end: string | null };
  selectedDate: string;
  /** 当前导航范围(应用筛选后的日期列表) */
  scope: string[];
  onSelectDate: (date: string) => void;
}

/**
 * 跳转输入 + 上一天/下一天 + 位置指示。
 * - 输入框始终跟随当前选中日期,选中有效日期后立即跳转,无需再点按钮;
 * - 输入无数据的日期时不再静默失败,提示最近的有数据日期并可一键跳转;
 * - 前后切换在筛选范围内进行,并通过位置指示展示当前进度。
 */
export function NavigatorControls({
  days,
  dateRange,
  selectedDate,
  scope,
  onSelectDate,
}: NavigatorControlsProps) {
  const [draft, setDraft] = useState(selectedDate);

  useEffect(() => {
    setDraft(selectedDate);
  }, [selectedDate]);

  const prevDate = scopeNeighbor(scope, selectedDate, -1);
  const nextDate = scopeNeighbor(scope, selectedDate, 1);
  const scopeIndex = scope.indexOf(selectedDate);
  const suggestion = useMemo(
    () => (days.includes(draft) ? null : nearestAvailableDate(days, draft)),
    [days, draft]
  );

  function handleDraftChange(value: string) {
    setDraft(value);
    if (days.includes(value)) onSelectDate(value);
  }

  return (
    <section aria-label="日期切换">
      <label>
        跳转日期
        <input
          type="date"
          {...dateInputBounds(dateRange)}
          value={draft}
          onChange={(event) => handleDraftChange(event.target.value)}
        />
      </label>
      <div className="nav-row">
        <button
          type="button"
          onClick={() => prevDate && onSelectDate(prevDate)}
          disabled={!prevDate}
          title={prevDate ? `切换到 ${prevDate}` : undefined}
        >
          ← 上一天
        </button>
        <button
          type="button"
          onClick={() => nextDate && onSelectDate(nextDate)}
          disabled={!nextDate}
          title={nextDate ? `切换到 ${nextDate}` : undefined}
        >
          下一天 →
        </button>
      </div>
      {scopeIndex >= 0 ? (
        <p className="nav-position" aria-live="polite">
          第 {scopeIndex + 1} / {scope.length} 天
        </p>
      ) : (
        <p className="nav-position" aria-live="polite">
          当前日期不在筛选范围内(范围内共 {scope.length} 天)
          <button
            type="button"
            disabled={scope.length === 0}
            onClick={() => {
              const target = nearestAvailableDate(scope, selectedDate);
              if (target) onSelectDate(target);
            }}
          >
            跳到范围内最近日期
          </button>
        </p>
      )}
      {suggestion ? (
        <p className="nav-hint" role="status">
          {draft} 没有数据,最近的有数据日期:
          <button type="button" onClick={() => handleDraftChange(suggestion)}>
            {suggestion}
          </button>
        </p>
      ) : null}
    </section>
  );
}
