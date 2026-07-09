# kodapos read-only MCP server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose kodapos business data to external AI clients (Claude Desktop / Claude Code / Cursor) via a read-only MCP server, authenticated with per-owner access tokens.

**Architecture:** One Convex `httpAction` at `/mcp` speaks MCP over JSON-RPC 2.0 (`initialize`, `tools/list`, `tools/call`). It authenticates a bearer token against a new `accessTokens` table, resolves the token to a fixed `{userId, cafeId}`, and dispatches each tool to an internal read query scoped to that `cafeId`. Existing read logic is refactored into `compute*(ctx, cafeId, ...)` helpers shared by the current public queries and the new MCP queries.

**Tech Stack:** Convex (queries, internalQuery, internalMutation, httpAction, httpRouter), Convex Web Crypto (`crypto.getRandomValues`, `crypto.subtle.digest`), convex-test + vitest, TanStack Router + React + shadcn (settings UI), Lingui i18n.

## Global Constraints

- Convex rules: read `convex/_generated/ai/guidelines.md` first; use the new function syntax with `args`/`returns` validators; never write explicit `undefined` (spread conditionally for `exactOptionalPropertyTypes`); prefer indexed queries over `.filter`.
- Codegen: after adding/removing Convex functions run `./node_modules/.bin/convex codegen` and commit the tracked `convex/_generated` files (npx is broken by a shell hook).
- CI gates (run locally before push): `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`. Also run `pnpm lingui:extract` after adding UI strings and fill the `en` translations.
- Copy rules for any user-facing string: Indonesian source + English translation, NO em-dash (—) or `--` (use commas/periods/parentheses), shadcn primitives, use the shadcn `Empty` component for empty data states (icon + heading + description).
- Read-only invariant: no tool may reach a mutation. Tool args never accept a `cafeId`; scope always comes from the token.
- Route tree: not affected (no new client routes added beyond editing an existing settings route).
- Commits: small and conventional; end messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File structure

- Create `convex/lib/token.ts` — pure helpers: `generateToken()`, `hashToken(raw)`.
- Create `convex/accessTokens.ts` — owner mutations (`create`, `revoke`), owner query (`list`), internal `resolve` query, internal `touchLastUsed` mutation.
- Create `convex/mcpRead.ts` — internal read queries per tool, each taking explicit `cafeId`.
- Create `convex/lib/mcpTools.ts` — the tool registry (name → JSON schema + handler that calls an `internal.mcpRead.*` query).
- Create `convex/mcp.ts` — MCP JSON-RPC handling (`handleMcpRequest`) used by the httpAction.
- Modify `convex/schema.ts` — add `accessTokens` table + indexes.
- Modify `convex/http.ts` — register `POST /mcp`.
- Modify `convex/dashboard.ts`, `convex/reports.ts`, `convex/cafes.ts` — extract `compute*` helpers (see Task 3).
- Create `tests/convex/accessTokens.test.ts`, `tests/convex/mcp.test.ts`.
- Modify `src/routes/_pos/settings/integrations.tsx` (+ a new `src/components/settings/mcp-access-card.tsx`) — token management UI.

---

### Task 1: `accessTokens` schema + token helpers + internal resolve

**Files:**
- Modify: `convex/schema.ts`
- Create: `convex/lib/token.ts`
- Create: `convex/accessTokens.ts` (resolve + touchLastUsed only in this task)
- Test: `tests/convex/accessTokens.test.ts`

**Interfaces:**
- Produces: `generateToken(): string` (returns `kpat_<43-char base62>`), `hashToken(raw: string): Promise<string>` (sha-256 hex). `internal.accessTokens.resolve({ tokenHash }) -> { userId, cafeId } | null`. `internal.accessTokens.touchLastUsed({ tokenHash })`.

- [ ] **Step 1: Add the table to `convex/schema.ts`**

```ts
// inside defineSchema({ ... })
accessTokens: defineTable({
  userId: v.id('users'),
  cafeId: v.id('cafes'),
  tokenHash: v.string(), // sha-256 hex of the raw token; raw is never stored
  name: v.string(),
  createdAt: v.number(),
  lastUsedAt: v.optional(v.number()),
  revokedAt: v.optional(v.number()),
})
  .index('by_hash', ['tokenHash'])
  .index('by_user', ['userId']),
```

