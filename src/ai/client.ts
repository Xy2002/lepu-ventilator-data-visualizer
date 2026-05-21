import type { AiRequest } from './providers';

export async function* streamChat(request: AiRequest): AsyncGenerator<string> {
  const response = await fetch(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(request.body),
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
          const text = extractContent(trimmed.slice(6));
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
    if (parsed.choices?.[0]?.delta?.content != null) {
      return parsed.choices[0].delta.content;
    }
    if (parsed.delta?.text != null) {
      return parsed.delta.text;
    }
    return null;
  } catch {
    return null;
  }
}
