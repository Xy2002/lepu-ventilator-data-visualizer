import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const chartMock = vi.hoisted(() => ({
  dispatchAction: vi.fn(),
  dispose: vi.fn(),
  off: vi.fn(),
  on: vi.fn(),
  resize: vi.fn(),
  setOption: vi.fn(),
}));

const echartsCoreMock = vi.hoisted(() => ({
  init: vi.fn(() => chartMock),
  use: vi.fn(),
}));

const importCacheMock = vi.hoisted(() => ({
  loadImportedFiles: vi.fn(),
  saveImportedFiles: vi.fn(),
}));

const parsedCacheMock = vi.hoisted(() => ({
  loadParsedDataset: vi.fn(),
  saveParsedDataset: vi.fn(),
}));

vi.mock("echarts/core", () => echartsCoreMock);
vi.mock("echarts/charts", () => ({ BarChart: {}, LineChart: {} }));
vi.mock("echarts/components", () => ({
  DataZoomComponent: {},
  GridComponent: {},
  LegendComponent: {},
  MarkLineComponent: {},
  ToolboxComponent: {},
  TooltipComponent: {},
}));
vi.mock("echarts/renderers", () => ({ CanvasRenderer: {} }));
vi.mock("./data/importCache", () => importCacheMock);
vi.mock("./data/parsedCache", () => parsedCacheMock);

import { App } from "./App";
import { importedFileRefFromFile } from "./data/importedFile";
import {
  makeEdfLikeFile,
  makeEventPayload,
  makeEventPayloadAt,
} from "./parser/fixtures";
import { parseVentilatorFileHeader } from "./parser/edfParser";
import type { DatasetIndex, ImportedFileRef } from "./types";

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

function edfFile(name: string, label: string, payload: Uint8Array) {
  const bytes = makeEdfLikeFile(label, payload);
  const file = new File([bytes], name, { type: "application/octet-stream" });

  if (typeof file.arrayBuffer !== "function") {
    Object.defineProperty(file, "arrayBuffer", {
      value: () =>
        Promise.resolve(
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength
          )
        ),
    });
  }

  return file;
}

function importedFile(
  name: string,
  label: string,
  payload: Uint8Array
): ImportedFileRef {
  return importedFileRefFromFile(edfFile(name, label, payload), name);
}

function concatPayloads(...payloads: Uint8Array[]) {
  const bytes = new Uint8Array(
    payloads.reduce((total, payload) => total + payload.length, 0)
  );
  let offset = 0;
  for (const payload of payloads) {
    bytes.set(payload, offset);
    offset += payload.length;
  }
  return bytes;
}

