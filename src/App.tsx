import { lazy, Suspense, useEffect, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  CardDescription,

  ChipLabel,
  ChipRoot,
  EmptyState,
  Header,
  Spinner,
  SurfaceRoot,
} from '@heroui/react';
import './App.css';
import { DateNavigator } from './components/DateNavigator';
import { ImportPanel } from './components/ImportPanel';
import { RawFileBrowser } from './components/RawFileBrowser';
import { SummaryCards } from './components/SummaryCards';
import { buildDatasetIndex, loadDayDetail } from './data/dataset';
import { loadImportedFiles, saveImportedFiles } from './data/importCache';
import type { DatasetIndex, DayDetail, DaySummary, ImportedFileRef } from './types';

const DayCharts = lazy(() => import('./components/DayCharts').then((module) => ({ default: module.DayCharts })));

function usageWindow(summary: DaySummary) {
  if (summary.useSessions.length === 0) {
    return <CardDescription>{summary.startTime ?? '-'} 至 {summary.endTime ?? '-'}</CardDescription>;
  }

  return (
    <div className="text-right text-xs text-muted font-mono leading-relaxed" aria-label="使用会话">
      <p className="text-foreground font-medium">{summary.useSessions.length} 个使用会话</p>
      <ul className="space-y-0.5 mt-1">
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
  const [isIndexing, setIsIndexing] = useState(false);
  const [isLoadingDay, setIsLoadingDay] = useState(false);
  const [isRestoringImport, setIsRestoringImport] = useState(false);
  const [cacheNotice, setCacheNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

    try {
      const nextDataset = await buildDatasetIndex(files);
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
    }
  }

  const summary = dataset && selectedDate ? dataset.summariesByDay[selectedDate] : null;

  return (
    <main className="min-h-screen bg-background">
      <Header className="sticky top-0 z-10 flex items-center justify-between gap-8 min-h-[72px] px-8 py-2.5 bg-surface/88 backdrop-blur-xl border-b border-border">
        <div className="grid gap-0.5">
          <h1 className="m-0 text-foreground text-lg font-semibold leading-tight">呼吸机数据可视化</h1>
          <p className="m-0 text-muted text-sm leading-relaxed">浏览器本地解析，不上传原始数据</p>
        </div>
        <ImportPanel onImport={handleImport} disabled={isIndexing} />
      </Header>

      <div className="fixed top-[72px] left-0 right-0 z-20 flex flex-col items-center gap-2 p-2 px-4 pointer-events-none">
        {error ? (
          <Alert status="danger" className="pointer-events-auto">
            <AlertContent>
              <AlertTitle>错误</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}
        {cacheNotice ? (
          <Alert status="accent" className="pointer-events-auto">
            <AlertContent>
              <AlertDescription>{cacheNotice}</AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}
        {isRestoringImport ? (
          <Alert status="accent" className="pointer-events-auto">
            <AlertContent className="flex items-center gap-2">
              <Spinner size="sm" />
              <AlertDescription>正在恢复上次导入...</AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}
        {isIndexing ? (
          <Alert status="accent" className="pointer-events-auto">
            <AlertContent className="flex items-center gap-2">
              <Spinner size="sm" />
              <AlertDescription>正在索引文件...</AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}
      </div>

      {dataset && selectedDate && summary ? (
        <div className="grid grid-cols-[304px_minmax(0,1fr)] gap-4 w-full max-w-[1440px] mx-auto px-8 py-8 pb-10 max-lg:grid-cols-1 max-md:w-[calc(100%-32px)] max-md:px-0">
          <DateNavigator dataset={dataset} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
          <SurfaceRoot variant="secondary" className="min-w-0 p-5">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-border">
              <h2 className="m-0 text-2xl font-semibold text-foreground leading-tight">{selectedDate}</h2>
              {usageWindow(summary)}
            </div>
            <SummaryCards summary={summary} />
            {isLoadingDay ? (
              <div className="flex items-center gap-2 mt-4 p-3 rounded-lg bg-surface-secondary text-muted text-sm">
                <Spinner size="sm" />
                <span>正在解析当前日期...</span>
              </div>
            ) : null}
            {dayDetail ? (
              <Suspense
                fallback={
                  <div className="flex items-center gap-2 mt-4 p-3 rounded-lg bg-surface-secondary text-muted text-sm">
                    <Spinner size="sm" />
                    <span>正在加载专业图表...</span>
                  </div>
                }
              >
                <DayCharts detail={dayDetail} />
              </Suspense>
            ) : null}
            {dayDetail ? <RawFileBrowser files={dayDetail.rawFiles} /> : null}
          </SurfaceRoot>
        </div>
      ) : (
        <EmptyState className="w-full max-w-[880px] min-h-[calc(100vh-72px)] mx-auto px-8 py-24">
          <ChipRoot variant="soft" size="sm" className="mb-3 w-fit">
            <ChipLabel>LOCAL EDF WORKBENCH</ChipLabel>
          </ChipRoot>
          <h2 className="m-0 text-foreground font-semibold leading-none text-5xl max-sm:text-4xl">导入 DATAFILE 开始查看</h2>
          <p className="mt-5 text-muted text-lg leading-relaxed max-w-[620px]">
            支持选择日期目录中的 EDF-like 文件，并按日期生成摘要和图表。
          </p>
        </EmptyState>
      )}
    </main>
  );
}
