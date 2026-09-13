import { describe, expect, it } from "vitest";
import { buildSummaryTrendOption } from "./summaryTrendOptions";
import type { DaySummary } from "../types";

function summary(
  date: string,
  useDurationSeconds: number | null,
  ai: number | undefined,
  hi: number | undefined
): DaySummary {
  const eventCounts: DaySummary["eventCounts"] = {};
  if (ai !== undefined) eventCounts.ai = ai;
  if (hi !== undefined) eventCounts.hi = hi;
  return {
    date,
    startTime: null,
    endTime: null,
    useDurationSeconds,
    useSessions: [],
    eventCounts,
    signalPresence: {},
    sampleCounts: {},
    pressureRange: null,
    missingFiles: [],
    warnings: [],
  };
}

describe("buildSummaryTrendOption", () => {
  it("maps duration to hours and AHI to ai + hi divided by use hours", () => {
    const option = buildSummaryTrendOption(["2026-04-28", "2026-04-29"], {
      "2026-04-28": summary("2026-04-28", 14400, 3, 5),
      "2026-04-29": summary("2026-04-29", null, 1, 1),
    });

    const [duration, ahi] = option.series as Array<{
      name?: string;
      data: Array<number | null>;
    }>;
    expect(duration.data).toEqual([4, null]);
    expect(ahi.data).toEqual([2, null]);
    expect(ahi.name).toBe("AHI (次/h)");
    expect((option.xAxis as { data: string[] }).data).toEqual([
      "2026-04-28",
      "2026-04-29",
    ]);
  });

  it("skips AHI when use time is under 30 minutes", () => {
    const option = buildSummaryTrendOption(["2026-04-28", "2026-04-29"], {
      "2026-04-28": summary("2026-04-28", 900, 5, 5),
      "2026-04-29": summary("2026-04-29", 1800, 5, 5),
    });

    const [, ahi] = option.series as Array<{ data: Array<number | null> }>;
    expect(ahi.data).toEqual([null, 20]);
  });

  it("skips AHI when both event files are missing", () => {
    const option = buildSummaryTrendOption(["2026-04-28"], {
      "2026-04-28": summary("2026-04-28", 28800, undefined, undefined),
    });

    const [, ahi] = option.series as Array<{ data: Array<number | null> }>;
    expect(ahi.data).toEqual([null]);
  });

  it("shows nightly event total and per-hour AHI in the tooltip", () => {
    const option = buildSummaryTrendOption(["2026-04-28"], {
      "2026-04-28": summary("2026-04-28", 28800, 3, 5),
    });

    const tooltip = option.tooltip as {
      formatter: (params: unknown) => string;
    };
    const html = tooltip.formatter([{ dataIndex: 0 }]);
    expect(html).toContain("2026-04-28");
    expect(html).toContain("呼吸事件总数 (AI + HI): 8 次");
    expect(html).toContain("AHI: 1.0 次/h");
  });
});
