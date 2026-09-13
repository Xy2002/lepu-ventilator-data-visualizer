import type { EChartsCoreOption } from "echarts/core";
import type { DaySummary } from "../types";

// 长期摘要图:横轴为日期,柱状为使用时长(小时),折线为 AHI(AI + HI)
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
    const counts = summariesByDay[day]?.eventCounts ?? {};
    return (counts.ai ?? 0) + (counts.hi ?? 0);
  });

  return {
    animation: false,
    backgroundColor: "transparent",
    grid: { top: 28, right: 16, bottom: 40, left: 48, containLabel: false },
    legend: { data: ["使用时长 (h)", "AHI"], top: 0, left: 0 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: days,
      axisLine: { lineStyle: { color: "#c9c9c9" } },
      axisLabel: { fontSize: 10 },
    },
    yAxis: [
      { type: "value", name: "h", axisLabel: { fontSize: 10 } },
      { type: "value", name: "AHI", axisLabel: { fontSize: 10 } },
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
        name: "AHI",
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
