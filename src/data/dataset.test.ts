import { describe, expect, it, vi } from "vitest";
import {
  makeEdfLikeFile,
  makeEventPayload,
  makeEventPayloadAt,
} from "../parser/fixtures";
import type { ImportedFileRef } from "../types";
import {
  buildDatasetIndex,
  filterDays,
  inspectDayDetailCache,
  loadDayDetail,
  type IndexProgress,
} from "./dataset";

function imported(
  path: string,
  label: string,
  payload: Uint8Array
): ImportedFileRef {
  const segments = path.split("/");
  const name = segments[segments.length - 1] ?? path;
  const bytes = makeEdfLikeFile(label, payload);
  const file = new File([bytes], name);

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

  return {
    name,
    path,
    file,
  };
}

function makeImportedFiles() {
  return [
    imported(
      "DATAFILE/20260429/20260429_flow.edf",
      "flow",
      new Uint8Array([20, 19, 17])
    ),
    imported(
      "DATAFILE/20260429/20260429_pressure.edf",
      "pressure",
      new Uint8Array([1, 0, 9, 0])
    ),
    imported(
      "DATAFILE/20260429/20260429_hi.edf",
      "hi",
      makeEventPayload(1, 15)
    ),
    imported(
      "DATAFILE/20260429/20260429_usetime.edf",
      "usetime",
      makeEventPayloadAt(
        120,
        677025283,
        new Date(Date.UTC(2026, 3, 29, 8, 30, 0))
      )
    ),
    imported(
      "DATAFILE/20260429/20260429_mystery.edf",
      "mystery",
      new Uint8Array([7, 8])
    ),
    imported(
      "DATAFILE/20260428/20260428_pressure.edf",
      "pressure",
      new Uint8Array([2, 0, 6, 0])
    ),
  ];
}

