# AI response streaming

Date: 2026-08-27
Status: Design approved, ready for implementation planning

## Goal

Every AI answer in the app arrives as one blocking round-trip. The owner presses
"Buat wawasan" or sends a chat message and watches a spinner labelled
"Menganalisis…" for the entire generation — typically 5–15 seconds — then the
whole answer appears at once.

This design replaces that with token-level streaming: text starts appearing
within about a second and fills in as the model writes it. Nothing about *what*
the model is told changes; only how its output reaches the screen.

## Scope

In scope:

- One streaming HTTP route serving all three AI surfaces.
- SSE decoding for all three providers (OpenAI, Anthropic, OpenRouter).
- A client hook, and the three surfaces switched over to it.
- A "stop generating" control, which streaming makes both possible and expected.
- Deleting the four actions the route replaces.

Explicitly **not** in scope, each a separate future decision:

- Persisting chat history (it still dies on refresh).
- Prompt caching for the repeated cafe-data snapshot.
- Tool calling / letting the model query data beyond the fixed snapshot.
- Retry on transient provider 429/5xx.

## Current architecture

```
useAction(api.ai.chat)          convex/ai.ts                  convex/lib/ai.ts
        │                            │                              │
        └──► action ────► internal.ai.config    (auth: requireActiveOutlet)
                          internal.ai.rateLimit (auth: requireActiveOutlet)
                          gatherSummary()       (5 parallel runQuery)
                          callAi() ──► fetch ──► buildLLMRequest / parseLLMResponse
                                                          │
                       whole string ◄──────────────────────┘
```

Four actions — `insights`, `ask`, `chat`, `restock` — each repeat that pipeline.
They have exactly four client call sites and no server-side consumers, so the
transport is free to change.

## Design

### 1. One route, three kinds

`POST /ai/stream` in `convex/http.ts`, plus an `OPTIONS` handler on the same
path for the CORS preflight.

Request body:

```jsonc
{
  "kind": "chat" | "insights" | "restock",
  "locale": "id" | "en",
  "messages": [{ "role": "user", "content": "…" }]  // kind: "chat" only
}
```

**`ask` is collapsed into `chat`.** The dashboard ask box is a one-message
history; today the only real difference from `chat` is whether the cafe JSON
sits in the user turn or in the system prompt. After this change the ask box
sends `kind: "chat"` with a single user message and gets the `chat` treatment.

This is a small, intentional behaviour change: that surface's data moves from
the user turn into the system prompt. The prompt text (`ASK_SYSTEM_PROMPT`) and
the data are otherwise identical, and it leaves the ask box trivially
upgradeable to multi-turn later.

### 2. Auth

The client reads its Convex Auth JWT with `useAuthToken()` from
`@convex-dev/auth/react` (confirmed present in the installed 0.0.92) and sends
it as `Authorization: Bearer <token>`.

Inside the `httpAction`, `ctx.auth` resolves that token, and it propagates
through `ctx.runQuery(internal.ai.config)` and
`ctx.runMutation(internal.ai.rateLimit)` exactly as it does from an action
today. **`requireActiveOutlet` and both internal functions are untouched.** No
auth or authorization logic moves as part of this work.

A request with no or invalid identity fails in `requireActiveOutlet` as it
always has; the route maps that to HTTP 401.

### 3. CORS

The browser calls `https://<deployment>.convex.site/ai/stream` cross-origin, so
unlike the existing webhook and MCP routes (all server-to-server) this one needs
CORS.

- Allowed origins: `process.env.SITE_URL` — already set in the Convex
  deployment and used by `convex/email.ts` and `convex/otp/ResendOTP.ts` — plus
  `http://localhost:*` for dev.
- Echo the request's `Origin` when allowlisted rather than sending `*`, and set
  `Vary: Origin`.
- Preflight response: 204, `Access-Control-Allow-Methods: POST, OPTIONS`,
  `Access-Control-Allow-Headers: authorization, content-type`,
  `Access-Control-Max-Age: 86400`.

The client uses default (not `include`) credentials mode; the bearer token is
the only credential.

### 4. Wire format out

