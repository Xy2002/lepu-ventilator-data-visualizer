/**
 * Midscene + Playwright e2e(不依赖测试框架,直接 node 运行)。
 *
 * 覆盖两类检查:
 * 1. 功能链路(Midscene aiBoolean 断言 + 确定性交互):
 *    空状态 → 导入样例 EDF → 工作台渲染 → 日期切换 → 导出 CSV
 *    → 图形/图例颜色审计 → 页底波形/原始文件验证 → AI 分析面板开合
 * 2. 图形与图示一致性审计(确定性,直接读 ECharts option):
 *    - 每个 series 的"线/柱实际颜色" vs "图例标记颜色"
 *      (ECharts 折线系列图例取 itemStyle/调色板,不取 lineStyle,
 *       只设 lineStyle 时两者会不一致——这正是要抓的 bug)
 *    - 事件标记的 HTML 图例颜色 vs 波形图 markLine 实际颜色
 * 3. 兜底:pageerror / console error / 失败请求,全部计入退出码
 *
 * 样例数据:仓库不含 DATA/(已被 gitignore)。默认从 DATA/DATAFILE 读取
 * 20240724、20240725 两天的 .edf,可用环境变量改指其他数据集:
 *   E2E_FIXTURE_DIR=样例根目录  E2E_FIXTURE_DAYS=20240724,20240725
 * 缺数据时脚本在启动浏览器前报错退出,不会跑出误导性的结果。
 *
 * 交互经验(针对会重规划打转的模型):
 *   - 视觉验证用 aiBoolean 断言,不用 aiAct——"verify ..."的 aiAct 只是
 *     动作规划,规划完成不等于条件为真;
 *   - 文件注入直接用 Playwright setInputFiles(实测让 AI 注册文件或
 *     fileChooserAccept 预注册都时灵时不灵);
 *   - 本页是整页滚动,滚动一律程序化;日期切换后等"正在解析当前日期"
 *     提示消失再继续,避免在旧日期数据上跑后续检查。
 *
 * 用法:先起 dev server(npm run dev),再 npm run e2e。
 * 需要在 .env 配置 MIDSCENE_MODEL_*(见 .env 内注释)。
 */
import "dotenv/config";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { PlaywrightAgent } from "@midscene/web/playwright";

const APP_URL = process.env.E2E_APP_URL ?? "http://127.0.0.1:5173/";

// 样例数据:两个日期,保证数据集里有可切换的多个日期
const FIXTURE_ROOT = process.env.E2E_FIXTURE_DIR ?? "DATA/DATAFILE";
const FIXTURE_DAYS = (process.env.E2E_FIXTURE_DAYS ?? "20240724,20240725")
  .split(",")
  .map((day) => day.trim())
  .filter(Boolean);

// 启动浏览器前的样例预检:fresh checkout 没有 DATA/,直接给出可行动的报错
function resolveFixtureFiles() {
  const problems = [];
  const files = [];
  for (const day of FIXTURE_DAYS) {
    const dir = resolve(FIXTURE_ROOT, day);
    if (!existsSync(dir)) {
      problems.push(`缺少目录 ${dir}`);
      continue;
    }
    const edfs = readdirSync(dir).filter((f) => f.endsWith(".edf"));
    if (edfs.length === 0) {
      problems.push(`${dir} 中没有 .edf 文件`);
      continue;
    }
    files.push(...edfs.map((f) => resolve(dir, f)));
  }
  if (problems.length > 0 || files.length < 4) {
    console.error(
      [
        "找不到可用的样例 EDF 数据,无法运行 e2e:",
        ...problems.map((p) => `  - ${p}`),
        "",
        "样例数据(EDF)不随仓库分发。请把包含完整天数的 DATAFILE 目录放到",
        `./DATA/ 下(默认查找 ${FIXTURE_DAYS.join("、")}),或用环境变量指向其他数据集:`,
        "  E2E_FIXTURE_DIR=/path/to/DATAFILE  E2E_FIXTURE_DAYS=20240724,20240725",
        "至少需要两个日期、每天若干 .edf,才能覆盖日期切换。",
      ].join("\n")
    );
    process.exit(2);
  }
  return files;
}
const FIXTURE_ABS_FILES = resolveFixtureFiles();

