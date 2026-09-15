import type { EChartsCoreOption } from "echarts/core";
import type { DaySummary } from "../types";

// 长期摘要图:横轴为日期,柱状为使用时长(小时),折线为按小时折算的 AHI
// (AI + HI 事件总数 ÷ 当日使用时长)。整晚事件总数在 tooltip 中展示。
// 使用时长过短(不足 30 分钟)的夜晚折算值波动过大,不计算 AHI。
const MIN_AHI_USE_HOURS = 0.5;

// AHI 分子:AI/HI 两个事件文件都已解析才计数——eventCounts 只在实际解析到
// 对应文件时才有 key,单边缺失时把另一方当 0 会画出虚低的 AHI。
function completeEventTotal(summary: DaySummary): number | null {
  const { ai, hi } = summary.eventCounts;
  if (ai === undefined || hi === undefined) return null;
  return ai + hi;
}

// tooltip 的整晚总数:区分完整、部分缺失与无记录,避免把不完整数据呈现为完整统计。
function eventTotalLabel(summary: DaySummary): string {
  const { ai, hi } = summary.eventCounts;
  if (ai === undefined && hi === undefined) return "无记录";
  if (ai === undefined || hi === undefined) {
    return `${ai ?? hi} 次（部分事件文件缺失）`;
  }
  return `${ai + hi} 次`;
}

function ahiPerHour(summary: DaySummary | undefined): number | null {
  if (!summary) return null;
  const total = completeEventTotal(summary);
  const seconds = summary.useDurationSeconds;
  // useDurationSeconds 在无有效使用会话时会回退为记录跨度(含未使用时段),不能作 AHI 分母
  if (total === null || seconds === null || summary.useSessions.length === 0) {
    return null;
  }
  const hours = seconds / 3600;
  if (hours < MIN_AHI_USE_HOURS) return null;
  return total / hours;
}

function formatUseHours(summary: DaySummary): string {
  const seconds = summary.useDurationSeconds;
  if (seconds === null) return "无记录";
  const hours = (seconds / 3600).toFixed(1);
  // 无使用会话时该值回退为记录跨度(含未使用时段),如实标注,避免被当作使用时长
  if (summary.useSessions.length === 0) {
    return `无记录（仅记录跨度 ${hours} h）`;
  }
  return `${hours} h`;
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

    const total = eventTotalLabel(summary);
    const ahi = ahiPerHour(summary);
    return [
      `<strong>${day}</strong>`,
      `使用时长: ${formatUseHours(summary)}`,
      `呼吸事件总数 (AI + HI): ${total}`,
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
