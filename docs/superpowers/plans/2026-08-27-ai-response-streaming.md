# AI Response Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four blocking AI actions with one streaming HTTP route so AI answers appear token-by-token instead of after 5–15 seconds of spinner.

**Architecture:** A single `POST /ai/stream` Convex HTTP action serves all three AI surfaces. It reuses the existing `internal.ai.config` / `internal.ai.rateLimit` / gather pipeline unchanged, opens the provider's SSE stream, decodes it with a pure per-provider decoder, and re-emits NDJSON events (`delta` / `done` / `error`) that a client hook reads through a `ReadableStream`. The existing `AiResponse` renderer re-parses on every render, so partial text renders as live structured blocks with no change.

**Tech Stack:** Convex 1.39 (`httpAction`, `convex-test` 0.0.53), `@convex-dev/auth` 0.0.92 (`useAuthToken`), React 19, TanStack Router, Lingui, Vitest (`edge-runtime`), Biome.

**Spec:** `docs/superpowers/specs/2026-08-27-ai-response-streaming-design.md`

## Global Constraints

- Package manager is **pnpm**. Verification commands: `pnpm test`, `pnpm typecheck`, `pnpm lint`.
- Biome style: single quotes, 2-space indent, line width 100. Run `pnpm lint:fix` before committing.
- Vitest only picks up `tests/**/*.test.ts` and `src/**/*.test.ts` — **`.ts` only, never `.tsx`**. There is no `@testing-library/react` in this project, so React components and hooks are **not** unit tested. Anything that must be tested has to live in a plain `.ts` module.
- `convex/lib/ai.ts` is pure and side-effect free by design — no `fetch`, no `ctx`. Keep it that way; that property is what makes it testable.
- Path aliases: `~/*` → `./src/*`, `convex/*` → `./convex/*`. `src` may import types from `convex/lib/*`.
- User-facing strings are Lingui (`t`/`Trans`/`msg`). Server-side strings in `convex/` are plain literals switched on `locale`.
- Provider errors: log the raw provider body server-side, send the client only a code. Never leak provider bodies to the client.
- Do not change `requireActiveOutlet`, `internal.ai.config`, `internal.ai.rateLimit`, `enforceRateLimit`, the prompts, `gatherSummary`, or `gatherRestock`. Their behaviour and ordering are load-bearing.
- Rate limit stays 40 calls per 10-minute window per cafe. Upstream timeout stays 60s. `max_tokens` stays 1024.

---

### Task 1: Probe — does Convex flush a streamed response incrementally?

Throwaway. The whole design rests on this. Nothing else starts until it passes.

**Files:**
- Modify: `convex/http.ts` (temporary route, deleted at the end of this task)

- [ ] **Step 1: Add a temporary probe route**

In `convex/http.ts`, above `export default http;`:

```ts
// TEMPORARY PROBE — deleted at the end of Task 1.
http.route({
  path: '/ai/probe',
  method: 'GET',
  handler: httpAction(async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(c) {
        for (let i = 0; i < 5; i++) {
          c.enqueue(encoder.encode(`chunk ${i} at ${Date.now()}\n`));
          await new Promise((r) => setTimeout(r, 1000));
        }
        c.close();
      },
    });
    return new Response(stream, {
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  }),
});
```

- [ ] **Step 2: Deploy to dev and call it**

Run `pnpm convex:dev` in one terminal. In another, take the deployment URL from `.env.local` (`VITE_CONVEX_URL`), swap `.convex.cloud` for `.convex.site`, and run:

```bash
curl -N --no-buffer "https://<deployment>.convex.site/ai/probe"
```

Expected: five lines appearing roughly one second apart.
Failure: all five lines appearing together after ~5 seconds.

- [ ] **Step 3: Record the result and decide**

If lines arrive spaced out, the design holds — continue to Task 2.

If they arrive batched, **stop and report to the user.** The fallback is approach C from the design doc (chunked DB writes + reactive `useQuery`), which keeps Tasks 2, 3 and most of Task 7 intact but replaces Tasks 4–6. Do not improvise it; bring it back for a decision.

- [ ] **Step 4: Delete the probe route**

Remove the temporary block from `convex/http.ts`. Verify `git diff --stat` shows no remaining changes to that file.

Run: `pnpm typecheck`
Expected: PASS, and `git status` clean.

---

### Task 2: SSE decoder

**Files:**
- Create: `convex/lib/aiSse.ts`
- Test: `tests/convex/lib/aiSse.test.ts`

**Interfaces:**
- Consumes: `AiProvider` from `convex/lib/ai.ts`
- Produces:
  - `type SSEEvent = { type: 'delta'; text: string } | { type: 'error'; message: string } | { type: 'done' }`
  - `createSSEDecoder(provider: AiProvider): { push(chunk: string): SSEEvent[]; flush(): SSEEvent[] }`

- [ ] **Step 1: Write the failing tests**

Create `tests/convex/lib/aiSse.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createSSEDecoder } from '../../../convex/lib/aiSse';

describe('createSSEDecoder — openai', () => {
  it('extracts content deltas', () => {
    const d = createSSEDecoder('openai');
    const events = d.push(
      'data: {"choices":[{"delta":{"content":"Hal"}}]}\n' +
        'data: {"choices":[{"delta":{"content":"o"}}]}\n'
    );
    expect(events).toEqual([
      { type: 'delta', text: 'Hal' },
      { type: 'delta', text: 'o' },
    ]);
  });

  it('buffers a line split across chunks', () => {
    const d = createSSEDecoder('openai');
    expect(d.push('data: {"choices":[{"delta":{"co')).toEqual([]);
    expect(d.push('ntent":"Hai"}}]}\n')).toEqual([{ type: 'delta', text: 'Hai' }]);
  });

  it('emits done on [DONE] and ignores it as text', () => {
    const d = createSSEDecoder('openai');
    expect(d.push('data: [DONE]\n')).toEqual([{ type: 'done' }]);
  });

  it('skips comment keepalives such as OpenRouter processing pings', () => {
    const d = createSSEDecoder('openrouter');
    expect(d.push(': OPENROUTER PROCESSING\n\n')).toEqual([]);
  });

  it('surfaces an in-band provider error', () => {
    const d = createSSEDecoder('openai');
    expect(d.push('data: {"error":{"message":"rate limited"}}\n')).toEqual([
      { type: 'error', message: 'rate limited' },
    ]);
  });

  it('ignores malformed JSON rather than throwing', () => {
    const d = createSSEDecoder('openai');
    expect(d.push('data: {not json\n')).toEqual([]);
  });
});

describe('createSSEDecoder — anthropic', () => {
  it('extracts text_delta and ignores other block types', () => {
    const d = createSSEDecoder('anthropic');
    const events = d.push(
      'event: message_start\ndata: {"type":"message_start"}\n\n' +
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"hmm"}}\n\n' +
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hai"}}\n\n'
    );
    expect(events).toEqual([{ type: 'delta', text: 'Hai' }]);
  });

  it('emits done on message_stop', () => {
    const d = createSSEDecoder('anthropic');
    expect(d.push('data: {"type":"message_stop"}\n')).toEqual([{ type: 'done' }]);
  });

  it('surfaces an in-band error event', () => {
    const d = createSSEDecoder('anthropic');
    expect(d.push('data: {"type":"error","error":{"message":"overloaded"}}\n')).toEqual([
      { type: 'error', message: 'overloaded' },
    ]);
  });

  it('handles CRLF line endings', () => {
    const d = createSSEDecoder('anthropic');
    expect(
      d.push('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"A"}}\r\n')
    ).toEqual([{ type: 'delta', text: 'A' }]);
  });
});

describe('createSSEDecoder — flush', () => {
  it('emits a trailing line that never got its newline', () => {
    const d = createSSEDecoder('openai');
    expect(d.push('data: {"choices":[{"delta":{"content":"end"}}]}')).toEqual([]);
    expect(d.flush()).toEqual([{ type: 'delta', text: 'end' }]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/convex/lib/aiSse.test.ts`
