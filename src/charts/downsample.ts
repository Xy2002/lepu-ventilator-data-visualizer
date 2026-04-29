export interface ChartPoint {
  index: number;
  value: number;
}

export function downsampleMinMax(
  values: Uint8Array | Uint16Array | Int16Array,
  startIndex: number,
  endIndex: number,
  pixelWidth: number,
): ChartPoint[] {
  const start = Math.max(0, Math.floor(startIndex));
  const end = Math.min(values.length, Math.ceil(endIndex));
  const count = Math.max(0, end - start);

  if (count === 0 || pixelWidth <= 0) return [];

  if (count <= pixelWidth * 2) {
    return Array.from({ length: count }, (_, offset) => ({
      index: start + offset,
      value: values[start + offset],
    }));
  }

  const bucketSize = count / pixelWidth;
  const points: ChartPoint[] = [];

  for (let bucket = 0; bucket < pixelWidth; bucket += 1) {
    const bucketStart = Math.floor(start + bucket * bucketSize);
    const bucketEnd = Math.min(end, Math.floor(start + (bucket + 1) * bucketSize));
    let minIndex = bucketStart;
    let maxIndex = bucketStart;

    for (let index = bucketStart; index < bucketEnd; index += 1) {
      if (values[index] < values[minIndex]) minIndex = index;
      if (values[index] > values[maxIndex]) maxIndex = index;
    }

    const first = minIndex < maxIndex ? minIndex : maxIndex;
    const second = minIndex < maxIndex ? maxIndex : minIndex;

    points.push({ index: first, value: values[first] });
    if (second !== first) points.push({ index: second, value: values[second] });
  }

  return points.sort((a, b) => a.index - b.index);
}
