import { describe, expect, it } from 'vitest';
import { makeEdfLikeFile, makeEventPayload } from './fixtures';
import { parseVentilatorFile } from './edfParser';

describe('parseVentilatorFile', () => {
  it('parses flow header metadata and unsigned 8-bit values', () => {
    const file = makeEdfLikeFile('flow', new Uint8Array([20, 19, 17, 15]), {
      field244: '80',
    });

    const parsed = parseVentilatorFile('20260429_flow.edf', file);

    expect(parsed.header.version).toBe('V2.12');
    expect(parsed.header.patientId).toBe('20393753523050090042004d');
    expect(parsed.header.startTime).toBe('2026-04-29 03:03:12.57');
    expect(parsed.header.endTime).toBe('2026-04-29 03:13:47.48');
    expect(parsed.header.label).toBe('flow');
    expect(parsed.header.headerBytes).toBe(512);
    expect(parsed.header.sampleRateHz).toBe(80);
    expect(parsed.kind).toBe('waveform_u8');
    expect(Array.from(parsed.values)).toEqual([20, 19, 17, 15]);
  });

  it('parses pressure as little-endian unsigned 16-bit values', () => {
    const payload = new Uint8Array([1, 0, 151, 0]);
    const file = makeEdfLikeFile('pressure', payload);

    const parsed = parseVentilatorFile('20260429_pressure.edf', file);

    expect(parsed.kind).toBe('waveform_u16le');
    expect(parsed.header.sampleRateHz).toBe(80);
    expect(Array.from(parsed.values)).toEqual([1, 151]);
  });

  it('parses real_flow as little-endian signed 16-bit values', () => {
    const payload = new Uint8Array([255, 255, 187, 255, 79, 0]);
    const file = makeEdfLikeFile('real_flow', payload);

    const parsed = parseVentilatorFile('20260429_real_flow.edf', file);

    expect(parsed.kind).toBe('waveform_i16le');
    expect(parsed.header.sampleRateHz).toBe(80);
    expect(Array.from(parsed.values)).toEqual([-1, -69, 79]);
  });

  it('parses 16-byte event records for hi', () => {
    const file = makeEdfLikeFile('hi', makeEventPayload(1, 15), { field244: '0' });

    const parsed = parseVentilatorFile('20260429_hi.edf', file);

    expect(parsed.kind).toBe('events16');
    expect(parsed.header.sampleRateHz).toBeNull();
    expect(parsed.records).toEqual([
      {
        sourceLabel: 'hi',
        value1: 1,
        value2: 15,
        timestamp: '2026-04-29 03:04:41.22',
      },
    ]);
  });

  it('parses mvtvbr three-value records and warns about trailing bytes', () => {
    const file = makeEdfLikeFile('mvtvbr', new Uint8Array([1, 0, 2, 0, 3, 0, 9]));

    const parsed = parseVentilatorFile('20260429_mvtvbr.edf', file);

    expect(parsed.kind).toBe('triples_u16le');
    expect(parsed.records).toEqual([{ value1: 1, value2: 2, value3: 3 }]);
    expect(parsed.warnings).toContain('Ignored 1 trailing payload byte');
  });
});
