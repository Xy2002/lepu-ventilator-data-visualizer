import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DatasetStatusBar } from "./DatasetStatusBar";
import { importedFileRefFromFile } from "../data/importedFile";
import type { DatasetIndex } from "../types";

const dataset: DatasetIndex = {
  days: ["2026-04-28", "2026-04-29"],
  dateRange: { start: "2026-04-28", end: "2026-04-29" },
  filesByDay: {
    "2026-04-28": [importedFileRefFromFile(new File([], "a.edf"), "a.edf")],
    "2026-04-29": [
      importedFileRefFromFile(new File([], "b.edf"), "b.edf"),
      importedFileRefFromFile(new File([], "c.edf"), "c.edf"),
    ],
  },
  summariesByDay: {
    "2026-04-28": {
      date: "2026-04-28",
      startTime: null,
      endTime: null,
      useDurationSeconds: null,
      useSessions: [],
      eventCounts: {},
      signalPresence: {},
      sampleCounts: {},
      pressureRange: null,
      missingFiles: [],
      warnings: ["Could not infer date from x"],
    },
    "2026-04-29": {
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
  },
  parsedFilesByDay: {},
  warnings: ["index-level warning"],
};

describe("DatasetStatusBar", () => {
  it("shows days, range, file count, and warning count", () => {
    render(<DatasetStatusBar dataset={dataset} />);

    expect(screen.getByText("共 2 天")).toBeInTheDocument();
    expect(
      screen.getByText("日期范围：2026-04-28 ~ 2026-04-29")
    ).toBeInTheDocument();
    expect(screen.getByText("文件 3 个")).toBeInTheDocument();
    expect(screen.getByText("解析警告 2 条")).toBeInTheDocument();
  });

  it("reports no warnings when every day parsed cleanly", () => {
    render(
      <DatasetStatusBar
        dataset={{
          ...dataset,
          summariesByDay: {
            "2026-04-28": {
              ...dataset.summariesByDay["2026-04-28"]!,
              warnings: [],
            },
          },
          warnings: [],
        }}
      />
    );

    expect(screen.getByText("无解析警告")).toBeInTheDocument();
  });
});
