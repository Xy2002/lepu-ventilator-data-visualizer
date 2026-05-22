import { lazy, Suspense, useEffect, useState } from 'react';
import { CardDescription } from '@heroui/react';
import './App.css';
import { AiAnalysisPanel } from './components/AiAnalysisPanel';
import { DateNavigator } from './components/DateNavigator';
import { ImportPanel } from './components/ImportPanel';
import { RawFileBrowser } from './components/RawFileBrowser';
import { SummaryCards } from './components/SummaryCards';
import { buildDatasetIndex, type IndexProgress, loadDayDetail } from './data/dataset';
import { loadImportedFiles, saveImportedFiles } from './data/importCache';
import type { DatasetIndex, DayDetail, DaySummary, ImportedFileRef } from './types';

const DayCharts = lazy(() => import('./components/DayCharts').then((module) => ({ default: module.DayCharts })));

function usageWindow(summary: DaySummary) {
  if (summary.useSessions.length === 0) {
    return <CardDescription>{summary.startTime ?? '-'} 至 {summary.endTime ?? '-'}</CardDescription>;
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

function Notice({ children }: { children: React.ReactNode }) {
  return <div className="notice">{children}</div>;
}

export function App() {
  const [dataset, setDataset] = useState<DatasetIndex | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayDetail, setDayDetail] = useState<DayDetail | null>(null);
  const [isIndexing, setIsIndexing] = useState(false);
  const [isLoadingDay, setIsLoadingDay] = useState(false);
  const [isRestoringImport, setIsRestoringImport] = useState(false);
  const [cacheNotice, setCacheNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [indexProgress, setIndexProgress] = useState<IndexProgress | null>(null);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function restoreImport() {
      setIsRestoringImport(true);

      try {
        const cachedFiles = await loadImportedFiles();
        if (cancelled || cachedFiles.length === 0) return;

        const nextDataset = await buildDatasetIndex(cachedFiles);
        if (cancelled) return;

        setDataset(nextDataset);
        setSelectedDate(nextDataset.days[nextDataset.days.length - 1] ?? null);
        setCacheNotice('已恢复上次导入的文件。');
      } catch {
        if (!cancelled) setCacheNotice('无法恢复上次导入的文件，请重新选择 DATAFILE 文件夹。');
      } finally {
        if (!cancelled) setIsRestoringImport(false);
      }
    }

    restoreImport();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (dataset && !selectedDate) setSelectedDate(dataset.days[dataset.days.length - 1] ?? null);
  }, [dataset, selectedDate]);

  useEffect(() => {
    if (!dataset || !selectedDate) {
      setDayDetail(null);
      return;
    }

    let cancelled = false;
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
    setCacheNotice(null);
    setIndexProgress(null);

    try {
      const nextDataset = await buildDatasetIndex(files, setIndexProgress);
      try {
        await saveImportedFiles(files);
      } catch {
        setCacheNotice('已导入，但浏览器无法缓存这些文件；刷新后需要重新选择。');
      }
      setDataset(nextDataset);
      setSelectedDate(nextDataset.days[nextDataset.days.length - 1] ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '导入失败');
    } finally {
      setIsIndexing(false);
      setIndexProgress(null);
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
        <div className="header-actions">
          {dataset && summary ? (
            <button
              type="button"
              className={`ai-toggle-btn${aiPanelOpen ? ' ai-toggle-btn-active' : ''}`}
              onClick={() => setAiPanelOpen((o) => !o)}
            >
              AI 分析
            </button>
          ) : null}
          <ImportPanel onImport={handleImport} disabled={isIndexing} />
        </div>
      </header>

      <div className="notice-stack">
        {error ? <Notice>{error}</Notice> : null}
        {cacheNotice ? <Notice>{cacheNotice}</Notice> : null}
        {isRestoringImport ? <Notice>正在恢复上次导入...</Notice> : null}
        {isIndexing ? <Notice>正在索引文件...{indexProgress ? ` (${indexProgress.completed}/${indexProgress.total})` : null}</Notice> : null}
      </div>

      {dataset && selectedDate && summary ? (
        <div className="workbench">
          <DateNavigator dataset={dataset} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
          <section className="main-panel">
            <div className="selected-day-header">
              <h2>{selectedDate}</h2>
              {usageWindow(summary)}
            </div>
            <SummaryCards summary={summary} />
            {isLoadingDay ? <Notice>正在解析当前日期...</Notice> : null}
            {dayDetail ? (
              <Suspense fallback={<Notice>正在加载专业图表...</Notice>}>
                <DayCharts detail={dayDetail} />
              </Suspense>
            ) : null}
            {dayDetail ? (
              <AiAnalysisPanel
                summary={summary}
                selectedDate={selectedDate}
                open={aiPanelOpen}
                onToggle={() => setAiPanelOpen((o) => !o)}
              />
            ) : null}
            {dayDetail ? <RawFileBrowser files={dayDetail.rawFiles} /> : null}
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