- [ ] **Step 2: Write `convex/lib/token.ts`**

```ts
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Opaque personal access token: `kpat_` + 43 base62 chars (~256 bits). */
export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % 62];
  return `kpat_${out}`;
}

/** sha-256 hex of the raw token. Store/compare only the hash. */
export async function hashToken(raw: string): Promise<string> {
  const data = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
```

- [ ] **Step 3: Write the failing test for `resolve`** in `tests/convex/accessTokens.test.ts` (follow the setup pattern in `tests/convex/reports.test.ts` for `convexTest(schema)` and seeding a user + cafe)

```ts
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from '../../convex/_generated/api';
import schema from '../../convex/schema';
import { hashToken } from '../../convex/lib/token';

describe('accessTokens.resolve', () => {
  it('returns userId+cafeId for a live token, null for revoked/missing', async () => {
    const t = convexTest(schema);
    const { userId, cafeId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { name: 'Owner' });
      const cafeId = await ctx.db.insert('cafes', { name: 'Cafe', ownerUserId: userId, createdAt: 0 });
      return { userId, cafeId };
    });
    const hash = await hashToken('kpat_live');
    await t.run(async (ctx) => {
      await ctx.db.insert('accessTokens', { userId, cafeId, tokenHash: hash, name: 'x', createdAt: 0 });
    });

    expect(await t.query(internal.accessTokens.resolve, { tokenHash: hash })).toEqual({ userId, cafeId });
    expect(await t.query(internal.accessTokens.resolve, { tokenHash: await hashToken('nope') })).toBeNull();

    // revoke -> resolve returns null
    await t.run(async (ctx) => {
      const row = await ctx.db.query('accessTokens').withIndex('by_hash', (q) => q.eq('tokenHash', hash)).unique();
      if (row) await ctx.db.patch(row._id, { revokedAt: 1 });
    });
    expect(await t.query(internal.accessTokens.resolve, { tokenHash: hash })).toBeNull();
  });
});
```

- [ ] **Step 4: Run it, expect FAIL**

Run: `./node_modules/.bin/vitest run tests/convex/accessTokens.test.ts`
Expected: FAIL (`internal.accessTokens.resolve` not defined).

- [ ] **Step 5: Implement `resolve` + `touchLastUsed` in `convex/accessTokens.ts`**

```ts
import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';

export const resolve = internalQuery({
  args: { tokenHash: v.string() },
  returns: v.union(v.object({ userId: v.id('users'), cafeId: v.id('cafes') }), v.null()),
  handler: async (ctx, { tokenHash }) => {
    const row = await ctx.db
      .query('accessTokens')
      .withIndex('by_hash', (q) => q.eq('tokenHash', tokenHash))
      .unique();
    if (!row || row.revokedAt != null) return null;
    return { userId: row.userId, cafeId: row.cafeId };
  },
});

export const touchLastUsed = internalMutation({
  args: { tokenHash: v.string() },
  returns: v.null(),
  handler: async (ctx, { tokenHash }) => {
    const row = await ctx.db
      .query('accessTokens')
      .withIndex('by_hash', (q) => q.eq('tokenHash', tokenHash))
      .unique();
    // Throttle: skip if used within the last 5 minutes.
    if (row && row.revokedAt == null && (row.lastUsedAt ?? 0) < Date.now() - 5 * 60 * 1000) {
      await ctx.db.patch(row._id, { lastUsedAt: Date.now() });
    }
    return null;
  },
});
```

- [ ] **Step 6: Codegen + run test, expect PASS**

Run: `./node_modules/.bin/convex codegen && ./node_modules/.bin/vitest run tests/convex/accessTokens.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add convex/schema.ts convex/lib/token.ts convex/accessTokens.ts convex/_generated tests/convex/accessTokens.test.ts
git commit -m "feat(mcp): accessTokens table, token helpers, internal resolve"
```

---

### Task 2: Owner token mutations (`create`, `revoke`) + `list` query

**Files:**
- Modify: `convex/accessTokens.ts`
- Test: `tests/convex/accessTokens.test.ts`

**Interfaces:**
- Consumes: `generateToken`, `hashToken` (Task 1); `requireBusinessOwner(ctx) -> { userId, cafeId, businessId, role }` from `convex/lib/auth.ts`.
- Produces: `api.accessTokens.create({ name, cafeId }) -> { token: string, id: Id<'accessTokens'> }` (raw token returned ONCE). `api.accessTokens.revoke({ id })`. `api.accessTokens.list() -> Array<{ _id, name, cafeId, createdAt, lastUsedAt|null }>` (never the hash).

