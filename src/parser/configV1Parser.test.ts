import { describe, expect, it } from 'vitest';
import { CONFIG_V1_FIELDS, parseConfigV1, summarizeConfirmed } from './configV1Parser';
import {
  CONFIG_V1_FIXTURE_BYTES,
  CONFIG_V2_FIXTURE_BYTES,
  CONFIG_V3_FIXTURE_BYTES,
} from './configV1Fixtures';

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

describe('parseConfigV1 primitive reading', () => {
  function makeBuffer(): Uint8Array {
    const b = new Uint8Array(192);
    // high_pressure_alarm @ offset 16 uint16LE = 250 (0x00FA) -> value 25.0 after scale 0.1
    b[16] = 0xfa;
    b[17] = 0x00;
    // backlight_seconds @ offset 169 uint8 = 60
    b[169] = 60;
    // epap_max @ offset 132 float32LE = 14.0 -> 0x41600000 LE = 00 00 60 41
    b[132] = 0x00; b[133] = 0x00; b[134] = 0x60; b[135] = 0x41;
    return b;
  }

  it('reads uint8 fields', () => {
    const r = parseConfigV1(makeBuffer());
    const bl = r.byName.backlight_seconds;
    expect(bl.raw).toBe(60);
    expect(bl.value).toBe(60);
  });

  it('reads uint16LE fields and applies scale', () => {
    const r = parseConfigV1(makeBuffer());
    const hp = r.byName.high_pressure_alarm;
    expect(hp.raw).toBe(250);
    expect(hp.value).toBeCloseTo(25.0, 5);
  });

  it('reads float32LE fields', () => {
    const r = parseConfigV1(makeBuffer());
    const epap = r.byName.epap_max;
    expect(epap.raw).toBeCloseTo(14.0, 5);
    expect(epap.value).toBeCloseTo(14.0, 5);
  });

  it('produces fields in the same order as CONFIG_V1_FIELDS', () => {
    const r = parseConfigV1(new Uint8Array(192));
    expect(r.fields.length).toBe(CONFIG_V1_FIELDS.length);
    for (let i = 0; i < CONFIG_V1_FIELDS.length; i++) {
      expect(r.fields[i].spec.name).toBe(CONFIG_V1_FIELDS[i].name);
    }
  });

  it('byName indexes all field names', () => {
    const r = parseConfigV1(new Uint8Array(192));
    for (const f of CONFIG_V1_FIELDS) {
      expect(r.byName[f.name]).toBeDefined();
      expect(r.byName[f.name].spec).toBe(f);
    }
  });
});

describe('parseConfigV1 on the v1 fixture', () => {
  it('fixture is exactly 192 bytes', () => {
    expect(CONFIG_V1_FIXTURE_BYTES.byteLength).toBe(192);
  });

  it('decodes the 5 confirmed fields to their recorded UI values', () => {
    const r = parseConfigV1(CONFIG_V1_FIXTURE_BYTES);

    expect(r.byName.high_pressure_alarm.raw).toBe(250);
    expect(r.byName.high_pressure_alarm.value).toBeCloseTo(25.0, 5);

    expect(r.byName.epap_max.value).toBeCloseTo(14.0, 5);
    expect(r.byName.epap_min.value).toBeCloseTo(7.0, 5);
    expect(r.byName.pressure_support.value).toBeCloseTo(3.0, 5);

    expect(r.byName.backlight_seconds.value).toBe(60);
  });
});

describe('summarizeConfirmed', () => {
  it('returns confirmed fields in spec order with display-ready values', () => {
    const r = parseConfigV1(CONFIG_V1_FIXTURE_BYTES);
    const summary = summarizeConfirmed(r);
    expect(summary.map((s) => s.name)).toEqual([
      'high_pressure_alarm',
      'epap_max',
      'epap_min',
      'pressure_support',
      'backlight_seconds',
      'payload_xor_checksum',
    ]);
    expect(summary[0]).toMatchObject({
      label: '高吸气压力报警',
      value: 25.0,
      unit: 'cmH2O',
    });
    expect(summary[4]).toMatchObject({
      label: '背光秒数',
      value: 60,
      unit: 's',
    });
  });
});

