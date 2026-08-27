import { v } from 'convex/values';
import { api, internal } from './_generated/api';
import type { ActionCtx } from './_generated/server';
import { internalMutation, internalQuery } from './_generated/server';
import {
  type AiErrorCode,
  type AiProvider,
  type AiStreamRequest,
  ASK_SYSTEM_PROMPT,
  buildLLMRequest,
  type ChatMsg,
  INSIGHTS_SYSTEM_PROMPT,
  languageInstruction,
  parseProvider,
  parseStreamBody,
  RESTOCK_SYSTEM_PROMPT,
} from './lib/ai';
import { createSSEDecoder } from './lib/aiSse';
import { requireActiveOutlet } from './lib/auth';
import { corsHeaders } from './lib/cors';
import { enforceRateLimit } from './lib/rateLimit';

/**
 * Server-only read of the connected AI integration config, including the secret
 * API key. Internal so it never reaches the client; auth propagates from the
 * calling action, so `requireActiveOutlet` scopes it to the owner.
 */
export const config = internalQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      provider: v.union(v.literal('openai'), v.literal('anthropic'), v.literal('openrouter')),
      apiKey: v.string(),
      model: v.string(),
    })
  ),
  handler: async (ctx) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const row = await ctx.db
      .query('cafeSettings')
      .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
      .first();
    const ai = row?.integrations?.find((i) => i.key === 'ai' && i.connected);
    const c = ai?.config as { provider?: string; apiKey?: string; model?: string } | undefined;
    if (!c?.apiKey || !c.model) return null;
    // Unrecognized provider resolves to null rather than OpenAI, so a key saved
    // for some other vendor is never sent to api.openai.com. Reads as
    // not-configured, which the callers already surface as "connect a key".
    const provider = parseProvider(c.provider);
    if (!provider) return null;
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
    const { cafeId } = await requireActiveOutlet(ctx);
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
      ? demand.lines.slice(0, 12).map((l) => ({
          name: l.name,
          tomorrowQty: l.tomorrowQty,
          sevenDayQty: l.sevenDayQty,
          drivers: l.drivers,
        }))
      : [];
  const summary = {
    cafe: cafe?.name ?? 'Cafe',
    restock: restock.lines.slice(0, 20).map((l) => ({
      name: l.name,
      unit: l.unit,
      suggestedQty: l.suggestedQty,
      currentStockQty: l.currentStockQty,
    })),
    demand: demandLines,
  };
  return { json: JSON.stringify(summary), lineCount: restock.lines.length, learning: false };
}

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

  // Set by `cancel()` when the consumer goes away (the owner pressed stop, or
  // navigated) while `start()`'s loop is still running. `start()`'s promise
  // keeps executing after cancellation — ReadableStream does not interrupt
  // it — so without this guard the `finally` block below would call
  // `enqueue`/`close` on a controller the runtime already closed, which
  // throws `TypeError: Invalid state: Controller is already closed`.
  let cancelled = false;

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
        // The loop above always finishes its last `reader.read()` before
        // reaching here (via `break` or the catch), so no read is pending —
        // safe to release unconditionally, cancelled or not.
        reader.releaseLock();
        clearTimeout(timer);
        // The consumer may have gone away mid-generation; its controller is
        // already closed, so emitting a terminal event here would throw.
        if (!cancelled) {
          const final = failure ?? (produced ? null : 'empty');
          c.enqueue(
            final ? ndjson(encoder, { t: 'error', code: final }) : ndjson(encoder, { t: 'done' })
          );
          c.close();
        }
      }
    },
    cancel() {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    },
  });

  return new Response(stream, { headers: streamHeaders });
}