Newline-delimited JSON, one event per line:

```jsonc
{"t":"delta","v":"Penjualan 30 hari"}
{"t":"delta","v":" terakhir naik 12%"}
{"t":"done"}
```

or, on a failure that happens after bytes are already flowing:

```jsonc
{"t":"error","code":"provider"}
```

Why typed events rather than raw text: once the first byte is sent the HTTP
status is already committed, so a provider failure mid-generation has no other
channel to reach the client. It also gives the client a machine-readable
**code** instead of the current arrangement, where `src/lib/ai-error.ts`
regex-matches Indonesian prose out of Convex's error wrapper string
(`/belum dikonfigurasi/i`, `/waktu habis|jaringan/i`). That heuristic is deleted.

The boundary between the two channels is the **provider's response headers**,
not our first byte: returning a streaming `Response` commits our status code
immediately, so the route awaits the upstream fetch's headers before returning.
Everything up to and including that point uses ordinary HTTP status codes with a
JSON body `{"code":"…"}`:

| Condition | Status | Code |
|---|---|---|
| No/invalid identity, or no active outlet | 401 | `unauthorized` |
| Malformed body, empty question | 400 | `bad_request` |
| AI integration not connected | 400 | `not_configured` |
| Per-cafe rate limit exhausted | 429 | `rate_limited` |
| Provider returned non-2xx | 502 | `provider` |
| Timeout or network failure opening the upstream stream | 504 | `network` |

Everything after those headers is necessarily in-band, as an
`{"t":"error","code":"…"}` event: a provider error emitted mid-stream
(`provider`), an upstream drop or 60s timeout partway through (`network`), and a
stream that ended having produced no text at all (`empty`).

### 5. Server pipeline

`convex/lib/ai.ts` stays pure and side-effect free — the property that makes it
unit-testable without a network — and gains:

- **`buildLLMRequest(..., { stream: true })`.** Adds `stream: true` to both wire
  formats. Everything else about the request is unchanged, including
  `max_tokens: 1024` and `temperature: 0.3` on the OpenAI-compatible path.

- **`createSSEDecoder(provider)`** returning `{ push(chunk: string): SSEEvent[] }`
  where `SSEEvent` is `{type:'delta',text} | {type:'error',message} | {type:'done'}`.
  It buffers internally because network chunks split mid-line. Stateful, but
  still pure — no I/O — so it tests as a plain function over strings.

  Per-provider decoding:
  - **Anthropic**: text comes from `content_block_delta` events whose
    `delta.type` is `text_delta`. Everything else is skipped — `message_start`,
    `ping`, `content_block_start/stop`, `message_delta/stop`, and notably
    `thinking_delta`, matching how the existing `parseLLMResponse` already skips
    non-text blocks. An `event: error` yields an error event.
  - **OpenAI and OpenRouter**: text comes from `choices[0].delta.content`.
    `data: [DONE]` yields done. Lines beginning with `:` are comments and are
    skipped — OpenRouter sends `: OPENROUTER PROCESSING` keepalives during long
    generations.

The route handler's order of operations is the existing one, unchanged, because
the ordering encodes decisions that were made deliberately:

1. `internal.ai.config` — an unconfigured caller fails without consuming budget.
2. `internal.ai.rateLimit` — before any data gathering, so the heavy
   `gatherRestock` reads are covered by the cap too.
3. `gatherSummary` / `gatherRestock` — moved across from `convex/ai.ts` as-is.
4. Open the provider stream and await its response headers.
5. Return a `Response` wrapping the decoded stream.

Steps 1–4 complete before we commit a status code, which is what lets those
failures use real ones. They cost roughly 100–300ms plus the provider's
time-to-first-byte.

The 60-second `AbortController` bounding a hung upstream connection is kept. The
existing practice of logging the provider's raw error body server-side while
sending the client only a status is kept.

### 6. The non-LLM paths

`restock` has three early returns that never call a model: not configured, the
demand forecast is still learning, and nothing needs ordering. The latter two
return a fixed localized sentence today.

These emit as a single `delta` followed by `done`. The client gets exactly one
code path, and the existing text and behaviour are preserved unchanged.

