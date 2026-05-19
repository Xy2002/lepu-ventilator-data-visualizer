import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DayDetail, EventRecord, ParsedVentilatorFile } from '../types';
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

function makeEvent(sourceLabel: string, value2: number, timestamp: string): EventRecord {
  return {
    sourceLabel,
    value1: sourceLabel === 'ascp' ? 141 : 1,
    value2,
    timestamp,
    secondsFromDayStart: 60,
  };
}

function detail(signals: ParsedVentilatorFile[], events: EventRecord[] = []): DayDetail {
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
    events,
    useSessions: [],
    rawFiles: signals,
  };
}

describe('DayCharts', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('mounts the selected waveform chart and switches with tabs', async () => {
    render(
      <DayCharts detail={detail([signal('flow.edf', 'flow'), signal('pressure.edf', 'pressure')])} />,
    );

    expect(screen.getByRole('tablist', { name: '波形图表' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '气流' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('img', { name: 'flow ECharts waveform chart' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: '压力' }));

    expect(screen.getByRole('tab', { name: '压力' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('img', { name: 'pressure ECharts waveform chart' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'flow ECharts waveform chart' })).not.toBeInTheDocument();
  });

  it('shows a loading bar before mounting the newly selected chart', async () => {
    vi.useFakeTimers();
    render(
      <DayCharts detail={detail([signal('flow.edf', 'flow'), signal('pressure.edf', 'pressure')])} />,
    );

    fireEvent.click(screen.getByRole('tab', { name: '压力' }));

    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('aria-busy', 'true');
    expect(within(panel).getByRole('progressbar', { name: '正在加载 pressure 图表' })).toBeInTheDocument();

    await act(async () => {
      vi.runOnlyPendingTimers();
    });

    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-busy', 'false');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'pressure ECharts waveform chart' })).toBeInTheDocument();
  });

  it('shows AI/HI events when flow tab is active', () => {
    const events = [
      makeEvent('ai', 22, '2026-04-29 02:31:32'),
      makeEvent('hi', 15, '2026-04-29 03:04:41'),
      makeEvent('ascp', 101, '2026-04-29 02:32:00'),
    ];

    render(
      <DayCharts detail={detail([signal('flow.edf', 'flow'), signal('pressure.edf', 'pressure')], events)} />,
    );

    // Flow is active by default, shows AI/HI events
    expect(screen.getByText('AI/HI 事件')).toBeTruthy();
    expect(screen.getByText('22秒')).toBeTruthy();
    expect(screen.getByText('15秒')).toBeTruthy();
    // ASCP event should NOT appear in flow view
    expect(screen.queryByText('ASCP 压力记录')).not.toBeTruthy();
  });

  it('shows ASCP events when pressure tab is active', async () => {
    const events = [
      makeEvent('ai', 22, '2026-04-29 02:31:32'),
      makeEvent('ascp', 101, '2026-04-29 02:32:00'),
    ];

    render(
      <DayCharts detail={detail([signal('flow.edf', 'flow'), signal('pressure.edf', 'pressure')], events)} />,
    );

    await userEvent.click(screen.getByRole('tab', { name: '压力' }));

    expect(screen.getByText('ASCP 压力记录')).toBeTruthy();
    expect(screen.getByText(/14\.1/)).toBeTruthy();
    // AI events should NOT appear in pressure view
    expect(screen.queryByText('AI/HI 事件')).not.toBeTruthy();
  });

  it('event rows are clickable to focus', async () => {
    const events = [
      makeEvent('ai', 22, '2026-04-29 02:31:32'),
    ];

    render(
      <DayCharts detail={detail([signal('flow.edf', 'flow')], events)} />,
    );

    // Click event row — the <tr> itself
    const row = screen.getByText('22秒').closest('tr')!;
    expect(row.className).not.toContain('chart-event-active');

    await userEvent.click(row);
    expect(row.className).toContain('chart-event-active');

    // Click again to deselect
    await userEvent.click(row);
    expect(row.className).not.toContain('chart-event-active');
  });

  it('shows empty message when no signals', () => {
    render(<DayCharts detail={detail([])} />);
    expect(screen.getByText('当前日期没有可显示的波形文件。')).toBeInTheDocument();
  });
});
