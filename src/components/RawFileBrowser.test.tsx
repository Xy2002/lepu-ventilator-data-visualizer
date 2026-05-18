import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BA525_SAMPLE_1_BYTES } from '../parser/ba525ConfigFixtures';
import type { ParsedVentilatorFile } from '../types';
import { RawFileBrowser } from './RawFileBrowser';

const file: ParsedVentilatorFile = {
  fileName: '20260429_flow.edf',
  kind: 'waveform_u8',
  header: {
    version: 'V2.12',
    patientId: 'device',
    recordingId: '',
    startTime: '2026-04-29 03:12:57',
    endTime: '2026-04-29 13:47:48',
    headerBytes: 512,
    firmware: 'V2.12-00001',
    field236: '0',
    field244: '80',
    signalCount: 1,
    label: 'flow',
    physicalDimension: '',
    physicalMin: '0',
    physicalMax: '100',
    digitalMin: '0',
    digitalMax: '100',
    sampleIntervalMs: 80,
    sampleRateHz: 12.5,
  },
  payloadBytes: 3,
  values: new Uint8Array([20, 19, 17]),
  records: [],
  rawPayload: new Uint8Array([20, 19, 17]),
  warnings: [],
};

describe('RawFileBrowser', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows header fields and decoded preview', () => {
    render(<RawFileBrowser files={[file]} />);

    expect(screen.getByText('20260429_flow.edf')).toBeInTheDocument();
    expect(screen.getByText('waveform_u8')).toBeInTheDocument();
    expect(screen.getByText('20, 19, 17')).toBeInTheDocument();
  });

  it('shows practical descriptions for each raw file type', () => {
    const files: ParsedVentilatorFile[] = [
      file,
      {
        ...file,
        fileName: '20260429_ai.edf',
        kind: 'events16',
        header: { ...file.header, label: 'ai', sampleIntervalMs: null, sampleRateHz: null },
        values: new Uint8Array(),
        records: [],
      },
      {
        ...file,
        fileName: '20260429_ascp.edf',
        kind: 'events16',
        header: { ...file.header, label: 'ascp', sampleIntervalMs: null, sampleRateHz: null },
        values: new Uint8Array(),
        records: [],
      },
      {
        ...file,
        fileName: '20260429_config.edf',
        kind: 'raw_config',
        header: { ...file.header, label: 'config', sampleIntervalMs: null, sampleRateHz: null },
        values: new Uint8Array(),
        records: [],
      },
    ];

    render(<RawFileBrowser files={files} />);

    expect(screen.getAllByText('气流波形：呼吸气流采样，用于观察吸气、呼气形态和事件前后的气流变化。')).toHaveLength(2);
    expect(screen.getAllByText('AI 事件：治疗过程中的呼吸暂停明细，value2 通常表示持续秒数。')).toHaveLength(2);
    expect(screen.getAllByText('ASCP 压力状态：Auto-S 模式下的 IPAP/EPAP 记录，二者差值对应设置的压力支撑。')).toHaveLength(2);
    expect(screen.getAllByText('配置快照：记录治疗模式、压力支撑、EPAP/IPAP、湿化和延时升压等设备设置。')).toHaveLength(2);
    expect(screen.getAllByText('说明')).toHaveLength(files.length);
  });

  it('renders BA525 config table for raw_config files with valid payload', () => {
    const configFile: ParsedVentilatorFile = {
      ...file,
      fileName: '20260429_config.edf',
      kind: 'raw_config',
      header: { ...file.header, label: 'config', sampleIntervalMs: null, sampleRateHz: null },
      values: new Uint8Array(),
      records: [],
      rawPayload: BA525_SAMPLE_1_BYTES,
    };

    render(<RawFileBrowser files={[configFile]} />);

    // Config table is present
    const table = document.querySelector('.config-table');
    expect(table).toBeTruthy();

    // Check some known locked fields from v1 fixture
    expect(screen.getByText('语言')).toBeTruthy();
    expect(screen.getByText('简体中文')).toBeTruthy();
    expect(screen.getByText('治疗模式')).toBeTruthy();
    expect(screen.getByText('Auto-S')).toBeTruthy();
    expect(screen.getByText('高吸气压力报警')).toBeTruthy();
    expect(screen.getByText('25.0 cmH2O')).toBeTruthy();

    // Status badges — multiple fields share each status
    expect(screen.getAllByText('已确认').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('交叉验证').length).toBeGreaterThanOrEqual(1);
  });

  it('falls back gracefully for short raw_config payload', () => {
    const shortConfig: ParsedVentilatorFile = {
      ...file,
      fileName: '20260429_config.edf',
      kind: 'raw_config',
      header: { ...file.header, label: 'config', sampleIntervalMs: null, sampleRateHz: null },
      values: new Uint8Array(),
      records: [],
      rawPayload: new Uint8Array(100),
    };

    render(<RawFileBrowser files={[shortConfig]} />);

    expect(screen.queryByText('参数')).not.toBeTruthy();
  });
});
