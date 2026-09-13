// EDF-like 时间戳的统一解析：二进制 8 字节布局与字符串形式各一处实现。
// 二进制布局：u16LE 年、u8 月、u8 日、u8 星期（偏移 4，忽略）、u8 时、u8 分、u8 秒。

const TIMESTAMP_BYTES = 8;

export function parseBinaryTimestamp(raw: Uint8Array): string | null {
  if (raw.length !== TIMESTAMP_BYTES) return null;

  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const year = view.getUint16(0, true);
  const month = raw[2];
  const day = raw[3];
  const hour = raw[5];
  const minute = raw[6];
  const second = raw[7];

  if (
    year < 1900 ||
    year > 2200 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }

  const pad = (value: number, length = 2) =>
    value.toString().padStart(length, "0");
  return `${year.toString().padStart(4, "0")}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

const timestampPattern =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/;

export function parseEdfTimestampMs(
  timestamp: string | null | undefined
): number | null {
  if (!timestamp) return null;

  const match = timestamp.match(timestampPattern);
  if (!match) return null;

  const [, year, month, day, hour, minute, second, fraction = "0"] = match;
  const millisecond = Number(fraction.padEnd(3, "0").slice(0, 3));
  const value = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    millisecond
  );

  return Number.isNaN(value) ? null : value;
}
