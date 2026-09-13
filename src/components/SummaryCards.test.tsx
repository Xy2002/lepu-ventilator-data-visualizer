import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SummaryCards } from "./SummaryCards";

describe("SummaryCards", () => {
  it("renders daily summary metrics", () => {
    render(
      <SummaryCards
        summary={{
          date: "2026-04-29",
          startTime: "2026-04-29 03:12:57",
          endTime: "2026-04-29 09:30:35",
          useDurationSeconds: 22658,
          useSessions: [],
          eventCounts: { ai: 28, hi: 8, ascp: 301 },
          signalPresence: {},
          sampleCounts: { flow: 283224 },
          pressureRange: { min: 0, max: 15.1 },
          missingFiles: [],
          warnings: [],
        }}
      />
    );

    expect(screen.getByText("6h 17m")).toBeInTheDocument();
    expect(screen.getByText("28 / 8")).toBeInTheDocument();
    expect(screen.getByText("0 - 15.1")).toBeInTheDocument();
    expect(screen.getByText("ASCP 事件")).toBeInTheDocument();
    expect(screen.getByText("301")).toBeInTheDocument();
    expect(screen.getByText("波形采样")).toBeInTheDocument();
    expect(screen.getByText("283,224")).toBeInTheDocument();
  });
});
