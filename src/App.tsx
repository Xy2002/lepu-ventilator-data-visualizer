import { useState } from 'react';
import './App.css';
import { ImportPanel } from './components/ImportPanel';
import { buildDatasetIndex } from './data/dataset';
import type { DatasetIndex, ImportedFileRef } from './types';

export function App() {
  const [dataset, setDataset] = useState<DatasetIndex | null>(null);
  const [isIndexing, setIsIndexing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleImport(files: ImportedFileRef[]) {
    setIsIndexing(true);
    setError(null);

    try {
      setDataset(await buildDatasetIndex(files));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '导入失败');
    } finally {
      setIsIndexing(false);
    }
  }

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

      {dataset ? (
        <section className="dataset-status">
          <h2>数据集</h2>
          <p>
            {dataset.days.length} 天 · {dataset.dateRange.start ?? '-'} 至 {dataset.dateRange.end ?? '-'}
          </p>
        </section>
      ) : (
        <section className="empty-state">
          <h2>导入 DATAFILE 开始查看</h2>
          <p>支持选择日期目录中的 EDF-like 文件，并按日期生成摘要和图表。</p>
        </section>
      )}
    </main>
  );
}
