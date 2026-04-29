import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { DatasetIndex } from '../types';
import { DateNavigator } from './DateNavigator';

const index: DatasetIndex = {
  days: ['2026-04-27', '2026-04-28', '2026-04-29'],
  dateRange: { start: '2026-04-27', end: '2026-04-29' },
  filesByDay: {},
  warnings: [],
  summariesByDay: {
    '2026-04-27': {
      date: '2026-04-27',
      startTime: null,
      endTime: null,
      useDurationSeconds: null,
      eventCounts: { hi: 3 },
      signalPresence: {},
      sampleCounts: {},
      pressureRange: null,
      missingFiles: ['flow'],
      warnings: [],
    },
    '2026-04-28': {
      date: '2026-04-28',
      startTime: null,
      endTime: null,
      useDurationSeconds: null,
      eventCounts: { hi: 6 },
      signalPresence: {},
      sampleCounts: {},
      pressureRange: null,
      missingFiles: [],
      warnings: [],
    },
    '2026-04-29': {
      date: '2026-04-29',
      startTime: null,
      endTime: null,
      useDurationSeconds: null,
      eventCounts: { hi: 8 },
      signalPresence: {},
      sampleCounts: {},
      pressureRange: null,
      missingFiles: [],
      warnings: [],
    },
  },
};

describe('DateNavigator', () => {
  it('jumps to a typed date and moves between available dates', async () => {
    const onSelectDate = vi.fn();
    render(<DateNavigator dataset={index} selectedDate="2026-04-28" onSelectDate={onSelectDate} />);

    await userEvent.clear(screen.getByLabelText('跳转日期'));
    await userEvent.type(screen.getByLabelText('跳转日期'), '2026-04-29');
    await userEvent.click(screen.getByRole('button', { name: '跳转' }));
    await userEvent.click(screen.getByRole('button', { name: '上一天' }));

    expect(onSelectDate).toHaveBeenNthCalledWith(1, '2026-04-29');
    expect(onSelectDate).toHaveBeenNthCalledWith(2, '2026-04-27');
  });
});
