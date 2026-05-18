import { useState } from 'react';
import type { EventRecord } from '../types';

interface EventTableProps {
  events: EventRecord[];
  onSelectEvent: (seconds: number, timestamp: string | null) => void;
}

type EventCategory = 'all' | 'ai' | 'hi' | 'ascp' | 'usetime';

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  ai: { label: 'AI 呼吸暂停', color: 'ai' },
  hi: { label: 'HI 低通气', color: 'hi' },
  ascp: { label: 'ASCP 压力', color: 'ascp' },
  usetime: { label: '使用时段', color: 'usetime' },
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}分${s}秒` : `${m}分`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

function eventDetail(event: EventRecord): string {
  if (event.sourceLabel === 'ascp') {
    return `IPAP ${(event.value1 / 10).toFixed(1)} / EPAP ${(event.value2 / 10).toFixed(1)} cmH2O`;
  }
  if (event.sourceLabel === 'ai' || event.sourceLabel === 'hi') {
    return `持续 ${event.value2}秒`;
  }
  if (event.sourceLabel === 'usetime') {
    return `时长 ${formatDuration(event.value1)}`;
  }
  return `${event.value1} / ${event.value2}`;
}

function TypeBadge({ sourceLabel }: { sourceLabel: string }) {
  const meta = CATEGORY_META[sourceLabel];
  if (!meta) return <span>{sourceLabel}</span>;
  return <span className={`event-badge event-badge--${meta.color}`}>{sourceLabel.toUpperCase()}</span>;
}

export function EventTable({ events, onSelectEvent }: EventTableProps) {
  const [activeFilter, setActiveFilter] = useState<EventCategory>('all');

  const counts: Record<string, number> = {};
  for (const event of events) {
    counts[event.sourceLabel] = (counts[event.sourceLabel] ?? 0) + 1;
  }

  const categories = (['ai', 'hi', 'ascp', 'usetime'] as const).filter((c) => (counts[c] ?? 0) > 0);
  const filtered = activeFilter === 'all'
    ? events
    : events.filter((e) => e.sourceLabel === activeFilter);
  const isFiltered = activeFilter !== 'all';

  return (
    <section className="event-table">
      <h3>事件</h3>
      {events.length === 0 ? <p>当前日期没有事件记录。</p> : null}
      {categories.length > 0 ? (
        <div className="event-filter-tabs">
          <button
            type="button"
            className={`event-filter-tab ${activeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setActiveFilter('all')}
          >
            全部 <span className="event-filter-count">{events.length}</span>
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`event-filter-tab ${activeFilter === cat ? 'active' : ''}`}
              onClick={() => setActiveFilter(cat)}
            >
              {cat.toUpperCase()} <span className="event-filter-count">{counts[cat]}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>类型</th>
              <th>时间</th>
              {activeFilter === 'ascp' ? <th>IPAP</th> : null}
              {activeFilter === 'ascp' ? <th>EPAP</th> : null}
              {(activeFilter === 'ai' || activeFilter === 'hi') ? <th>持续</th> : null}
              {activeFilter === 'usetime' ? <th>时长</th> : null}
              {isFiltered ? null : <th>详情</th>}
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((event, index) => {
              const handleSelect = () => {
                if (typeof event.secondsFromDayStart === 'number') {
                  onSelectEvent(event.secondsFromDayStart, event.timestamp);
                }
              };

              if (activeFilter === 'ascp') {
                return (
                  <tr key={`${event.sourceLabel}-${event.timestamp}-${index}`}>
                    <td><TypeBadge sourceLabel={event.sourceLabel} /></td>
                    <td className="event-time">{event.timestamp ?? '-'}</td>
                    <td className="event-value">{(event.value1 / 10).toFixed(1)} <span className="event-unit">cmH2O</span></td>
                    <td className="event-value">{(event.value2 / 10).toFixed(1)} <span className="event-unit">cmH2O</span></td>
                    <td><button type="button" className="event-locate-btn" onClick={handleSelect}>定位</button></td>
                  </tr>
                );
              }

              if (activeFilter === 'ai' || activeFilter === 'hi') {
                return (
                  <tr key={`${event.sourceLabel}-${event.timestamp}-${index}`}>
                    <td><TypeBadge sourceLabel={event.sourceLabel} /></td>
                    <td className="event-time">{event.timestamp ?? '-'}</td>
                    <td className="event-value">{event.value2}秒</td>
                    <td><button type="button" className="event-locate-btn" onClick={handleSelect}>定位</button></td>
                  </tr>
                );
              }

              if (activeFilter === 'usetime') {
                return (
                  <tr key={`${event.sourceLabel}-${event.timestamp}-${index}`}>
                    <td><TypeBadge sourceLabel={event.sourceLabel} /></td>
                    <td className="event-time">{event.timestamp ?? '-'}</td>
                    <td className="event-value">{formatDuration(event.value1)}</td>
                    <td><button type="button" className="event-locate-btn" onClick={handleSelect}>定位</button></td>
                  </tr>
                );
              }

              return (
                <tr key={`${event.sourceLabel}-${event.timestamp}-${index}`}>
                  <td><TypeBadge sourceLabel={event.sourceLabel} /></td>
                  <td className="event-time">{event.timestamp ?? '-'}</td>
                  <td className="event-value">{eventDetail(event)}</td>
                  <td><button type="button" className="event-locate-btn" onClick={handleSelect}>定位</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
