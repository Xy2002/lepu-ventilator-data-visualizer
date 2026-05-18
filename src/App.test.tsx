import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const chartMock = vi.hoisted(() => ({
  dispatchAction: vi.fn(),
  dispose: vi.fn(),
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

vi.mock('echarts/core', () => echartsCoreMock);
vi.mock('echarts/charts', () => ({ LineChart: {} }));
vi.mock('echarts/components', () => ({
  DataZoomComponent: {},
  GridComponent: {},
  MarkLineComponent: {},
  ToolboxComponent: {},
  TooltipComponent: {},
}));
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }));
vi.mock('./data/importCache', () => importCacheMock);

import { App } from './App';
import { makeEdfLikeFile, makeEventPayload, makeEventPayloadAt } from './parser/fixtures';
import type { ImportedFileRef } from './types';

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

function edfFile(name: string, label: string, payload: Uint8Array) {
  const bytes = makeEdfLikeFile(label, payload);
  const file = new File([bytes], name, { type: 'application/octet-stream' });

  if (typeof file.arrayBuffer !== 'function') {
    Object.defineProperty(file, 'arrayBuffer', {
      value: () => Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
    });
  }

  return file;
}

function importedFile(name: string, label: string, payload: Uint8Array): ImportedFileRef {
  return {
    name,
    path: name,
    file: edfFile(name, label, payload),
  };
}

function concatPayloads(...payloads: Uint8Array[]) {
  const bytes = new Uint8Array(payloads.reduce((total, payload) => total + payload.length, 0));
  let offset = 0;
  for (const payload of payloads) {
    bytes.set(payload, offset);
    offset += payload.length;
  }
  return bytes;
}

describe('App', () => {
  beforeEach(() => {
    importCacheMock.loadImportedFiles.mockResolvedValue([]);
    importCacheMock.saveImportedFiles.mockResolvedValue(undefined);
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
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

  it('renders import-first empty state', () => {
    render(<App />);

    expect(screen.getByText('呼吸机数据可视化')).toBeInTheDocument();
    expect(screen.getByText('导入 DATAFILE 开始查看')).toBeInTheDocument();
    expect(screen.getByText('浏览器本地解析，不上传原始数据')).toBeInTheDocument();
  });

  it('indexes uploaded files and renders selected-day detail', async () => {
    render(<App />);

    await userEvent.upload(screen.getByLabelText('选择 EDF 文件'), [
      edfFile('20260429_flow.edf', 'flow', new Uint8Array([20, 19, 17])),
      edfFile('20260429_pressure.edf', 'pressure', new Uint8Array([1, 0, 9, 0])),
      edfFile('20260429_hi.edf', 'hi', makeEventPayload(1, 15)),
      edfFile(
        '20260429_usetime.edf',
        'usetime',
        concatPayloads(
          makeEventPayloadAt(120, 677025283, new Date(Date.UTC(2026, 3, 29, 8, 30, 0))),
          makeEventPayloadAt(180, 677025283, new Date(Date.UTC(2026, 3, 29, 10, 3, 0))),
        ),
      ),
    ]);

    expect(await screen.findByText('日期导航')).toBeInTheDocument();
    expect(await screen.findByText('5:00')).toBeInTheDocument();
    expect(screen.getByText('2 个使用会话')).toBeInTheDocument();
    expect(screen.getByText('2026-04-29 08:28:00 至 2026-04-29 08:30:00')).toBeInTheDocument();
    expect(screen.getByText('2026-04-29 10:00:00 至 2026-04-29 10:03:00')).toBeInTheDocument();
    expect(screen.getByText('0 / 1')).toBeInTheDocument();
    expect(screen.getByText('1 - 9')).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'flow ECharts waveform chart' })).toBeInTheDocument();
    expect(chartMock.setOption).toHaveBeenCalledWith(
      expect.objectContaining({
        xAxis: expect.objectContaining({ type: 'time', name: 'real time' }),
      }),
      true,
    );
    expect((await screen.findAllByText('定位')).length).toBeGreaterThan(0);
    expect(importCacheMock.saveImportedFiles).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: '20260429_flow.edf' })]),
    );
  });

  it('restores the last imported files from browser cache on startup', async () => {
    importCacheMock.loadImportedFiles.mockResolvedValueOnce([
      importedFile('20260429_flow.edf', 'flow', new Uint8Array([20, 19, 17])),
      importedFile('20260429_pressure.edf', 'pressure', new Uint8Array([1, 0, 9, 0])),
    ]);

    render(<App />);

    expect(await screen.findByText('日期导航')).toBeInTheDocument();
    expect(screen.getByText('已恢复上次导入的文件。')).toBeInTheDocument();
    expect(screen.getAllByText('2026-04-29').length).toBeGreaterThan(0);
    expect(screen.queryByText('导入 DATAFILE 开始查看')).not.toBeInTheDocument();
  });
});
