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
      body: null,
    }));

    const request = buildOpenAIRequest(baseConfig, 'test', 'system');
    await expect(async () => {
      for await (const _ of streamChat(request)) { /* consume */ }
    }).rejects.toThrow('API request failed (401): Unauthorized');
  });
});
