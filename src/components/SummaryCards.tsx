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
    <section className="grid grid-cols-4 gap-3 mt-4 max-md:grid-cols-2 max-sm:grid-cols-1">
      <CardRoot variant="secondary">
        <CardContent className="p-3.5">
          <span className="block text-sm font-medium text-muted">使用时长</span>
          <strong className="block mt-2 text-2xl font-medium text-foreground font-mono leading-tight">{duration(summary.useDurationSeconds)}</strong>
        </CardContent>
      </CardRoot>
      <CardRoot variant="secondary">
        <CardContent className="p-3.5">
          <span className="block text-sm font-medium text-muted">AI / HI</span>
          <strong className="block mt-2 text-2xl font-medium text-foreground font-mono leading-tight">
            {summary.eventCounts.ai ?? 0} / {summary.eventCounts.hi ?? 0}
          </strong>
        </CardContent>
      </CardRoot>
      <CardRoot variant="secondary">
        <CardContent className="p-3.5">
          <span className="block text-sm font-medium text-muted">压力范围</span>
          <strong className="block mt-2 text-2xl font-medium text-foreground font-mono leading-tight">
            {summary.pressureRange ? `${summary.pressureRange.min} - ${summary.pressureRange.max}` : '-'}
          </strong>
        </CardContent>
      </CardRoot>
      <CardRoot variant="secondary">
        <CardContent className="p-3.5">
          <span className="block text-sm font-medium text-muted">缺失文件</span>
          <strong className="block mt-2 text-2xl font-medium text-foreground font-mono leading-tight">{summary.missingFiles.length}</strong>
        </CardContent>
      </CardRoot>
    </section>
  );
}