describe("dataset indexing", () => {
  it("buildDatasetIndex groups imported files by date and computes summaries", async () => {
    const index = await buildDatasetIndex(makeImportedFiles());

    expect(index.days).toEqual(["2026-04-28", "2026-04-29"]);
    expect(index.summariesByDay["2026-04-29"].eventCounts.hi).toBe(1);
    expect(index.summariesByDay["2026-04-29"].sampleCounts.flow).toBe(3);
    expect(index.summariesByDay["2026-04-29"].startTime).toBe(
      "2026-04-29 08:28:00"
    );
    expect(index.summariesByDay["2026-04-29"].endTime).toBe(
      "2026-04-29 08:30:00"
    );
    expect(index.summariesByDay["2026-04-29"].useDurationSeconds).toBe(120);
    expect(index.summariesByDay["2026-04-29"].pressureRange).toBeNull();
  });

  it("filterDays filters by range, event presence, and missing files", async () => {
    const index = await buildDatasetIndex(makeImportedFiles());

    expect(
      filterDays(index, { startDate: "2026-04-29", endDate: "2026-04-29" })
    ).toEqual(["2026-04-29"]);
    expect(filterDays(index, { requireEvent: "hi" })).toEqual(["2026-04-29"]);
    expect(filterDays(index, { missingFilesOnly: true })).toEqual([
      "2026-04-28",
      "2026-04-29",
    ]);
    expect(filterDays(index, { requireEvent: "ascp" })).toEqual([]);
  });

  it("buildDatasetIndex falls back to the file name when a browser file has no relative path", async () => {
    const file = imported("20260430_flow.edf", "flow", new Uint8Array([1]));
    const index = await buildDatasetIndex([{ ...file, path: "" }]);

    expect(index.days).toEqual(["2026-04-30"]);
    expect(index.warnings).toEqual([]);
  });

  it("loadDayDetail loads selected day, returns signal labels, event count, and rawFiles count", async () => {
    const index = await buildDatasetIndex(makeImportedFiles());

    const detail = await loadDayDetail(index, "2026-04-29");

    expect(detail.signals.map((file) => file.header.label)).toEqual([
      "flow",
      "pressure",
    ]);
    expect(detail.useSessions).toEqual([
      {
        startTime: "2026-04-29 08:28:00",
        endTime: "2026-04-29 08:30:00",
        durationSeconds: 120,
      },
    ]);
    expect(
      detail.events.filter((event) => event.sourceLabel === "hi")
    ).toHaveLength(1);
    expect(
      detail.events.find((event) => event.sourceLabel === "hi")
        ?.secondsFromDayStart
    ).toBeUndefined();
    expect(detail.rawFiles.map((file) => file.header.label)).toEqual([
      "flow",
      "pressure",
      "hi",
      "usetime",
      "mystery",
    ]);
    expect(detail.summary.pressureRange).toEqual({ min: 0.1, max: 0.9 });
  });

  it("keeps waveform payloads out of the index and loads them on demand", async () => {
    const files = [
      "20260421",
      "20260422",
      "20260423",
      "20260424",
      "20260425",
    ].map((day) =>
      imported(`${day}_flow.edf`, "flow", new Uint8Array([7, 8, 9]))
    );
    const index = await buildDatasetIndex(files);
    expect(index.days).toHaveLength(5);

    // 索引阶段：波形仅含头部，采样数按 payload 字节推算
    for (const day of index.days) {
      for (const file of index.parsedFilesByDay[day]) {
        expect(file.kind).toBe("waveform_u8");
        expect(file.values.length).toBe(0);
        expect(file.rawPayload.length).toBe(0);
      }
    }
    expect(index.summariesByDay["2026-04-21"].sampleCounts.flow).toBe(3);
    expect(index.summariesByDay["2026-04-21"].signalPresence.flow).toBe(true);

    // 按需解析：payload 在 loadDayDetail 后补齐
    const detail = await loadDayDetail(index, "2026-04-21");
    const flow = detail.signals.find((file) => file.header.label === "flow");
    expect(Array.from(flow?.values ?? [])).toEqual([7, 8, 9]);

    // LRU：超过上限后最早的日被淘汰
    for (const day of index.days.slice(1)) await loadDayDetail(index, day);
    expect(inspectDayDetailCache(index).size).toBe(4);
    expect(inspectDayDetailCache(index).keys).not.toContain("2026-04-21");
  });

  it("fires onProgress as each day completes, not after all days", async () => {
    const events: Array<IndexProgress & { slowSettled: boolean }> = [];
    let settled = false;
    let resolveSlow: () => void = () => {};
    const slowBytes = makeEdfLikeFile("flow", new Uint8Array([1, 2, 3]));
    const slowFile = {
      size: slowBytes.byteLength,
      slice: (start: number, end: number) => ({
        arrayBuffer: () =>
          new Promise<ArrayBuffer>((resolve) => {
            resolveSlow = () => {
              settled = true;
              resolve(slowBytes.slice(start, end).buffer as ArrayBuffer);
            };
          }),
      }),
    } as unknown as File;
    const slow: ImportedFileRef = {
      name: "20260429_flow.edf",
      path: "20260429_flow.edf",
      file: slowFile,
    };
    const fast = imported("20260428_flow.edf", "flow", new Uint8Array([1]));

    const building = buildDatasetIndex([slow, fast], (progress) =>
      events.push({ ...progress, slowSettled: settled })
    );
    await vi.waitFor(() => {
      expect(events.length).toBe(1);
    });

    expect(events[0]).toEqual({ completed: 1, total: 2, slowSettled: false });

    resolveSlow();
    await building;

    expect(events[events.length - 1]).toEqual({
      completed: 2,
      total: 2,
      slowSettled: true,
    });
  });

  it("stops progress callbacks once a day fails mid-run", async () => {
    const events: number[] = [];
    let resolveSlow: () => void = () => {};
    const slowBytes = makeEdfLikeFile("flow", new Uint8Array([1]));
    const slowFile = {
      size: slowBytes.byteLength,
      slice: (start: number, end: number) => ({
        arrayBuffer: () =>
          new Promise<ArrayBuffer>((resolve) => {
            resolveSlow = () =>
              resolve(slowBytes.slice(start, end).buffer as ArrayBuffer);
          }),
      }),
    } as unknown as File;
    const badFile = {
      size: 514,
      slice: () => ({
        arrayBuffer: () => Promise.reject(new Error("boom")),
      }),
    } as unknown as File;

    const building = buildDatasetIndex(
      [
        {
          name: "20260428_flow.edf",
          path: "20260428_flow.edf",
          file: slowFile,
        },
        { name: "20260429_flow.edf", path: "20260429_flow.edf", file: badFile },
      ],
      (progress) => events.push(progress.completed)
    );

    await expect(building).rejects.toThrow("boom");

    resolveSlow();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(events).toEqual([]);
  });
});
