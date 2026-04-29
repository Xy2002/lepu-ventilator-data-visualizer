import './App.css';

export function App() {
  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <h1>呼吸机数据可视化</h1>
          <p>浏览器本地解析，不上传原始数据</p>
        </div>
      </header>
      <section className="empty-state">
        <h2>导入 DATAFILE 开始查看</h2>
        <p>支持选择日期目录中的 EDF-like 文件，并按日期生成摘要和图表。</p>
      </section>
    </main>
  );
}