### 7. Client

A `useAiStream` hook exposing `{ text, streaming, error, send, stop }`, wrapping
`fetch` plus a `ReadableStream` reader and an NDJSON line splitter.

The `.convex.cloud` → `.convex.site` conversion already exists inline in
`src/components/settings/mcp-access-card.tsx`. Extract it to `src/lib/convex.ts`
as `convexSiteUrl` and have both use it.

Surfaces, each keeping its current layout and only swapping its data source:

- `src/components/ai-insights.tsx` — `useAction(api.ai.insights)` and
  `useAction(api.ai.ask)` become one hook; the ask form sends `kind:"chat"`.
- `src/components/ai-restock-advice.tsx` — `useAction(api.ai.restock)` becomes
  the hook with `kind:"restock"`.
- `src/routes/_pos/ai.tsx` — `useAction(api.ai.chat)` becomes the hook; the
  streaming turn renders in place of the "Menganalisis…" spinner bubble.

`src/components/ai-response.tsx` needs **no change**. It re-parses its text on
every render, so partial output renders as live structured blocks — bullets and
headings forming as they arrive — for free.

### 8. Stop generating

`send` creates an `AbortController`; `stop` aborts it. The chat page already has
a `sendingRef` single-flight guard to hang this off.

An aborted generation still consumed its rate-limit budget. That is correct: the
provider was called and the owner's key was billed.

On abort the text produced so far is kept on screen rather than discarded. In
chat, the partial turn is committed to history so the conversation stays valid.

### 9. Error localization

`aiErrorMessage` in `src/lib/ai-error.ts` switches on the error **code** and
returns a lingui `MessageDescriptor` per code. This incidentally fixes a current
bug: those messages are Indonesian-only regardless of the `locale` the caller
passed.

The server-side restock early-return sentences stay server-localized as they are
today — the server already switches on `locale` for them.

### 10. Tests

- `tests/convex/lib/ai.test.ts` — `createSSEDecoder` per provider: text
  extraction, chunk boundaries splitting a line mid-JSON, comment/keepalive
  lines, `[DONE]`, Anthropic non-text block types, in-band provider errors.
  Plus `buildLLMRequest` carrying `stream: true` on both wire formats.
- `tests/convex/ai-restock.test.ts` — moves from
  `refs.asOwner.action(api.ai.restock, {})` to
  `t.withIdentity(...).fetch('/ai/stream', …)` (confirmed available in the
  installed `convex-test` 0.0.53), reading the NDJSON stream and asserting the
  same three early-return messages. The unconfigured case asserts status 400 and
  code `not_configured` instead of matching a thrown Indonesian string.
- New coverage for the route: 401 without identity, 429 when the rate limit is
  exhausted, and the CORS preflight.

### 11. Deleted

`convex/ai.ts`'s four exported actions — `insights`, `ask`, `chat`, `restock` —
and the `callAi` helper. `internal.ai.config`, `internal.ai.rateLimit`, the
prompts, and both gather functions all survive; only the action wrappers go.

## Risk

**The one real risk: whether Convex flushes an HTTP action's `ReadableStream`
response incrementally rather than buffering it to completion.** The entire
design rests on that. The first implementation step is a throwaway probe — a
route that emits a delta per second for five seconds — confirming the client
sees them arrive spaced out. If Convex buffers, the fallback is chunked DB
writes plus a reactive `useQuery` (approach C from brainstorming), which changes
the transport but keeps the prompts, decoder, and client hook shape intact.

Lesser risks:

- A corporate proxy that buffers responses degrades streaming to
  all-at-once. Accepted: the answer still arrives, and no fallback path is kept
  (a deliberate decision — maintaining two pipelines indefinitely costs more
  than the rare degraded case).
- `convex/_generated/ai/guidelines.md`, referenced by `CLAUDE.md`, is not
  present in the repo. Worth running `npx convex ai-files install` before
  implementation so the Convex-specific rules are actually available.

## Rollout

Single change, no flag. The route and the client switch land together; the
actions are deleted in the same change since nothing else calls them.
