import { describe, expect, it } from 'vitest';
import { buildEChartsWaveformOption, buildEChartsWaveformSeries } from './echartsWaveformOptions';

describe('buildEChartsWaveformSeries', () => {
  it('maps samples across real use sessions and inserts gaps between sessions', () => {
    expect(
      buildEChartsWaveformSeries(new Uint8Array([10, 11, 20, 21]), 1, null, [
        {
          startTime: '2026-04-29 08:00:00',
          endTime: '2026-04-29 08:00:02',
          durationSeconds: 2,
        },
        {
          startTime: '2026-04-29 09:00:00',
          endTime: '2026-04-29 09:00:02',
          durationSeconds: 2,
        },
      ]),
    ).toEqual([
      [Date.UTC(2026, 3, 29, 8, 0, 0), 10],
      [Date.UTC(2026, 3, 29, 8, 0, 1), 11],
      [Date.UTC(2026, 3, 29, 8, 0, 2), null],
      [Date.UTC(2026, 3, 29, 9, 0, 0), 20],
      [Date.UTC(2026, 3, 29, 9, 0, 1), 21],
    ]);
  });

  it('converts waveform values into real EDF timestamps when start time is available', () => {
    expect(
      buildEChartsWaveformSeries(new Int16Array([-2, 0, 4]), 2, '2026-04-29 03:03:12.57'),
    ).toEqual([
      [1777431792570, -2],
      [1777431793070, 0],
      [1777431793570, 4],
    ]);
  });

  it('converts waveform values into numeric second-value points for analysis charts', () => {
    expect(buildEChartsWaveformSeries(new Int16Array([-2, 0, 4]), 2)).toEqual([
      [0, -2],
      [0.5, 0],
      [1, 4],
    ]);
  });

  it('falls back to sample index when sample rate is unknown', () => {
    expect(buildEChartsWaveformSeries(new Uint8Array([7, 9]), null)).toEqual([
      [0, 7],
      [1, 9],
    ]);
  });
});

describe('buildEChartsWaveformOption', () => {
  it('renders EDF waveform charts against real clock time when header start time is available', () => {
    const option = buildEChartsWaveformOption({
      label: 'flow',
      values: new Uint8Array([20, 19, 17]),
      sampleRateHz: 2,
      startTime: '2026-04-29 03:03:12.57',
      eventMarkers: [{ timestamp: '2026-04-29 03:03:13.07', sourceLabel: 'ai' }],
    });

    expect(option.useUTC).toBe(true);
    expect(option.xAxis).toMatchObject({ type: 'time', name: 'real time' });
    expect(option.series).toEqual([
      expect.objectContaining({
        data: [
          [1777431792570, 20],
          [1777431793070, 19],
          [1777431793570, 17],
        ],
        markLine: expect.objectContaining({
          data: [expect.objectContaining({ xAxis: 1777431793070, name: 'AI 呼吸暂停' })],
        }),
      }),
    ]);
  });

  it('uses session timing for real clock charts when use sessions are available', () => {
    const option = buildEChartsWaveformOption({
      label: 'flow',
      values: new Uint8Array([20, 19, 17, 16]),
      sampleRateHz: 1,
      useSessions: [
        {
          startTime: '2026-04-29 08:00:00',
          endTime: '2026-04-29 08:00:02',
          durationSeconds: 2,
        },
        {
          startTime: '2026-04-29 09:00:00',
          endTime: '2026-04-29 09:00:02',
          durationSeconds: 2,
        },
      ],
      eventMarkers: [{ timestamp: '2026-04-29 09:00:01', sourceLabel: 'hi' }],
    });

    expect(option.xAxis).toMatchObject({ type: 'time', name: 'real time' });
    expect(option.series).toEqual([
      expect.objectContaining({
        data: [
          [Date.UTC(2026, 3, 29, 8, 0, 0), 20],
          [Date.UTC(2026, 3, 29, 8, 0, 1), 19],
          [Date.UTC(2026, 3, 29, 8, 0, 2), null],
          [Date.UTC(2026, 3, 29, 9, 0, 0), 17],
          [Date.UTC(2026, 3, 29, 9, 0, 1), 16],
        ],
        markLine: expect.objectContaining({
          data: [expect.objectContaining({ xAxis: Date.UTC(2026, 3, 29, 9, 0, 1), name: 'HI 低通气' })],
        }),
      }),
    ]);
  });

  it('enables professional waveform analysis interactions', () => {
    const option = buildEChartsWaveformOption({
      label: 'pressure',
      values: new Uint16Array([1, 2, 3, 4]),
      sampleRateHz: 2,
      eventMarkers: [
        { secondsFromDayStart: 0.5, sourceLabel: 'ascp' },
        { secondsFromDayStart: 1, sourceLabel: 'ascp' },
      ],
    });

    expect(option.tooltip).toMatchObject({
      trigger: 'axis',
      axisPointer: { type: 'cross' },
    });
    expect(option.xAxis).toMatchObject({ type: 'value', name: 'seconds' });
    expect(option.yAxis).toMatchObject({ type: 'value', scale: true });
    expect(option.dataZoom).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'inside', zoomOnMouseWheel: true, moveOnMouseMove: true }),
        expect.objectContaining({ type: 'slider', xAxisIndex: 0 }),
      ]),
    );
    expect(option.series).toEqual([
      expect.objectContaining({
        name: 'pressure',
        type: 'line',
        symbol: 'none',
        sampling: 'lttb',
        markLine: expect.objectContaining({
          data: [
            expect.objectContaining({ xAxis: 0.5, name: 'ASCP 压力调整' }),
            expect.objectContaining({ xAxis: 1, name: 'ASCP 压力调整' }),
          ],
        }),
      }),
    ]);
  });

  it('omits event mark lines when the waveform cannot be time-aligned', () => {
    const option = buildEChartsWaveformOption({
      label: 'difleak',
      values: new Uint8Array([1, 2, 3]),
      sampleRateHz: null,
      eventMarkers: [
        { secondsFromDayStart: 1, sourceLabel: 'ai' },
        { secondsFromDayStart: 2, sourceLabel: 'ai' },
      ],
    });

    const series = option.series as Array<Record<string, unknown>>;
    expect(series[0]).not.toHaveProperty('markLine');
  });
});