- [ ] **Step 1: Write failing tests** (append to `tests/convex/accessTokens.test.ts`): owner can create (returns a `kpat_` token, stores only the hash), a non-owner is rejected, `create` rejects a `cafeId` the caller does not own, `revoke` makes `resolve` fail, `list` excludes the hash and excludes revoked tokens. Use `t.withIdentity(...)` to simulate the signed-in owner (follow the auth-based test pattern in `tests/convex/cafes.test.ts`).

- [ ] **Step 2: Run, expect FAIL** — Run: `./node_modules/.bin/vitest run tests/convex/accessTokens.test.ts` — Expected: FAIL (`api.accessTokens.create` undefined).

- [ ] **Step 3: Implement in `convex/accessTokens.ts`**

```ts
import { requireBusinessOwner } from './lib/auth';
import { mutation, query } from './_generated/server';
import { generateToken, hashToken } from './lib/token';

export const create = mutation({
  args: { name: v.string(), cafeId: v.id('cafes') },
  returns: v.object({ token: v.string(), id: v.id('accessTokens') }),
  handler: async (ctx, { name, cafeId }) => {
    const { userId } = await requireBusinessOwner(ctx);
    const cafe = await ctx.db.get(cafeId);
    if (!cafe || cafe.ownerUserId !== userId) throw new Error('outlet not found');
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 60) throw new Error('Nama token wajib diisi.');
    const token = generateToken();
    const id = await ctx.db.insert('accessTokens', {
      userId,
      cafeId,
      tokenHash: await hashToken(token),
      name: trimmed,
      createdAt: Date.now(),
    });
    return { token, id };
  },
});

export const revoke = mutation({
  args: { id: v.id('accessTokens') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { userId } = await requireBusinessOwner(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.userId !== userId) throw new Error('token not found');
    if (row.revokedAt == null) await ctx.db.patch(id, { revokedAt: Date.now() });
    return null;
  },
});

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('accessTokens'),
      name: v.string(),
      cafeId: v.id('cafes'),
      createdAt: v.number(),
      lastUsedAt: v.union(v.number(), v.null()),
    })
  ),
  handler: async (ctx) => {
    const { userId } = await requireBusinessOwner(ctx);
    const rows = await ctx.db
      .query('accessTokens')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    return rows
      .filter((r) => r.revokedAt == null)
      .map((r) => ({ _id: r._id, name: r.name, cafeId: r.cafeId, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt ?? null }));
  },
});
```

- [ ] **Step 4: Codegen + run test, expect PASS** — Run: `./node_modules/.bin/convex codegen && ./node_modules/.bin/vitest run tests/convex/accessTokens.test.ts`

- [ ] **Step 5: Commit**

```bash
git add convex/accessTokens.ts convex/_generated tests/convex/accessTokens.test.ts
git commit -m "feat(mcp): owner token create/revoke/list"
```

---

### Task 3: Extract explicit-`cafeId` read helpers (refactor)

Refactor the v1 tools' backing reads so their post-`cafeId` logic is callable with an explicit `cafeId`. Do NOT change behavior of the existing public queries; they must call the extracted helper and return the same result.

**Files:**
- Modify: `convex/dashboard.ts` (`kpis` at :55, `lowStock` at :239) — extract `computeKpis(ctx, cafeId)` and `computeLowStock(ctx, cafeId)`.
- Modify: `convex/reports.ts` (`products` at :134; `computeOverview` at :44 already exists) — extract `computeProducts(ctx, cafeId, range)`.
- Modify: `convex/cafes.ts` — add `computeCafeInfo(ctx, cafeId) -> { name, timezone, taxRatePct, taxEnabled }` (reads the cafe doc; no auth).
- Test: existing `tests/convex/reports.test.ts` / dashboard tests must still pass unchanged.

**Interfaces:**
- Produces (all `export`ed from their file): `computeKpis(ctx, cafeId)`, `computeLowStock(ctx, cafeId)`, `computeProducts(ctx, cafeId, range)`, `computeOverview(ctx, cafeId, range)` (already exists), `computeCafeInfo(ctx, cafeId)`. `ctx` is `QueryCtx`.

