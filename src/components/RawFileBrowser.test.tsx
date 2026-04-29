import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ParsedVentilatorFile } from '../types';
import { RawFileBrowser } from './RawFileBrowser';

const file: ParsedVentilatorFile = {
  fileName: '20260429_flow.edf',
  kind: 'waveform_u8',
  header: {
    version: 'V2.12',
    patientId: 'device',
    recordingId: '',
    startTime: '2026-04-29 03:03:12.57',
    endTime: '2026-04-29 03:13:47.48',
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
    sampleRateHz: 80,
  },
  payloadBytes: 3,
  values: new Uint8Array([20, 19, 17]),
  records: [],
  rawPayload: new Uint8Array([20, 19, 17]),
  warnings: [],
};

describe('RawFileBrowser', () => {
  it('shows header fields and decoded preview', () => {
    render(<RawFileBrowser files={[file]} />);

    expect(screen.getByText('20260429_flow.edf')).toBeInTheDocument();
    expect(screen.getByText('waveform_u8')).toBeInTheDocument();
    expect(screen.getByText('20, 19, 17')).toBeInTheDocument();
  });
});
