import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventRecord } from '../types';
import { EventTable } from './EventTable';

afterEach(cleanup);

const baseEvent: EventRecord = {
  sourceLabel: 'hi',
  value1: 1,
  value2: 15,
  timestamp: '2026-04-29 03:04:41',
  secondsFromDayStart: 89.65,
};

describe('EventTable', () => {
  it('renders events and reports selected event seconds', async () => {
    const onSelect = vi.fn();
    render(<EventTable events={[baseEvent]} onSelectEvent={onSelect} />);

    await userEvent.click(screen.getByText('定位'));

    expect(onSelect).toHaveBeenCalledWith(89.65, '2026-04-29 03:04:41');
  });

  it('shows filter tabs with counts', () => {
    const events: EventRecord[] = [
      { ...baseEvent, sourceLabel: 'ai', value2: 22, timestamp: '2026-04-29 02:31:32' },
      { ...baseEvent, sourceLabel: 'ai', value2: 16, timestamp: '2026-04-29 02:32:53' },
      { ...baseEvent, sourceLabel: 'hi', value2: 15, timestamp: '2026-04-29 03:04:41' },
      { ...baseEvent, sourceLabel: 'ascp', value1: 141, value2: 101, timestamp: '2026-04-29 02:31:32' },
    ];

    render(<EventTable events={events} onSelectEvent={vi.fn()} />);

    // Tabs use role="tab" in HeroUI
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBeGreaterThanOrEqual(4);
  });

  it('shows type-specific columns when filtering by AI', async () => {
    const events: EventRecord[] = [
      { ...baseEvent, sourceLabel: 'ai', value2: 22, timestamp: '2026-04-29 02:31:32' },
      { ...baseEvent, sourceLabel: 'ascp', value1: 141, value2: 101, timestamp: '2026-04-29 02:32:00' },
    ];

    render(<EventTable events={events} onSelectEvent={vi.fn()} />);

    // Click AI filter tab (HeroUI Tab uses tab role)
    const aiTab = screen.getByRole('tab', { name: /^AI/ });
    await userEvent.click(aiTab);

    // AI events show duration
    expect(screen.getByText('22秒')).toBeTruthy();
    // ASCP event should not be visible
    expect(screen.queryByText(/cmH2O/)).not.toBeTruthy();
  });

  it('shows IPAP/EPAP columns when filtering by ASCP', async () => {
    const events: EventRecord[] = [
      { ...baseEvent, sourceLabel: 'ascp', value1: 150, value2: 110, timestamp: '2026-04-29 02:31:32' },
    ];

    render(<EventTable events={events} onSelectEvent={vi.fn()} />);

    const ascpTab = screen.getByRole('tab', { name: /^ASCP/ });
    await userEvent.click(ascpTab);

    expect(screen.getByText('15.0')).toBeTruthy();
    expect(screen.getByText('11.0')).toBeTruthy();
  });

  it('shows duration for usetime events', () => {
    const events: EventRecord[] = [
      { ...baseEvent, sourceLabel: 'usetime', value1: 19307, value2: 0, timestamp: '2026-04-29 07:45:38' },
    ];

    render(<EventTable events={events} onSelectEvent={vi.fn()} />);

    // In "all" view, detail shows formatted duration
    expect(screen.getByText(/5h 21m/)).toBeTruthy();
  });

  it('shows unified detail column in "all" view', () => {
    const events: EventRecord[] = [
      { ...baseEvent, sourceLabel: 'ai', value2: 22, timestamp: '2026-04-29 02:31:32' },
      { ...baseEvent, sourceLabel: 'ascp', value1: 141, value2: 101, timestamp: '2026-04-29 02:32:00' },
    ];

    render(<EventTable events={events} onSelectEvent={vi.fn()} />);

    // Detail column shows type-specific summary
    expect(screen.getByText(/持续 22秒/)).toBeTruthy();
    expect(screen.getByText(/IPAP 14\.1/)).toBeTruthy();
  });
});