- [ ] **Step 1:** For `convex/dashboard.ts` `kpis`: move everything after `const { cafeId } = await requireActiveOutlet(ctx);` into `export async function computeKpis(ctx: QueryCtx, cafeId: Id<'cafes'>) { ... }`, then make the query body `const { cafeId } = await requireActiveOutlet(ctx); return computeKpis(ctx, cafeId);`. Import `QueryCtx` type from `./_generated/server` and `Id` from `./_generated/dataModel`.

- [ ] **Step 2:** Repeat the same extraction for `dashboard.lowStock` -> `computeLowStock(ctx, cafeId)` and `reports.products` -> `computeProducts(ctx, cafeId, range)` (range is the same `rangeArg` value the query already takes).

- [ ] **Step 3:** Add `computeCafeInfo` to `convex/cafes.ts`:

```ts
export async function computeCafeInfo(ctx: QueryCtx, cafeId: Id<'cafes'>) {
  const cafe = await ctx.db.get(cafeId);
  if (!cafe) throw new Error('outlet not found');
  return {
    name: cafe.name,
    timezone: cafe.timezone ?? 'Asia/Jakarta',
    taxRatePct: cafe.taxRatePct ?? 0,
    taxEnabled: cafe.taxEnabled === true,
    currency: 'IDR' as const,
  };
}
```

- [ ] **Step 4: Run the full suite, expect PASS (no behavior change)** — Run: `./node_modules/.bin/convex codegen && pnpm test` — Expected: all existing tests pass (979+).

- [ ] **Step 5: Commit**

```bash
git add convex/dashboard.ts convex/reports.ts convex/cafes.ts convex/_generated
git commit -m "refactor(reports): extract explicit-cafeId read helpers for reuse"
```

---

### Task 4: `mcpRead` internal queries (v1 tool data layer)

**Files:**
- Create: `convex/mcpRead.ts`
- Test: `tests/convex/mcp.test.ts` (create; test the read queries directly here)

**Interfaces:**
- Consumes: `computeCafeInfo`, `computeKpis`, `computeOverview`, `computeProducts`, `computeLowStock` (Task 3).
- Produces: internal queries all taking `{ cafeId, ... }`: `internal.mcpRead.cafeInfo({cafeId})`, `internal.mcpRead.kpis({cafeId})`, `internal.mcpRead.salesSummary({cafeId, range})`, `internal.mcpRead.topProducts({cafeId, range, limit})`, `internal.mcpRead.lowStock({cafeId})`. `range` = `v.union(v.literal('today'), v.literal('7d'), v.literal('30d'), v.literal('month'))` (preset-only for v1; `{from,to}` deferred).

- [ ] **Step 1: Write failing tests** in `tests/convex/mcp.test.ts`: seed a cafe with a couple of paid orders; assert `internal.mcpRead.salesSummary({cafeId, range:'30d'})` returns the expected revenue/orders, and `topProducts` returns the seeded item. Cross-tenant: seed a second cafe and assert its data never appears in the first cafe's results.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `convex/mcpRead.ts`** — each query resolves the preset `range` to the `{from,to}` the compute helpers expect (reuse the same range-resolution the public queries use; if it lives inline, extract a `resolveRange(preset, tz)` helper into `convex/lib/range.ts` and use it in both places), then returns the compute helper result. Example:

```ts
import { v } from 'convex/values';
import { internalQuery } from './_generated/server';
import { computeCafeInfo } from './cafes';
import { computeKpis, computeLowStock } from './dashboard';
import { computeOverview, computeProducts } from './reports';

const rangePreset = v.union(v.literal('today'), v.literal('7d'), v.literal('30d'), v.literal('month'));

export const cafeInfo = internalQuery({
  args: { cafeId: v.id('cafes') },
  handler: (ctx, { cafeId }) => computeCafeInfo(ctx, cafeId),
});

export const kpis = internalQuery({
  args: { cafeId: v.id('cafes') },
  handler: (ctx, { cafeId }) => computeKpis(ctx, cafeId),
});

export const salesSummary = internalQuery({
  args: { cafeId: v.id('cafes'), range: rangePreset },
  handler: (ctx, { cafeId, range }) => computeOverview(ctx, cafeId, range),
});

export const topProducts = internalQuery({
  args: { cafeId: v.id('cafes'), range: rangePreset, limit: v.optional(v.number()) },
  handler: async (ctx, { cafeId, range, limit }) => {
    const rows = await computeProducts(ctx, cafeId, range);
    return rows.slice(0, Math.min(limit ?? 10, 50));
  },
});

export const lowStock = internalQuery({
  args: { cafeId: v.id('cafes') },
  handler: (ctx, { cafeId }) => computeLowStock(ctx, cafeId),
});
```

