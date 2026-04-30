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
    expect(parsed.header.startTime).toBe('2026-04-29 03:12:57');
    expect(parsed.header.endTime).toBe('2026-04-29 13:47:48');
    expect(parsed.header.label).toBe('flow');
    expect(parsed.header.headerBytes).toBe(512);
    expect(parsed.header.sampleIntervalMs).toBe(80);
    expect(parsed.header.sampleRateHz).toBe(12.5);
    expect(parsed.kind).toBe('waveform_u8');
    expect(Array.from(parsed.values)).toEqual([20, 19, 17, 15]);
  });

  it('returns null sample rate for malformed flow sample rate fields', () => {
    const file = makeEdfLikeFile('flow', new Uint8Array([20]), { field244: '80Hz' });

    const parsed = parseVentilatorFile('20260429_flow.edf', file);

    expect(parsed.header.sampleRateHz).toBeNull();
  });

  it('falls back to 512 and warns when the header byte field is malformed', () => {
    const file = makeEdfLikeFile('flow', new Uint8Array([20, 19, 17, 15]), {
      headerBytes: '512abc',
    });

    const parsed = parseVentilatorFile('20260429_flow.edf', file);

    expect(parsed.header.headerBytes).toBe(512);
    expect(Array.from(parsed.values)).toEqual([20, 19, 17, 15]);
    expect(parsed.warnings).toContain('Invalid header byte count "512abc"; using 512');
  });

  it('falls back to 512 and warns when the header byte field is numeric but invalid', () => {
    const file = makeEdfLikeFile('flow', new Uint8Array([20, 19, 17, 15]), {
      headerBytes: '0',
    });

    const parsed = parseVentilatorFile('20260429_flow.edf', file);

    expect(parsed.header.headerBytes).toBe(512);
    expect(Array.from(parsed.values)).toEqual([20, 19, 17, 15]);
    expect(parsed.warnings).toContain('Invalid header byte count "0"; using 512');
  });

  it('parses pressure as little-endian unsigned 16-bit values', () => {
    const payload = new Uint8Array([1, 0, 151, 0]);
    const file = makeEdfLikeFile('pressure', payload);

    const parsed = parseVentilatorFile('20260429_pressure.edf', file);

    expect(parsed.kind).toBe('waveform_u16le');
    expect(parsed.header.sampleRateHz).toBe(12.5);
    expect(Array.from(parsed.values)).toEqual([1, 151]);
  });

  it('parses real_flow as little-endian signed 16-bit values', () => {
    const payload = new Uint8Array([255, 255, 187, 255, 79, 0]);
    const file = makeEdfLikeFile('real_flow', payload);

    const parsed = parseVentilatorFile('20260429_real_flow.edf', file);

    expect(parsed.kind).toBe('waveform_i16le');
    expect(parsed.header.sampleRateHz).toBe(12.5);
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
        timestamp: '2026-04-29 04:41:22',
      },
    ]);
  });

  it('returns invalid with a warning when the file is shorter than the header', () => {
    const parsed = parseVentilatorFile('short.edf', new Uint8Array(511));

    expect(parsed.kind).toBe('invalid');
    expect(parsed.warnings).toEqual(['File is shorter than 512-byte header']);
  });

  it('maps config labels to raw_config', () => {
    const file = makeEdfLikeFile('config', new Uint8Array([1, 2, 3]));

    const parsed = parseVentilatorFile('20260429_config.edf', file);

    expect(parsed.kind).toBe('raw_config');
  });

  it('maps unknown labels to raw', () => {
    const file = makeEdfLikeFile('mystery', new Uint8Array([1, 2, 3]));

    const parsed = parseVentilatorFile('20260429_mystery.edf', file);

    expect(parsed.kind).toBe('raw');
  });

  it('maps real_pres labels to unsigned 16-bit waveforms', () => {
    const file = makeEdfLikeFile('real_pres', new Uint8Array([1, 0, 2, 0]));

    const parsed = parseVentilatorFile('20260429_real_pres.edf', file);

    expect(parsed.kind).toBe('waveform_u16le');
    expect(Array.from(parsed.values)).toEqual([1, 2]);
  });

  it('maps difleak labels to unsigned 8-bit waveforms', () => {
    const file = makeEdfLikeFile('difleak', new Uint8Array([1, 2, 3]));

    const parsed = parseVentilatorFile('20260429_difleak.edf', file);

    expect(parsed.kind).toBe('waveform_u8');
    expect(Array.from(parsed.values)).toEqual([1, 2, 3]);
  });

  it('warns when event payloads have trailing bytes', () => {
    const payload = new Uint8Array(17);
    payload.set(makeEventPayload(1, 15), 0);
    payload[16] = 9;
    const file = makeEdfLikeFile('hi', payload, { field244: '0' });

    const parsed = parseVentilatorFile('20260429_hi.edf', file);

    expect(parsed.kind).toBe('events16');
    expect(parsed.warnings).toContain('Ignored 1 trailing payload byte');
  });

  it('parses mvtvbr three-value records and warns about trailing bytes', () => {
    const file = makeEdfLikeFile('mvtvbr', new Uint8Array([1, 0, 2, 0, 3, 0, 9]));

    const parsed = parseVentilatorFile('20260429_mvtvbr.edf', file);

    expect(parsed.kind).toBe('triples_u16le');
    expect(parsed.records).toEqual([{ value1: 1, value2: 2, value3: 3 }]);
    expect(parsed.warnings).toContain('Ignored 1 trailing payload byte');
  });
});
