# Ventilator Web Visualizer Design

## Goal

Build a deployable, browser-only Web application for visualizing ventilator data from the local `DATAFILE` directory structure. The app lets a user import a folder or a batch of `.edf` files, inspect daily summaries, select a date efficiently across hundreds or thousands of days, view synchronized waveform charts, inspect event records, and export decoded data.

The first release prioritizes clear data inspection over automated medical interpretation. It must make parsing behavior visible enough that a user can trust what they are seeing.

## Confirmed Decisions

- The app is a static, deployable Web application.
- Raw data is parsed in the browser. No file is uploaded to a server.
- The initial workflow combines daily overview and single-day deep inspection.
- Navigation must support large datasets with hundreds or thousands of dates.
- The left side uses date navigation, filtering, and bounded result lists, not a full unbounded date list.
- The right side focuses on the currently selected day: summary metrics, synchronized charts, events, and raw file inspection.

## Non-Goals

- No backend storage or account system.
- No server-side parsing.
- No automatic diagnosis or clinical conclusions.
- No attempt to fully decode unknown configuration bytes beyond displaying raw payload and known header fields.
- No requirement to load all waveform payloads for all days at once.

## Data Characteristics

The current data directory contains date folders such as `DATAFILE/20260429`, each containing multiple vendor `.edf` files. These files are not standard EDF files. They use a 512-byte EDF-like header, followed by vendor-specific payloads.

Known file classes:

- `flow`: waveform payload, unsigned 8-bit values, header field indicates 80 Hz.
- `pressure`: waveform payload, little-endian unsigned 16-bit values, 80 Hz.
- `real_pres`: waveform payload, little-endian unsigned 16-bit values, 80 Hz.
- `real_flow`: stored in `snoredata` files, waveform payload, little-endian signed 16-bit values, 80 Hz.
- `mvtvbr`: records of three little-endian unsigned 16-bit values.
- `ai`, `hi`, `ascp`, `usetime`: 16-byte records with two little-endian unsigned 32-bit values followed by an 8-byte timestamp.
- `config`: raw configuration payload with known header metadata but mostly undecoded body.
- `difleak`: unsigned 8-bit sequence; first release treats this as a decoded series without assigning clinical meaning.

## Application Structure

The app is a single-page workbench with four regions.

### Top Bar

The top bar contains:

- Import action for selecting a directory or multiple files.
- Dataset status: number of days indexed, date range, file count, parsing warnings.
- Export controls for CSV and summary data.
- Lightweight global status messages during indexing and parsing.

### Date Navigation Panel

The left panel is a date navigation and filtering surface, not a complete date list.

It contains:

- Direct date jump input accepting `YYYY-MM-DD`.
- Previous-day and next-day controls that skip to the nearest available data day.
- Calendar or month heatmap showing which dates have data.
- Heat intensity based on summary activity, such as event count or use duration.
- Date range filters such as recent days, month range, and custom range.
- Conditional filters such as files missing, AI present, HI present, ASCP present, and minimum use duration.
- Bounded matching result list showing only filtered results. For large result sets the list uses virtualization or pagination.

This keeps navigation practical when the dataset contains thousands of days.

### Main Day View

The main panel shows the selected day.

It contains:

- Current date and recorded time span.
- Summary metrics:
  - Use duration.
  - AI count.
  - HI count.
  - ASCP event count.
  - Pressure value range.
  - Waveform sample counts.
  - Missing file count.
- Long-range summary chart for the currently filtered date range.
- Event distribution chart for the selected day.
- `flow` waveform chart.
- `pressure` and `real_pres` overlay chart.
- `real_flow` chart when available.
- Event table synchronized with charts.
- Raw file browser for headers, payload type, byte counts, and first decoded values.

### Raw Data Browser

The raw data browser is scoped to the selected day.

It shows:

- File name.
- Parsed label from the 512-byte header.
- Header fields: version, patient or device identifier, start time, end time, header length, firmware field, physical and digital min/max fields, and payload byte count.
- Decoded kind: waveform, event records, triples, raw config, or unknown.
- Decoded preview with first values or records.
- Any parsing warning, such as incomplete trailing bytes.
- CSV export for the selected file.

## Data Model

The browser maintains a dataset model:

- `Dataset`
  - `days`: ordered available dates.
  - `dateRange`: earliest and latest available dates.
  - `filesByDay`: mapping of date to imported files and file status.
  - `summariesByDay`: lightweight daily summaries.
  - `selectedDate`: active date.
  - `warnings`: global import or parsing warnings.

- `DaySummary`
  - `date`.
  - `startTime`.
  - `endTime`.
  - `useDurationSeconds`.
  - `eventCounts` for AI, HI, ASCP, and known event groups.
  - `signalPresence`.
  - `sampleCounts`.
  - `pressureRange`.
  - `missingFiles`.
  - `warnings`.

- `DayDetail`
  - `summary`.
  - `signals`: parsed waveform arrays for the selected day.
  - `events`: decoded event records.
  - `rawFiles`: decoded metadata and previews for each file.

- `Signal`
  - `label`.
  - `sampleRateHz`.
  - `startTime`.
  - `values`.
  - `encoding`.
  - `warnings`.

- `EventRecord`
  - `sourceLabel`.
  - `value1`.
  - `value2`.
  - `timestamp`.
  - `secondsFromDayStart`.

