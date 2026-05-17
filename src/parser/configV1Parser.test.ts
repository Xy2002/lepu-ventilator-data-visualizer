import { describe, expect, it } from 'vitest';
import { CONFIG_V1_FIELDS, parseConfigV1 } from './configV1Parser';

describe('CONFIG_V1_FIELDS', () => {
  it('contains the 5 v1-confirmed fields with the expected offsets and types', () => {
    const byName = Object.fromEntries(CONFIG_V1_FIELDS.map((f) => [f.name, f]));

    expect(byName.high_pressure_alarm).toMatchObject({
      offset: 16,
      size: 2,
      type: 'uint16LE',
      scale: 0.1,
      unit: 'cmH2O',
      status: 'confirmed',
    });
    expect(byName.epap_max).toMatchObject({ offset: 132, type: 'float32LE', status: 'confirmed' });
    expect(byName.epap_min).toMatchObject({ offset: 136, type: 'float32LE', status: 'confirmed' });
    expect(byName.pressure_support).toMatchObject({ offset: 140, type: 'float32LE', status: 'confirmed' });
    expect(byName.backlight_seconds).toMatchObject({ offset: 169, size: 1, type: 'uint8', status: 'confirmed' });
  });

  it('every field stays within the 192-byte payload', () => {
    for (const f of CONFIG_V1_FIELDS) {
      expect(f.offset).toBeGreaterThanOrEqual(0);
      expect(f.offset + f.size).toBeLessThanOrEqual(192);
    }
  });

  it('field names are unique', () => {
    const names = CONFIG_V1_FIELDS.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('parseConfigV1 input handling', () => {
  it('throws when the buffer is shorter than 192 bytes', () => {
    expect(() => parseConfigV1(new Uint8Array(191))).toThrow(/192 bytes/);
  });

  it('accepts an ArrayBuffer', () => {
    const buf = new ArrayBuffer(192);
    const result = parseConfigV1(buf);
    expect(result.raw).toBeInstanceOf(Uint8Array);
    expect(result.raw.byteLength).toBe(192);
  });

  it('returns the original bytes as raw', () => {
    const bytes = new Uint8Array(192);
    bytes[16] = 0xfa;
    bytes[17] = 0x00;
    const result = parseConfigV1(bytes);
    expect(result.raw[16]).toBe(0xfa);
    expect(result.raw[17]).toBe(0x00);
  });
});
