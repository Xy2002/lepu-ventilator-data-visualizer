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

export function makeEdfLikeFile(
  label: string,
  payload: Uint8Array,
  options: { field244?: string } = {},
) {
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
