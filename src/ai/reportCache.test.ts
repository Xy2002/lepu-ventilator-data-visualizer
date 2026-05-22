import { describe, it, expect, beforeEach } from 'vitest';
import { saveReport, loadReport, clearReport, reportCacheKey, type CachedReport, clearAllReports } from './reportCache';

import 'fake-indexeddb/auto';

describe('reportCache', () => {
  beforeEach(async () => {
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
