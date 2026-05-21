# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Browser-local ventilator data visualizer for Lepu BA525 CPAP machines. Parses proprietary EDF-like binary files and displays waveforms, events, and configuration — all client-side, no data leaves the browser.

## Commands

```bash
npm run dev          # Vite dev server on 127.0.0.1
npm run build        # tsc + vite build
npm run test         # vitest run
npm run test:watch   # vitest watch
npx vitest run src/parser/edfParser.test.ts  # run a single test file
```

Requires Node >= 20.19.0.

## Architecture

**Data flow:** User selects DATAFILE folder → files grouped by date via `inferDateFromPath` → each file parsed by `parseVentilatorFile` → `buildDatasetIndex` produces summaries per day → user picks a date → `loadDayDetail` assembles full detail → components render.

**Parser layer** (`src/parser/`):
- `edfParser.ts` — core binary parser. All files share a 512-byte ASCII header; the `label` field at offset 256 determines how the payload is decoded (waveform, events, config, etc.).
- `ba525ConfigParser.ts` — BA525 config payload decoder with field specs tracked by reverse-engineering status (`confirmed` / `diff-verified` / `inferred` / `unknown`). Each `FieldSpec` records offset, type, enum/decode mappings, and verification notes.

**Data layer** (`src/data/`):
- `dataset.ts` — `buildDatasetIndex` (async, parallel per-day) and `loadDayDetail`. Computes day summaries, use sessions from `usetime` events, pressure ranges. Skips pressure scanning during index build, computes it lazily in `loadDayDetail`.
- `importCache.ts` — persists imported files to IndexedDB so the user doesn't re-select on refresh. Batches writes in groups of 20.
- `csv.ts` — waveform and event CSV export with browser download.

**Chart layer** (`src/charts/`):
- `downsample.ts` — min-max downsampling (`downsampleMinMax`) for rendering large waveforms at pixel resolution.
- `echartsWaveformOptions.ts` — builds ECharts config. X-axis uses real time (from header/session timestamps) when available, falls back to sample-index. Event markers rendered as `markLine`.
- `WaveformChart.tsx` — ECharts wrapper with resize-aware rendering.

**Component layer** (`src/components/`): Standard React components. `DayCharts` is lazy-loaded. All state lives in `App.tsx` (no context or state library).

**File format cheat sheet:**
| Label (offset 256) | Parsed kind | Payload encoding |
|---|---|---|
| `flow`, `difleak` | `waveform_u8` | raw bytes |
| `pressure`, `real_pres` | `waveform_u16le` | uint16 LE pairs |
| `real_flow` | `waveform_i16le` | int16 LE pairs |
| `ai`, `hi`, `ascp`, `usetime` | `events16` | 16-byte records (value1 u32 + value2 u32 + 8-byte timestamp) |
| `mvtvbr` | `triples_u16le` | 6-byte records (3 × uint16 LE) |
| `config` | `raw_config` | BA525 config payload |

## Tech Stack

React 19 · TypeScript · Vite · Tailwind CSS 4 · ECharts 6 · HeroUI · Vitest + Testing Library

Path alias: `@` → `src/` (configured in `vite.config.ts`).

## Key Patterns

- The app is entirely in Chinese (UI text, comments in docs). Keep new UI text in Chinese.
- Tests use jsdom environment with `@testing-library/jest-dom/vitest` setup.
- The parser has no external dependencies — it operates on `Uint8Array` / `DataView`.
- Use sessions are derived from `usetime` event records (value1 = duration seconds, timestamp = end time).
- `config` files are parsed separately by `ba525ConfigParser` which has its own field spec table — do not modify field statuses without cross-version diff verification.
