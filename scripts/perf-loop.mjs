// 性能回归回路:量化「导入 DATAFILE」与「刷新后恢复数据集」的端到端耗时。
// 驱动真实 UI(Playwright + Chromium)对真实 DATAFILE 目录计时,超预算即退出码 1(red)。
//
// 用法:
//   node scripts/perf-loop.mjs                # 完整运行:导入 + 等缓存写完 + 3 次刷新恢复 + 子步骤探针
//   node scripts/perf-loop.mjs --skip-import  # 复用已播种的 profile,只测恢复路径(紧回路)
//   node scripts/perf-loop.mjs --limit-days 3 # 冒烟:复制前 3 个日期目录到临时目录再导入
//
// 预算:导入 ≤ 60s,恢复 ≤ 5s。Chrome profile 建在系统临时目录
// (WORK_DIR,刻意保留以便 --skip-import 复用;含约 1.4GB 播种数据,可手动删除)。
// 注意:profile 绝不能放进仓库目录——Vite watcher 会把 IndexedDB 写入当成源码变更
// 触发页面自动重载,计时全部失真。
import { createServer } from "vite";
import { chromium } from "playwright";
import { readdirSync, rmSync, mkdirSync, cpSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const DATA_DIR = path.join(repoRoot, "DATA", "DATAFILE");
// Chrome profile 与冒烟数据必须放在仓库外:Vite 的 watcher 会把
// IndexedDB/leveldb 的海量写入当成源码变更,触发页面反复自动重载,
// 彻底污染计时(v1 曾因此把恢复路径测出 281s 的假数据)
const WORK_DIR = path.join(tmpdir(), "lepu-perf-loop");
const PROFILE_DIR = path.join(WORK_DIR, "perf-profile");
const PORT = 5199;
const URL_BASE = `http://127.0.0.1:${PORT}/`;

const IMPORT_BUDGET_MS = 60_000;
const RESTORE_BUDGET_MS = 5_000;

const args = new Set(process.argv.slice(2));
const skipImport = args.has("--skip-import");
const limitDaysIdx = process.argv.indexOf("--limit-days");
const limitDays =
  limitDaysIdx >= 0 ? Number(process.argv[limitDaysIdx + 1]) : null;

// webkitdirectory 输入只接受目录路径:完整模式传真实 DATAFILE;
// 冒烟模式复制前 N 个日期目录到临时 DATAFILE,目录结构与真实导入一致
function prepareDataDir() {
  if (!limitDays) return DATA_DIR;
  const smokeDir = path.join(WORK_DIR, "smoke-data", "DATAFILE");
  rmSync(path.dirname(smokeDir), { recursive: true, force: true });
  mkdirSync(smokeDir, { recursive: true });
  const dayDirs = readdirSync(DATA_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .slice(0, limitDays);
  for (const day of dayDirs) {
    cpSync(path.join(DATA_DIR, day), path.join(smokeDir, day), {
      recursive: true,
    });
  }
  return smokeDir;
}

async function main() {
  // 恢复-only 模式不需要源目录:源盘移除/卸载后仍可对已播种的 profile 计时
  const dataDir = skipImport ? null : prepareDataDir();
  const dayDirs = dataDir
    ? readdirSync(dataDir, { withFileTypes: true }).filter((d) =>
        d.isDirectory()
      )
    : [];
  const files = dataDir
    ? dayDirs.flatMap((d) =>
        readdirSync(path.join(dataDir, d.name))
          .filter((name) => name.endsWith(".edf"))
          .map((name) => path.join(dataDir, d.name, name))
      )
    : [];
  console.log(
    `[perf] files=${files.length} dayDirs=${dayDirs.length} limitDays=${limitDays} skipImport=${skipImport}`
  );

  const server = await createServer({
    root: repoRoot,
    server: { port: PORT, host: "127.0.0.1", strictPort: true },
    logLevel: "error",
  });
  await server.listen();

  if (!skipImport) {
    // profile 必须删干净:残留的 leveldb 会让新运行读到上一轮的幽灵数据。
    // 删除失败通常说明上一轮的 Chromium 还没退干净
    rmSync(PROFILE_DIR, { recursive: true, force: true });
    if (existsSync(PROFILE_DIR)) {
      console.error(
        `[perf] 无法删除 profile 目录(上一轮 Chromium 未退出?): ${PROFILE_DIR}`
      );
      process.exit(2);
    }
  }
  mkdirSync(PROFILE_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") pageErrors.push(msg.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      pageErrors.push(`HTTP ${response.status()} ${response.url()}`);
    }
  });
  await page.addInitScript(() => {
    window.__longTasks = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__longTasks.push({
          start: Math.round(entry.startTime),
          duration: Math.round(entry.duration),
        });
      }
    }).observe({ entryTypes: ["longtask"] });
  });

  const report = { files: files.length, pageErrors };

  if (!skipImport) {
    const t0 = Date.now();
    await page.goto(URL_BASE);
    await page.setInputFiles("input[webkitdirectory]", dataDir);
    await page.waitForSelector(".selected-day-header h2", { timeout: 600_000 });
    report.importMs = Date.now() - t0;
    console.log(`[perf] importMs=${report.importMs}`);

    // 等待应用自身的"正在缓存文件"提示消失:
    // 该提示在导入缓存、解析缓存与引用交接全部完成后才收起,
    // 仅等 raw meta 数量会让刷新打断解析缓存/交接,测到半完成状态
    const t1 = Date.now();
    await page.waitForFunction(
      () =>
        ![...window.document.querySelectorAll(".notice-stack .notice")].some(
          (el) => el.textContent?.includes("正在缓存文件")
        ),
      undefined,
      { timeout: 300_000, polling: 500 }
    );
    report.cacheWriteSettleMs = Date.now() - t1;
    console.log(`[perf] cacheWriteSettleMs=${report.cacheWriteSettleMs}`);
  } else {
    // 冷启动恢复:全新标签页首次打开(最贴近用户"刚打开网页"的等待)
    const t0 = Date.now();
    await page.goto(URL_BASE);
    await page.waitForSelector(".selected-day-header h2", { timeout: 300_000 });
    report.coldRestoreMs = Date.now() - t0;
    console.log(`[perf] coldRestoreMs=${report.coldRestoreMs}`);
  }

  // 恢复路径:刷新后从 IndexedDB 恢复数据集
  report.restoreRuns = [];
  for (let i = 0; i < 3; i += 1) {
    const t0 = Date.now();
    try {
      await page.reload();
      const bootMs = await page
        .waitForSelector(".notice-stack .notice", { timeout: 60_000 })
        .then(() => Date.now() - t0)
        .catch(() => null);
      await page.waitForSelector(".selected-day-header h2", {
        timeout: 120_000,
      });
      const restoreMs = Date.now() - t0;
      report.restoreRuns.push({ restoreMs, bootMs });
      console.log(
        `[perf] restore#${i + 1} restoreMs=${restoreMs} bootMs=${bootMs}`
      );
    } catch {
      const notices = await page
        .locator(".notice-stack")
        .innerText()
        .catch(() => "(no notice element)");
      const hasWorkbench = await page
        .locator(".selected-day-header")
        .count()
        .catch(() => -1);
      report.restoreRuns.push({
        failed: true,
        afterMs: Date.now() - t0,
        notices,
        hasWorkbench,
      });
      console.log(
        `[perf] restore#${i + 1} FAILED after ${Date.now() - t0}ms notices=${JSON.stringify(notices)} hasWorkbench=${hasWorkbench}`
      );
      break;
    }
  }

  // 子步骤探针:归因各阶段耗时(重复执行恢复路径中的每一步)
  report.probes = await page.evaluate(async () => {
    const { loadImportedFiles } = await import("/src/data/importCache.ts");
    const { loadParsedDataset, saveParsedDataset } =
      await import("/src/data/parsedCache.ts");
    const { buildDatasetIndex } = await import("/src/data/dataset.ts");

    async function timed(fn) {
      const t0 = performance.now();
      const result = await fn();
      return { ms: Math.round(performance.now() - t0), result };
    }

    const load = await timed(() => loadImportedFiles());
    const heapAfterLoadMB = Math.round(performance.memory.usedJSHeapSize / 1e6);
    const files = load.result.files;
    const parsedLoad = await timed(() => loadParsedDataset(files));
    const build = await timed(() => buildDatasetIndex(files));
    const parsedSave = await timed(() =>
      saveParsedDataset(files, build.result, load.result.generation)
    );

    const longTasks = window.__longTasks;
    const totalBlocking = longTasks.reduce(
      (sum, t) => sum + Math.max(0, t.duration - 50),
      0
    );
    const topTasks = [...longTasks]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 5);
    const storage = await navigator.storage?.estimate?.();

    return {
      loadImportedFilesMs: load.ms,
      heapAfterLoadMB,
      fileCount: files.length,
      loadParsedDatasetMs: parsedLoad.ms,
      parsedCacheHit: Boolean(parsedLoad.result),
      buildDatasetIndexMs: build.ms,
      days: build.result.days.length,
      saveParsedDatasetMs: parsedSave.ms,
      longTaskCount: longTasks.length,
      totalBlockingMs: Math.round(totalBlocking),
      topTasks,
      idbUsageMB:
        storage && storage.usage ? Math.round(storage.usage / 1e6) : null,
    };
  });
  console.log("[perf] probes=", JSON.stringify(report.probes, null, 2));

  // 预算约束每一次恢复测量(含冷启动):末轮快不代表没有间歇性/冷启动回归。
  // 捕获到的页面错误(懒加载/图表/请求失败)同样判红——计时选择器命中
  // 不代表页面没有坏,过滤已知噪音(favicon、HMR websocket)
  const relevantErrors = pageErrors.filter(
    (message) =>
      !/favicon/i.test(message) &&
      !/websocket|hmr/i.test(message) &&
      !/Failed to load resource.*net::ERR_ABORTED/i.test(message)
  );
  const restoreTimes = report.restoreRuns
    .map((run) => run.restoreMs)
    .filter((ms) => typeof ms === "number");
  if (typeof report.coldRestoreMs === "number") {
    restoreTimes.push(report.coldRestoreMs);
  }
  const anyRestoreFailed = report.restoreRuns.some((run) => run.failed);
  report.red =
    (!skipImport && report.importMs > IMPORT_BUDGET_MS) ||
    anyRestoreFailed ||
    restoreTimes.length === 0 ||
    restoreTimes.some((ms) => ms > RESTORE_BUDGET_MS) ||
    relevantErrors.length > 0;
  if (relevantErrors.length > 0) {
    console.log(`[perf] relevant page errors:`, relevantErrors.slice(0, 5));
  }
  console.log(
    `[perf] RED=${report.red} (budgets: import<=${IMPORT_BUDGET_MS}ms restore<=${RESTORE_BUDGET_MS}ms)`
  );
  if (pageErrors.length)
    console.log("[perf] pageErrors=", pageErrors.slice(0, 5));

  await context.close();
  await server.close();
  process.exit(report.red ? 1 : 0);
}

main().catch((err) => {
  console.error("[perf] loop failed:", err);
  process.exit(2);
});