Note: if `computeOverview`/`computeProducts` take a resolved `{from,to}` rather than a preset, resolve the preset to a window first (via `resolveRange`) and pass that. Confirm the exact signature when implementing and match it.

- [ ] **Step 4: Codegen + run test, expect PASS.**

- [ ] **Step 5: Commit** — `git commit -m "feat(mcp): internal read queries for v1 tools"`

---

### Task 5: MCP tool registry

**Files:**
- Create: `convex/lib/mcpTools.ts`
- Test: covered via Task 7 (`tools/list`); a small unit test here for the schema shape is optional.

**Interfaces:**
- Produces: `MCP_TOOLS: McpTool[]` where `McpTool = { name: string; description: string; inputSchema: object; run: (ctx: ActionCtx, cafeId: Id<'cafes'>, args: any) => Promise<unknown> }`. Also `getTool(name): McpTool | undefined`.

- [ ] **Step 1: Write `convex/lib/mcpTools.ts`** — one entry per v1 tool; `run` calls the matching `internal.mcpRead.*` query. Example entries:

```ts
import { internal } from '../_generated/api';
import type { ActionCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';

export type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (ctx: ActionCtx, cafeId: Id<'cafes'>, args: Record<string, unknown>) => Promise<unknown>;
};

const RANGE = {
  type: 'string',
  enum: ['today', '7d', '30d', 'month'],
  description: 'Time range preset',
};

export const MCP_TOOLS: McpTool[] = [
  {
    name: 'get_cafe_info',
    description: 'Basic info about the outlet: name, timezone, tax, currency.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: (ctx, cafeId) => ctx.runQuery(internal.mcpRead.cafeInfo, { cafeId }),
  },
  {
    name: 'get_kpis',
    description: 'Today vs yesterday: revenue, order count, average order value.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: (ctx, cafeId) => ctx.runQuery(internal.mcpRead.kpis, { cafeId }),
  },
  {
    name: 'get_sales_summary',
    description: 'Revenue, orders, AOV and refunds for a time range.',
    inputSchema: { type: 'object', properties: { range: RANGE }, required: ['range'], additionalProperties: false },
    run: (ctx, cafeId, args) => ctx.runQuery(internal.mcpRead.salesSummary, { cafeId, range: args.range as any }),
  },
  {
    name: 'get_top_products',
    description: 'Best and worst selling products for a time range.',
    inputSchema: {
      type: 'object',
      properties: { range: RANGE, limit: { type: 'number', minimum: 1, maximum: 50 } },
      required: ['range'],
      additionalProperties: false,
    },
    run: (ctx, cafeId, args) =>
      ctx.runQuery(internal.mcpRead.topProducts, { cafeId, range: args.range as any, limit: args.limit as number | undefined }),
  },
  {
    name: 'get_low_stock',
    description: 'Ingredients at or below their reorder threshold.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: (ctx, cafeId) => ctx.runQuery(internal.mcpRead.lowStock, { cafeId }),
  },
];

export function getTool(name: string): McpTool | undefined {
  return MCP_TOOLS.find((t) => t.name === name);
}
```

- [ ] **Step 2: Typecheck** — Run: `pnpm typecheck` — Expected: clean.

- [ ] **Step 3: Commit** — `git commit -m "feat(mcp): tool registry"`

---

### Task 6: MCP JSON-RPC handler + auth

**Files:**
- Create: `convex/mcp.ts`
- Test: `tests/convex/mcp.test.ts`

**Interfaces:**
- Consumes: `MCP_TOOLS`, `getTool` (Task 5); `hashToken` (Task 1); `internal.accessTokens.resolve`, `internal.accessTokens.touchLastUsed`; `enforceRateLimit` pattern from `convex/lib/rateLimit.ts` (see `ai.rateLimit`).
- Produces: `handleMcpRequest(ctx: ActionCtx, req: Request): Promise<Response>`.

