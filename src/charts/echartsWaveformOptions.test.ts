import { describe, expect, it } from "vitest";
import {
  buildEChartsWaveformOption,
  buildEChartsWaveformSeries,
} from "./echartsWaveformOptions";

describe("buildEChartsWaveformSeries", () => {
  it("maps samples across real use sessions and inserts gaps between sessions", () => {
    expect(
      buildEChartsWaveformSeries(new Uint8Array([10, 11, 20, 21]), {
        sampleRateHz: 1,
        useSessions: [
          {
            startTime: "2026-04-29 08:00:00",
            endTime: "2026-04-29 08:00:02",
            durationSeconds: 2,
          },
          {
            startTime: "2026-04-29 09:00:00",
            endTime: "2026-04-29 09:00:02",
            durationSeconds: 2,
          },
        ],
      })
    ).toEqual([
      [Date.UTC(2026, 3, 29, 8, 0, 0), 10],
      [Date.UTC(2026, 3, 29, 8, 0, 1), 11],
      [Date.UTC(2026, 3, 29, 8, 0, 2), null],
      [Date.UTC(2026, 3, 29, 9, 0, 0), 20],
      [Date.UTC(2026, 3, 29, 9, 0, 1), 21],
    ]);
  });

  it("converts waveform values into real EDF timestamps when start time is available", () => {
    expect(
      buildEChartsWaveformSeries(new Int16Array([-2, 0, 4]), {
        sampleRateHz: 2,
        startTime: "2026-04-29 03:03:12.57",
      })
    ).toEqual([
      [1777431792570, -2],
      [1777431793070, 0],
      [1777431793570, 4],
    ]);
  });

  it("converts waveform values into numeric second-value points for analysis charts", () => {
    expect(
      buildEChartsWaveformSeries(new Int16Array([-2, 0, 4]), {
        sampleRateHz: 2,
      })
    ).toEqual([
      [0, -2],
      [0.5, 0],
      [1, 4],
    ]);
  });

  it("falls back to sample index when sample rate is unknown", () => {
    expect(
      buildEChartsWaveformSeries(new Uint8Array([7, 9]), { sampleRateHz: null })
    ).toEqual([
      [0, 7],
      [1, 9],
    ]);
  });

  it("masks uint16 saturation-rail samples as null so the y axis is not stretched", () => {
    // 语料实测:real_pres 传感器饱和带为 65514~65535(2024 年 42% 天数出现,
    // 首次饱和 2/3 落在文件开头 5 秒内),合理压力最高仅 412,中间无观测值
    const points = buildEChartsWaveformSeries(
      new Uint16Array([412, 65535, 100, 65534, 65514, 32768, 90]),
      { sampleRateHz: 1 }
    );
    expect(points.map(([, value]) => value)).toEqual([
      412,
      null,
      100,
      null,
      null,
      null,
      90,
    ]);
  });

  it("masks uint8 rail samples in flow channels as null", () => {
    const points = buildEChartsWaveformSeries(new Uint8Array([252, 255, 250]), {
      sampleRateHz: 1,
    });
    expect(points.map(([, value]) => value)).toEqual([252, null, 250]);
  });

  it("masks int16 rail samples in signed channels as null", () => {
    const points = buildEChartsWaveformSeries(
      new Int16Array([-32768, 200, 32767]),
      { sampleRateHz: 1 }
    );
    expect(points.map(([, value]) => value)).toEqual([null, 200, null]);
  });

  it("scales pressure channels to the therapy band so transient spikes do not set the axis", () => {
    // 双水平平台信号(EPAP 90 / IPAP 190)+ 一个 400 的瞬时过冲:过冲是真实数据,
    // 但不应决定 y 轴刻度(超出部分在网格边缘裁剪)
    const values = new Uint16Array(2000);
    for (let i = 0; i < values.length; i++) values[i] = i % 20 < 10 ? 90 : 190;
    values[3] = 400;

    const option = buildEChartsWaveformOption({
      label: "real_pres",
      values,
      sampleRateHz: 2,
    });

    expect(option.yAxis).toMatchObject({ min: 82, max: 198 });
  });

  it("combines main and overlay channels when scaling the pressure overlay axis", () => {
    const values = new Uint16Array(1000).fill(90);
    const overlayValues = new Uint16Array(1000).fill(190);
    overlayValues[7] = 400;

    const option = buildEChartsWaveformOption({
      label: "pressure",
      values,
      sampleRateHz: 2,
      overlay: { label: "real_pres", values: overlayValues },
    });

    expect(option.yAxis).toMatchObject({ min: 82, max: 198 });
  });

  it("keeps the data-driven y-axis for waveform channels where clipping would distort shape", () => {
    const option = buildEChartsWaveformOption({
      label: "flow",
      values: new Uint8Array([10, 200, 12]),
      sampleRateHz: 2,
    });

    expect(option.yAxis).toMatchObject({
      scale: true,
      min: "dataMin",
      max: "dataMax",
    });
  });

  it("pads a flat pressure signal instead of collapsing the axis to a single value", () => {
    const option = buildEChartsWaveformOption({
      label: "pressure",
      values: new Uint16Array(500).fill(95),
      sampleRateHz: 2,
    });

    expect(option.yAxis).toMatchObject({ min: 93, max: 97 });
  });
});

