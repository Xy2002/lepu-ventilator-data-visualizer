import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EventTable } from './EventTable';

describe('EventTable', () => {
  it('renders events and reports selected event seconds', async () => {
    const onSelect = vi.fn();
    render(
      <EventTable
        events={[
          {
            sourceLabel: 'hi',
            value1: 1,
            value2: 15,
            timestamp: '2026-04-29 03:04:41.22',
            secondsFromDayStart: 89.65,
          },
        ]}
        onSelectEvent={onSelect}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /hi/ }));

    expect(screen.getByText('2026-04-29 03:04:41.22')).toBeInTheDocument();
    expect(onSelect).toHaveBeenCalledWith(89.65, '2026-04-29 03:04:41.22');
  });
});
