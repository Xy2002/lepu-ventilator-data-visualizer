import { describe, it, expect } from 'vitest';
import { buildDataSummary, buildSystemPrompt } from './dataSummary';
import type { DaySummary } from '../types';

const sampleSummary: DaySummary = {
  date: '2026-05-21',
  startTime: '2026-05-20 22:30:00',
  endTime: '2026-05-21 06:15:00',
  useDurationSeconds: 27900,
  useSessions: [
    { startTime: '2026-05-20 22:30:00', endTime: '2026-05-21 02:00:00', durationSeconds: 12600 },
    { startTime: '2026-05-21 04:00:00', endTime: '2026-05-21 06:15:00', durationSeconds: 8100 },
  ],
  eventCounts: { ai: 3, hi: 5, ascp: 4 },
  signalPresence: { flow: true, pressure: true, real_pres: true, real_flow: true },
  sampleCounts: { flow: 125000, pressure: 125000, real_pres: 125000, real_flow: 125000 },
  pressureRange: { min: 4, max: 15 },
  missingFiles: [],
  warnings: [],
};

describe('buildDataSummary', () => {
  it('produces a structured text summary of day data', () => {
    const result = buildDataSummary(sampleSummary);
    expect(result).toContain('## 呼吸机数据日报 — 2026-05-21');
    expect(result).toContain('2026-05-20 22:30:00 至 2026-05-21 02:00:00');
    expect(result).toContain('2026-05-21 04:00:00 至 2026-05-21 06:15:00');
    expect(result).toContain('5h 45m');
    expect(result).toContain('AHI 相关事件总计: 12 次');
    expect(result).toContain('压力范围: 4 - 15 cmH2O');
    expect(result).toContain('流量波形: ✓ (125,000 采样点)');
  });

  it('handles minimal data gracefully', () => {
    const minimal: DaySummary = {
      date: '2026-05-21',
      startTime: null,
      endTime: null,
      useDurationSeconds: null,
      useSessions: [],
      eventCounts: {},
      signalPresence: {},
      sampleCounts: {},
      pressureRange: null,
      missingFiles: ['flow', 'pressure', 'real_pres', 'real_flow'],
      warnings: [],
    };
    const result = buildDataSummary(minimal);
    expect(result).toContain('使用时段: 无数据');
    expect(result).toContain('压力范围: 无数据');
    expect(result).toContain('缺失文件: flow, pressure, real_pres, real_flow');
  });
});

describe('buildSystemPrompt', () => {
  it('returns a system prompt for medical data analysis', () => {
    const result = buildSystemPrompt();
    expect(result).toContain('呼吸机');
    expect(result).toContain('CPAP');
    expect(result.length).toBeGreaterThan(100);
  });
});
