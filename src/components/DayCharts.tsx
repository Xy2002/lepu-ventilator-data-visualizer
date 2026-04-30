import { useEffect, useMemo, useState } from 'react';
import { WaveformChart } from '../charts/WaveformChart';
import type { DayDetail } from '../types';

const CHART_SWITCH_DELAY_MS = 200;

interface DayChartsProps {
  detail: DayDetail;
  focusedEventSecond: number | null;
  focusedEventTimestamp?: string | null;
}

export function DayCharts({ detail, focusedEventSecond, focusedEventTimestamp = null }: DayChartsProps) {
  const [selectedSignalFileName, setSelectedSignalFileName] = useState<string | null>(null);
  const [renderedSignalFileName, setRenderedSignalFileName] = useState<string | null>(null);
  const eventSeconds = useMemo(
    () =>
      detail.events
        .map((event) => event.secondsFromDayStart)
        .filter((value): value is number => typeof value === 'number'),
    [detail.events],
  );
  const eventTimestamps = useMemo(
    () =>
      detail.events
        .map((event) => event.timestamp)
        .filter((value): value is string => typeof value === 'string'),
    [detail.events],
  );
  const defaultSignal = detail.signals[0] ?? null;
  const selectedSignal =
    detail.signals.find((signal) => signal.fileName === selectedSignalFileName) ?? defaultSignal;
  const renderedSignal =
    detail.signals.find((signal) => signal.fileName === renderedSignalFileName) ?? defaultSignal;
  const selectedSignalIndex = selectedSignal
    ? detail.signals.findIndex((signal) => signal.fileName === selectedSignal.fileName)
    : -1;
  const isSwitchingCharts =
    selectedSignal !== null && renderedSignal !== null && selectedSignal.fileName !== renderedSignal.fileName;

  useEffect(() => {
    if (!selectedSignal || !renderedSignal || selectedSignal.fileName === renderedSignal.fileName) return;

    const timer = window.setTimeout(() => {
      setRenderedSignalFileName(selectedSignal.fileName);
    }, CHART_SWITCH_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [renderedSignal?.fileName, selectedSignal?.fileName]);

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
                onClick={() => setSelectedSignalFileName(signal.fileName)}
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
          aria-labelledby={selectedSignalIndex >= 0 ? `chart-tab-${selectedSignalIndex}` : undefined}
          aria-busy={isSwitchingCharts}
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
            focusedSecond={focusedEventSecond}
            focusedTimestamp={focusedEventTimestamp}
          />
          {isSwitchingCharts && selectedSignal ? (
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
    </section>
  );
}
