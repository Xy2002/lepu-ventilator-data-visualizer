import { useMemo } from "react";
import type { DatasetIndex } from "../types";

interface DatasetStatusBarProps {
  dataset: DatasetIndex;
}

// 数据集全局状态（spec: days indexed / date range / file count / parsing warnings）
export function DatasetStatusBar({ dataset }: DatasetStatusBarProps) {
  const fileCount = useMemo(
    () =>
      Object.values(dataset.filesByDay).reduce(
        (total, refs) => total + refs.length,
        0
      ),
    [dataset.filesByDay]
  );

  const dayWarnings = useMemo(
    () =>
      dataset.days.flatMap((day) =>
        (dataset.summariesByDay[day]?.warnings ?? []).map(
          (warning) => `${day}: ${warning}`
        )
      ),
    [dataset]
  );
  const warningCount = dataset.warnings.length + dayWarnings.length;

  return (
    <section className="dataset-status" aria-label="数据集状态">
      <span>共 {dataset.days.length} 天</span>
      <span>
        日期范围：{dataset.dateRange.start ?? "-"} ~{" "}
        {dataset.dateRange.end ?? "-"}
      </span>
      <span>文件 {fileCount} 个</span>
      {warningCount > 0 ? (
        <details className="dataset-status-warnings">
          <summary>解析警告 {warningCount} 条</summary>
          <ul>
            {dataset.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
            {dayWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      ) : (
        <span>无解析警告</span>
      )}
    </section>
  );
}
