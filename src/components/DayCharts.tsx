import { useMemo } from 'react';
import { WaveformChart } from '../charts/WaveformChart';
import type { DayDetail } from '../types';

interface DayChartsProps {
  detail: DayDetail;
  focusedEventSecond: number | null;
  focusedEventTimestamp?: string | null;
}

export function DayCharts({ detail, focusedEventSecond, focusedEventTimestamp = null }: DayChartsProps) {
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

  return (
    <section className="day-charts">
      {detail.signals.length === 0 ? <p>当前日期没有可显示的波形文件。</p> : null}
      {detail.signals.map((signal) => (
        <WaveformChart
          key={signal.fileName}
          label={signal.header.label}
          values={signal.values}
          sampleRateHz={signal.header.sampleRateHz}
          startTime={signal.header.startTime}
          useSessions={detail.useSessions}
          eventTimestamps={eventTimestamps}
          eventSeconds={eventSeconds}
          focusedSecond={focusedEventSecond}
          focusedTimestamp={focusedEventTimestamp}
        />
      ))}
    </section>
  );
}
