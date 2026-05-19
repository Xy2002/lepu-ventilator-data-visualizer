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

export function DayCharts({ detail }: DayChartsProps) {
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [renderedFileName, setRenderedFileName] = useState<string | null>(null);

  const defaultSignal = detail.signals[0] ?? null;
  const selectedSignal =
    detail.signals.find((s) => s.fileName === selectedFileName) ?? defaultSignal;
  const renderedSignal =
    detail.signals.find((s) => s.fileName === renderedFileName) ?? defaultSignal;
  const selectedIndex = selectedSignal
    ? detail.signals.findIndex((s) => s.fileName === selectedSignal.fileName)
    : -1;
  const isSwitching =
    selectedSignal && renderedSignal && selectedSignal.fileName !== renderedSignal.fileName;

  useEffect(() => {
    if (!selectedSignal || !renderedSignal || selectedSignal.fileName === renderedSignal.fileName) return;
    const timer = window.setTimeout(() => {
      setRenderedFileName(selectedSignal.fileName);
    }, CHART_SWITCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [renderedSignal?.fileName, selectedSignal?.fileName]);

  const activeLabel = selectedSignal?.header.label ?? null;

  const activeEvents = useMemo(
    () =>
      activeLabel
        ? detail.events.filter((e) => EVENT_SIGNAL_MAP[e.sourceLabel] === activeLabel)
        : [],
    [detail.events, activeLabel],
  );

  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  // Reset focus when switching charts
  useEffect(() => {
    setFocusedIndex(null);
  }, [activeLabel]);

  const eventSeconds = useMemo(
    () => activeEvents.map((e) => e.secondsFromDayStart).filter((v): v is number => typeof v === 'number'),
    [activeEvents],
  );
  const eventTimestamps = useMemo(
    () => activeEvents.map((e) => e.timestamp).filter((v): v is string => typeof v === 'string'),
    [activeEvents],
  );

  const focusedEvent = focusedIndex !== null ? activeEvents[focusedIndex] : null;

  const isAscp = activeLabel === 'pressure';

  return (
    <section className="day-charts">
      {detail.signals.length === 0 ? <p>当前日期没有可显示的波形文件。</p> : null}
      {detail.signals.length > 0 ? (
        <div className="chart-tabs" role="tablist" aria-label="波形图表">
          {detail.signals.map((signal, index) => {
            const selected = signal.fileName === selectedSignal?.fileName;
            return (
              <button
                key={signal.fileName}
                id={`chart-tab-${index}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={selected ? 'active-waveform-panel' : undefined}
                tabIndex={selected ? 0 : -1}
                onClick={() => setSelectedFileName(signal.fileName)}
              >
                {signal.header.label}
              </button>
            );
          })}
        </div>
      ) : null}
      {renderedSignal ? (
        <div
          id="active-waveform-panel"
          className="chart-panel-stage"
          role="tabpanel"
          aria-labelledby={selectedIndex >= 0 ? `chart-tab-${selectedIndex}` : undefined}
          aria-busy={isSwitching}
        >
          <WaveformChart
            key={renderedSignal.fileName}
            label={renderedSignal.header.label}
            values={renderedSignal.values}
            sampleRateHz={renderedSignal.header.sampleRateHz}
            startTime={renderedSignal.header.startTime}
            useSessions={detail.useSessions}
            eventTimestamps={eventTimestamps}
            eventSeconds={eventSeconds}
            focusedSecond={focusedEvent?.secondsFromDayStart ?? null}
            focusedTimestamp={focusedEvent?.timestamp ?? null}
          />
          {isSwitching && selectedSignal ? (
            <div
              className="chart-loading"
              role="progressbar"
              aria-label={`正在加载 ${selectedSignal.header.label} 图表`}
            >
              <div className="chart-loading-card">
                <div className="chart-loading-track" />
                <span>正在加载 {selectedSignal.header.label} 图表...</span>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {activeEvents.length > 0 ? (
        <div className="chart-events">
          <div className="chart-events-header">
            <h4>
              {isAscp ? 'ASCP 压力记录' : 'AI/HI 事件'}
              <span className="chart-events-count">{activeEvents.length}</span>
            </h4>
          </div>
          <div className="chart-events-scroll">
            <table>
              <thead>
                <tr>
                  <th>类型</th>
                  <th>时间</th>
                  {isAscp ? <th>IPAP</th> : null}
                  {isAscp ? <th>EPAP</th> : null}
                  {!isAscp ? <th>持续</th> : null}
                </tr>
              </thead>
              <tbody>
                {activeEvents.map((event, i) => (
                  <tr
                    key={`${event.sourceLabel}-${event.timestamp}-${i}`}
                    className={`chart-event-row${focusedIndex === i ? ' chart-event-active' : ''}`}
                    onClick={() => {
                      if (typeof event.secondsFromDayStart === 'number') {
                        setFocusedIndex(i === focusedIndex ? null : i);
                      }
                    }}
                  >
                    <td>
                      <span className={`event-badge event-badge--${event.sourceLabel}`}>
                        {event.sourceLabel.toUpperCase()}
                      </span>
                    </td>
                    <td className="event-time">{event.timestamp ?? '-'}</td>
                    {isAscp ? (
                      <>
                        <td className="event-value">
                          {(event.value1 / 10).toFixed(1)} <span className="event-unit">cmH2O</span>
                        </td>
                        <td className="event-value">
                          {(event.value2 / 10).toFixed(1)} <span className="event-unit">cmH2O</span>
                        </td>
                      </>
                    ) : (
                      <td className="event-value">{event.value2}秒</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