describe("App", () => {
  beforeEach(() => {
    importCacheMock.loadImportedFiles.mockResolvedValue([]);
    importCacheMock.saveImportedFiles.mockResolvedValue(undefined);
    parsedCacheMock.loadParsedDataset.mockResolvedValue(null);
    parsedCacheMock.saveParsedDataset.mockResolvedValue(undefined);
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      width: 400,
      height: 180,
      top: 0,
      right: 400,
      bottom: 180,
      left: 0,
      toJSON: () => ({}),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("renders import-first empty state", () => {
    render(<App />);

    expect(screen.getByText("呼吸机数据可视化")).toBeInTheDocument();
    expect(screen.getByText("导入 DATAFILE 开始查看")).toBeInTheDocument();
    expect(
      screen.getByText(
        "浏览器本地解析，原始数据不出浏览器；启用 AI 分析时当日摘要将发送至所配服务商"
      )
    ).toBeInTheDocument();
  });

  it("indexes uploaded files and renders selected-day detail", async () => {
    render(<App />);

    await userEvent.upload(screen.getByLabelText("选择 EDF 文件"), [
      edfFile("20260429_flow.edf", "flow", new Uint8Array([20, 19, 17])),
      edfFile(
        "20260429_pressure.edf",
        "pressure",
        new Uint8Array([1, 0, 9, 0])
      ),
      edfFile("20260429_hi.edf", "hi", makeEventPayload(1, 15)),
      edfFile(
        "20260429_usetime.edf",
        "usetime",
        concatPayloads(
          makeEventPayloadAt(
            120,
            677025283,
            new Date(Date.UTC(2026, 3, 29, 8, 30, 0))
          ),
          makeEventPayloadAt(
            180,
            677025283,
            new Date(Date.UTC(2026, 3, 29, 10, 3, 0))
          )
        )
      ),
    ]);

    expect(await screen.findByText("日期导航")).toBeInTheDocument();
    expect(await screen.findByText("5:00")).toBeInTheDocument();
    expect(screen.getByText("2 个使用会话")).toBeInTheDocument();
    expect(
      screen.getByText("2026-04-29 08:28:00 至 2026-04-29 08:30:00")
    ).toBeInTheDocument();
    expect(
      screen.getByText("2026-04-29 10:00:00 至 2026-04-29 10:03:00")
    ).toBeInTheDocument();
    expect(screen.getByText("AI / HI").parentElement?.textContent).toContain(
      "无记录 / 1"
    );
    expect(screen.getByText("0.1 - 0.9")).toBeInTheDocument();
    expect(
      await screen.findByRole("img", { name: "flow 波形图表" })
    ).toBeInTheDocument();
    expect(chartMock.setOption).toHaveBeenCalledWith(
      expect.objectContaining({
        xAxis: expect.objectContaining({ type: "time", name: "真实时间" }),
      }),
      true
    );
    expect(screen.getByText("呼吸事件")).toBeTruthy();
    // 缓存写入在数据集展示后后台进行,用 waitFor 等待触发
    await vi.waitFor(() =>
      expect(importCacheMock.saveImportedFiles).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: "20260429_flow.edf" }),
        ])
      )
    );
  });

  it("restores the last imported files from browser cache on startup", async () => {
    importCacheMock.loadImportedFiles.mockResolvedValueOnce([
      importedFile("20260429_flow.edf", "flow", new Uint8Array([20, 19, 17])),
      importedFile(
        "20260429_pressure.edf",
        "pressure",
        new Uint8Array([1, 0, 9, 0])
      ),
    ]);

    render(<App />);

    expect(await screen.findByText("日期导航")).toBeInTheDocument();
    expect(screen.getByText("已恢复上次导入的文件。")).toBeInTheDocument();
    expect(screen.getAllByText("2026-04-29").length).toBeGreaterThan(0);
    expect(
      screen.queryByText("导入 DATAFILE 开始查看")
    ).not.toBeInTheDocument();
  });

  it("shows an error notice when loading the selected day fails", async () => {
    const brokenRef: ImportedFileRef = {
      name: "20260429_flow.edf",
      path: "20260429_flow.edf",
      size: 3,
      lastModified: 0,
      read: () => Promise.reject(new Error("read failed")),
    };
    const fileBytes = makeEdfLikeFile("flow", new Uint8Array([1, 2, 3]));
    const headerOnlyFlow = parseVentilatorFileHeader(
      "20260429_flow.edf",
      fileBytes.slice(0, 512),
      fileBytes.length
    );
    const brokenIndex: DatasetIndex = {
      days: ["2026-04-29"],
      dateRange: { start: "2026-04-29", end: "2026-04-29" },
      filesByDay: { "2026-04-29": [brokenRef] },
      parsedFilesByDay: { "2026-04-29": [headerOnlyFlow] },
      summariesByDay: {
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
      warnings: [],
    };
    importCacheMock.loadImportedFiles.mockResolvedValueOnce([brokenRef]);
    parsedCacheMock.loadParsedDataset.mockResolvedValueOnce(brokenIndex);

    render(<App />);

    expect(
      await screen.findByText("加载所选日期数据失败，请重新导入。")
    ).toBeInTheDocument();
    expect(screen.getByText("日期导航")).toBeInTheDocument();
  });
});