const failures = [];
const warnings = [];
function record(name, ok, detail = "") {
  const mark = ok ? "✓" : "✗";
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push({ name, detail });
}
function warn(name, detail = "") {
  console.log(`⚠ ${name}${detail ? ` — ${detail}` : ""}`);
  warnings.push({ name, detail });
}

// 视觉断言统一走 aiBoolean(布尔断言),失败/异常都计入硬性失败;
// 不用 aiAct——"verify ..."的 aiAct 只是动作规划,规划完成不等于条件为真
async function aiCheck(agent, name, prompt) {
  try {
    const ok = await agent.aiBoolean(prompt);
    record(name, ok === true);
    return ok === true;
  } catch (err) {
    record(name, false, String(err?.message ?? err).split("\n")[0]);
    return false;
  }
}

const browser = await chromium.launch({
  headless: process.env.E2E_HEADED === "1" ? false : true,
  args: ["--no-sandbox", "--ignore-certificate-errors"],
});
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
});

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
page.on("console", (msg) => {
  if (msg.type() === "error" && !msg.text().includes("favicon")) {
    consoleErrors.push(msg.text());
  }
});
page.on("pageerror", (err) => pageErrors.push(String(err)));
page.on("requestfailed", (req) => {
  if (!req.url().includes("favicon")) {
    failedRequests.push(`${req.url()} :: ${req.failure()?.errorText}`);
  }
});

