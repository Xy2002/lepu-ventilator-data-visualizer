import { lazy, Suspense, useEffect, useState } from 'react';
import './App.css';
import { DateNavigator } from './components/DateNavigator';
import { EventTable } from './components/EventTable';
import { ImportPanel } from './components/ImportPanel';
import { RawFileBrowser } from './components/RawFileBrowser';
import { SummaryCards } from './components/SummaryCards';
import { buildDatasetIndex, loadDayDetail } from './data/dataset';
import type { DatasetIndex, DayDetail, DaySummary, ImportedFileRef } from './types';

const DayCharts = lazy(() => import('./components/DayCharts').then((module) => ({ default: module.DayCharts })));

interface FocusedEvent {
  secondsFromDayStart: number;
  timestamp: string | null;
}

function usageWindow(summary: DaySummary) {
  if (summary.useSessions.length === 0) {
    return (
      <p>
        {summary.startTime ?? '-'} 至 {summary.endTime ?? '-'}
      </p>
    );
  }

  return (
    <div className="session-summary" aria-label="使用会话">
      <p>{summary.useSessions.length} 个使用会话</p>
      <ul>
        {summary.useSessions.map((session) => (
          <li key={`${session.startTime}-${session.endTime}`}>
            {session.startTime} 至 {session.endTime}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function App() {
  const [dataset, setDataset] = useState<DatasetIndex | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayDetail, setDayDetail] = useState<DayDetail | null>(null);
  const [focusedEvent, setFocusedEvent] = useState<FocusedEvent | null>(null);
  const [isIndexing, setIsIndexing] = useState(false);
  const [isLoadingDay, setIsLoadingDay] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (dataset && !selectedDate) setSelectedDate(dataset.days[dataset.days.length - 1] ?? null);
  }, [dataset, selectedDate]);

  useEffect(() => {
    if (!dataset || !selectedDate) {
      setDayDetail(null);
      return;
    }

    let cancelled = false;
    setFocusedEvent(null);
    setIsLoadingDay(true);
    loadDayDetail(dataset, selectedDate)
      .then((detail) => {
        if (!cancelled) setDayDetail(detail);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDay(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dataset, selectedDate]);

  async function handleImport(files: ImportedFileRef[]) {
    setIsIndexing(true);
    setError(null);

    try {
      const nextDataset = await buildDatasetIndex(files);
      setDataset(nextDataset);
      setSelectedDate(nextDataset.days[nextDataset.days.length - 1] ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '导入失败');
    } finally {
      setIsIndexing(false);
    }
  }

  const summary = dataset && selectedDate ? dataset.summariesByDay[selectedDate] : null;

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <h1>呼吸机数据可视化</h1>
          <p>浏览器本地解析，不上传原始数据</p>
        </div>
        <ImportPanel onImport={handleImport} disabled={isIndexing} />
      </header>

      {error ? <div className="notice error">{error}</div> : null}
      {isIndexing ? <div className="notice">正在索引文件...</div> : null}

      {dataset && selectedDate && summary ? (
        <div className="workbench">
          <DateNavigator dataset={dataset} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
          <section className="main-panel">
            <div className="selected-day-header">
              <h2>{selectedDate}</h2>
              {usageWindow(summary)}
            </div>
            <SummaryCards summary={summary} />
            {isLoadingDay ? <div className="notice">正在解析当前日期...</div> : null}
            {dayDetail ? (
              <Suspense fallback={<div className="notice">正在加载专业图表...</div>}>
                <DayCharts
                  detail={dayDetail}
                  focusedEventSecond={focusedEvent?.secondsFromDayStart ?? null}
                  focusedEventTimestamp={focusedEvent?.timestamp ?? null}
                />
              </Suspense>
            ) : null}
            {focusedEvent ? (
              <div className="notice">
                已定位事件：{focusedEvent.timestamp ?? `${focusedEvent.secondsFromDayStart.toFixed(2)} 秒`}
              </div>
            ) : null}
            {dayDetail ? (
              <div className="detail-grid">
                <EventTable
                  events={dayDetail.events}
                  onSelectEvent={(secondsFromDayStart, timestamp) =>
                    setFocusedEvent({ secondsFromDayStart, timestamp })
                  }
                />
                <RawFileBrowser files={dayDetail.rawFiles} />
              </div>
            ) : null}
          </section>
        </div>
      ) : (
        <section className="empty-state">
          <h2>导入 DATAFILE 开始查看</h2>
          <p>支持选择日期目录中的 EDF-like 文件，并按日期生成摘要和图表。</p>
        </section>
      )}
    </main>
  );
}
