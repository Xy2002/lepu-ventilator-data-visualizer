import { useEffect, useMemo, useState } from 'react';
import { ChipRoot, ChipLabel, SurfaceRoot, Spinner, TabsRoot, TabListContainer, TabList, Tab, TabPanel } from '@heroui/react';
import { WaveformChart } from '../charts/WaveformChart';
import type { DayDetail } from '../types';

const CHART_SWITCH_DELAY_MS = 200;

const EVENT_SIGNAL_MAP: Record<string, string> = {
  ai: 'flow',
  hi: 'flow',
  ascp: 'pressure',
};

const LABEL_NAMES: Record<string, string> = {
  flow: '气流',
  pressure: '压力',
  real_pres: '实际压力',
  real_flow: '实际气流',
  difleak: '漏气',
};

interface DayChartsProps {
  detail: DayDetail;
}

export function DayCharts({ detail }: DayChartsProps) {
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [renderedFileName, setRenderedFileName] = useState<string | null>(null);

  const defaultSignal = detail.signals[0] ?? null;
  const selectedSignal =
    detail.signals.find((s) => s.fileName === selectedFileName) ?? defaultSignal;
  const renderedSignal =
    detail.signals.find((s) => s.fileName === renderedFileName) ?? defaultSignal;
  const isSwitching =
    selectedSignal && renderedSignal && selectedSignal.fileName !== renderedSignal.fileName;

  useEffect(() => {
    if (!selectedSignal || !renderedSignal || selectedSignal.fileName === renderedSignal.fileName) return;
    const timer = window.setTimeout(() => {
      setRenderedFileName(selectedSignal.fileName);
    }, CHART_SWITCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [renderedSignal?.fileName, selectedSignal?.fileName]);

  const activeLabel = selectedSignal?.header.label ?? null;

  const activeEvents = useMemo(
    () =>
      activeLabel
        ? detail.events.filter((e) => EVENT_SIGNAL_MAP[e.sourceLabel] === activeLabel)
        : [],
    [detail.events, activeLabel],
  );

  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  useEffect(() => {
    setFocusedIndex(null);
  }, [activeLabel]);

  const eventSeconds = useMemo(
    () => activeEvents.map((e) => e.secondsFromDayStart).filter((v): v is number => typeof v === 'number'),
    [activeEvents],
  );
  const eventTimestamps = useMemo(
    () => activeEvents.map((e) => e.timestamp).filter((v): v is string => typeof v === 'string'),
    [activeEvents],
  );

  const focusedEvent = focusedIndex !== null ? activeEvents[focusedIndex] : null;
  const isAscp = activeLabel === 'pressure';

  return (
    <section className="mt-4">
      {detail.signals.length === 0 ? <p className="text-sm text-muted">当前日期没有可显示的波形文件。</p> : null}
      {detail.signals.length > 0 ? (
        <TabsRoot
          selectedKey={selectedSignal?.fileName ?? ''}
          onSelectionChange={(key) => setSelectedFileName(String(key))}
        >
          <TabListContainer>
            <TabList>
              {detail.signals.map((signal) => (
                <Tab key={signal.fileName} id={signal.fileName}>
                  {LABEL_NAMES[signal.header.label] ?? signal.header.label}
                </Tab>
              ))}
            </TabList>
          </TabListContainer>
          <TabPanel id={selectedSignal?.fileName ?? ''}>
            <div className="relative">
              {renderedSignal ? (
                <WaveformChart
                  key={renderedSignal.fileName}
                  label={renderedSignal.header.label}
                  values={renderedSignal.values}
                  sampleRateHz={renderedSignal.header.sampleRateHz}
                  startTime={renderedSignal.header.startTime}
                  useSessions={detail.useSessions}
                  eventTimestamps={eventTimestamps}
                  eventSeconds={eventSeconds}
                  focusedSecond={focusedEvent?.secondsFromDayStart ?? null}
                  focusedTimestamp={focusedEvent?.timestamp ?? null}
                />
              ) : null}
              {isSwitching && selectedSignal ? (
                <div
                  className="absolute inset-0 z-2 grid place-items-center rounded-lg bg-surface/72 backdrop-blur-sm pointer-events-none"
                  role="progressbar"
                  aria-label={`正在加载 ${selectedSignal.header.label} 图表`}
                >
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-surface/94 shadow-md text-sm text-muted">
                    <Spinner size="sm" />
                    <span>正在加载 {selectedSignal.header.label} 图表...</span>
                  </div>
                </div>
              ) : null}
            </div>
          </TabPanel>
        </TabsRoot>
      ) : null}

      {activeEvents.length > 0 ? (
        <SurfaceRoot variant="secondary" className="mt-3 p-3 max-h-[220px] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h4 className="m-0 text-sm font-semibold text-foreground flex items-center gap-2">
              {isAscp ? 'ASCP 压力记录' : 'AI/HI 事件'}
              <ChipRoot variant="soft" size="sm">
                <ChipLabel>{activeEvents.length}</ChipLabel>
              </ChipRoot>
            </h4>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="p-1.5 text-left text-muted font-medium">类型</th>
                  <th className="p-1.5 text-left text-muted font-medium">时间</th>
                  {isAscp ? <th className="p-1.5 text-left text-muted font-medium">IPAP</th> : null}
                  {isAscp ? <th className="p-1.5 text-left text-muted font-medium">EPAP</th> : null}
                  {!isAscp ? <th className="p-1.5 text-left text-muted font-medium">持续</th> : null}
                </tr>
              </thead>
              <tbody>
                {activeEvents.map((event, i) => (
                  <tr
                    key={`${event.sourceLabel}-${event.timestamp}-${i}`}
                    className={`cursor-pointer transition-colors ${focusedIndex === i ? 'bg-accent-soft' : 'hover:bg-surface-secondary'}`}
                    onClick={() => {
                      if (typeof event.secondsFromDayStart === 'number') {
                        setFocusedIndex(i === focusedIndex ? null : i);
                      }
                    }}
                  >
                    <td className="p-1.5">
                      <ChipRoot variant="soft" size="sm" className={`event-badge--${event.sourceLabel}`}>
                        <ChipLabel>{event.sourceLabel.toUpperCase()}</ChipLabel>
                      </ChipRoot>
                    </td>
                    <td className="p-1.5 font-mono text-xs">{event.timestamp ?? '-'}</td>
                    {isAscp ? (
                      <>
                        <td className="p-1.5 font-mono text-xs">
                          {(event.value1 / 10).toFixed(1)} <span className="text-muted text-[11px]">cmH2O</span>
                        </td>
                        <td className="p-1.5 font-mono text-xs">
                          {(event.value2 / 10).toFixed(1)} <span className="text-muted text-[11px]">cmH2O</span>
                        </td>
                      </>
                    ) : (
                      <td className="p-1.5 font-mono text-xs">{event.value2}秒</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SurfaceRoot>
      ) : null}
    </section>
  );
}
