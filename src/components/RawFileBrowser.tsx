import { ChipRoot, ChipLabel, DisclosureRoot, DisclosureTrigger, DisclosureContent, DisclosureIndicator, DisclosureGroupRoot, Button, SurfaceRoot, ScrollShadowRoot } from '@heroui/react';
import { downloadCsv, exportEventsCsv, exportWaveformCsv } from '../data/csv';
import { type Ba525ConfigRecord, parseBa525ConfigRecords } from '../parser/ba525ConfigParser';
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

function describeRawFile(file: ParsedVentilatorFile) {
  const label = file.header.label || file.fileName.replace(/\.edf$/i, '');

  switch (label) {
    case 'flow':
      return '气流波形：呼吸气流采样，用于观察吸气、呼气形态和事件前后的气流变化。';
    case 'pressure':
      return '压力波形：设备输出压力采样，用于和事件、ASCP 压力状态对照。';
    case 'real_pres':
      return '实际压力波形：高频压力反馈采样，用于核对设备实际给压变化。';
    case 'real_flow':
      return '实际气流波形：高频气流反馈采样，用于观察真实呼吸流速变化。';
    case 'difleak':
      return '漏气相关波形：设备记录的差分漏气趋势，适合和压力、事件一起对照。';
    case 'mvtvbr':
      return '通气统计三元记录：用于核对分钟通气量、潮气量和呼吸频率等趋势。';
    case 'ai':
      return 'AI 事件：治疗过程中的呼吸暂停明细，value2 通常表示持续秒数。';
    case 'hi':
      return 'HI 事件：治疗过程中的低通气明细，value2 通常表示持续秒数。';
    case 'ascp':
      return 'ASCP 压力状态：Auto-S 模式下的 IPAP/EPAP 记录，二者差值对应设置的压力支撑。';
    case 'usetime':
      return '使用时段：记录治疗会话的开始、结束或持续时间，用于计算有效使用时长。';
    case 'config':
      return '配置快照：记录治疗模式、压力支撑、EPAP/IPAP、湿化和延时升压等设备设置。';
    default:
      break;
  }

  if (file.kind === 'events16') {
    return `${label} 事件/状态记录：每条记录包含 value1、value2 和现实时间戳。`;
  }

  if (file.kind.startsWith('waveform_')) {
    return `${label} 波形数据：可绘制为时间序列，用于和事件时间线对照。`;
  }

  if (file.kind === 'triples_u16le') {
    return `${label} 三元记录：每条记录包含三个 16-bit 数值，适合先作为趋势数据核对。`;
  }

  if (file.kind === 'raw_config') {
    return `${label} 配置数据：当前仅解析头部和原始 payload，适合继续反查设备设置。`;
  }

  if (file.kind === 'invalid') {
    return '无法解析：文件长度或头部结构不符合当前解析器预期。';
  }

  return `${label} 原始数据：当前还没有专用解码器，先展示 header、payload 和十六进制预览。`;
}

function exportFile(file: ParsedVentilatorFile) {
  if (file.values.length > 0) {
    downloadCsv(`${file.fileName}.csv`, exportWaveformCsv(file.values, file.header.sampleRateHz));
  } else if (file.kind === 'events16') {
    downloadCsv(`${file.fileName}.csv`, exportEventsCsv(file.records as EventRecord[]));
  }
}

