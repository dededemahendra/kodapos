# kodapos read-only MCP server — design

- Date: 2026-07-09
- Status: approved (design), pending implementation plan
- Branch: `feat/mcp-server`

## 1. Context and goal

kodapos already has an in-app AI assistant (`convex/ai.ts`, route `/ai`): the
owner adds their own OpenAI/Anthropic API key and chats about their cafe. That
assistant works by context-stuffing a fixed snapshot (`cafes.myCafe`,
`dashboard.kpis`, `reports.overview`, `reports.products`, `dashboard.lowStock`,
`restock.suggestion`, `forecast.demand`) into the prompt. It cannot query
anything else and cannot act.

This project is a different surface: expose kodapos as an **external MCP server**
so an owner can connect their kodapos to an external AI client (Claude Desktop,
Claude Code, Cursor) and chat with their business data from that client. In this
direction the AI model lives on the client; kodapos is purely a data provider,
so the owner's in-app LLM key is irrelevant here.

## 2. Decisions (locked)

1. **Direction:** external MCP server (not enhancing the in-app assistant).
2. **Capabilities:** read-only. No mutations reachable in v1.
3. **Auth:** per-owner personal access token (bearer). OAuth is a later phase.
4. **Hosting:** a single Convex `httpAction` at `/mcp`. Smallest surface, reuses
   Convex data + auth, one deploy. It is also the foundation for a later OAuth
   phase (front the same token/data layer with a thin Cloudflare Worker).
5. **v1 client target:** token-in-config clients (Claude Desktop / Claude Code /
   Cursor). Web clients (claude.ai, ChatGPT) require OAuth and are out of scope
   for v1.

## 3. Architecture

A remote MCP server implemented as one Convex `httpAction`, registered in
`convex/http.ts`, served at `https://<deployment>.convex.site/mcp`. It speaks MCP
over HTTP using JSON-RPC 2.0 and handles:

- `initialize` — returns `protocolVersion`, `serverInfo` (name `kodapos`,
  version), and `capabilities: { tools: {} }`.
- `notifications/initialized` — accepted as a no-op.
- `tools/list` — returns the tool schemas.
- `tools/call` — validates the token, dispatches to the named tool, returns the
  result as MCP tool content (JSON serialized as text).

All logic lives in a new `convex/mcp.ts` (the httpAction + protocol handling) and
`convex/mcpRead.ts` (the internal read queries the tools call). Token management
lives in `convex/accessTokens.ts`.

## 4. Data model

New table `accessTokens`:

| field | type | notes |
|---|---|---|
| `userId` | `Id<'users'>` | the owner who minted the token |
| `cafeId` | `Id<'cafes'>` | outlet the token is scoped to (must be owned by `userId`) |
| `tokenHash` | `string` | sha-256 hex of the raw token; the raw token is never stored |
| `name` | `string` | owner label, e.g. "Claude Desktop" |
| `createdAt` | `number` | |
| `lastUsedAt` | `number` (optional) | updated on use, throttled to avoid write amplification |
| `revokedAt` | `number` (optional) | set on revoke; a revoked token fails auth |

Index: `by_hash` on `["tokenHash"]`. (Also `by_user` on `["userId"]` for the
management list.)

Token format: opaque `kpat_` + 32 bytes of base62 randomness, generated
server-side, returned to the owner exactly once at creation.

## 5. Auth flow

1. httpAction reads `Authorization: Bearer <token>`.
2. Compute sha-256 hex of `<token>`.
3. `ctx.runQuery(internal.accessTokens.resolve, { tokenHash })` looks up `by_hash`.
   Returns `{ userId, cafeId }` when the row exists and `revokedAt == null`,
   otherwise `null`.
4. `null` -> respond HTTP 401 with a JSON-RPC error (auth failed). Present -> all
   tool calls run scoped to that fixed `cafeId`.
5. `lastUsedAt` is refreshed via an internal mutation, throttled (skip if updated
   in the last few minutes) to avoid a write on every call.

The `cafeId` is fixed at token creation and validated to belong to `userId`, so
a token can never read another tenant's data even if the caller passes a
different id (tool args never accept a `cafeId`).

## 6. Tools (read-only)

