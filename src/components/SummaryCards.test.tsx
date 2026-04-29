import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SummaryCards } from './SummaryCards';

describe('SummaryCards', () => {
  it('renders daily summary metrics', () => {
    render(
      <SummaryCards
        summary={{
          date: '2026-04-29',
          startTime: '2026-04-29 03:03:12.57',
          endTime: '2026-04-29 03:13:47.48',
          useDurationSeconds: 634.91,
          eventCounts: { ai: 28, hi: 8, ascp: 301 },
          signalPresence: {},
          sampleCounts: { flow: 283224 },
          pressureRange: { min: 0, max: 151 },
          missingFiles: [],
          warnings: [],
        }}
      />,
    );

    expect(screen.getByText('10:34')).toBeInTheDocument();
    expect(screen.getByText('28 / 8')).toBeInTheDocument();
    expect(screen.getByText('0 - 151')).toBeInTheDocument();
  });
});