Expected: FAIL — cannot resolve `../../../convex/lib/aiSse`.

- [ ] **Step 3: Implement the decoder**

Create `convex/lib/aiSse.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test tests/convex/lib/aiSse.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Lint, typecheck, commit**

```bash
pnpm lint:fix && pnpm typecheck
git add convex/lib/aiSse.ts tests/convex/lib/aiSse.test.ts
git commit -m "feat(ai): SSE decoder for streaming provider responses"
```

---

### Task 3: Streaming request flag, error codes, and request parsing

**Files:**
- Modify: `convex/lib/ai.ts`
- Test: `tests/convex/lib/ai.test.ts`

**Interfaces:**
- Produces:
  - `type AiErrorCode = 'unauthorized' | 'bad_request' | 'not_configured' | 'rate_limited' | 'provider' | 'network' | 'empty'`
  - `type AiStreamRequest = { kind: 'insights'; locale: AiLocale } | { kind: 'restock'; locale: AiLocale } | { kind: 'chat'; locale: AiLocale; messages: ChatMsg[] }`
  - `parseStreamBody(body: unknown): AiStreamRequest | null`
  - `buildLLMRequest(provider, model, apiKey, system, messages, opts?: { stream?: boolean })`

- [ ] **Step 1: Write the failing tests**

Append to `tests/convex/lib/ai.test.ts` (keep the file's existing imports; add `parseStreamBody` to the import from `../../../convex/lib/ai`):

```ts
describe('buildLLMRequest — stream flag', () => {
  it('sets stream on the OpenAI-compatible body', () => {
    const req = buildLLMRequest('openai', 'gpt-4o-mini', 'k', 'sys', [
      { role: 'user', content: 'hi' },
    ], { stream: true });
    expect(JSON.parse(req.body).stream).toBe(true);
  });

  it('sets stream on the Anthropic body', () => {
    const req = buildLLMRequest('anthropic', 'claude-3-5-haiku-20241022', 'k', 'sys', [
      { role: 'user', content: 'hi' },
    ], { stream: true });
    expect(JSON.parse(req.body).stream).toBe(true);
  });

  it('omits stream when not requested, so non-streaming callers are unchanged', () => {
    const req = buildLLMRequest('openai', 'gpt-4o-mini', 'k', 'sys', [
      { role: 'user', content: 'hi' },
    ]);
    expect(JSON.parse(req.body).stream).toBeUndefined();
  });
});

describe('parseStreamBody', () => {
  it('accepts insights with a locale', () => {
    expect(parseStreamBody({ kind: 'insights', locale: 'en' })).toEqual({
      kind: 'insights',
      locale: 'en',
    });
  });

  it('defaults a missing locale to id', () => {
    expect(parseStreamBody({ kind: 'restock' })).toEqual({ kind: 'restock', locale: 'id' });
  });

  it('rejects an unknown kind', () => {
    expect(parseStreamBody({ kind: 'summarise' })).toBeNull();
  });

  it('rejects a non-object body', () => {
    expect(parseStreamBody('hello')).toBeNull();
    expect(parseStreamBody(null)).toBeNull();
  });

  it('normalizes chat history and keeps only the last 12 turns', () => {
    // 21, not 20: an even count ends on an assistant turn, which the parser
    // rejects outright — it would test the wrong thing.
    const messages = Array.from({ length: 21 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as const,
      content: `m${i}`,
    }));
    const parsed = parseStreamBody({ kind: 'chat', locale: 'id', messages });
    expect(parsed).not.toBeNull();
    if (parsed?.kind !== 'chat') throw new Error('expected chat');
    expect(parsed.messages.length).toBeLessThanOrEqual(12);
    expect(parsed.messages[0]!.role).toBe('user');
    expect(parsed.messages[parsed.messages.length - 1]!.role).toBe('user');
  });

  it('truncates an overlong message to 4000 characters', () => {
    const parsed = parseStreamBody({
      kind: 'chat',
      locale: 'id',
      messages: [{ role: 'user', content: 'x'.repeat(5000) }],
    });
    if (parsed?.kind !== 'chat') throw new Error('expected chat');
    expect(parsed.messages[0]!.content).toHaveLength(4000);
  });

  it('rejects chat whose last turn is not from the user', () => {
    expect(
      parseStreamBody({
        kind: 'chat',
        locale: 'id',
        messages: [{ role: 'assistant', content: 'hi' }],
      })
    ).toBeNull();
  });

  it('rejects chat with an empty history', () => {
    expect(parseStreamBody({ kind: 'chat', locale: 'id', messages: [] })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/convex/lib/ai.test.ts`
Expected: FAIL — `parseStreamBody` is not exported; the stream-flag assertions fail.

- [ ] **Step 3: Implement in `convex/lib/ai.ts`**

Add the error-code union near the top, after `AiLocale`:

```ts
/**
 * The machine-readable failure codes `/ai/stream` returns — as an HTTP status
 * body before the provider's response headers, and as an in-band `error` event
 * after. The client maps these to localized copy, so no user-facing prose
 * crosses the wire.
 */
export type AiErrorCode =
  | 'unauthorized'
  | 'bad_request'
  | 'not_configured'
  | 'rate_limited'
  | 'provider'
  | 'network'
  | 'empty';
```

Change `buildLLMRequest`'s signature and both bodies:

```ts
export function buildLLMRequest(
  provider: AiProvider,
  model: string,
  apiKey: string,
  system: string,
  messages: ChatMsg[],
  opts: { stream?: boolean } = {}
): LLMRequest {
  // Spread rather than `stream: opts.stream` so a non-streaming request is
  // byte-identical to what this built before streaming existed.
  const stream = opts.stream ? { stream: true } : {};
  if (provider === 'anthropic') {
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens: MAX_TOKENS, system, messages, ...stream }),
    };
  }
  return {
    url:
      provider === 'openrouter'
        ? 'https://openrouter.ai/api/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      ...(provider === 'openrouter'
        ? { 'HTTP-Referer': OPENROUTER_APP_URL, 'X-Title': OPENROUTER_APP_NAME }
        : {}),
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      temperature: 0.3,
      messages: [{ role: 'system', content: system }, ...messages],
      ...stream,
    }),
  };
}
```

Add the request parser at the end of the file, above the prompts:

```ts
/** A validated `/ai/stream` request body. */
export type AiStreamRequest =
  | { kind: 'insights'; locale: AiLocale }
  | { kind: 'restock'; locale: AiLocale }
  | { kind: 'chat'; locale: AiLocale; messages: ChatMsg[] };

/** Longest history and per-message length sent to the model, capping token cost. */
const MAX_HISTORY_TURNS = 12;
const MAX_MESSAGE_CHARS = 4000;

/**
 * Validates and bounds an untrusted `/ai/stream` body. Returns null for
 * anything the route should answer with 400 — the route never inspects the raw
 * body itself, so every bound lives here where it can be tested without a
 * network or a database.
 */