function ConfigRecordTable({ record }: { record: Ba525ConfigRecord }) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr>
          <th className="p-1.5 text-left text-foreground font-medium text-xs">参数</th>
          <th className="p-1.5 text-left text-foreground font-medium text-xs">值</th>
          <th className="p-1.5 text-left text-foreground font-medium text-xs">状态</th>
        </tr>
      </thead>
      <tbody>
        {record.locked.map((entry) => (
          <tr key={entry.name}>
            <td className="p-1.5 text-xs">{entry.label}</td>
            <td className="p-1.5 font-mono text-xs text-foreground">{entry.display}</td>
            <td className="p-1.5">
              <ChipRoot variant="soft" size="sm" className={entry.status === 'confirmed' ? 'config-status--confirmed' : 'config-status--diff'}>
                <ChipLabel>{entry.status === 'confirmed' ? '已确认' : '交叉验证'}</ChipLabel>
              </ChipRoot>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ConfigDetail({ file }: { file: ParsedVentilatorFile }) {
  let records: Ba525ConfigRecord[];
  try {
    records = parseBa525ConfigRecords(file.rawPayload);
  } catch {
    return <p className="text-sm text-danger">无法解析 BA525 配置（payload 不是 192 字节或格式不匹配）</p>;
  }

  const multiple = records.length > 1;

  return (
    <div className="mt-2 overflow-x-auto">
      {records.map((record) => (
        <div key={record.index} className={record.index > 0 ? 'mt-3 pt-3 border-t border-border' : ''}>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-semibold text-sm text-foreground">#{record.index + 1}</span>
            {record.timestamp ? (
              <span className="font-mono text-xs text-muted">{record.timestamp}</span>
            ) : null}
          </div>
          {multiple && record.index > 0 && records[0].locked.every((e, i) => e.display === record.locked[i]?.display) ? (
            <p className="text-xs text-muted">配置与 #1 相同</p>
          ) : (
            <ConfigRecordTable record={record} />
          )}
        </div>
      ))}
    </div>
  );
}

export function RawFileBrowser({ files }: RawFileBrowserProps) {
  return (
    <SurfaceRoot variant="secondary" className="flex flex-col h-[clamp(380px,46vh,520px)] min-h-0 mt-4 p-3.5">
      <h3 className="m-0 mb-3 text-lg font-semibold text-foreground">原始文件</h3>
      <ScrollShadowRoot orientation="vertical" className="flex-1 min-h-0 overflow-auto">
        <DisclosureGroupRoot>
          {files.map((file) => {
            const description = describeRawFile(file);
            const isBa525Config = file.kind === 'raw_config' && file.rawPayload.length >= 192;

            return (
              <DisclosureRoot key={file.fileName}>
                <DisclosureTrigger className="flex items-start justify-between gap-3 py-2.5 border-b border-border w-full">
                  <DisclosureIndicator />
                  <div className="grid min-w-0 gap-1 flex-1">
                    <strong className="text-foreground text-sm">{file.fileName}</strong>
                    <span className="text-muted text-xs leading-relaxed">{description}</span>
                  </div>
                  <span className="text-muted font-mono text-xs shrink-0">{file.kind}</span>
                </DisclosureTrigger>
                <DisclosureContent>
                  {isBa525Config ? <ConfigDetail file={file} /> : null}
                  <dl className="grid gap-2 my-3">
                    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
                      <dt className="text-muted text-sm">说明</dt>
                      <dd className="m-0 text-muted text-xs leading-relaxed">{description}</dd>
                    </div>
                    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
                      <dt className="text-muted text-sm">Label</dt>
                      <dd className="m-0 text-foreground font-mono text-xs">{file.header.label}</dd>
                    </div>
                    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
                      <dt className="text-muted text-sm">Header</dt>
                      <dd className="m-0 text-foreground font-mono text-xs">{file.header.headerBytes} bytes</dd>
                    </div>
                    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
                      <dt className="text-muted text-sm">Payload</dt>
                      <dd className="m-0 text-foreground font-mono text-xs">{file.payloadBytes} bytes</dd>
                    </div>
                    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
                      <dt className="text-muted text-sm">Start</dt>
                      <dd className="m-0 text-foreground font-mono text-xs">{file.header.startTime ?? '-'}</dd>
                    </div>
                    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
                      <dt className="text-muted text-sm">End</dt>
                      <dd className="m-0 text-foreground font-mono text-xs">{file.header.endTime ?? '-'}</dd>
                    </div>
                    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
                      <dt className="text-muted text-sm">Preview</dt>
                      <dd className="m-0 text-foreground font-mono text-xs break-all">{preview(file)}</dd>
                    </div>
                  </dl>
                  {file.warnings.map((warning) => (
                    <p key={warning} className="text-sm text-danger">{warning}</p>
                  ))}
                  {file.values.length > 0 || file.kind === 'events16' ? (
                    <Button size="sm" variant="outline" onPress={() => exportFile(file)}>
                      导出 CSV
                    </Button>
                  ) : null}
                </DisclosureContent>
              </DisclosureRoot>
            );
          })}
        </DisclosureGroupRoot>
      </ScrollShadowRoot>
    </SurfaceRoot>
  );
}
