import { useEffect, useMemo, useState } from 'react';
import { TabsRoot, TabListContainer, TabList, Tab, TabPanel, ChipRoot, ChipLabel } from '@heroui/react';
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
    <section className="day-charts">
      {detail.signals.length === 0 ? <p>当前日期没有可显示的波形文件。</p> : null}
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
            <div className="chart-panel-stage">
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
                  className="chart-loading"
                  role="progressbar"
                  aria-label={`正在加载 ${selectedSignal.header.label} 图表`}
                >
                  <div className="chart-loading-card">
                    <div className="chart-loading-track" />
                    <span>正在加载 {selectedSignal.header.label} 图表...</span>
                  </div>
                </div>
              ) : null}
            </div>
          </TabPanel>
        </TabsRoot>
      ) : null}

      {activeEvents.length > 0 ? (
        <div className="chart-events">
          <div className="chart-events-header">
            <h4>
              {isAscp ? 'ASCP 压力记录' : 'AI/HI 事件'}
              <ChipRoot variant="soft" size="sm">
                <ChipLabel>{activeEvents.length}</ChipLabel>
              </ChipRoot>
            </h4>
          </div>
          <div className="chart-events-scroll">
            <table>
              <thead>
                <tr>
                  <th>类型</th>
                  <th>时间</th>
                  {isAscp ? <th>IPAP</th> : null}
                  {isAscp ? <th>EPAP</th> : null}
                  {!isAscp ? <th>持续</th> : null}
                </tr>
              </thead>
              <tbody>
                {activeEvents.map((event, i) => (
                  <tr
                    key={`${event.sourceLabel}-${event.timestamp}-${i}`}
                    className={`chart-event-row${focusedIndex === i ? ' chart-event-active' : ''}`}
                    onClick={() => {
                      if (typeof event.secondsFromDayStart === 'number') {
                        setFocusedIndex(i === focusedIndex ? null : i);
                      }
                    }}
                  >
                    <td>
                      <ChipRoot variant="soft" size="sm" className={`event-badge--${event.sourceLabel}`}>
                        <ChipLabel>{event.sourceLabel.toUpperCase()}</ChipLabel>
                      </ChipRoot>
                    </td>
                    <td className="event-time">{event.timestamp ?? '-'}</td>
                    {isAscp ? (
                      <>
                        <td className="event-value">
                          {(event.value1 / 10).toFixed(1)} <span className="event-unit">cmH2O</span>
                        </td>
                        <td className="event-value">
                          {(event.value2 / 10).toFixed(1)} <span className="event-unit">cmH2O</span>
                        </td>
                      </>
                    ) : (
                      <td className="event-value">{event.value2}秒</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
