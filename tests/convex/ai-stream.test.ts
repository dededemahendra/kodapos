import { convexTest } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';
import { mockStreamingProvider, OPENAI_SSE, post, readEvents } from './helpers/ai-stream';

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
  await asOwner.mutation(api.cafes.updateProfile, {
    name: 'Kopi Senja',
    timezone: TZ,
    taxRatePct: 0,
    taxEnabled: false,
  });
  const cafe = await asOwner.query(api.cafes.myCafe, {});
  const cafeId = cafe!._id as Id<'cafes'>;
  const cashierId = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
  const shiftId = await asOwner.mutation(api.shifts.open, { cashierId, openingFloatIDR: 100000 });
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Minuman' });
  const itemKopi = await asOwner.mutation(api.menu.items.create, {
    categoryId,
    name: 'Kopi',
    priceIDR: 15000,
  });
  const ingSusu = await asOwner.mutation(api.ingredients.upsert, {
    name: 'Susu',
    canonicalUnit: 'ml',
    reorderThreshold: 0,
    lastCostPerUnitIDR: 100,
  });
  await asOwner.mutation(api.recipes.upsert, {
    menuItemId: itemKopi,
    lines: [{ ingredientId: ingSusu, qty: 50, wastageFactor: 1 }],
  });
  return { asOwner, cafeId, cashierId, shiftId, itemKopi, ingSusu };
}

async function seedSales(
  t: ReturnType<typeof convexTest>,
  refs: Refs,
  days: number,
  nowMs: number
) {
  for (let d = 1; d <= days; d++) {
    const at = nowMs - d * DAY;
    await t.run((ctx) =>
      ctx.db.insert('orders', {
        cafeId: refs.cafeId,
        shiftId: refs.shiftId,
        cashierId: refs.cashierId,
        clientId: `c-${d}`,
        lines: [
          {
            menuItemId: refs.itemKopi,
            nameSnapshot: 'Kopi',
            qty: 10,
            unitPriceIDR: 15000,
            modifiersSnapshot: [],
            lineTotalIDR: 150000,
          },
        ],
        subtotalIDR: 150000,
        taxRatePct: 0,
        taxIDR: 0,
        discountIDR: 0,
        totalIDR: 150000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        createdAtClient: at,
        syncedAt: at,
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

describe('POST /ai/stream', () => {
  afterEach(() => vi.restoreAllMocks());

  it('rejects an unauthenticated caller with 401', async () => {
    const t = convexTest(schema, modules);
    const res = await post(t, { kind: 'insights', locale: 'id' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ code: 'unauthorized' });
  });

  it('returns 400 not_configured when no AI key is connected', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    const res = await post(refs.asOwner, { kind: 'insights', locale: 'id' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: 'not_configured' });
  });

  it('returns 400 bad_request for an unknown kind', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await connectAi(refs);
    const res = await post(refs.asOwner, { kind: 'summarise' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: 'bad_request' });
  });

  it('streams deltas then done, and sends stream:true to the provider', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await connectAi(refs, 'openai', 'gpt-4o-mini');
    await seedSales(t, refs, 20, Date.now());
    const { captured } = mockStreamingProvider(OPENAI_SSE);
    const res = await post(refs.asOwner, { kind: 'insights', locale: 'id' });
    expect(res.status).toBe(200);
    expect(JSON.parse(captured.body).stream).toBe(true);
    expect(await readEvents(res)).toEqual([
      { t: 'delta', v: 'Beli 5000 ml ' },
      { t: 'delta', v: 'Susu.' },
      { t: 'done' },
    ]);
  });

  it('echoes an allowed origin in the CORS header', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await connectAi(refs);
    await seedSales(t, refs, 20, Date.now());
    mockStreamingProvider(OPENAI_SSE);
    const res = await post(refs.asOwner, { kind: 'insights', locale: 'id' });
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
  });

  it('answers the CORS preflight', async () => {
    const t = convexTest(schema, modules);
    const res = await t.fetch('/ai/stream', {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:3000' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-headers')).toContain('authorization');
  });

  it('returns 502 provider when the provider rejects the request', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await connectAi(refs);
    await seedSales(t, refs, 20, Date.now());
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 401 }));
    const res = await post(refs.asOwner, { kind: 'insights', locale: 'id' });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ code: 'provider' });
  });

  it('emits an in-band empty error when the stream produces no text', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await connectAi(refs);
    await seedSales(t, refs, 20, Date.now());
    mockStreamingProvider('data: [DONE]\n');
    const res = await post(refs.asOwner, { kind: 'insights', locale: 'id' });
    expect(res.status).toBe(200);
    expect(await readEvents(res)).toEqual([{ t: 'error', code: 'empty' }]);
  });

  it('returns 429 once the per-cafe window is exhausted', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await connectAi(refs);
    await seedSales(t, refs, 20, Date.now());
    mockStreamingProvider(OPENAI_SSE);
    // 40 calls per 10-minute window; the 41st must be refused.
    for (let i = 0; i < 40; i++) {
      const ok = await post(refs.asOwner, { kind: 'insights', locale: 'id' });
      expect(ok.status).toBe(200);
      await ok.text();
    }
    const res = await post(refs.asOwner, { kind: 'insights', locale: 'id' });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ code: 'rate_limited' });
  });

  it('sends chat history with the cafe data in the system prompt', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await connectAi(refs, 'anthropic', 'claude-3-5-haiku-20241022');
    await seedSales(t, refs, 20, Date.now());
    const { captured } = mockStreamingProvider(
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Halo"}}\n' +
        'data: {"type":"message_stop"}\n'
    );
    const res = await post(refs.asOwner, {
      kind: 'chat',
      locale: 'id',
      messages: [{ role: 'user', content: 'Berapa penjualan?' }],
    });
    const body = JSON.parse(captured.body);
    expect(body.system).toContain('Cafe data (JSON)');
    expect(body.messages).toEqual([{ role: 'user', content: 'Berapa penjualan?' }]);
    expect(await readEvents(res)).toEqual([{ t: 'delta', v: 'Halo' }, { t: 'done' }]);
  });
});
