import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { ImportedFileRef, DatasetIndex } from '../types';
import {
  buildManifest,
  manifestMatches,
  saveParsedDataset,
  loadParsedDataset,
} from './parsedCache';

function fileRef(path: string, size = 100, lastModified = 1000): ImportedFileRef {
  const name = path.split('/').pop() ?? path;
  return {
    name,
    path,
    file: new File([new Uint8Array(size)], name, { type: 'application/octet-stream', lastModified }),
  };
}

function makeIndex(overrides?: Partial<DatasetIndex>): DatasetIndex {
  return {
    days: ['2026-04-28'],
    dateRange: { start: '2026-04-28', end: '2026-04-28' },
    filesByDay: { '2026-04-28': [] },
    summariesByDay: {
      '2026-04-28': {
        date: '2026-04-28',
        startTime: null,
        endTime: null,
        useDurationSeconds: null,
        useSessions: [],
        eventCounts: {},
        signalPresence: { flow: false, pressure: false, real_pres: false, real_flow: false },
        sampleCounts: {},
        pressureRange: null,
        missingFiles: ['flow', 'pressure', 'real_pres', 'real_flow'],
        warnings: [],
      },
    },
    parsedFilesByDay: {
      '2026-04-28': [
        {
          fileName: 'test.edf',
          kind: 'waveform_u8',
          header: {
            version: '0',
            patientId: '',
            recordingId: '',
            startTime: null,
            endTime: null,
            headerBytes: 512,
            firmware: '',
            field236: '',
            field244: '',
            signalCount: null,
            label: 'flow',
            physicalDimension: '',
            physicalMin: '',
            physicalMax: '',
            digitalMin: '',
            digitalMax: '',
            sampleIntervalMs: null,
            sampleRateHz: null,
          },
          payloadBytes: 3,
          values: new Uint8Array([20, 19, 17]),
          records: [],
          rawPayload: new Uint8Array([20, 19, 17]),
          warnings: [],
        },
      ],
    },
    warnings: [],
    ...overrides,
  };
}

