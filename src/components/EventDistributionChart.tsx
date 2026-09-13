import { useMemo } from "react";
import * as echarts from "echarts/core";
import { BarChart as EChartsBarChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EventRecord } from "../types";
import { buildEventDistributionOption } from "../charts/eventDistributionOptions";
import { useECharts } from "../charts/useECharts";

echarts.use([
  CanvasRenderer,
  EChartsBarChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
]);

interface EventDistributionChartProps {
  events: EventRecord[];
}

export function EventDistributionChart({
  events,
}: EventDistributionChartProps) {
  const option = useMemo(() => buildEventDistributionOption(events), [events]);
  const { containerRef } = useECharts(option);

  return (
    <section className="event-distribution">
      <h3>事件分布（按小时）</h3>
      <div
        ref={containerRef}
        className="event-distribution-chart"
        style={{ height: 200 }}
        aria-label="AI 与 HI 事件按小时分布图"
      />
    </section>
  );
}
