import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api, internal } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { hashToken } from '../../convex/lib/token';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');
const TZ = 'Asia/Jakarta';
// UTC instant for a local WIB wall-clock time on a given date (h defaults to noon)
const wib = (y: number, mo: number, d: number, h = 12) => Date.UTC(y, mo - 1, d, h - 7, 0, 0);

type Refs = {
  asOwner: ReturnType<ReturnType<typeof convexTest>['withIdentity']>;
  userId: Id<'users'>;
  cafeId: Id<'cafes'>;
  cashierId: Id<'cafeStaff'>;
  shiftId: Id<'shifts'>;
  itemId: Id<'menuItems'>;
};

async function setup(t: ReturnType<typeof convexTest>, email = 'o@x.com'): Promise<Refs> {
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email }));
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
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
  const itemId = await asOwner.mutation(api.menu.items.create, {
    categoryId,
    name: 'Espresso',
    priceIDR: 18000,
  });
  return { asOwner, userId, cafeId, cashierId, shiftId, itemId };
}

/** Seed an `accessTokens` row (real `hashToken`) scoped to the given cafe/owner. */
async function seedAccessToken(
  t: ReturnType<typeof convexTest>,
  refs: Refs,
  raw: string
): Promise<void> {
  const tokenHash = await hashToken(raw);
  await t.run((ctx) =>
    ctx.db.insert('accessTokens', {
      userId: refs.userId,
      cafeId: refs.cafeId,
      tokenHash,
      name: 'mcp test token',
      createdAt: Date.now(),
    })
  );
}

async function seedOrder(
  t: ReturnType<typeof convexTest>,
  refs: Refs,
  opts: {
    at: number;
    total: number;
    method?: 'cash' | 'qris_static';
    lines: { name: string; qty: number; lineTotal: number }[];
  }
) {
  await t.run((ctx) =>
    ctx.db.insert('orders', {
      cafeId: refs.cafeId,
      shiftId: refs.shiftId,
      cashierId: refs.cashierId,
      clientId: `c-${opts.at}-${Math.round(opts.total)}`,
      lines: opts.lines.map((l) => ({
        menuItemId: refs.itemId,
        nameSnapshot: l.name,
        qty: l.qty,
        unitPriceIDR: Math.round(l.lineTotal / l.qty),
        modifiersSnapshot: [],
        lineTotalIDR: l.lineTotal,
      })),
      subtotalIDR: opts.total,
      taxRatePct: 0,
      taxIDR: 0,
      discountIDR: 0,
      totalIDR: opts.total,
      paymentMethod: opts.method ?? 'cash',
      paymentStatus: 'paid',
      createdAtClient: opts.at,
      syncedAt: opts.at,
    })
  );
}