- [ ] **Step 1: Write failing tests** in `tests/convex/mcp.test.ts`: call `handleMcpRequest` via the httpAction (Task 8) or directly. Assert: (a) missing `Authorization` -> 401; (b) invalid token -> 401; (c) `initialize` returns `{ result: { protocolVersion, serverInfo, capabilities } }`; (d) `tools/list` returns all v1 tool names; (e) `tools/call` `get_kpis` with a valid token returns the kpis payload as tool content; (f) unknown method -> JSON-RPC error `-32601`; (g) unknown tool -> JSON-RPC error.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `convex/mcp.ts`**

```ts
import type { ActionCtx } from './_generated/server';
import { internal } from './_generated/api';
import { hashToken } from './lib/token';
import { getTool, MCP_TOOLS } from './lib/mcpTools';

const PROTOCOL_VERSION = '2025-06-18';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const rpcError = (id: unknown, code: number, message: string) => json({ jsonrpc: '2.0', id, error: { code, message } });
const rpcOk = (id: unknown, result: unknown) => json({ jsonrpc: '2.0', id, result });

export async function handleMcpRequest(ctx: ActionCtx, req: Request): Promise<Response> {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'missing bearer token' } }, 401);

  const tokenHash = await hashToken(token);
  const resolved = await ctx.runQuery(internal.accessTokens.resolve, { tokenHash });
  if (!resolved) return json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'invalid token' } }, 401);

  const body = (await req.json().catch(() => null)) as
    | { jsonrpc?: string; id?: unknown; method?: string; params?: any }
    | null;
  if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string') return rpcError(null, -32600, 'invalid request');
  const { id, method, params } = body;

  if (method === 'initialize') {
    return rpcOk(id, {
      protocolVersion: PROTOCOL_VERSION,
      serverInfo: { name: 'kodapos', version: '1.0.0' },
      capabilities: { tools: {} },
    });
  }
  if (method === 'notifications/initialized') return new Response(null, { status: 202 });
  if (method === 'tools/list') {
    return rpcOk(id, { tools: MCP_TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
  }
  if (method === 'tools/call') {
    const name = params?.name as string | undefined;
    const tool = name ? getTool(name) : undefined;
    if (!tool) return rpcError(id, -32602, `unknown tool: ${name}`);
    await ctx.runMutation(internal.accessTokens.touchLastUsed, { tokenHash });
    try {
      const data = await tool.run(ctx, resolved.cafeId, (params?.arguments ?? {}) as Record<string, unknown>);
      return rpcOk(id, { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
    } catch (e) {
      return rpcOk(id, {
        isError: true,
        content: [{ type: 'text', text: e instanceof Error ? e.message : 'tool error' }],
      });
    }
  }
  return rpcError(id, -32601, `unknown method: ${method}`);
}
```

Add per-token rate limiting: before dispatching `tools/call`, call the existing rate-limit path keyed by the token hash (mirror `ai.rateLimit`, but key `mcp:<tokenHash>`); on limit exceeded return a JSON-RPC error with a clear message. Follow `convex/lib/rateLimit.ts` `enforceRateLimit` signature exactly.

- [ ] **Step 4: Codegen + run test, expect PASS.**

- [ ] **Step 5: Commit** — `git commit -m "feat(mcp): JSON-RPC handler with token auth"`

---

### Task 7: Register `POST /mcp` route

**Files:**
- Modify: `convex/http.ts`
- Test: `tests/convex/mcp.test.ts` (drive via `t.fetch('/mcp', ...)` if the convex-test http helper is available; otherwise the Task 6 direct tests cover behavior).

**Interfaces:**
- Consumes: `handleMcpRequest` (Task 6).

- [ ] **Step 1: Add the route to `convex/http.ts`** (after the existing routes, before `export default http;`)

```ts
import { handleMcpRequest } from './mcp';

http.route({
  path: '/mcp',
  method: 'POST',
  handler: httpAction((ctx, req) => handleMcpRequest(ctx, req)),
});
```

- [ ] **Step 2: Codegen + typecheck + test** — Run: `./node_modules/.bin/convex codegen && pnpm typecheck && ./node_modules/.bin/vitest run tests/convex/mcp.test.ts` — Expected: PASS.

