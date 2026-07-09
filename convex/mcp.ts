import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { ActionCtx } from './_generated/server';
import { internalMutation } from './_generated/server';
import { getTool, MCP_TOOLS } from './lib/mcpTools';
import { enforceRateLimit } from './lib/rateLimit';
import { hashToken } from './lib/token';

const PROTOCOL_VERSION = '2025-06-18';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const rpcError = (id: unknown, code: number, message: string) =>
  json({ jsonrpc: '2.0', id, error: { code, message } });
const rpcOk = (id: unknown, result: unknown) => json({ jsonrpc: '2.0', id, result });

// Per-token budget for `tools/call`: bounds how much read load a single MCP
// client (or a leaked token) can put on a cafe's data in a short window.
// Independent from the AI action's per-cafe budget in `convex/ai.ts`
// (`ai:<cafeId>`) since this is keyed per-token, not per-cafe.
const MCP_WINDOW_MS = 60_000;
const MCP_MAX_PER_WINDOW = 30;

/**
 * Per-token rate gate for `tools/call`, run (via runMutation) right before
 * dispatching to the tool. Mirrors `ai.rateLimit`'s use of `enforceRateLimit`,
 * but keys the bucket by the token hash (`mcp:<tokenHash>`) since an MCP
 * caller is identified by its token, not by an authenticated cafe session.
 */
export const rateLimit = internalMutation({
  args: { tokenHash: v.string() },
  returns: v.null(),
  handler: async (ctx, { tokenHash }) => {
    await enforceRateLimit(ctx, {
      identifier: `mcp:${tokenHash}`,
      windowMs: MCP_WINDOW_MS,
      max: MCP_MAX_PER_WINDOW,
      message: 'Rate limit exceeded for this token. Please slow down and try again shortly.',
    });
    return null;
  },
});

export async function handleMcpRequest(ctx: ActionCtx, req: Request): Promise<Response> {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token)
    return json(
      { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'missing bearer token' } },
      401
    );

  const tokenHash = await hashToken(token);
  const resolved = await ctx.runQuery(internal.accessTokens.resolve, { tokenHash });
  if (!resolved)
    return json(
      { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'invalid token' } },
      401
    );

  const body = (await req.json().catch(() => null)) as {
    jsonrpc?: string;
    id?: unknown;
    method?: string;
    params?: any;
  } | null;
  if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
    return rpcError(null, -32600, 'invalid request');
  }
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
    return rpcOk(id, {
      tools: MCP_TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    });
  }
  if (method === 'tools/call') {
    const name = params?.name as string | undefined;
    const tool = name ? getTool(name) : undefined;
    if (!tool) return rpcError(id, -32602, `unknown tool: ${name}`);

    try {
      await ctx.runMutation(internal.mcp.rateLimit, { tokenHash });
    } catch (e) {
      return rpcError(id, -32000, e instanceof Error ? e.message : 'rate limit exceeded');
    }

    await ctx.runMutation(internal.accessTokens.touchLastUsed, { tokenHash });
    try {
      const data = await tool.run(
        ctx,
        resolved.cafeId,
        (params?.arguments ?? {}) as Record<string, unknown>
      );
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
