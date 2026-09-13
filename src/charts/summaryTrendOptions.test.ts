import { describe, expect, it } from "vitest";
import { buildSummaryTrendOption } from "./summaryTrendOptions";
import type { DaySummary } from "../types";

function summary(
  date: string,
  useDurationSeconds: number | null,
  ai: number,
  hi: number
): DaySummary {
  return {
    date,
    startTime: null,
    endTime: null,
    useDurationSeconds,
    useSessions: [],
    eventCounts: { ai, hi },
    signalPresence: {},
    sampleCounts: {},
    pressureRange: null,
    missingFiles: [],
    warnings: [],
  };
}

describe("buildSummaryTrendOption", () => {
  it("maps duration to hours and AHI to ai + hi per day", () => {
    const option = buildSummaryTrendOption(["2026-04-28", "2026-04-29"], {
      "2026-04-28": summary("2026-04-28", 14400, 3, 5),
      "2026-04-29": summary("2026-04-29", null, 1, 1),
    });

    const [duration, ahi] = option.series as Array<{
      data: Array<number | null>;
    }>;
    expect(duration.data).toEqual([4, null]);
    expect(ahi.data).toEqual([8, 2]);
    expect((option.xAxis as { data: string[] }).data).toEqual([
      "2026-04-28",
      "2026-04-29",
    ]);
  });
});