- [ ] **Step 3: Commit** — `git commit -m "feat(mcp): register POST /mcp http route"`

---

### Task 8: Settings UI — token management card

**Files:**
- Create: `src/components/settings/mcp-access-card.tsx`
- Modify: `src/routes/_pos/settings/integrations.tsx` (render the card)
- Test: manual (Task 9) + typecheck.

**Interfaces:**
- Consumes: `api.accessTokens.list`, `api.accessTokens.create`, `api.accessTokens.revoke`; `api.cafes.myCafe` (for the current outlet id/name).

- [ ] **Step 1: Build `mcp-access-card.tsx`** — a shadcn `Card` titled "Hubungkan asisten AI (MCP)" ("Connect AI assistant (MCP)") that:
  - Shows a one-line explainer that access is read-only.
  - Lists tokens (`useQuery(api.accessTokens.list)`) in a table (name, outlet, created, last used) with a Revoke `RowActions` item behind a `ConfirmDialog`. Empty state uses the shadcn `Empty` component (icon + heading + description).
  - "Buat token" ("Create token") opens a dialog: name input (+ outlet defaults to `myCafe`), calls `create`, then shows the returned token ONCE in a read-only field with a copy button and a copyable MCP config snippet:
    ```
    { "mcpServers": { "kodapos": { "url": "https://<deployment>.convex.site/mcp", "headers": { "Authorization": "Bearer <token>" } } } }
    ```
    Warn that the token is shown only once. Use `import.meta.env.VITE_CONVEX_URL` to derive the `.convex.site` base (replace `.convex.cloud` with `.convex.site`).
  - All copy Indonesian source + English, no em-dash, shadcn primitives.

- [ ] **Step 2: Render the card** in `src/routes/_pos/settings/integrations.tsx` alongside the existing integration cards.

- [ ] **Step 3: Extract + typecheck** — Run: `pnpm lingui:extract && pnpm lingui:compile && pnpm typecheck` — fill the `en` translations for new strings — Expected: clean.

- [ ] **Step 4: Commit** — `git commit -m "feat(mcp): settings card to create/revoke MCP access tokens"`

---

### Task 9: End-to-end verification against a real MCP client

**Files:** none (verification task).

- [ ] **Step 1:** `pnpm dev` and `pnpm convex:dev`. In settings/integrations, create a token for the dev outlet; copy the `/mcp` URL + token.
- [ ] **Step 2:** Configure Claude Desktop (or `npx mcp-remote <url> --header "Authorization: Bearer <token>"`) to add the kodapos MCP server. Confirm the tools appear (`tools/list`).
- [ ] **Step 3:** In the AI client, ask "what were my sales in the last 30 days?" and "what is low on stock?" — confirm `get_sales_summary` / `get_low_stock` return correct scoped data.
- [ ] **Step 4:** Revoke the token in settings; confirm the client can no longer call tools (401).
- [ ] **Step 5:** If the client cannot connect over plain HTTP JSON (transport/SSE mismatch), record the exact error and escalate to the Cloudflare Worker front fallback (spec section 10) before shipping. Otherwise, the feature is complete.

---

## Deferred to a fast-follow (not in this plan)

- Additional read tools: `get_sales_by_day`, `get_payment_breakdown`, `list_customers`, `get_forecast`, `get_profit_loss`, and `{from,to}` custom ranges. Each follows the Task 3 + 4 + 5 pattern (extract a `compute*` helper, add an `internal.mcpRead.*` query, add a `MCP_TOOLS` entry) with its own tests.
- OAuth authorization server (Cloudflare Worker front) for claude.ai / ChatGPT.
- Curated write tools with per-action scopes.

## Self-review notes

- Spec coverage: table (T1), auth flow (T1/T6), owner mgmt + UX (T2/T8), tools + refactor (T3/T4/T5), protocol (T6/T7), error handling + rate limit (T6), tests + cross-tenant isolation (T1/T2/T4/T6), transport risk (T9). v1 tool set is a deliberate subset of the spec's list; the rest is explicitly deferred above.
- Read-only invariant holds: tools only call `internal.mcpRead.*` queries; no mutation is reachable from a tool; args never carry a `cafeId`.
- Type consistency: `compute*` helper names in T3 match their uses in T4; `internal.mcpRead.*` names in T4 match T5's `run` calls; `handleMcpRequest` name matches T6/T7.