Each tool is backed by an internal query in `convex/mcpRead.ts` that takes an
explicit `cafeId`. `range` accepts a preset (`today`, `7d`, `30d`, `month`) or an
explicit `{ from, to }` (ISO dates). Amounts are IDR integers.

| tool | args | returns |
|---|---|---|
| `get_cafe_info` | — | name, timezone, tax config, currency |
| `get_kpis` | — | today vs yesterday: revenue, orders, AOV |
| `get_sales_summary` | `range` | revenue, orders, AOV, refunds for the range |
| `get_sales_by_day` | `range` | daily revenue + order-count series |
| `get_top_products` | `range`, `limit?` | best/worst sellers by qty and revenue |
| `get_payment_breakdown` | `range` | totals by payment method |
| `get_low_stock` | — | ingredients below reorder threshold |
| `list_customers` | `search?`, `limit?` | matching customers (name/phone), capped |
| `get_forecast` | — | demand forecast summary |
| `get_profit_loss` | `range` | P&L summary for the range |

The exact tool set is finalized during planning against the real query
signatures (some may be merged or renamed). `list_customers` is the one tool
that surfaces PII (name/phone); it returns only the token's own cafe customers,
capped, which is acceptable since it is the owner's own data.

### Refactor required

The reads above currently resolve `cafeId` via `requireActiveOutlet` and then
inline their logic (except `computeOverview`, already extracted). For each, split
the post-`cafeId` logic into a helper `computeX(ctx, cafeId, args)` (or an
`internal` query taking `cafeId`) so the existing public query and the new MCP
internal query share one implementation. This is a targeted refactor of the
touched reads only; no unrelated changes.

## 7. Owner UX

A "Connect AI assistant (MCP)" card in `settings/integrations`:

- Explain what it does in one line and that access is read-only.
- "Generate token": pick an outlet (defaults to the current/only outlet) + a
  name -> show the token once with a copy button, plus a ready-to-paste MCP
  config snippet containing the `/mcp` URL.
- List existing tokens (name, outlet, created, last used) with a Revoke action.
- Only owners (`requireBusinessOwner`) can mint or revoke.

Copy follows the project rules (Indonesian source + English, no em-dash, shadcn
primitives, Empty state for the empty list).

## 8. Error handling and abuse control

- Missing/invalid/revoked token -> HTTP 401 + JSON-RPC error.
- Unknown tool or bad args -> JSON-RPC error with a clear message.
- Per-token rate limiting, reusing the existing rate-limit pattern
  (`ai.rateLimit`) keyed by token/cafe.
- Read-only by construction: the httpAction only ever calls internal read
  queries; no mutation path is reachable from a tool.
- Errors never include another tenant's data.

## 9. Testing (convex-test)

- Token resolve: valid, revoked, missing, wrong-hash.
- Each tool returns correctly scoped data for its `cafeId`.
- Cross-tenant isolation: a token for cafe A cannot read cafe B (and tool args
  cannot widen scope).
- JSON-RPC handshake shapes: `initialize`, `tools/list`, `tools/call` responses.
- Rate limiting triggers after the configured threshold.

## 10. Transport risk (call out early)

Modern MCP clients use the "Streamable HTTP" transport and some expect
`text/event-stream` / session semantics rather than plain JSON responses. A
Convex `httpAction` does request/response JSON cleanly but not rich SSE. v1
targets token-config clients and, if a client needs it, the standard
`mcp-remote` bridge. We will validate against a real Claude Desktop connection
early in implementation rather than assuming. If the transport proves painful in
Convex, the fallback is to bring the thin Cloudflare Worker front (the OAuth
phase's host) forward.

## 11. Out of scope for v1 (YAGNI)

- OAuth / "Sign in with kodapos" (later phase; front the same Convex token/data
  layer with a Cloudflare Worker for claude.ai / ChatGPT reach).
- Any write or action tools.
- SSE streaming and server-initiated notifications.
- Multi-outlet-in-one-token: a token is scoped to exactly one outlet; an owner
  mints one token per outlet they want to expose.

## 12. Future phases (not now)

1. OAuth authorization server (Cloudflare Worker front) to reach web AI clients.
2. Curated write tools with per-action scopes and confirmations.