describe('Round 2: v1 vs v2 diff verification', () => {
  it('all three fixtures (v1, v2, v3) pass the XOR checksum at offset 191', () => {
    for (const fixture of [CONFIG_V1_FIXTURE_BYTES, CONFIG_V2_FIXTURE_BYTES, CONFIG_V3_FIXTURE_BYTES]) {
      let xor = 0;
      for (let i = 0; i < 191; i++) xor ^= fixture[i];
      expect(xor).toBe(fixture[191]);
    }
  });

  it('humidifier_level changes from 1 to 3 (matches UI)', () => {
    expect(parseConfigV1(CONFIG_V1_FIXTURE_BYTES).byName.humidifier_level.value).toBe(1);
    expect(parseConfigV1(CONFIG_V2_FIXTURE_BYTES).byName.humidifier_level.value).toBe(3);
  });

  it('rise_rate changes from 2 to 3 (matches UI)', () => {
    expect(parseConfigV1(CONFIG_V1_FIXTURE_BYTES).byName.rise_rate.value).toBe(2);
    expect(parseConfigV1(CONFIG_V2_FIXTURE_BYTES).byName.rise_rate.value).toBe(3);
  });

  it('only the 6 expected bytes differ between v1 and v2 fixtures', () => {
    const diffOffsets: number[] = [];
    for (let i = 0; i < 192; i++) {
      if (CONFIG_V1_FIXTURE_BYTES[i] !== CONFIG_V2_FIXTURE_BYTES[i]) diffOffsets.push(i);
    }
    expect(diffOffsets).toEqual([98, 103, 105, 106, 109, 191]);
  });
});

describe('Round 3: v2 vs v3 disambiguation', () => {
  it('only the 3 expected bytes differ between v2 and v3 fixtures', () => {
    const diffOffsets: number[] = [];
    for (let i = 0; i < 192; i++) {
      if (CONFIG_V2_FIXTURE_BYTES[i] !== CONFIG_V3_FIXTURE_BYTES[i]) diffOffsets.push(i);
    }
    expect(diffOffsets).toEqual([103, 109, 191]);
  });

  it('ipap_sensitivity changes 1 -> 2 (offset 103, matches UI)', () => {
    expect(parseConfigV1(CONFIG_V2_FIXTURE_BYTES).byName.ipap_sensitivity.value).toBe(1);
    expect(parseConfigV1(CONFIG_V3_FIXTURE_BYTES).byName.ipap_sensitivity.value).toBe(2);
  });

  it('epap_sensitivity changes 1 -> 3 (offset 109, matches UI)', () => {
    expect(parseConfigV1(CONFIG_V2_FIXTURE_BYTES).byName.epap_sensitivity.value).toBe(1);
    expect(parseConfigV1(CONFIG_V3_FIXTURE_BYTES).byName.epap_sensitivity.value).toBe(3);
  });

  it('fall_rate stays at 1 (offset 106 unchanged; identifies it by elimination)', () => {
    expect(parseConfigV1(CONFIG_V2_FIXTURE_BYTES).byName.fall_rate.value).toBe(1);
    expect(parseConfigV1(CONFIG_V3_FIXTURE_BYTES).byName.fall_rate.value).toBe(1);
  });

  it('payload_xor_checksum cycles 0xB7 -> 0xB6 -> 0xB7 across v1/v2/v3', () => {
    expect(parseConfigV1(CONFIG_V1_FIXTURE_BYTES).byName.payload_xor_checksum.value).toBe(0xb7);
    expect(parseConfigV1(CONFIG_V2_FIXTURE_BYTES).byName.payload_xor_checksum.value).toBe(0xb6);
    expect(parseConfigV1(CONFIG_V3_FIXTURE_BYTES).byName.payload_xor_checksum.value).toBe(0xb7);
  });
});
