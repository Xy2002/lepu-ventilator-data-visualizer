import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { CardDescription } from "@heroui/react";
import "./App.css";
import { AiAnalysisPanel } from "./components/AiAnalysisPanel";
import { DateNavigator } from "./components/DateNavigator";
import { ImportPanel } from "./components/ImportPanel";
import { RawFileBrowser } from "./components/RawFileBrowser";
import { SummaryTrendChart } from "./components/SummaryTrendChart";
import { SummaryCards } from "./components/SummaryCards";
import { DatasetStatusBar } from "./components/DatasetStatusBar";
import {
  buildDatasetIndex,
  type IndexProgress,
  loadDayDetail,
} from "./data/dataset";
import { downloadCsv, exportDaySummaryCsv } from "./data/csv";
import {
  invalidateImportedFiles,
  loadImportedFiles,
  saveImportedFiles,
} from "./data/importCache";
import {
  loadParsedDataset,
  saveParsedDataset,
  invalidateParsedDataset,
} from "./data/parsedCache";
import type {
  DatasetIndex,
  DayDetail,
  DaySummary,
  ImportedFileRef,
} from "./types";

const DayCharts = lazy(() =>
  import("./components/DayCharts").then((module) => ({
    default: module.DayCharts,
  }))
);

function usageWindow(summary: DaySummary) {
  if (summary.useSessions.length === 0) {
    return (
      <CardDescription>
        {summary.startTime ?? "-"} 至 {summary.endTime ?? "-"}
      </CardDescription>
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
  const [isCaching, setIsCaching] = useState(false);
  const [cacheNotice, setCacheNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [indexProgress, setIndexProgress] = useState<IndexProgress | null>(
    null
  );
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  // 串行化后台缓存写入,避免连续导入时两个 save 并发清空/交错写库;
  // runId 递增使被新导入取代的排队写入自动跳过
  const cacheWriteRef = useRef<Promise<void>>(Promise.resolve());
  const cacheRunRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function restoreImport() {
      setIsRestoringImport(true);

      try {
        // 两阶段解析：恢复时只加载文件句柄与摘要索引，波形 payload 按需解析。
        // 快照携带恢复所处的导入代际,重建的解析缓存绑定同代际,
        // 避免与其他标签页的新导入交错后用旧摘要配新内容
        const snapshot = await loadImportedFiles();
        if (cancelled || snapshot.files.length === 0) return;
        const cachedFiles = snapshot.files;

        let nextDataset = await loadParsedDataset(cachedFiles);
        if (!nextDataset) {
          nextDataset = await buildDatasetIndex(cachedFiles);
          if (cancelled) return;
          try {
            await saveParsedDataset(
              cachedFiles,
              nextDataset,
              snapshot.generation
            );
          } catch {
            /* best effort */
          }
        }
        if (cancelled) return;

        setDataset(nextDataset);
        setSelectedDate(nextDataset.days[nextDataset.days.length - 1] ?? null);
        setCacheNotice("已恢复上次导入的文件。");
      } catch {
        if (!cancelled)
          setCacheNotice(
            "无法恢复上次导入的文件，请重新选择 DATAFILE 文件夹。"
          );
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
    if (dataset && !selectedDate)
      setSelectedDate(dataset.days[dataset.days.length - 1] ?? null);
  }, [dataset, selectedDate]);

  useEffect(() => {
    if (!dataset || !selectedDate) {
      setDayDetail(null);
      return;
    }

    let cancelled = false;
    setIsLoadingDay(true);
    setError(null);
    loadDayDetail(dataset, selectedDate)
      .then((detail) => {
        if (!cancelled) setDayDetail(detail);
      })
      .catch(() => {
        if (!cancelled) setError("加载所选日期数据失败，请重新导入。");
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
      // 索引成功后才递增 runId 并作废旧缓存:导入失败(源不可读等)不得
      // 破坏既有缓存、也不得中止仍在前台运行的旧写入。
      // 此后任何时刻刷新都不会恢复出旧数据集,也避免"导入缓存已发布、
      // 解析缓存未更新"的窗口用旧摘要配新内容字节。
      // 作废失败(IDB 拒绝访问等)不阻断导入本身——此时旧缓存同样不可达
      const cacheRun = ++cacheRunRef.current;
      await Promise.all([
        invalidateImportedFiles(),
        invalidateParsedDataset(),
      ]).catch(() => {
        /* best effort */
      });
      // 数据集就绪立即展示;缓存写入(文件内容进 IndexedDB,可能上 GB)后台进行,
      // 不阻塞首屏交互。失败仅提示,不影响本次使用。
      setDataset(nextDataset);
      setSelectedDate(nextDataset.days[nextDataset.days.length - 1] ?? null);
      setIsCaching(true);
      cacheWriteRef.current = cacheWriteRef.current.then(async () => {
        try {
          // shouldAbort 让已被新导入取代的活跃写入中途让路:
          // 否则它会写完并重新发布旧数据集的 meta
          const generation = await saveImportedFiles(
            files,
            () => cacheRun !== cacheRunRef.current
          );
          if (cacheRun !== cacheRunRef.current) return;
          await saveParsedDataset(files, nextDataset, generation);
        } catch {
          // 被新导入取代的写入失败与当前数据集无关,不惊扰用户
          if (cacheRun === cacheRunRef.current) {
            setCacheNotice(
              "已导入，但浏览器无法缓存这些文件；刷新后需要重新选择。"
            );
          }
        } finally {
          // 仅最后一次导入的写入结束时收起提示;被取代的写入不算完成
          if (cacheRun === cacheRunRef.current) setIsCaching(false);
        }
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "导入失败");
    } finally {
      setIsIndexing(false);
      setIndexProgress(null);
    }
  }

  const summary =
    dataset && selectedDate ? dataset.summariesByDay[selectedDate] : null;

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <h1>呼吸机数据可视化</h1>
          <p>
            浏览器本地解析，原始数据不出浏览器；启用 AI
            分析时当日摘要将发送至所配服务商
          </p>
        </div>
        <ImportPanel onImport={handleImport} disabled={isIndexing} />
      </header>

      <div className="notice-stack">
        {error ? <Notice>{error}</Notice> : null}
        {cacheNotice ? <Notice>{cacheNotice}</Notice> : null}
        {isRestoringImport ? <Notice>正在恢复上次导入...</Notice> : null}
        {isCaching ? (
          <Notice>正在缓存文件...（缓存完成前请保持数据源连接）</Notice>
        ) : null}
        {isIndexing ? (
          <Notice>
            正在索引文件...
            {indexProgress
              ? ` (${indexProgress.completed}/${indexProgress.total})`
              : null}
          </Notice>
        ) : null}
      </div>

      {dataset && selectedDate && summary ? (
        <div className="workbench">
          <DateNavigator
            dataset={dataset}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
          <section className="main-panel">
            <SummaryTrendChart
              dataset={dataset}
              onSelectDate={setSelectedDate}
            />
            <DatasetStatusBar dataset={dataset} />
            <div className="selected-day-header">
              <h2>{selectedDate}</h2>
              {usageWindow(summary)}
              <button
                type="button"
                className="export-summary-btn"
                onClick={() =>
                  downloadCsv(
                    `summary-${selectedDate}.csv`,
                    exportDaySummaryCsv(summary)
                  )
                }
              >
                导出当日摘要
              </button>
            </div>
            <SummaryCards
              summary={
                dayDetail && dayDetail.summary.date === selectedDate
                  ? dayDetail.summary
                  : summary
              }
            />
            {isLoadingDay ? <Notice>正在解析当前日期...</Notice> : null}
            {dayDetail ? (
              <Suspense fallback={<Notice>正在加载专业图表...</Notice>}>
                <DayCharts detail={dayDetail} />
              </Suspense>
            ) : null}
            {dayDetail ? (
              <AiAnalysisPanel
                summary={
                  dayDetail && dayDetail.summary.date === selectedDate
                    ? dayDetail.summary
                    : summary
                }
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
