import { v } from 'convex/values';
import { api, internal } from './_generated/api';
import { action, internalMutation, internalQuery } from './_generated/server';
import type { ActionCtx } from './_generated/server';
import { requireOwnerCafe } from './lib/auth';
import { enforceRateLimit } from './lib/rateLimit';
import {
  type AiProvider,
  ASK_SYSTEM_PROMPT,
  buildLLMRequest,
  type ChatMsg,
  INSIGHTS_SYSTEM_PROMPT,
  normalizeHistory,
  parseLLMResponse,
  RESTOCK_SYSTEM_PROMPT,
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

/** Fixed-window AI usage limit per cafe (bounds runaway token cost on the
 * owner's key; the client is already single-flight). */
const AI_WINDOW_MS = 10 * 60_000;
// Cafe-wide budget (shared across the dashboard card, ask box, and chat page,
// and across devices) — a cost ceiling on the owner's key, not a per-surface cap.
const AI_MAX_PER_WINDOW = 40;

type AiConfig = { provider: AiProvider; apiKey: string; model: string };

/**
 * Per-cafe rate gate for the AI actions, run (via runMutation) at the START of
 * each action before any data-gathering or LLM call. Owner-scoped.
 */
export const rateLimit = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await enforceRateLimit(ctx, {
      identifier: `ai:${cafeId}`,
      windowMs: AI_WINDOW_MS,
      max: AI_MAX_PER_WINDOW,
      message: 'Batas penggunaan AI tercapai. Coba lagi sebentar.',
    });
    return null;
  },
});

