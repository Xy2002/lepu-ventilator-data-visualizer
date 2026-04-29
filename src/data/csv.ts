import type { EventRecord } from '../types';

function line(values: Array<string | number | null | undefined>) {
  return `${values.map((value) => String(value ?? '')).join(',')}\n`;
}

export function exportWaveformCsv(values: Uint8Array | Uint16Array | Int16Array, sampleRateHz: number | null) {
  const canComputeSeconds = typeof sampleRateHz === 'number' && sampleRateHz > 0;
  let csv = 'index,seconds,value\n';

  for (let index = 0; index < values.length; index += 1) {
    csv += line([index, canComputeSeconds ? (index / sampleRateHz).toFixed(6) : '', values[index]]);
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
