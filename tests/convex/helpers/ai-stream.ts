// Shared fixtures for `/ai/stream` tests. Lives in its own module (not inlined
// in a `.test.ts` file) because both `ai-stream.test.ts` (Task 5) and Task 6's
// suite need the same `post` / `readEvents` / `mockStreamingProvider` helpers;
// Vitest only collects `tests/**/*.test.ts`, so a plain `.ts` module here is
// never picked up as a suite of its own.

import { vi } from 'vitest';

/** Reads an NDJSON response body into the list of events it carried. */
export async function readEvents(res: Response): Promise<Array<Record<string, unknown>>> {
  const text = await res.text();
  return text
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

/** Mocks the provider with an SSE body, capturing the outgoing request. */
export function mockStreamingProvider(sse: string) {
  const captured: { url: string; body: string } = { url: '', body: '' };
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    captured.url = String(url);
    captured.body = String(init?.body ?? '');
    return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  });
  return { spy, captured };
}

export const OPENAI_SSE =
  'data: {"choices":[{"delta":{"content":"Beli 5000 ml "}}]}\n' +
  'data: {"choices":[{"delta":{"content":"Susu."}}]}\n' +
  'data: [DONE]\n';

export function post(
  who: { fetch: (path: string, init?: RequestInit) => Promise<Response> },
  body: unknown
) {
  return who.fetch('/ai/stream', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
    body: JSON.stringify(body),
  });
}
