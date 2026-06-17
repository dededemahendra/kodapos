import { v } from 'convex/values';
import { api, internal } from './_generated/api';
import { action, internalQuery } from './_generated/server';
import type { ActionCtx } from './_generated/server';
import { requireOwnerCafe } from './lib/auth';
import {
  type AiProvider,
  ASK_SYSTEM_PROMPT,
  buildLLMRequest,
  type ChatMsg,
  INSIGHTS_SYSTEM_PROMPT,
  parseLLMResponse,
} from './lib/ai';

/**
 * Server-only read of the connected AI integration config, including the secret
 * API key. Internal so it never reaches the client; auth propagates from the
 * calling action, so `requireOwnerCafe` scopes it to the owner.
 */
export const config = internalQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      provider: v.union(v.literal('openai'), v.literal('anthropic')),
      apiKey: v.string(),
      model: v.string(),
    })
  ),
  handler: async (ctx) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const row = await ctx.db
      .query('cafeSettings')
      .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
      .first();
    const ai = row?.integrations?.find((i) => i.key === 'ai' && i.connected);
    const c = ai?.config as { provider?: string; apiKey?: string; model?: string } | undefined;
    if (!c?.apiKey || !c.model) return null;
    const provider: AiProvider = c.provider === 'anthropic' ? 'anthropic' : 'openai';
    return { provider, apiKey: c.apiKey, model: c.model };
  },
});

/** Gathers a compact JSON snapshot of the cafe's last-30-days data for the prompt. */
async function gatherSummary(ctx: ActionCtx): Promise<string> {
  const range = { preset: 'last30' } as const;
  const [cafe, kpis, overview, products, lowStock] = await Promise.all([
    ctx.runQuery(api.cafes.myCafe, {}),
    ctx.runQuery(api.dashboard.kpis, {}),
    ctx.runQuery(api.reports.overview, { range }),
    ctx.runQuery(api.reports.products, { range }),
    ctx.runQuery(api.dashboard.lowStock, {}),
  ]);
  const summary = {
    cafe: cafe?.name ?? 'Cafe',
    period: 'last 30 days',
    kpis,
    overview,
    topProducts: (products?.items ?? []).slice(0, 8).map((p) => ({
      name: p.name,
      qty: p.qty,
      revenueIDR: p.revenueIDR,
    })),
    lowStock: {
      count: lowStock?.count ?? 0,
      items: (lowStock?.items ?? []).map((i) => ({
        name: i.name,
        stock: i.currentStockQty,
        threshold: i.reorderThreshold,
        unit: i.unit,
      })),
    },
  };
  return JSON.stringify(summary);
}

async function callAi(ctx: ActionCtx, system: string, messages: ChatMsg[]): Promise<string> {
  const cfg = await ctx.runQuery(internal.ai.config, {});
  if (!cfg) throw new Error('AI belum dikonfigurasi. Hubungkan di Pengaturan, Integrasi.');
  const req = buildLLMRequest(cfg.provider, cfg.model, cfg.apiKey, system, messages);
  const res = await fetch(req.url, { method: 'POST', headers: req.headers, body: req.body });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Gagal memanggil AI (${res.status}). ${detail.slice(0, 150)}`.trim());
  }
  const json = await res.json();
  return parseLLMResponse(cfg.provider, json);
}

/** Generate a plain-language briefing of the cafe's recent performance. */
export const insights = action({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const data = await gatherSummary(ctx);
    return callAi(ctx, INSIGHTS_SYSTEM_PROMPT, [
      { role: 'user', content: `Cafe data (JSON):\n${data}` },
    ]);
  },
});

/** Answer an owner question grounded in the cafe's recent data. */
export const ask = action({
  args: { question: v.string() },
  returns: v.string(),
  handler: async (ctx, { question }) => {
    const q = question.trim();
    if (!q) throw new Error('Pertanyaan kosong.');
    const data = await gatherSummary(ctx);
    return callAi(ctx, ASK_SYSTEM_PROMPT, [
      { role: 'user', content: `Cafe data (JSON):\n${data}\n\nQuestion: ${q}` },
    ]);
  },
});

/** Multi-turn chat grounded in the cafe's recent data (the dedicated AI page). */
export const chat = action({
  args: {
    messages: v.array(
      v.object({
        role: v.union(v.literal('user'), v.literal('assistant')),
        content: v.string(),
      })
    ),
  },
  returns: v.string(),
  handler: async (ctx, { messages }) => {
    // Bound the history (last 12 turns) and per-message length to cap token cost.
    const history: ChatMsg[] = messages
      .filter((m) => m.content.trim())
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
    if (history.length === 0 || history[history.length - 1]!.role !== 'user') {
      throw new Error('Pertanyaan kosong.');
    }
    const data = await gatherSummary(ctx);
    const system = `${ASK_SYSTEM_PROMPT}\n\nCafe data (JSON):\n${data}`;
    return callAi(ctx, system, history);
  },
});
