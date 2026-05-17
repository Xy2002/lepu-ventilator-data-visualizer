import { describe, expect, it } from 'vitest';
import { BA525_CONFIG_FIELDS, parseBa525Config, summarizeLocked } from './ba525ConfigParser';
import {
  BA525_SAMPLE_1_BYTES,
  BA525_SAMPLE_2_BYTES,
  BA525_SAMPLE_3_BYTES,
  BA525_SAMPLE_4_BYTES,
  BA525_SAMPLE_5_BYTES,
  BA525_SAMPLE_6_BYTES,
  BA525_SAMPLE_7_BYTES,
  BA525_SAMPLE_8_BYTES,
  BA525_SAMPLE_9_BYTES,
  BA525_SAMPLE_10_BYTES,
  BA525_SAMPLE_11_BYTES,
  BA525_SAMPLE_12_BYTES,
} from './ba525ConfigFixtures';

describe('BA525_CONFIG_FIELDS', () => {
  it('contains the 5 v1-confirmed fields with the expected offsets and types', () => {
    const byName = Object.fromEntries(BA525_CONFIG_FIELDS.map((f) => [f.name, f]));

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
    for (const f of BA525_CONFIG_FIELDS) {
      expect(f.offset).toBeGreaterThanOrEqual(0);
      expect(f.offset + f.size).toBeLessThanOrEqual(192);
    }
  });

  it('field names are unique', () => {
    const names = BA525_CONFIG_FIELDS.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('parseBa525Config input handling', () => {
  it('throws when the buffer is shorter than 192 bytes', () => {
    expect(() => parseBa525Config(new Uint8Array(191))).toThrow(/192 bytes/);
  });

  it('accepts an ArrayBuffer', () => {
    const buf = new ArrayBuffer(192);
    const result = parseBa525Config(buf);
    expect(result.raw).toBeInstanceOf(Uint8Array);
    expect(result.raw.byteLength).toBe(192);
  });

  it('returns the original bytes as raw', () => {
    const bytes = new Uint8Array(192);
    bytes[16] = 0xfa;
    bytes[17] = 0x00;
    const result = parseBa525Config(bytes);
    expect(result.raw[16]).toBe(0xfa);
    expect(result.raw[17]).toBe(0x00);
  });
});

describe('parseBa525Config primitive reading', () => {
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
    const r = parseBa525Config(makeBuffer());
    const bl = r.byName.backlight_seconds;
    expect(bl.raw).toBe(60);
    expect(bl.value).toBe(60);
  });

  it('reads uint16LE fields and applies scale', () => {
    const r = parseBa525Config(makeBuffer());
    const hp = r.byName.high_pressure_alarm;
    expect(hp.raw).toBe(250);
    expect(hp.value).toBeCloseTo(25.0, 5);
  });

  it('reads float32LE fields', () => {
    const r = parseBa525Config(makeBuffer());
    const epap = r.byName.epap_max;
    expect(epap.raw).toBeCloseTo(14.0, 5);
    expect(epap.value).toBeCloseTo(14.0, 5);
  });

  it('produces fields in the same order as BA525_CONFIG_FIELDS', () => {
    const r = parseBa525Config(new Uint8Array(192));
    expect(r.fields.length).toBe(BA525_CONFIG_FIELDS.length);
    for (let i = 0; i < BA525_CONFIG_FIELDS.length; i++) {
      expect(r.fields[i].spec.name).toBe(BA525_CONFIG_FIELDS[i].name);
    }
  });

  it('byName indexes all field names', () => {
    const r = parseBa525Config(new Uint8Array(192));
    for (const f of BA525_CONFIG_FIELDS) {
      expect(r.byName[f.name]).toBeDefined();
      expect(r.byName[f.name].spec).toBe(f);
    }
  });
});

describe('parseBa525Config on the v1 fixture', () => {
  it('fixture is exactly 192 bytes', () => {
    expect(BA525_SAMPLE_1_BYTES.byteLength).toBe(192);
  });

  it('decodes the 5 confirmed fields to their recorded UI values', () => {
    const r = parseBa525Config(BA525_SAMPLE_1_BYTES);

    expect(r.byName.high_pressure_alarm.raw).toBe(250);
    expect(r.byName.high_pressure_alarm.value).toBeCloseTo(25.0, 5);

    expect(r.byName.epap_max.value).toBeCloseTo(14.0, 5);
    expect(r.byName.epap_min.value).toBeCloseTo(7.0, 5);
    expect(r.byName.pressure_support.value).toBeCloseTo(3.0, 5);

    expect(r.byName.backlight_seconds.value).toBe(60);
  });
});

describe('summarizeLocked', () => {
  it('returns confirmed + diff-verified fields in spec order', () => {
    const r = parseBa525Config(BA525_SAMPLE_1_BYTES);
    const summary = summarizeLocked(r);
    expect(summary.map((s) => s.name)).toEqual([
      'language',
      'indicator_light',
      'screen_saver',
      'tube_size',
      'face_mask',
      'smart_start',
      'smart_stop',
      'temperature_unit',
      'high_pressure_alarm',
      'low_pressure_alarm',
      'timezone',
      'therapy_mode',
      'delay_time_minutes',
      'humidifier_level',
      'epr_level',
      'ipap_sensitivity',
      'rise_rate',
      'fall_rate',
      'epap_sensitivity',
      'epap_max',
      'epap_min',
      'pressure_support',
      'ramp_start_pressure',
      'backlight_seconds',
      'payload_xor_checksum',
    ]);
    expect(summary.find((s) => s.name === 'high_pressure_alarm')).toMatchObject({
      label: '高吸气压力报警',
      value: 25.0,
      unit: 'cmH2O',
      status: 'confirmed',
    });
    expect(summary.find((s) => s.name === 'humidifier_level')).toMatchObject({
      label: '湿化水平',
      value: 1,
      status: 'diff-verified',
    });
    expect(summary.find((s) => s.name === 'face_mask')).toMatchObject({
      label: '面罩',
      value: 0,
      status: 'diff-verified',
    });
  });
});

describe('Round 2: v1 vs v2 diff verification', () => {
  it('all three fixtures (v1, v2, v3) pass the XOR checksum at offset 191', () => {
    for (const fixture of [BA525_SAMPLE_1_BYTES, BA525_SAMPLE_2_BYTES, BA525_SAMPLE_3_BYTES]) {
      let xor = 0;
      for (let i = 0; i < 191; i++) xor ^= fixture[i];
      expect(xor).toBe(fixture[191]);
    }
  });

  it('humidifier_level changes from 1 to 3 (matches UI)', () => {
    expect(parseBa525Config(BA525_SAMPLE_1_BYTES).byName.humidifier_level.value).toBe(1);
    expect(parseBa525Config(BA525_SAMPLE_2_BYTES).byName.humidifier_level.value).toBe(3);
  });

  it('rise_rate changes from 2 to 3 (matches UI)', () => {
    expect(parseBa525Config(BA525_SAMPLE_1_BYTES).byName.rise_rate.value).toBe(2);
    expect(parseBa525Config(BA525_SAMPLE_2_BYTES).byName.rise_rate.value).toBe(3);
  });

  it('only the 6 expected bytes differ between v1 and v2 fixtures', () => {
    const diffOffsets: number[] = [];
    for (let i = 0; i < 192; i++) {
      if (BA525_SAMPLE_1_BYTES[i] !== BA525_SAMPLE_2_BYTES[i]) diffOffsets.push(i);
    }
    expect(diffOffsets).toEqual([98, 103, 105, 106, 109, 191]);
  });
});

describe('Round 3: v2 vs v3 disambiguation', () => {
  it('all twelve fixtures (v1..v12) pass the XOR checksum at offset 191', () => {
    for (const fixture of [BA525_SAMPLE_1_BYTES, BA525_SAMPLE_2_BYTES, BA525_SAMPLE_3_BYTES, BA525_SAMPLE_4_BYTES, BA525_SAMPLE_5_BYTES, BA525_SAMPLE_6_BYTES, BA525_SAMPLE_7_BYTES, BA525_SAMPLE_8_BYTES, BA525_SAMPLE_9_BYTES, BA525_SAMPLE_10_BYTES, BA525_SAMPLE_11_BYTES, BA525_SAMPLE_12_BYTES]) {
      let xor = 0;
      for (let i = 0; i < 191; i++) xor ^= fixture[i];
      expect(xor).toBe(fixture[191]);
    }
  });

  it('only the 3 expected bytes differ between v2 and v3 fixtures', () => {
    const diffOffsets: number[] = [];
    for (let i = 0; i < 192; i++) {
      if (BA525_SAMPLE_2_BYTES[i] !== BA525_SAMPLE_3_BYTES[i]) diffOffsets.push(i);
    }
    expect(diffOffsets).toEqual([103, 109, 191]);
  });

  it('ipap_sensitivity changes 1 -> 2 (offset 103, matches UI)', () => {
    expect(parseBa525Config(BA525_SAMPLE_2_BYTES).byName.ipap_sensitivity.value).toBe(1);
    expect(parseBa525Config(BA525_SAMPLE_3_BYTES).byName.ipap_sensitivity.value).toBe(2);
  });

  it('epap_sensitivity changes 1 -> 3 (offset 109, matches UI)', () => {
    expect(parseBa525Config(BA525_SAMPLE_2_BYTES).byName.epap_sensitivity.value).toBe(1);
    expect(parseBa525Config(BA525_SAMPLE_3_BYTES).byName.epap_sensitivity.value).toBe(3);
  });

  it('fall_rate stays at 1 (offset 106 unchanged; identifies it by elimination)', () => {
    expect(parseBa525Config(BA525_SAMPLE_2_BYTES).byName.fall_rate.value).toBe(1);
    expect(parseBa525Config(BA525_SAMPLE_3_BYTES).byName.fall_rate.value).toBe(1);
  });

  it('payload_xor_checksum cycles 0xB7 -> 0xB6 -> 0xB7 -> 0xB0 across v1/v2/v3/v4', () => {
    expect(parseBa525Config(BA525_SAMPLE_1_BYTES).byName.payload_xor_checksum.value).toBe(0xb7);
    expect(parseBa525Config(BA525_SAMPLE_2_BYTES).byName.payload_xor_checksum.value).toBe(0xb6);
    expect(parseBa525Config(BA525_SAMPLE_3_BYTES).byName.payload_xor_checksum.value).toBe(0xb7);
    expect(parseBa525Config(BA525_SAMPLE_4_BYTES).byName.payload_xor_checksum.value).toBe(0xb0);
  });
});

describe('Round 4: v3 vs v4 enum-group diff', () => {
  it('only the 6 expected bytes differ between v3 and v4 fixtures', () => {
    const diffOffsets: number[] = [];
    for (let i = 0; i < 192; i++) {
      if (BA525_SAMPLE_3_BYTES[i] !== BA525_SAMPLE_4_BYTES[i]) diffOffsets.push(i);
    }
    expect(diffOffsets).toEqual([1, 5, 6, 10, 28, 191]);
  });

  it('timezone encodes UTC offset as value - 11 (v1 UTC+8 = 19, v4 UTC+9 = 20)', () => {
    expect(parseBa525Config(BA525_SAMPLE_1_BYTES).byName.timezone.value).toBe(19);
    expect(parseBa525Config(BA525_SAMPLE_4_BYTES).byName.timezone.value).toBe(20);
  });

  it('the four enum bytes were 0 in v1-v3 and changed in v4', () => {
    const enumFields = ['language', 'tube_size', 'face_mask', 'temperature_unit'];
    for (const name of enumFields) {
      for (const v of [BA525_SAMPLE_1_BYTES, BA525_SAMPLE_2_BYTES, BA525_SAMPLE_3_BYTES]) {
        expect(parseBa525Config(v).byName[name].value).toBe(0);
      }
      const v4Val = parseBa525Config(BA525_SAMPLE_4_BYTES).byName[name].value;
      expect(v4Val === 1 || v4Val === 2).toBe(true);
    }
  });

  it('record_size_marker stays constant 0xCC across all fixtures', () => {
    for (const fixture of [BA525_SAMPLE_1_BYTES, BA525_SAMPLE_2_BYTES, BA525_SAMPLE_3_BYTES, BA525_SAMPLE_4_BYTES, BA525_SAMPLE_5_BYTES, BA525_SAMPLE_6_BYTES, BA525_SAMPLE_7_BYTES, BA525_SAMPLE_8_BYTES]) {
      expect(parseBa525Config(fixture).byName.record_size_marker.value).toBe(0xcc);
    }
  });
});

describe('Round 5: v4 vs v5 single-variable disambiguation', () => {
  it('only the 3 expected bytes differ between v4 and v5 fixtures', () => {
    const diffOffsets: number[] = [];
    for (let i = 0; i < 192; i++) {
      if (BA525_SAMPLE_4_BYTES[i] !== BA525_SAMPLE_5_BYTES[i]) diffOffsets.push(i);
    }
    expect(diffOffsets).toEqual([6, 10, 191]);
  });

  it('temperature_unit reverts to 0 at offset 10 (°F -> °C)', () => {
    expect(parseBa525Config(BA525_SAMPLE_4_BYTES).byName.temperature_unit.value).toBe(1);
    expect(parseBa525Config(BA525_SAMPLE_5_BYTES).byName.temperature_unit.value).toBe(0);
  });

  it('face_mask reverts to 0 at offset 6 (鼻枕 -> 鼻罩)', () => {
    expect(parseBa525Config(BA525_SAMPLE_4_BYTES).byName.face_mask.value).toBe(2);
    expect(parseBa525Config(BA525_SAMPLE_5_BYTES).byName.face_mask.value).toBe(0);
  });

  it('tube_size stays at 1 across v4/v5 (identifies offset 5 by elimination)', () => {
    expect(parseBa525Config(BA525_SAMPLE_4_BYTES).byName.tube_size.value).toBe(1);
    expect(parseBa525Config(BA525_SAMPLE_5_BYTES).byName.tube_size.value).toBe(1);
  });

  it('language stays at 2 across v4/v5 (identifies offset 1 by elimination)', () => {
    expect(parseBa525Config(BA525_SAMPLE_4_BYTES).byName.language.value).toBe(2);
    expect(parseBa525Config(BA525_SAMPLE_5_BYTES).byName.language.value).toBe(2);
  });
});

describe('Round 6: v5 vs v6 delay time pinpoint', () => {
  it('only 2 bytes differ between v5 and v6 (delay_time + checksum)', () => {
    const diffOffsets: number[] = [];
    for (let i = 0; i < 192; i++) {
      if (BA525_SAMPLE_5_BYTES[i] !== BA525_SAMPLE_6_BYTES[i]) diffOffsets.push(i);
    }
    expect(diffOffsets).toEqual([97, 191]);
  });

  it('delay_time_minutes encodes 0 as off and N as N minutes', () => {
    // v1-v5 all had delay time off
    for (const v of [BA525_SAMPLE_1_BYTES, BA525_SAMPLE_2_BYTES, BA525_SAMPLE_3_BYTES, BA525_SAMPLE_4_BYTES, BA525_SAMPLE_5_BYTES]) {
      expect(parseBa525Config(v).byName.delay_time_minutes.value).toBe(0);
    }
    // v6 set delay to 10 min
    expect(parseBa525Config(BA525_SAMPLE_6_BYTES).byName.delay_time_minutes.value).toBe(10);
  });

  it('offset 99 (previously suspected ramp_time) is constant 20 across all seven versions', () => {
    for (const fixture of [BA525_SAMPLE_1_BYTES, BA525_SAMPLE_2_BYTES, BA525_SAMPLE_3_BYTES, BA525_SAMPLE_4_BYTES, BA525_SAMPLE_5_BYTES, BA525_SAMPLE_6_BYTES, BA525_SAMPLE_7_BYTES]) {
      expect(parseBa525Config(fixture).byName.unknown_99.value).toBe(20);
    }
  });
});

describe('Round 7: v6 vs v7 EPR + ramp_start_pressure', () => {
  it('exactly 4 bytes differ between v6 and v7 (epr + 1 mantissa byte of float + checksum + side-effect on delay)', () => {
    const diffOffsets: number[] = [];
    for (let i = 0; i < 192; i++) {
      if (BA525_SAMPLE_6_BYTES[i] !== BA525_SAMPLE_7_BYTES[i]) diffOffsets.push(i);
    }
    expect(diffOffsets).toEqual([97, 102, 146, 191]);
  });

  it('epr_level changes 0 -> 1 at offset 102 (matches UI 关闭 -> 1)', () => {
    expect(parseBa525Config(BA525_SAMPLE_6_BYTES).byName.epr_level.value).toBe(0);
    expect(parseBa525Config(BA525_SAMPLE_7_BYTES).byName.epr_level.value).toBe(1);
  });

  it('ramp_start_pressure changes 4.0 -> 6.0 at offset 144 (float32)', () => {
    expect(parseBa525Config(BA525_SAMPLE_6_BYTES).byName.ramp_start_pressure.value).toBeCloseTo(4.0, 5);
    expect(parseBa525Config(BA525_SAMPLE_7_BYTES).byName.ramp_start_pressure.value).toBeCloseTo(6.0, 5);
  });

  it('delay_time_minutes reverts 10 -> 0 in v7 (user side-effect, confirmed by user)', () => {
    expect(parseBa525Config(BA525_SAMPLE_6_BYTES).byName.delay_time_minutes.value).toBe(10);
    expect(parseBa525Config(BA525_SAMPLE_7_BYTES).byName.delay_time_minutes.value).toBe(0);
  });
});

describe('Round 8: v7 vs v8 single-variable smart_start', () => {
  it('only 2 bytes differ between v7 and v8 (smart_start + checksum)', () => {
    const diffOffsets: number[] = [];
    for (let i = 0; i < 192; i++) {
      if (BA525_SAMPLE_7_BYTES[i] !== BA525_SAMPLE_8_BYTES[i]) diffOffsets.push(i);
    }
    expect(diffOffsets).toEqual([7, 191]);
  });

  it('smart_start at offset 7 flips 1 -> 0 (matches UI 开启 -> 关闭)', () => {
    expect(parseBa525Config(BA525_SAMPLE_7_BYTES).byName.smart_start.value).toBe(1);
    expect(parseBa525Config(BA525_SAMPLE_8_BYTES).byName.smart_start.value).toBe(0);
  });
});

describe('Round 9: v8 vs v9 single-variable smart_stop', () => {
  it('only 2 bytes differ between v8 and v9 (smart_stop + checksum)', () => {
    const diffOffsets: number[] = [];
    for (let i = 0; i < 192; i++) {
      if (BA525_SAMPLE_8_BYTES[i] !== BA525_SAMPLE_9_BYTES[i]) diffOffsets.push(i);
    }
    expect(diffOffsets).toEqual([8, 191]);
  });

  it('smart_stop at offset 8 flips 1 -> 0 (matches UI 开启 -> 关闭)', () => {
    expect(parseBa525Config(BA525_SAMPLE_8_BYTES).byName.smart_stop.value).toBe(1);
    expect(parseBa525Config(BA525_SAMPLE_9_BYTES).byName.smart_stop.value).toBe(0);
  });
});

describe('Round 10: v9 vs v10 indicator_light + language self-verify', () => {
  it('exactly 3 bytes differ (language + indicator + checksum)', () => {
    const diffOffsets: number[] = [];
    for (let i = 0; i < 192; i++) {
      if (BA525_SAMPLE_9_BYTES[i] !== BA525_SAMPLE_10_BYTES[i]) diffOffsets.push(i);
    }
    expect(diffOffsets).toEqual([1, 2, 191]);
  });

  it('language reverts 2 -> 0 (English -> 简体中文, validates Round 5 mapping)', () => {
    expect(parseBa525Config(BA525_SAMPLE_9_BYTES).byName.language.value).toBe(2);
    expect(parseBa525Config(BA525_SAMPLE_10_BYTES).byName.language.value).toBe(0);
  });

  it('indicator_light at offset 2 flips 0 -> 1 (matches UI 关闭 -> 开启)', () => {
    expect(parseBa525Config(BA525_SAMPLE_9_BYTES).byName.indicator_light.value).toBe(0);
    expect(parseBa525Config(BA525_SAMPLE_10_BYTES).byName.indicator_light.value).toBe(1);
  });
});

describe('Round 11: v10 vs v11 screen_saver + low_pressure_alarm + indicator self-verify', () => {
  it('exactly 4 bytes differ (indicator + screen_saver + low_pressure_alarm + checksum)', () => {
    const diffOffsets: number[] = [];
    for (let i = 0; i < 192; i++) {
      if (BA525_SAMPLE_10_BYTES[i] !== BA525_SAMPLE_11_BYTES[i]) diffOffsets.push(i);
    }
    expect(diffOffsets).toEqual([2, 4, 18, 191]);
  });

  it('indicator_light reverts 1 -> 0 (self-verifies Round 10)', () => {
    expect(parseBa525Config(BA525_SAMPLE_10_BYTES).byName.indicator_light.value).toBe(1);
    expect(parseBa525Config(BA525_SAMPLE_11_BYTES).byName.indicator_light.value).toBe(0);
  });

  it('screen_saver at offset 4 flips 0 -> 1 (matches UI 关闭 -> 开启)', () => {
    expect(parseBa525Config(BA525_SAMPLE_10_BYTES).byName.screen_saver.value).toBe(0);
    expect(parseBa525Config(BA525_SAMPLE_11_BYTES).byName.screen_saver.value).toBe(1);
  });

  it('low_pressure_alarm at offset 18 flips 1 -> 0 (matches UI 开启 -> 关闭)', () => {
    expect(parseBa525Config(BA525_SAMPLE_10_BYTES).byName.low_pressure_alarm.value).toBe(1);
    expect(parseBa525Config(BA525_SAMPLE_11_BYTES).byName.low_pressure_alarm.value).toBe(0);
  });
});

describe('Round 12: v11 vs v12 therapy_mode', () => {
  it('only 2 bytes differ (therapy_mode + checksum) — no pressure floats touched', () => {
    const diffOffsets: number[] = [];
    for (let i = 0; i < 192; i++) {
      if (BA525_SAMPLE_11_BYTES[i] !== BA525_SAMPLE_12_BYTES[i]) diffOffsets.push(i);
    }
    expect(diffOffsets).toEqual([96, 191]);
  });

  it('therapy_mode at offset 96 changes 3 (Auto-S) -> 0 (CPAP)', () => {
    expect(parseBa525Config(BA525_SAMPLE_11_BYTES).byName.therapy_mode.value).toBe(3);
    expect(parseBa525Config(BA525_SAMPLE_12_BYTES).byName.therapy_mode.value).toBe(0);
  });

  it('all treatment-pressure floats stay unchanged across the Auto-S -> CPAP switch', () => {
    const v11 = parseBa525Config(BA525_SAMPLE_11_BYTES);
    const v12 = parseBa525Config(BA525_SAMPLE_12_BYTES);
    for (const name of ['epap_max', 'epap_min', 'pressure_support', 'ramp_start_pressure']) {
      expect(v11.byName[name].value).toBeCloseTo(v12.byName[name].value as number, 5);
    }
  });
});