describe("buildEChartsWaveformOption", () => {
  it("renders EDF waveform charts against real clock time when header start time is available", () => {
    const option = buildEChartsWaveformOption({
      label: "flow",
      values: new Uint8Array([20, 19, 17]),
      sampleRateHz: 2,
      startTime: "2026-04-29 03:03:12.57",
      eventMarkers: [
        { timestamp: "2026-04-29 03:03:13.07", sourceLabel: "ai" },
      ],
    });

    expect(option.useUTC).toBe(true);
    expect(option.xAxis).toMatchObject({ type: "time", name: "真实时间" });
    expect(option.series).toEqual([
      expect.objectContaining({
        data: [
          [1777431792570, 20],
          [1777431793070, 19],
          [1777431793570, 17],
        ],
        markLine: expect.objectContaining({
          data: [
            expect.objectContaining({
              xAxis: 1777431793070,
              name: "AI 呼吸暂停",
            }),
          ],
        }),
      }),
    ]);
  });

  it("uses session timing for real clock charts when use sessions are available", () => {
    const option = buildEChartsWaveformOption({
      label: "flow",
      values: new Uint8Array([20, 19, 17, 16]),
      sampleRateHz: 1,
      useSessions: [
        {
          startTime: "2026-04-29 08:00:00",
          endTime: "2026-04-29 08:00:02",
          durationSeconds: 2,
        },
        {
          startTime: "2026-04-29 09:00:00",
          endTime: "2026-04-29 09:00:02",
          durationSeconds: 2,
        },
      ],
      eventMarkers: [{ timestamp: "2026-04-29 09:00:01", sourceLabel: "hi" }],
    });

    expect(option.xAxis).toMatchObject({ type: "time", name: "真实时间" });
    expect(option.series).toEqual([
      expect.objectContaining({
        data: [
          [Date.UTC(2026, 3, 29, 8, 0, 0), 20],
          [Date.UTC(2026, 3, 29, 8, 0, 1), 19],
          [Date.UTC(2026, 3, 29, 8, 0, 2), null],
          [Date.UTC(2026, 3, 29, 9, 0, 0), 17],
          [Date.UTC(2026, 3, 29, 9, 0, 1), 16],
        ],
        markLine: expect.objectContaining({
          data: [
            expect.objectContaining({
              xAxis: Date.UTC(2026, 3, 29, 9, 0, 1),
              name: "HI 低通气",
            }),
          ],
        }),
      }),
    ]);
  });

  it("enables professional waveform analysis interactions", () => {
    const option = buildEChartsWaveformOption({
      label: "pressure",
      values: new Uint16Array([1, 2, 3, 4]),
      sampleRateHz: 2,
      eventMarkers: [
        { secondsFromDayStart: 0.5, sourceLabel: "ascp" },
        { secondsFromDayStart: 1, sourceLabel: "ascp" },
      ],
    });

    expect(option.tooltip).toMatchObject({
      trigger: "axis",
      axisPointer: { type: "cross" },
    });
    expect(option.xAxis).toMatchObject({ type: "value", name: "秒" });
    // pressure 通道走分位数数值轴(4 样本的 99.5% 分位=3,+最小 2 外扩,下限钳 0)
    expect(option.yAxis).toMatchObject({ type: "value", min: 0, max: 5 });
    expect(option.dataZoom).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "inside",
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
        }),
        expect.objectContaining({ type: "slider", xAxisIndex: 0 }),
      ])
    );
    expect(option.series).toEqual([
      expect.objectContaining({
        name: "pressure",
        type: "line",
        symbol: "none",
        sampling: "lttb",
        markLine: expect.objectContaining({
          data: [
            expect.objectContaining({ xAxis: 0.5, name: "ASCP 压力调整" }),
            expect.objectContaining({ xAxis: 1, name: "ASCP 压力调整" }),
          ],
        }),
      }),
    ]);
  });

  it("omits event mark lines when the waveform cannot be time-aligned", () => {
    const option = buildEChartsWaveformOption({
      label: "difleak",
      values: new Uint8Array([1, 2, 3]),
      sampleRateHz: null,
      eventMarkers: [
        { secondsFromDayStart: 1, sourceLabel: "ai" },
        { secondsFromDayStart: 2, sourceLabel: "ai" },
      ],
    });

    const series = option.series as Array<Record<string, unknown>>;
    expect(series[0]).not.toHaveProperty("markLine");
  });
});

describe("buildEChartsWaveformOption overlay", () => {
  it("appends a second series and legend when overlay values are provided", () => {
    const option = buildEChartsWaveformOption({
      label: "pressure",
      values: new Uint16Array([1, 2, 3]),
      sampleRateHz: null,
      overlay: { label: "real_pres", values: new Uint16Array([4, 5, 6]) },
    });

    const series = option.series as Array<{ name: string; type: string }>;
    expect(series).toHaveLength(2);
    expect(series[0].name).toBe("pressure");
    expect(series[1].name).toBe("real_pres");
    expect((option.legend as { data: string[] }).data).toEqual([
      "pressure",
      "real_pres",
    ]);
  });

  it("keeps a single series without overlay", () => {
    const option = buildEChartsWaveformOption({
      label: "flow",
      values: new Uint8Array([1]),
      sampleRateHz: null,
    });
    expect(option.series).toHaveLength(1);
    expect(option.legend).toBeUndefined();
  });

  it("masks saturation rails in the overlay series as well", () => {
    const option = buildEChartsWaveformOption({
      label: "pressure",
      values: new Uint16Array([100, 110]),
      sampleRateHz: null,
      overlay: { label: "real_pres", values: new Uint16Array([65535, 95]) },
    });

    const series = option.series as Array<{
      name: string;
      data: [number, number | null][];
    }>;
    const overlaySeries = series.find((s) => s.name === "real_pres")!;
    expect(overlaySeries.data.map(([, value]) => value)).toEqual([null, 95]);
  });
});