export function parseStreamBody(body: unknown): AiStreamRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as { kind?: unknown; locale?: unknown; messages?: unknown };
  const locale: AiLocale = b.locale === 'en' ? 'en' : 'id';

  if (b.kind === 'insights' || b.kind === 'restock') return { kind: b.kind, locale };
  if (b.kind !== 'chat' || !Array.isArray(b.messages)) return null;

  const raw: ChatMsg[] = [];
  for (const m of b.messages as unknown[]) {
    if (typeof m !== 'object' || m === null) return null;
    const { role, content } = m as { role?: unknown; content?: unknown };
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return null;
    raw.push({ role, content: content.slice(0, MAX_MESSAGE_CHARS) });
  }
  const messages = normalizeHistory(raw.slice(-MAX_HISTORY_TURNS));
  // The model needs a question to answer, and Anthropic rejects a history that
  // does not end on a user turn.
  if (messages.length === 0 || messages[messages.length - 1]!.role !== 'user') return null;
  return { kind: 'chat', locale, messages };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test tests/convex/lib/ai.test.ts`
Expected: PASS, including every pre-existing test in the file.

- [ ] **Step 5: Lint, typecheck, commit**

```bash
pnpm lint:fix && pnpm typecheck
git add convex/lib/ai.ts tests/convex/lib/ai.test.ts
git commit -m "feat(ai): stream flag, error codes, and stream request parsing"
```

---

### Task 4: CORS helper

The existing routes in `convex/http.ts` are all server-to-server and need no CORS. This one is called from the browser with an `Authorization` header, which triggers a preflight.

**Files:**
- Create: `convex/lib/cors.ts`
- Test: `tests/convex/lib/cors.test.ts`

**Interfaces:**
- Produces:
  - `isAllowedOrigin(origin: string | null, siteUrl: string | undefined): boolean`
  - `corsHeaders(origin: string | null): Record<string, string>`
  - `preflightResponse(req: Request): Response`

- [ ] **Step 1: Write the failing tests**

Create `tests/convex/lib/cors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isAllowedOrigin } from '../../../convex/lib/cors';

