import { describe, expect, it } from "vitest";
import { buildEventDistributionOption } from "./eventDistributionOptions";
import type { EventRecord } from "../types";

function event(sourceLabel: string, timestamp: string | null): EventRecord {
  return { sourceLabel, value1: 1, value2: 0, timestamp };
}

describe("buildEventDistributionOption", () => {
  it("buckets ai and hi events by hour", () => {
    const option = buildEventDistributionOption([
      event("ai", "2026-04-29 01:10:00"),
      event("ai", "2026-04-29 01:30:00"),
      event("hi", "2026-04-29 23:00:00"),
      event("ascp", "2026-04-29 02:00:00"),
      event("ai", null),
    ]);

    const series = option.series as Array<{ name: string; data: number[] }>;
    const ai = series.find((s) => s.name === "AI")!.data;
    const hi = series.find((s) => s.name === "HI")!.data;
    expect(ai[1]).toBe(2);
    expect(ai[23]).toBe(0);
    expect(hi[23]).toBe(1);
    expect(ai.reduce((a, b) => a + b, 0)).toBe(2);
  });

  it("produces 24 buckets when there are no events", () => {
    const option = buildEventDistributionOption([]);
    const series = option.series as Array<{ data: number[] }>;
    expect(series[0].data).toHaveLength(24);
    expect((option.xAxis as { data: string[] }).data).toHaveLength(24);
  });
});
