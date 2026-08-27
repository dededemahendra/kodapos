import { convexTest } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';
import { connectAi, seedSales, setup } from './helpers/ai-stream';

const modules = import.meta.glob('../../convex/**/*.*s');

/** Spies on fetch, captures the first request, and returns a canned provider body. */
function mockProvider(body: unknown) {
  const captured: { url: string; body: string } = { url: '', body: '' };
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    captured.url = String(url);
    captured.body = String(init?.body ?? '');
    return new Response(JSON.stringify(body), { status: 200 });
  });
  return { spy, captured };
}

describe('ai.restock', () => {
  afterEach(() => vi.restoreAllMocks());

  it('throws when the AI integration is not connected', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await expect(refs.asOwner.action(api.ai.restock, {})).rejects.toThrow(/belum dikonfigurasi/);
  });

  it('short-circuits (no LLM call) while the forecast is still learning', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await connectAi(refs);
    await seedSales(t, refs, 5, Date.now());
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const out = await refs.asOwner.action(api.ai.restock, {});
    expect(out).toMatch(/masih belajar/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends the restock prompt + gathered data to OpenAI and returns the briefing', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await connectAi(refs, 'openai', 'gpt-4o-mini');
    await seedSales(t, refs, 20, Date.now());
    const { spy, captured } = mockProvider({
      choices: [{ message: { content: 'Beli 5000 ml Susu minggu ini.' } }],
    });
    const out = await refs.asOwner.action(api.ai.restock, {});
    expect(spy).toHaveBeenCalledTimes(1);
    // The OpenAI endpoint, the restock system prompt (not insights/ask), and the
    // gathered shopping-list data must all actually reach the provider.
    expect(captured.url).toContain('api.openai.com');
    expect(captured.body).toContain('restock advisor');
    expect(captured.body).toContain('Susu');
    expect(out).toContain('Susu');
  });

  it('sends an Anthropic-shaped request and parses the content-block response', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await connectAi(refs, 'anthropic', 'claude-3-5-haiku-20241022');
    await seedSales(t, refs, 20, Date.now());
    const { spy, captured } = mockProvider({
      content: [{ type: 'text', text: 'Beli 5000 ml Susu minggu ini.' }],
    });
    const out = await refs.asOwner.action(api.ai.restock, {});
    expect(spy).toHaveBeenCalledTimes(1);
    expect(captured.url).toContain('api.anthropic.com');
    // Anthropic carries the instruction in a separate top-level `system` field.
    expect(captured.body).toContain('"system"');
    expect(captured.body).toContain('restock advisor');
    expect(captured.body).toContain('Susu');
    expect(out).toContain('Susu');
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
    const out = await refs.asOwner.action(api.ai.restock, {});
    expect(out).toMatch(/cukup/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
