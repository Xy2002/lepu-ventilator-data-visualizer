import { useMemo, useState } from 'react';
import { filterDays } from '../data/dataset';
import type { DatasetIndex } from '../types';

interface DateNavigatorProps {
  dataset: DatasetIndex;
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

export function DateNavigator({ dataset, selectedDate, onSelectDate }: DateNavigatorProps) {
  const [jumpDate, setJumpDate] = useState(selectedDate);
  const [missingOnly, setMissingOnly] = useState(false);
  const filteredDays = useMemo(
    () => filterDays(dataset, { missingFilesOnly: missingOnly }),
    [dataset, missingOnly],
  );
  const selectedIndex = dataset.days.indexOf(selectedDate);

  function move(offset: number) {
    const nextDate = dataset.days[selectedIndex + offset];
    if (nextDate) onSelectDate(nextDate);
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
        <button type="button" onClick={() => move(-1)} disabled={selectedIndex <= 0}>
          上一天
        </button>
        <button type="button" onClick={() => move(1)} disabled={selectedIndex >= dataset.days.length - 1}>
          下一天
        </button>
        <button type="button" onClick={() => dataset.days.includes(jumpDate) && onSelectDate(jumpDate)}>
          跳转
        </button>
      </div>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={missingOnly}
          onChange={(event) => setMissingOnly(event.target.checked)}
        />
        只看缺失文件日期
      </label>
      <div className="heatmap" aria-label="日期热力图">
        {dataset.days.slice(-90).map((date) => (
          <button
            type="button"
            key={date}
            className={date === selectedDate ? 'heat-cell active' : 'heat-cell'}
            title={date}
            onClick={() => onSelectDate(date)}
          />
        ))}
      </div>
      <div className="bounded-results">
        <h3>匹配结果</h3>
        {filteredDays.slice(0, 20).map((date) => (
          <button type="button" key={date} className="result-row" onClick={() => onSelectDate(date)}>
            <strong>{date}</strong>
            <span>HI {dataset.summariesByDay[date].eventCounts.hi ?? 0}</span>
          </button>
        ))}
        {filteredDays.length > 20 ? <p>还有 {filteredDays.length - 20} 天未显示，请缩小筛选范围。</p> : null}
      </div>
    </aside>
  );
}
