import type { EChartsCoreOption } from "echarts/core";
import type { DaySummary } from "../types";

// 长期摘要图:横轴为日期,柱状为使用时长(小时),折线为按小时折算的 AHI
// (AI + HI 事件总数 ÷ 当日使用时长)。整晚事件总数在 tooltip 中展示。
// 使用时长过短(不足 30 分钟)的夜晚折算值波动过大,不计算 AHI。
const MIN_AHI_USE_HOURS = 0.5;

// 当日 AI/HI 事件总数;两类事件文件都缺失时返回 null,避免把不完整数据当作 0。
function eventTotal(summary: DaySummary): number | null {
  const { ai, hi } = summary.eventCounts;
  if (ai === undefined && hi === undefined) return null;
  return (ai ?? 0) + (hi ?? 0);
}

function ahiPerHour(summary: DaySummary | undefined): number | null {
  if (!summary) return null;
  const total = eventTotal(summary);
  const seconds = summary.useDurationSeconds;
  if (total === null || seconds === null) return null;
  const hours = seconds / 3600;
  if (hours < MIN_AHI_USE_HOURS) return null;
  return total / hours;
}

function formatUseHours(summary: DaySummary): string {
  const seconds = summary.useDurationSeconds;
  if (seconds === null) return "无记录";
  return `${(seconds / 3600).toFixed(1)} h`;
}

function buildTooltipFormatter(
  days: string[],
  summariesByDay: Record<string, DaySummary>
) {
  return (params: unknown) => {
    const list = Array.isArray(params) ? params : [params];
    const first = list[0] as { dataIndex?: number } | undefined;
    const day = first ? days[first.dataIndex ?? -1] : undefined;
    const summary = day ? summariesByDay[day] : undefined;
    if (!day || !summary) return "";

    const total = eventTotal(summary);
    const ahi = ahiPerHour(summary);
    return [
      `<strong>${day}</strong>`,
      `使用时长: ${formatUseHours(summary)}`,
      `呼吸事件总数 (AI + HI): ${total === null ? "无记录" : `${total} 次`}`,
      `AHI: ${ahi === null ? "—" : `${ahi.toFixed(1)} 次/h`}`,
    ].join("<br/>");
  };
}

export function buildSummaryTrendOption(
  days: string[],
  summariesByDay: Record<string, DaySummary>
): EChartsCoreOption {
  const durationHours = days.map((day) => {
    const seconds = summariesByDay[day]?.useDurationSeconds;
    return seconds === null || seconds === undefined
      ? null
      : Math.round((seconds / 3600) * 100) / 100;
  });
  const ahi = days.map((day) => {
    const value = ahiPerHour(summariesByDay[day]);
    return value === null ? null : Math.round(value * 10) / 10;
  });

  return {
    animation: false,
    backgroundColor: "transparent",
    grid: { top: 28, right: 16, bottom: 40, left: 48, containLabel: false },
    legend: { data: ["使用时长 (h)", "AHI (次/h)"], top: 0, left: 0 },
    tooltip: {
      trigger: "axis",
      confine: true,
      formatter: buildTooltipFormatter(days, summariesByDay),
    },
    xAxis: {
      type: "category",
      data: days,
      axisLine: { lineStyle: { color: "#c9c9c9" } },
      axisLabel: { fontSize: 10 },
    },
    yAxis: [
      { type: "value", name: "h", axisLabel: { fontSize: 10 } },
      { type: "value", name: "AHI (次/h)", axisLabel: { fontSize: 10 } },
    ],
    series: [
      {
        name: "使用时长 (h)",
        type: "bar",
        data: durationHours,
        itemStyle: { color: "#0a72ef", opacity: 0.75 },
        barMaxWidth: 26,
      },
      {
        name: "AHI (次/h)",
        type: "line",
        yAxisIndex: 1,
        data: ahi,
        symbol: "circle",
        symbolSize: 6,
        lineStyle: { width: 2, color: "#d92d20" },
        itemStyle: { color: "#d92d20" },
      },
    ],
  };
}
