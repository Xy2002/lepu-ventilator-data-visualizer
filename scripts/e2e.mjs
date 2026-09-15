/**
 * Midscene + Playwright e2e(不依赖测试框架,直接 node 运行)。
 *
 * 覆盖两类检查:
 * 1. 功能链路(Midscene aiAct 驱动 + 确定性断言兜底):
 *    空状态 → 导入样例 EDF → 工作台渲染 → 日期切换 → 导出 CSV
 *    → 图形/图例颜色审计 → 页底波形/原始文件验证 → AI 分析面板开合
 * 2. 图形与图示一致性审计(确定性,直接读 ECharts option):
 *    - 每个 series 的"线/柱实际颜色" vs "图例标记颜色"
 *      (ECharts 折线系列图例取 itemStyle/调色板,不取 lineStyle,
 *       只设 lineStyle 时两者会不一致——这正是要抓的 bug)
 *    - 事件标记的 HTML 图例颜色 vs 波形图 markLine 实际颜色
 * 3. 兜底:pageerror / console error / 失败请求
 *
 * 提示词经验(针对会重规划打转的模型):
 *   - 无头下原生文件对话框不会弹出;实测让 AI 注册文件或用
 *     fileChooserAccept 预注册都时灵时不灵,导入这类机械文件注入
 *     直接用 Playwright setInputFiles,AI 不参与;
 *   - 涉及页面滚动的开放式指令(滚动浏览、找全所有图)会原地打转,
 *     滚动一律程序化,AI 只做单屏内的视觉判断。
 *
 * 用法:先起 dev server(npm run dev),再 npm run e2e。
 * 需要在 .env 配置 MIDSCENE_MODEL_*(见 .env 内注释)。
 */
import "dotenv/config";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { PlaywrightAgent } from "@midscene/web/playwright";

const APP_URL = process.env.E2E_APP_URL ?? "http://127.0.0.1:5173/";
// 两个目录,保证数据集里有可切换的多个日期
const FIXTURE_DIR = "DATA/DATAFILE";
const FIXTURE_DAYS = ["20240724", "20240725"];
const FIXTURE_FILES = FIXTURE_DAYS.flatMap((day) =>
  readdirSync(`${FIXTURE_DIR}/${day}`)
    .filter((f) => f.endsWith(".edf"))
    .map((f) => `${day}/${f}`)
);
// 绝对路径列表,经 fileChooserAccept 确定性预注册:
// 让 AI 规划 22 个文件的注册+点击很不稳定(同样的提示词时过时不过),
// 拆成"脚本注册文件 + AI 只点一个按钮"后,模型只需完成最简单的单步操作
const FIXTURE_ABS_FILES = FIXTURE_FILES.map((f) => resolve(FIXTURE_DIR, f));

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

// aiAct 统一封装:失败记录后继续跑,不让单步异常炸掉整个进程
async function aiStep(agent, name, prompt, opts = undefined) {
  try {
    await agent.aiAct(prompt, opts);
    record(name, true);
    return true;
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
let dataReady = false;
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

  // ── 1. 空状态(AI 视觉验证) ─────────────────────────────
  await aiStep(
    agent,
    "空状态:标题与导入引导可见",
    'verify the page shows the title "呼吸机数据可视化" in the top bar, and an empty state section with heading "导入 DATAFILE 开始查看"'
  );

  // ── 2. 导入 EDF:纯 Playwright 机械注入。
  //       实测两种 AI 驱动方式(模型注册文件、fileChooserAccept 预注册)
  //       都不稳定:按钮点了、选择器拦截不生效,页面无变化导致重规划
  //       打转;文件注入无判断价值,交给确定性 API,AI 留给视觉验证 ──
  let importOk = false;
  try {
    await page
      .locator('input[aria-label="选择 EDF 文件"]')
      .setInputFiles(FIXTURE_ABS_FILES);
    importOk = true;
    record(
      `导入 ${FIXTURE_FILES.length} 个 EDF(${FIXTURE_DAYS.join("、")})`,
      true
    );
  } catch (err) {
    record(
      `导入 ${FIXTURE_FILES.length} 个 EDF(${FIXTURE_DAYS.join("、")})`,
      false,
      String(err).split("\n")[0]
    );
  }
  if (importOk) {
    try {
      await page.locator(".workbench").waitFor({ timeout: 60_000 });
      await page
        .getByText("正在索引文件")
        .waitFor({ state: "hidden", timeout: 60_000 })
        .catch(() => {});
      dataReady = true;
      record("索引完成,工作台出现", true);
    } catch (err) {
      record("索引完成,工作台出现", false, String(err).split("\n")[0]);
    }
  }

  // ── 3~9. 依赖数据集的步骤 ──────────────────────────────
  if (dataReady) {
    // 工作台内容(AI 视觉验证)
    await aiStep(
      agent,
      "工作台:导航/趋势图/摘要卡渲染",
      'verify the empty state is gone, and the page shows a "日期导航" sidebar, a trend chart, summary cards with labels like "使用时长" and "AI / HI", and a selected date heading'
    );

    // 日期切换(确定性点击热力图首格 + 断言)。
    // 热力图只有两三个格子时 AI 点击容易落在一当前日期上,
    // 而这里要验证的是应用的日期切换行为本身
    const heading = page.locator(".selected-day-header h2");
    const before = ((await heading.textContent()) ?? "").trim();
    await page.locator(".heatmap .heat-cell").first().click();
    await page.waitForTimeout(1500);
    const after = ((await heading.textContent()) ?? "").trim();
    record(
      "日期切换:标题随选择更新",
      before !== after,
      `${before} -> ${after}`
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
          if (Array.isArray(series.markLine?.data)) {
            for (const item of series.markLine.data) {
              if (item?.name) {
                markLineColors.push({
                  name: item.name,
                  color: item.lineStyle?.color ?? paletteColor,
                });
              }
            }
          }
        });
      });

      // 波形卡片的 HTML 事件图例 vs markLine 实际颜色
      const eventLegendMismatches = [];
      for (const item of document.querySelectorAll(".chart-legend-item")) {
        const text = item
          .querySelector(".chart-legend-text")
          ?.textContent?.trim();
        const swatch = item.querySelector(".chart-legend-line");
        const color = swatch ? getComputedStyle(swatch).backgroundColor : null;
        if (!text || !color) continue;
        const related = markLineColors.filter((m) => m.name === text);
        if (related.length === 0) continue;
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
        seriesMismatches,
        eventLegendMismatches,
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
          ? `已检查 ${audit.chartCount} 个图表`
          : audit.seriesMismatches
              .map(
                (m) =>
                  `[${m.chart}] "${m.series}" 线条=${m.drawnColor} 图例=${m.legendColor}`
              )
              .join("; ")
      );
      record(
        "事件标记图例与标线颜色一致",
        audit.eventLegendMismatches.length === 0,
        audit.eventLegendMismatches.length === 0
          ? `已检查 ${audit.markLineCount} 个事件标线`
          : JSON.stringify(audit.eventLegendMismatches)
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
    try {
      await agent.aiAct(
        'verify the "原始文件" section at the bottom lists imported .edf files, and the waveform charts above it show real data curves rather than blank areas'
      );
      record("页底:AI 视觉复核波形与文件列表", true);
    } catch (err) {
      warn(
        "页底 AI 视觉复核未通过(软性;以上确定性断言为准)",
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
      await agent.aiAct(
        "visually check the charts currently visible in this viewport: verify every legend marker color matches the color of its corresponding line or bar"
      );
      record("AI 视觉复核:图例与图形颜色一致", true);
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
