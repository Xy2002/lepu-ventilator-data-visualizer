import { useCallback, useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import { streamChat } from '../ai/client';
import { buildDataSummary, buildSystemPrompt } from '../ai/dataSummary';
import { buildOpenAIRequest, buildAnthropicRequest, type ProviderType } from '../ai/providers';
import { loadReport, reportCacheKey, saveReport } from '../ai/reportCache';
import { loadSettings, saveSettings, type AiSettings } from '../ai/settings';
import type { DaySummary } from '../types';

interface AiAnalysisPanelProps {
  summary: DaySummary | null;
  selectedDate: string | null;
  open: boolean;
  onToggle: () => void;
}

const PROVIDER_DEFAULTS: Record<ProviderType, { endpoint: string; model: string }> = {
  openai: { endpoint: 'https://api.openai.com/v1', model: 'gpt-4o' },
  anthropic: { endpoint: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514' },
};

type PanelStatus = 'idle' | 'streaming' | 'error';

export function AiAnalysisPanel({ summary, selectedDate, open, onToggle }: AiAnalysisPanelProps) {
  const [settings, setSettings] = useState<AiSettings>(loadSettings);
  const [status, setStatus] = useState<PanelStatus>('idle');
  const [report, setReport] = useState('');
  const [error, setError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!selectedDate || !settings.apiKey) {
      setReport('');
      setStatus('idle');
      return;
    }

    const key = reportCacheKey(selectedDate, settings.provider, settings.model, settings.customPrompt);
    loadReport(key).then((cached) => {
      if (cached) {
        setReport(cached.content);
        setStatus('idle');
      } else {
        setReport('');
        setStatus('idle');
      }
    });
  }, [selectedDate, settings.provider, settings.model, settings.customPrompt, settings.apiKey]);

  const generateReport = useCallback(async (force = false) => {
    if (!summary || !selectedDate || !settings.apiKey) return;

    const cacheKey = reportCacheKey(selectedDate, settings.provider, settings.model, settings.customPrompt);

    if (!force) {
      const cached = await loadReport(cacheKey);
      if (cached) {
        setReport(cached.content);
        setStatus('idle');
        return;
      }
    }

    const config = { provider: settings.provider, endpoint: settings.endpoint, apiKey: settings.apiKey, model: settings.model };
    const systemPrompt = buildSystemPrompt();
    const dataSummary = buildDataSummary(summary);
    const userMessage = settings.customPrompt
      ? `${dataSummary}\n\n---\n\n### 用户附加要求\n${settings.customPrompt}`
      : dataSummary;

    const request = settings.provider === 'anthropic'
      ? buildAnthropicRequest(config, userMessage, systemPrompt)
      : buildOpenAIRequest(config, userMessage, systemPrompt);

    setStatus('streaming');
    setReport('');
    setError('');

    abortRef.current = new AbortController();

    try {
      let fullText = '';
      for await (const chunk of streamChat(request, abortRef.current.signal)) {
        fullText += chunk;
        setReport(fullText);
      }

      await saveReport({
        key: cacheKey,
        date: selectedDate,
        content: fullText,
        createdAt: Date.now(),
        provider: settings.provider,
        model: settings.model,
      });

      setStatus('idle');
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message);
        setStatus('error');
      }
    }
  }, [summary, selectedDate, settings]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setStatus('idle');
  }, []);

  const updateSettings = useCallback((patch: Partial<AiSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const handleProviderChange = useCallback((provider: ProviderType) => {
    const defaults = PROVIDER_DEFAULTS[provider];
    updateSettings({
      provider,
      endpoint: defaults.endpoint,
      model: defaults.model,
    });
  }, [updateSettings]);

  if (!open) {
    return (
      <button type="button" className="ai-collapsed-trigger" onClick={onToggle}>
        <span className="ai-collapsed-icon">🤖</span>
        AI 分析
        <span className="ai-collapsed-hint">点击展开</span>
      </button>
    );
  }

  return (
    <section className="ai-panel">
      <div className="ai-panel-header">
        <h3>🤖 AI 分析</h3>
        <button type="button" className="ai-panel-close" onClick={onToggle} aria-label="收起面板">✕</button>
      </div>

      <button
        type="button"
        className="ai-settings-toggle"
        onClick={() => setShowSettings((s) => !s)}
      >
        {showSettings ? '▾' : '▸'} API 设置
        {!settings.apiKey && <span className="ai-settings-warning">（未配置）</span>}
      </button>

      {showSettings && (
        <div className="ai-settings-form">
          <label>
            Provider
            <select
              value={settings.provider}
              onChange={(e) => handleProviderChange(e.target.value as ProviderType)}
            >
              <option value="openai">OpenAI 兼容</option>
              <option value="anthropic">Anthropic 兼容</option>
            </select>
          </label>
          <label>
            Endpoint URL
            <input
              type="url"
              value={settings.endpoint}
              onChange={(e) => updateSettings({ endpoint: e.target.value })}
              placeholder={PROVIDER_DEFAULTS[settings.provider].endpoint}
            />
          </label>
          <label>
            API Key
            <input
              type="password"
              value={settings.apiKey}
              onChange={(e) => updateSettings({ apiKey: e.target.value })}
              placeholder="sk-..."
            />
          </label>
          <label>
            模型
            <input
              type="text"
              value={settings.model}
              onChange={(e) => updateSettings({ model: e.target.value })}
              placeholder={PROVIDER_DEFAULTS[settings.provider].model}
            />
          </label>
          <p className="ai-settings-notice">
            ⚠ API Key 存储在浏览器 localStorage 中。请勿在公共设备上保存密钥。
          </p>
        </div>
      )}

      <div className="ai-prompt-section">
        <details>
          <summary>自定义附加 Prompt</summary>
          <textarea
            value={settings.customPrompt}
            onChange={(e) => updateSettings({ customPrompt: e.target.value })}
            placeholder="例如：重点关注 AHI 事件和压力变化趋势..."
            rows={3}
          />
        </details>
      </div>

      <div className="ai-actions">
        {status === 'streaming' ? (
          <button type="button" className="ai-btn ai-btn-stop" onClick={handleStop}>
            停止生成
          </button>
        ) : (
          <>
            <button
              type="button"
              className="ai-btn ai-btn-primary"
              disabled={!settings.apiKey || !summary}
              onClick={() => generateReport(false)}
            >
              生成分析
            </button>
            {report && (
              <button
                type="button"
                className="ai-btn ai-btn-secondary"
                disabled={!settings.apiKey || !summary}
                onClick={() => generateReport(true)}
              >
                重新生成
              </button>
            )}
          </>
        )}
      </div>

      {error && <div className="ai-error">{error}</div>}

      <div className="ai-report">
        {status === 'streaming' && !report && (
          <div className="ai-loading">
            <div className="ai-loading-track" />
            <span>正在生成分析报告...</span>
          </div>
        )}
        {report && (
          <div className="ai-report-content">
            <Markdown rehypePlugins={[rehypeHighlight]}>{report}</Markdown>
          </div>
        )}
        {!report && status === 'idle' && !error && (
          <p className="ai-empty">点击「生成分析」查看当日数据的 AI 分析报告。</p>
        )}
      </div>
    </section>
  );
}
