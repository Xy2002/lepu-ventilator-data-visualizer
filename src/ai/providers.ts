export type ProviderType = 'openai' | 'anthropic';

export interface AiProviderConfig {
  provider: ProviderType;
  endpoint: string;
  apiKey: string;
  model: string;
}

export interface AiRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
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
