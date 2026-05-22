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
