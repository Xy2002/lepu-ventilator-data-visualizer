# AI Analysis Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a right-side sliding AI analysis panel that sends daily ventilator data summaries to OpenAI/Anthropic-compatible APIs, renders streaming Markdown reports, and caches results in IndexedDB.

**Architecture:** A thin provider abstraction (`src/ai/`) handles OpenAI vs Anthropic request formatting. The main App.tsx gains an `AiAnalysisPanel` component that slides in from the right (~400px). API settings are stored in localStorage; generated reports are cached in IndexedDB keyed by `${date}_${provider}_${model}_${promptHash}`. The panel renders streaming responses as Markdown using `react-markdown`.

**Tech Stack:** Native `fetch` + `ReadableStream` for streaming, `react-markdown` + `rehype-highlight` for rendering, IndexedDB for report cache (following existing `importCache.ts` patterns), localStorage for settings.

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/ai/providers.ts` | Provider types (OpenAI/Anthropic), request body builders |
| Create | `src/ai/client.ts` | Streaming fetch client, returns `AsyncIterable<string>` |
| Create | `src/ai/settings.ts` | Read/write API settings to localStorage |
| Create | `src/ai/dataSummary.ts` | Convert `DaySummary` + events to structured text prompt |
| Create | `src/ai/reportCache.ts` | IndexedDB read/write for cached reports |
| Create | `src/ai/providers.test.ts` | Tests for provider request building |
| Create | `src/ai/dataSummary.test.ts` | Tests for data summary generation |
| Create | `src/ai/client.test.ts` | Tests for streaming client (mocked fetch) |
| Create | `src/ai/settings.test.ts` | Tests for settings persistence |
| Create | `src/ai/reportCache.test.ts` | Tests for report cache |
| Create | `src/components/AiAnalysisPanel.tsx` | Right-side panel with settings, prompt, report |
| Create | `src/components/AiAnalysisPanel.test.tsx` | Integration test for the panel |
| Modify | `src/App.tsx` | Add panel state, toggle button, pass props |
| Modify | `src/App.css` | Panel slide-in styles, markdown styles |
| Modify | `package.json` | Add `react-markdown`, `rehype-highlight` |

---

### Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install react-markdown and rehype-highlight**

```bash
cd lepu-ventilator-data-visualizer && npm install react-markdown rehype-highlight
```

- [ ] **Step 2: Verify installation**

```bash
cd lepu-ventilator-data-visualizer && npm ls react-markdown rehype-highlight
```

Expected: Both packages listed with versions.

- [ ] **Step 3: Commit**

```bash
cd lepu-ventilator-data-visualizer && git add package.json package-lock.json && git commit -m "chore: add react-markdown and rehype-highlight dependencies"
```

---

### Task 2: Provider types and request builders

**Files:**
- Create: `src/ai/providers.ts`
- Create: `src/ai/providers.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/ai/providers.test.ts
import { describe, it, expect } from 'vitest';
import { buildOpenAIRequest, buildAnthropicRequest, type AiProviderConfig } from './providers';

const baseConfig: AiProviderConfig = {
  provider: 'openai',
  endpoint: 'https://api.openai.com/v1',
  apiKey: 'sk-test',
  model: 'gpt-4o',
};

describe('buildOpenAIRequest', () => {
  it('builds a valid OpenAI chat completions request', () => {
    const result = buildOpenAIRequest(baseConfig, 'Hello', 'System prompt');
    expect(result.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(result.body.model).toBe('gpt-4o');
    expect(result.body.stream).toBe(true);
    expect(result.body.messages).toEqual([
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'Hello' },
    ]);
    expect(result.headers['Content-Type']).toBe('application/json');
    expect(result.headers['Authorization']).toBe('Bearer sk-test');
  });

  it('handles trailing slash in endpoint', () => {
    const result = buildOpenAIRequest(
      { ...baseConfig, endpoint: 'https://api.openai.com/v1/' },
      'Hello',
      'System prompt',
    );
    expect(result.url).toBe('https://api.openai.com/v1/chat/completions');
  });
});