## Parsing Flow

Parsing happens in two phases.

### Phase 1: Fast Indexing

After import, the app reads file names and the first 512 bytes of each file. It uses folder names and header labels to group files by date and build lightweight summaries. This phase is intended to complete before any large waveform rendering.

The indexing phase computes:

- Available dates.
- File presence by date.
- Header start and end times.
- Known labels.
- Basic event counts when event files are small enough to parse immediately.
- Dataset-level warnings.

### Phase 2: On-Demand Day Parsing

When the user selects a date, the app parses full payloads only for that date. Large waveform files are decoded into typed arrays and cached for the selected date and a small recent-date cache.

When the user changes date:

- The selected day detail is loaded if not cached.
- Existing charts update to the new day.
- Old day details can be released from memory if the cache exceeds its limit.

This prevents large historical datasets from forcing all waveform payloads into memory.

## Chart Behavior

Charts share a common time model for the selected day.

Core interactions:

- Zoom by scroll or drag-selection.
- Pan within the selected day.
- Reset zoom.
- Hover to show timestamp, seconds from start, and signal values.
- Click an event row to center the waveform charts around the event timestamp.
- Show vertical event markers on waveform charts for AI, HI, and ASCP records.
- Downsample visible waveform data for rendering while preserving original arrays for hover and export.

The charting layer must handle hundreds of thousands of points per selected day. Rendering should use canvas or a charting library capable of efficient large-series rendering.

## CSV Export

The app supports:

- Export selected file as CSV.
- Export selected day summary as CSV.
- Export filtered date summaries as CSV.

Waveform CSV includes:

- `index`.
- `seconds`.
- `value`.

Event CSV includes:

- `index`.
- `source`.
- `value1`.
- `value2`.
- `timestamp`.
- `secondsFromDayStart`.

Raw config export includes hex payload unless further decoding is added later.

## Error Handling

The app should continue when individual files fail.

Cases:

- Missing expected file: show a missing-file warning for the date and hide dependent charts.
- Unknown label: keep the file in the raw browser as `unknown`.
- Header shorter than 512 bytes: mark file invalid and skip payload parsing.
- Header field not parseable: display the raw value and add a warning.
- Payload length not divisible by expected record size: parse complete records and report trailing byte count.
- Browser does not support directory selection: fall back to multi-file upload.
- Import contains files from many folders: infer dates from folder names or filename prefixes where possible.

Warnings appear close to the affected date or file rather than only in a global console.

## Performance Strategy

The app must remain responsive for large datasets.

Techniques:

- Separate indexing from full payload parsing.
- Parse only selected-day waveform payloads.
- Use typed arrays for numeric waveform data.
- Keep a small least-recently-used cache of parsed day details.
- Use chart downsampling based on visible pixel width.
- Virtualize or paginate filtered date results.
- Avoid rendering complete multi-year daily lists.
- Use Web Workers for parsing if main-thread parsing causes visible UI pauses.

## Accessibility and Usability

The UI should be compact and inspection-oriented.

Requirements:

- Keyboard-accessible date jump and previous/next controls.
- Clear empty states for missing files or unsupported browser APIs.
- Hover details must also be available through selected-point or table interactions where practical.
- Do not rely on color alone for file status; include text labels.
- Keep chart legends and axis labels visible and readable.

## Testing Strategy

Tests cover parsing, aggregation, and UI behavior.

### Parser Tests

Use existing sample data to verify:

- Header parsing extracts label, header byte count, start time, and end time.
- `flow` decodes as unsigned 8-bit.
- `pressure` and `real_pres` decode as little-endian unsigned 16-bit.
- `real_flow` decodes as little-endian signed 16-bit.
- `ai`, `hi`, and `ascp` decode as 16-byte event records.
- `mvtvbr` decodes as three-value unsigned 16-bit records.
- Invalid or truncated files produce warnings rather than crashes.

### Aggregation Tests

Verify:

- Multiple date folders create multiple `DaySummary` entries.
- Missing files are represented in `signalPresence` and `missingFiles`.
- Date range filters return expected dates.
- Event counts match decoded event arrays.

### UI Tests

Verify:

- Importing a sample dataset populates dataset status.
- Date jump selects the requested date when available.
- Previous and next controls skip to available dates.
- Selecting a date loads day detail.
- Waveform charts render non-empty data for known sample files.
- Clicking an event row updates the chart viewport.
- CSV export includes expected columns.

## First Release Acceptance Criteria

- User can import the existing `DATAFILE` folder in a browser.
- App indexes available days without uploading data.
- User can jump to a date, navigate to previous or next available date, and filter dates.
- Selected day shows summary metrics.
- Selected day shows `flow`, `pressure`, and `real_pres` charts when files exist.
- Event records appear in a table and can be correlated with chart time.
- Raw file browser exposes header metadata and decoded previews.
- CSV export works for at least waveform files and event files.
- Missing or malformed files do not crash the app.

## Implementation Notes

The implementation plan should choose a concrete frontend stack and charting approach, but the design requires these capabilities:

- Static deployment.
- Browser File API and directory upload support.
- Binary parsing in JavaScript or TypeScript.
- Efficient chart rendering for large numeric arrays.
- Component boundaries that separate parsing, aggregation, chart rendering, and UI state.

