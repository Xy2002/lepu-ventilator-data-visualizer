import { parseEdfTimestampMs } from "../parser/edfTimestamp";
import type { EChartsOption } from "echarts";
import type { UseSession } from "../types";
import type { WaveformValues } from "./waveformData";

export type EChartsWaveformPoint = [
  secondsOrIndex: number,
  value: number | null,
];

export interface EventMarkerInfo {
  timestamp?: string;
  secondsFromDayStart?: number;
  sourceLabel: string;
}

export const EVENT_STYLES: Record<string, { color: string; label: string }> = {
  ai: { color: "#d92d20", label: "AI 呼吸暂停" },
  hi: { color: "#f59e0b", label: "HI 低通气" },
  csa: { color: "#0d9488", label: "CSA 中枢性暂停" },
  ascp: { color: "#6366f1", label: "ASCP 压力调整" },
};

/** 波形的时间上下文:{sampleRateHz, startTime, useSessions} 三个参数总是同行出现 */
export interface WaveformTimeContext {
  sampleRateHz: number | null;
  startTime?: string | null;
  useSessions?: UseSession[];
}

interface BuildEChartsWaveformOptionParams extends WaveformTimeContext {
  label: string;
  values: WaveformValues;
  eventMarkers?: EventMarkerInfo[];
  pixelWidth?: number;
  /** 压力/实际压力叠加的第二条序列(与主序列共享时间轴与降采样上下文) */
  overlay?: { label: string; values: WaveformValues } | null;
}

function pad(value: number, length = 2) {
  return value.toString().padStart(length, "0");
}