let agent = null;
try {
  console.log(`\n打开 ${APP_URL}`);
  await page.goto(APP_URL, { waitUntil: "networkidle" });

  // agent 在页面加载完成后创建:构造时会向页面注入辅助样式,
  // 提前创建会撞上导航导致 "Execution context was destroyed"
  agent = new PlaywrightAgent(page, {
    groupName: "呼吸机数据可视化 e2e",
    reportFileName: "E2E-ventilator-app",
    aiContexts: {
      aiAct:
        "You are a Web UI testing expert testing a Chinese ventilator data visualization single-page app.",
    },
  });

  // ── 1. 空状态(AI 布尔断言) ─────────────────────────────
  await aiCheck(
    agent,
    "空状态:标题与导入引导可见",
    'Does the page show the title "呼吸机数据可视化" in the top bar, and an empty state section with the heading "导入 DATAFILE 开始查看"?'
  );

  // ── 2. 导入 EDF:纯 Playwright 机械注入。
  //       实测两种 AI 驱动方式(模型注册文件、fileChooserAccept 预注册)
  //       都不稳定:按钮点了、选择器拦截不生效,页面无变化导致重规划
  //       打转;文件注入无判断价值,交给确定性 API,AI 留给视觉验证 ──
  try {
    await page
      .locator('input[aria-label="选择 EDF 文件"]')
      .setInputFiles(FIXTURE_ABS_FILES);
    await page.locator(".workbench").waitFor({ timeout: 60_000 });
    await page
      .getByText("正在索引文件")
      .waitFor({ state: "hidden", timeout: 60_000 })
      .catch(() => {});
    record(
      `导入 ${FIXTURE_ABS_FILES.length} 个 EDF 并完成索引`,
      true,
      FIXTURE_DAYS.join("、")
    );
  } catch (err) {
    record(
      `导入 ${FIXTURE_ABS_FILES.length} 个 EDF 并完成索引`,
      false,
      String(err).split("\n")[0]
    );
  }

  // ── 3~8. 依赖数据集的步骤 ──────────────────────────────
  const workbenchVisible = await page
    .locator(".workbench")
    .isVisible()
    .catch(() => false);

  if (workbenchVisible) {
    // 工作台内容(AI 布尔断言)
    await aiCheck(
      agent,
      "工作台:导航/趋势图/摘要卡渲染",
      'Does the page show a "日期导航" sidebar, a trend chart, summary cards with labels like "使用时长" and "AI / HI", and a selected date heading?'
    );

    // 日期切换(确定性点击热力图首格 + 断言)。
    // 热力图只有两三个格子时 AI 点击容易落在当前日期上,
    // 而这里要验证的是应用的日期切换行为本身
    const heading = page.locator(".selected-day-header h2");
    const before = ((await heading.textContent()) ?? "").trim();
    // 期望日期从被点击的格子取(热力图首格即最早日期),不依赖
    // 环境变量里日期的书写顺序
    const firstCell = page.locator(".heatmap .heat-cell").first();
    const cellTitle = (await firstCell.getAttribute("title")) ?? "";
    const expectedDate = (cellTitle.match(/\d{4}-\d{2}-\d{2}/) ?? [])[0] ?? "";
    await firstCell.click();
    // 等"正在解析当前日期"提示消失。App 在解析失败时会保留旧详情、
    // 只更新标题,所以等待超时是硬性失败,不能吞掉
    try {
      await page
        .getByText("正在解析当前日期")
        .waitFor({ state: "hidden", timeout: 60_000 });
      record("日期详情:当日解析完成", true);
    } catch {
      record("日期详情:当日解析完成", false, "解析提示 60s 内未消失");
    }
    // 详情必须真的属于所选日期:原始文件列表应出现该日期的文件名,
    // 防止后续图表/文件/颜色检查在旧日期数据上跑
    const dayStem = expectedDate ? expectedDate.replaceAll("-", "") : "";
    let detailMatches = false;
    if (dayStem) {
      try {
        await page
          .getByText(new RegExp(`${dayStem}_[^\\s]*\\.edf`))
          .first()
          .waitFor({ state: "attached", timeout: 60_000 });
        detailMatches = true;
      } catch {
        detailMatches = false;
      }
    }
    record(
      "日期详情:渲染的是所选日期",
      detailMatches,
      detailMatches
        ? `原始文件含 ${expectedDate} 的 .edf`
        : `未找到 ${expectedDate} 的原始文件条目`
    );
    const after = ((await heading.textContent()) ?? "").trim();
    record(
      "日期切换:标题随选择更新",
      Boolean(expectedDate) && before !== after && after === expectedDate,
      `${before} -> ${after}(期望 ${expectedDate})`
    );

    // 导出当日摘要(确定性断言下载事件)
    try {
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 10_000 }),
        page.getByRole("button", { name: "导出当日摘要" }).click(),
      ]);
      record("导出当日摘要 CSV", true, download.suggestedFilename());
    } catch (err) {
      record("导出当日摘要 CSV", false, err.message.split("\n")[0]);
    }

    // 图形/图例颜色一致性审计(确定性,读 ECharts option)
    const audit = await page.evaluate(async () => {
      // hex / rgb() / rgba() 统一成 "r,g,b" 便于比较
      const norm = (c) => {
        if (!c) return null;
        const s = String(c).trim().toLowerCase();
        let m = s.match(/^#([0-9a-f]{3,8})$/);
        if (m) {
          let h = m[1];
          if (h.length === 3) h = [...h].map((x) => x + x).join("");
          if (h.length === 8) h = h.slice(0, 6);
          if (h.length !== 6) return s;
          const n = parseInt(h, 16);
          return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
        }
        m = s.match(/^rgba?\(([^)]+)\)$/);
        if (m) {
          const p = m[1].split(",").map((x) => parseFloat(x));
          return `${p[0]},${p[1]},${p[2]}`;
        }
        return s;
      };

      // 复用应用自己的 echarts 模块实例(dev server 依赖预构建 URL,
      // 同一 URL 即同一模块注册表,getInstanceByDom 才能命中)
      const hookSrc = await (await fetch("/src/charts/useECharts.ts")).text();
      const match = hookSrc.match(
        /from\s*"(\/node_modules\/[^"]*echarts[^"]*\.js[^"]*)"/
      );
      if (!match) {
        return { error: "未能从 useECharts.ts 解析出 echarts 模块 URL" };
      }
      const echarts = await import(match[1]);

      const charts = [];
      for (const el of document.querySelectorAll("div, section")) {
        const inst = echarts.getInstanceByDom(el);
        if (inst && !charts.includes(inst)) charts.push(inst);
      }

      const seriesMismatches = [];
      const markLineColors = [];
      const inspected = [];
      charts.forEach((chart, chartIndex) => {
        const opt = chart.getOption();
        const palette = Array.isArray(opt.color)
          ? opt.color
          : opt.color
            ? [opt.color]
            : [];
        const seriesList = (
          Array.isArray(opt.series) ? opt.series : [opt.series]
        ).filter(Boolean);
        const legend = Array.isArray(opt.legend) ? opt.legend[0] : opt.legend;
        const legendEntries = new Map();
        if (legend && Array.isArray(legend.data)) {
          for (const entry of legend.data) {
            if (typeof entry === "string") legendEntries.set(entry, {});
            else if (entry?.name) legendEntries.set(entry.name, entry);
          }
        }
        const dom = chart.getDom();
        const title =
          dom
            .closest("section")
            ?.querySelector("h2, h3, strong, .waveform-title")
            ?.textContent?.trim() ?? `图表#${chartIndex}`;

        // markLine 采集必须在图例守卫之外:单序列波形图没有 ECharts
        // 图例,但事件标线(以及它们与 HTML 事件图例的一致性)照样存在
        for (const series of seriesList) {
          if (Array.isArray(series.markLine?.data)) {
            for (const item of series.markLine.data) {
              if (item?.name) {
                markLineColors.push({
                  name: item.name,
                  color: item.lineStyle?.color ?? null,
                });
              }
            }
          }
        }

        // 逐序列颜色比较:只审计有图例的序列
        const inspectedSeries = [];
        seriesList.forEach((series, i) => {
          if (!legendEntries.has(series.name)) return;
          const legendEntry = legendEntries.get(series.name);
          const paletteColor = palette[i] ?? null;
          // 线/柱实际着色:lineStyle 优先;图例标记着色:itemStyle 优先
          const drawnColor =
            series.lineStyle?.color ?? series.itemStyle?.color ?? paletteColor;
          const legendColor =
            legendEntry.itemStyle?.color ??
            series.itemStyle?.color ??
            paletteColor;
          inspectedSeries.push(series.name);
          if (
            drawnColor &&
            legendColor &&
            norm(drawnColor) !== norm(legendColor)
          ) {
            seriesMismatches.push({
              chart: title,
              series: series.name,
              drawnColor,
              legendColor,
            });
          }
        });
        if (inspectedSeries.length > 0) {
          inspected.push({ chart: title, series: inspectedSeries });
        }
      });

      // 波形卡片的 HTML 事件图例 vs markLine 实际颜色
      const eventLegendMismatches = [];
      let eventLegendChecked = 0;
      for (const item of document.querySelectorAll(".chart-legend-item")) {
        const text = item
          .querySelector(".chart-legend-text")
          ?.textContent?.trim();
        const swatch = item.querySelector(".chart-legend-line");
        // 色块可见线条是 border-top(.chart-legend-line 高度为 0,
        // backgroundColor 不可见),必须读 borderTopColor
        const color = swatch ? getComputedStyle(swatch).borderTopColor : null;
        if (!text || !color) continue;
        const related = markLineColors.filter(
          (m) => m.name === text && m.color
        );
        if (related.length === 0) continue;
        eventLegendChecked += 1;
        if (related.some((m) => norm(m.color) !== norm(color))) {
          eventLegendMismatches.push({
            legend: text,
            domColor: color,
            markLineColor: related[0].color,
          });
        }
      }

      return {
        chartCount: charts.length,
        inspected,
        seriesMismatches,
        eventLegendMismatches,
        eventLegendChecked,
        markLineCount: markLineColors.length,
      };
    });

    if (audit.error) {
      record("图形/图例颜色审计", false, audit.error);
    } else {
      record(
        "图形/图例颜色一致(线柱实际颜色 vs 图例标记)",
        audit.seriesMismatches.length === 0,
        audit.seriesMismatches.length === 0
          ? `已检查 ${audit.inspected.reduce((n, c) => n + c.series.length, 0)} 个序列 / ${audit.chartCount} 个图表`
          : audit.seriesMismatches
              .map(
                (m) =>
                  `[${m.chart}] "${m.series}" 线条=${m.drawnColor} 图例=${m.legendColor}`
              )
              .join("; ")
      );
      // 审计必须真的覆盖到叠加图(同图多序列),否则"零不一致"是空转:
      // 图例或叠加序列消失时这里会失败,而不是报成功
      // 叠加图按序列名定位(压力叠加图才有"实际压力"序列),
      // 长期摘要图同样是双序列,不能只看序列数量
      const overlayInspected = audit.inspected.find(
        (c) => c.series.length >= 2 && c.series.some((s) => s.includes("压力"))
      );
      record(
        "颜色审计覆盖压力叠加图(压力 + 实际压力)",
        Boolean(overlayInspected),
        overlayInspected
          ? `[${overlayInspected.chart}] ${overlayInspected.series.join(" + ")}`
          : "压力叠加图的两个序列未被审计到"
      );
      record(
        "事件标记图例与标线颜色一致",
        audit.eventLegendMismatches.length === 0 &&
          audit.eventLegendChecked > 0,
        `已核对 ${audit.eventLegendChecked} 个 HTML 图例项 / ${audit.markLineCount} 个事件标线` +
          (audit.eventLegendChecked > 0
            ? ""
            : "(没有可核对的事件图例项,无法确认一致性)")
      );
    }

    // 页底验证:程序化滚动 + 确定性断言,AI 只做软性视觉复核。
    // 本页是整页滚动(min-height:100vh,无内部滚动容器),
    // 让模型自己 Scroll 会定位到非滚动元素而原地打转
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(800);
    const canvasCount = await page.locator("canvas").count();
    record("页底:图表 canvas 已渲染", canvasCount >= 3, `共 ${canvasCount} 个`);
    const rawFileCount = await page
      .locator(".raw-file-browser, section:has-text('原始文件')")
      .getByText(/\.edf/)
      .count()
      .catch(() => 0);
    record("页底:原始文件列表含 EDF 条目", rawFileCount > 0);
    // AI 视觉复核(软性):复合视觉判断对当前模型误报率高,且主观
    // 结论不该挂退出码;事实性覆盖由上面的确定性断言承担。
    // 机制上仍用 aiBoolean 断言而非 aiAct 动作规划
    try {
      const listsEdfFiles = await agent.aiBoolean(
        'Does the "原始文件" section on this page list imported .edf files?'
      );
      if (listsEdfFiles === true) {
        record("页底:AI 视觉复核原始文件列表", true);
      } else {
        // 主观视觉判断不挂退出码:列表存在性已由上面的 DOM 断言确认
        warn("页底 AI 视觉复核判断为否(软性;以 DOM 断言为准)");
      }
    } catch (err) {
      warn(
        "页底 AI 视觉复核未完成(软性)",
        String(err?.message ?? err).split("\n")[0]
      );
    }

    // AI 分析面板开合(确定性交互)。触发按钮在长页面底部且需要
    // 滚动才能进入视野,是模型重规划打转的高发场景;交互本身
    // 价值有限,交给确定性定位
    const trigger = page.locator(".ai-collapsed-trigger");
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    record(
      "AI 分析面板:展开",
      await page
        .locator(".ai-panel")
        .isVisible()
        .catch(() => false)
    );
    await page.locator('button[aria-label="收起面板"]').click();
    record(
      "AI 分析面板:收起",
      !(await page
        .locator(".ai-panel")
        .isVisible()
        .catch(() => false))
    );

    // AI 视觉复核图例颜色(软性:限首屏可见图表,避免模型为
    // "看全所有图"反复滚动;硬性结论以确定性审计为准)
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(800);
    try {
      const legendLooksConsistent = await agent.aiBoolean(
        "In the charts currently visible in this viewport, does every legend marker color match the color of its corresponding line or bar?"
      );
      if (legendLooksConsistent === true) {
        record("AI 视觉复核:图例与图形颜色一致", true);
      } else {
        // 软性检查的否定结论同样只警告,不进退出码:
        // 主观视觉判断的误报由确定性审计兜底
        warn("AI 视觉复核判断图例不一致(软性;硬性结论以确定性审计为准)");
      }
    } catch (err) {
      warn(
        "AI 视觉复核未通过(软性检查;硬性结论以确定性审计为准)",
        String(err?.message ?? err).split("\n")[0]
      );
    }
  }
} finally {
  if (agent) {
    await agent.destroy().catch(() => {});
  }
  await page
    .screenshot({ path: "midscene_run/e2e-final.png", fullPage: true })
    .catch(() => {});
  await browser.close().catch(() => {});
}

// ── 运行时错误兜底:无论跑到哪一步,收集到的浏览器错误都计入退出码 ──
record("无 pageerror", pageErrors.length === 0, pageErrors.join(" | "));
record(
  "无 console error",
  consoleErrors.length === 0,
  consoleErrors.join(" | ")
);
record("无失败请求", failedRequests.length === 0, failedRequests.join(" | "));

console.log(`\n—— 汇总 ——`);
console.log(`失败 ${failures.length}`, `警告 ${warnings.length}`);
if (warnings.length) {
  for (const w of warnings) console.log(`⚠ ${w.name} ${w.detail}`);
}
if (agent?.reportFile) {
  console.log(`Midscene 可视化报告: ${agent.reportFile}`);
}
if (failures.length > 0) {
  for (const f of failures) console.log(`✗ ${f.name} ${f.detail}`);
  process.exit(1);
}
console.log("全部通过。");
