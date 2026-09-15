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
  holdReaderGeneration: vi.fn(),
  invalidateImportedFiles: vi.fn(),
  loadImportedFiles: vi.fn(),
  readImportEpoch: vi.fn(),
  readImportGeneration: vi.fn(),
  reclaimUnreferencedContents: vi.fn(),
  releaseReaderGeneration: vi.fn(),
  saveImportedFiles: vi.fn(),
}));

const parsedCacheMock = vi.hoisted(() => ({
  invalidateParsedDataset: vi.fn(),
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
    importCacheMock.holdReaderGeneration.mockReturnValue(undefined);
    importCacheMock.invalidateImportedFiles.mockResolvedValue(7);
    importCacheMock.releaseReaderGeneration.mockReturnValue(undefined);
    importCacheMock.loadImportedFiles.mockResolvedValue({
      files: [],
      generation: null,
    });
    importCacheMock.readImportEpoch.mockResolvedValue(1);
    importCacheMock.readImportGeneration.mockResolvedValue(null);
    importCacheMock.reclaimUnreferencedContents.mockResolvedValue(undefined);
    importCacheMock.saveImportedFiles.mockResolvedValue("test-generation");
    parsedCacheMock.invalidateParsedDataset.mockResolvedValue(undefined);
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
    // 压力范围来自异步加载的 dayDetail,用 findBy 等待其到达
    expect(await screen.findByText("0.1 - 0.9")).toBeInTheDocument();
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
    // 新导入开始时立即作废旧缓存
    expect(importCacheMock.invalidateImportedFiles).toHaveBeenCalled();
    // 缓存写入在数据集展示后后台进行,用 waitFor 等待触发;
    // 第二个参数是活跃写入被新导入取代时的中止检查,
    // 第三个参数是作废事务返回并绑定的基线纪元
    await vi.waitFor(() =>
      expect(importCacheMock.saveImportedFiles).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: "20260429_flow.edf" }),
        ]),
        expect.any(Function),
        7
      )
    );
    // 缓存写入完成后会重新加载缓存引用以切换数据来源
    await vi.waitFor(() =>
      expect(
        importCacheMock.loadImportedFiles.mock.calls.length
      ).toBeGreaterThanOrEqual(2)
    );
  });

  it("warns when a cross-tab invalidation cancels the active cache write", async () => {
    // 本地轮次未变但写入因另一标签页作废(纪元推进)返回 null:
    // 不能静默收场——展示的数据集未缓存,刷新不可恢复,必须告知
    importCacheMock.saveImportedFiles.mockResolvedValue(null);

    render(<App />);
    await userEvent.upload(
      screen.getByLabelText("选择 EDF 文件"),
      edfFile("20260429_flow.edf", "flow", new Uint8Array([20, 19, 17]))
    );
    expect(await screen.findByText("日期导航")).toBeInTheDocument();

    expect(await screen.findByText(/无法缓存这些文件/)).toBeInTheDocument();
  });

  it("warns when the cached-reference handoff fails", async () => {
    // 交接中的加载/协调锁异常不得静默:提示用户保持数据源连接
    importCacheMock.loadImportedFiles
      .mockResolvedValueOnce({ files: [], generation: null }) // 启动恢复:无缓存
      .mockRejectedValueOnce(new Error("gc lock failed")); // 交接重取失败
    // 纪元读取失败也不得阻断交接(raw 缓存已 durable):
    // 第一次读取=解析保存前的门禁,第二次=交接前的复核
    importCacheMock.readImportEpoch
      .mockResolvedValueOnce(7)
      .mockRejectedValueOnce(new Error("epoch read failed"));

    render(<App />);
    await userEvent.upload(
      screen.getByLabelText("选择 EDF 文件"),
      edfFile("20260429_flow.edf", "flow", new Uint8Array([20, 19, 17]))
    );
    expect(await screen.findByText("日期导航")).toBeInTheDocument();

    expect(await screen.findByText(/未能切换到缓存引用/)).toBeInTheDocument();
    // 纪元读取失败跳过了解析保存,但不得误报未缓存
    expect(screen.queryByText(/无法缓存这些文件/)).not.toBeInTheDocument();
  });

  it("skips the cache write when the invalidation returns no epoch", async () => {
    // 作废失败 → 拿不到可绑定的基线纪元:不得入队无基线的写入
    // (会被其他标签页的作废利用),直接报告未缓存
    importCacheMock.invalidateImportedFiles.mockResolvedValue(null);

    render(<App />);
    await userEvent.upload(
      screen.getByLabelText("选择 EDF 文件"),
      edfFile("20260429_flow.edf", "flow", new Uint8Array([20, 19, 17]))
    );
    expect(await screen.findByText("日期导航")).toBeInTheDocument();

    expect(await screen.findByText(/无法缓存这些文件/)).toBeInTheDocument();
    expect(importCacheMock.saveImportedFiles).not.toHaveBeenCalled();
    // raw 作废失败时不得清空解析缓存(它属于仍有效的旧数据集)
    expect(parsedCacheMock.invalidateParsedDataset).toHaveBeenCalledWith(null);
  });

  it("skips the parsed-cache save when the epoch moved past the baseline", async () => {
    // 写入前纪元门禁:其他标签页又作废/发布时不写旧索引,
    // 避免被暂停后恢复的旧导入覆盖新代际的有效索引
    importCacheMock.invalidateImportedFiles.mockResolvedValue(7);
    // 解析缓存写入前的门禁读取返回已推进的纪元(与基线 7 失配)→ 跳过保存
    importCacheMock.readImportEpoch.mockResolvedValue(8);

    render(<App />);
    await userEvent.upload(
      screen.getByLabelText("选择 EDF 文件"),
      edfFile("20260429_flow.edf", "flow", new Uint8Array([20, 19, 17]))
    );
    expect(await screen.findByText("日期导航")).toBeInTheDocument();

    // 解析保存被跳过:既无解析失败提示,也无未缓存误报
    await vi.waitFor(() => {
      expect(
        importCacheMock.readImportEpoch.mock.calls.length
      ).toBeGreaterThanOrEqual(1);
    });
    expect(parsedCacheMock.saveParsedDataset).not.toHaveBeenCalled();
    expect(screen.queryByText(/解析索引缓存保存失败/)).not.toBeInTheDocument();
    expect(screen.queryByText(/无法缓存这些文件/)).not.toBeInTheDocument();
  });

  it("reports parsed-cache failures separately from file-cache failures", async () => {
    parsedCacheMock.saveParsedDataset.mockRejectedValueOnce(
      new Error("quota exceeded")
    );
    // 写入前纪元门禁:基线 7 与门禁读取一致,解析保存才会执行
    importCacheMock.invalidateImportedFiles.mockResolvedValue(7);
    importCacheMock.readImportEpoch.mockResolvedValue(7);

    render(<App />);
    await userEvent.upload(
      screen.getByLabelText("选择 EDF 文件"),
      edfFile("20260429_flow.edf", "flow", new Uint8Array([20, 19, 17]))
    );

    // 文件内容已 durable:提示应只针对解析缓存,不要求重新导入
    expect(await screen.findByText(/解析索引缓存保存失败/)).toBeInTheDocument();
    expect(screen.queryByText(/无法缓存这些文件/)).not.toBeInTheDocument();
  });

  it("shows a keep-source-connected notice while caching is in progress", async () => {
    let resolveSave: (() => void) | undefined;
    importCacheMock.saveImportedFiles.mockImplementation(
      () =>
        new Promise<string | null>((resolve) => {
          resolveSave = () => resolve("test-generation");
        })
    );

    render(<App />);
    await userEvent.upload(
      screen.getByLabelText("选择 EDF 文件"),
      edfFile("20260429_flow.edf", "flow", new Uint8Array([20, 19, 17]))
    );
    expect(await screen.findByText("日期导航")).toBeInTheDocument();

    // 缓存写入进行中:提示用户数据源(如 SD 卡)还需保持连接
    expect(await screen.findByText(/正在缓存文件/)).toBeInTheDocument();
    resolveSave?.();
    await vi.waitFor(() =>
      expect(screen.queryByText(/正在缓存文件/)).not.toBeInTheDocument()
    );
  });

  it("restores the last imported files from browser cache on startup", async () => {
    importCacheMock.loadImportedFiles.mockResolvedValueOnce({
      files: [
        importedFile("20260429_flow.edf", "flow", new Uint8Array([20, 19, 17])),
        importedFile(
          "20260429_pressure.edf",
          "pressure",
          new Uint8Array([1, 0, 9, 0])
        ),
      ],
      generation: "test-generation",
      epoch: 1,
    });
    importCacheMock.readImportGeneration.mockResolvedValue("test-generation");

    render(<App />);

    expect(await screen.findByText("日期导航")).toBeInTheDocument();
    expect(screen.getByText("已恢复上次导入的文件。")).toBeInTheDocument();
    expect(screen.getAllByText("2026-04-29").length).toBeGreaterThan(0);
    expect(
      screen.queryByText("导入 DATAFILE 开始查看")
    ).not.toBeInTheDocument();
  });

  it("abandons a stale restore superseded by a newer import", async () => {
    // 恢复还在重建旧数据集时用户导入了新数据集:
    // 发布代际已变,恢复必须放弃,不得覆盖新导入的显示
    let resolveRestoreLoad:
      | ((value: {
          files: ImportedFileRef[];
          epoch: number;
          generation: string | null;
        }) => void)
      | undefined;
    importCacheMock.loadImportedFiles.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRestoreLoad = resolve;
        })
    );
    importCacheMock.readImportGeneration.mockResolvedValue("new-generation");

    render(<App />);
    await userEvent.upload(
      screen.getByLabelText("选择 EDF 文件"),
      edfFile("20260429_flow.edf", "flow", new Uint8Array([20, 19, 17]))
    );
    expect(await screen.findByText("日期导航")).toBeInTheDocument();

    // 旧快照迟到:其代际与当前发布代际不符,恢复应静默放弃
    resolveRestoreLoad?.({
      files: [importedFile("20260101_flow.edf", "flow", new Uint8Array([7]))],
      generation: "old-generation",
      epoch: 5,
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(
      screen.queryByText("已恢复上次导入的文件。")
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/2026-01-01/)).not.toBeInTheDocument();
    expect(screen.getAllByText("2026-04-29").length).toBeGreaterThan(0);
    // 恢复放弃后必须释放读者锁,否则被放弃的代际被钉住到页面关闭
    expect(importCacheMock.releaseReaderGeneration).toHaveBeenCalled();
    // 过时恢复不得把旧代际的解析索引写进缓存(导入自身的写入除外)
    expect(parsedCacheMock.saveParsedDataset).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "old-generation"
    );
  });

  it("abandons a restore superseded by a local import even when the generation is unchanged", async () => {
    // 发布代际在导入作废后刻意保持不变(为了其他标签页),
    // 因此本地导入还必须通过轮次号取消恢复
    let resolveRestoreLoad:
      | ((value: {
          files: ImportedFileRef[];
          epoch: number;
          generation: string | null;
        }) => void)
      | undefined;
    importCacheMock.loadImportedFiles.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRestoreLoad = resolve;
        })
    );
    // 代际与快照一致:若只依赖代际复查,恢复会错误地覆盖新导入
    importCacheMock.readImportGeneration.mockResolvedValue("same-generation");

    render(<App />);
    await userEvent.upload(
      screen.getByLabelText("选择 EDF 文件"),
      edfFile("20260429_flow.edf", "flow", new Uint8Array([20, 19, 17]))
    );
    expect(await screen.findByText("日期导航")).toBeInTheDocument();

    resolveRestoreLoad?.({
      files: [importedFile("20260101_flow.edf", "flow", new Uint8Array([7]))],
      generation: "same-generation",
      epoch: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(
      screen.queryByText("已恢复上次导入的文件。")
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/2026-01-01/)).not.toBeInTheDocument();
    expect(screen.getAllByText("2026-04-29").length).toBeGreaterThan(0);
    // 恢复放弃后必须释放读者锁,否则被放弃的代际被钉住到页面关闭
    expect(importCacheMock.releaseReaderGeneration).toHaveBeenCalled();
  });

  it("suppresses the restore error after a newer import completes", async () => {
    // 恢复仍在读取/重建时导入完成(其写回收了恢复正在读取的内容):
    // 迟到的恢复失败不得在成功的新导入上安装"无法恢复"的过时警告
    let resolveRestoreLoad:
      | ((value: {
          files: ImportedFileRef[];
          epoch: number;
          generation: string | null;
        }) => void)
      | undefined;
    importCacheMock.loadImportedFiles.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRestoreLoad = resolve;
        })
    );

    render(<App />);
    await userEvent.upload(
      screen.getByLabelText("选择 EDF 文件"),
      edfFile("20260429_flow.edf", "flow", new Uint8Array([20, 19, 17]))
    );
    expect(await screen.findByText("日期导航")).toBeInTheDocument();

    // 迟到的恢复:其内容读取直接失败 → 恢复 catch 触发
    const brokenRef: ImportedFileRef = {
      name: "20260101_flow.edf",
      path: "20260101_flow.edf",
      size: 3,
      lastModified: 0,
      read: () => Promise.reject(new Error("content reclaimed")),
    };
    resolveRestoreLoad?.({
      files: [brokenRef],
      generation: "old-generation",
      epoch: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(
      screen.queryByText("已恢复上次导入的文件。")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/无法恢复上次导入的文件/)
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("2026-04-29").length).toBeGreaterThan(0);
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
    importCacheMock.loadImportedFiles.mockResolvedValueOnce({
      files: [brokenRef],
      generation: "test-generation",
      epoch: 1,
    });
    importCacheMock.readImportGeneration.mockResolvedValue("test-generation");
    parsedCacheMock.loadParsedDataset.mockResolvedValueOnce(brokenIndex);

    render(<App />);

    expect(
      await screen.findByText("加载所选日期数据失败，请重新导入。")
    ).toBeInTheDocument();
    expect(screen.getByText("日期导航")).toBeInTheDocument();
  });
});
