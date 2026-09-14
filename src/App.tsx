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
  groupImportedFilesByDay,
  migrateDayDetailCache,
  type IndexProgress,
  loadDayDetail,
} from "./data/dataset";
import { downloadCsv, exportDaySummaryCsv } from "./data/csv";
import {
  invalidateImportedFiles,
  loadImportedFiles,
  readImportEpoch,
  readImportGeneration,
  reclaimUnreferencedContents,
  releaseReaderGeneration,
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
  // 当前数据集身份的同步镜像:交接守卫需要在无 await 的临界区内比对,
  // 不能依赖 React 状态(函数式 updater 的执行时机不可控)
  const datasetRef = useRef<DatasetIndex | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function restoreImport() {
      setIsRestoringImport(true);
      // 捕获启动时的导入轮次(必须在首个 await 之前,否则会读到导入后的新值):
      // 本地导入完成后轮次递增,即使发布代际尚未切换也能识别"被本地导入取代"
      const restoreRun = cacheRunRef.current;
      // 恢复所钉住的代际(catch 中也要能条件释放,故提升到 try 外)
      let snapshotGeneration: string | null = null;

      try {
        // 两阶段解析：恢复时只加载文件句柄与摘要索引，波形 payload 按需解析。
        // 快照携带恢复所处的导入代际,重建的解析缓存绑定同代际,
        // 避免与其他标签页的新导入交错后用旧摘要配新内容
        const snapshot = await loadImportedFiles();
        // 先记录代际:loadImportedFiles 校验通过即已注册读者锁,
        // 之后任何早退路径(含 effect 取消/StrictMode 重跑)都要释放它
        snapshotGeneration = snapshot.generation;
        if (cancelled) {
          releaseReaderGeneration(snapshot.generation);
          return;
        }
        if (snapshot.files.length === 0) return;
        const cachedFiles = snapshot.files;

        let nextDataset = await loadParsedDataset(cachedFiles);
        const parsedFromCache = nextDataset !== null;
        if (!nextDataset) {
          nextDataset = await buildDatasetIndex(cachedFiles);
          if (cancelled) return;
        }
        if (cancelled) return;

        // 恢复期间的新导入(本地轮次变化,或发布代际/作废纪元已变)使恢复
        // 过时:放弃恢复并释放"快照代际"的读者锁。纪元核对补上
        // "已作废、替换拷贝进行中"的窗口——该窗口内发布代际刻意保持不变。
        // 条件释放:后台交接可能已把当前锁换成新导入的代际,不能误放。
        // 复查必须在写解析缓存之前:慢重建跑输新导入时,
        // 不得用旧代际的解析索引覆盖新代际的有效索引
        const currentGeneration = await readImportGeneration();
        const currentEpoch = await readImportEpoch();
        if (
          cancelled ||
          cacheRunRef.current !== restoreRun ||
          currentGeneration !== snapshot.generation ||
          currentEpoch !== snapshot.epoch
        ) {
          releaseReaderGeneration(snapshot.generation);
          return;
        }

        if (!parsedFromCache) {
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

        // 安装前再次复查:saveParsedDataset 期间的作废/发布同样使恢复过时
        const finalGeneration = await readImportGeneration();
        const finalEpoch = await readImportEpoch();
        if (
          cancelled ||
          cacheRunRef.current !== restoreRun ||
          finalGeneration !== snapshot.generation ||
          finalEpoch !== snapshot.epoch
        ) {
          releaseReaderGeneration(snapshot.generation);
          return;
        }

        setDataset(nextDataset);
        datasetRef.current = nextDataset;
        setSelectedDate(nextDataset.days[nextDataset.days.length - 1] ?? null);
        setCacheNotice("已恢复上次导入的文件。");
      } catch {
        // 仅当本恢复实际记录了代际(load 已返回并钉住)才释放:
        // load 拒绝时 snapshotGeneration 为 null,无条件释放会
        // 误放交接刚安装的新代际读者锁
        if (snapshotGeneration !== null)
          releaseReaderGeneration(snapshotGeneration);
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
      // 基线纪元绑定到作废事务返回值(而非事后再读一次):
      // 保存回调可能延迟很久才执行,再读一次会吸收排队期间
      // 其他标签页的作废,让被取代的旧数据集"最后发布"
      const baselineEpoch = await invalidateImportedFiles().catch(() => null);
      // 解析缓存的作废绑定同一纪元:已被更新的导入取代时跳过清空。
      // raw 作废失败(baselineEpoch 为 null)时同样跳过——
      // 旧缓存原封未动,它的解析索引也应保留给刷新后的快速恢复
      await invalidateParsedDataset(baselineEpoch).catch(() => {});
      // 数据集就绪立即展示;缓存写入(文件内容进 IndexedDB,可能上 GB)后台进行,
      // 不阻塞首屏交互。失败仅提示,不影响本次使用。
      setDataset(nextDataset);
      datasetRef.current = nextDataset;
      setSelectedDate(nextDataset.days[nextDataset.days.length - 1] ?? null);
      // 活载数据集已切换为源文件引用,本标签页不再使用旧代际的缓存内容:
      // 立即释放读者锁,替换拷贝期间不为其保留整份旧数据
      // (其他标签页的读者锁仍会保护它们自己引用的代际)
      releaseReaderGeneration();
      if (baselineEpoch === null) {
        // 本次作废失败(或 IndexedDB 不可用)→ 拿不到可绑定的基线纪元:
        // 无基线的写入会被其他标签页的作废利用,宁可不入队,直接报告未缓存。
        // 须收起缓存提示:前一次导入的 isCaching 可能仍为 true
        setCacheNotice(
          "已导入，但浏览器无法缓存这些文件；刷新后需要重新选择。"
        );
        setIsCaching(false);
        return;
      }
      setIsCaching(true);
      cacheWriteRef.current = cacheWriteRef.current.then(async () => {
        try {
          // shouldAbort 让已被新导入取代的活跃写入中途让路:
          // 否则它会写完并重新发布旧数据集的 meta
          const generation = await saveImportedFiles(
            files,
            () => cacheRun !== cacheRunRef.current,
            baselineEpoch
          );
          if (cacheRun !== cacheRunRef.current) return;
          if (generation === null) {
            // 本地轮次未变却被中止 = 另一标签页作废了缓存(纪元推进):
            // 展示中的数据集未缓存、刷新不可恢复,必须告知用户
            setCacheNotice(
              "已导入，但浏览器无法缓存这些文件；刷新后需要重新选择。"
            );
            return;
          }

          // 纪元已变(其他标签页又作废/发布)时不写解析缓存:
          // 否则被暂停后恢复的旧导入会用旧索引覆盖新代际的有效索引。
          // 纪元读取失败时无法核实→跳过解析保存,但交接继续
          // (raw 缓存已 durable,读取失败不该否定它)
          let currentEpoch: number | null = null;
          try {
            currentEpoch = await readImportEpoch();
          } catch {
            /* best effort */
          }
          if (currentEpoch !== null && currentEpoch === baselineEpoch) {
            try {
              await saveParsedDataset(files, nextDataset, generation);
            } catch {
              // 文件内容已 durable:解析缓存缺失只影响下次恢复速度,
              // 刷新后自动重建索引,不需要重新导入。
              // 被新导入取代的写入不再提示(当前导入的写入负责 UX)
              if (cacheRun === cacheRunRef.current) {
                setCacheNotice(
                  "文件内容已缓存，但解析索引缓存保存失败；刷新后将自动重建。"
                );
              }
            }
          }

          // 本标签页切换为缓存引用:数据源(如 SD 卡)拔除后,
          // 未访问过的日期仍可从缓存读取。
          // loadImportedFiles 已在校验通过后注册快照代际的读者锁;
          // 仅当展示中的数据集仍是本次导入产出且轮次未变时才交接,
          // 否则释放刚注册的锁,不为过时代际留下读者
          try {
            const snapshot = await loadImportedFiles();
            if (
              snapshot.files.length > 0 &&
              snapshot.generation === generation &&
              cacheRun === cacheRunRef.current &&
              datasetRef.current === nextDataset
            ) {
              const replaced = {
                ...nextDataset,
                filesByDay: groupImportedFilesByDay(snapshot.files),
              };
              // 新身份会丢掉按日 WeakMap 缓存,迁移以保留已解析的天
              migrateDayDetailCache(nextDataset, replaced);
              datasetRef.current = replaced;
              setDataset(replaced);
              // 回收是独立的尽力而为操作:失败不得触发"未切换"警告
              // (此时引用与读者锁已安装,惰性读取已在用缓存)
              await reclaimUnreferencedContents().catch(() => {});
            } else {
              releaseReaderGeneration(snapshot.generation);
              // 本地更新的导入接管 UX 时保持静默;跨标签页变化导致的
              // 交接失败则必须告知——展示中的数据集仍是源文件引用,
              // 拔除数据源后未访问的日期不可用
              if (cacheRun === cacheRunRef.current) {
                // 不覆盖已存在的提示(如解析缓存保存失败)
                setCacheNotice(
                  (prev) =>
                    prev ??
                    "文件已缓存，但本页未能切换到缓存引用；请保持数据源连接，刷新后可从缓存恢复。"
                );
              }
            }
          } catch {
            // 交接异常(加载/协调锁失败)时展示中的数据集仍是源文件引用:
            // 保留警告,避免用户以为缓存完成而拔除数据源
            if (cacheRun === cacheRunRef.current) {
              setCacheNotice(
                (prev) =>
                  prev ??
                  "文件已缓存，但本页未能切换到缓存引用；请保持数据源连接，刷新后可从缓存恢复。"
              );
            }
          }
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
