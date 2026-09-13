import type { EChartsCoreOption } from "echarts/core";
import type { EventRecord } from "../types";

// 事件分布图:按小时(0–23)堆叠 AI 与 HI 事件数量。
// availability 标注事件文件是否实际存在,缺失的类目不绘制(区别于 0 条事件)
export function buildEventDistributionOption(
  events: EventRecord[],
  availability: { ai: boolean; hi: boolean } = { ai: true, hi: true }
): EChartsCoreOption {
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  const aiByHour = hours.map(() => 0);
  const hiByHour = hours.map(() => 0);

  for (const event of events) {
    if (event.sourceLabel !== "ai" && event.sourceLabel !== "hi") continue;
    if (!event.timestamp) continue;
    const match = event.timestamp.match(/[ T](\d{2}):/);
    if (!match) continue;
    const hour = Number(match[1]);
    if (Number.isNaN(hour) || hour < 0 || hour > 23) continue;
    if (event.sourceLabel === "ai") aiByHour[hour] += 1;
    else hiByHour[hour] += 1;
  }

  return {
    animation: false,
    backgroundColor: "transparent",
    grid: { top: 28, right: 16, bottom: 40, left: 40, containLabel: false },
    legend: {
      data: [
        ...(availability.ai ? ["AI"] : []),
        ...(availability.hi ? ["HI"] : []),
      ],
      top: 0,
      left: 0,
    },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: hours.map((hour) => `${String(hour).padStart(2, "0")}时`),
      axisLine: { lineStyle: { color: "#c9c9c9" } },
      axisLabel: { fontSize: 10 },
    },
    yAxis: { type: "value", minInterval: 1, axisLabel: { fontSize: 10 } },
    series: [
      ...(availability.ai
        ? [
            {
              name: "AI",
              type: "bar",
              stack: "events",
              data: aiByHour,
              itemStyle: { color: "#d92d20" },
              barMaxWidth: 18,
            },
          ]
        : []),
      ...(availability.hi
        ? [
            {
              name: "HI",
              type: "bar",
              stack: "events",
              data: hiByHour,
              itemStyle: { color: "#f59e0b" },
              barMaxWidth: 18,
            },
          ]
        : []),
    ],
  };
}
