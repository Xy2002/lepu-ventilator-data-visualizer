import { CardRoot, CardContent } from '@heroui/react';
import type { DaySummary } from '../types';

interface SummaryCardsProps {
  summary: DaySummary;
}

function duration(seconds: number | null) {
  if (seconds === null) return '-';

  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const restSeconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, '0')}m`;

  return `${minutes}:${restSeconds.toString().padStart(2, '0')}`;
}

export function SummaryCards({ summary }: SummaryCardsProps) {
  return (
    <section className="summary-grid">
      <CardRoot>
        <CardContent>
          <span className="summary-label">使用时长</span>
          <strong className="summary-value">{duration(summary.useDurationSeconds)}</strong>
        </CardContent>
      </CardRoot>
      <CardRoot>
        <CardContent>
          <span className="summary-label">AI / HI</span>
          <strong className="summary-value">
            {summary.eventCounts.ai ?? 0} / {summary.eventCounts.hi ?? 0}
          </strong>
        </CardContent>
      </CardRoot>
      <CardRoot>
        <CardContent>
          <span className="summary-label">压力范围</span>
          <strong className="summary-value">
            {summary.pressureRange ? `${summary.pressureRange.min} - ${summary.pressureRange.max}` : '-'}
          </strong>
        </CardContent>
      </CardRoot>
      <CardRoot>
        <CardContent>
          <span className="summary-label">缺失文件</span>
          <strong className="summary-value">{summary.missingFiles.length}</strong>
        </CardContent>
      </CardRoot>
    </section>
  );
}
