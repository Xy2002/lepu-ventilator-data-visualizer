import { describe, it, expect } from "vitest";
import { buildDataSummary, buildSystemPrompt } from "./dataSummary";
import type { DaySummary } from "../types";

const sampleSummary: DaySummary = {
  date: "2026-05-21",
  startTime: "2026-05-20 22:30:00",
  endTime: "2026-05-21 06:15:00",
  useDurationSeconds: 27900,
  useSessions: [
    {
      startTime: "2026-05-20 22:30:00",
      endTime: "2026-05-21 02:00:00",
      durationSeconds: 12600,
    },
    {
      startTime: "2026-05-21 04:00:00",
      endTime: "2026-05-21 06:15:00",
      durationSeconds: 8100,
    },
  ],
  eventCounts: { ai: 3, hi: 5, ascp: 4 },
  signalPresence: {
    flow: true,
    pressure: true,
    real_pres: true,
    real_flow: true,
  },
  sampleCounts: {
    flow: 125000,
    pressure: 125000,
    real_pres: 125000,
    real_flow: 125000,
  },
  pressureRange: { min: 4, max: 15 },
  missingFiles: [],
  warnings: [],
};

describe("buildDataSummary", () => {
  it("produces a structured text summary of day data", () => {
    const result = buildDataSummary(sampleSummary);
    expect(result).toContain("## 呼吸机数据日报 — 2026-05-21");
    expect(result).toContain("2026-05-20 22:30:00 至 2026-05-21 02:00:00");
    expect(result).toContain("2026-05-21 04:00:00 至 2026-05-21 06:15:00");
    expect(result).toContain("5h 45m");
    expect(result).toContain("AHI 相关事件总计（AI + HI）: 8 次");
    expect(result).toContain("低通气 (HI): 5 次");
    expect(result).toContain("其他记录（不计入 AHI）:");
    expect(result).toContain("自动压力调整记录 (ASCP): 4 次");
    expect(result).toContain("压力范围: 4 - 15 cmH2O");
    expect(result).toContain("流量波形: ✓ (125,000 采样点)");
  });

  it("marks absent AI/HI categories as 无记录 on partial days", () => {
    const partial: DaySummary = {
      ...sampleSummary,
      eventCounts: { hi: 5, ascp: 4 },
    };
    const result = buildDataSummary(partial);
    expect(result).toContain("AHI 相关事件总计（AI + HI，部分数据缺失）: 5 次");
    expect(result).toContain("中心性呼吸暂停 (AI): 无记录");
    expect(result).toContain("低通气 (HI): 5 次");
    expect(result).not.toContain("中心性呼吸暂停 (AI): 0 次");
  });

  it("handles minimal data gracefully", () => {
    const minimal: DaySummary = {
      date: "2026-05-21",
      startTime: null,
      endTime: null,
      useDurationSeconds: null,
      useSessions: [],
      eventCounts: {},
      signalPresence: {},
      sampleCounts: {},
      pressureRange: null,
      missingFiles: ["flow", "pressure", "real_pres", "real_flow"],
      warnings: [],
    };
    const result = buildDataSummary(minimal);
    expect(result).toContain("使用时段: 无数据");
    expect(result).toContain("压力范围: 无数据");
    expect(result).toContain("缺失文件: flow, pressure, real_pres, real_flow");
  });
});

describe("buildSystemPrompt", () => {
  it("returns a descriptive system prompt without medical thresholds", () => {
    const result = buildSystemPrompt();
    expect(result).toContain("呼吸机");
    expect(result).toContain("CPAP");
    expect(result.length).toBeGreaterThan(100);
    // Non-Goal:不做诊断或临床结论,不内置正常/异常阈值
    expect(result).not.toContain("AHI < 5");
    expect(result).not.toContain("≥ 4 小时");
    expect(result).toContain("不构成医疗建议");
  });
});
