import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { makeEdfLikeFile, makeEventPayload } from './parser/fixtures';

const canvasContext = {
  beginPath: vi.fn(),
  clearRect: vi.fn(),
  lineTo: vi.fn(),
  moveTo: vi.fn(),
  scale: vi.fn(),
  setTransform: vi.fn(),
  stroke: vi.fn(),
  strokeStyle: '',
  lineWidth: 1,
};

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

describe('App', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      canvasContext as unknown as CanvasRenderingContext2D,
    );
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
    ]);

    expect(await screen.findByText('日期导航')).toBeInTheDocument();
    expect(await screen.findByText('10:34')).toBeInTheDocument();
    expect(screen.getByText('0 / 1')).toBeInTheDocument();
    expect(screen.getByText('1 - 9')).toBeInTheDocument();
    expect(screen.getByLabelText('flow waveform')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'hi' })).toBeInTheDocument();
  });
});
