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