describe('isAllowedOrigin', () => {
  it('allows the configured site origin', () => {
    expect(isAllowedOrigin('https://kodapos.app', 'https://kodapos.app')).toBe(true);
  });

  it('ignores a trailing slash on the configured value', () => {
    expect(isAllowedOrigin('https://kodapos.app', 'https://kodapos.app/')).toBe(true);
  });

  it('allows localhost on any port for local development', () => {
    expect(isAllowedOrigin('http://localhost:3000', 'https://kodapos.app')).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:5173', 'https://kodapos.app')).toBe(true);
  });

  it('rejects a different origin', () => {
    expect(isAllowedOrigin('https://evil.example', 'https://kodapos.app')).toBe(false);
  });

  it('rejects an origin that merely starts with the site origin', () => {
    expect(isAllowedOrigin('https://kodapos.app.evil.example', 'https://kodapos.app')).toBe(false);
  });

  it('rejects a null origin', () => {
    expect(isAllowedOrigin(null, 'https://kodapos.app')).toBe(false);
  });

  it('still allows localhost when SITE_URL is unset', () => {
    expect(isAllowedOrigin('http://localhost:3000', undefined)).toBe(true);
    expect(isAllowedOrigin('https://kodapos.app', undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/convex/lib/cors.test.ts`
Expected: FAIL — cannot resolve `../../../convex/lib/cors`.

- [ ] **Step 3: Implement**

Create `convex/lib/cors.ts`:

```ts
// CORS for the one browser-facing HTTP route (`/ai/stream`). Every other route
// in `http.ts` is server-to-server and needs none of this.

/**
 * Whether a request's `Origin` may call the browser-facing routes.
 *
 * Matches the deployment's configured `SITE_URL` exactly (a prefix match would
 * let `https://kodapos.app.evil.example` through) plus any localhost port for
 * local development.
 */
export function isAllowedOrigin(origin: string | null, siteUrl: string | undefined): boolean {
  if (!origin) return false;
  if (siteUrl && origin === siteUrl.replace(/\/+$/, '')) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

/**
 * Echoes the request origin when allowlisted rather than sending `*`, and sets
 * `Vary: Origin` so a cache never serves one origin's response to another.
 * An origin that is not allowed simply gets no CORS header, which the browser
 * turns into the usual cross-origin block.
 */
export function corsHeaders(origin: string | null): Record<string, string> {
  if (!isAllowedOrigin(origin, process.env.SITE_URL)) return { vary: 'Origin' };
  return {
    'access-control-allow-origin': origin as string,
    vary: 'Origin',
  };
}

/** Preflight answer for a browser-facing route. */
export function preflightResponse(req: Request): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(req.headers.get('Origin')),
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-max-age': '86400',
    },
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test tests/convex/lib/cors.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Lint, typecheck, commit**

```bash
pnpm lint:fix && pnpm typecheck
git add convex/lib/cors.ts tests/convex/lib/cors.test.ts
git commit -m "feat(ai): CORS helper for the browser-facing AI route"
```

---

### Task 5: The streaming route

The handler lives in `convex/ai.ts` and is routed from `convex/http.ts`, mirroring how `convex/mcp.ts` exports `handleMcpRequest` and `http.ts` wraps it in `httpAction`.

**Files:**
- Modify: `convex/ai.ts` (add `handleAiStream`; leave the four actions in place for now — Task 6 deletes them)
- Modify: `convex/http.ts` (route `POST` and `OPTIONS` on `/ai/stream`)
- Test: `tests/convex/ai-stream.test.ts`

**Interfaces:**
- Consumes: `createSSEDecoder`, `SSEEvent` (Task 2); `AiErrorCode`, `AiStreamRequest`, `parseStreamBody`, `buildLLMRequest` (Task 3); `corsHeaders`, `preflightResponse` (Task 4)
- Produces: `handleAiStream(ctx: ActionCtx, req: Request): Promise<Response>` from `convex/ai.ts`; the route `POST /ai/stream` emitting NDJSON `{"t":"delta","v":string}` / `{"t":"done"}` / `{"t":"error","code":AiErrorCode}`

- [ ] **Step 1: Write the failing tests**

Create `tests/convex/ai-stream.test.ts`. It reuses the fixture style of `tests/convex/ai-restock.test.ts` — read that file first and copy its `setup`, `seedSales`, and `connectAi` helpers verbatim, then add:

```ts
/** Reads an NDJSON response body into the list of events it carried. */
async function readEvents(res: Response): Promise<Array<Record<string, unknown>>> {
  const text = await res.text();
  return text
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

/** Mocks the provider with an SSE body, capturing the outgoing request. */
function mockStreamingProvider(sse: string) {
  const captured: { url: string; body: string } = { url: '', body: '' };
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    captured.url = String(url);
    captured.body = String(init?.body ?? '');
    return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  });
  return { spy, captured };
}

const OPENAI_SSE =
  'data: {"choices":[{"delta":{"content":"Beli 5000 ml "}}]}\n' +
  'data: {"choices":[{"delta":{"content":"Susu."}}]}\n' +
  'data: [DONE]\n';

function post(
  who: { fetch: (path: string, init?: RequestInit) => Promise<Response> },
  body: unknown
) {
  return who.fetch('/ai/stream', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
    body: JSON.stringify(body),
  });
}

describe('POST /ai/stream', () => {
  afterEach(() => vi.restoreAllMocks());

  it('rejects an unauthenticated caller with 401', async () => {
    const t = convexTest(schema, modules);
    const res = await post(t, { kind: 'insights', locale: 'id' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ code: 'unauthorized' });
  });

  it('returns 400 not_configured when no AI key is connected', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    const res = await post(refs.asOwner, { kind: 'insights', locale: 'id' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: 'not_configured' });
  });

  it('returns 400 bad_request for an unknown kind', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await connectAi(refs);
    const res = await post(refs.asOwner, { kind: 'summarise' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: 'bad_request' });
  });

  it('streams deltas then done, and sends stream:true to the provider', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await connectAi(refs, 'openai', 'gpt-4o-mini');
    await seedSales(t, refs, 20, Date.now());
    const { captured } = mockStreamingProvider(OPENAI_SSE);
    const res = await post(refs.asOwner, { kind: 'insights', locale: 'id' });
    expect(res.status).toBe(200);
    expect(JSON.parse(captured.body).stream).toBe(true);
    expect(await readEvents(res)).toEqual([
      { t: 'delta', v: 'Beli 5000 ml ' },
      { t: 'delta', v: 'Susu.' },
      { t: 'done' },
    ]);
  });

  it('echoes an allowed origin in the CORS header', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await connectAi(refs);
    await seedSales(t, refs, 20, Date.now());
    mockStreamingProvider(OPENAI_SSE);
    const res = await post(refs.asOwner, { kind: 'insights', locale: 'id' });
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
  });

  it('answers the CORS preflight', async () => {
    const t = convexTest(schema, modules);
    const res = await t.fetch('/ai/stream', {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:3000' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-headers')).toContain('authorization');
  });

  it('returns 502 provider when the provider rejects the request', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await connectAi(refs);
    await seedSales(t, refs, 20, Date.now());
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 401 }));
    const res = await post(refs.asOwner, { kind: 'insights', locale: 'id' });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ code: 'provider' });
  });

  it('emits an in-band empty error when the stream produces no text', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await connectAi(refs);
    await seedSales(t, refs, 20, Date.now());
    mockStreamingProvider('data: [DONE]\n');
    const res = await post(refs.asOwner, { kind: 'insights', locale: 'id' });
    expect(res.status).toBe(200);
    expect(await readEvents(res)).toEqual([{ t: 'error', code: 'empty' }]);
  });

  it('returns 429 once the per-cafe window is exhausted', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await connectAi(refs);
    await seedSales(t, refs, 20, Date.now());
    mockStreamingProvider(OPENAI_SSE);
    // 40 calls per 10-minute window; the 41st must be refused.
    for (let i = 0; i < 40; i++) {
      const ok = await post(refs.asOwner, { kind: 'insights', locale: 'id' });
      expect(ok.status).toBe(200);
      await ok.text();
    }
    const res = await post(refs.asOwner, { kind: 'insights', locale: 'id' });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ code: 'rate_limited' });
  });

  it('sends chat history with the cafe data in the system prompt', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await connectAi(refs, 'anthropic', 'claude-3-5-haiku-20241022');
    await seedSales(t, refs, 20, Date.now());
    const { captured } = mockStreamingProvider(
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Halo"}}\n' +
        'data: {"type":"message_stop"}\n'
    );
    const res = await post(refs.asOwner, {
      kind: 'chat',
      locale: 'id',
      messages: [{ role: 'user', content: 'Berapa penjualan?' }],
    });
    const body = JSON.parse(captured.body);
    expect(body.system).toContain('Cafe data (JSON)');
    expect(body.messages).toEqual([{ role: 'user', content: 'Berapa penjualan?' }]);
    expect(await readEvents(res)).toEqual([{ t: 'delta', v: 'Halo' }, { t: 'done' }]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/convex/ai-stream.test.ts`
Expected: FAIL — every request 404s, because `/ai/stream` is not routed yet.

- [ ] **Step 3: Implement the handler in `convex/ai.ts`**

Add these imports to the existing import block:

```ts
import {
  type AiErrorCode,
  type AiStreamRequest,
  parseStreamBody,
} from './lib/ai';
import { createSSEDecoder } from './lib/aiSse';
import { corsHeaders } from './lib/cors';
```

(Fold the three new `lib/ai` names into the existing import from `./lib/ai` rather than adding a second statement.)

Then add at the end of the file:

```ts
/** One NDJSON line: `{"t":…}\n`. */
function ndjson(encoder: TextEncoder, event: Record<string, unknown>): Uint8Array {
  return encoder.encode(`${JSON.stringify(event)}\n`);
}

/**
 * A one-shot stream carrying a fixed message. The restock advisor has three
 * answers that never reach a model (not configured, forecast still learning,
 * nothing to order); emitting them through the same channel as a real
 * generation means the client has exactly one code path.
 */
function fixedStream(text: string, headers: Record<string, string>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(ndjson(encoder, { t: 'delta', v: text }));
      c.enqueue(ndjson(encoder, { t: 'done' }));
      c.close();
    },
  });
  return new Response(stream, { headers });
}

/** Resolves a validated request into the system prompt and turns to send. */
async function buildTurns(
  ctx: ActionCtx,
  req: AiStreamRequest
): Promise<{ system: string; messages: ChatMsg[] } | { fixed: string }> {
  if (req.kind === 'restock') {
    const { json, lineCount, learning } = await gatherRestock(ctx);
    if (learning) {
      return {
        fixed:
          req.locale === 'en'
            ? 'The demand forecast is still learning, so AI restock advice is not available yet. Try again once the forecast is active.'
            : 'Perkiraan permintaan masih belajar, jadi saran restock AI belum tersedia. Coba lagi setelah perkiraan aktif.',
      };
    }
    if (lineCount === 0) {
      return {
        fixed:
          req.locale === 'en'
            ? 'Your stock is sufficient for this week. Nothing needs ordering right now.'
            : 'Stok Anda cukup untuk minggu ini. Tidak ada bahan yang perlu dipesan sekarang.',
      };
    }
    return {
      system: `${RESTOCK_SYSTEM_PROMPT} ${languageInstruction(req.locale, 'fixed')}`,
      messages: [{ role: 'user', content: `Cafe restock data (JSON):\n${json}` }],
    };
  }

  const data = await gatherSummary(ctx);
  if (req.kind === 'insights') {
    return {
      system: `${INSIGHTS_SYSTEM_PROMPT} ${languageInstruction(req.locale, 'fixed')}`,
      messages: [{ role: 'user', content: `Cafe data (JSON):\n${data}` }],
    };
  }
  // chat — the cafe data rides in the system prompt so it is stated once
  // regardless of how many turns the history carries.
  return {
    system: `${ASK_SYSTEM_PROMPT} ${languageInstruction(req.locale, 'mirror')}\n\nCafe data (JSON):\n${data}`,
    messages: req.messages,
  };
}

/**
 * `POST /ai/stream` — the single streaming endpoint behind every AI surface.
 *
 * Ordering is deliberate and matches what the actions did: config first (an
 * unconfigured caller never spends budget), then the rate limit (so the heavy
 * `gatherRestock` reads are capped too), then data gathering, and only then the
 * provider. Everything up to the provider's response headers can still answer
 * with a real HTTP status; after that the status is committed and failures have
 * to travel in-band as an `error` event.
 */
export async function handleAiStream(ctx: ActionCtx, req: Request): Promise<Response> {
  const cors = corsHeaders(req.headers.get('Origin'));
  const fail = (status: number, code: AiErrorCode) =>
    new Response(JSON.stringify({ code }), {
      status,
      headers: { ...cors, 'content-type': 'application/json' },
    });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail(400, 'bad_request');
  }
  const parsed = parseStreamBody(raw);
  if (!parsed) return fail(400, 'bad_request');

  let cfg: AiConfig | null;
  try {
    cfg = await ctx.runQuery(internal.ai.config, {});
  } catch {
    // `requireActiveOutlet` throws for a caller with no identity or no outlet.
    return fail(401, 'unauthorized');
  }
  if (!cfg) return fail(400, 'not_configured');

  try {
    await ctx.runMutation(internal.ai.rateLimit, {});
  } catch {
    return fail(429, 'rate_limited');
  }

  const streamHeaders = {
    ...cors,
    'content-type': 'application/x-ndjson; charset=utf-8',
    'cache-control': 'no-store',
    // A hint to any intermediary not to buffer; harmless where unrecognized.
    'x-accel-buffering': 'no',
  };

  const turns = await buildTurns(ctx, parsed);
  if ('fixed' in turns) return fixedStream(turns.fixed, streamHeaders);

  const llm = buildLLMRequest(cfg.provider, cfg.model, cfg.apiKey, turns.system, turns.messages, {
    stream: true,
  });

  // Bounds the whole generation, not just the connect, so a provider that
  // opens a stream and then stalls still fails cleanly.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);

  let upstream: Response;
  try {
    upstream = await fetch(llm.url, {
      method: 'POST',
      headers: llm.headers,
      body: llm.body,
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    return fail(504, 'network');
  }
  if (!upstream.ok || !upstream.body) {
    // Provider bodies can carry account and quota metadata — log, never send.
    const detail = await upstream.text().catch(() => '');
    console.error(`AI provider error ${upstream.status}: ${detail.slice(0, 500)}`);
    clearTimeout(timer);
    return fail(502, 'provider');
  }

  const encoder = new TextEncoder();
  const decoder = createSSEDecoder(cfg.provider);
  const body = upstream.body;

  const stream = new ReadableStream<Uint8Array>({
    async start(c) {
      const reader = body.getReader();
      const text = new TextDecoder();
      let produced = false;
      let failure: AiErrorCode | null = null;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const event of decoder.push(text.decode(value, { stream: true }))) {
            if (event.type === 'delta') {
              produced = true;
              c.enqueue(ndjson(encoder, { t: 'delta', v: event.text }));
            } else if (event.type === 'error') {
              console.error(`AI provider stream error: ${event.message.slice(0, 500)}`);
              failure = 'provider';
              break;
            }
          }
          if (failure) break;
        }
        if (!failure) {
          for (const event of decoder.flush()) {
            if (event.type === 'delta') {
              produced = true;
              c.enqueue(ndjson(encoder, { t: 'delta', v: event.text }));
            }
          }
        }
      } catch {
        // An upstream drop or the 60s abort landing mid-generation.
        failure = 'network';
      } finally {
        clearTimeout(timer);
        const final = failure ?? (produced ? null : 'empty');
        c.enqueue(final ? ndjson(encoder, { t: 'error', code: final }) : ndjson(encoder, { t: 'done' }));
        c.close();
      }
    },
    cancel() {
      // The reader went away (the owner pressed stop, or navigated); stop
      // paying for tokens nobody will see.
      clearTimeout(timer);
      controller.abort();
    },
  });

  return new Response(stream, { headers: streamHeaders });
}
```

- [ ] **Step 4: Route it in `convex/http.ts`**

Add the import alongside the existing `handleMcpRequest` import:

```ts
import { handleAiStream } from './ai';
```

and, next to the `/mcp` route:

```ts
// The one browser-facing route: called cross-origin from the app with a bearer
// token, so it needs CORS and a preflight (the webhook and MCP routes above are
// server-to-server and do not).
http.route({
  path: '/ai/stream',
  method: 'POST',
  handler: httpAction((ctx, req) => handleAiStream(ctx, req)),
});

http.route({
  path: '/ai/stream',
  method: 'OPTIONS',
  handler: httpAction(async (_ctx, req) => preflightResponse(req)),
});
```

and import `preflightResponse` from `./lib/cors`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test tests/convex/ai-stream.test.ts`
Expected: PASS, 10 tests.

If the rate-limit test is slow, it is doing 41 full round trips against the in-memory backend; that is expected and still runs in seconds.

- [ ] **Step 6: Full suite, lint, typecheck, commit**

```bash
pnpm test && pnpm lint:fix && pnpm typecheck
git add convex/ai.ts convex/http.ts tests/convex/ai-stream.test.ts
git commit -m "feat(ai): streaming /ai/stream HTTP route for all AI surfaces"
```

---

### Task 6: Retire the four actions

The route now covers everything the actions did. Two pipelines is one too many.

**Files:**
- Modify: `convex/ai.ts` (delete `insights`, `ask`, `chat`, `restock`, and `callAi`)
- Modify: `tests/convex/ai-restock.test.ts` (drive the route instead of the action)

- [ ] **Step 1: Move the restock coverage onto the route**

In `tests/convex/ai-restock.test.ts`, add the `post` and `readEvents` helpers from `tests/convex/ai-stream.test.ts` (copy them; the two files stay independent), then rewrite the four assertions:

```ts
it('returns not_configured when the AI integration is not connected', async () => {
  const t = convexTest(schema, modules);
  const refs = await setup(t);
  const res = await post(refs.asOwner, { kind: 'restock', locale: 'id' });
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ code: 'not_configured' });
});

it('short-circuits (no LLM call) while the forecast is still learning', async () => {
  const t = convexTest(schema, modules);
  const refs = await setup(t);
  await connectAi(refs);
  await seedSales(t, refs, 5, Date.now());
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  const events = await readEvents(await post(refs.asOwner, { kind: 'restock', locale: 'id' }));
  expect(events[0]!.v).toMatch(/masih belajar/);
  expect(events[events.length - 1]).toEqual({ t: 'done' });
  expect(fetchSpy).not.toHaveBeenCalled();
});

it('sends the restock prompt + gathered data to OpenAI and streams the briefing', async () => {
  const t = convexTest(schema, modules);
  const refs = await setup(t);
  await connectAi(refs, 'openai', 'gpt-4o-mini');
  await seedSales(t, refs, 20, Date.now());
  const { spy, captured } = mockStreamingProvider(
    'data: {"choices":[{"delta":{"content":"Beli 5000 ml Susu minggu ini."}}]}\ndata: [DONE]\n'
  );
  const events = await readEvents(await post(refs.asOwner, { kind: 'restock', locale: 'id' }));
  expect(spy).toHaveBeenCalledTimes(1);
  expect(captured.url).toContain('api.openai.com');
  expect(captured.body).toContain('restock advisor');
  expect(captured.body).toContain('Susu');
  expect(events.map((e) => e.v).join('')).toContain('Susu');
});

it('sends an Anthropic-shaped request and streams the content-block deltas', async () => {
  const t = convexTest(schema, modules);
  const refs = await setup(t);
  await connectAi(refs, 'anthropic', 'claude-3-5-haiku-20241022');
  await seedSales(t, refs, 20, Date.now());
  const { spy, captured } = mockStreamingProvider(
    'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Beli 5000 ml Susu."}}\n' +
      'data: {"type":"message_stop"}\n'
  );
  const events = await readEvents(await post(refs.asOwner, { kind: 'restock', locale: 'id' }));
  expect(spy).toHaveBeenCalledTimes(1);
  expect(captured.url).toContain('api.anthropic.com');
  expect(captured.body).toContain('"system"');
  expect(captured.body).toContain('Susu');
  expect(events.map((e) => e.v).join('')).toContain('Susu');
});

it('returns the stock-is-sufficient message (no LLM call) when nothing needs ordering', async () => {
  const t = convexTest(schema, modules);
  const refs = await setup(t);
  await connectAi(refs);
  await seedSales(t, refs, 20, Date.now());
  // Top the only recipe ingredient far above demand so restock.lines is empty
  // while the forecast is still 'ready'.
  await t.run((ctx) =>
    ctx.db.insert('inventoryMovements', {
      cafeId: refs.cafeId,
      ingredientId: refs.ingSusu,
      delta: 1_000_000,
      reason: 'adjustment',
      at: Date.now(),
    })
  );
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  const events = await readEvents(await post(refs.asOwner, { kind: 'restock', locale: 'id' }));
  expect(events[0]!.v).toMatch(/cukup/);
  expect(events[events.length - 1]).toEqual({ t: 'done' });
  expect(fetchSpy).not.toHaveBeenCalled();
});
```

Also add the `mockStreamingProvider` helper (copy from `ai-stream.test.ts`) and delete the old non-streaming `mockProvider` if nothing else in the file uses it. Rename the `describe` block from `'ai.restock'` to `'/ai/stream — restock'`.

- [ ] **Step 2: Run the tests to verify they pass against the route**

Run: `pnpm test tests/convex/ai-restock.test.ts`
Expected: PASS, 5 tests. The actions still exist at this point, so this proves the route alone carries the coverage.

- [ ] **Step 3: Delete the actions**

From `convex/ai.ts`, delete the exported `insights`, `ask`, `chat`, and `restock` actions and the `callAi` helper.

Keep: `config`, `rateLimit`, the rate-limit constants, `AiConfig`, `gatherSummary`, `gatherRestock`, `buildTurns`, `ndjson`, `fixedStream`, `handleAiStream`.

Remove any import that is now unused (`action` from `./_generated/server`, `parseLLMResponse` from `./lib/ai`, and `api`/`v` only if genuinely unreferenced — `gatherSummary` still uses `api`, and `config`/`rateLimit` still use `v`).

- [ ] **Step 4: Verify nothing references the deleted actions**

Run: `grep -rn "api\.ai\.\(insights\|ask\|chat\|restock\)" --include='*.ts' --include='*.tsx' src convex tests | grep -v _generated`
Expected: the three client files from `src/` only. Those are rewired in Tasks 8–10 — if the count is anything other than those three, investigate before continuing.

Run: `pnpm test`
Expected: PASS for every Convex test. `pnpm typecheck` will still fail on the three `src/` files that call the deleted actions; that is expected and Tasks 8–10 fix it.

- [ ] **Step 5: Commit**

```bash
pnpm lint:fix
git add convex/ai.ts tests/convex/ai-restock.test.ts
git commit -m "refactor(ai): retire the four AI actions in favour of the streaming route"
```

---

### Task 7: Client foundation — site URL, NDJSON parser, error codes, hook

Everything the three surfaces need, in one task, because none of it is independently useful.

**Files:**
- Create: `src/lib/convex-site.ts`
- Test: `src/lib/convex-site.test.ts`
- Create: `src/lib/ndjson.ts`
- Test: `src/lib/ndjson.test.ts`
- Modify: `src/lib/ai-error.ts`
- Test: `src/lib/ai-error.test.ts`
- Create: `src/hooks/use-ai-stream.ts`
- Modify: `src/components/settings/mcp-access-card.tsx:46-49`

**Interfaces:**
- Consumes: `AiErrorCode`, `AiStreamRequest` from `convex/lib/ai` (Task 3); the `/ai/stream` NDJSON contract (Task 5)
- Produces:
  - `toConvexSiteUrl(cloudUrl: string): string` and `convexSiteUrl(): string`
  - `createNdjsonParser(): { push(chunk: string): unknown[]; flush(): unknown[] }`
  - `aiErrorMessage(code: AiErrorCode | null): MessageDescriptor`
  - `useAiStream(): { text: string; streaming: boolean; error: AiErrorCode | null; send(req: AiStreamRequest): Promise<string | null>; stop(): void }`

- [ ] **Step 1: Write the failing tests for the three pure modules**

Create `src/lib/convex-site.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { toConvexSiteUrl } from './convex-site';

describe('toConvexSiteUrl', () => {
  it('maps a cloud deployment URL to its site URL', () => {
    expect(toConvexSiteUrl('https://happy-otter-123.convex.cloud')).toBe(
      'https://happy-otter-123.convex.site'
    );
  });

  it('strips a trailing slash', () => {
    expect(toConvexSiteUrl('https://happy-otter-123.convex.cloud/')).toBe(
      'https://happy-otter-123.convex.site'
    );
  });

  it('leaves an unrecognized host alone', () => {
    expect(toConvexSiteUrl('http://127.0.0.1:3210')).toBe('http://127.0.0.1:3210');
  });
});
```

Create `src/lib/ndjson.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createNdjsonParser } from './ndjson';

describe('createNdjsonParser', () => {
  it('parses whole lines', () => {
    const p = createNdjsonParser();
    expect(p.push('{"t":"delta","v":"a"}\n{"t":"done"}\n')).toEqual([
      { t: 'delta', v: 'a' },
      { t: 'done' },
    ]);
  });

  it('buffers a line split across chunks', () => {
    const p = createNdjsonParser();
    expect(p.push('{"t":"delta","v":"he')).toEqual([]);
    expect(p.push('llo"}\n')).toEqual([{ t: 'delta', v: 'hello' }]);
  });

  it('skips a malformed line rather than throwing', () => {
    const p = createNdjsonParser();
    expect(p.push('{oops\n{"t":"done"}\n')).toEqual([{ t: 'done' }]);
  });

  it('flushes a trailing line with no newline', () => {
    const p = createNdjsonParser();
    expect(p.push('{"t":"done"}')).toEqual([]);
    expect(p.flush()).toEqual([{ t: 'done' }]);
  });
});
```

Create `src/lib/ai-error.test.ts`:

```ts
import { i18n } from '@lingui/core';
import { describe, expect, it } from 'vitest';
import { aiErrorMessage } from './ai-error';

describe('aiErrorMessage', () => {
  it('returns a distinct message per code', () => {
    const codes = [
      'unauthorized',
      'bad_request',
      'not_configured',
      'rate_limited',
      'provider',
      'network',
      'empty',
    ] as const;
    const ids = codes.map((c) => aiErrorMessage(c).id);
    expect(new Set(ids).size).toBeGreaterThan(1);
    for (const id of ids) expect(typeof id).toBe('string');
  });

  it('points an unconfigured owner at Integrations', () => {
    i18n.load('id', {});
    i18n.activate('id');
    expect(i18n._(aiErrorMessage('not_configured'))).toMatch(/Integrasi/);
  });

  it('falls back to the generic message for null', () => {
    expect(aiErrorMessage(null).id).toBe(aiErrorMessage('provider').id);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/lib/convex-site.test.ts src/lib/ndjson.test.ts src/lib/ai-error.test.ts`
Expected: FAIL — two modules missing, and `aiErrorMessage` still takes `unknown`.

- [ ] **Step 3: Implement the three pure modules**

Create `src/lib/convex-site.ts`:

```ts
/**
 * Convex serves function calls from `<deployment>.convex.cloud` and HTTP
 * actions from `<deployment>.convex.site`. Only the host differs, so the site
 * URL is derived rather than configured separately.
 */
export function toConvexSiteUrl(cloudUrl: string): string {
  return cloudUrl.replace(/\/+$/, '').replace('.convex.cloud', '.convex.site');
}

/** The deployment's HTTP-action origin, from the same env var as the client. */
export function convexSiteUrl(): string {
  return toConvexSiteUrl(import.meta.env.VITE_CONVEX_URL ?? '');
}
```

Create `src/lib/ndjson.ts`:

```ts
/**
 * Incremental newline-delimited-JSON parser for a streamed response body.
 * Buffers partial lines, because a network chunk lands wherever it lands — not
 * on a line boundary. A line that will not parse is skipped rather than thrown:
 * one bad line should not abandon a generation that is otherwise arriving.
 */
export function createNdjsonParser(): { push(chunk: string): unknown[]; flush(): unknown[] } {
  let buffer = '';

  const parse = (line: string): unknown[] => {
    const trimmed = line.trim();
    if (!trimmed) return [];
    try {
      return [JSON.parse(trimmed)];
    } catch {
      return [];
    }
  };

  return {
    push(chunk) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      return lines.flatMap(parse);
    },
    flush() {
      const rest = buffer;
      buffer = '';
      return parse(rest);
    },
  };
}
```

Rewrite `src/lib/ai-error.ts` entirely:

```ts
import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import type { AiErrorCode } from 'convex/lib/ai';

/**
 * Maps a `/ai/stream` failure code to localized copy for a toast.
 *
 * The route sends a machine-readable code and never user-facing prose, so this
 * is a lookup rather than the string-matching it replaced (which parsed
 * Indonesian out of Convex's error wrapper, and so returned Indonesian even
 * with the UI in English).
 */
export function aiErrorMessage(code: AiErrorCode | null): MessageDescriptor {
  switch (code) {
    case 'not_configured':
      return msg`AI belum terhubung. Hubungkan kunci API di Pengaturan, Integrasi.`;
    case 'rate_limited':
      return msg`Batas penggunaan AI tercapai. Coba lagi sebentar.`;
    case 'network':
      return msg`Permintaan AI gagal karena masalah jaringan. Coba lagi.`;
    case 'unauthorized':
      return msg`Sesi Anda berakhir. Masuk lagi untuk memakai AI.`;
    case 'empty':
      return msg`AI tidak memberi jawaban. Coba lagi.`;
    default:
      return msg`Fitur AI sedang tidak tersedia. Periksa pengaturan AI Anda atau coba lagi nanti.`;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/lib/convex-site.test.ts src/lib/ndjson.test.ts src/lib/ai-error.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Write the hook**

Create `src/hooks/use-ai-stream.ts`. Not unit tested — this project has no React testing library, so it is verified by typecheck and by the manual checks in Task 10.

```ts
import { useAuthToken } from '@convex-dev/auth/react';
import type { AiErrorCode, AiStreamRequest } from 'convex/lib/ai';
import { useCallback, useRef, useState } from 'react';
import { convexSiteUrl } from '~/lib/convex-site';
import { createNdjsonParser } from '~/lib/ndjson';

type StreamEvent =
  | { t: 'delta'; v: string }
  | { t: 'done' }
  | { t: 'error'; code: AiErrorCode };

/**
 * Drives `POST /ai/stream`, appending deltas as they arrive.
 *
 * `send` resolves with the finished text (or null if it failed or was
 * stopped) so a caller that needs to commit the answer somewhere — the chat
 * page, to its history — does not have to watch `text` settle.
 */
export function useAiStream() {
  const token = useAuthToken();
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<AiErrorCode | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const send = useCallback(
    async (req: AiStreamRequest): Promise<string | null> => {
      // Single-flight: a second send while one is in flight replaces it.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setText('');
      setError(null);
      setStreaming(true);

      let accumulated = '';
      try {
        const res = await fetch(`${convexSiteUrl()}/ai/stream`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(req),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => null)) as { code?: AiErrorCode } | null;
          setError(body?.code ?? 'provider');
          return null;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const parser = createNdjsonParser();
        let failure: AiErrorCode | null = null;

        const handle = (events: unknown[]) => {
          for (const raw of events) {
            const event = raw as StreamEvent;
            if (event.t === 'delta') {
              accumulated += event.v;
              setText(accumulated);
            } else if (event.t === 'error') {
              failure = event.code;
            }
          }
        };

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          handle(parser.push(decoder.decode(value, { stream: true })));
          if (failure) break;
        }
        handle(parser.flush());

        if (failure) {
          setError(failure);
          return null;
        }
        return accumulated;
      } catch (err) {
        // A stop() abort is not a failure: keep whatever arrived, show no toast.
        if (err instanceof DOMException && err.name === 'AbortError') return null;
        setError('network');
        return null;
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [token]
  );

  return { text, streaming, error, send, stop };
}
```

- [ ] **Step 6: Deduplicate the site-URL logic**

In `src/components/settings/mcp-access-card.tsx`, replace the local helper at lines 46–49 with a call to `convexSiteUrl()` imported from `~/lib/convex-site`, so the mapping has one definition.

- [ ] **Step 7: Extract and compile message catalogs**

The new `msg` strings in `ai-error.ts` need catalog entries.

```bash
pnpm lingui:extract && pnpm lingui:compile
```

Then add English translations for the new ids in `src/locales/en` (the Indonesian source strings are the ids). Check `git diff src/locales` to see exactly which entries appeared.

- [ ] **Step 8: Verify and commit**

Run: `pnpm test && pnpm lint:fix`
Expected: all tests PASS. `pnpm typecheck` still fails on the three unrewired surfaces — expected until Task 10.

```bash
git add src/lib/convex-site.ts src/lib/convex-site.test.ts src/lib/ndjson.ts src/lib/ndjson.test.ts src/lib/ai-error.ts src/lib/ai-error.test.ts src/hooks/use-ai-stream.ts src/components/settings/mcp-access-card.tsx src/locales
git commit -m "feat(ai): client streaming foundation — hook, NDJSON parser, error codes"
```

---

### Task 8: Stream the dashboard insights card

**Files:**
- Modify: `src/components/ai-insights.tsx`

**Interfaces:**
- Consumes: `useAiStream` (Task 7)

- [ ] **Step 1: Replace both actions with the hook**

In `src/components/ai-insights.tsx`:

Delete `const runInsights = useAction(api.ai.insights);`, `const runAsk = useAction(api.ai.ask);`, the `result` state, and the `loading` state. Remove the now-unused `useAction` import (keep `useQuery`).

Add:

```ts
const { text, streaming, error, send } = useAiStream();
```

Rewrite the two handlers:

```ts
async function generate() {
  await send({ kind: 'insights', locale });
}

async function onAsk(e: FormEvent) {
  e.preventDefault();
  const q = question.trim();
  if (!q || streaming) return;
  // The ask box is a one-message chat: same prompt, and multi-turn later if
  // we want it.
  await send({ kind: 'chat', locale, messages: [{ role: 'user', content: q }] });
}
```

- [ ] **Step 2: Surface errors from the hook**

The handlers no longer throw, so replace the `try/catch` toasts with an effect
that fires when a new error arrives. `useEffect` is not currently imported in
this file — add it to the existing `react` import alongside `useState`:

```ts
useEffect(() => {
  if (error) toast.error(i18n._(aiErrorMessage(error)));
}, [error, i18n]);
```

- [ ] **Step 3: Render streaming text**

Replace `loading` with `streaming` in the button's `disabled` and spinner, and change the result branch so text renders while it streams:

```tsx
{text ? (
  <AiResponse text={text} />
) : streaming ? (
  <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
    <Spinner />
    <Trans>Menganalisis…</Trans>
  </div>
) : (
  <p className="text-sm text-muted-foreground">
    <Trans>Buat wawasan atau ajukan pertanyaan tentang penjualan dan stok Anda.</Trans>
  </p>
)}
```

Text-first ordering matters: once the first delta lands the spinner must give way to the answer, not sit above it.

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors in `src/components/ai-insights.tsx`. Other surfaces may still fail; that is expected until Task 10.

- [ ] **Step 5: Commit**

```bash
git add src/components/ai-insights.tsx
git commit -m "feat(ai): stream the dashboard insights card"
```

---

### Task 9: Stream the restock advice card

**Files:**
- Modify: `src/components/ai-restock-advice.tsx`

**Interfaces:**
- Consumes: `useAiStream` (Task 7)

- [ ] **Step 1: Replace the action with the hook**

In `src/components/ai-restock-advice.tsx`, delete `const runRestock = useAction(api.ai.restock);` and the `result`/`loading` state, drop the `useAction` import, and add:

```ts
const { text, streaming, error, send } = useAiStream();

async function generate() {
  await send({ kind: 'restock', locale });
}

useEffect(() => {
  if (error) toast.error(i18n._(aiErrorMessage(error)));
}, [error, i18n]);
```

`send` already clears previous text, so the explicit `setResult(null)` that guarded against stale output on re-generate is no longer needed.

- [ ] **Step 2: Render streaming text**

Read lines 50–95 of the file for its current card body, then swap every
remaining `loading` for `streaming` and replace the result branch with this.
Text comes first so that once the first delta lands the spinner gives way to
the answer rather than sitting above it:

```tsx
{text ? (
  <AiResponse text={text} />
) : streaming ? (
  <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
    <Spinner />
    <Trans>Menganalisis…</Trans>
  </div>
) : (
  <p className="text-sm text-muted-foreground">
    <Trans>Buat saran restock dari perkiraan permintaan dan stok Anda.</Trans>
  </p>
)}
```

Keep whatever empty-state sentence the file already has in that last branch
rather than the one above if they differ — only the structure matters here.

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors in `src/components/ai-restock-advice.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/components/ai-restock-advice.tsx
git commit -m "feat(ai): stream the restock advice card"
```

---

### Task 10: Stream the chat page, with a stop control

**Files:**
- Modify: `src/components/ui/chat-input.tsx`
- Modify: `src/routes/_pos/ai.tsx`

**Interfaces:**
- Consumes: `useAiStream` (Task 7)
- Produces: `ChatInput` gains `streaming?: boolean`, `onStop?: () => void`, `stopLabel?: string`

- [ ] **Step 1: Give ChatInput a stop affordance**

In `src/components/ui/chat-input.tsx`, add the three props to the signature and type block, import `Square` from `lucide-react`, and replace the send `Button` with:

```tsx
<Button
  type="button"
  size="icon"
  onClick={streaming ? onStop : onSend}
  // While streaming, stop must stay clickable even though the composer is
  // disabled — it is the only way out of a long generation.
  disabled={streaming ? false : disabled || !hasText}
  aria-label={streaming ? stopLabel : sendLabel}
  className="absolute bottom-2.5 right-2.5 size-9 rounded-xl"
>
  {streaming ? <Square className="size-3.5 fill-current" /> : <ArrowUp className="size-4" />}
</Button>
```

Default `streaming = false`, `stopLabel = 'Stop'`, and `onStop` to a no-op so existing call sites are unaffected.

- [ ] **Step 2: Rewire the chat page to the hook**

In `src/routes/_pos/ai.tsx`, delete `const chat = useAction(api.ai.chat);`, the `loading` state, and the `useAction` import. Add:

```ts
const { text, streaming, error, send, stop } = useAiStream();

useEffect(() => {
  if (error) toast.error(i18n._(aiErrorMessage(error)));
}, [error, i18n]);
```

Import `aiErrorMessage` from `~/lib/ai-error` and `useAiStream` from `~/hooks/use-ai-stream`.

Rewrite `send` (rename the local function to `submit` so it does not shadow the hook's `send`):

```ts
async function submit(value: string) {
  const q = value.trim();
  if (!q || sendingRef.current) return;
  sendingRef.current = true;
  const next: ChatMsg[] = [...messages, { role: 'user', content: q }];
  setMessages(next);
  setInput('');
  const reply = await send({ kind: 'chat', locale, messages: next });
  if (reply) {
    setMessages([...next, { role: 'assistant', content: reply }]);
  } else {
    // Failed or stopped — Step 3 refines this branch.
    setMessages(messages);
  }
  sendingRef.current = false;
}
```

- [ ] **Step 3: Handle a stopped generation**

`stop()` aborts, so `send` resolves null and the rollback above would discard text the owner already read. Keep it instead — wrap `stop` so the partial answer is committed:

```ts
function stopAndKeep() {
  const partial = text;
  stop();
  if (partial.trim()) {
    setMessages((prev) =>
      prev[prev.length - 1]?.role === 'user'
        ? [...prev, { role: 'assistant', content: partial }]
        : prev
    );
    sendingRef.current = false;
  }
}
```

and in `submit`, replace the rollback with the functional form below. Reading
`text` there instead would be a stale closure — `submit` captured it before the
stream started, so it is always `''` by the time the await resolves:

```ts
if (reply) {
  setMessages([...next, { role: 'assistant', content: reply }]);
} else {
  // Failed or stopped. `stopAndKeep` has already committed any partial answer,
  // so roll back only if the history still ends on our optimistic user turn —
  // two consecutive user turns are rejected upstream.
  setMessages((prev) => (prev[prev.length - 1]?.role === 'user' ? messages : prev));
}
```

- [ ] **Step 4: Render the streaming turn**

Replace the `loading` spinner bubble with a bubble that shows text as it arrives:

```tsx
{streaming ? (
  <div className="flex gap-3">
    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
      <MessageCircle className="size-4" />
    </span>
    <div className="max-w-[80%] rounded-2xl bg-muted px-3.5 py-2 text-sm leading-relaxed text-foreground">
      {text ? (
        <AiResponse text={text} />
      ) : (
        <span className="flex items-center gap-2 text-muted-foreground">
          <Spinner className="size-4" />
          <Trans>Menganalisis…</Trans>
        </span>
      )}
    </div>
  </div>
) : null}
```

Update both `ChatInput` call sites (the empty-state one and the pinned composer) to pass `streaming`, `onStop={stopAndKeep}`, `stopLabel={t`Hentikan`}`, and `onSend={() => void submit(input)}`; change `disabled={loading}` to `disabled={streaming}`. Update the three suggestion buttons and the scroll effect to use `submit` and `streaming`.

- [ ] **Step 5: Extract and compile the new stop label**

```bash
pnpm lingui:extract && pnpm lingui:compile
```

Add the English translation for `Hentikan` (→ "Stop") in `src/locales/en`.

- [ ] **Step 6: Verify the whole project**

```bash
pnpm test && pnpm typecheck && pnpm lint
```

Expected: all PASS. This is the first point at which `typecheck` is clean since Task 6 — confirm there are no remaining references to the deleted actions.

- [ ] **Step 7: Manual verification against a real provider**

Run `pnpm dev:all`, sign in, and connect a real API key at Settings → Integrations. Then confirm each of:

1. Dashboard "Buat wawasan" — text appears progressively, not all at once.
2. Dashboard ask box — same, and the answer is grounded in real numbers.
3. Forecast page restock card — streams; with a still-learning forecast it shows the "masih belajar" sentence and makes no provider call.
4. AI chat page — a turn streams, and pressing stop mid-generation halts it and keeps the partial answer in history.
5. Switch the UI to English and confirm the reply language follows, and that disconnecting the key produces the English "not connected" toast rather than an Indonesian one.
6. Confirm structured blocks (bullets, headings, bold figures) form *during* streaming, not only at the end.

- [ ] **Step 8: Commit**

```bash
git add src/components/ui/chat-input.tsx src/routes/_pos/ai.tsx src/locales
git commit -m "feat(ai): stream the chat page and add a stop control"
```

---

## Verification checklist

Before opening a PR:

- [ ] `pnpm test` — all suites pass
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm lint` — clean
- [ ] `grep -rn "api\.ai\." --include='*.tsx' --include='*.ts' src | grep -v _generated` returns nothing
- [ ] The temporary `/ai/probe` route from Task 1 is gone
- [ ] All six manual checks in Task 10 Step 7 confirmed against a real provider key
