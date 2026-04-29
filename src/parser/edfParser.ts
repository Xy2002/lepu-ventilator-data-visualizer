import type {
  EventRecord,
  ParsedKind,
  ParsedVentilatorFile,
  TripleRecord,
  VentilatorHeader,
} from '../types';

const HEADER_BYTES = 512;
const waveformSampleRateLabels = new Set(['flow', 'pressure', 'real_pres', 'real_flow']);
const event16Labels = new Set(['ai', 'hi', 'ascp', 'usetime']);
const decoder = new TextDecoder('ascii');

function ascii(raw: Uint8Array, start: number, end: number) {
  return decoder.decode(raw.slice(start, end)).trim();
}

function parseInteger(text: string) {
  if (!text) return null;
  const parsed = Number.parseInt(text, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseTimestamp(raw: Uint8Array) {
  if (raw.length !== 8) return null;

  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const year = view.getUint16(0, true);
  const month = raw[2];
  const day = raw[3];
  const hour = raw[4];
  const minute = raw[5];
  const second = raw[6];
  const centisecond = raw[7];

  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const yyyy = year.toString().padStart(4, '0');
  const mm = month.toString().padStart(2, '0');
  const dd = day.toString().padStart(2, '0');
  const hh = hour.toString().padStart(2, '0');
  const min = minute.toString().padStart(2, '0');
  const ss = second.toString().padStart(2, '0');
  const cc = centisecond.toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}.${cc}`;
}

export function parseHeader(raw: Uint8Array): VentilatorHeader {
  if (raw.length < HEADER_BYTES) {
    throw new Error(`file is too short for a ${HEADER_BYTES}-byte header`);
  }

  const label = ascii(raw, 256, 272);
  const field244 = ascii(raw, 244, 252);
  const field244Value = parseInteger(field244);

  return {
    version: ascii(raw, 0, 8),
    patientId: ascii(raw, 8, 88),
    recordingId: ascii(raw, 88, 168),
    startTime: parseTimestamp(raw.slice(168, 176)),
    endTime: parseTimestamp(raw.slice(176, 184)),
    headerBytes: parseInteger(ascii(raw, 184, 192)) ?? HEADER_BYTES,
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
    sampleRateHz: waveformSampleRateLabels.has(label) ? field244Value : null,
  };
}

function trailingWarning(byteCount: number) {
  return byteCount === 1
    ? 'Ignored 1 trailing payload byte'
    : `Ignored ${byteCount} trailing payload bytes`;
}

function warnAboutTrailingBytes(payload: Uint8Array, recordBytes: number, warnings: string[]) {
  const trailingBytes = payload.length % recordBytes;
  if (trailingBytes > 0) {
    warnings.push(trailingWarning(trailingBytes));
  }
}

function parseUint16Values(payload: Uint8Array, warnings: string[]) {
  warnAboutTrailingBytes(payload, 2, warnings);
  const values = new Uint16Array(Math.floor(payload.length / 2));
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  for (let index = 0; index < values.length; index += 1) {
    values[index] = view.getUint16(index * 2, true);
  }

  return values;
}

function parseInt16Values(payload: Uint8Array, warnings: string[]) {
  warnAboutTrailingBytes(payload, 2, warnings);
  const values = new Int16Array(Math.floor(payload.length / 2));
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  for (let index = 0; index < values.length; index += 1) {
    values[index] = view.getInt16(index * 2, true);
  }

  return values;
}

function parseEvents16(label: string, payload: Uint8Array, warnings: string[]) {
  warnAboutTrailingBytes(payload, 16, warnings);
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

function parseTriples(payload: Uint8Array, warnings: string[]) {
  warnAboutTrailingBytes(payload, 6, warnings);
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

function makeBlankHeader() {
  const raw = new Uint8Array(HEADER_BYTES);
  raw.fill(0x20);
  return parseHeader(raw);
}

export function parseVentilatorFile(fileName: string, raw: Uint8Array): ParsedVentilatorFile {
  if (raw.length < HEADER_BYTES) {
    return {
      fileName,
      kind: 'invalid',
      header: makeBlankHeader(),
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
    values = parseUint16Values(payload, warnings);
  } else if (header.label === 'real_flow') {
    kind = 'waveform_i16le';
    values = parseInt16Values(payload, warnings);
  } else if (header.label === 'mvtvbr') {
    kind = 'triples_u16le';
    records = parseTriples(payload, warnings);
  } else if (event16Labels.has(header.label)) {
    kind = 'events16';
    records = parseEvents16(header.label, payload, warnings);
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
