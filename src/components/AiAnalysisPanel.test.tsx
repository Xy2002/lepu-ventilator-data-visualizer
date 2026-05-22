import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AiAnalysisPanel } from './AiAnalysisPanel';
import type { DaySummary } from '../types';

const mockSummary: DaySummary = {
  date: '2026-05-21',
  startTime: '2026-05-20 22:30:00',
  endTime: '2026-05-21 06:15:00',
  useDurationSeconds: 27900,
  useSessions: [
    { startTime: '2026-05-20 22:30:00', endTime: '2026-05-21 02:00:00', durationSeconds: 12600 },
  ],
  eventCounts: { ai: 3, hi: 5 },
  signalPresence: { flow: true, pressure: true, real_pres: true, real_flow: true },
  sampleCounts: { flow: 1000 },
  pressureRange: { min: 4, max: 15 },
  missingFiles: [],
  warnings: [],
};

describe('AiAnalysisPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders collapsed trigger when closed', () => {
    render(
      <AiAnalysisPanel summary={mockSummary} selectedDate="2026-05-21" open={false} onToggle={() => {}} />,
    );
    expect(screen.getByRole('button', { name: /AI 分析/ })).toBeTruthy();
    expect(screen.getByText('点击展开')).toBeTruthy();
  });

  it('calls onToggle when collapsed trigger clicked', async () => {
    const onToggle = vi.fn();
    render(
      <AiAnalysisPanel summary={mockSummary} selectedDate="2026-05-21" open={false} onToggle={onToggle} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /AI 分析/ }));
    expect(onToggle).toHaveBeenCalled();
  });

  it('renders the panel with header when open', () => {
    render(
      <AiAnalysisPanel summary={mockSummary} selectedDate="2026-05-21" open={true} onToggle={() => {}} />,
    );
    expect(screen.getByRole('heading', { level: 3, name: /AI 分析/ })).toBeTruthy();
    expect(screen.getByText('生成分析')).toBeTruthy();
  });

  it('calls onToggle when close button clicked', async () => {
    const onToggle = vi.fn();
    render(
      <AiAnalysisPanel summary={mockSummary} selectedDate="2026-05-21" open={true} onToggle={onToggle} />,
    );
    await userEvent.click(screen.getByLabelText('收起面板'));
    expect(onToggle).toHaveBeenCalled();
  });

  it('shows settings warning when API key not configured', () => {
    render(
      <AiAnalysisPanel summary={mockSummary} selectedDate="2026-05-21" open={true} onToggle={() => {}} />,
    );
    expect(screen.getByText('（未配置）')).toBeTruthy();
  });

  it('disables generate button when API key is empty', () => {
    render(
      <AiAnalysisPanel summary={mockSummary} selectedDate="2026-05-21" open={true} onToggle={() => {}} />,
    );
    expect(screen.getByText('生成分析').closest('button')?.disabled).toBe(true);
  });
});
