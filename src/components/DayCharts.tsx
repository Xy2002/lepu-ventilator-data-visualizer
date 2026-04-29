import { WaveformCanvas } from '../charts/WaveformCanvas';
import type { DayDetail } from '../types';

interface DayChartsProps {
  detail: DayDetail;
  focusedEventSecond: number | null;
}

export function DayCharts({ detail, focusedEventSecond }: DayChartsProps) {
  const eventSeconds = detail.events
    .map((event) => event.secondsFromDayStart)
    .filter((value): value is number => typeof value === 'number');

  return (
    <section className="day-charts">
      {detail.signals.length === 0 ? <p>当前日期没有可显示的波形文件。</p> : null}
      {detail.signals.map((signal) => (
        <WaveformCanvas
          key={signal.fileName}
          label={signal.header.label}
          values={signal.values}
          sampleRateHz={signal.header.sampleRateHz}
          eventSeconds={eventSeconds}
          focusedSecond={focusedEventSecond}
        />
      ))}
    </section>
  );
}
