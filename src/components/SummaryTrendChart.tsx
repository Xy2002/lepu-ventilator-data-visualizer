import { useEffect, useMemo } from "react";
import * as echarts from "echarts/core";
import {
  BarChart as EChartsBarChart,
  LineChart as EChartsLineChart,
} from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { DatasetIndex } from "../types";
import { buildSummaryTrendOption } from "../charts/summaryTrendOptions";
import { useECharts } from "../charts/useECharts";

echarts.use([
  CanvasRenderer,
  EChartsBarChart,
  EChartsLineChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
]);

interface SummaryTrendChartProps {
  dataset: DatasetIndex;
  onSelectDate: (date: string) => void;
}

export function SummaryTrendChart({
  dataset,
  onSelectDate,
}: SummaryTrendChartProps) {
  const option = useMemo(
    () => buildSummaryTrendOption(dataset.days, dataset.summariesByDay),
    [dataset]
  );

  const { containerRef, chartRef } = useECharts(option);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const handler = (params: { componentType: string; name: string }) => {
      if (
        params.componentType === "series" &&
        dataset.days.includes(params.name)
      ) {
        onSelectDate(params.name);
      }
    };
    chart.on("click", handler);
    return () => {
      chart.off("click", handler);
    };
  }, [chartRef, option, dataset.days, onSelectDate]);

  return (
    <section className="summary-trend">
      <h3>长期摘要（近 {dataset.days.length} 天）</h3>
      <div
        ref={containerRef}
        className="summary-trend-chart"
        style={{ height: 240 }}
        aria-label="长期使用时长与 AHI 趋势图"
      />
    </section>
  );
}
