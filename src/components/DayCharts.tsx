import { useEffect, useMemo, useState } from 'react';
import { WaveformChart } from '../charts/WaveformChart';
import type { DayDetail, EventRecord, ParsedVentilatorFile, UseSession } from '../types';

const CHART_SWITCH_DELAY_MS = 200;

const EVENT_SIGNAL_MAP: Record<string, string> = {
  ai: 'flow',
  hi: 'flow',
  ascp: 'pressure',
};

interface DayChartsProps {
  detail: DayDetail;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}分${s}秒` : `${m}分`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

function eventsForSignal(events: EventRecord[], signalLabel: string): EventRecord[] {
  return events.filter((e) => EVENT_SIGNAL_MAP[e.sourceLabel] === signalLabel);
}

interface ChartPanelProps {
  signal: ParsedVentilatorFile;
  events: EventRecord[];
  useSessions: UseSession[];
  eventColumns: 'apnea' | 'ascp';
  eventTitle: string;
}

function ChartPanel({ signal, events, useSessions, eventColumns, eventTitle }: ChartPanelProps) {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  const eventSeconds = useMemo(
    () => events.map((e) => e.secondsFromDayStart).filter((v): v is number => typeof v === 'number'),
    [events],
  );
  const eventTimestamps = useMemo(
    () => events.map((e) => e.timestamp).filter((v): v is string => typeof v === 'string'),
    [events],
  );

  const focusedEvent = focusedIndex !== null ? events[focusedIndex] : null;

  return (
    <div className="chart-panel">
      <WaveformChart
        key={signal.fileName}
        label={signal.header.label}
        values={signal.values}
        sampleRateHz={signal.header.sampleRateHz}
        startTime={signal.header.startTime}
        useSessions={useSessions}
        eventTimestamps={eventTimestamps}
        eventSeconds={eventSeconds}
        focusedSecond={focusedEvent?.secondsFromDayStart ?? null}
        focusedTimestamp={focusedEvent?.timestamp ?? null}
      />
      {events.length > 0 ? (
        <div className="chart-events">
          <h4>
            {eventTitle} <span className="chart-events-count">{events.length}</span>
          </h4>
          <div className="chart-events-scroll">
            <table>
              <thead>
                <tr>
                  <th>类型</th>
                  <th>时间</th>
                  {eventColumns === 'ascp' ? <th>IPAP</th> : null}
                  {eventColumns === 'ascp' ? <th>EPAP</th> : null}
                  {eventColumns === 'apnea' ? <th>持续</th> : null}
                  <th />
                </tr>
              </thead>
              <tbody>
                {events.map((event, i) => (
                  <tr key={`${event.sourceLabel}-${event.timestamp}-${i}`} className={focusedIndex === i ? 'chart-event-active' : ''}>
                    <td>
                      <span className={`event-badge event-badge--${event.sourceLabel}`}>
                        {event.sourceLabel.toUpperCase()}
                      </span>
                    </td>
                    <td className="event-time">{event.timestamp ?? '-'}</td>
                    {eventColumns === 'ascp' ? (
                      <>
                        <td className="event-value">
                          {(event.value1 / 10).toFixed(1)} <span className="event-unit">cmH2O</span>
                        </td>
                        <td className="event-value">
                          {(event.value2 / 10).toFixed(1)} <span className="event-unit">cmH2O</span>
                        </td>
                      </>
                    ) : null}
                    {eventColumns === 'apnea' ? (
                      <td className="event-value">{event.value2}秒</td>
                    ) : null}
                    <td>
                      <button
                        type="button"
                        className="event-locate-btn"
                        onClick={() => setFocusedIndex(i === focusedIndex ? null : i)}
                      >
                        定位
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function DayCharts({ detail }: DayChartsProps) {
  const flowSignal = detail.signals.find((s) => s.header.label === 'flow') ?? null;
  const pressureSignal = detail.signals.find((s) => s.header.label === 'pressure') ?? null;
  const primaryLabels = new Set(['flow', 'pressure']);
  const secondarySignals = detail.signals.filter((s) => !primaryLabels.has(s.header.label));

  const flowEvents = eventsForSignal(detail.events, 'flow');
  const pressureEvents = eventsForSignal(detail.events, 'pressure');

  // Secondary signal tab state
  const [selectedSecondary, setSelectedSecondary] = useState<string | null>(null);
  const [renderedSecondary, setRenderedSecondary] = useState<string | null>(null);
  const defaultSecondary = secondarySignals[0] ?? null;
  const selectedSecondarySignal =
    secondarySignals.find((s) => s.fileName === selectedSecondary) ?? defaultSecondary;
  const renderedSecondarySignal =
    secondarySignals.find((s) => s.fileName === renderedSecondary) ?? defaultSecondary;
  const isSwitching =
    selectedSecondarySignal &&
    renderedSecondarySignal &&
    selectedSecondarySignal.fileName !== renderedSecondarySignal.fileName;

  useEffect(() => {
    if (!selectedSecondarySignal || !renderedSecondarySignal || selectedSecondarySignal.fileName === renderedSecondarySignal.fileName) return;
    const timer = window.setTimeout(() => {
      setRenderedSecondary(selectedSecondarySignal.fileName);
    }, CHART_SWITCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [renderedSecondarySignal?.fileName, selectedSecondarySignal?.fileName]);

  const hasPrimary = flowSignal || pressureSignal;
  const hasNoSignals = detail.signals.length === 0;

  return (
    <section className="day-charts">
      {hasNoSignals ? <p>当前日期没有可显示的波形文件。</p> : null}

      {flowSignal ? (
        <ChartPanel
          signal={flowSignal}
          events={flowEvents}
          useSessions={detail.useSessions}
          eventColumns="apnea"
          eventTitle="AI/HI 事件"
        />
      ) : null}

      {pressureSignal ? (
        <ChartPanel
          signal={pressureSignal}
          events={pressureEvents}
          useSessions={detail.useSessions}
          eventColumns="ascp"
          eventTitle="ASCP 压力记录"
        />
      ) : null}

      {secondarySignals.length > 0 ? (
        <div className="chart-secondary">
          <div className="chart-tabs" role="tablist" aria-label="其他波形">
            {secondarySignals.map((signal, index) => {
              const selected = signal.fileName === selectedSecondarySignal?.fileName;
              return (
                <button
                  key={signal.fileName}
                  id={`chart-tab-sec-${index}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setSelectedSecondary(signal.fileName)}
                >
                  {signal.header.label}
                </button>
              );
            })}
          </div>
          {renderedSecondarySignal ? (
            <div className="chart-panel-stage" role="tabpanel" aria-busy={isSwitching}>
              <WaveformChart
                key={renderedSecondarySignal.fileName}
                label={renderedSecondarySignal.header.label}
                values={renderedSecondarySignal.values}
                sampleRateHz={renderedSecondarySignal.header.sampleRateHz}
                startTime={renderedSecondarySignal.header.startTime}
                useSessions={detail.useSessions}
              />
              {isSwitching && selectedSecondarySignal ? (
                <div className="chart-loading" role="progressbar" aria-label={`正在加载 ${selectedSecondarySignal.header.label} 图表`}>
                  <div className="chart-loading-card">
                    <div className="chart-loading-track" />
                    <span>正在加载 {selectedSecondarySignal.header.label} 图表...</span>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
