import { useEffect, useRef } from 'react';
import { downsampleMinMax } from './downsample';

interface WaveformCanvasProps {
  label: string;
  values: Uint8Array | Uint16Array | Int16Array;
  sampleRateHz: number | null;
  eventSeconds?: number[];
}

export function WaveformCanvas({ label, values, sampleRateHz, eventSeconds = [] }: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const rect = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * scale));
    canvas.height = Math.max(1, Math.floor(rect.height * scale));
    context.scale(scale, scale);
    context.clearRect(0, 0, rect.width, rect.height);

    if (values.length === 0) return;

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const value of values) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }

    const range = max - min || 1;
    const points = downsampleMinMax(values, 0, values.length, Math.max(1, Math.floor(rect.width)));

    context.strokeStyle = '#16697a';
    context.lineWidth = 1.5;
    context.beginPath();
    points.forEach((point, index) => {
      const x = (point.index / Math.max(1, values.length - 1)) * rect.width;
      const y = rect.height - ((point.value - min) / range) * rect.height;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();

    context.strokeStyle = '#d1495b';
    context.lineWidth = 1;
    for (const second of eventSeconds) {
      if (!sampleRateHz) continue;

      const x = ((second * sampleRateHz) / Math.max(1, values.length - 1)) * rect.width;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, rect.height);
      context.stroke();
    }
  }, [eventSeconds, sampleRateHz, values]);

  return (
    <section className="waveform-panel">
      <div className="chart-header">
        <h3>{label}</h3>
        <span>
          {values.length} samples · {sampleRateHz ?? '-'} Hz
        </span>
      </div>
      <canvas ref={canvasRef} aria-label={`${label} waveform`} />
    </section>
  );
}
