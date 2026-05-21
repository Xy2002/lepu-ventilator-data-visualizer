import { LineChart as EChartsLineChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  MarkLineComponent,
  ToolboxComponent,
  TooltipComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import type { ECharts } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useEffect, useMemo, useRef } from 'react';
import type { UseSession } from '../types';
import { buildEChartsWaveformOption, EVENT_STYLES, parseEdfTimestampMs } from './echartsWaveformOptions';
import type { EventMarkerInfo } from './echartsWaveformOptions';
import type { WaveformValues } from './waveformData';

echarts.use([
  CanvasRenderer,
  DataZoomComponent,
  EChartsLineChart,
  GridComponent,
  MarkLineComponent,
  ToolboxComponent,
  TooltipComponent,
]);

interface WaveformChartProps {
  label: string;
  values: WaveformValues;
  sampleRateHz: number | null;
  startTime?: string | null;
  useSessions?: UseSession[];
  eventMarkers?: EventMarkerInfo[];
  focusedSecond?: number | null;
  focusedTimestamp?: string | null;
}

export function WaveformChart({
  label,
  values,
  sampleRateHz,
  startTime = null,
  useSessions = [],
  eventMarkers = [],
  focusedSecond = null,
  focusedTimestamp = null,
}: WaveformChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ECharts | null>(null);

  const option = useMemo(
    () =>
      buildEChartsWaveformOption({
        label,
        values,
        sampleRateHz,
        startTime,
        useSessions,
        eventMarkers,
        pixelWidth: Math.max(320, containerRef.current?.getBoundingClientRect().width ?? 1200),
      }),
    [eventMarkers, label, sampleRateHz, startTime, useSessions, values],
  );

  const uniqueEventTypes = useMemo(
    () => [...new Set(eventMarkers.map((m) => m.sourceLabel))],
    [eventMarkers],
  );

  function resetZoom() {
    chartRef.current?.dispatchAction({ type: 'restore' });
  }

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const chart = echarts.init(element, null, { renderer: 'canvas' });
    chartRef.current = chart;

    const preventPageWheel = (event: WheelEvent) => {
      event.preventDefault();
    };
    element.addEventListener('wheel', preventPageWheel, { passive: false });

    return () => {
      element.removeEventListener('wheel', preventPageWheel);
      chart.dispose();
      if (chartRef.current === chart) chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, true);
  }, [option]);

  useEffect(() => {
    const element = containerRef.current;
    const chart = chartRef.current;
    if (!element || !chart) return;

    const resize = () => chart.resize();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(element);

    return () => observer?.disconnect();
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const canFocusTimestamp =
      parseEdfTimestampMs(focusedTimestamp) !== null && parseEdfTimestampMs(startTime) !== null;
    if (!chart || canFocusTimestamp || focusedSecond === null || !sampleRateHz || values.length === 0) return;

    const halfSpan = Math.max(10, Math.min(values.length / sampleRateHz, 20) / 2);
    chart.dispatchAction({
      type: 'dataZoom',
      dataZoomIndex: 0,
      startValue: Math.max(0, focusedSecond - halfSpan),
      endValue: Math.min(values.length / sampleRateHz, focusedSecond + halfSpan),
    });
  }, [focusedSecond, focusedTimestamp, sampleRateHz, startTime, values.length]);

  useEffect(() => {
    const chart = chartRef.current;
    const focusedMs = parseEdfTimestampMs(focusedTimestamp);
    const firstSessionStartMs = parseEdfTimestampMs(useSessions[0]?.startTime);
    const lastSessionEndMs = parseEdfTimestampMs(useSessions[useSessions.length - 1]?.endTime);
    const startMs = firstSessionStartMs ?? parseEdfTimestampMs(startTime);
    if (!chart || focusedMs === null || startMs === null || !sampleRateHz || values.length === 0) return;

    const totalSpanMs =
      lastSessionEndMs !== null && lastSessionEndMs > startMs
        ? lastSessionEndMs - startMs
        : (values.length / sampleRateHz) * 1000;
    const halfSpanMs = Math.max(10_000, Math.min(totalSpanMs, 20_000) / 2);
    chart.dispatchAction({
      type: 'dataZoom',
      dataZoomIndex: 0,
      startValue: Math.max(startMs, focusedMs - halfSpanMs),
      endValue: Math.min(startMs + totalSpanMs, focusedMs + halfSpanMs),
    });
  }, [focusedTimestamp, sampleRateHz, startTime, useSessions, values.length]);

  return (
    <section className="waveform-panel">
      <div className="chart-header">
        <div>
          <h3>{label}</h3>
          <span>
            {values.length} 采样 · {sampleRateHz ?? '-'} Hz
            {useSessions.length > 0 ? ` · ${useSessions.length} 次会话` : startTime ? ` · ${startTime}` : ''}
          </span>
        </div>
        <button type="button" onClick={resetZoom}>
          重置缩放
        </button>
      </div>
      {uniqueEventTypes.length > 0 ? (
        <div className="chart-legend">
          {uniqueEventTypes.map((type) => {
            const style = EVENT_STYLES[type];
            return (
              <span key={type} className="chart-legend-item">
                <span className="chart-legend-line" style={{ backgroundColor: style?.color ?? '#d92d20' }} />
                <span className="chart-legend-text">{style?.label ?? type.toUpperCase()}</span>
              </span>
            );
          })}
        </div>
      ) : null}
      <div
        ref={containerRef}
        className="waveform-chart"
        role="img"
        aria-label={`${label} ECharts waveform chart`}
      />
      <div className="chart-readout">
        <span>滚轮缩放 · 拖动平移</span>
        {focusedTimestamp ? (
          <span>焦点：{focusedTimestamp}</span>
        ) : focusedSecond === null ? null : (
          <span>焦点：{focusedSecond.toFixed(2)}s</span>
        )}
      </div>
    </section>
  );
}