/** Gathers a compact JSON snapshot of the cafe's last-30-days data for the prompt. */
async function gatherSummary(ctx: ActionCtx): Promise<string> {
  const range = { preset: 'last30' } as const;
  // The summary is optional grounding context: if one query fails (transient
  // read error, odd data shape), omit that section rather than failing the
  // whole assistant call.
  const [cafe, kpis, overview, products, lowStock] = await Promise.all([
    ctx.runQuery(api.cafes.myCafe, {}).catch(() => null),
    ctx.runQuery(api.dashboard.kpis, {}).catch(() => null),
    ctx.runQuery(api.reports.overview, { range }).catch(() => null),
    ctx.runQuery(api.reports.products, { range }).catch(() => null),
    ctx.runQuery(api.dashboard.lowStock, {}).catch(() => null),
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

async function callAi(cfg: AiConfig, system: string, messages: ChatMsg[]): Promise<string> {
  const req = buildLLMRequest(cfg.provider, cfg.model, cfg.apiKey, system, messages);

  // Bound a hung upstream connection so it fails cleanly instead of running to
  // the Convex action time limit.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  let res: Response;
  try {
    res = await fetch(req.url, {
      method: 'POST',
      headers: req.headers,
      body: req.body,
      signal: controller.signal,
    });
  } catch {
    throw new Error('Gagal memanggil AI (waktu habis atau jaringan bermasalah).');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // Keep the raw provider body server-side only (it can carry account/quota
    // metadata); surface just the status to the client.
    const detail = await res.text().catch(() => '');
    console.error(`AI provider error ${res.status}: ${detail.slice(0, 500)}`);
    throw new Error(`Gagal memanggil AI (${res.status}).`);
  }
  const json = await res.json();
  return parseLLMResponse(cfg.provider, json);
}

/** Generate a plain-language briefing of the cafe's recent performance. */
export const insights = action({
  args: {},
  returns: v.string(),
  handler: async (ctx): Promise<string> => {
    const cfg: AiConfig | null = await ctx.runQuery(internal.ai.config, {});
    if (!cfg) throw new Error('AI belum dikonfigurasi. Hubungkan di Pengaturan, Integrasi.');
    await ctx.runMutation(internal.ai.rateLimit, {});
    const data = await gatherSummary(ctx);
    return callAi(cfg, INSIGHTS_SYSTEM_PROMPT, [
      { role: 'user', content: `Cafe data (JSON):\n${data}` },
    ]);
  },
});

/** Answer an owner question grounded in the cafe's recent data. */
export const ask = action({
  args: { question: v.string() },
  returns: v.string(),
  handler: async (ctx, { question }): Promise<string> => {
    const q = question.trim().slice(0, 4000);
    if (!q) throw new Error('Pertanyaan kosong.');
    const cfg: AiConfig | null = await ctx.runQuery(internal.ai.config, {});
    if (!cfg) throw new Error('AI belum dikonfigurasi. Hubungkan di Pengaturan, Integrasi.');
    await ctx.runMutation(internal.ai.rateLimit, {});
    const data = await gatherSummary(ctx);
    return callAi(cfg, ASK_SYSTEM_PROMPT, [
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
  handler: async (ctx, { messages }): Promise<string> => {
    // Bound the history (last 12 turns) and per-message length to cap token
    // cost, then normalize to alternating roles (required by Anthropic).
    const history = normalizeHistory(
      messages.slice(-12).map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
    );
    if (history.length === 0 || history[history.length - 1]!.role !== 'user') {
      throw new Error('Pertanyaan kosong.');
    }
    const cfg: AiConfig | null = await ctx.runQuery(internal.ai.config, {});
    if (!cfg) throw new Error('AI belum dikonfigurasi. Hubungkan di Pengaturan, Integrasi.');
    await ctx.runMutation(internal.ai.rateLimit, {});
    const data = await gatherSummary(ctx);
    const system = `${ASK_SYSTEM_PROMPT}\n\nCafe data (JSON):\n${data}`;
    return callAi(cfg, system, history);
  },
});

/**
 * Compact JSON snapshot for the restock advisor: the heuristic shopping list
 * (ingredients to buy with suggested qty + current stock) plus the demand
 * forecast (so the model can explain *why* each quantity makes sense). Returns
 * `learning` when the forecast hasn't activated yet, and the line count so the
 * action can skip the LLM call when there's nothing to order.
 */
async function gatherRestock(
  ctx: ActionCtx
): Promise<{ json: string; lineCount: number; learning: boolean }> {
  const [cafe, restock, demand] = await Promise.all([
    ctx.runQuery(api.cafes.myCafe, {}).catch(() => null),
    ctx.runQuery(api.restock.suggestion, {}).catch(() => null),
    ctx.runQuery(api.forecast.demand, {}).catch(() => null),
  ]);
  if (!restock || restock.status === 'learning') {
    return { json: '', lineCount: 0, learning: true };
  }
  const demandLines =
    demand?.status === 'ready'
      ? demand.lines
          .slice(0, 12)
          .map((l) => ({
            name: l.name,
            tomorrowQty: l.tomorrowQty,
            sevenDayQty: l.sevenDayQty,
            drivers: l.drivers,
          }))
      : [];
  const summary = {
    cafe: cafe?.name ?? 'Cafe',
    restock: restock.lines.map((l) => ({
      name: l.name,
      unit: l.unit,
      suggestedQty: l.suggestedQty,
      currentStockQty: l.currentStockQty,
    })),
    demand: demandLines,
  };
  return { json: JSON.stringify(summary), lineCount: restock.lines.length, learning: false };
}

/**
 * Turn the heuristic shopping list + demand forecast into a plain-language
 * restock briefing (what to order, how much, and why). Skips the LLM call (and
 * the rate-limit budget) when the forecast is still learning or there's nothing
 * to order, returning a fixed off-catalog message instead.
 */
export const restock = action({
  args: {},
  returns: v.string(),
  handler: async (ctx): Promise<string> => {
    const cfg: AiConfig | null = await ctx.runQuery(internal.ai.config, {});
    if (!cfg) throw new Error('AI belum dikonfigurasi. Hubungkan di Pengaturan, Integrasi.');
    // Rate-limit before gathering, not just before the LLM call: gatherRestock
    // runs computeDemand twice (each scans the trailing order window), so the cap
    // has to cover that work too — otherwise the learning / nothing-to-order
    // paths would be uncapped heavy reads. Config is checked first, so an
    // unconfigured caller throws without ever consuming the budget.
    await ctx.runMutation(internal.ai.rateLimit, {});
    const { json, lineCount, learning } = await gatherRestock(ctx);
    if (learning) {
      return 'Perkiraan permintaan masih belajar, jadi saran restock AI belum tersedia. Coba lagi setelah perkiraan aktif.';
    }
    if (lineCount === 0) {
      return 'Stok Anda cukup untuk minggu ini. Tidak ada bahan yang perlu dipesan sekarang.';
    }
    return callAi(cfg, RESTOCK_SYSTEM_PROMPT, [
      { role: 'user', content: `Cafe restock data (JSON):\n${json}` },
    ]);
  },
});