function formatEdfClockTime(value: number): string {
  const date = new Date(value);
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

function formatAxisSecond(value: number): string {
  if (value >= 60) return `${(value / 60).toFixed(1)}m`;
  return `${value.toFixed(value >= 10 ? 0 : 1)}s`;
}

interface MarkLineItem {
  xAxis: number;
  name: string;
  lineStyle: { color: string };
}

const FALLBACK_EVENT_STYLE = {
  color: "#d92d20",
};

function eventStyleFor(sourceLabel: string) {
  return (
    EVENT_STYLES[sourceLabel] ?? {
      ...FALLBACK_EVENT_STYLE,
      label: sourceLabel.toUpperCase(),
    }
  );
}

function buildTimestampMarkLineData(
  eventMarkers: EventMarkerInfo[],
  chartStartMs: number,
  chartEndMs: number,
  pixelWidth: number
): MarkLineItem[] {
  if (pixelWidth <= 0 || chartEndMs <= chartStartMs) return [];

  const visibleMs = chartEndMs - chartStartMs;
  const markers: MarkLineItem[] = [];

  const sorted = [...eventMarkers]
    .map((m) => ({ ...m, ms: parseEdfTimestampMs(m.timestamp) }))
    .filter((m): m is EventMarkerInfo & { ms: number } => m.ms !== null)
    .sort((a, b) => a.ms - b.ms);

  for (const marker of sorted) {
    if (marker.ms < chartStartMs || marker.ms > chartStartMs + visibleMs)
      continue;

    const style = eventStyleFor(marker.sourceLabel);
    markers.push({
      xAxis: marker.ms,
      name: style.label,
      lineStyle: { color: style.color },
    });
  }

  return markers;
}

function buildEventMarkLineData(
  eventMarkers: EventMarkerInfo[],
  sampleRateHz: number | null,
  valuesLength: number,
  pixelWidth: number
): MarkLineItem[] {
  if (!sampleRateHz || pixelWidth <= 0) return [];

  const visibleSeconds = valuesLength / sampleRateHz;
  const markers: MarkLineItem[] = [];

  const sorted = [...eventMarkers]
    .filter((m) => typeof m.secondsFromDayStart === "number")
    .sort(
      (a, b) => (a.secondsFromDayStart ?? 0) - (b.secondsFromDayStart ?? 0)
    );

  for (const marker of sorted) {
    const second = marker.secondsFromDayStart!;
    if (second < 0 || second > visibleSeconds) continue;

    const style = eventStyleFor(marker.sourceLabel);
    markers.push({
      xAxis: second,
      name: style.label,
      lineStyle: { color: style.color },
    });
  }

  return markers;
}

/**
 * 传感器饱和采样(削顶值)对图表无意义,掩为 null 以免把 y 轴拉伸到满量程。
 * 语料验证(711 天):real_pres 的饱和带为 65514~65535,合理压力最高 412
 * (0.1 cmH₂O/单位,即 41.2 cmH₂O),两者之间无任何观测值,故 u16 以半量程
 * 32768 为界;u8/i16 通道按各自满量程端点处理。
 */
function isSaturatedWaveformValue(
  value: number,
  values: WaveformValues
): boolean {
  if (values instanceof Int16Array) return value === -32768 || value === 32767;
  if (values instanceof Uint8Array) return value === 255;
  return value >= 32768;
}

// 压力通道 y 轴分位数与外扩边距
const PRESSURE_AXIS_TAIL = 0.005;
const PRESSURE_AXIS_MARGIN = 0.08;
const PRESSURE_AXIS_MIN_PAD = 2;

/**
 * 压力通道的分位数 y 轴范围。压力是平台型信号(在 EPAP/IPAP 间长时间停留),
 * 而治疗启动自检过冲、咳嗽等瞬时尖峰是真实数据却会独占刻度,把治疗频带压扁;
 * 故取 0.5%/99.5% 分位并外扩 8%,超出刻度的样本在网格边缘裁剪。
 * 仅用于 pressure / real_pres;flow 等波形通道的形状本身是信号,仍用 dataMin/dataMax。
 */
function computePressureYAxisRange(
  channels: WaveformValues[]
): { min: number; max: number } | null {
  // 掩掉饱和值后,各编码的合法值都落在 [-32767, 32767],+32768 偏移即可直方图计数
  const histogram = new Uint32Array(65536);
  let total = 0;
  for (const values of channels) {
    for (let i = 0; i < values.length; i += 1) {
      const value = values[i];
      if (isSaturatedWaveformValue(value, values)) continue;
      histogram[value + 32768] += 1;
      total += 1;
    }
  }
  if (total === 0) return null;

  const lowTarget = Math.ceil(total * PRESSURE_AXIS_TAIL);
  const highTarget = Math.floor(total * (1 - PRESSURE_AXIS_TAIL));
  let cumulative = 0;
  let low: number | null = null;
  let high: number | null = null;
  for (let bin = 0; bin < histogram.length; bin += 1) {
    cumulative += histogram[bin];
    if (low === null && cumulative >= lowTarget) low = bin - 32768;
    if (cumulative >= highTarget) {
      high = bin - 32768;
      break;
    }
  }
  if (low === null || high === null) return null;

  const pad = Math.max(
    (high - low) * PRESSURE_AXIS_MARGIN,
    PRESSURE_AXIS_MIN_PAD
  );
  // 表压不会为负,外扩后下限钳在 0
  return {
    min: Math.max(0, Math.floor(low - pad)),
    max: Math.ceil(high + pad),
  };
}

export function buildEChartsWaveformSeries(
  values: WaveformValues,
  time: WaveformTimeContext
): EChartsWaveformPoint[] {
  const { sampleRateHz, startTime = null, useSessions = [] } = time;
  if (sampleRateHz && sampleRateHz > 0 && useSessions.length > 0) {
    const points: EChartsWaveformPoint[] = [];
    let valueIndex = 0;

    for (
      let sessionIndex = 0;
      sessionIndex < useSessions.length && valueIndex < values.length;
      sessionIndex += 1
    ) {
      const session = useSessions[sessionIndex];
      const sessionStartMs = parseEdfTimestampMs(session.startTime);
      const sessionEndMs = parseEdfTimestampMs(session.endTime);
      if (sessionStartMs === null || sessionEndMs === null) continue;

      const remaining = values.length - valueIndex;
      const expectedCount = Math.floor(session.durationSeconds * sampleRateHz);
      const count = Math.min(
        remaining,
        sessionIndex === useSessions.length - 1 ? remaining : expectedCount
      );

      for (let offset = 0; offset < count; offset += 1) {
        const value = values[valueIndex];
        points.push([
          sessionStartMs + (offset / sampleRateHz) * 1000,
          isSaturatedWaveformValue(value, values) ? null : value,
        ]);
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
    return Array.from(values, (value, index) => [
      startMs + (index / sampleRateHz) * 1000,
      isSaturatedWaveformValue(value, values) ? null : value,
    ]);
  }

  return Array.from(values, (value, index) => [
    sampleRateHz ? index / sampleRateHz : index,
    isSaturatedWaveformValue(value, values) ? null : value,
  ]);
}

export function buildEChartsWaveformOption({
  label,
  values,
  sampleRateHz,
  startTime = null,
  useSessions = [],
  eventMarkers = [],
  pixelWidth = 1200,
  overlay = null,
}: BuildEChartsWaveformOptionParams): EChartsOption {
  const startMs = parseEdfTimestampMs(startTime);
  const firstSessionStartMs = parseEdfTimestampMs(useSessions[0]?.startTime);
  const lastSessionEndMs = parseEdfTimestampMs(
    useSessions[useSessions.length - 1]?.endTime
  );
  const usesSessionTime =
    firstSessionStartMs !== null &&
    lastSessionEndMs !== null &&
    Boolean(sampleRateHz && sampleRateHz > 0);
  const usesHeaderTime =
    startMs !== null && Boolean(sampleRateHz && sampleRateHz > 0);
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
      ? buildTimestampMarkLineData(
          eventMarkers,
          chartStartMs,
          chartEndMs,
          pixelWidth
        )
      : buildEventMarkLineData(
          eventMarkers,
          sampleRateHz,
          values.length,
          pixelWidth
        );
  const data = buildEChartsWaveformSeries(values, {
    sampleRateHz,
    startTime,
    useSessions,
  });
  const xAxisName = usesRealTime
    ? "真实时间"
    : sampleRateHz
      ? "秒"
      : "采样序号";

  const pressureAxisRange =
    label === "pressure" || label === "real_pres"
      ? computePressureYAxisRange(
          overlay && overlay.values.length > 0
            ? [values, overlay.values]
            : [values]
        )
      : null;

  const series: Record<string, unknown> = {
    name: label,
    type: "line",
    data,
    symbol: "none",
    showSymbol: false,
    sampling: "lttb",
    animation: false,
    progressive: 8000,
    progressiveThreshold: 20000,
    lineStyle: {
      width: 1.2,
      color: "#0a72ef",
    },
    emphasis: {
      disabled: true,
    },
  };

  if (markLineData.length > 0) {
    series.markLine = {
      silent: true,
      symbol: "none",
      lineStyle: {
        opacity: 0.55,
        width: 1,
        type: "dashed",
      },
      label: {
        show: true,
        position: "insideStartTop",
        fontSize: 10,
        formatter: "{b}",
      },
      data: markLineData,
    };
  }

  const seriesList: Array<Record<string, unknown>> = [series];
  let legendData: string[] | undefined;

  if (overlay && overlay.values.length > 0) {
    seriesList.push({
      name: overlay.label,
      type: "line",
      data: buildEChartsWaveformSeries(overlay.values, {
        sampleRateHz,
        startTime,
        useSessions,
      }),
      symbol: "none",
      showSymbol: false,
      sampling: "lttb",
      animation: false,
      progressive: 8000,
      progressiveThreshold: 20000,
      lineStyle: {
        width: 1.2,
        color: "#9333ea",
        opacity: 0.85,
      },
      emphasis: { disabled: true },
    });
    legendData = [label, overlay.label];
  }

  return {
    animation: false,
    backgroundColor: "transparent",
    ...(legendData ? { legend: { data: legendData, top: 0, left: 0 } } : {}),
    useUTC: usesRealTime ? true : undefined,
    grid: {
      top: 16,
      right: 18,
      bottom: 42,
      left: 42,
      containLabel: false,
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
      confine: true,
      renderMode: "html",
      valueFormatter: (value) =>
        typeof value === "number" ? value.toFixed(2) : String(value),
    },
    toolbox: {
      show: true,
      right: 8,
      top: 0,
      itemSize: 14,
      feature: {
        dataZoom: { yAxisIndex: "none" },
        restore: {},
        saveAsImage: { pixelRatio: 2 },
      },
    },
    xAxis: {
      type: usesRealTime ? "time" : "value",
      name: xAxisName,
      min: "dataMin",
      max: "dataMax",
      axisLabel: {
        formatter: usesRealTime
          ? formatEdfClockTime
          : sampleRateHz
            ? formatAxisSecond
            : undefined,
      },
      axisLine: { lineStyle: { color: "#c9c9c9" } },
      splitLine: { lineStyle: { color: "rgba(0, 0, 0, 0.06)" } },
    },
    yAxis: pressureAxisRange
      ? {
          type: "value",
          min: pressureAxisRange.min,
          max: pressureAxisRange.max,
          axisLine: { lineStyle: { color: "#c9c9c9" } },
          splitLine: {
            lineStyle: { color: "rgba(0, 0, 0, 0.08)", type: "dashed" },
          },
        }
      : {
          type: "value",
          scale: true,
          min: "dataMin",
          max: "dataMax",
          axisLine: { lineStyle: { color: "#c9c9c9" } },
          splitLine: {
            lineStyle: { color: "rgba(0, 0, 0, 0.08)", type: "dashed" },
          },
        },
    dataZoom: [
      {
        type: "inside",
        xAxisIndex: 0,
        filterMode: "none",
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        moveOnMouseWheel: false,
        preventDefaultMouseMove: true,
      },
      {
        type: "slider",
        xAxisIndex: 0,
        filterMode: "none",
        height: 20,
        bottom: 10,
        brushSelect: true,
      },
    ],
    series: seriesList,
  } satisfies EChartsOption;
}