describe('parsedCache', () => {
  afterEach(async () => {
    const dbs = await indexedDB.databases();
    for (const db of dbs) {
      if (db.name?.startsWith('ventilator-parsed')) {
        indexedDB.deleteDatabase(db.name);
      }
    }
  });

  describe('buildManifest', () => {
    it('sorts files by path and extracts metadata', () => {
      const files = [fileRef('b/path.edf', 200, 2000), fileRef('a/path.edf', 100, 1000)];
      const manifest = buildManifest(files);

      expect(manifest).toEqual([
        { path: 'a/path.edf', lastModified: 1000, size: 100 },
        { path: 'b/path.edf', lastModified: 2000, size: 200 },
      ]);
    });

    it('falls back to name when path is empty', () => {
      const files = [fileRef('test.edf')];
      files[0] = { ...files[0], path: '' };
      const manifest = buildManifest(files);

      expect(manifest[0].path).toBe('test.edf');
    });
  });

  describe('manifestMatches', () => {
    it('returns true when manifests are identical', () => {
      const files = [fileRef('a.edf', 100, 1000), fileRef('b.edf', 200, 2000)];
      const manifest = buildManifest(files);

      expect(manifestMatches(manifest, files)).toBe(true);
    });

    it('returns false when file count differs', () => {
      const files = [fileRef('a.edf', 100, 1000)];
      const manifest = buildManifest([fileRef('a.edf', 100, 1000), fileRef('b.edf', 200, 2000)]);

      expect(manifestMatches(manifest, files)).toBe(false);
    });

    it('returns false when lastModified differs', () => {
      const files = [fileRef('a.edf', 100, 999)];
      const manifest = buildManifest([fileRef('a.edf', 100, 1000)]);

      expect(manifestMatches(manifest, files)).toBe(false);
    });

    it('returns false when size differs', () => {
      const files = [fileRef('a.edf', 999, 1000)];
      const manifest = buildManifest([fileRef('a.edf', 100, 1000)]);

      expect(manifestMatches(manifest, files)).toBe(false);
    });

    it('returns false when path differs', () => {
      const files = [fileRef('other.edf', 100, 1000)];
      const manifest = buildManifest([fileRef('a.edf', 100, 1000)]);

      expect(manifestMatches(manifest, files)).toBe(false);
    });
  });

  describe('saveParsedDataset / loadParsedDataset', () => {
    it('round-trips a DatasetIndex with typed arrays preserved', async () => {
      const files = [fileRef('DATAFILE/20260428/20260428_flow.edf', 515, 1000)];
      const index = makeIndex();

      await saveParsedDataset(files, index);
      const loaded = await loadParsedDataset(files);

      expect(loaded).not.toBeNull();
      expect(loaded!.days).toEqual(['2026-04-28']);
      expect(loaded!.summariesByDay['2026-04-28'].date).toBe('2026-04-28');

      const parsed = loaded!.parsedFilesByDay['2026-04-28'];
      expect(parsed).toHaveLength(1);
      expect(parsed[0].kind).toBe('waveform_u8');
      expect(parsed[0].values).toBeInstanceOf(Uint8Array);
      expect(Array.from(parsed[0].values as Uint8Array)).toEqual([20, 19, 17]);
      expect(parsed[0].rawPayload).toBeInstanceOf(Uint8Array);
      expect(Array.from(parsed[0].rawPayload)).toEqual([20, 19, 17]);
    });

    it('returns null when no cache exists', async () => {
      const files = [fileRef('a.edf')];
      const loaded = await loadParsedDataset(files);

      expect(loaded).toBeNull();
    });

    it('returns null when manifest does not match', async () => {
      const files = [fileRef('DATAFILE/20260428/20260428_flow.edf', 515, 1000)];
      const index = makeIndex();
      await saveParsedDataset(files, index);

      const changedFiles = [fileRef('DATAFILE/20260428/20260428_flow.edf', 515, 9999)];
      const loaded = await loadParsedDataset(changedFiles);

      expect(loaded).toBeNull();
    });

    it('returns null for empty file list', async () => {
      const loaded = await loadParsedDataset([]);

      expect(loaded).toBeNull();
    });

    it('overwrites previous cache on save', async () => {
      const files = [fileRef('DATAFILE/20260428/20260428_flow.edf', 515, 1000)];
      await saveParsedDataset(files, makeIndex());

      const base = makeIndex();
      const newIndex = makeIndex({
        days: ['2026-04-29'],
        parsedFilesByDay: { '2026-04-29': base.parsedFilesByDay['2026-04-28'] },
        summariesByDay: { '2026-04-29': { ...base.summariesByDay['2026-04-28'], date: '2026-04-29' } },
        warnings: ['new warning'],
      });
      await saveParsedDataset(files, newIndex);

      const loaded = await loadParsedDataset(files);
      expect(loaded!.days).toEqual(['2026-04-29']);
      expect(loaded!.warnings).toEqual(['new warning']);
    });

    it('preserves Uint16Array and Int16Array typed arrays', async () => {
      const files = [fileRef('DATAFILE/20260428/20260428_pressure.edf', 516, 1000)];
      const index = makeIndex({
        parsedFilesByDay: {
          '2026-04-28': [
            {
              fileName: 'pressure.edf',
              kind: 'waveform_u16le',
              header: makeIndex().parsedFilesByDay['2026-04-28'][0].header,
              payloadBytes: 4,
              values: new Uint16Array([100, 200]),
              records: [],
              rawPayload: new Uint8Array([100, 0, 200, 0]),
              warnings: [],
            },
            {
              fileName: 'real_flow.edf',
              kind: 'waveform_i16le',
              header: makeIndex().parsedFilesByDay['2026-04-28'][0].header,
              payloadBytes: 4,
              values: new Int16Array([-100, 200]),
              records: [],
              rawPayload: new Uint8Array([156, 255, 200, 0]),
              warnings: [],
            },
          ],
        },
      });

      await saveParsedDataset(files, index);
      const loaded = await loadParsedDataset(files);

      const parsed = loaded!.parsedFilesByDay['2026-04-28'];
      expect(parsed[0].values).toBeInstanceOf(Uint16Array);
      expect(Array.from(parsed[0].values as Uint16Array)).toEqual([100, 200]);
      expect(parsed[1].values).toBeInstanceOf(Int16Array);
      expect(Array.from(parsed[1].values as Int16Array)).toEqual([-100, 200]);
    });

    it('reconstructs filesByDay from loaded files', async () => {
      const files = [
        fileRef('DATAFILE/20260428/20260428_flow.edf', 515, 1000),
        fileRef('DATAFILE/20260429/20260429_flow.edf', 515, 1000),
      ];
      const index = makeIndex({
        days: ['2026-04-28', '2026-04-29'],
        dateRange: { start: '2026-04-28', end: '2026-04-29' },
        parsedFilesByDay: {
          '2026-04-28': makeIndex().parsedFilesByDay['2026-04-28'],
          '2026-04-29': makeIndex().parsedFilesByDay['2026-04-28'],
        },
        summariesByDay: {
          '2026-04-28': makeIndex().summariesByDay['2026-04-28'],
          '2026-04-29': { ...makeIndex().summariesByDay['2026-04-28'], date: '2026-04-29' },
        },
      });

      await saveParsedDataset(files, index);
      const loaded = await loadParsedDataset(files);

      expect(Object.keys(loaded!.filesByDay).sort()).toEqual(['2026-04-28', '2026-04-29']);
      expect(loaded!.filesByDay['2026-04-28']).toHaveLength(1);
      expect(loaded!.filesByDay['2026-04-29']).toHaveLength(1);
    });
  });
});
