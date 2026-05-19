import { useState } from 'react';
import { Button, ChipRoot, ChipLabel, SurfaceRoot, TabsRoot, TabListContainer, TabList, Tab } from '@heroui/react';
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
  return (
    <ChipRoot variant="soft" size="sm" className={`event-badge--${meta.color}`}>
      <ChipLabel>{sourceLabel.toUpperCase()}</ChipLabel>
    </ChipRoot>
  );
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
    <SurfaceRoot variant="secondary" className="p-4">
      <h3 className="m-0 text-lg font-semibold text-foreground">事件</h3>
      {events.length === 0 ? <p className="text-sm text-muted">当前日期没有事件记录。</p> : null}
      {categories.length > 0 ? (
        <TabsRoot
          selectedKey={activeFilter}
          onSelectionChange={(key) => setActiveFilter(key as EventCategory)}
          className="mt-3"
        >
          <TabListContainer>
            <TabList>
              <Tab id="all">全部 {events.length}</Tab>
              {categories.map((cat) => (
                <Tab key={cat} id={cat}>{cat.toUpperCase()} {counts[cat]}</Tab>
              ))}
            </TabList>
          </TabListContainer>
        </TabsRoot>
      ) : null}
      <div className="mt-3 overflow-auto max-h-[400px]">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="p-2 text-left text-foreground font-medium border-b border-border">类型</th>
              <th className="p-2 text-left text-foreground font-medium border-b border-border">时间</th>
              {activeFilter === 'ascp' ? <th className="p-2 text-left text-foreground font-medium border-b border-border">IPAP</th> : null}
              {activeFilter === 'ascp' ? <th className="p-2 text-left text-foreground font-medium border-b border-border">EPAP</th> : null}
              {(activeFilter === 'ai' || activeFilter === 'hi') ? <th className="p-2 text-left text-foreground font-medium border-b border-border">持续</th> : null}
              {activeFilter === 'usetime' ? <th className="p-2 text-left text-foreground font-medium border-b border-border">时长</th> : null}
              {isFiltered ? null : <th className="p-2 text-left text-foreground font-medium border-b border-border">详情</th>}
              <th className="p-2 border-b border-border" />
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
                  <tr key={`${event.sourceLabel}-${event.timestamp}-${index}`} className="hover:bg-surface-secondary">
                    <td className="p-2 border-b border-border"><TypeBadge sourceLabel={event.sourceLabel} /></td>
                    <td className="p-2 font-mono text-xs border-b border-border">{event.timestamp ?? '-'}</td>
                    <td className="p-2 font-mono text-xs border-b border-border">{(event.value1 / 10).toFixed(1)} <span className="text-muted text-[11px]">cmH2O</span></td>
                    <td className="p-2 font-mono text-xs border-b border-border">{(event.value2 / 10).toFixed(1)} <span className="text-muted text-[11px]">cmH2O</span></td>
                    <td className="p-2 border-b border-border"><Button size="sm" variant="ghost" onPress={handleSelect}>定位</Button></td>
                  </tr>
                );
              }

              if (activeFilter === 'ai' || activeFilter === 'hi') {
                return (
                  <tr key={`${event.sourceLabel}-${event.timestamp}-${index}`} className="hover:bg-surface-secondary">
                    <td className="p-2 border-b border-border"><TypeBadge sourceLabel={event.sourceLabel} /></td>
                    <td className="p-2 font-mono text-xs border-b border-border">{event.timestamp ?? '-'}</td>
                    <td className="p-2 font-mono text-xs border-b border-border">{event.value2}秒</td>
                    <td className="p-2 border-b border-border"><Button size="sm" variant="ghost" onPress={handleSelect}>定位</Button></td>
                  </tr>
                );
              }

              if (activeFilter === 'usetime') {
                return (
                  <tr key={`${event.sourceLabel}-${event.timestamp}-${index}`} className="hover:bg-surface-secondary">
                    <td className="p-2 border-b border-border"><TypeBadge sourceLabel={event.sourceLabel} /></td>
                    <td className="p-2 font-mono text-xs border-b border-border">{event.timestamp ?? '-'}</td>
                    <td className="p-2 font-mono text-xs border-b border-border">{formatDuration(event.value1)}</td>
                    <td className="p-2 border-b border-border"><Button size="sm" variant="ghost" onPress={handleSelect}>定位</Button></td>
                  </tr>
                );
              }

              return (
                <tr key={`${event.sourceLabel}-${event.timestamp}-${index}`} className="hover:bg-surface-secondary">
                  <td className="p-2 border-b border-border"><TypeBadge sourceLabel={event.sourceLabel} /></td>
                  <td className="p-2 font-mono text-xs border-b border-border">{event.timestamp ?? '-'}</td>
                  <td className="p-2 font-mono text-xs border-b border-border">{eventDetail(event)}</td>
                  <td className="p-2 border-b border-border"><Button size="sm" variant="ghost" onPress={handleSelect}>定位</Button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SurfaceRoot>
  );
}
