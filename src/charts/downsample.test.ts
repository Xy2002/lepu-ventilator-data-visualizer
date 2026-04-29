import { describe, expect, it } from 'vitest';
import { downsampleMinMax } from './downsample';

describe('downsampleMinMax', () => {
  it('returns all points when data fits pixel budget', () => {
    expect(downsampleMinMax(new Uint8Array([1, 3, 2]), 0, 3, 10)).toEqual([
      { index: 0, value: 1 },
      { index: 1, value: 3 },
      { index: 2, value: 2 },
    ]);
  });

  it('preserves min and max within buckets', () => {
    expect(downsampleMinMax(new Uint8Array([1, 9, 2, 8, 3, 7]), 0, 6, 2)).toEqual([
      { index: 0, value: 1 },
      { index: 1, value: 9 },
      { index: 3, value: 8 },
      { index: 4, value: 3 },
    ]);
  });
});
