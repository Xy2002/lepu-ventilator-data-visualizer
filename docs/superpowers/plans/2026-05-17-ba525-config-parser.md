# Lepu BA525 Config Parser Implementation Plan

> **Status:** Executed 2026-05-17 and refined through 12 reverse-engineering rounds (Rounds 2–12 done iteratively in conversation, not pre-planned). API was later renamed to use BA525 / Ba525 prefix (commit f06613c) since "V1" wrongly implied a format-version when it was really just the first sample's filename. This plan's text has been retroactively updated to the final names; commit messages in git history reflect the original sequencing.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a zero-dependency TypeScript parser for the 192-byte Lepu BA525 ventilator configuration binary, driven by a single field-spec table so iterative spec updates (adding/promoting fields) require only one edit.

**Architecture:** A single module `src/parser/ba525ConfigParser.ts` that exposes (1) typed field-spec data `BA525_CONFIG_FIELDS`, (2) a `parseBa525Config` function that reads bytes via `DataView` according to each spec entry's `type`, and (3) result types (`Ba525Config`, `ParsedField`). Unit tests cover (a) the FIELDS table shape, (b) primitive type reading, (c) scale application, (d) the full v1.bin fixture, using an inline hex constant so tests don't depend on local-only data files.

**Tech Stack:**
- TypeScript 5.9 (strict mode, isolatedModules, noUnusedLocals)
- Vitest 4.0 (already configured with jsdom environment)
- Node-built `DataView` (no runtime deps)

**Spec reference:** `docs/superpowers/specs/2026-05-17-ba525-config-bin-spec.md`

**Path note:** Initial draft of the spec had `src/lib/ba525ConfigParser.ts`; this plan corrected it to `src/parser/` to match the existing `edfParser.ts` convention (Task 7 below). After the rename refactor, the final path is `src/parser/ba525ConfigParser.ts`.

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/parser/ba525ConfigParser.ts` | Types (`FieldSpec`, `FieldStatus`, `ParsedField`, `Ba525Config`), the `BA525_CONFIG_FIELDS` data table, and the `parseBa525Config` function. Zero dependencies on UI / React. |
| `src/parser/ba525ConfigFixtures.ts` | Hex string + helper to materialize the v1.bin bytes as a `Uint8Array`. Kept separate so test files don't carry a 192-byte literal. |
| `src/parser/ba525ConfigParser.test.ts` | Vitest test suite for the parser. |
| `docs/superpowers/specs/2026-05-17-ba525-config-bin-spec.md` | (existing) Updated in Task 7 with the corrected module path. |

---

## Task 1: Create field-spec types and the FIELDS table

**Files:**
- Create: `src/parser/ba525ConfigParser.ts`
- Create: `src/parser/ba525ConfigParser.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/parser/ba525ConfigParser.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BA525_CONFIG_FIELDS } from './ba525ConfigParser';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/parser/ba525ConfigParser.test.ts`
Expected: FAIL — `Failed to load url ./ba525ConfigParser` (module does not exist yet).

- [ ] **Step 3: Create the parser module with types and the FIELDS table**

Create `src/parser/ba525ConfigParser.ts`:

```ts
export type FieldStatus =
  | 'confirmed'      // direct UI-record match in v1
  | 'diff-verified'  // confirmed by multi-round byte-diff
  | 'inferred'       // educated guess, no independent evidence yet
  | 'unknown'        // no current hypothesis
  | 'reserved';      // observed constant (usually 0)

export type FieldType = 'uint8' | 'uint16LE' | 'uint32LE' | 'float32LE' | 'bytes';

export interface FieldSpec {
  /** Byte offset from start of the 192-byte block. */
  offset: number;
  /** Byte width. */
  size: number;
  /** Reader strategy. */
  type: FieldType;
  /** Stable identifier; used as object key in byName. */
  name: string;
  /** Optional human label (zh_CN). */
  label?: string;
  /** Optional multiplier applied after reading (e.g. 0.1 for uint16-as-decimal). */
  scale?: number;
  /** Optional unit string for display. */
  unit?: string;
  /** Confidence tier. */
  status: FieldStatus;
  /** Free-form note: contradictions, hypothesis source, etc. */
  notes?: string;
}

