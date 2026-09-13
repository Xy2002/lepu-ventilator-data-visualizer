import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import type { ECharts, EChartsCoreOption } from "echarts/core";

/**
 * 轻量 ECharts 实例封装:option 变化即重建,容器尺寸变化自适应。
 * WaveformChart 因需要 dataZoom 联动与事件聚焦,保留独立实现。
 */
export function useECharts(option: EChartsCoreOption) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ECharts | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current);
    chartRef.current = chart;
    chart.setOption(option, true);

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
    // option 以引用传入,由调用方 useMemo 保证稳定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [option]);

  return { containerRef, chartRef };
}
