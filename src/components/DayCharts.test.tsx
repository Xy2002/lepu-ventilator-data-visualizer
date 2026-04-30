import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DayDetail, ParsedVentilatorFile } from '../types';
import { DayCharts } from './DayCharts';

vi.mock('../charts/WaveformChart', () => ({
  WaveformChart: ({ label }: { label: string }) => (
    <div role="img" aria-label={`${label} ECharts waveform chart`}>
      {label}
    </div>
  ),
}));

function signal(fileName: string, label: string): ParsedVentilatorFile {
  return {
    fileName,
    kind: 'waveform_u8',
    header: {
      version: 'V2.12',
      patientId: '',
      recordingId: '',
      startTime: '2026-04-29 03:12:57',
      endTime: '2026-04-29 07:46:06',
      headerBytes: 512,
      firmware: '',
      field236: '',
      field244: '80',
      signalCount: 1,
      label,
      physicalDimension: '',
      physicalMin: '0',
      physicalMax: '100',
      digitalMin: '0',
      digitalMax: '100',
      sampleIntervalMs: 80,
      sampleRateHz: 12.5,
    },
    payloadBytes: 3,
    values: new Uint8Array([1, 2, 3]),
    records: [],
    rawPayload: new Uint8Array([1, 2, 3]),
    warnings: [],
  };
}

function detail(signals: ParsedVentilatorFile[]): DayDetail {
  return {
    summary: {
      date: '2026-04-29',
      startTime: null,
      endTime: null,
      useDurationSeconds: null,
      useSessions: [],
      eventCounts: {},
      signalPresence: {},
      sampleCounts: {},
      pressureRange: null,
      missingFiles: [],
      warnings: [],
    },
    files: signals,
    signals,
    events: [],
    useSessions: [],
    rawFiles: signals,
  };
}

describe('DayCharts', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('mounts only the selected waveform chart and switches it with tabs', async () => {
    render(
      <DayCharts
        detail={detail([signal('flow.edf', 'flow'), signal('pressure.edf', 'pressure')])}
        focusedEventSecond={null}
      />,
    );

    expect(screen.getByRole('tablist', { name: '波形图表' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'flow' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'pressure' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('img', { name: 'flow ECharts waveform chart' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'pressure ECharts waveform chart' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'pressure' }));

    expect(screen.getByRole('tab', { name: 'flow' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'pressure' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('img', { name: 'pressure ECharts waveform chart' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'flow ECharts waveform chart' })).not.toBeInTheDocument();
  });

  it('shows a loading bar before mounting the newly selected chart', async () => {
    vi.useFakeTimers();
    render(
      <DayCharts
        detail={detail([signal('flow.edf', 'flow'), signal('pressure.edf', 'pressure')])}
        focusedEventSecond={null}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'pressure' }));

    expect(screen.getByRole('tab', { name: 'pressure' })).toHaveAttribute('aria-selected', 'true');
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('aria-busy', 'true');
    expect(within(panel).getByRole('progressbar', { name: '正在加载 pressure 图表' })).toBeInTheDocument();
    expect(within(panel).getByRole('img', { name: 'flow ECharts waveform chart' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'pressure ECharts waveform chart' })).not.toBeInTheDocument();

    await act(async () => {
      vi.runOnlyPendingTimers();
    });

    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-busy', 'false');
    expect(screen.queryByRole('progressbar', { name: '正在加载 pressure 图表' })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'flow ECharts waveform chart' })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'pressure ECharts waveform chart' })).toBeInTheDocument();
  });
});
