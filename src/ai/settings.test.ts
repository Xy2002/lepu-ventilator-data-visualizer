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
