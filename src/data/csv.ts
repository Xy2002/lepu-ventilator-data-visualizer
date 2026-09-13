import type { DaySummary, EventRecord } from "../types";

function line(values: Array<string | number | null | undefined>) {
  return `${values.map((value) => String(value ?? "")).join(",")}\n`;
}

export function exportWaveformCsv(
  values: Uint8Array | Uint16Array | Int16Array,
  sampleRateHz: number | null
) {
  const canComputeSeconds =
    typeof sampleRateHz === "number" && sampleRateHz > 0;
  let csv = "index,seconds,value\n";

  for (let index = 0; index < values.length; index += 1) {
    csv += line([
      index,
      canComputeSeconds ? (index / sampleRateHz).toFixed(6) : "",
      values[index],
    ]);
  }

  return csv;
}

export function exportEventsCsv(events: EventRecord[]) {
  let csv = "index,source,value1,value2,timestamp,secondsFromDayStart\n";

  events.forEach((event, index) => {
    csv += line([
      index,
      event.sourceLabel,
      event.value1,
      event.value2,
      event.timestamp,
      event.secondsFromDayStart === undefined
        ? ""
        : event.secondsFromDayStart.toFixed(6),
    ]);
  });

  return csv;
}

function triggerDownload(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadCsv(fileName: string, csv: string) {
  triggerDownload(
    fileName,
    new Blob([csv], { type: "text/csv;charset=utf-8" })
  );
}

export function downloadBinary(fileName: string, data: Uint8Array) {
  triggerDownload(
    fileName,
    new Blob([data as BlobPart], { type: "application/octet-stream" })
  );
}

const summaryCsvHeader =
  "date,useDurationSeconds,sessions,ai,hi,ascp,usetime,pressureMinCmH2O,pressureMaxCmH2O,missingFiles\n";

function summaryRow(summary: DaySummary) {
  return line([
    summary.date,
    summary.useDurationSeconds ?? "",
    summary.useSessions.length,
    summary.eventCounts.ai ?? "",
    summary.eventCounts.hi ?? "",
    summary.eventCounts.ascp ?? "",
    summary.eventCounts.usetime ?? "",
    summary.pressureRange?.min ?? "",
    summary.pressureRange?.max ?? "",
    `"${summary.missingFiles.join(" ")}"`,
  ]);
}

export function exportDaySummaryCsv(summary: DaySummary) {
  return summaryCsvHeader + summaryRow(summary);
}

export function exportDateSummariesCsv(summaries: DaySummary[]) {
  return summaryCsvHeader + summaries.map(summaryRow).join("");
}
