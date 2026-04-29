import { downloadCsv, exportEventsCsv, exportWaveformCsv } from '../data/csv';
import type { EventRecord, ParsedVentilatorFile } from '../types';

interface RawFileBrowserProps {
  files: ParsedVentilatorFile[];
}

function preview(file: ParsedVentilatorFile) {
  if (file.values.length > 0) return Array.from(file.values.slice(0, 12)).join(', ');

  if (file.kind === 'events16') {
    return (file.records as EventRecord[])
      .slice(0, 3)
      .map((record) => `${record.sourceLabel}:${record.value1}/${record.value2}@${record.timestamp}`)
      .join(' | ');
  }

  return Array.from(file.rawPayload.slice(0, 16))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join(' ');
}

function exportFile(file: ParsedVentilatorFile) {
  if (file.values.length > 0) {
    downloadCsv(`${file.fileName}.csv`, exportWaveformCsv(file.values, file.header.sampleRateHz));
  } else if (file.kind === 'events16') {
    downloadCsv(`${file.fileName}.csv`, exportEventsCsv(file.records as EventRecord[]));
  }
}

export function RawFileBrowser({ files }: RawFileBrowserProps) {
  return (
    <section className="raw-browser">
      <h3>原始文件</h3>
      {files.map((file) => (
        <details key={file.fileName}>
          <summary>
            <strong>{file.fileName}</strong>
            <span>{file.kind}</span>
          </summary>
          <dl>
            <div>
              <dt>Label</dt>
              <dd>{file.header.label}</dd>
            </div>
            <div>
              <dt>Header</dt>
              <dd>{file.header.headerBytes} bytes</dd>
            </div>
            <div>
              <dt>Payload</dt>
              <dd>{file.payloadBytes} bytes</dd>
            </div>
            <div>
              <dt>Start</dt>
              <dd>{file.header.startTime ?? '-'}</dd>
            </div>
            <div>
              <dt>End</dt>
              <dd>{file.header.endTime ?? '-'}</dd>
            </div>
            <div>
              <dt>Preview</dt>
              <dd>{preview(file)}</dd>
            </div>
          </dl>
          {file.warnings.map((warning) => (
            <p className="warning" key={warning}>
              {warning}
            </p>
          ))}
          {file.values.length > 0 || file.kind === 'events16' ? (
            <button type="button" onClick={() => exportFile(file)}>
              导出 CSV
            </button>
          ) : null}
        </details>
      ))}
    </section>
  );
}
