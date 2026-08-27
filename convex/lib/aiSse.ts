// Decodes a provider's server-sent-event stream into text deltas. Pure and
// stateful-but-side-effect-free (it buffers partial lines), so it unit tests as
// a plain function over strings — same contract as the rest of `lib/ai.ts`.

import type { AiProvider } from './ai';

export type SSEEvent =
  | { type: 'delta'; text: string }
  | { type: 'error'; message: string }
  | { type: 'done' };

/**
 * Turns one `data:` payload into an event, or null when the payload carries
 * nothing we render (keepalives, block start/stop, usage deltas, and —
 * deliberately — Anthropic `thinking_delta`, matching how `parseLLMResponse`
 * already skips non-text blocks).
 */
function decodePayload(provider: AiProvider, payload: string): SSEEvent | null {
  if (payload === '[DONE]') return { type: 'done' };
  let json: unknown;
  try {
    json = JSON.parse(payload);
  } catch {
    // A provider that emits something unparseable should degrade to silence,
    // not tear down a generation that is otherwise working.
    return null;
  }

  if (provider === 'anthropic') {
    const e = json as {
      type?: string;
      delta?: { type?: string; text?: string };
      error?: { message?: string };
    };
    if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta') {
      return typeof e.delta.text === 'string' ? { type: 'delta', text: e.delta.text } : null;
    }
    if (e.type === 'error') return { type: 'error', message: e.error?.message ?? 'provider error' };
    if (e.type === 'message_stop') return { type: 'done' };
    return null;
  }

  const e = json as {
    error?: { message?: string };
    choices?: Array<{ delta?: { content?: string } }>;
  };
  if (e.error) return { type: 'error', message: e.error.message ?? 'provider error' };
  const text = e.choices?.[0]?.delta?.content;
  return typeof text === 'string' && text.length > 0 ? { type: 'delta', text } : null;
}

export function createSSEDecoder(provider: AiProvider): {
  push(chunk: string): SSEEvent[];
  flush(): SSEEvent[];
} {
  let buffer = '';

  const decodeLine = (raw: string): SSEEvent | null => {
    const line = raw.replace(/\r$/, '');
    // Blank separators, and `:` comments — OpenRouter sends
    // ": OPENROUTER PROCESSING" keepalives during long generations.
    if (!line || line.startsWith(':')) return null;
    // `event:` name lines are redundant: every provider we support repeats the
    // type inside the JSON payload, so we switch on that instead.
    if (!line.startsWith('data:')) return null;
    return decodePayload(provider, line.slice(5).trim());
  };

  return {
    push(chunk) {
      buffer += chunk;
      const lines = buffer.split('\n');
      // The last element is either empty (chunk ended on a newline) or a
      // partial line; either way it stays buffered for the next chunk.
      buffer = lines.pop() ?? '';
      const events: SSEEvent[] = [];
      for (const line of lines) {
        const event = decodeLine(line);
        if (event) events.push(event);
      }
      return events;
    },
    flush() {
      const rest = buffer;
      buffer = '';
      const event = rest ? decodeLine(rest) : null;
      return event ? [event] : [];
    },
  };
}
