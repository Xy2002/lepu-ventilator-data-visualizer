import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AiAnalysisPanel } from "./AiAnalysisPanel";
import type { DaySummary } from "../types";

const reportCacheMock = vi.hoisted(() => ({
  reportCacheKey: vi.fn(),
  loadReport: vi.fn(),
  saveReport: vi.fn(),
}));

const clientMock = vi.hoisted(() => ({
  streamChat: vi.fn(),
}));

vi.mock("../ai/reportCache", () => reportCacheMock);
vi.mock("../ai/client", () => clientMock);

const mockSummary: DaySummary = {
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
  ],
  eventCounts: { ai: 3, hi: 5 },
  signalPresence: {
    flow: true,
    pressure: true,
    real_pres: true,
    real_flow: true,
  },
  sampleCounts: { flow: 1000 },
  pressureRange: { min: 4, max: 15 },
  missingFiles: [],
  warnings: [],
};

describe("AiAnalysisPanel", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders collapsed trigger when closed", () => {
    render(
      <AiAnalysisPanel
        summary={mockSummary}
        selectedDate="2026-05-21"
        open={false}
        onToggle={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: /AI 分析/ })).toBeTruthy();
    expect(screen.getByText("点击展开")).toBeTruthy();
  });

  it("calls onToggle when collapsed trigger clicked", async () => {
    const onToggle = vi.fn();
    render(
      <AiAnalysisPanel
        summary={mockSummary}
        selectedDate="2026-05-21"
        open={false}
        onToggle={onToggle}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /AI 分析/ }));
    expect(onToggle).toHaveBeenCalled();
  });

  it("renders the panel with header when open", () => {
    render(
      <AiAnalysisPanel
        summary={mockSummary}
        selectedDate="2026-05-21"
        open={true}
        onToggle={() => {}}
      />
    );
    expect(
      screen.getByRole("heading", { level: 3, name: /AI 分析/ })
    ).toBeTruthy();
    expect(screen.getByText("生成分析")).toBeTruthy();
  });

  it("calls onToggle when close button clicked", async () => {
    const onToggle = vi.fn();
    render(
      <AiAnalysisPanel
        summary={mockSummary}
        selectedDate="2026-05-21"
        open={true}
        onToggle={onToggle}
      />
    );
    await userEvent.click(screen.getByLabelText("收起面板"));
    expect(onToggle).toHaveBeenCalled();
  });

  it("shows settings warning when API key not configured", () => {
    render(
      <AiAnalysisPanel
        summary={mockSummary}
        selectedDate="2026-05-21"
        open={true}
        onToggle={() => {}}
      />
    );
    expect(screen.getByText("（未配置）")).toBeTruthy();
  });

  it("disables generate button when API key is empty", () => {
    render(
      <AiAnalysisPanel
        summary={mockSummary}
        selectedDate="2026-05-21"
        open={true}
        onToggle={() => {}}
      />
    );
    expect(screen.getByText("生成分析").closest("button")?.disabled).toBe(true);
  });

  it("ignores a stale cached report when the selected date changes", async () => {
    localStorage.setItem(
      "ai-analysis-settings",
      JSON.stringify({ provider: "openai", apiKey: "sk-test", model: "gpt-4o" })
    );
    reportCacheMock.reportCacheKey.mockImplementation(
      (date: string, provider: string, model: string, prompt: string) =>
        `${date}_${provider}_${model}${prompt ? "_p" : ""}`
    );
    let resolveStale: (value: unknown) => void = () => {};
    reportCacheMock.loadReport.mockImplementation((key: string) => {
      if (key.startsWith("2026-05-21")) {
        return new Promise((resolve) => {
          resolveStale = resolve;
        });
      }
      return Promise.resolve(null);
    });

    const { rerender } = render(
      <AiAnalysisPanel
        summary={mockSummary}
        selectedDate="2026-05-21"
        open={true}
        onToggle={() => {}}
      />
    );
    rerender(
      <AiAnalysisPanel
        summary={mockSummary}
        selectedDate="2026-05-22"
        open={true}
        onToggle={() => {}}
      />
    );

    await act(async () => {
      resolveStale({
        key: "2026-05-21_openai_gpt-4o",
        date: "2026-05-21",
        content: "旧日期的报告内容",
        createdAt: 1,
        provider: "openai",
        model: "gpt-4o",
      });
    });

    expect(screen.queryByText("旧日期的报告内容")).not.toBeInTheDocument();
    expect(
      screen.getByText("点击「生成分析」查看当日数据的 AI 分析报告。")
    ).toBeInTheDocument();
  });

  it("ignores a stale generate-report cache hit after the selected date changes", async () => {
    localStorage.setItem(
      "ai-analysis-settings",
      JSON.stringify({ provider: "openai", apiKey: "sk-test", model: "gpt-4o" })
    );
    reportCacheMock.reportCacheKey.mockImplementation(
      (date: string, provider: string, model: string, prompt: string) =>
        `${date}_${provider}_${model}${prompt ? "_p" : ""}`
    );
    let resolvePending: (value: unknown) => void = () => {};
    reportCacheMock.loadReport.mockImplementation((key: string) => {
      if (key.startsWith("2026-05-21")) {
        return new Promise((resolve) => {
          resolvePending = resolve;
        });
      }
      return Promise.resolve(null);
    });

    const { rerender } = render(
      <AiAnalysisPanel
        summary={mockSummary}
        selectedDate="2026-05-21"
        open={true}
        onToggle={() => {}}
      />
    );

    await userEvent.click(screen.getByText("生成分析"));
    rerender(
      <AiAnalysisPanel
        summary={mockSummary}
        selectedDate="2026-05-22"
        open={true}
        onToggle={() => {}}
      />
    );

    await act(async () => {
      resolvePending({
        key: "2026-05-21_openai_gpt-4o",
        date: "2026-05-21",
        content: "过期生成的缓存报告",
        createdAt: 1,
        provider: "openai",
        model: "gpt-4o",
      });
    });

    expect(screen.queryByText("过期生成的缓存报告")).not.toBeInTheDocument();
    expect(
      screen.getByText("点击「生成分析」查看当日数据的 AI 分析报告。")
    ).toBeInTheDocument();
  });
});
