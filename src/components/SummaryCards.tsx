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
      <article>
        <span>使用时长</span>
        <strong>{duration(summary.useDurationSeconds)}</strong>
      </article>
      <article>
        <span>AI / HI</span>
        <strong>
          {summary.eventCounts.ai ?? 0} / {summary.eventCounts.hi ?? 0}
        </strong>
      </article>
      <article>
        <span>压力范围</span>
        <strong>
          {summary.pressureRange ? `${summary.pressureRange.min} - ${summary.pressureRange.max}` : '-'}
        </strong>
      </article>
      <article>
        <span>缺失文件</span>
        <strong>{summary.missingFiles.length}</strong>
      </article>
    </section>
  );
}
