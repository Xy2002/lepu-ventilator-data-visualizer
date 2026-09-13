import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DayDetail, EventRecord, ParsedVentilatorFile } from "../types";
import { DayCharts } from "./DayCharts";

vi.mock("./EventDistributionChart", () => ({
  EventDistributionChart: () => <div aria-label="AI 与 HI 事件按小时分布图" />,
}));

vi.mock("../charts/WaveformChart", () => ({
  WaveformChart: ({
    label,
    startTime,
  }: {
    label: string;
    startTime?: string | null;
  }) => (
    <div
      role="img"
      aria-label={`${label} ECharts waveform chart`}
      data-start-time={startTime ?? ""}
    >
      {label}
    </div>
  ),
}));

function signal(fileName: string, label: string): ParsedVentilatorFile {
  return {
    fileName,
    kind: "waveform_u8",
    header: {
      version: "V2.12",
      patientId: "",
      recordingId: "",
      startTime: "2026-04-29 03:12:57",
      endTime: "2026-04-29 07:46:06",
      headerBytes: 512,
      firmware: "",
      field236: "",
      field244: "80",
      signalCount: 1,
      label,
      physicalDimension: "",
      physicalMin: "0",
      physicalMax: "100",
      digitalMin: "0",
      digitalMax: "100",
      sampleIntervalMs: 80,
      sampleRateHz: 12.5,
    },
    payloadBytes: 3,
    values: new Uint8Array([1, 2, 3]),
    records: [],
    rawPayload: new Uint8Array([1, 2, 3]),
    warnings: [],
  };
}

function makeEvent(
  sourceLabel: string,
  value2: number,
  timestamp: string
): EventRecord {
  return {
    sourceLabel,
    value1: sourceLabel === "ascp" ? 141 : 1,
    value2,
    timestamp,
    secondsFromDayStart: 60,
  };
}

function detail(
  signals: ParsedVentilatorFile[],
  events: EventRecord[] = []
): DayDetail {
  return {
    summary: {
      date: "2026-04-29",
      startTime: null,
      endTime: null,
      useDurationSeconds: null,
      useSessions: [],
      eventCounts: {},
      signalPresence: {},
      sampleCounts: {},
      pressureRange: null,
      missingFiles: [],
      warnings: [],
    },
    files: signals,
    signals,
    events,
    useSessions: [],
    rawFiles: signals,
  };
}

describe("DayCharts", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders chart tabs and default chart", () => {
    render(
      <DayCharts
        detail={detail([
          signal("flow.edf", "flow"),
          signal("pressure.edf", "pressure"),
        ])}
      />
    );

    expect(
      screen.getByRole("img", { name: "flow ECharts waveform chart" })
    ).toBeInTheDocument();
    expect(screen.getByText("气流")).toBeInTheDocument();
    expect(screen.getByText("压力")).toBeInTheDocument();
  });

  it("shows breathing events when flow tab is active", () => {
    const events = [
      makeEvent("ai", 22, "2026-04-29 02:31:32"),
      makeEvent("hi", 15, "2026-04-29 03:04:41"),
      makeEvent("csa", 18, "2026-04-29 03:41:00"),
      makeEvent("ascp", 101, "2026-04-29 02:32:00"),
    ];

    render(
      <DayCharts
        detail={detail(
          [signal("flow.edf", "flow"), signal("pressure.edf", "pressure")],
          events
        )}
      />
    );

    expect(screen.getByText("呼吸事件")).toBeTruthy();
    expect(screen.getByText("22秒")).toBeTruthy();
    expect(screen.getByText("15秒")).toBeTruthy();
    expect(screen.getByText("18秒")).toBeTruthy();
    expect(screen.queryByText("ASCP 压力记录")).not.toBeTruthy();
  });

  it("shows leak events with raw values when difleak tab is active", () => {
    const events = [
      { ...makeEvent("leak", 20, "2026-04-29 05:17:14"), value1: 36 },
    ];

    render(
      <DayCharts detail={detail([signal("difleak.edf", "difleak")], events)} />
    );

    expect(screen.getByText("漏气事件")).toBeTruthy();
    expect(screen.getByText("36 / 20")).toBeTruthy();
  });

  it("falls back to day start time for signals with degenerate header span", () => {
    const difleak = signal("difleak.edf", "difleak");
    difleak.header.endTime = difleak.header.startTime;
    const dayDetail = detail([difleak]);
    dayDetail.summary.startTime = "2026-04-29 03:04:08";

    render(<DayCharts detail={dayDetail} />);

    expect(
      screen
        .getByRole("img", { name: "difleak ECharts waveform chart" })
        .getAttribute("data-start-time")
    ).toBe("2026-04-29 03:04:08");
  });

  it("event rows are clickable to focus", async () => {
    const events = [makeEvent("ai", 22, "2026-04-29 02:31:32")];

    render(<DayCharts detail={detail([signal("flow.edf", "flow")], events)} />);

    const row = screen.getByText("22秒").closest("tr")!;
    expect(row.className).not.toContain("chart-event-active");

    await userEvent.click(row);
    expect(row.className).toContain("chart-event-active");

    await userEvent.click(row);
    expect(row.className).not.toContain("chart-event-active");
  });

  it("shows empty message when no signals", () => {
    render(<DayCharts detail={detail([])} />);
    expect(
      screen.getByText("当前日期没有可显示的波形文件。")
    ).toBeInTheDocument();
  });
});
