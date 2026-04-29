# Ventilator Web Visualizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static, browser-only Web application that imports ventilator `.edf` data, indexes many dates, and visualizes selected-day summaries, waveforms, events, and raw decoded files.

**Architecture:** Use a Vite React TypeScript app. Keep binary parsing, aggregation, chart rendering, CSV export, and UI state in separate focused modules. Parse only headers during import indexing, then parse selected-day payloads on demand and render large waveforms through a canvas chart with downsampling.

**Tech Stack:** Vite, React, TypeScript, Vitest, Testing Library, browser File API, Canvas 2D. Vite setup follows current docs for strict TypeScript, ES2020 target, DOM libraries, `moduleResolution: "bundler"`, and `jsx: "react-jsx"`.

---

## Project Root

All paths are relative to `/Users/weixiangyu/Downloads/呼吸机`.

## File Structure

- Create `.gitignore`: ignore dependencies, build output, generated caches, and `.superpowers/`.
- Create `package.json`: scripts and dependencies for Vite, React, Vitest, and Testing Library.
- Create `index.html`: root mount for the Web app.
- Create `vite.config.ts`: Vite React config and Vitest browser-like test environment.
- Create `tsconfig.json`: strict TypeScript config based on current Vite docs.
- Create `src/main.tsx`: React entrypoint.
- Create `src/App.tsx`: top-level layout and state wiring.
- Create `src/App.css`: compact workbench styling.
- Create `src/types.ts`: shared domain types.
- Create `src/parser/edfParser.ts`: binary header and payload parser.
- Create `src/parser/edfParser.test.ts`: parser regression tests using generated fixtures.
- Create `src/parser/fixtures.ts`: minimal in-memory EDF-like file builders for tests.
- Create `src/data/dataset.ts`: file grouping, fast indexing, summaries, filtering, and on-demand day loading.
- Create `src/data/dataset.test.ts`: dataset indexing and filtering tests.
- Create `src/data/csv.ts`: CSV export helpers.
- Create `src/data/csv.test.ts`: CSV tests.
- Create `src/charts/downsample.ts`: visible-window waveform downsampling.
- Create `src/charts/downsample.test.ts`: downsampling tests.
- Create `src/charts/WaveformCanvas.tsx`: canvas waveform rendering with hover and selection callbacks.
- Create `src/components/ImportPanel.tsx`: directory/multi-file import controls.
- Create `src/components/DateNavigator.tsx`: date jump, previous/next, filters, and bounded results.
- Create `src/components/SummaryCards.tsx`: selected-day summary metrics.
- Create `src/components/DayCharts.tsx`: selected-day charts and event synchronization.
- Create `src/components/EventTable.tsx`: event table and event selection.
- Create `src/components/RawFileBrowser.tsx`: raw header, payload previews, warnings, and file CSV export.
- Create `src/test/setup.ts`: Testing Library setup.

## Task 1: Project Scaffold and Test Harness

**Files:**
- Create: `.gitignore`
- Create: `package.json`
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/App.css`
- Create: `src/test/setup.ts`

- [ ] **Step 1: Initialize git if needed**

Run:

```bash
git rev-parse --is-inside-work-tree || git init
```

Expected before initialization in this directory: `fatal: not a git repository`. Expected after initialization: a new `.git` directory exists.

- [ ] **Step 2: Create `.gitignore`**

Create `.gitignore` with:

```gitignore
node_modules/
dist/
coverage/
.DS_Store
__pycache__/
*.pyc
.superpowers/
```

- [ ] **Step 3: Create `package.json`**

Create `package.json` with:

```json
{
  "name": "ventilator-web-visualizer",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc -b && vite build",
    "preview": "vite preview --host 127.0.0.1",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^19.2.3",
    "react-dom": "^19.2.3"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^5.1.2",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.4.0",
    "@testing-library/user-event": "^14.6.1",
    "jsdom": "^27.3.0",
    "typescript": "^5.9.3",
    "vite": "^8.0.7",
    "vitest": "^4.0.16"
  }
}
```

- [ ] **Step 4: Create Vite and TypeScript config**

Create `index.html` with:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>呼吸机数据可视化</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `vite.config.ts` with:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

Create `tsconfig.json` with:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vite/client", "vitest/globals"]
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Create minimal React shell**

Create `src/test/setup.ts` with:

```ts
import '@testing-library/jest-dom/vitest';
```

Create `src/App.tsx` with:

```tsx
import './App.css';

export function App() {
  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <h1>呼吸机数据可视化</h1>
          <p>浏览器本地解析，不上传原始数据</p>
        </div>
      </header>
      <section className="empty-state">
        <h2>导入 DATAFILE 开始查看</h2>
        <p>支持选择日期目录中的 EDF-like 文件，并按日期生成摘要和图表。</p>
      </section>
    </main>
  );
}
```

Create `src/App.css` with:

```css
:root {
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #172026;
  background: #f4f7f8;
}

body {
  margin: 0;
}

button,
input,
select {
  font: inherit;
}

.app-shell {
  min-height: 100vh;
}

.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 24px;
  border-bottom: 1px solid #d7e0e3;
  background: #ffffff;
}

.top-bar h1 {
  margin: 0;
  font-size: 20px;
}

.top-bar p {
  margin: 4px 0 0;
  color: #5c6b73;
}

.empty-state {
  max-width: 720px;
  margin: 72px auto;
  padding: 28px;
  border: 1px solid #d7e0e3;
  background: #ffffff;
}
```

Create `src/main.tsx` with:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 6: Install dependencies and verify scaffold build**

Run:

```bash
npm install
npm run build
```

Expected: `npm run build` exits 0 and creates `dist/`.

- [ ] **Step 7: Commit scaffold**

Run:

```bash
git add .gitignore package.json package-lock.json index.html vite.config.ts tsconfig.json src
git commit -m "chore: scaffold ventilator visualizer app"
```

## Task 2: Binary Parser Port

**Files:**
- Create: `src/types.ts`
- Create: `src/parser/fixtures.ts`
- Create: `src/parser/edfParser.test.ts`
- Create: `src/parser/edfParser.ts`

- [ ] **Step 1: Write parser fixtures**

Create `src/parser/fixtures.ts` with:

```ts
const HEADER_BYTES = 512;

function writeAscii(bytes: Uint8Array, offset: number, width: number, value: string) {
  const encoded = new TextEncoder().encode(value);
  bytes.fill(0x20, offset, offset + width);
  bytes.set(encoded.slice(0, width), offset);
}

function writeTimestamp(bytes: Uint8Array, offset: number, date: Date) {
  const view = new DataView(bytes.buffer);
  view.setUint16(offset, date.getUTCFullYear(), true);
  bytes[offset + 2] = date.getUTCMonth() + 1;
  bytes[offset + 3] = date.getUTCDate();
  bytes[offset + 4] = date.getUTCHours();
  bytes[offset + 5] = date.getUTCMinutes();
  bytes[offset + 6] = date.getUTCSeconds();
  bytes[offset + 7] = Math.floor(date.getUTCMilliseconds() / 10);
}

export function makeEdfLikeFile(label: string, payload: Uint8Array, options: { field244?: string } = {}) {
  const header = new Uint8Array(HEADER_BYTES);
  header.fill(0x20);
  writeAscii(header, 0, 8, 'V2.12');
  writeAscii(header, 8, 80, '20393753523050090042004d');
  writeTimestamp(header, 168, new Date(Date.UTC(2026, 3, 29, 3, 3, 12, 570)));
  writeTimestamp(header, 176, new Date(Date.UTC(2026, 3, 29, 3, 13, 47, 480)));
  writeAscii(header, 184, 8, '512');
  writeAscii(header, 192, 44, 'V2.12-00001');
  writeAscii(header, 236, 8, '0');
  writeAscii(header, 244, 8, options.field244 ?? '80');
  writeAscii(header, 252, 4, '1');
  writeAscii(header, 256, 96, label);
  writeAscii(header, 360, 8, '0');
  writeAscii(header, 368, 8, '100');
  writeAscii(header, 376, 8, '0');
  writeAscii(header, 384, 8, '100');
  const file = new Uint8Array(header.length + payload.length);
  file.set(header, 0);
  file.set(payload, header.length);
  return file;
}

export function makeEventPayload(value1: number, value2: number) {
  const payload = new Uint8Array(16);
  const view = new DataView(payload.buffer);
  view.setUint32(0, value1, true);
  view.setUint32(4, value2, true);
  view.setUint16(8, 2026, true);
  payload[10] = 4;
  payload[11] = 29;
  payload[12] = 3;
  payload[13] = 4;
  payload[14] = 41;
  payload[15] = 22;
  return payload;
}
```

- [ ] **Step 2: Write failing parser tests**

Create `src/parser/edfParser.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { makeEdfLikeFile, makeEventPayload } from './fixtures';
import { parseVentilatorFile } from './edfParser';

