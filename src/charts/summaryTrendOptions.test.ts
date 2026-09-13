import { describe, expect, it } from "vitest";
import { buildSummaryTrendOption } from "./summaryTrendOptions";
import type { DaySummary, UseSession } from "../types";

function session(durationSeconds: number): UseSession {
  return {
    startTime: "2026-04-28 23:00",
    endTime: "2026-04-29 07:00",
    durationSeconds,
  };
}

function summary(
  date: string,
  useDurationSeconds: number | null,
  ai: number | undefined,
  hi: number | undefined,
  useSessions: UseSession[] = []
): DaySummary {
  const eventCounts: DaySummary["eventCounts"] = {};
  if (ai !== undefined) eventCounts.ai = ai;
  if (hi !== undefined) eventCounts.hi = hi;
  return {
    date,
    startTime: null,
    endTime: null,
    useDurationSeconds,
    useSessions,
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
      "2026-04-28": summary("2026-04-28", 14400, 3, 5, [session(14400)]),
      "2026-04-29": summary("2026-04-29", null, 1, 1, [session(0)]),
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
      "2026-04-28": summary("2026-04-28", 900, 5, 5, [session(900)]),
      "2026-04-29": summary("2026-04-29", 1800, 5, 5, [session(1800)]),
    });

    const [, ahi] = option.series as Array<{ data: Array<number | null> }>;
    expect(ahi.data).toEqual([null, 20]);
  });

  it("skips AHI when either event file is missing", () => {
    const option = buildSummaryTrendOption(
      ["2026-04-28", "2026-04-29", "2026-04-30"],
      {
        "2026-04-28": summary("2026-04-28", 28800, 5, undefined, [
          session(28800),
        ]),
        "2026-04-29": summary("2026-04-29", 28800, undefined, 5, [
          session(28800),
        ]),
        "2026-04-30": summary("2026-04-30", 28800, undefined, undefined, [
          session(28800),
        ]),
      }
    );

    const [, ahi] = option.series as Array<{ data: Array<number | null> }>;
    expect(ahi.data).toEqual([null, null, null]);
  });

  it("skips AHI when no valid use sessions were recorded", () => {
    // useDurationSeconds 可能回退为记录跨度,没有使用会话时不能作分母
    const option = buildSummaryTrendOption(["2026-04-28"], {
      "2026-04-28": summary("2026-04-28", 28800, 3, 5),
    });

    const [, ahi] = option.series as Array<{ data: Array<number | null> }>;
    expect(ahi.data).toEqual([null]);
  });

  it("shows nightly event total and per-hour AHI in the tooltip", () => {
    const option = buildSummaryTrendOption(["2026-04-28"], {
      "2026-04-28": summary("2026-04-28", 28800, 3, 5, [session(28800)]),
    });

    const tooltip = option.tooltip as {
      formatter: (params: unknown) => string;
    };
    const html = tooltip.formatter([{ dataIndex: 0 }]);
    expect(html).toContain("2026-04-28");
    expect(html).toContain("呼吸事件总数 (AI + HI): 8 次");
    expect(html).toContain("AHI: 1.0 次/h");
  });

  it("marks partial event totals as incomplete in the tooltip", () => {
    const option = buildSummaryTrendOption(["2026-04-28", "2026-04-29"], {
      "2026-04-28": summary("2026-04-28", 28800, 5, undefined, [
        session(28800),
      ]),
      "2026-04-29": summary("2026-04-29", 28800, undefined, undefined),
    });

    const tooltip = option.tooltip as {
      formatter: (params: unknown) => string;
    };
    expect(tooltip.formatter([{ dataIndex: 0 }])).toContain(
      "呼吸事件总数 (AI + HI): 5 次（部分事件文件缺失）"
    );
    expect(tooltip.formatter([{ dataIndex: 0 }])).toContain("AHI: —");
    expect(tooltip.formatter([{ dataIndex: 1 }])).toContain(
      "呼吸事件总数 (AI + HI): 无记录"
    );
  });

  it("labels the header span as a recording span when no use sessions exist", () => {
    // useDurationSeconds 在无使用会话时是记录跨度,不能标成使用时长
    const option = buildSummaryTrendOption(["2026-04-28"], {
      "2026-04-28": summary("2026-04-28", 28800, 3, 5),
    });

    const tooltip = option.tooltip as {
      formatter: (params: unknown) => string;
    };
    const html = tooltip.formatter([{ dataIndex: 0 }]);
    expect(html).toContain("使用时长: 无记录（仅记录跨度 8.0 h）");
    expect(html).not.toContain("使用时长: 8.0 h");
    expect(html).toContain("AHI: —");
  });
});
