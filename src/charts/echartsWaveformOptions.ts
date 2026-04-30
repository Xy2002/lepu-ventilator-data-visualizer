import type { EChartsOption } from 'echarts';
import type { UseSession } from '../types';
import type { WaveformValues } from './waveformData';

export type EChartsWaveformPoint = [secondsOrIndex: number, value: number | null];

interface BuildEChartsWaveformOptionParams {
  label: string;
  values: WaveformValues;
  sampleRateHz: number | null;
  startTime?: string | null;
  useSessions?: UseSession[];
  eventTimestamps?: string[];
  eventSeconds?: number[];
  pixelWidth?: number;
}

const timestampPattern = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/;

export function parseEdfTimestampMs(timestamp: string | null | undefined) {
  if (!timestamp) return null;

  const match = timestamp.match(timestampPattern);
  if (!match) return null;

  const [, year, month, day, hour, minute, second, fraction = '0'] = match;
  const millisecond = Number(fraction.padEnd(3, '0').slice(0, 3));
  const value = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    millisecond,
  );

  return Number.isNaN(value) ? null : value;
}

function pad(value: number, length = 2) {
  return value.toString().padStart(length, '0');
}

function formatEdfClockTime(value: number): string {
  const date = new Date(value);
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

function formatAxisSecond(value: number): string {
  if (value >= 60) return `${(value / 60).toFixed(1)}m`;
  return `${value.toFixed(value >= 10 ? 0 : 1)}s`;
}

function buildTimestampMarkLineData(
  eventTimestamps: string[],
  chartStartMs: number,
  chartEndMs: number,
  pixelWidth: number,
  minPixelGap = 8,
): Array<{ xAxis: number }> {
  if (pixelWidth <= 0 || chartEndMs <= chartStartMs) return [];

  const visibleMs = chartEndMs - chartStartMs;
  let previousPixel = Number.NEGATIVE_INFINITY;
  const markers: Array<{ xAxis: number }> = [];

  const eventTimestampMs = eventTimestamps
    .map(parseEdfTimestampMs)
    .filter((value): value is number => value !== null);

  for (const timestampMs of eventTimestampMs) {
    if (timestampMs < chartStartMs || timestampMs > chartStartMs + visibleMs) continue;

    const pixel = ((timestampMs - chartStartMs) / Math.max(visibleMs, Number.EPSILON)) * pixelWidth;
    if (pixel - previousPixel < minPixelGap) continue;

    markers.push({ xAxis: timestampMs });
    previousPixel = pixel;
  }

  return markers;
}

function buildEventMarkLineData(
  eventSeconds: number[],
  sampleRateHz: number | null,
  valuesLength: number,
  pixelWidth: number,
  minPixelGap = 8,
): Array<{ xAxis: number }> {
  if (!sampleRateHz || pixelWidth <= 0) return [];

  const visibleSeconds = valuesLength / sampleRateHz;
  let previousPixel = Number.NEGATIVE_INFINITY;
  const markers: Array<{ xAxis: number }> = [];

  for (const second of [...eventSeconds].sort((a, b) => a - b)) {
    if (second < 0 || second > visibleSeconds) continue;

    const pixel = (second / Math.max(visibleSeconds, Number.EPSILON)) * pixelWidth;
    if (pixel - previousPixel < minPixelGap) continue;

    markers.push({ xAxis: second });
    previousPixel = pixel;
  }

  return markers;
}

export function buildEChartsWaveformSeries(
  values: WaveformValues,
  sampleRateHz: number | null,
  startTime?: string | null,
  useSessions: UseSession[] = [],
): EChartsWaveformPoint[] {
  if (sampleRateHz && sampleRateHz > 0 && useSessions.length > 0) {
    const points: EChartsWaveformPoint[] = [];
    let valueIndex = 0;

    for (let sessionIndex = 0; sessionIndex < useSessions.length && valueIndex < values.length; sessionIndex += 1) {
      const session = useSessions[sessionIndex];
      const sessionStartMs = parseEdfTimestampMs(session.startTime);
      const sessionEndMs = parseEdfTimestampMs(session.endTime);
      if (sessionStartMs === null || sessionEndMs === null) continue;

      const remaining = values.length - valueIndex;
      const expectedCount = Math.floor(session.durationSeconds * sampleRateHz);
      const count = Math.min(remaining, sessionIndex === useSessions.length - 1 ? remaining : expectedCount);

      for (let offset = 0; offset < count; offset += 1) {
        points.push([sessionStartMs + (offset / sampleRateHz) * 1000, values[valueIndex]]);
        valueIndex += 1;
      }

      if (sessionIndex < useSessions.length - 1 && valueIndex < values.length) {
        points.push([sessionEndMs, null]);
      }
    }

    return points;
  }

  const startMs = parseEdfTimestampMs(startTime);
  if (startMs !== null && sampleRateHz && sampleRateHz > 0) {
    return Array.from(values, (value, index) => [startMs + (index / sampleRateHz) * 1000, value]);
  }

  return Array.from(values, (value, index) => [sampleRateHz ? index / sampleRateHz : index, value]);
}

export function buildEChartsWaveformOption({
  label,
  values,
  sampleRateHz,
  startTime = null,
  useSessions = [],
  eventTimestamps = [],
  eventSeconds = [],
  pixelWidth = 1200,
}: BuildEChartsWaveformOptionParams): EChartsOption {
  const startMs = parseEdfTimestampMs(startTime);
  const firstSessionStartMs = parseEdfTimestampMs(useSessions[0]?.startTime);
  const lastSessionEndMs = parseEdfTimestampMs(useSessions[useSessions.length - 1]?.endTime);
  const usesSessionTime = firstSessionStartMs !== null && lastSessionEndMs !== null && Boolean(sampleRateHz && sampleRateHz > 0);
  const usesHeaderTime = startMs !== null && Boolean(sampleRateHz && sampleRateHz > 0);
  const usesRealTime = usesSessionTime || usesHeaderTime;
  const chartStartMs = usesSessionTime ? firstSessionStartMs : startMs;
  const chartEndMs =
    usesSessionTime && lastSessionEndMs !== null
      ? lastSessionEndMs
      : chartStartMs !== null && sampleRateHz
        ? chartStartMs + (values.length / sampleRateHz) * 1000
        : null;
  const markLineData =
    usesRealTime && chartStartMs !== null && chartEndMs !== null
      ? buildTimestampMarkLineData(eventTimestamps, chartStartMs, chartEndMs, pixelWidth)
      : buildEventMarkLineData(eventSeconds, sampleRateHz, values.length, pixelWidth);
  const data = buildEChartsWaveformSeries(values, sampleRateHz, startTime, useSessions);
  const xAxisName = usesRealTime ? 'real time' : sampleRateHz ? 'seconds' : 'sample index';

  const series: Record<string, unknown> = {
    name: label,
    type: 'line',
    data,
    symbol: 'none',
    showSymbol: false,
    sampling: 'lttb',
    animation: false,
    progressive: 8000,
    progressiveThreshold: 20000,
    lineStyle: {
      width: 1.2,
      color: '#0a72ef',
    },
    emphasis: {
      disabled: true,
    },
  };

  if (markLineData.length > 0) {
    series.markLine = {
      silent: true,
      symbol: 'none',
      lineStyle: {
        color: '#d92d20',
        opacity: 0.34,
        width: 1,
      },
      label: {
        show: false,
      },
      data: markLineData,
    };
  }

  return {
    animation: false,
    backgroundColor: 'transparent',
    useUTC: usesRealTime ? true : undefined,
    grid: {
      top: 16,
      right: 18,
      bottom: 42,
      left: 42,
      containLabel: false,
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      confine: true,
      renderMode: 'html',
      valueFormatter: (value) => (typeof value === 'number' ? value.toFixed(2) : String(value)),
    },
    toolbox: {
      show: true,
      right: 8,
      top: 0,
      itemSize: 14,
      feature: {
        dataZoom: { yAxisIndex: 'none' },
        restore: {},
        saveAsImage: { pixelRatio: 2 },
      },
    },
    xAxis: {
      type: usesRealTime ? 'time' : 'value',
      name: xAxisName,
      min: 'dataMin',
      max: 'dataMax',
      axisLabel: {
        formatter: usesRealTime ? formatEdfClockTime : sampleRateHz ? formatAxisSecond : undefined,
      },
      axisLine: { lineStyle: { color: '#c9c9c9' } },
      splitLine: { lineStyle: { color: 'rgba(0, 0, 0, 0.06)' } },
    },
    yAxis: {
      type: 'value',
      scale: true,
      min: 'dataMin',
      max: 'dataMax',
      axisLine: { lineStyle: { color: '#c9c9c9' } },
      splitLine: { lineStyle: { color: 'rgba(0, 0, 0, 0.08)', type: 'dashed' } },
    },
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: 0,
        filterMode: 'none',
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        moveOnMouseWheel: false,
        preventDefaultMouseMove: true,
      },
      {
        type: 'slider',
        xAxisIndex: 0,
        filterMode: 'none',
        height: 20,
        bottom: 10,
        brushSelect: true,
      },
    ],
    series: [series],
  } satisfies EChartsOption;
}
