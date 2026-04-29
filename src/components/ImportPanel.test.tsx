import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ImportPanel } from './ImportPanel';

describe('ImportPanel', () => {
  it('passes selected files to the importer', async () => {
    const onImport = vi.fn();
    render(<ImportPanel onImport={onImport} disabled={false} />);
    const file = new File([new Uint8Array([1, 2, 3])], '20260429_flow.edf');

    await userEvent.upload(screen.getByLabelText('选择 EDF 文件'), file);

    expect(onImport).toHaveBeenCalledWith([
      expect.objectContaining({
        name: '20260429_flow.edf',
        path: '20260429_flow.edf',
        file,
      }),
    ]);
  });
});
