import { describe, expect, it } from "vitest";
import { exportEventsCsv, exportWaveformCsv } from "./csv";

describe("csv exports", () => {
  it("exports waveform rows with seconds", () => {
    expect(exportWaveformCsv(new Uint8Array([10, 20]), 80)).toBe(
      "index,seconds,value\n0,0.000000,10\n1,0.012500,20\n"
    );
  });

  it("keeps the seconds column empty when sample rate is unknown", () => {
    expect(exportWaveformCsv(new Uint8Array([10, 20]), null)).toBe(
      "index,seconds,value\n0,,10\n1,,20\n"
    );
  });

  it("exports event rows", () => {
    expect(
      exportEventsCsv([
        {
          sourceLabel: "hi",
          value1: 1,
          value2: 15,
          timestamp: "2026-04-29 03:04:41.22",
          secondsFromDayStart: 89.65,
        },
      ])
    ).toBe(
      "index,source,value1,value2,timestamp,secondsFromDayStart\n0,hi,1,15,2026-04-29 03:04:41.22,89.650000\n"
    );
  });
});

import { exportDateSummariesCsv, exportDaySummaryCsv } from "./csv";
import type { DaySummary } from "../types";

function makeSummary(overrides: Partial<DaySummary>): DaySummary {
  return {
    date: "2026-04-29",
    startTime: null,
    endTime: null,
    useDurationSeconds: 3600,
    useSessions: [],
    eventCounts: { ai: 2, hi: 3 },
    signalPresence: {},
    sampleCounts: {},
    pressureRange: { min: 4.2, max: 15.1 },
    missingFiles: ["real_flow"],
    warnings: [],
    ...overrides,
  };
}

describe("summary CSV export", () => {
  it("exports a single day summary row", () => {
    const csv = exportDaySummaryCsv(makeSummary({}));
    expect(csv).toContain(
      "date,useDurationSeconds,sessions,ai,hi,ascp,usetime,pressureMinCmH2O,pressureMaxCmH2O,missingFiles"
    );
    expect(csv).toContain('2026-04-29,3600,0,2,3,,,4.2,15.1,"real_flow"');
  });

  it("exports one row per day and keeps absent counts blank", () => {
    const csv = exportDateSummariesCsv([
      makeSummary({
        date: "2026-04-28",
        eventCounts: { hi: 1 },
        pressureRange: null,
      }),
      makeSummary({ date: "2026-04-29" }),
    ]);
    expect(csv).toContain("2026-04-28,3600,0,,1,,,");
    expect(csv).toContain("2026-04-29,3600,0,2,3,,,4.2,15.1,");
    const rowCount = csv
      .split(String.fromCharCode(10))
      .filter((line) => line.startsWith("2026-")).length;
    expect(rowCount).toBe(2);
  });
});