describe('mcpRead', () => {
  it('salesSummary + topProducts aggregate the seeded cafe orders for the given cafeId', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await seedOrder(t, refs, {
      at: wib(2026, 5, 10),
      total: 20000,
      lines: [{ name: 'Espresso', qty: 2, lineTotal: 20000 }],
    });
    await seedOrder(t, refs, {
      at: wib(2026, 5, 11),
      total: 30000,
      lines: [{ name: 'Latte', qty: 1, lineTotal: 30000 }],
    });

    const summary = await t.query(internal.mcpRead.salesSummary, {
      cafeId: refs.cafeId,
      range: { from: '2026-05-10', to: '2026-05-11' },
    });
    expect(summary.revenueIDR).toBe(50000);
    expect(summary.orders).toBe(2);
    expect(summary.aovIDR).toBe(25000);
    expect(summary.itemsSold).toBe(3);

    const top = await t.query(internal.mcpRead.topProducts, {
      cafeId: refs.cafeId,
      range: { from: '2026-05-10', to: '2026-05-11' },
    });
    expect(top.items).toEqual([
      { name: 'Latte', qty: 1, revenueIDR: 30000 },
      { name: 'Espresso', qty: 2, revenueIDR: 20000 },
    ]);
  });

  it('topProducts caps at min(limit, 50)', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await seedOrder(t, refs, {
      at: wib(2026, 5, 10),
      total: 50000,
      lines: [
        { name: 'Espresso', qty: 2, lineTotal: 20000 },
        { name: 'Latte', qty: 1, lineTotal: 30000 },
      ],
    });

    const top = await t.query(internal.mcpRead.topProducts, {
      cafeId: refs.cafeId,
      range: { from: '2026-05-10', to: '2026-05-10' },
      limit: 1,
    });
    expect(top.items).toEqual([{ name: 'Latte', qty: 1, revenueIDR: 30000 }]);
  });

  it('cafeInfo, kpis, and lowStock resolve for the given cafeId', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);

    const info = await t.query(internal.mcpRead.cafeInfo, { cafeId: refs.cafeId });
    expect(info).toMatchObject({ name: 'Kopi Senja', timezone: TZ, currency: 'IDR' });

    const kpis = await t.query(internal.mcpRead.kpis, { cafeId: refs.cafeId });
    expect(kpis.orders).toBe(0);

    const low = await t.query(internal.mcpRead.lowStock, { cafeId: refs.cafeId });
    expect(low).toEqual({ count: 0, items: [] });
  });

  it('cross-tenant isolation: cafe B data never appears in cafe A results', async () => {
    const t = convexTest(schema, modules);
    const a = await setup(t, 'a@x.com');
    await seedOrder(t, a, {
      at: wib(2026, 5, 10),
      total: 20000,
      lines: [{ name: 'Espresso', qty: 1, lineTotal: 20000 }],
    });

    const b = await setup(t, 'b@x.com');
    await seedOrder(t, b, {
      at: wib(2026, 5, 10),
      total: 99999,
      lines: [{ name: 'Secret', qty: 1, lineTotal: 99999 }],
    });

    const aSummary = await t.query(internal.mcpRead.salesSummary, {
      cafeId: a.cafeId,
      range: { from: '2026-05-10', to: '2026-05-10' },
    });
    expect(aSummary.revenueIDR).toBe(20000);
    expect(aSummary.orders).toBe(1);

    const aTop = await t.query(internal.mcpRead.topProducts, {
      cafeId: a.cafeId,
      range: { from: '2026-05-10', to: '2026-05-10' },
    });
    expect(aTop.items.map((i) => i.name)).toEqual(['Espresso']);
    expect(aTop.items.some((i) => i.name === 'Secret')).toBe(false);

    const aInfo = await t.query(internal.mcpRead.cafeInfo, { cafeId: a.cafeId });
    expect(aInfo.name).toBe('Kopi Senja');

    // cafe B's own summary only sees its own order, never cafe A's.
    const bSummary = await t.query(internal.mcpRead.salesSummary, {
      cafeId: b.cafeId,
      range: { from: '2026-05-10', to: '2026-05-10' },
    });
    expect(bSummary.revenueIDR).toBe(99999);
    expect(bSummary.orders).toBe(1);
  });
});

describe('POST /mcp', () => {
  const RAW_TOKEN = 'kpat_testtoken0000000000000000000000000000';

  it('missing Authorization header -> 401', async () => {
    const t = convexTest(schema, modules);
    await setup(t);
    const res = await t.fetch('/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    expect(res.status).toBe(401);
  });

  it('invalid token -> 401', async () => {
    const t = convexTest(schema, modules);
    await setup(t);
    const res = await t.fetch('/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: 'Bearer kpat_bogus' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    expect(res.status).toBe(401);
  });

  it('initialize returns protocolVersion, serverInfo, capabilities', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await seedAccessToken(t, refs, RAW_TOKEN);
    const res = await t.fetch('/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${RAW_TOKEN}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toMatchObject({
      protocolVersion: expect.any(String),
      serverInfo: { name: expect.any(String), version: expect.any(String) },
      capabilities: { tools: {} },
    });
  });

  it('tools/list returns all 5 tool names', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await seedAccessToken(t, refs, RAW_TOKEN);
    const res = await t.fetch('/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${RAW_TOKEN}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const names = (body.result.tools as { name: string }[]).map((tool) => tool.name).sort();
    expect(names).toEqual(
      ['get_cafe_info', 'get_kpis', 'get_low_stock', 'get_sales_summary', 'get_top_products'].sort()
    );
  });

  it('tools/call get_kpis with a valid token returns tool content', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await seedAccessToken(t, refs, RAW_TOKEN);
    const res = await t.fetch('/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${RAW_TOKEN}` },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'get_kpis', arguments: {} },
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.content).toEqual([{ type: 'text', text: expect.any(String) }]);
    const parsed = JSON.parse(body.result.content[0].text);
    expect(parsed).toHaveProperty('orders');
  });

  it('unknown method -> JSON-RPC error -32601', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await seedAccessToken(t, refs, RAW_TOKEN);
    const res = await t.fetch('/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${RAW_TOKEN}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'not/a/method', params: {} }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error.code).toBe(-32601);
  });

  it('unknown tool name -> JSON-RPC error', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await seedAccessToken(t, refs, RAW_TOKEN);
    const res = await t.fetch('/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${RAW_TOKEN}` },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: { name: 'nope', arguments: {} },
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error.code).toBe(-32602);
  });
});
