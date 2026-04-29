import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WaveformCanvas } from './WaveformCanvas';

const context = {
  beginPath: vi.fn(),
  clearRect: vi.fn(),
  lineTo: vi.fn(),
  moveTo: vi.fn(),
  scale: vi.fn(),
  stroke: vi.fn(),
  strokeStyle: '',
  lineWidth: 1,
};

describe('WaveformCanvas', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 400,
      height: 180,
      top: 0,
      right: 400,
      bottom: 180,
      left: 0,
      toJSON: () => ({}),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders an accessible canvas label and sample count', () => {
    render(<WaveformCanvas label="flow" values={new Uint8Array([1, 2, 3])} sampleRateHz={80} />);

    expect(screen.getByLabelText('flow waveform')).toBeInTheDocument();
    expect(screen.getByText('3 samples · 80 Hz')).toBeInTheDocument();
  });
});
