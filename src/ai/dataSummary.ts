import type { DaySummary } from "../types";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

export function buildSystemPrompt(): string {
  return `你是一位专业的呼吸机（CPAP/BiPAP）数据分析专家。请根据以下呼吸机使用数据生成一份详细的分析报告。

报告要求：
1. 用通俗易懂的中文撰写，避免过于专业的术语
2. 评估使用时长是否达标（一般建议 ≥ 4 小时）
3. 分析事件指标（AHI = AI + HI），评估治疗效果（AHI < 5 为正常）
4. 分析压力数据，评估压力设置是否合适
5. 给出改善建议（如有必要）
6. 使用 Markdown 格式，包含标题、列表、表格等

注意：此报告仅供参考，不构成医疗建议。如有疑问请咨询医生。`;
}

export function buildDataSummary(summary: DaySummary): string {
  const lines: string[] = [];
  lines.push(`## 呼吸机数据日报 — ${summary.date}`);
  lines.push("");

  // Usage info
  lines.push("### 使用时段");
  if (summary.useSessions.length > 0) {
    lines.push(
      `使用时长: ${formatDuration(summary.useSessions.reduce((t, s) => t + s.durationSeconds, 0))}`
    );
    lines.push(`使用会话数: ${summary.useSessions.length}`);
    for (let i = 0; i < summary.useSessions.length; i++) {
      const s = summary.useSessions[i];
      lines.push(
        `  - 会话 ${i + 1}: ${s.startTime} 至 ${s.endTime} (${formatDuration(s.durationSeconds)})`
      );
    }
  } else {
    lines.push("使用时段: 无数据");
    if (summary.startTime && summary.endTime) {
      lines.push(`记录时间范围: ${summary.startTime} 至 ${summary.endTime}`);
    }
  }
  lines.push("");

  // Events
  lines.push("### 事件统计");
  // eventCounts 只包含实际解析到的事件文件键；缺失的类目标“无记录”而非 0，
  // 避免把不完整的当日数据呈现为完整统计。
  const aiCount = summary.eventCounts.ai;
  const hiCount = summary.eventCounts.hi;
  const ahiTotal = (aiCount ?? 0) + (hiCount ?? 0);
  const otherEntries = Object.entries(summary.eventCounts).filter(
    ([label]) => label !== "ai" && label !== "hi"
  );

  if (
    aiCount !== undefined ||
    hiCount !== undefined ||
    otherEntries.length > 0
  ) {
    const ahiComplete = aiCount !== undefined && hiCount !== undefined;
    lines.push(
      `AHI 相关事件总计（AI + HI${ahiComplete ? "" : "，部分数据缺失"}）: ${ahiTotal} 次`
    );
    lines.push(
      `  - 中心性呼吸暂停 (AI): ${aiCount !== undefined ? `${aiCount} 次` : "无记录"}`
    );
    lines.push(
      `  - 低通气 (HI): ${hiCount !== undefined ? `${hiCount} 次` : "无记录"}`
    );

    if (otherEntries.length > 0) {
      lines.push("其他记录（不计入 AHI）:");
      const names: Record<string, string> = {
        ascp: "自动压力调整记录 (ASCP)",
        usetime: "使用时间记录",
      };
      for (const [label, count] of otherEntries) {
        lines.push(`  - ${names[label] ?? label}: ${count} 次`);
      }
    }
  } else {
    lines.push("无事件记录");
  }
  lines.push("");

  // Pressure
  lines.push("### 压力数据");
  if (summary.pressureRange) {
    lines.push(
      `压力范围: ${summary.pressureRange.min} - ${summary.pressureRange.max} cmH2O`
    );
  } else {
    lines.push("压力范围: 无数据");
  }
  lines.push("");

  // Signal integrity
  lines.push("### 信号完整性");
  const signalLabels: Record<string, string> = {
    flow: "流量波形",
    pressure: "压力波形",
    real_pres: "实际压力",
    real_flow: "实际气流",
  };
  for (const [key, label] of Object.entries(signalLabels)) {
    const present = summary.signalPresence[key];
    const count = summary.sampleCounts[key];
    if (present && count) {
      lines.push(`${label}: ✓ (${count.toLocaleString()} 采样点)`);
    } else {
      lines.push(`${label}: ✗`);
    }
  }
  lines.push("");

  // Missing files
  if (summary.missingFiles.length > 0) {
    lines.push("### 缺失文件");
    lines.push(`缺失文件: ${summary.missingFiles.join(", ")}`);
    lines.push("");
  }

  // Warnings
  if (summary.warnings.length > 0) {
    lines.push("### 警告");
    for (const w of summary.warnings) {
      lines.push(`- ${w}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
