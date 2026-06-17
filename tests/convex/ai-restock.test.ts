import { convexTest } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');
const TZ = 'Asia/Jakarta';
const DAY = 86_400_000;

type Refs = {
  asOwner: ReturnType<ReturnType<typeof convexTest>['withIdentity']>;
  cafeId: Id<'cafes'>;
  cashierId: Id<'cafeStaff'>;
  shiftId: Id<'shifts'>;
  itemKopi: Id<'menuItems'>;
  ingSusu: Id<'ingredients'>;
};

async function setup(t: ReturnType<typeof convexTest>): Promise<Refs> {
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' }));
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  await asOwner.mutation(api.cafes.updateProfile, { name: 'Kopi Senja', timezone: TZ, taxRatePct: 0, taxEnabled: false });
  const cafe = await asOwner.query(api.cafes.myCafe, {});
  const cafeId = cafe!._id as Id<'cafes'>;
  const cashierId = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
  const shiftId = await asOwner.mutation(api.shifts.open, { cashierId, openingFloatIDR: 100000 });
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Minuman' });
  const itemKopi = await asOwner.mutation(api.menu.items.create, { categoryId, name: 'Kopi', priceIDR: 15000 });
  const ingSusu = await asOwner.mutation(api.ingredients.upsert, { name: 'Susu', canonicalUnit: 'ml', reorderThreshold: 0, lastCostPerUnitIDR: 100 });
  await asOwner.mutation(api.recipes.upsert, { menuItemId: itemKopi, lines: [{ ingredientId: ingSusu, qty: 50, wastageFactor: 1 }] });
  return { asOwner, cafeId, cashierId, shiftId, itemKopi, ingSusu };
}

async function seedSales(t: ReturnType<typeof convexTest>, refs: Refs, days: number, nowMs: number) {
  for (let d = 1; d <= days; d++) {
    const at = nowMs - d * DAY;
    await t.run((ctx) =>
      ctx.db.insert('orders', {
        cafeId: refs.cafeId, shiftId: refs.shiftId, cashierId: refs.cashierId,
        clientId: `c-${d}`,
        lines: [{ menuItemId: refs.itemKopi, nameSnapshot: 'Kopi', qty: 10, unitPriceIDR: 15000, modifiersSnapshot: [], lineTotalIDR: 150000 }],
        subtotalIDR: 150000, taxRatePct: 0, taxIDR: 0, discountIDR: 0, totalIDR: 150000,
        paymentMethod: 'cash', paymentStatus: 'paid', createdAtClient: at, syncedAt: at,
      })
    );
  }
}

async function connectAi(
  refs: Refs,
  provider: 'openai' | 'anthropic' = 'openai',
  model = 'gpt-4o-mini'
) {
  await refs.asOwner.mutation(api.settings.connectAi, {
    provider,
    apiKey: provider === 'anthropic' ? 'sk-ant-test-key' : 'sk-test-key',
    model,
  });
}

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
