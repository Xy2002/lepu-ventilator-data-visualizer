import { useEffect, useMemo, useRef, useState } from 'react';
import { downsampleMinMax } from './downsample';

interface WaveformCanvasProps {
  label: string;
  values: Uint8Array | Uint16Array | Int16Array;
  sampleRateHz: number | null;
  eventSeconds?: number[];
  focusedSecond?: number | null;
}

interface Viewport {
  start: number;
  end: number;
}

interface HoverPoint {
  index: number;
  value: number;
  seconds: number | null;
}

function fullViewport(values: Uint8Array | Uint16Array | Int16Array): Viewport {
  return { start: 0, end: Math.max(1, values.length) };
}

function clampViewport(next: Viewport, valuesLength: number): Viewport {
  const minSpan = Math.min(valuesLength || 1, 32);
  const span = Math.max(minSpan, next.end - next.start);
  let start = Math.max(0, Math.min(valuesLength - span, next.start));
  if (!Number.isFinite(start)) start = 0;

  return { start, end: Math.min(valuesLength, start + span) };
}

export function WaveformCanvas({
  label,
  values,
  sampleRateHz,
  eventSeconds = [],
  focusedSecond = null,
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [viewport, setViewport] = useState<Viewport>(() => fullViewport(values));
  const [hover, setHover] = useState<HoverPoint | null>(null);

  const minMax = useMemo(() => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    for (const value of values) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }

    return { min: Number.isFinite(min) ? min : 0, max: Number.isFinite(max) ? max : 1 };
  }, [values]);

  useEffect(() => {
    setViewport(fullViewport(values));
  }, [values]);

  useEffect(() => {
    if (focusedSecond === null || !sampleRateHz || values.length === 0) return;

    const center = focusedSecond * sampleRateHz;
    const span = Math.min(values.length, Math.max(sampleRateHz * 20, 160));
    setViewport(clampViewport({ start: center - span / 2, end: center + span / 2 }, values.length));
  }, [focusedSecond, sampleRateHz, values.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const rect = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * scale));
    canvas.height = Math.max(1, Math.floor(rect.height * scale));
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.scale(scale, scale);
    context.clearRect(0, 0, rect.width, rect.height);

    const visibleSpan = Math.max(1, viewport.end - viewport.start);
    const valueRange = minMax.max - minMax.min || 1;
    const points = downsampleMinMax(values, viewport.start, viewport.end, Math.max(1, Math.floor(rect.width)));

    context.strokeStyle = '#16697a';
    context.lineWidth = 1.5;
    context.beginPath();
    points.forEach((point, index) => {
      const x = ((point.index - viewport.start) / visibleSpan) * rect.width;
      const y = rect.height - ((point.value - minMax.min) / valueRange) * rect.height;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();

    context.strokeStyle = '#d1495b';
    context.lineWidth = 1;
    for (const second of eventSeconds) {
      if (!sampleRateHz) continue;

      const eventIndex = second * sampleRateHz;
      if (eventIndex < viewport.start || eventIndex > viewport.end) continue;

      const x = ((eventIndex - viewport.start) / visibleSpan) * rect.width;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, rect.height);
      context.stroke();
    }
  }, [eventSeconds, minMax.max, minMax.min, sampleRateHz, values, viewport]);

  function resetZoom() {
    setViewport(fullViewport(values));
  }

  function handleWheel(event: React.WheelEvent<HTMLCanvasElement>) {
    event.preventDefault();

    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = rect.width ? (event.clientX - rect.left) / rect.width : 0.5;
    const currentSpan = viewport.end - viewport.start;
    const nextSpan = currentSpan * (event.deltaY < 0 ? 0.8 : 1.25);
    const anchor = viewport.start + ratio * currentSpan;

    setViewport(
      clampViewport(
        {
          start: anchor - ratio * nextSpan,
          end: anchor + (1 - ratio) * nextSpan,
        },
        values.length,
      ),
    );
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = rect.width ? (event.clientX - rect.left) / rect.width : 0;
    const index = Math.max(
      0,
      Math.min(values.length - 1, Math.round(viewport.start + ratio * (viewport.end - viewport.start))),
    );

    setHover({
      index,
      value: values[index],
      seconds: sampleRateHz ? index / sampleRateHz : null,
    });
  }

  return (
    <section className="waveform-panel">
      <div className="chart-header">
        <div>
          <h3>{label}</h3>
          <span>
            {values.length} samples · {sampleRateHz ?? '-'} Hz
          </span>
        </div>
        <button type="button" onClick={resetZoom}>
          重置缩放
        </button>
      </div>
      <canvas
        ref={canvasRef}
        aria-label={`${label} waveform`}
        onPointerMove={handlePointerMove}
        onWheel={handleWheel}
      />
      <div className="chart-readout">
        {hover ? (
          <span>
            index {hover.index} · value {hover.value}
            {hover.seconds === null ? '' : ` · ${hover.seconds.toFixed(2)}s`}
          </span>
        ) : (
          <span>移动鼠标查看采样点</span>
        )}
        {focusedSecond === null ? null : <span>事件焦点：{focusedSecond.toFixed(2)}s</span>}
      </div>
    </section>
  );
}
