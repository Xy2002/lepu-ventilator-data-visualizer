import { describe, expect, it } from 'vitest';
import { makeEdfLikeFile, makeEventPayload } from '../parser/fixtures';
import type { ImportedFileRef } from '../types';
import { buildDatasetIndex, filterDays, loadDayDetail } from './dataset';

function imported(path: string, label: string, payload: Uint8Array): ImportedFileRef {
  const segments = path.split('/');
  const name = segments[segments.length - 1] ?? path;
  const bytes = makeEdfLikeFile(label, payload);
  const file = new File([bytes], name);

  if (typeof file.arrayBuffer !== 'function') {
    Object.defineProperty(file, 'arrayBuffer', {
      value: () => Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
    });
  }

  return {
    name,
    path,
    file,
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
  it('buildDatasetIndex groups imported files by date and computes summaries', async () => {
    const index = await buildDatasetIndex(makeImportedFiles());

    expect(index.days).toEqual(['2026-04-28', '2026-04-29']);
    expect(index.summariesByDay['2026-04-29'].eventCounts.hi).toBe(1);
    expect(index.summariesByDay['2026-04-29'].sampleCounts.flow).toBe(3);
    expect(index.summariesByDay['2026-04-29'].pressureRange).toEqual({ min: 1, max: 9 });
  });

  it('filterDays filters by range, event presence, and missing files', async () => {
    const index = await buildDatasetIndex(makeImportedFiles());

    expect(filterDays(index, { startDate: '2026-04-29', endDate: '2026-04-29' })).toEqual([
      '2026-04-29',
    ]);
    expect(filterDays(index, { requireEvent: 'hi' })).toEqual(['2026-04-29']);
    expect(filterDays(index, { missingFilesOnly: true })).toEqual(['2026-04-28', '2026-04-29']);
    expect(filterDays(index, { requireEvent: 'ascp' })).toEqual([]);
  });

  it('buildDatasetIndex falls back to the file name when a browser file has no relative path', async () => {
    const file = imported('20260430_flow.edf', 'flow', new Uint8Array([1]));
    const index = await buildDatasetIndex([{ ...file, path: '' }]);

    expect(index.days).toEqual(['2026-04-30']);
    expect(index.warnings).toEqual([]);
  });

  it('loadDayDetail loads selected day, returns signal labels, event count, and rawFiles count', async () => {
    const index = await buildDatasetIndex(makeImportedFiles());

    const detail = await loadDayDetail(index, '2026-04-29');

    expect(detail.signals.map((file) => file.header.label)).toEqual(['flow', 'pressure']);
    expect(detail.events).toHaveLength(1);
    expect(detail.events[0].secondsFromDayStart).toBeCloseTo(88.65);
    expect(detail.rawFiles.map((file) => file.header.label)).toEqual(['flow', 'pressure', 'hi', 'mystery']);
  });
});
