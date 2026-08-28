import { convexTest } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import schema from '../../convex/schema';
import {
  connectAi,
  mockStreamingProvider,
  post,
  readEvents,
  seedSales,
  setup,
} from './helpers/ai-stream';

const modules = import.meta.glob('../../convex/**/*.*s');

describe('/ai/stream — restock', () => {
  afterEach(() => vi.restoreAllMocks());

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
});
