import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const chartMock = vi.hoisted(() => ({
  dispatchAction: vi.fn(),
  dispose: vi.fn(),
  resize: vi.fn(),
  setOption: vi.fn(),
}));

const echartsCoreMock = vi.hoisted(() => ({
  init: vi.fn(() => chartMock),
  use: vi.fn(),
}));

vi.mock('echarts/core', () => echartsCoreMock);
vi.mock('echarts/charts', () => ({ LineChart: {} }));
vi.mock('echarts/components', () => ({
  DataZoomComponent: {},
  GridComponent: {},
  MarkLineComponent: {},
  ToolboxComponent: {},
  TooltipComponent: {},
}));
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }));

import { WaveformChart } from './WaveformChart';

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

describe('WaveformChart', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    cleanup();
  });

  it('initializes ECharts with the canvas renderer and sample metadata', () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);

    render(
      <WaveformChart
        label="flow"
        values={new Uint8Array([1, 2, 3])}
        sampleRateHz={80}
        startTime="2026-04-29 03:03:12.57"
        eventMarkers={[{ timestamp: '2026-04-29 03:03:13.57', sourceLabel: 'ai' }]}
      />,
    );

    expect(screen.getByRole('img', { name: 'flow ECharts waveform chart' })).toBeInTheDocument();
    expect(screen.getByText('3 采样 · 80 Hz · 2026-04-29 03:03:12.57')).toBeInTheDocument();
    expect(echartsCoreMock.init).toHaveBeenCalledWith(expect.any(HTMLDivElement), null, { renderer: 'canvas' });
    expect(chartMock.setOption).toHaveBeenCalledWith(
      expect.objectContaining({
        xAxis: expect.objectContaining({ type: 'time', name: 'real time' }),
        tooltip: expect.objectContaining({ trigger: 'axis' }),
        dataZoom: expect.arrayContaining([expect.objectContaining({ type: 'inside' })]),
      }),
      true,
    );
  });

  it('centers the ECharts dataZoom around a focused event second', () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);

    render(
      <WaveformChart
        label="flow"
        values={new Uint8Array(Array.from({ length: 400 }, (_, index) => index % 255))}
        sampleRateHz={80}
        focusedSecond={2}
      />,
    );

    expect(screen.getByText('焦点：2.00s')).toBeInTheDocument();
    expect(chartMock.dispatchAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'dataZoom',
        dataZoomIndex: 0,
      }),
    );
  });

  it('centers the ECharts dataZoom around a focused EDF timestamp when real time is available', () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);

    render(
      <WaveformChart
        label="flow"
        values={new Uint8Array(Array.from({ length: 1600 }, (_, index) => index % 255))}
        sampleRateHz={80}
        startTime="2026-04-29 03:03:12.57"
        focusedSecond={2}
        focusedTimestamp="2026-04-29 03:03:14.57"
      />,
    );

    expect(screen.getByText('焦点：2026-04-29 03:03:14.57')).toBeInTheDocument();
    expect(chartMock.dispatchAction).toHaveBeenCalledTimes(1);
    expect(chartMock.dispatchAction).toHaveBeenCalledWith({
      type: 'dataZoom',
      dataZoomIndex: 0,
      startValue: 1777431792570,
      endValue: 1777431804570,
    });
  });

  it('keeps wheel zoom gestures from scrolling the page', () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);

    render(<WaveformChart label="flow" values={new Uint8Array([1, 2, 3])} sampleRateHz={80} />);

    const chart = screen.getByRole('img', { name: 'flow ECharts waveform chart' });
    const wheelEvent = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 });

    chart.dispatchEvent(wheelEvent);

    expect(wheelEvent.defaultPrevented).toBe(true);
  });
});
