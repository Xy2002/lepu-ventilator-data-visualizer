import { describe, expect, it } from 'vitest';
import { makeEdfLikeFile, makeEventPayload } from '../parser/fixtures';
import type { ImportedFileRef } from '../types';
import { buildDatasetIndex, filterDays, loadDayDetail } from './dataset';

function imported(path: string, label: string, payload: Uint8Array): ImportedFileRef {
  const segments = path.split('/');
  return {
    name: segments[segments.length - 1] ?? path,
    path,
    file: makeEdfLikeFile(label, payload) as unknown as File,
  };
}

function makeImportedFiles() {
  return [
    imported('DATAFILE/20260429/20260429_flow.edf', 'flow', new Uint8Array([20, 19, 17])),
    imported('DATAFILE/20260429/20260429_pressure.edf', 'pressure', new Uint8Array([1, 0, 9, 0])),
    imported('DATAFILE/20260429/20260429_hi.edf', 'hi', makeEventPayload(1, 15)),
    imported('DATAFILE/20260429/20260429_mystery.edf', 'mystery', new Uint8Array([7, 8])),
    imported('DATAFILE/20260428/20260428_pressure.edf', 'pressure', new Uint8Array([2, 0, 6, 0])),
  ];
}

describe('dataset indexing', () => {
  it('buildDatasetIndex groups imported files by date and computes summaries', () => {
    const index = buildDatasetIndex(makeImportedFiles());

    expect(index.days).toEqual(['2026-04-28', '2026-04-29']);
    expect(index.summariesByDay['2026-04-29'].eventCounts.hi).toBe(1);
    expect(index.summariesByDay['2026-04-29'].sampleCounts.flow).toBe(3);
    expect(index.summariesByDay['2026-04-29'].pressureRange).toEqual({ min: 1, max: 9 });
  });

  it('filterDays filters by range, event presence, and missing files', () => {
    const index = buildDatasetIndex(makeImportedFiles());

    expect(filterDays(index, { startDate: '2026-04-29', endDate: '2026-04-29' })).toEqual([
      '2026-04-29',
    ]);
    expect(filterDays(index, { requireEvent: 'hi' })).toEqual(['2026-04-29']);
    expect(filterDays(index, { missingFilesOnly: true })).toEqual(['2026-04-28', '2026-04-29']);
    expect(filterDays(index, { requireEvent: 'ascp' })).toEqual([]);
  });

  it('loadDayDetail loads selected day, returns signal labels, event count, and rawFiles count', () => {
    const index = buildDatasetIndex(makeImportedFiles());

    const detail = loadDayDetail(index, '2026-04-29');

    expect(detail.signals.map((file) => file.header.label)).toEqual(['flow', 'pressure']);
    expect(detail.events).toHaveLength(1);
    expect(detail.events[0].secondsFromDayStart).toBeCloseTo(11081.22);
    expect(detail.rawFiles).toHaveLength(1);
  });
});