export const BA525_CONFIG_FIELDS: ReadonlyArray<FieldSpec> = [
  // ---- Region 1: device / mode (0-39) ----
  { offset: 0,  size: 2, type: 'uint16LE',  name: 'record_size_marker', status: 'inferred', notes: 'old EDF analysis: 204' },
  { offset: 2,  size: 2, type: 'uint16LE',  name: 'header_ref',         status: 'inferred', notes: 'old EDF analysis: 512' },
  { offset: 6,  size: 2, type: 'uint16LE',  name: 'config_flags',       status: 'inferred' },
  { offset: 8,  size: 2, type: 'uint16LE',  name: 'enable_flag',        status: 'inferred' },
  { offset: 16, size: 2, type: 'uint16LE',  name: 'high_pressure_alarm', label: '高吸气压力报警', scale: 0.1, unit: 'cmH2O', status: 'confirmed' },
  { offset: 18, size: 2, type: 'uint16LE',  name: 'unknown_18',         status: 'unknown' },
  { offset: 20, size: 2, type: 'uint16LE',  name: 'unknown_20',         status: 'unknown' },
  { offset: 28, size: 2, type: 'uint16LE',  name: 'unknown_28',         status: 'unknown' },
  { offset: 32, size: 2, type: 'uint16LE',  name: 'therapy_mode_primary', status: 'inferred', notes: 'v1 = 2; Auto-S?' },
  { offset: 34, size: 2, type: 'uint16LE',  name: 'unknown_34',         status: 'unknown' },
  { offset: 36, size: 2, type: 'uint16LE',  name: 'unknown_36',         status: 'unknown' },

  // ---- Region 2: float calibration block (40-67) ----
  { offset: 40, size: 4, type: 'float32LE', name: 'calibration_pressure_peak',  status: 'inferred' },
  { offset: 44, size: 4, type: 'float32LE', name: 'calibration_pressure_min',   status: 'inferred' },
  { offset: 48, size: 4, type: 'float32LE', name: 'calibration_std_or_leak',    status: 'inferred' },
  { offset: 52, size: 4, type: 'float32LE', name: 'calibration_pressure_95th',  status: 'inferred' },
  { offset: 56, size: 4, type: 'float32LE', name: 'calibration_pressure_mean',  status: 'inferred' },
  { offset: 60, size: 4, type: 'float32LE', name: 'calibration_pressure_range', status: 'inferred' },
  { offset: 64, size: 4, type: 'float32LE', name: 'calibration_sensor_coeff',   status: 'inferred' },

  // ---- Region 4: uint8 enums (96-111) ----
  { offset: 96,  size: 1, type: 'uint8', name: 'therapy_mode_sub',         status: 'inferred', notes: 'v1 = 3' },
  { offset: 97,  size: 1, type: 'uint8', name: 'unknown_97',               status: 'unknown' },
  { offset: 98,  size: 1, type: 'uint8', name: 'epr_or_expiratory_relief', status: 'inferred', notes: 'v1 = 1 conflicts with UI record "off"' },
  { offset: 99,  size: 1, type: 'uint8', name: 'ramp_time_minutes',        status: 'inferred', notes: 'v1 = 20 conflicts with UI "off"; switch may be elsewhere' },
  { offset: 100, size: 1, type: 'uint8', name: 'unknown_100',              status: 'unknown' },
  { offset: 101, size: 1, type: 'uint8', name: 'unknown_101',              status: 'unknown', notes: 'old guess humidifier=2 but UI=1' },
  { offset: 102, size: 1, type: 'uint8', name: 'mask_type',                status: 'inferred', notes: 'v1 = 0 (nasal mask)' },
  { offset: 103, size: 1, type: 'uint8', name: 'unknown_103',              status: 'unknown' },
  { offset: 104, size: 1, type: 'uint8', name: 'auto_start',               status: 'inferred', notes: 'v1 = 1 (smart-start on)' },
  { offset: 105, size: 1, type: 'uint8', name: 'unknown_105',              status: 'unknown' },
  { offset: 106, size: 1, type: 'uint8', name: 'unknown_106',              status: 'unknown' },
  { offset: 107, size: 1, type: 'uint8', name: 'unknown_107',              status: 'unknown' },
  { offset: 108, size: 1, type: 'uint8', name: 'apnea_threshold_seconds',  status: 'inferred', notes: 'v1 = 10' },
  { offset: 109, size: 1, type: 'uint8', name: 'unknown_109',              status: 'unknown' },
  { offset: 110, size: 1, type: 'uint8', name: 'unknown_110',              status: 'unknown' },
  { offset: 111, size: 1, type: 'uint8', name: 'unknown_111',              status: 'unknown' },

  // ---- Region 5: float treatment pressures (112-167) ----
  { offset: 112, size: 4, type: 'float32LE', name: 'unknown_pressure_112', status: 'unknown' },
  { offset: 116, size: 4, type: 'float32LE', name: 'unknown_pressure_116', status: 'unknown' },
  { offset: 120, size: 4, type: 'float32LE', name: 'unknown_pressure_120', status: 'unknown' },
  { offset: 124, size: 4, type: 'float32LE', name: 'unknown_pressure_124', status: 'unknown' },
  { offset: 128, size: 4, type: 'float32LE', name: 'unknown_pressure_128', status: 'unknown' },
  { offset: 132, size: 4, type: 'float32LE', name: 'epap_max',          label: '最大呼气压力', unit: 'cmH2O', status: 'confirmed' },
  { offset: 136, size: 4, type: 'float32LE', name: 'epap_min',          label: '最低呼气压力', unit: 'cmH2O', status: 'confirmed' },
  { offset: 140, size: 4, type: 'float32LE', name: 'pressure_support',  label: '压力支持',     unit: 'cmH2O', status: 'confirmed' },
  { offset: 144, size: 4, type: 'float32LE', name: 'unknown_pressure_144', status: 'unknown' },
  { offset: 148, size: 4, type: 'float32LE', name: 'unknown_pressure_148', status: 'unknown' },
  { offset: 152, size: 4, type: 'float32LE', name: 'unknown_pressure_152', status: 'unknown' },
  { offset: 156, size: 4, type: 'float32LE', name: 'unknown_pressure_156', status: 'unknown' },
  { offset: 160, size: 4, type: 'float32LE', name: 'unknown_pressure_160', status: 'unknown' },
  { offset: 164, size: 4, type: 'float32LE', name: 'unknown_pressure_164', status: 'unknown', notes: 'old guess ramp_start_pressure but UI=4.0 not 3.0' },

  // ---- Region 6: extras (168-191) ----
  { offset: 168, size: 1, type: 'uint8', name: 'unknown_168',         status: 'unknown' },
  { offset: 169, size: 1, type: 'uint8', name: 'backlight_seconds', label: '背光秒数', unit: 's', status: 'confirmed' },
  { offset: 182, size: 1, type: 'uint8', name: 'unknown_182',         status: 'unknown' },
  { offset: 184, size: 1, type: 'uint8', name: 'unknown_184',         status: 'unknown' },
  { offset: 185, size: 1, type: 'uint8', name: 'unknown_185',         status: 'unknown' },
  { offset: 186, size: 1, type: 'uint8', name: 'unknown_186',         status: 'unknown' },
  { offset: 191, size: 1, type: 'uint8', name: 'unknown_191',         status: 'unknown' },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/parser/ba525ConfigParser.test.ts`
Expected: PASS (3 tests passing).

- [ ] **Step 5: Commit**

```bash
git add src/parser/ba525ConfigParser.ts src/parser/ba525ConfigParser.test.ts
git commit -m "feat(ba525-config): add FieldSpec types and BA525_CONFIG_FIELDS table"
```

---

## Task 2: Implement parseBa525Config skeleton (input validation + raw passthrough)

**Files:**
- Modify: `src/parser/ba525ConfigParser.ts`
- Modify: `src/parser/ba525ConfigParser.test.ts`

- [ ] **Step 1: Append the failing tests**

Append to `src/parser/ba525ConfigParser.test.ts`:

```ts
import { parseBa525Config } from './ba525ConfigParser';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/parser/ba525ConfigParser.test.ts`
Expected: FAIL — `parseBa525Config is not exported` (function does not exist yet).

- [ ] **Step 3: Add the skeleton implementation**

Append to `src/parser/ba525ConfigParser.ts`:

```ts
export interface ParsedField {
  spec: FieldSpec;
  /** Raw numeric reading (or Uint8Array for `bytes` type). */
  raw: number | Uint8Array;
  /** raw * scale when scale is defined; otherwise equal to raw. */
  value: number | Uint8Array;
}

export interface Ba525Config {
  raw: Uint8Array;
  fields: ParsedField[];
  byName: Record<string, ParsedField>;
}

const PAYLOAD_BYTES = 192;

function toUint8Array(input: ArrayBuffer | Uint8Array): Uint8Array {
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(input);
}

export function parseBa525Config(input: ArrayBuffer | Uint8Array): Ba525Config {
  const raw = toUint8Array(input);
  if (raw.byteLength < PAYLOAD_BYTES) {
    throw new Error(`config_v1 payload must be at least ${PAYLOAD_BYTES} bytes (got ${raw.byteLength})`);
  }
  return {
    raw,
    fields: [],
    byName: {},
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/parser/ba525ConfigParser.test.ts`
Expected: PASS (6 tests passing).

- [ ] **Step 5: Commit**

```bash
git add src/parser/ba525ConfigParser.ts src/parser/ba525ConfigParser.test.ts
git commit -m "feat(ba525-config): add parseBa525Config skeleton with input validation"
```

---

## Task 3: Read primitive types from the buffer

**Files:**
- Modify: `src/parser/ba525ConfigParser.ts`
- Modify: `src/parser/ba525ConfigParser.test.ts`

- [ ] **Step 1: Append the failing tests**

Append to `src/parser/ba525ConfigParser.test.ts`:

```ts
describe('parseBa525Config primitive reading', () => {
  function makeBuffer(): Uint8Array {
    const b = new Uint8Array(192);
    // high_pressure_alarm @ offset 16 uint16LE = 250 (0x00FA) → value 25.0 after scale 0.1
    b[16] = 0xfa;
    b[17] = 0x00;
    // backlight_seconds @ offset 169 uint8 = 60
    b[169] = 60;
    // epap_max @ offset 132 float32LE = 14.0 → 0x41600000 LE = 00 00 60 41
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/parser/ba525ConfigParser.test.ts`
Expected: FAIL on all 5 new tests — `byName.backlight_seconds is undefined`, etc., because `parseBa525Config` still returns empty `fields` and `byName`.

- [ ] **Step 3: Implement the reader**

In `src/parser/ba525ConfigParser.ts`, replace the empty-return body of `parseBa525Config` with:

```ts
function readField(view: DataView, spec: FieldSpec): number | Uint8Array {
  switch (spec.type) {
    case 'uint8':
      return view.getUint8(spec.offset);
    case 'uint16LE':
      return view.getUint16(spec.offset, true);
    case 'uint32LE':
      return view.getUint32(spec.offset, true);
    case 'float32LE':
      return view.getFloat32(spec.offset, true);
    case 'bytes':
      return new Uint8Array(view.buffer, view.byteOffset + spec.offset, spec.size);
  }
}

function applyScale(raw: number | Uint8Array, scale: number | undefined): number | Uint8Array {
  if (typeof raw !== 'number' || scale === undefined) return raw;
  return raw * scale;
}

export function parseBa525Config(input: ArrayBuffer | Uint8Array): Ba525Config {
  const raw = toUint8Array(input);
  if (raw.byteLength < PAYLOAD_BYTES) {
    throw new Error(`config_v1 payload must be at least ${PAYLOAD_BYTES} bytes (got ${raw.byteLength})`);
  }
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const fields: ParsedField[] = BA525_CONFIG_FIELDS.map((spec) => {
    const rawValue = readField(view, spec);
    return { spec, raw: rawValue, value: applyScale(rawValue, spec.scale) };
  });
  const byName: Record<string, ParsedField> = {};
  for (const f of fields) byName[f.spec.name] = f;
  return { raw, fields, byName };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/parser/ba525ConfigParser.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/parser/ba525ConfigParser.ts src/parser/ba525ConfigParser.test.ts
git commit -m "feat(ba525-config): read uint8/uint16LE/float32LE/bytes with scale support"
```

---

## Task 4: Add the v1 fixture (hex literal → Uint8Array)

**Files:**
- Create: `src/parser/ba525ConfigFixtures.ts`
- Modify: `src/parser/ba525ConfigParser.test.ts`

- [ ] **Step 1: Append the failing fixture test**

Append to `src/parser/ba525ConfigParser.test.ts`:

```ts
import { BA525_SAMPLE_1_BYTES } from './ba525ConfigFixtures';

describe('parseBa525Config on the v1 fixture', () => {
  it('decodes the 5 confirmed fields to their recorded UI values', () => {
    const r = parseBa525Config(BA525_SAMPLE_1_BYTES);

    expect(r.byName.high_pressure_alarm.raw).toBe(250);
    expect(r.byName.high_pressure_alarm.value).toBeCloseTo(25.0, 5);

    expect(r.byName.epap_max.value).toBeCloseTo(14.0, 5);
    expect(r.byName.epap_min.value).toBeCloseTo(7.0, 5);
    expect(r.byName.pressure_support.value).toBeCloseTo(3.0, 5);

    expect(r.byName.backlight_seconds.value).toBe(60);
  });

  it('fixture is exactly 192 bytes', () => {
    expect(BA525_SAMPLE_1_BYTES.byteLength).toBe(192);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/parser/ba525ConfigParser.test.ts`
Expected: FAIL — `Failed to load url ./ba525ConfigFixtures`.

- [ ] **Step 3: Create the fixture module**

Create `src/parser/ba525ConfigFixtures.ts` with the exact bytes from `src/docs/config_v1.bin`:

```ts
// Verbatim bytes of src/docs/config_v1.bin, 12 lines of 32 hex chars each.
// hexToBytes strips whitespace so line breaks are fine.
const SAMPLE_1_HEX = `
  cc000002 00000001 01000000 00000000
  fa000100 00010000 00000000 13000000
  02000e00 0d000000 00009441 00001841
  d20b0240 cdcc9441 cdcc2441 cdcc0441
  765e033d 00000000 00000000 00000000
  00000000 00000000 00000000 00000000
  03000114 02020003 01020301 0a031403
  00000041 00002041 00008040 00002041
  00008040 00006041 0000e040 00004040
  00008040 00002041 00008040 00002041
  00008040 00004040 053c0000 00000000
  00000000 00001400 020c4d00 000000b7
`;

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, '');
  if (clean.length % 2 !== 0) {
    throw new Error(`hex string length must be even (got ${clean.length})`);
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export const BA525_SAMPLE_1_BYTES: Uint8Array = hexToBytes(SAMPLE_1_HEX);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/parser/ba525ConfigParser.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Verify the fixture matches the actual bin file**

Run: `npx tsx -e "import('./src/parser/ba525ConfigFixtures.ts').then(async m => { const fs = await import('node:fs'); const real = fs.readFileSync('./src/docs/config_v1.bin'); const same = Buffer.compare(Buffer.from(m.BA525_SAMPLE_1_BYTES), real); console.log(same === 0 ? 'OK: fixture matches src/docs/config_v1.bin' : 'MISMATCH'); })"`

If `tsx` isn't installed, alternative one-liner using Node only:
`node --experimental-strip-types -e "import('./src/parser/ba525ConfigFixtures.ts').then(async m => { const fs = await import('node:fs'); const real = fs.readFileSync('./src/docs/config_v1.bin'); console.log(Buffer.compare(Buffer.from(m.BA525_SAMPLE_1_BYTES), real) === 0 ? 'OK' : 'MISMATCH'); })"`

Expected output: `OK: fixture matches src/docs/config_v1.bin`.

If MISMATCH, dump the diff:
```bash
xxd src/docs/config_v1.bin > /tmp/real.hex
# and compare with SAMPLE_1_HEX above
```

- [ ] **Step 6: Commit**

```bash
git add src/parser/ba525ConfigFixtures.ts src/parser/ba525ConfigParser.test.ts
git commit -m "test(ba525-config): add v1.bin hex fixture and round-trip assertions"
```

---

## Task 5: Add a confirmed-fields summary helper

**Files:**
- Modify: `src/parser/ba525ConfigParser.ts`
- Modify: `src/parser/ba525ConfigParser.test.ts`

This task adds a small ergonomic helper so consumers (e.g., a future RawFileBrowser integration) don't need to hand-filter the `fields` array. Skip if you find it not needed when wiring the UI later — but writing it now means the parser module is self-sufficient.

- [ ] **Step 1: Append the failing test**

Append to `src/parser/ba525ConfigParser.test.ts`:

```ts
import { summarizeLocked } from './ba525ConfigParser';

describe('summarizeLocked', () => {
  it('returns only confirmed fields, in spec order, with display-ready values', () => {
    const r = parseBa525Config(BA525_SAMPLE_1_BYTES);
    const summary = summarizeLocked(r);
    expect(summary.map((s) => s.name)).toEqual([
      'high_pressure_alarm',
      'epap_max',
      'epap_min',
      'pressure_support',
      'backlight_seconds',
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/parser/ba525ConfigParser.test.ts`
Expected: FAIL — `summarizeLocked is not exported`.

- [ ] **Step 3: Add the helper**

Append to `src/parser/ba525ConfigParser.ts`:

```ts
export interface LockedSummaryEntry {
  name: string;
  label: string;
  value: number | Uint8Array;
  unit: string;
}

export function summarizeLocked(parsed: Ba525Config): LockedSummaryEntry[] {
  return parsed.fields
    .filter((f) => f.spec.status === 'confirmed')
    .map((f) => ({
      name: f.spec.name,
      label: f.spec.label ?? f.spec.name,
      value: f.value,
      unit: f.spec.unit ?? '',
    }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/parser/ba525ConfigParser.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add src/parser/ba525ConfigParser.ts src/parser/ba525ConfigParser.test.ts
git commit -m "feat(ba525-config): add summarizeLocked helper for UI consumers"
```

---

## Task 6: Verify the full project still type-checks and tests pass

**Files:** (no edits)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: All tests pass, including the existing edfParser suite and the new ba525ConfigParser suite.

- [ ] **Step 2: Run the TypeScript build to catch strict errors**

Run: `npm run build`
Expected: `tsc -b` succeeds (no errors). Vite build also succeeds.

If `npm run build` fails with errors only in your new files, fix them. If it fails in unrelated files, stop and report — do not paper over.

- [ ] **Step 3: No commit needed** — this is a verification gate.

---

## Task 7: Align the spec doc's module path

The spec's initial draft mentioned `src/lib/configV1Parser.ts` but the implementation lived in `src/parser/configV1Parser.ts` (later renamed to `src/parser/ba525ConfigParser.ts`). Update the spec so the doc and code agree.

> **Historical note:** When this plan was originally executed, the rename to BA525 hadn't happened yet, so the spec edit at the time was `src/lib/configV1Parser.ts` → `src/parser/configV1Parser.ts`. The BA525 rename happened later in a separate refactor (commit f06613c); the spec was updated again then.

**Files:**
- Modify: `docs/superpowers/specs/2026-05-17-ba525-config-bin-spec.md`

- [ ] **Step 1: Edit the spec**

In `docs/superpowers/specs/2026-05-17-ba525-config-bin-spec.md`, find the line referencing `src/lib/` and update it to `src/parser/ba525ConfigParser.ts`. Also update any test-file path reference.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-05-17-ba525-config-bin-spec.md
git commit -m "docs(ba525-config): align spec module path with src/parser/ convention"
```

---

## Self-Review

**Spec coverage:**
- Section 2 layout — Task 1's FIELDS table covers all 6 regions with offsets. ✅
- Section 3 status taxonomy — `FieldStatus` type in Task 1 includes all 5 statuses. ✅
- Section 4 field table — Mapped 1:1 in Task 1's FIELDS array. ✅
- Section 5 confirmed list — Task 4 fixture test asserts all 5. ✅
- Section 6 contradictions — Captured in `notes` fields in Task 1. ✅
- Section 7 round 1 history — Documented in spec, not in code. (No task needed.)
- Section 8 future rounds — Process documentation, executed by user not engineer. (No task needed.)
- Section 9 TS API — Tasks 1-5 implement every type, function, and constraint. ✅
- Section 10 naming conventions — Process, not code. (No task needed.)

**Placeholder scan:** No TBD / TODO / "add error handling" / "similar to Task N" present. Code blocks are concrete and complete.

**Type consistency:** Names checked across tasks: `FieldSpec`, `FieldStatus`, `FieldType`, `ParsedField`, `Ba525Config`, `BA525_CONFIG_FIELDS`, `parseBa525Config`, `summarizeLocked`, `BA525_SAMPLE_1_BYTES`. All match between definition and reference sites. The `value` field in `LockedSummaryEntry` uses the same union type (`number | Uint8Array`) as `ParsedField.value`.

**Scope check:** Single self-contained module + tests + one spec touch-up. Fits one implementation plan.