describe('buildAnthropicRequest', () => {
  const anthropicConfig: AiProviderConfig = {
    provider: 'anthropic',
    endpoint: 'https://api.anthropic.com',
    apiKey: 'sk-ant-test',
    model: 'claude-sonnet-4-20250514',
  };

  it('builds a valid Anthropic messages request', () => {
    const result = buildAnthropicRequest(anthropicConfig, 'Hello', 'System prompt');
    expect(result.url).toBe('https://api.anthropic.com/v1/messages');
    expect(result.body.model).toBe('claude-sonnet-4-20250514');
    expect(result.body.stream).toBe(true);
    expect(result.body.max_tokens).toBe(8192);
    expect(result.body.messages).toEqual([
      { role: 'user', content: 'Hello' },
    ]);
    expect(result.body.system).toBe('System prompt');
    expect(result.headers['Content-Type']).toBe('application/json');
    expect(result.headers['x-api-key']).toBe('sk-ant-test');
    expect(result.headers['anthropic-version']).toBe('2023-06-01');
  });

  it('handles trailing slash in endpoint', () => {
    const result = buildAnthropicRequest(
      { ...anthropicConfig, endpoint: 'https://api.anthropic.com/' },
      'Hello',
      'System prompt',
    );
    expect(result.url).toBe('https://api.anthropic.com/v1/messages');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd lepu-ventilator-data-visualizer && npx vitest run src/ai/providers.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```typescript
// src/ai/providers.ts
export type ProviderType = 'openai' | 'anthropic';

export interface AiProviderConfig {
  provider: ProviderType;
  endpoint: string;
  apiKey: string;
  model: string;
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIRequestBody {
  model: string;
  stream: boolean;
  messages: OpenAIMessage[];
}

interface AnthropicRequestBody {
  model: string;
  stream: boolean;
  max_tokens: number;
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
}

export interface AiRequest {
  url: string;
  headers: Record<string, string>;
  body: OpenAIRequestBody | AnthropicRequestBody;
}

function normalizeEndpoint(endpoint: string, suffix: string) {
  return `${endpoint.replace(/\/+$/, '')}${suffix}`;
}

export function buildOpenAIRequest(
  config: AiProviderConfig,
  userMessage: string,
  systemPrompt: string,
): AiRequest {
  return {
    url: normalizeEndpoint(config.endpoint, '/chat/completions'),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: {
      model: config.model,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    },
  };
}

export function buildAnthropicRequest(
  config: AiProviderConfig,
  userMessage: string,
  systemPrompt: string,
): AiRequest {
  return {
    url: normalizeEndpoint(config.endpoint, '/v1/messages'),
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: {
      model: config.model,
      stream: true,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userMessage },
      ],
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd lepu-ventilator-data-visualizer && npx vitest run src/ai/providers.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd lepu-ventilator-data-visualizer && git add src/ai/providers.ts src/ai/providers.test.ts && git commit -m "feat: add AI provider types and request builders for OpenAI/Anthropic"
```

---

### Task 3: Streaming API client

**Files:**
- Create: `src/ai/client.ts`
- Create: `src/ai/client.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/ai/client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { streamChat } from './client';
import { buildOpenAIRequest, buildAnthropicRequest, type AiProviderConfig } from './providers';

const baseConfig: AiProviderConfig = {
  provider: 'openai',
  endpoint: 'https://api.openai.com/v1',
  apiKey: 'sk-test',
  model: 'gpt-4o',
};

function mockFetchWithSSE(lines: string[]) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(`${line}\n`));
      }
      controller.close();
    },
  });

  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    body: stream,
  });
}

describe('streamChat', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('streams OpenAI SSE chunks as concatenated text', async () => {
    const mockFetch = mockFetchWithSSE([
      'data: {"choices":[{"delta":{"content":"Hello "}}]}',
      'data: {"choices":[{"delta":{"content":"World"}}]}',
      'data: [DONE]',
    ]);
    vi.stubGlobal('fetch', mockFetch);

    const request = buildOpenAIRequest(baseConfig, 'test', 'system');
    const chunks: string[] = [];
    for await (const chunk of streamChat(request)) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['Hello ', 'World']);
    expect(mockFetch).toHaveBeenCalledWith(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: expect.any(AbortSignal),
    });
  });

  it('streams Anthropic SSE chunks', async () => {
    const anthropicConfig: AiProviderConfig = {
      provider: 'anthropic',
      endpoint: 'https://api.anthropic.com',
      apiKey: 'sk-ant-test',
      model: 'claude-sonnet-4-20250514',
    };

    const mockFetch = mockFetchWithSSE([
      'event: content_block_delta',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello "}}',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"World"}}',
      'event: message_stop',
      'data: {"type":"message_stop"}',
    ]);
    vi.stubGlobal('fetch', mockFetch);

    const request = buildAnthropicRequest(anthropicConfig, 'test', 'system');
    const chunks: string[] = [];
    for await (const chunk of streamChat(request)) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['Hello ', 'World']);
  });

  it('throws on non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: () => Promise.resolve('Invalid API key'),
    }));

    const request = buildOpenAIRequest(baseConfig, 'test', 'system');
    await expect(async () => {
      for await (const _ of streamChat(request)) { /* consume */ }
    }).rejects.toThrow('API request failed (401): Unauthorized');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd lepu-ventilator-data-visualizer && npx vitest run src/ai/client.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```typescript
// src/ai/client.ts
import type { AiRequest } from './providers';

export async function* streamChat(request: AiRequest): AsyncGenerator<string> {
  const controller = new AbortController();
  const response = await fetch(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(request.body),
    signal: controller.signal,
  });

  if (!response.ok) {
    throw new Error(`API request failed (${response.status}): ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error('Response body is not available — streaming not supported');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('event:')) continue;
        if (trimmed === 'data: [DONE]') return;

        if (trimmed.startsWith('data: ')) {
          const json = trimmed.slice(6);
          const text = extractContent(json);
          if (text) yield text;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function extractContent(jsonString: string): string | null {
  try {
    const parsed = JSON.parse(jsonString);
    // OpenAI format: choices[0].delta.content
    if (parsed.choices?.[0]?.delta?.content != null) {
      return parsed.choices[0].delta.content;
    }
    // Anthropic format: delta.text
    if (parsed.delta?.text != null) {
      return parsed.delta.text;
    }
    return null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd lepu-ventilator-data-visualizer && npx vitest run src/ai/client.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd lepu-ventilator-data-visualizer && git add src/ai/client.ts src/ai/client.test.ts && git commit -m "feat: add streaming API client with OpenAI/Anthropic SSE parsing"
```

---

### Task 4: Settings persistence (localStorage)

**Files:**
- Create: `src/ai/settings.ts`
- Create: `src/ai/settings.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/ai/settings.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { loadSettings, saveSettings, type AiSettings } from './settings';

describe('loadSettings / saveSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns defaults when no settings saved', () => {
    const settings = loadSettings();
    expect(settings).toEqual({
      provider: 'openai',
      endpoint: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-4o',
      customPrompt: '',
    });
  });

  it('round-trips settings through localStorage', () => {
    const settings: AiSettings = {
      provider: 'anthropic',
      endpoint: 'https://api.anthropic.com',
      apiKey: 'sk-ant-test',
      model: 'claude-sonnet-4-20250514',
      customPrompt: 'Focus on AHI events',
    };
    saveSettings(settings);
    expect(loadSettings()).toEqual(settings);
  });

  it('gracefully handles corrupt JSON', () => {
    localStorage.setItem('ai-analysis-settings', 'not-json');
    expect(loadSettings()).toEqual({
      provider: 'openai',
      endpoint: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-4o',
      customPrompt: '',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd lepu-ventilator-data-visualizer && npx vitest run src/ai/settings.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```typescript
// src/ai/settings.ts
import type { ProviderType } from './providers';

export interface AiSettings {
  provider: ProviderType;
  endpoint: string;
  apiKey: string;
  model: string;
  customPrompt: string;
}

const STORAGE_KEY = 'ai-analysis-settings';

const DEFAULTS: AiSettings = {
  provider: 'openai',
  endpoint: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o',
  customPrompt: '',
};

export function loadSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: AiSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd lepu-ventilator-data-visualizer && npx vitest run src/ai/settings.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd lepu-ventilator-data-visualizer && git add src/ai/settings.ts src/ai/settings.test.ts && git commit -m "feat: add AI settings persistence to localStorage"
```

---

### Task 5: Data summary generator

**Files:**
- Create: `src/ai/dataSummary.ts`
- Create: `src/ai/dataSummary.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/ai/dataSummary.test.ts
import { describe, it, expect } from 'vitest';
import { buildDataSummary, buildSystemPrompt } from './dataSummary';
import type { DaySummary } from '../types';

const sampleSummary: DaySummary = {
  date: '2026-05-21',
  startTime: '2026-05-20 22:30:00',
  endTime: '2026-05-21 06:15:00',
  useDurationSeconds: 27900,
  useSessions: [
    { startTime: '2026-05-20 22:30:00', endTime: '2026-05-21 02:00:00', durationSeconds: 12600 },
    { startTime: '2026-05-21 04:00:00', endTime: '2026-05-21 06:15:00', durationSeconds: 8100 },
  ],
  eventCounts: { ai: 3, hi: 5, ascp: 4 },
  signalPresence: { flow: true, pressure: true, real_pres: true, real_flow: true },
  sampleCounts: { flow: 125000, pressure: 125000, real_pres: 125000, real_flow: 125000 },
  pressureRange: { min: 4, max: 15 },
  missingFiles: [],
  warnings: [],
};

describe('buildDataSummary', () => {
  it('produces a structured text summary of day data', () => {
    const result = buildDataSummary(sampleSummary);
    expect(result).toContain('## 呼吸机数据日报 — 2026-05-21');
    expect(result).toContain('22:30:00 至 02:00:00');
    expect(result).toContain('04:00:00 至 06:15:00');
    expect(result).toContain('7h 45m');
    expect(result).toContain('AHI 相关事件: ai 3 次, hi 5 次, ascp 4 次');
    expect(result).toContain('压力范围: 4 - 15 cmH2O');
    expect(result).toContain('流量波形: ✓ (125,000 采样点)');
  });

  it('handles minimal data gracefully', () => {
    const minimal: DaySummary = {
      date: '2026-05-21',
      startTime: null,
      endTime: null,
      useDurationSeconds: null,
      useSessions: [],
      eventCounts: {},
      signalPresence: {},
      sampleCounts: {},
      pressureRange: null,
      missingFiles: ['flow', 'pressure', 'real_pres', 'real_flow'],
      warnings: [],
    };
    const result = buildDataSummary(minimal);
    expect(result).toContain('使用时段: 无数据');
    expect(result).toContain('压力范围: 无数据');
    expect(result).toContain('缺失文件: flow, pressure, real_pres, real_flow');
  });
});

describe('buildSystemPrompt', () => {
  it('returns a system prompt for medical data analysis', () => {
    const result = buildSystemPrompt();
    expect(result).toContain('呼吸机');
    expect(result).toContain('CPAP');
    expect(result.length).toBeGreaterThan(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd lepu-ventilator-data-visualizer && npx vitest run src/ai/dataSummary.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```typescript
// src/ai/dataSummary.ts
import type { DaySummary } from '../types';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, '0')}m`;
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
  lines.push('');

  // Usage info
  lines.push('### 使用时段');
  if (summary.useSessions.length > 0) {
    lines.push(`使用时长: ${formatDuration(summary.useSessions.reduce((t, s) => t + s.durationSeconds, 0))}`);
    lines.push(`使用会话数: ${summary.useSessions.length}`);
    for (let i = 0; i < summary.useSessions.length; i++) {
      const s = summary.useSessions[i];
      lines.push(`  - 会话 ${i + 1}: ${s.startTime} 至 ${s.endTime} (${formatDuration(s.durationSeconds)})`);
    }
  } else {
    lines.push('使用时段: 无数据');
    if (summary.startTime && summary.endTime) {
      lines.push(`记录时间范围: ${summary.startTime} 至 ${summary.endTime}`);
    }
  }
  lines.push('');

  // Events
  lines.push('### 事件统计');
  const eventEntries = Object.entries(summary.eventCounts);
  if (eventEntries.length > 0) {
    const total = eventEntries.reduce((sum, [, count]) => sum + count, 0);
    lines.push(`AHI 相关事件总计: ${total} 次`);
    for (const [label, count] of eventEntries) {
      const names: Record<string, string> = {
        ai: '中心性呼吸暂停 (AI)',
        hi: '阻塞性呼吸暂停 (HI)',
        ascp: '自动压力调节 (ASCP)',
        usetime: '使用时间记录',
      };
      lines.push(`  - ${names[label] ?? label}: ${count} 次`);
    }
  } else {
    lines.push('无事件记录');
  }
  lines.push('');

  // Pressure
  lines.push('### 压力数据');
  if (summary.pressureRange) {
    lines.push(`压力范围: ${summary.pressureRange.min} - ${summary.pressureRange.max} cmH2O`);
  } else {
    lines.push('压力范围: 无数据');
  }
  lines.push('');

  // Signal integrity
  lines.push('### 信号完整性');
  const signalLabels: Record<string, string> = {
    flow: '流量波形',
    pressure: '压力波形',
    real_pres: '实际压力',
    real_flow: '实际气流',
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
  lines.push('');

  // Missing files
  if (summary.missingFiles.length > 0) {
    lines.push(`### 缺失文件`);
    lines.push(`缺失文件: ${summary.missingFiles.join(', ')}`);
    lines.push('');
  }

  // Warnings
  if (summary.warnings.length > 0) {
    lines.push('### 警告');
    for (const w of summary.warnings) {
      lines.push(`- ${w}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd lepu-ventilator-data-visualizer && npx vitest run src/ai/dataSummary.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd lepu-ventilator-data-visualizer && git add src/ai/dataSummary.ts src/ai/dataSummary.test.ts && git commit -m "feat: add data summary generator for AI analysis prompts"
```

---

### Task 6: Report cache (IndexedDB)

**Files:**
- Create: `src/ai/reportCache.ts`
- Create: `src/ai/reportCache.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/ai/reportCache.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { saveReport, loadReport, clearReport, reportCacheKey, type CachedReport } from './reportCache';

// Mock IndexedDB for test environment
import 'fake-indexeddb/auto';

describe('reportCache', () => {
  beforeEach(async () => {
    const { clearAllReports } = await import('./reportCache');
    await clearAllReports();
  });

  it('round-trips a report through IndexedDB', async () => {
    const key = reportCacheKey('2026-05-21', 'openai', 'gpt-4o', '');
    const report: CachedReport = {
      key,
      date: '2026-05-21',
      content: '# AI 分析报告\n\n这是一个测试报告。',
      createdAt: Date.now(),
      provider: 'openai',
      model: 'gpt-4o',
    };

    await saveReport(report);
    const loaded = await loadReport(key);
    expect(loaded).toEqual(report);
  });

  it('returns null for non-existent report', async () => {
    const key = reportCacheKey('2026-05-21', 'openai', 'gpt-4o', '');
    const loaded = await loadReport(key);
    expect(loaded).toBeNull();
  });

  it('generates different keys for different prompts', () => {
    const key1 = reportCacheKey('2026-05-21', 'openai', 'gpt-4o', 'prompt A');
    const key2 = reportCacheKey('2026-05-21', 'openai', 'gpt-4o', 'prompt B');
    expect(key1).not.toBe(key2);
  });

  it('clears a specific report', async () => {
    const key = reportCacheKey('2026-05-21', 'openai', 'gpt-4o', '');
    const report: CachedReport = {
      key,
      date: '2026-05-21',
      content: 'test',
      createdAt: Date.now(),
      provider: 'openai',
      model: 'gpt-4o',
    };
    await saveReport(report);
    await clearReport(key);
    const loaded = await loadReport(key);
    expect(loaded).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd lepu-ventilator-data-visualizer && npx vitest run src/ai/reportCache.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Install fake-indexeddb dev dependency**

```bash
cd lepu-ventilator-data-visualizer && npm install --save-dev fake-indexeddb
```

- [ ] **Step 4: Write implementation**

```typescript
// src/ai/reportCache.ts
const DB_NAME = 'ventilator-ai-report-cache';
const DB_VERSION = 1;
const STORE = 'reports';

export interface CachedReport {
  key: string;
  date: string;
  content: string;
  createdAt: number;
  provider: string;
  model: string;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    request.onerror = () => reject(request.error ?? new Error('Failed to open report cache'));
    request.onsuccess = () => resolve(request.result);
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    request.onsuccess = () => resolve(request.result);
  });
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function reportCacheKey(date: string, provider: string, model: string, customPrompt: string): string {
  const promptPart = customPrompt ? `_${simpleHash(customPrompt)}` : '';
  return `${date}_${provider}_${model}${promptPart}`;
}

export async function saveReport(report: CachedReport): Promise<void> {
  const db = await openDatabase();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.put(report);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function loadReport(key: string): Promise<CachedReport | null> {
  const db = await openDatabase();
  try {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const result = await requestResult<CachedReport | undefined>(store.get(key));
    return result ?? null;
  } finally {
    db.close();
  }
}

export async function clearReport(key: string): Promise<void> {
  const db = await openDatabase();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.delete(key);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function clearAllReports(): Promise<void> {
  const db = await openDatabase();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd lepu-ventilator-data-visualizer && npx vitest run src/ai/reportCache.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
cd lepu-ventilator-data-visualizer && git add src/ai/reportCache.ts src/ai/reportCache.test.ts package.json package-lock.json && git commit -m "feat: add IndexedDB report cache for AI analysis results"
```

---

### Task 7: AI Analysis Panel component

**Files:**
- Create: `src/components/AiAnalysisPanel.tsx`

This is the main UI component. No separate test file here — the panel integrates all AI modules, so we test it via the existing App.test.tsx patterns later. Focus on getting the component correct first.

- [ ] **Step 1: Write the component**

```tsx
// src/components/AiAnalysisPanel.tsx
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
  onClose: () => void;
}

const PROVIDER_DEFAULTS: Record<ProviderType, { endpoint: string; model: string }> = {
  openai: { endpoint: 'https://api.openai.com/v1', model: 'gpt-4o' },
  anthropic: { endpoint: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514' },
};

type PanelStatus = 'idle' | 'loading' | 'streaming' | 'error';

export function AiAnalysisPanel({ summary, selectedDate, open, onClose }: AiAnalysisPanelProps) {
  const [settings, setSettings] = useState<AiSettings>(loadSettings);
  const [status, setStatus] = useState<PanelStatus>('idle');
  const [report, setReport] = useState('');
  const [error, setError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Try to load cached report when date changes
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

    // Check cache unless forced
    if (!force) {
      const cached = await loadReport(cacheKey);
      if (cached) {
        setReport(cached.content);
        setStatus('idle');
        return;
      }
    }

    // Build request
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
      for await (const chunk of streamChat(request)) {
        fullText += chunk;
        setReport(fullText);
      }

      // Cache the result
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

  if (!open) return null;

  return (
    <aside className="ai-panel">
      <div className="ai-panel-header">
        <h3>AI 分析</h3>
        <button type="button" className="ai-panel-close" onClick={onClose} aria-label="关闭面板">✕</button>
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
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd lepu-ventilator-data-visualizer && git add src/components/AiAnalysisPanel.tsx && git commit -m "feat: add AI analysis panel component with streaming and caching"
```

---

### Task 8: Integrate into App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add imports and state for the AI panel**

In `src/App.tsx`, add the import at the top after existing imports:

```typescript
import { AiAnalysisPanel } from './components/AiAnalysisPanel';
```

- [ ] **Step 2: Add panel open state**

After the existing `const [indexProgress, setIndexProgress] = useState<IndexProgress | null>(null);` line, add:

```typescript
const [aiPanelOpen, setAiPanelOpen] = useState(false);
```

- [ ] **Step 3: Add AI analysis button to the header**

In the `<header className="top-bar">` section, add a button after the `<ImportPanel>` component:

```tsx
<div className="header-actions">
  {dataset && summary ? (
    <button
      type="button"
      className={`ai-toggle-btn${aiPanelOpen ? ' ai-toggle-btn-active' : ''}`}
      onClick={() => setAiPanelOpen((o) => !o)}
    >
      AI 分析
    </button>
  ) : null}
  <ImportPanel onImport={handleImport} disabled={isIndexing} />
</div>
```

Replace the existing `<ImportPanel onImport={handleImport} disabled={isIndexing} />` in the header with the above block.

- [ ] **Step 4: Add the panel and adjust workbench layout**

Replace the workbench section. Change `<div className="workbench">` to include the panel:

```tsx
<div className={`workbench${aiPanelOpen ? ' workbench--with-ai' : ''}`}>
  <DateNavigator dataset={dataset} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
  <section className="main-panel">
    {/* existing main-panel content unchanged */}
  </section>
  <AiAnalysisPanel
    summary={summary}
    selectedDate={selectedDate}
    open={aiPanelOpen}
    onClose={() => setAiPanelOpen(false)}
  />
</div>
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd lepu-ventilator-data-visualizer && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
cd lepu-ventilator-data-visualizer && git add src/App.tsx && git commit -m "feat: integrate AI analysis panel into main app layout"
```

---

### Task 9: Add CSS styles for the panel

**Files:**
- Modify: `src/App.css`

- [ ] **Step 1: Add all AI panel styles**

Append the following to `src/App.css`:

```css
/* AI Analysis Panel */
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ai-toggle-btn {
  min-height: 36px;
  padding: 0 16px;
  border: 0;
  border-radius: 6px;
  color: #ffffff;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  box-shadow: rgba(0, 0, 0, 0.12) 0 2px 6px -4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 140ms ease, transform 140ms ease;
}

.ai-toggle-btn:hover {
  opacity: 0.92;
  transform: translateY(-1px);
}

.ai-toggle-btn-active {
  background: linear-gradient(135deg, #5a67d8 0%, #6b46c1 100%);
}

.workbench--with-ai {
  grid-template-columns: 304px minmax(0, 1fr) 400px;
}

.ai-panel {
  position: sticky;
  top: 88px;
  align-self: start;
  max-height: calc(100vh - 104px);
  display: flex;
  flex-direction: column;
  padding: 16px;
  border-radius: 8px;
  background: var(--surface);
  box-shadow: var(--card-shadow);
  overflow: hidden;
}

.ai-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.ai-panel-header h3 {
  margin: 0;
  color: var(--text);
  font-size: 18px;
  font-weight: 600;
}

.ai-panel-close {
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  color: var(--muted);
  background: transparent;
  font-size: 16px;
  cursor: pointer;
  transition: background 140ms ease;
}

.ai-panel-close:hover {
  background: var(--surface-subtle);
}

.ai-settings-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 0;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.ai-settings-warning {
  color: var(--red);
  font-weight: 400;
}

.ai-settings-form {
  display: grid;
  gap: 10px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.ai-settings-form label {
  display: grid;
  gap: 4px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 500;
}

.ai-settings-form input,
.ai-settings-form select {
  min-height: 34px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  color: var(--text);
  background: var(--surface);
  box-shadow: var(--line-light);
  font-size: 13px;
}

.ai-settings-notice {
  margin: 4px 0 0;
  color: var(--faint);
  font-size: 11px;
  line-height: 1.45;
}

.ai-prompt-section {
  padding: 10px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.ai-prompt-section summary {
  color: var(--muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.ai-prompt-section textarea {
  width: 100%;
  margin-top: 8px;
  padding: 8px 10px;
  border: 0;
  border-radius: 6px;
  color: var(--text);
  background: var(--surface);
  box-shadow: var(--line-light);
  font-family: inherit;
  font-size: 13px;
  resize: vertical;
}

.ai-prompt-section textarea:focus {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.ai-actions {
  display: flex;
  gap: 8px;
  padding: 12px 0;
}

.ai-btn {
  min-height: 34px;
  padding: 0 14px;
  border: 0;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 140ms ease, transform 140ms ease;
}

.ai-btn:disabled {
  color: #808080;
  background: #f5f5f5;
  cursor: not-allowed;
  transform: none;
}

.ai-btn-primary {
  color: #ffffff;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  box-shadow: rgba(0, 0, 0, 0.12) 0 2px 6px -4px;
}

.ai-btn-primary:hover:not(:disabled) {
  opacity: 0.92;
  transform: translateY(-1px);
}

.ai-btn-secondary {
  color: var(--text);
  background: var(--surface);
  box-shadow: var(--line-light);
}

.ai-btn-secondary:hover:not(:disabled) {
  background: var(--surface-subtle);
  transform: translateY(-1px);
}

.ai-btn-stop {
  color: #ffffff;
  background: var(--red);
}

.ai-btn-stop:hover {
  opacity: 0.9;
}

.ai-error {
  padding: 8px 10px;
  border-radius: 6px;
  color: #a32722;
  background: #fff1f0;
  font-size: 13px;
}

.ai-report {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-top: 8px;
}

.ai-empty {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
}

.ai-loading {
  display: grid;
  gap: 8px;
  padding: 12px 0;
  color: var(--muted);
  font-size: 13px;
}

.ai-loading-track {
  height: 3px;
  overflow: hidden;
  border-radius: 9999px;
  background: #ebebeb;
}

.ai-loading-track::before {
  display: block;
  width: 42%;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(135deg, #667eea, #764ba2);
  content: "";
  animation: chart-loading-slide 760ms ease-in-out infinite;
}

.ai-report-content {
  color: var(--text);
  font-size: 14px;
  line-height: 1.7;
}

.ai-report-content h1,
.ai-report-content h2,
.ai-report-content h3 {
  color: var(--text);
  font-weight: 600;
  line-height: 1.3;
}

.ai-report-content h1 { font-size: 20px; margin: 16px 0 8px; }
.ai-report-content h2 { font-size: 17px; margin: 14px 0 6px; }
.ai-report-content h3 { font-size: 15px; margin: 12px 0 4px; }

.ai-report-content h1:first-child,
.ai-report-content h2:first-child {
  margin-top: 0;
}

.ai-report-content p {
  margin: 8px 0;
}

.ai-report-content ul,
.ai-report-content ol {
  margin: 8px 0;
  padding-left: 20px;
}

.ai-report-content li {
  margin: 4px 0;
}

.ai-report-content strong {
  font-weight: 600;
}

.ai-report-content table {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0;
}

.ai-report-content th,
.ai-report-content td {
  padding: 6px 8px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  font-size: 13px;
}

.ai-report-content th {
  background: var(--surface-subtle);
  font-weight: 500;
}

.ai-report-content code {
  padding: 2px 5px;
  border-radius: 4px;
  background: var(--surface-subtle);
  font-family: "Geist Mono", ui-monospace, monospace;
  font-size: 12px;
}

.ai-report-content pre {
  margin: 8px 0;
  padding: 12px;
  border-radius: 6px;
  background: var(--surface-subtle);
  overflow-x: auto;
}

.ai-report-content pre code {
  padding: 0;
  background: transparent;
}

.ai-report-content blockquote {
  margin: 8px 0;
  padding: 8px 12px;
  border-left: 3px solid var(--blue);
  color: var(--muted);
}

@media (max-width: 1200px) {
  .workbench--with-ai {
    grid-template-columns: 1fr;
  }

  .ai-panel {
    position: static;
    max-height: none;
  }
}
```

- [ ] **Step 2: Verify the app builds**

```bash
cd lepu-ventilator-data-visualizer && npx vite build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd lepu-ventilator-data-visualizer && git add src/App.css && git commit -m "feat: add AI analysis panel styles with slide-in layout and markdown rendering"
```

---

### Task 10: Panel integration test

**Files:**
- Create: `src/components/AiAnalysisPanel.test.tsx`

- [ ] **Step 1: Write the integration test**

```typescript
// src/components/AiAnalysisPanel.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AiAnalysisPanel } from './AiAnalysisPanel';
import type { DaySummary } from '../types';

const mockSummary: DaySummary = {
  date: '2026-05-21',
  startTime: '2026-05-20 22:30:00',
  endTime: '2026-05-21 06:15:00',
  useDurationSeconds: 27900,
  useSessions: [
    { startTime: '2026-05-20 22:30:00', endTime: '2026-05-21 02:00:00', durationSeconds: 12600 },
  ],
  eventCounts: { ai: 3, hi: 5 },
  signalPresence: { flow: true, pressure: true, real_pres: true, real_flow: true },
  sampleCounts: { flow: 1000 },
  pressureRange: { min: 4, max: 15 },
  missingFiles: [],
  warnings: [],
};

describe('AiAnalysisPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <AiAnalysisPanel summary={mockSummary} selectedDate="2026-05-21" open={false} onClose={() => {}} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders the panel with header when open', () => {
    render(
      <AiAnalysisPanel summary={mockSummary} selectedDate="2026-05-21" open={true} onClose={() => {}} />,
    );
    expect(screen.getByText('AI 分析')).toBeTruthy();
    expect(screen.getByText('生成分析')).toBeTruthy();
  });

  it('calls onClose when close button clicked', async () => {
    const onClose = vi.fn();
    render(
      <AiAnalysisPanel summary={mockSummary} selectedDate="2026-05-21" open={true} onClose={onClose} />,
    );
    await userEvent.click(screen.getByLabelText('关闭面板'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows settings warning when API key not configured', () => {
    render(
      <AiAnalysisPanel summary={mockSummary} selectedDate="2026-05-21" open={true} onClose={() => {}} />,
    );
    expect(screen.getByText('（未配置）')).toBeTruthy();
  });

  it('disables generate button when API key is empty', () => {
    render(
      <AiAnalysisPanel summary={mockSummary} selectedDate="2026-05-21" open={true} onClose={() => {}} />,
    );
    expect(screen.getByText('生成分析').closest('button')?.disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd lepu-ventilator-data-visualizer && npx vitest run src/components/AiAnalysisPanel.test.tsx
```

Expected: PASS (4+ tests).

- [ ] **Step 3: Commit**

```bash
cd lepu-ventilator-data-visualizer && git add src/components/AiAnalysisPanel.test.tsx && git commit -m "test: add integration tests for AI analysis panel"
```

---

### Task 11: Run full test suite and build

**Files:**
- None (verification only)

- [ ] **Step 1: Run all tests**

```bash
cd lepu-ventilator-data-visualizer && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 2: Run production build**

```bash
cd lepu-ventilator-data-visualizer && npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 3: Verify dev server starts**

```bash
cd lepu-ventilator-data-visualizer && timeout 10 npx vite --host 127.0.0.1 || true
```

Expected: Server starts without errors (will be killed by timeout).