describe('parseVentilatorFile', () => {
  it('parses header metadata and unsigned 8-bit flow values', () => {
    const file = makeEdfLikeFile('flow', new Uint8Array([20, 19, 17, 15]), { field244: '80' });

    const parsed = parseVentilatorFile('20260429_flow.edf', file);

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
    expect(Array.from(parsed.values)).toEqual([1, 151]);
  });

  it('parses real_flow as little-endian signed 16-bit values', () => {
    const payload = new Uint8Array([255, 255, 187, 255, 79, 0]);
    const file = makeEdfLikeFile('real_flow', payload);

    const parsed = parseVentilatorFile('20260429_snoredata.edf', file);

    expect(parsed.kind).toBe('waveform_i16le');
    expect(Array.from(parsed.values)).toEqual([-1, -69, 79]);
  });

  it('parses 16-byte event records', () => {
    const file = makeEdfLikeFile('hi', makeEventPayload(1, 15), { field244: '0' });

    const parsed = parseVentilatorFile('20260429_hi.edf', file);

    expect(parsed.kind).toBe('events16');
    expect(parsed.records).toEqual([
      {
        sourceLabel: 'hi',
        value1: 1,
        value2: 15,
        timestamp: '2026-04-29 03:04:41.22',
      },
    ]);
  });

  it('warns and parses complete records when payload has trailing bytes', () => {
    const file = makeEdfLikeFile('mvtvbr', new Uint8Array([1, 0, 2, 0, 3, 0, 9]));

    const parsed = parseVentilatorFile('20260429_mvtvbr.edf', file);

    expect(parsed.kind).toBe('triples_u16le');
    expect(parsed.records).toEqual([{ value1: 1, value2: 2, value3: 3 }]);
    expect(parsed.warnings).toContain('Ignored 1 trailing payload byte');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
npm test -- src/parser/edfParser.test.ts
```

Expected: FAIL because `src/parser/edfParser.ts` and `parseVentilatorFile` do not exist.

- [ ] **Step 4: Create shared types**

Create `src/types.ts` with:

```ts
export type ParsedKind =
  | 'waveform_u8'
  | 'waveform_u16le'
  | 'waveform_i16le'
  | 'events16'
  | 'triples_u16le'
  | 'raw_config'
  | 'raw'
  | 'invalid';

export interface VentilatorHeader {
  version: string;
  patientId: string;
  recordingId: string;
  startTime: string | null;
  endTime: string | null;
  headerBytes: number;
  firmware: string;
  field236: string;
  field244: string;
  signalCount: number | null;
  label: string;
  physicalDimension: string;
  physicalMin: string;
  physicalMax: string;
  digitalMin: string;
  digitalMax: string;
  sampleRateHz: number | null;
}

export interface EventRecord {
  sourceLabel: string;
  value1: number;
  value2: number;
  timestamp: string | null;
  secondsFromDayStart?: number;
}

export interface TripleRecord {
  value1: number;
  value2: number;
  value3: number;
}

export interface ParsedVentilatorFile {
  fileName: string;
  kind: ParsedKind;
  header: VentilatorHeader;
  payloadBytes: number;
  values: Uint8Array | Uint16Array | Int16Array;
  records: Array<EventRecord | TripleRecord>;
  rawPayload: Uint8Array;
  warnings: string[];
}

export interface ImportedFileRef {
  name: string;
  path: string;
  file: File;
}
```

- [ ] **Step 5: Implement parser**

Create `src/parser/edfParser.ts` with:

```ts
import type { EventRecord, ParsedKind, ParsedVentilatorFile, TripleRecord, VentilatorHeader } from '../types';

const HEADER_BYTES = 512;
const decoder = new TextDecoder('ascii');

function ascii(bytes: Uint8Array, start: number, end: number) {
  return decoder.decode(bytes.slice(start, end)).trim();
}

function parseInteger(text: string) {
  if (!text) return null;
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTimestamp(bytes: Uint8Array) {
  if (bytes.length !== 8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const year = view.getUint16(0, true);
  const month = bytes[2];
  const day = bytes[3];
  const hour = bytes[4];
  const minute = bytes[5];
  const second = bytes[6];
  const centisecond = bytes[7];
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day
    .toString()
    .padStart(2, '0')} ${hour.toString().padStart(2, '0')}:${minute
    .toString()
    .padStart(2, '0')}:${second.toString().padStart(2, '0')}.${centisecond
    .toString()
    .padStart(2, '0')}`;
}

export function parseHeader(raw: Uint8Array): VentilatorHeader {
  const headerBytes = parseInteger(ascii(raw, 184, 192)) ?? HEADER_BYTES;
  const label = ascii(raw, 256, 352);
  const field244 = ascii(raw, 244, 252);
  const sampleRate = ['flow', 'pressure', 'real_pres', 'real_flow'].includes(label)
    ? parseInteger(field244)
    : null;

  return {
    version: ascii(raw, 0, 8),
    patientId: ascii(raw, 8, 88),
    recordingId: ascii(raw, 88, 168),
    startTime: parseTimestamp(raw.slice(168, 176)),
    endTime: parseTimestamp(raw.slice(176, 184)),
    headerBytes,
    firmware: ascii(raw, 192, 236),
    field236: ascii(raw, 236, 244),
    field244,
    signalCount: parseInteger(ascii(raw, 252, 256)),
    label,
    physicalDimension: ascii(raw, 352, 360),
    physicalMin: ascii(raw, 360, 368),
    physicalMax: ascii(raw, 368, 376),
    digitalMin: ascii(raw, 376, 384),
    digitalMax: ascii(raw, 384, 392),
    sampleRateHz: sampleRate,
  };
}

function trailingWarning(byteCount: number) {
  return byteCount === 1 ? 'Ignored 1 trailing payload byte' : `Ignored ${byteCount} trailing payload bytes`;
}

function parseEvents(label: string, payload: Uint8Array, warnings: string[]): EventRecord[] {
  const trailing = payload.length % 16;
  if (trailing) warnings.push(trailingWarning(trailing));
  const records: EventRecord[] = [];
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  for (let offset = 0; offset + 16 <= payload.length; offset += 16) {
    records.push({
      sourceLabel: label,
      value1: view.getUint32(offset, true),
      value2: view.getUint32(offset + 4, true),
      timestamp: parseTimestamp(payload.slice(offset + 8, offset + 16)),
    });
  }
  return records;
}

function parseTriples(payload: Uint8Array, warnings: string[]): TripleRecord[] {
  const trailing = payload.length % 6;
  if (trailing) warnings.push(trailingWarning(trailing));
  const records: TripleRecord[] = [];
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  for (let offset = 0; offset + 6 <= payload.length; offset += 6) {
    records.push({
      value1: view.getUint16(offset, true),
      value2: view.getUint16(offset + 2, true),
      value3: view.getUint16(offset + 4, true),
    });
  }
  return records;
}

function parseUint16(payload: Uint8Array, warnings: string[]) {
  const trailing = payload.length % 2;
  if (trailing) warnings.push(trailingWarning(trailing));
  const count = Math.floor(payload.length / 2);
  const values = new Uint16Array(count);
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  for (let index = 0; index < count; index += 1) values[index] = view.getUint16(index * 2, true);
  return values;
}

function parseInt16(payload: Uint8Array, warnings: string[]) {
  const trailing = payload.length % 2;
  if (trailing) warnings.push(trailingWarning(trailing));
  const count = Math.floor(payload.length / 2);
  const values = new Int16Array(count);
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  for (let index = 0; index < count; index += 1) values[index] = view.getInt16(index * 2, true);
  return values;
}

export function parseVentilatorFile(fileName: string, raw: Uint8Array): ParsedVentilatorFile {
  if (raw.length < HEADER_BYTES) {
    const emptyHeader = parseHeader(new Uint8Array(HEADER_BYTES).fill(0x20));
    return {
      fileName,
      kind: 'invalid',
      header: emptyHeader,
      payloadBytes: 0,
      values: new Uint8Array(),
      records: [],
      rawPayload: new Uint8Array(),
      warnings: ['File is shorter than 512-byte header'],
    };
  }

  const header = parseHeader(raw.slice(0, HEADER_BYTES));
  const payload = raw.slice(header.headerBytes);
  const warnings: string[] = [];
  let kind: ParsedKind = 'raw';
  let values: ParsedVentilatorFile['values'] = new Uint8Array();
  let records: ParsedVentilatorFile['records'] = [];

  if (header.label === 'flow' || header.label === 'difleak') {
    kind = 'waveform_u8';
    values = payload;
  } else if (header.label === 'pressure' || header.label === 'real_pres') {
    kind = 'waveform_u16le';
    values = parseUint16(payload, warnings);
  } else if (header.label === 'real_flow') {
    kind = 'waveform_i16le';
    values = parseInt16(payload, warnings);
  } else if (header.label === 'mvtvbr') {
    kind = 'triples_u16le';
    records = parseTriples(payload, warnings);
  } else if (['ai', 'hi', 'ascp', 'usetime'].includes(header.label)) {
    kind = 'events16';
    records = parseEvents(header.label, payload, warnings);
  } else if (header.label === 'config') {
    kind = 'raw_config';
  }

  return {
    fileName,
    kind,
    header,
    payloadBytes: payload.length,
    values,
    records,
    rawPayload: payload,
    warnings,
  };
}
```

- [ ] **Step 6: Run parser tests**

Run:

```bash
npm test -- src/parser/edfParser.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit parser**

Run:

```bash
git add src/types.ts src/parser
git commit -m "feat: parse ventilator edf-like files in browser"
```

## Task 3: Dataset Indexing, Date Navigation Domain, and Day Loading

**Files:**
- Create: `src/data/dataset.test.ts`
- Create: `src/data/dataset.ts`
- Modify: `src/types.ts`

- [ ] **Step 1: Extend domain types**

Modify `src/types.ts` by adding:

```ts
export interface DaySummary {
  date: string;
  startTime: string | null;
  endTime: string | null;
  useDurationSeconds: number | null;
  eventCounts: Record<string, number>;
  signalPresence: Record<string, boolean>;
  sampleCounts: Record<string, number>;
  pressureRange: { min: number; max: number } | null;
  missingFiles: string[];
  warnings: string[];
}

export interface DatasetIndex {
  days: string[];
  dateRange: { start: string | null; end: string | null };
  filesByDay: Record<string, ImportedFileRef[]>;
  summariesByDay: Record<string, DaySummary>;
  warnings: string[];
}

export interface DayDetail {
  summary: DaySummary;
  files: ParsedVentilatorFile[];
  signals: ParsedVentilatorFile[];
  events: EventRecord[];
  rawFiles: ParsedVentilatorFile[];
}

export interface DateFilter {
  startDate?: string;
  endDate?: string;
  requireEvent?: 'ai' | 'hi' | 'ascp';
  missingFilesOnly?: boolean;
}
```

- [ ] **Step 2: Write failing dataset tests**

Create `src/data/dataset.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { makeEdfLikeFile, makeEventPayload } from '../parser/fixtures';
import { buildDatasetIndex, filterDays, loadDayDetail } from './dataset';
import type { ImportedFileRef } from '../types';

function fileRef(path: string, bytes: Uint8Array): ImportedFileRef {
  return {
    name: path.split('/').at(-1)!,
    path,
    file: new File([bytes], path.split('/').at(-1)!, { type: 'application/octet-stream' }),
  };
}

describe('dataset indexing', () => {
  it('groups imported files by date and computes summaries', async () => {
    const files = [
      fileRef('DATAFILE/20260429/20260429_flow.edf', makeEdfLikeFile('flow', new Uint8Array([1, 2, 3]))),
      fileRef('DATAFILE/20260429/20260429_pressure.edf', makeEdfLikeFile('pressure', new Uint8Array([1, 0, 9, 0]))),
      fileRef('DATAFILE/20260429/20260429_hi.edf', makeEdfLikeFile('hi', makeEventPayload(1, 15), { field244: '0' })),
      fileRef('DATAFILE/20260428/20260428_flow.edf', makeEdfLikeFile('flow', new Uint8Array([4, 5]))),
    ];

    const index = await buildDatasetIndex(files);

    expect(index.days).toEqual(['2026-04-28', '2026-04-29']);
    expect(index.summariesByDay['2026-04-29'].eventCounts.hi).toBe(1);
    expect(index.summariesByDay['2026-04-29'].sampleCounts.flow).toBe(3);
    expect(index.summariesByDay['2026-04-29'].pressureRange).toEqual({ min: 1, max: 9 });
  });

  it('filters dates by range, event presence, and missing files', async () => {
    const files = [
      fileRef('DATAFILE/20260429/20260429_flow.edf', makeEdfLikeFile('flow', new Uint8Array([1]))),
      fileRef('DATAFILE/20260429/20260429_hi.edf', makeEdfLikeFile('hi', makeEventPayload(1, 15), { field244: '0' })),
      fileRef('DATAFILE/20260428/20260428_pressure.edf', makeEdfLikeFile('pressure', new Uint8Array([1, 0]))),
    ];
    const index = await buildDatasetIndex(files);

    expect(filterDays(index, { requireEvent: 'hi' })).toEqual(['2026-04-29']);
    expect(filterDays(index, { missingFilesOnly: true })).toEqual(['2026-04-28', '2026-04-29']);
    expect(filterDays(index, { startDate: '2026-04-29' })).toEqual(['2026-04-29']);
  });

  it('loads full detail for a selected day', async () => {
    const files = [
      fileRef('DATAFILE/20260429/20260429_flow.edf', makeEdfLikeFile('flow', new Uint8Array([1, 2, 3]))),
      fileRef('DATAFILE/20260429/20260429_hi.edf', makeEdfLikeFile('hi', makeEventPayload(1, 15), { field244: '0' })),
    ];
    const index = await buildDatasetIndex(files);

    const detail = await loadDayDetail(index, '2026-04-29');

    expect(detail.signals.map((item) => item.header.label)).toEqual(['flow']);
    expect(detail.events).toHaveLength(1);
    expect(detail.rawFiles).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Run dataset tests to verify they fail**

Run:

```bash
npm test -- src/data/dataset.test.ts
```

Expected: FAIL because `src/data/dataset.ts` does not exist.

- [ ] **Step 4: Implement dataset module**

Create `src/data/dataset.ts` with:

```ts
import { parseVentilatorFile } from '../parser/edfParser';
import type {
  DateFilter,
  DayDetail,
  DaySummary,
  DatasetIndex,
  EventRecord,
  ImportedFileRef,
  ParsedVentilatorFile,
} from '../types';

const EXPECTED_FILES = ['flow', 'pressure', 'real_pres', 'real_flow'];

function normalizeDate(raw: string) {
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

export function inferDateFromPath(path: string) {
  const match = path.match(/(?:^|[/_-])(20\d{6})(?:[/_.-]|$)/);
  return match ? normalizeDate(match[1]) : null;
}

async function readFileBytes(file: File) {
  return new Uint8Array(await file.arrayBuffer());
}

function summarizeParsedFiles(date: string, files: ParsedVentilatorFile[]): DaySummary {
  const eventCounts: Record<string, number> = {};
  const signalPresence: Record<string, boolean> = {};
  const sampleCounts: Record<string, number> = {};
  const warnings: string[] = [];
  let startTime: string | null = null;
  let endTime: string | null = null;
  let pressureMin = Number.POSITIVE_INFINITY;
  let pressureMax = Number.NEGATIVE_INFINITY;

  for (const file of files) {
    const label = file.header.label;
    if (!startTime && file.header.startTime) startTime = file.header.startTime;
    if (file.header.endTime) endTime = file.header.endTime;
    warnings.push(...file.warnings.map((warning) => `${file.fileName}: ${warning}`));

    if (file.kind === 'events16') eventCounts[label] = file.records.length;
    if (file.values.length > 0) {
      signalPresence[label] = true;
      sampleCounts[label] = file.values.length;
    }
    if (label === 'pressure' && file.values.length > 0) {
      for (const value of file.values) {
        pressureMin = Math.min(pressureMin, value);
        pressureMax = Math.max(pressureMax, value);
      }
    }
  }

  const missingFiles = EXPECTED_FILES.filter((label) => !signalPresence[label]);

  return {
    date,
    startTime,
    endTime,
    useDurationSeconds: startTime && endTime ? secondsBetween(startTime, endTime) : null,
    eventCounts,
    signalPresence,
    sampleCounts,
    pressureRange:
      pressureMin === Number.POSITIVE_INFINITY ? null : { min: pressureMin, max: pressureMax },
    missingFiles,
    warnings,
  };
}

export function secondsBetween(start: string, end: string) {
  const startDate = new Date(start.replace(' ', 'T') + 'Z');
  const endDate = new Date(end.replace(' ', 'T') + 'Z');
  const diff = (endDate.getTime() - startDate.getTime()) / 1000;
  return Number.isFinite(diff) && diff >= 0 ? diff : null;
}

export async function buildDatasetIndex(importedFiles: ImportedFileRef[]): Promise<DatasetIndex> {
  const filesByDay: Record<string, ImportedFileRef[]> = {};
  const warnings: string[] = [];

  for (const file of importedFiles) {
    const date = inferDateFromPath(file.path || file.name);
    if (!date) {
      warnings.push(`Could not infer date for ${file.name}`);
      continue;
    }
    filesByDay[date] ??= [];
    filesByDay[date].push(file);
  }

  const summariesByDay: Record<string, DaySummary> = {};
  for (const [date, refs] of Object.entries(filesByDay)) {
    const parsed: ParsedVentilatorFile[] = [];
    for (const ref of refs) parsed.push(parseVentilatorFile(ref.name, await readFileBytes(ref.file)));
    summariesByDay[date] = summarizeParsedFiles(date, parsed);
  }

  const days = Object.keys(filesByDay).sort();
  return {
    days,
    dateRange: { start: days[0] ?? null, end: days.at(-1) ?? null },
    filesByDay,
    summariesByDay,
    warnings,
  };
}

export function filterDays(index: DatasetIndex, filter: DateFilter) {
  return index.days.filter((date) => {
    const summary = index.summariesByDay[date];
    if (filter.startDate && date < filter.startDate) return false;
    if (filter.endDate && date > filter.endDate) return false;
    if (filter.requireEvent && !summary.eventCounts[filter.requireEvent]) return false;
    if (filter.missingFilesOnly && summary.missingFiles.length === 0) return false;
    return true;
  });
}

function addSecondsFromStart(events: EventRecord[], startTime: string | null) {
  if (!startTime) return events;
  return events.map((event) => ({
    ...event,
    secondsFromDayStart: event.timestamp ? secondsBetween(startTime, event.timestamp) ?? undefined : undefined,
  }));
}

export async function loadDayDetail(index: DatasetIndex, date: string): Promise<DayDetail> {
  const refs = index.filesByDay[date] ?? [];
  const files: ParsedVentilatorFile[] = [];
  for (const ref of refs) files.push(parseVentilatorFile(ref.name, await readFileBytes(ref.file)));
  const summary = summarizeParsedFiles(date, files);
  const events = addSecondsFromStart(
    files.flatMap((file) => (file.kind === 'events16' ? (file.records as EventRecord[]) : [])),
    summary.startTime,
  );

  return {
    summary,
    files,
    signals: files.filter((file) => file.values.length > 0),
    events,
    rawFiles: files,
  };
}
```

- [ ] **Step 5: Run dataset tests**

Run:

```bash
npm test -- src/data/dataset.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run parser and dataset tests together**

Run:

```bash
npm test -- src/parser/edfParser.test.ts src/data/dataset.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit dataset domain**

Run:

```bash
git add src/types.ts src/data
git commit -m "feat: index ventilator datasets by date"
```

## Task 4: CSV Export and Downsampling Utilities

**Files:**
- Create: `src/data/csv.test.ts`
- Create: `src/data/csv.ts`
- Create: `src/charts/downsample.test.ts`
- Create: `src/charts/downsample.ts`

- [ ] **Step 1: Write failing CSV tests**

Create `src/data/csv.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { exportEventsCsv, exportWaveformCsv } from './csv';

describe('csv exports', () => {
  it('exports waveform rows with seconds', () => {
    expect(exportWaveformCsv(new Uint8Array([10, 20]), 80)).toBe('index,seconds,value\n0,0.000000,10\n1,0.012500,20\n');
  });

  it('exports event rows', () => {
    expect(
      exportEventsCsv([
        {
          sourceLabel: 'hi',
          value1: 1,
          value2: 15,
          timestamp: '2026-04-29 03:04:41.22',
          secondsFromDayStart: 89.65,
        },
      ]),
    ).toBe('index,source,value1,value2,timestamp,secondsFromDayStart\n0,hi,1,15,2026-04-29 03:04:41.22,89.650000\n');
  });
});
```

- [ ] **Step 2: Write failing downsampling tests**

Create `src/charts/downsample.test.ts` with:

```ts
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
      { index: 2, value: 2 },
      { index: 3, value: 8 },
    ]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
npm test -- src/data/csv.test.ts src/charts/downsample.test.ts
```

Expected: FAIL because modules do not exist.

- [ ] **Step 4: Implement CSV helpers**

Create `src/data/csv.ts` with:

```ts
import type { EventRecord } from '../types';

function line(values: Array<string | number | null | undefined>) {
  return values.map((value) => String(value ?? '')).join(',') + '\n';
}

export function exportWaveformCsv(values: Uint8Array | Uint16Array | Int16Array, sampleRateHz: number | null) {
  let csv = sampleRateHz ? 'index,seconds,value\n' : 'index,value\n';
  for (let index = 0; index < values.length; index += 1) {
    csv += sampleRateHz
      ? line([index, (index / sampleRateHz).toFixed(6), values[index]])
      : line([index, values[index]]);
  }
  return csv;
}

export function exportEventsCsv(events: EventRecord[]) {
  let csv = 'index,source,value1,value2,timestamp,secondsFromDayStart\n';
  events.forEach((event, index) => {
    csv += line([
      index,
      event.sourceLabel,
      event.value1,
      event.value2,
      event.timestamp,
      event.secondsFromDayStart === undefined ? '' : event.secondsFromDayStart.toFixed(6),
    ]);
  });
  return csv;
}

export function downloadCsv(fileName: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 5: Implement downsampling**

Create `src/charts/downsample.ts` with:

```ts
export interface ChartPoint {
  index: number;
  value: number;
}

export function downsampleMinMax(
  values: Uint8Array | Uint16Array | Int16Array,
  startIndex: number,
  endIndex: number,
  pixelWidth: number,
): ChartPoint[] {
  const start = Math.max(0, Math.floor(startIndex));
  const end = Math.min(values.length, Math.ceil(endIndex));
  const count = Math.max(0, end - start);
  if (count === 0 || pixelWidth <= 0) return [];
  if (count <= pixelWidth * 2) {
    return Array.from({ length: count }, (_, offset) => ({
      index: start + offset,
      value: values[start + offset],
    }));
  }

  const bucketSize = count / pixelWidth;
  const points: ChartPoint[] = [];
  for (let bucket = 0; bucket < pixelWidth; bucket += 1) {
    const bucketStart = Math.floor(start + bucket * bucketSize);
    const bucketEnd = Math.min(end, Math.floor(start + (bucket + 1) * bucketSize));
    let minIndex = bucketStart;
    let maxIndex = bucketStart;
    for (let index = bucketStart; index < bucketEnd; index += 1) {
      if (values[index] < values[minIndex]) minIndex = index;
      if (values[index] > values[maxIndex]) maxIndex = index;
    }
    const first = minIndex < maxIndex ? minIndex : maxIndex;
    const second = minIndex < maxIndex ? maxIndex : minIndex;
    points.push({ index: first, value: values[first] });
    if (second !== first) points.push({ index: second, value: values[second] });
  }
  return points.sort((a, b) => a.index - b.index);
}
```

- [ ] **Step 6: Run utility tests**

Run:

```bash
npm test -- src/data/csv.test.ts src/charts/downsample.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit utilities**

Run:

```bash
git add src/data/csv.ts src/data/csv.test.ts src/charts
git commit -m "feat: add csv export and waveform downsampling"
```

## Task 5: Import Flow and App State

**Files:**
- Create: `src/components/ImportPanel.tsx`
- Create: `src/components/ImportPanel.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Write failing import component test**

Create `src/components/ImportPanel.test.tsx` with:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ImportPanel } from './ImportPanel';

describe('ImportPanel', () => {
  it('passes selected files to the importer', async () => {
    const onImport = vi.fn();
    render(<ImportPanel onImport={onImport} disabled={false} />);
    const file = new File([new Uint8Array([1, 2, 3])], '20260429_flow.edf');

    await userEvent.upload(screen.getByLabelText('选择 EDF 文件'), file);

    expect(onImport).toHaveBeenCalledWith([
      expect.objectContaining({
        name: '20260429_flow.edf',
        path: '20260429_flow.edf',
        file,
      }),
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/components/ImportPanel.test.tsx
```

Expected: FAIL because `ImportPanel` does not exist.

- [ ] **Step 3: Implement import panel**

Create `src/components/ImportPanel.tsx` with:

```tsx
import type { ImportedFileRef } from '../types';

interface ImportPanelProps {
  disabled: boolean;
  onImport: (files: ImportedFileRef[]) => void;
}

function toImportedFile(file: File): ImportedFileRef {
  return {
    name: file.name,
    path: file.webkitRelativePath || file.name,
    file,
  };
}

export function ImportPanel({ disabled, onImport }: ImportPanelProps) {
  return (
    <div className="import-panel">
      <label className="import-button">
        选择 DATAFILE 文件夹
        <input
          type="file"
          multiple
          // React types do not expose webkitdirectory, but Chromium-based browsers support it.
          {...({ webkitdirectory: 'true', directory: 'true' } as Record<string, string>)}
          disabled={disabled}
          onChange={(event) => {
            onImport(Array.from(event.currentTarget.files ?? []).map(toImportedFile));
            event.currentTarget.value = '';
          }}
        />
      </label>
      <label className="secondary-button">
        选择 EDF 文件
        <input
          aria-label="选择 EDF 文件"
          type="file"
          multiple
          accept=".edf,.bin"
          disabled={disabled}
          onChange={(event) => {
            onImport(Array.from(event.currentTarget.files ?? []).map(toImportedFile));
            event.currentTarget.value = '';
          }}
        />
      </label>
    </div>
  );
}
```

- [ ] **Step 4: Wire import state into `App.tsx`**

Replace `src/App.tsx` with:

```tsx
import { useState } from 'react';
import './App.css';
import { buildDatasetIndex } from './data/dataset';
import { ImportPanel } from './components/ImportPanel';
import type { DatasetIndex, ImportedFileRef } from './types';

export function App() {
  const [dataset, setDataset] = useState<DatasetIndex | null>(null);
  const [isIndexing, setIsIndexing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleImport(files: ImportedFileRef[]) {
    setIsIndexing(true);
    setError(null);
    try {
      setDataset(await buildDatasetIndex(files));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '导入失败');
    } finally {
      setIsIndexing(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <h1>呼吸机数据可视化</h1>
          <p>浏览器本地解析，不上传原始数据</p>
        </div>
        <ImportPanel onImport={handleImport} disabled={isIndexing} />
      </header>

      {error ? <div className="notice error">{error}</div> : null}
      {isIndexing ? <div className="notice">正在索引文件...</div> : null}

      {dataset ? (
        <section className="dataset-status">
          <h2>数据集</h2>
          <p>
            {dataset.days.length} 天 · {dataset.dateRange.start ?? '-'} 至 {dataset.dateRange.end ?? '-'}
          </p>
        </section>
      ) : (
        <section className="empty-state">
          <h2>导入 DATAFILE 开始查看</h2>
          <p>支持选择日期目录中的 EDF-like 文件，并按日期生成摘要和图表。</p>
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 5: Extend CSS for import controls**

Append to `src/App.css`:

```css
.import-panel {
  display: flex;
  align-items: center;
  gap: 10px;
}

.import-button,
.secondary-button {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid #afc0c7;
  background: #ffffff;
  cursor: pointer;
}

.import-button {
  background: #16697a;
  color: #ffffff;
  border-color: #16697a;
}

.import-button input,
.secondary-button input {
  display: none;
}

.notice {
  margin: 16px 24px 0;
  padding: 10px 12px;
  border: 1px solid #c7d8dd;
  background: #eef6f8;
}

.notice.error {
  border-color: #e2a9a2;
  background: #fff0ed;
}

.dataset-status {
  margin: 24px;
  padding: 16px;
  border: 1px solid #d7e0e3;
  background: #ffffff;
}
```

- [ ] **Step 6: Run import tests and build**

Run:

```bash
npm test -- src/components/ImportPanel.test.tsx
npm run build
```

Expected: PASS and build exits 0.

- [ ] **Step 7: Commit import flow**

Run:

```bash
git add src/App.tsx src/App.css src/components/ImportPanel.tsx src/components/ImportPanel.test.tsx
git commit -m "feat: import local ventilator files"
```

## Task 6: Date Navigator and Summary View

**Files:**
- Create: `src/components/DateNavigator.tsx`
- Create: `src/components/DateNavigator.test.tsx`
- Create: `src/components/SummaryCards.tsx`
- Create: `src/components/SummaryCards.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Write failing DateNavigator test**

Create `src/components/DateNavigator.test.tsx` with:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DateNavigator } from './DateNavigator';
import type { DatasetIndex } from '../types';

const index: DatasetIndex = {
  days: ['2026-04-27', '2026-04-28', '2026-04-29'],
  dateRange: { start: '2026-04-27', end: '2026-04-29' },
  filesByDay: {},
  warnings: [],
  summariesByDay: {
    '2026-04-27': { date: '2026-04-27', startTime: null, endTime: null, useDurationSeconds: null, eventCounts: { hi: 3 }, signalPresence: {}, sampleCounts: {}, pressureRange: null, missingFiles: ['flow'], warnings: [] },
    '2026-04-28': { date: '2026-04-28', startTime: null, endTime: null, useDurationSeconds: null, eventCounts: { hi: 6 }, signalPresence: {}, sampleCounts: {}, pressureRange: null, missingFiles: [], warnings: [] },
    '2026-04-29': { date: '2026-04-29', startTime: null, endTime: null, useDurationSeconds: null, eventCounts: { hi: 8 }, signalPresence: {}, sampleCounts: {}, pressureRange: null, missingFiles: [], warnings: [] },
  },
};

describe('DateNavigator', () => {
  it('jumps to a typed date and moves between available dates', async () => {
    const onSelectDate = vi.fn();
    render(<DateNavigator dataset={index} selectedDate="2026-04-28" onSelectDate={onSelectDate} />);

    await userEvent.clear(screen.getByLabelText('跳转日期'));
    await userEvent.type(screen.getByLabelText('跳转日期'), '2026-04-29');
    await userEvent.click(screen.getByRole('button', { name: '跳转' }));
    await userEvent.click(screen.getByRole('button', { name: '上一天' }));

    expect(onSelectDate).toHaveBeenNthCalledWith(1, '2026-04-29');
    expect(onSelectDate).toHaveBeenNthCalledWith(2, '2026-04-27');
  });
});
```

- [ ] **Step 2: Write failing SummaryCards test**

Create `src/components/SummaryCards.test.tsx` with:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SummaryCards } from './SummaryCards';

describe('SummaryCards', () => {
  it('renders daily summary metrics', () => {
    render(
      <SummaryCards
        summary={{
          date: '2026-04-29',
          startTime: '2026-04-29 03:03:12.57',
          endTime: '2026-04-29 03:13:47.48',
          useDurationSeconds: 634.91,
          eventCounts: { ai: 28, hi: 8, ascp: 301 },
          signalPresence: {},
          sampleCounts: { flow: 283224 },
          pressureRange: { min: 0, max: 151 },
          missingFiles: [],
          warnings: [],
        }}
      />,
    );

    expect(screen.getByText('10:34')).toBeInTheDocument();
    expect(screen.getByText('28 / 8')).toBeInTheDocument();
    expect(screen.getByText('0 - 151')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
npm test -- src/components/DateNavigator.test.tsx src/components/SummaryCards.test.tsx
```

Expected: FAIL because components do not exist.

- [ ] **Step 4: Implement `DateNavigator`**

Create `src/components/DateNavigator.tsx` with:

```tsx
import { useMemo, useState } from 'react';
import { filterDays } from '../data/dataset';
import type { DatasetIndex } from '../types';

interface DateNavigatorProps {
  dataset: DatasetIndex;
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

export function DateNavigator({ dataset, selectedDate, onSelectDate }: DateNavigatorProps) {
  const [jumpDate, setJumpDate] = useState(selectedDate);
  const [missingOnly, setMissingOnly] = useState(false);
  const filteredDays = useMemo(
    () => filterDays(dataset, { missingFilesOnly: missingOnly }),
    [dataset, missingOnly],
  );
  const selectedIndex = dataset.days.indexOf(selectedDate);

  function move(offset: number) {
    const next = dataset.days[selectedIndex + offset];
    if (next) onSelectDate(next);
  }

  return (
    <aside className="date-navigator">
      <h2>日期导航</h2>
      <label>
        跳转日期
        <input value={jumpDate} onChange={(event) => setJumpDate(event.target.value)} />
      </label>
      <div className="nav-row">
        <button type="button" onClick={() => move(-1)} disabled={selectedIndex <= 0}>
          上一天
        </button>
        <button type="button" onClick={() => move(1)} disabled={selectedIndex >= dataset.days.length - 1}>
          下一天
        </button>
        <button type="button" onClick={() => dataset.days.includes(jumpDate) && onSelectDate(jumpDate)}>
          跳转
        </button>
      </div>
      <label className="checkbox-row">
        <input type="checkbox" checked={missingOnly} onChange={(event) => setMissingOnly(event.target.checked)} />
        只看缺失文件日期
      </label>
      <div className="heatmap" aria-label="日期热力图">
        {dataset.days.slice(-90).map((date) => (
          <button
            type="button"
            key={date}
            className={date === selectedDate ? 'heat-cell active' : 'heat-cell'}
            title={date}
            onClick={() => onSelectDate(date)}
          />
        ))}
      </div>
      <div className="bounded-results">
        <h3>匹配结果</h3>
        {filteredDays.slice(0, 20).map((date) => (
          <button type="button" key={date} className="result-row" onClick={() => onSelectDate(date)}>
            <strong>{date}</strong>
            <span>HI {dataset.summariesByDay[date].eventCounts.hi ?? 0}</span>
          </button>
        ))}
        {filteredDays.length > 20 ? <p>还有 {filteredDays.length - 20} 天未显示，请缩小筛选范围。</p> : null}
      </div>
    </aside>
  );
}
```

- [ ] **Step 5: Implement `SummaryCards`**

Create `src/components/SummaryCards.tsx` with:

```tsx
import type { DaySummary } from '../types';

function duration(seconds: number | null) {
  if (seconds === null) return '-';
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

interface SummaryCardsProps {
  summary: DaySummary;
}

export function SummaryCards({ summary }: SummaryCardsProps) {
  return (
    <section className="summary-grid">
      <article>
        <span>使用时长</span>
        <strong>{duration(summary.useDurationSeconds)}</strong>
      </article>
      <article>
        <span>AI / HI</span>
        <strong>{summary.eventCounts.ai ?? 0} / {summary.eventCounts.hi ?? 0}</strong>
      </article>
      <article>
        <span>压力范围</span>
        <strong>{summary.pressureRange ? `${summary.pressureRange.min} - ${summary.pressureRange.max}` : '-'}</strong>
      </article>
      <article>
        <span>缺失文件</span>
        <strong>{summary.missingFiles.length}</strong>
      </article>
    </section>
  );
}
```

- [ ] **Step 6: Wire date navigator into App**

Modify `src/App.tsx` to keep `selectedDate`, render `DateNavigator`, and render `SummaryCards`. The final file should contain:

```tsx
import { useEffect, useState } from 'react';
import './App.css';
import { buildDatasetIndex } from './data/dataset';
import { DateNavigator } from './components/DateNavigator';
import { ImportPanel } from './components/ImportPanel';
import { SummaryCards } from './components/SummaryCards';
import type { DatasetIndex, ImportedFileRef } from './types';

export function App() {
  const [dataset, setDataset] = useState<DatasetIndex | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isIndexing, setIsIndexing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (dataset && !selectedDate) setSelectedDate(dataset.days.at(-1) ?? null);
  }, [dataset, selectedDate]);

  async function handleImport(files: ImportedFileRef[]) {
    setIsIndexing(true);
    setError(null);
    try {
      const nextDataset = await buildDatasetIndex(files);
      setDataset(nextDataset);
      setSelectedDate(nextDataset.days.at(-1) ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '导入失败');
    } finally {
      setIsIndexing(false);
    }
  }

  const summary = dataset && selectedDate ? dataset.summariesByDay[selectedDate] : null;

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <h1>呼吸机数据可视化</h1>
          <p>浏览器本地解析，不上传原始数据</p>
        </div>
        <ImportPanel onImport={handleImport} disabled={isIndexing} />
      </header>

      {error ? <div className="notice error">{error}</div> : null}
      {isIndexing ? <div className="notice">正在索引文件...</div> : null}

      {dataset && selectedDate && summary ? (
        <div className="workbench">
          <DateNavigator dataset={dataset} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
          <section className="main-panel">
            <div className="selected-day-header">
              <h2>{selectedDate}</h2>
              <p>{summary.startTime ?? '-'} 至 {summary.endTime ?? '-'}</p>
            </div>
            <SummaryCards summary={summary} />
          </section>
        </div>
      ) : (
        <section className="empty-state">
          <h2>导入 DATAFILE 开始查看</h2>
          <p>支持选择日期目录中的 EDF-like 文件，并按日期生成摘要和图表。</p>
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 7: Add layout CSS**

Append to `src/App.css`:

```css
.workbench {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 16px;
  padding: 16px 24px 24px;
}

.date-navigator,
.main-panel {
  border: 1px solid #d7e0e3;
  background: #ffffff;
}

.date-navigator {
  padding: 14px;
}

.date-navigator h2,
.selected-day-header h2 {
  margin: 0 0 10px;
}

.date-navigator label {
  display: grid;
  gap: 6px;
}

.date-navigator input {
  min-height: 34px;
  padding: 0 8px;
  border: 1px solid #afc0c7;
}

.nav-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  margin-top: 10px;
}

.checkbox-row {
  display: flex;
  align-items: center;
  margin-top: 12px;
}

.heatmap {
  display: grid;
  grid-template-columns: repeat(15, 1fr);
  gap: 4px;
  margin-top: 14px;
}

.heat-cell {
  aspect-ratio: 1;
  border: 1px solid #c7d8dd;
  background: #dbe9ed;
}

.heat-cell.active {
  background: #16697a;
}

.bounded-results {
  margin-top: 16px;
}

.result-row {
  display: flex;
  justify-content: space-between;
  width: 100%;
  margin-top: 8px;
  padding: 8px;
  border: 1px solid #d7e0e3;
  background: #f8fbfc;
  text-align: left;
}

.main-panel {
  padding: 16px;
}

.selected-day-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: baseline;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.summary-grid article {
  padding: 12px;
  border: 1px solid #d7e0e3;
  background: #f8fbfc;
}

.summary-grid span {
  display: block;
  color: #5c6b73;
}

.summary-grid strong {
  display: block;
  margin-top: 6px;
  font-size: 20px;
}
```

- [ ] **Step 8: Run component tests and build**

Run:

```bash
npm test -- src/components/DateNavigator.test.tsx src/components/SummaryCards.test.tsx
npm run build
```

Expected: PASS and build exits 0.

- [ ] **Step 9: Commit date navigation and summaries**

Run:

```bash
git add src/App.tsx src/App.css src/components/DateNavigator.tsx src/components/DateNavigator.test.tsx src/components/SummaryCards.tsx src/components/SummaryCards.test.tsx
git commit -m "feat: add scalable date navigation"
```

## Task 7: Canvas Waveform Chart and Day Detail Loading

**Files:**
- Create: `src/charts/WaveformCanvas.tsx`
- Create: `src/charts/WaveformCanvas.test.tsx`
- Create: `src/components/DayCharts.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Write failing WaveformCanvas test**

Create `src/charts/WaveformCanvas.test.tsx` with:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WaveformCanvas } from './WaveformCanvas';

describe('WaveformCanvas', () => {
  it('renders an accessible canvas label and sample count', () => {
    render(<WaveformCanvas label="flow" values={new Uint8Array([1, 2, 3])} sampleRateHz={80} />);

    expect(screen.getByLabelText('flow waveform')).toBeInTheDocument();
    expect(screen.getByText('3 samples · 80 Hz')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/charts/WaveformCanvas.test.tsx
```

Expected: FAIL because `WaveformCanvas` does not exist.

- [ ] **Step 3: Implement `WaveformCanvas`**

Create `src/charts/WaveformCanvas.tsx` with:

```tsx
import { useEffect, useRef } from 'react';
import { downsampleMinMax } from './downsample';

interface WaveformCanvasProps {
  label: string;
  values: Uint8Array | Uint16Array | Int16Array;
  sampleRateHz: number | null;
  eventSeconds?: number[];
}

export function WaveformCanvas({ label, values, sampleRateHz, eventSeconds = [] }: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const rect = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * scale));
    canvas.height = Math.max(1, Math.floor(rect.height * scale));
    context.scale(scale, scale);
    context.clearRect(0, 0, rect.width, rect.height);
    context.strokeStyle = '#16697a';
    context.lineWidth = 1.5;

    if (values.length === 0) return;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const value of values) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    const range = max - min || 1;
    const points = downsampleMinMax(values, 0, values.length, Math.max(1, Math.floor(rect.width)));
    context.beginPath();
    points.forEach((point, index) => {
      const x = (point.index / Math.max(1, values.length - 1)) * rect.width;
      const y = rect.height - ((point.value - min) / range) * rect.height;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();

    context.strokeStyle = '#d1495b';
    context.lineWidth = 1;
    for (const second of eventSeconds) {
      if (!sampleRateHz) continue;
      const x = ((second * sampleRateHz) / Math.max(1, values.length - 1)) * rect.width;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, rect.height);
      context.stroke();
    }
  }, [eventSeconds, sampleRateHz, values]);

  return (
    <section className="waveform-panel">
      <div className="chart-header">
        <h3>{label}</h3>
        <span>{values.length} samples · {sampleRateHz ?? '-'} Hz</span>
      </div>
      <canvas ref={canvasRef} aria-label={`${label} waveform`} />
    </section>
  );
}
```

- [ ] **Step 4: Implement `DayCharts`**

Create `src/components/DayCharts.tsx` with:

```tsx
import { WaveformCanvas } from '../charts/WaveformCanvas';
import type { DayDetail } from '../types';

interface DayChartsProps {
  detail: DayDetail;
}

export function DayCharts({ detail }: DayChartsProps) {
  const eventSeconds = detail.events
    .map((event) => event.secondsFromDayStart)
    .filter((value): value is number => typeof value === 'number');

  return (
    <section className="day-charts">
      {detail.signals.length === 0 ? <p>当前日期没有可显示的波形文件。</p> : null}
      {detail.signals.map((signal) => (
        <WaveformCanvas
          key={signal.fileName}
          label={signal.header.label}
          values={signal.values}
          sampleRateHz={signal.header.sampleRateHz}
          eventSeconds={eventSeconds}
        />
      ))}
    </section>
  );
}
```

- [ ] **Step 5: Load day detail in App**

Modify `src/App.tsx` to import and use `loadDayDetail`, `DayCharts`, and `DayDetail`. Add state:

```tsx
const [dayDetail, setDayDetail] = useState<DayDetail | null>(null);
const [isLoadingDay, setIsLoadingDay] = useState(false);
```

Add effect:

```tsx
useEffect(() => {
  if (!dataset || !selectedDate) {
    setDayDetail(null);
    return;
  }
  let cancelled = false;
  setIsLoadingDay(true);
  loadDayDetail(dataset, selectedDate)
    .then((detail) => {
      if (!cancelled) setDayDetail(detail);
    })
    .finally(() => {
      if (!cancelled) setIsLoadingDay(false);
    });
  return () => {
    cancelled = true;
  };
}, [dataset, selectedDate]);
```

Render below `SummaryCards`:

```tsx
{isLoadingDay ? <div className="notice">正在解析当前日期...</div> : null}
{dayDetail ? <DayCharts detail={dayDetail} /> : null}
```

The import section at the top of `src/App.tsx` must include:

```tsx
import { buildDatasetIndex, loadDayDetail } from './data/dataset';
import { DayCharts } from './components/DayCharts';
import type { DatasetIndex, DayDetail, ImportedFileRef } from './types';
```

- [ ] **Step 6: Add chart CSS**

Append to `src/App.css`:

```css
.day-charts {
  display: grid;
  gap: 12px;
  margin-top: 16px;
}

.waveform-panel {
  border: 1px solid #d7e0e3;
  background: #ffffff;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid #d7e0e3;
}

.chart-header h3 {
  margin: 0;
}

.waveform-panel canvas {
  display: block;
  width: 100%;
  height: 180px;
}
```

- [ ] **Step 7: Run chart tests and build**

Run:

```bash
npm test -- src/charts/WaveformCanvas.test.tsx
npm run build
```

Expected: PASS and build exits 0.

- [ ] **Step 8: Commit charts**

Run:

```bash
git add src/App.tsx src/App.css src/charts/WaveformCanvas.tsx src/charts/WaveformCanvas.test.tsx src/components/DayCharts.tsx
git commit -m "feat: render selected-day waveform charts"
```

## Task 8: Event Table, Raw File Browser, and CSV Downloads

**Files:**
- Create: `src/components/EventTable.tsx`
- Create: `src/components/EventTable.test.tsx`
- Create: `src/components/RawFileBrowser.tsx`
- Create: `src/components/RawFileBrowser.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Write failing EventTable test**

Create `src/components/EventTable.test.tsx` with:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EventTable } from './EventTable';

describe('EventTable', () => {
  it('renders events and reports selected event seconds', async () => {
    const onSelect = vi.fn();
    render(
      <EventTable
        events={[{ sourceLabel: 'hi', value1: 1, value2: 15, timestamp: '2026-04-29 03:04:41.22', secondsFromDayStart: 89.65 }]}
        onSelectEvent={onSelect}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /hi/ }));

    expect(screen.getByText('2026-04-29 03:04:41.22')).toBeInTheDocument();
    expect(onSelect).toHaveBeenCalledWith(89.65);
  });
});
```

- [ ] **Step 2: Write failing RawFileBrowser test**

Create `src/components/RawFileBrowser.test.tsx` with:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RawFileBrowser } from './RawFileBrowser';
import type { ParsedVentilatorFile } from '../types';

const file: ParsedVentilatorFile = {
  fileName: '20260429_flow.edf',
  kind: 'waveform_u8',
  header: {
    version: 'V2.12',
    patientId: 'device',
    recordingId: '',
    startTime: '2026-04-29 03:03:12.57',
    endTime: '2026-04-29 03:13:47.48',
    headerBytes: 512,
    firmware: 'V2.12-00001',
    field236: '0',
    field244: '80',
    signalCount: 1,
    label: 'flow',
    physicalDimension: '',
    physicalMin: '0',
    physicalMax: '100',
    digitalMin: '0',
    digitalMax: '100',
    sampleRateHz: 80,
  },
  payloadBytes: 3,
  values: new Uint8Array([20, 19, 17]),
  records: [],
  rawPayload: new Uint8Array([20, 19, 17]),
  warnings: [],
};

describe('RawFileBrowser', () => {
  it('shows header fields and decoded preview', () => {
    render(<RawFileBrowser files={[file]} />);

    expect(screen.getByText('20260429_flow.edf')).toBeInTheDocument();
    expect(screen.getByText('waveform_u8')).toBeInTheDocument();
    expect(screen.getByText('20, 19, 17')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
npm test -- src/components/EventTable.test.tsx src/components/RawFileBrowser.test.tsx
```

Expected: FAIL because components do not exist.

- [ ] **Step 4: Implement `EventTable`**

Create `src/components/EventTable.tsx` with:

```tsx
import type { EventRecord } from '../types';

interface EventTableProps {
  events: EventRecord[];
  onSelectEvent: (seconds: number) => void;
}

export function EventTable({ events, onSelectEvent }: EventTableProps) {
  return (
    <section className="event-table">
      <h3>事件</h3>
      {events.length === 0 ? <p>当前日期没有事件记录。</p> : null}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>类型</th>
              <th>时间</th>
              <th>值 1</th>
              <th>值 2</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event, index) => (
              <tr key={`${event.sourceLabel}-${event.timestamp}-${index}`}>
                <td>
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof event.secondsFromDayStart === 'number') onSelectEvent(event.secondsFromDayStart);
                    }}
                  >
                    {event.sourceLabel}
                  </button>
                </td>
                <td>{event.timestamp ?? '-'}</td>
                <td>{event.value1}</td>
                <td>{event.value2}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Implement `RawFileBrowser`**

Create `src/components/RawFileBrowser.tsx` with:

```tsx
import { downloadCsv, exportEventsCsv, exportWaveformCsv } from '../data/csv';
import type { EventRecord, ParsedVentilatorFile } from '../types';

interface RawFileBrowserProps {
  files: ParsedVentilatorFile[];
}

function preview(file: ParsedVentilatorFile) {
  if (file.values.length > 0) return Array.from(file.values.slice(0, 12)).join(', ');
  if (file.kind === 'events16') {
    return (file.records as EventRecord[])
      .slice(0, 3)
      .map((record) => `${record.sourceLabel}:${record.value1}/${record.value2}@${record.timestamp}`)
      .join(' | ');
  }
  return Array.from(file.rawPayload.slice(0, 16))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join(' ');
}

function exportFile(file: ParsedVentilatorFile) {
  if (file.values.length > 0) {
    downloadCsv(`${file.fileName}.csv`, exportWaveformCsv(file.values, file.header.sampleRateHz));
  } else if (file.kind === 'events16') {
    downloadCsv(`${file.fileName}.csv`, exportEventsCsv(file.records as EventRecord[]));
  }
}

export function RawFileBrowser({ files }: RawFileBrowserProps) {
  return (
    <section className="raw-browser">
      <h3>原始文件</h3>
      {files.map((file) => (
        <details key={file.fileName}>
          <summary>
            <strong>{file.fileName}</strong>
            <span>{file.kind}</span>
          </summary>
          <dl>
            <div><dt>Label</dt><dd>{file.header.label}</dd></div>
            <div><dt>Header</dt><dd>{file.header.headerBytes} bytes</dd></div>
            <div><dt>Payload</dt><dd>{file.payloadBytes} bytes</dd></div>
            <div><dt>Start</dt><dd>{file.header.startTime ?? '-'}</dd></div>
            <div><dt>End</dt><dd>{file.header.endTime ?? '-'}</dd></div>
            <div><dt>Preview</dt><dd>{preview(file)}</dd></div>
          </dl>
          {file.warnings.map((warning) => <p className="warning" key={warning}>{warning}</p>)}
          {file.values.length > 0 || file.kind === 'events16' ? (
            <button type="button" onClick={() => exportFile(file)}>
              导出 CSV
            </button>
          ) : null}
        </details>
      ))}
    </section>
  );
}
```

- [ ] **Step 6: Wire event table and raw browser into App**

Modify `src/App.tsx` to import:

```tsx
import { EventTable } from './components/EventTable';
import { RawFileBrowser } from './components/RawFileBrowser';
```

Add state:

```tsx
const [focusedEventSecond, setFocusedEventSecond] = useState<number | null>(null);
```

Render below `DayCharts`:

```tsx
{focusedEventSecond !== null ? <div className="notice">已定位事件：{focusedEventSecond.toFixed(2)} 秒</div> : null}
{dayDetail ? (
  <div className="detail-grid">
    <EventTable events={dayDetail.events} onSelectEvent={setFocusedEventSecond} />
    <RawFileBrowser files={dayDetail.rawFiles} />
  </div>
) : null}
```

- [ ] **Step 7: Add table and raw browser CSS**

Append to `src/App.css`:

```css
.detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  margin-top: 16px;
}

.event-table,
.raw-browser {
  border: 1px solid #d7e0e3;
  background: #ffffff;
  padding: 12px;
}

.event-table h3,
.raw-browser h3 {
  margin: 0 0 10px;
}

.table-scroll {
  max-height: 320px;
  overflow: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: 6px 8px;
  border-bottom: 1px solid #e5ecef;
  text-align: left;
}

.raw-browser details {
  padding: 8px 0;
  border-bottom: 1px solid #e5ecef;
}

.raw-browser summary {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
}

.raw-browser dl {
  display: grid;
  gap: 6px;
  margin: 10px 0;
}

.raw-browser dl div {
  display: grid;
  grid-template-columns: 90px minmax(0, 1fr);
  gap: 8px;
}

.raw-browser dt {
  color: #5c6b73;
}

.raw-browser dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.warning {
  color: #9d3f32;
}
```

- [ ] **Step 8: Run component tests and build**

Run:

```bash
npm test -- src/components/EventTable.test.tsx src/components/RawFileBrowser.test.tsx
npm run build
```

Expected: PASS and build exits 0.

- [ ] **Step 9: Commit events and raw browser**

Run:

```bash
git add src/App.tsx src/App.css src/components/EventTable.tsx src/components/EventTable.test.tsx src/components/RawFileBrowser.tsx src/components/RawFileBrowser.test.tsx
git commit -m "feat: inspect events and raw decoded files"
```

## Task 9: Chart Interactions and Event Focus

**Files:**
- Modify: `src/charts/WaveformCanvas.test.tsx`
- Modify: `src/charts/WaveformCanvas.tsx`
- Modify: `src/components/DayCharts.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace WaveformCanvas test with interaction coverage**

Replace `src/charts/WaveformCanvas.test.tsx` with:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WaveformCanvas } from './WaveformCanvas';

const context = {
  beginPath: vi.fn(),
  clearRect: vi.fn(),
  lineTo: vi.fn(),
  moveTo: vi.fn(),
  scale: vi.fn(),
  setTransform: vi.fn(),
  stroke: vi.fn(),
  strokeStyle: '',
  lineWidth: 1,
};

describe('WaveformCanvas', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 400,
      height: 180,
      top: 0,
      right: 400,
      bottom: 180,
      left: 0,
      toJSON: () => ({}),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders an accessible canvas label and sample count', () => {
    render(<WaveformCanvas label="flow" values={new Uint8Array([1, 2, 3])} sampleRateHz={80} />);

    expect(screen.getByLabelText('flow waveform')).toBeInTheDocument();
    expect(screen.getByText('3 samples · 80 Hz')).toBeInTheDocument();
  });

  it('shows hover readout and reset zoom control', () => {
    render(<WaveformCanvas label="flow" values={new Uint8Array([10, 20, 30, 40])} sampleRateHz={80} />);

    fireEvent.pointerMove(screen.getByLabelText('flow waveform'), { clientX: 200 });
    fireEvent.wheel(screen.getByLabelText('flow waveform'), { deltaY: -100, clientX: 200 });
    fireEvent.click(screen.getByRole('button', { name: '重置缩放' }));

    expect(screen.getByText(/index/)).toBeInTheDocument();
  });

  it('centers the viewport around a focused event second', () => {
    render(
      <WaveformCanvas
        label="flow"
        values={new Uint8Array(Array.from({ length: 400 }, (_, index) => index % 255))}
        sampleRateHz={80}
        focusedSecond={2}
      />,
    );

    expect(screen.getByText('事件焦点：2.00s')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/charts/WaveformCanvas.test.tsx
```

Expected: FAIL because the current `WaveformCanvas` has no hover readout, reset zoom button, or `focusedSecond` support.

- [ ] **Step 3: Replace `WaveformCanvas.tsx` with interactive implementation**

Replace `src/charts/WaveformCanvas.tsx` with:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { downsampleMinMax } from './downsample';

interface WaveformCanvasProps {
  label: string;
  values: Uint8Array | Uint16Array | Int16Array;
  sampleRateHz: number | null;
  eventSeconds?: number[];
  focusedSecond?: number | null;
}

interface Viewport {
  start: number;
  end: number;
}

interface HoverPoint {
  index: number;
  value: number;
  seconds: number | null;
}

function fullViewport(values: Uint8Array | Uint16Array | Int16Array): Viewport {
  return { start: 0, end: Math.max(1, values.length) };
}

function clampViewport(next: Viewport, valuesLength: number): Viewport {
  const minSpan = Math.min(valuesLength || 1, 32);
  const span = Math.max(minSpan, next.end - next.start);
  let start = Math.max(0, Math.min(valuesLength - span, next.start));
  if (!Number.isFinite(start)) start = 0;
  return { start, end: Math.min(valuesLength, start + span) };
}

export function WaveformCanvas({
  label,
  values,
  sampleRateHz,
  eventSeconds = [],
  focusedSecond = null,
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [viewport, setViewport] = useState<Viewport>(() => fullViewport(values));
  const [hover, setHover] = useState<HoverPoint | null>(null);

  const minMax = useMemo(() => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const value of values) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    return { min: Number.isFinite(min) ? min : 0, max: Number.isFinite(max) ? max : 1 };
  }, [values]);

  useEffect(() => {
    setViewport(fullViewport(values));
  }, [values]);

  useEffect(() => {
    if (focusedSecond === null || !sampleRateHz || values.length === 0) return;
    const center = focusedSecond * sampleRateHz;
    const span = Math.min(values.length, Math.max(sampleRateHz * 20, 160));
    setViewport(clampViewport({ start: center - span / 2, end: center + span / 2 }, values.length));
  }, [focusedSecond, sampleRateHz, values.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const rect = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * scale));
    canvas.height = Math.max(1, Math.floor(rect.height * scale));
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.scale(scale, scale);
    context.clearRect(0, 0, rect.width, rect.height);

    const visibleSpan = Math.max(1, viewport.end - viewport.start);
    const valueRange = minMax.max - minMax.min || 1;
    const points = downsampleMinMax(values, viewport.start, viewport.end, Math.max(1, Math.floor(rect.width)));

    context.strokeStyle = '#16697a';
    context.lineWidth = 1.5;
    context.beginPath();
    points.forEach((point, index) => {
      const x = ((point.index - viewport.start) / visibleSpan) * rect.width;
      const y = rect.height - ((point.value - minMax.min) / valueRange) * rect.height;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();

    context.strokeStyle = '#d1495b';
    context.lineWidth = 1;
    for (const second of eventSeconds) {
      if (!sampleRateHz) continue;
      const eventIndex = second * sampleRateHz;
      if (eventIndex < viewport.start || eventIndex > viewport.end) continue;
      const x = ((eventIndex - viewport.start) / visibleSpan) * rect.width;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, rect.height);
      context.stroke();
    }
  }, [eventSeconds, minMax.max, minMax.min, sampleRateHz, values, viewport]);

  function resetZoom() {
    setViewport(fullViewport(values));
  }

  function handleWheel(event: React.WheelEvent<HTMLCanvasElement>) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = rect.width ? (event.clientX - rect.left) / rect.width : 0.5;
    const currentSpan = viewport.end - viewport.start;
    const nextSpan = currentSpan * (event.deltaY < 0 ? 0.8 : 1.25);
    const anchor = viewport.start + ratio * currentSpan;
    setViewport(
      clampViewport(
        {
          start: anchor - ratio * nextSpan,
          end: anchor + (1 - ratio) * nextSpan,
        },
        values.length,
      ),
    );
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = rect.width ? (event.clientX - rect.left) / rect.width : 0;
    const index = Math.max(0, Math.min(values.length - 1, Math.round(viewport.start + ratio * (viewport.end - viewport.start))));
    setHover({
      index,
      value: values[index],
      seconds: sampleRateHz ? index / sampleRateHz : null,
    });
  }

  return (
    <section className="waveform-panel">
      <div className="chart-header">
        <div>
          <h3>{label}</h3>
          <span>{values.length} samples · {sampleRateHz ?? '-'} Hz</span>
        </div>
        <button type="button" onClick={resetZoom}>
          重置缩放
        </button>
      </div>
      <canvas
        ref={canvasRef}
        aria-label={`${label} waveform`}
        onPointerMove={handlePointerMove}
        onWheel={handleWheel}
      />
      <div className="chart-readout">
        {hover ? (
          <span>
            index {hover.index} · value {hover.value}
            {hover.seconds === null ? '' : ` · ${hover.seconds.toFixed(2)}s`}
          </span>
        ) : (
          <span>移动鼠标查看采样点</span>
        )}
        {focusedSecond === null ? null : <span>事件焦点：{focusedSecond.toFixed(2)}s</span>}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Update `DayCharts` to pass focused event**

Replace `src/components/DayCharts.tsx` with:

```tsx
import { WaveformCanvas } from '../charts/WaveformCanvas';
import type { DayDetail } from '../types';

interface DayChartsProps {
  detail: DayDetail;
  focusedEventSecond: number | null;
}

export function DayCharts({ detail, focusedEventSecond }: DayChartsProps) {
  const eventSeconds = detail.events
    .map((event) => event.secondsFromDayStart)
    .filter((value): value is number => typeof value === 'number');

  return (
    <section className="day-charts">
      {detail.signals.length === 0 ? <p>当前日期没有可显示的波形文件。</p> : null}
      {detail.signals.map((signal) => (
        <WaveformCanvas
          key={signal.fileName}
          label={signal.header.label}
          values={signal.values}
          sampleRateHz={signal.header.sampleRateHz}
          eventSeconds={eventSeconds}
          focusedSecond={focusedEventSecond}
        />
      ))}
    </section>
  );
}
```

- [ ] **Step 5: Pass focused event from App into charts**

In `src/App.tsx`, change:

```tsx
{dayDetail ? <DayCharts detail={dayDetail} /> : null}
```

to:

```tsx
{dayDetail ? <DayCharts detail={dayDetail} focusedEventSecond={focusedEventSecond} /> : null}
```

Also reset focus when the selected date changes by adding this line inside the `useEffect` that loads day detail, before `setIsLoadingDay(true)`:

```tsx
setFocusedEventSecond(null);
```

- [ ] **Step 6: Add chart readout CSS**

Append to `src/App.css`:

```css
.chart-readout {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-top: 1px solid #d7e0e3;
  color: #5c6b73;
}
```

- [ ] **Step 7: Run chart interaction tests and build**

Run:

```bash
npm test -- src/charts/WaveformCanvas.test.tsx
npm run build
```

Expected: PASS and build exits 0.

- [ ] **Step 8: Commit chart interactions**

Run:

```bash
git add src/App.tsx src/App.css src/charts/WaveformCanvas.tsx src/charts/WaveformCanvas.test.tsx src/components/DayCharts.tsx
git commit -m "feat: add waveform zoom hover and event focus"
```

## Task 10: Responsive Polish, Large Dataset Guardrails, and Verification


**Files:**
- Modify: `src/App.css`
- Create: `src/App.test.tsx`
- Modify: `README.md`

- [ ] **Step 1: Write failing App smoke test**

Create `src/App.test.tsx` with:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders import-first empty state', () => {
    render(<App />);

    expect(screen.getByText('呼吸机数据可视化')).toBeInTheDocument();
    expect(screen.getByText('导入 DATAFILE 开始查看')).toBeInTheDocument();
    expect(screen.getByText('浏览器本地解析，不上传原始数据')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run smoke test**

Run:

```bash
npm test -- src/App.test.tsx
```

Expected: PASS after existing App implementation is present.

- [ ] **Step 3: Add responsive CSS**

Append to `src/App.css`:

```css
@media (max-width: 980px) {
  .top-bar {
    align-items: flex-start;
    flex-direction: column;
  }

  .workbench,
  .detail-grid {
    grid-template-columns: 1fr;
  }

  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .summary-grid {
    grid-template-columns: 1fr;
  }

  .import-panel,
  .nav-row,
  .selected-day-header {
    flex-direction: column;
    display: flex;
    align-items: stretch;
  }
}
```

- [ ] **Step 4: Create README**

Create `README.md` with:

```md
# 呼吸机数据可视化

一个浏览器本地解析的呼吸机 EDF-like 数据可视化工具。原始数据不会上传到服务器。

## 开发

```bash
npm install
npm run dev
```

打开 Vite 输出的本地地址。

## 使用

1. 点击“选择 DATAFILE 文件夹”。
2. 选择包含 `20260427`、`20260428` 这类日期目录的 `DATAFILE`。
3. 用日期导航选择日期。
4. 查看摘要、波形、事件表和原始文件解析。
5. 对单个波形或事件文件导出 CSV。

如果浏览器不支持文件夹选择，可以使用“选择 EDF 文件”批量选择文件。

## 数据说明

这些 `.edf` 文件不是标准 EDF。应用按 512 字节 header 加厂商 payload 的格式解析。

已支持：

- `flow`: unsigned 8-bit waveform
- `pressure`: little-endian unsigned 16-bit waveform
- `real_pres`: little-endian unsigned 16-bit waveform
- `real_flow`: little-endian signed 16-bit waveform
- `ai`, `hi`, `ascp`, `usetime`: 16-byte event records
- `mvtvbr`: three unsigned 16-bit values per record
- `config`: raw payload preview
- `difleak`: unsigned 8-bit sequence
```

- [ ] **Step 5: Run full tests and production build**

Run:

```bash
npm test
npm run build
```

Expected: all tests PASS and build exits 0.

- [ ] **Step 6: Start local dev server**

Run:

```bash
npm run dev
```

Expected: Vite prints a local URL such as `http://127.0.0.1:5173/`. Keep the session running for browser testing.

- [ ] **Step 7: Manual verification in browser**

Open the local URL and verify:

- Empty state is visible.
- Import buttons are visible.
- Selecting sample `.edf` files from `DATAFILE/20260429` indexes one day.
- Date navigator shows the selected date.
- Summary cards render.
- Waveform canvases render non-empty lines for known signal files.
- Event table lists HI/AI/ASCP records when imported.
- Raw file browser shows header and preview data.
- CSV export downloads a `.csv` file for a waveform.

- [ ] **Step 8: Commit final polish**

Run:

```bash
git add README.md src/App.css src/App.test.tsx
git commit -m "docs: document ventilator visualizer usage"
```

## Final Verification

Run:

```bash
npm test
npm run build
```

Expected:

- Vitest exits 0.
- TypeScript and Vite production build exit 0.
- `dist/` is generated.

Then report:

- Tests passed.
- Build passed.
- Local dev URL.
- Any known limitations, especially that no backend persistence exists and only the documented vendor payloads are decoded.
