import { describe, expect, it } from 'vitest';
import { exportEventsCsv, exportWaveformCsv } from './csv';

describe('csv exports', () => {
  it('exports waveform rows with seconds', () => {
    expect(exportWaveformCsv(new Uint8Array([10, 20]), 80)).toBe(
      'index,seconds,value\n0,0.000000,10\n1,0.012500,20\n',
    );
  });

  it('keeps the seconds column empty when sample rate is unknown', () => {
    expect(exportWaveformCsv(new Uint8Array([10, 20]), null)).toBe(
      'index,seconds,value\n0,,10\n1,,20\n',
    );
  });

  it('exports event rows', () => {
    expect(
      exportEventsCsv([
        {
          sourceLabel: 'hi',
          value1: 1,
          value2: 15,
          timestamp: '2026-04-29 03:04:41.22',
          secondsFromDayStart: 89.65,
        },
      ]),
    ).toBe(
      'index,source,value1,value2,timestamp,secondsFromDayStart\n0,hi,1,15,2026-04-29 03:04:41.22,89.650000\n',
    );
  });
});
