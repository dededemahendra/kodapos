import { convexTest } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

afterEach(() => vi.restoreAllMocks());

type Setup = {
  asOwner: ReturnType<ReturnType<typeof convexTest>['withIdentity']>;
  cafeId: Id<'cafes'>;
  cashierId: Id<'cafeStaff'>;
  shiftId: Id<'shifts'>;
  categoryId: Id<'categories'>;
  itemId: Id<'menuItems'>;
};

async function setup(
  t: ReturnType<typeof convexTest>,
  opts: { email?: string; taxEnabled?: boolean; taxRatePct?: number } = {}
): Promise<Setup> {
  const email = opts.email ?? 'o@x.com';
  const taxEnabled = opts.taxEnabled ?? false;
  const taxRatePct = opts.taxRatePct ?? 0;
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email });
  });
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  await asOwner.mutation(api.cafes.updateProfile, {
    name: 'Kopi Senja',
    timezone: 'Asia/Jakarta',
    taxRatePct,
    taxEnabled,
  });
  const cafe = await asOwner.query(api.cafes.myCafe, {});
  const cafeId = cafe!._id;
  const cashierId = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
  const shiftId = await asOwner.mutation(api.shifts.open, {
    cashierId,
    openingFloatIDR: 100000,
  });
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
  const itemId = await asOwner.mutation(api.menu.items.create, {
    categoryId,
    name: 'Espresso',
    priceIDR: 18000,
  });
  return { asOwner, cafeId, cashierId, shiftId, categoryId, itemId };
}

async function connectXendit(asOwner: Setup['asOwner']) {
  await asOwner.mutation(api.settings.connectQrisProvider, { secretApiKey: 'xnd_test_k', callbackToken: 'cb' });
}

function stubXendit(getBody: unknown) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method === 'POST') {
      return new Response(JSON.stringify({ id: 'qr_R', qr_string: 's', expires_at: '2099-01-01T00:00:00Z' }), { status: 201 });
    }
    return new Response(JSON.stringify(getBody), { status: 200 });
  });
}

async function seedPending(t: ReturnType<typeof convexTest>): Promise<Id<'orders'>> {
  const { asOwner, shiftId, cashierId, itemId } = await setup(t);
  await connectXendit(asOwner);
  const r = await asOwner.action(api.payments.qrisDynamic.createQrisDynamicSale, {
    clientId: 'rec-1', shiftId, cashierId, lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }], createdAtClient: 1,
  });
  return r.orderId as Id<'orders'>;
}

describe('reconcilePending', () => {
  it('settles a paid order', async () => {
    const t = convexTest(schema, modules);
    stubXendit({ status: 'ACTIVE', payments: [{ status: 'SUCCEEDED' }] });
    const orderId = await seedPending(t);
    const res = await t.action(internal.payments.qrisDynamic.reconcilePending, {});
    expect(res.settled).toBe(1);
    expect((await t.run((ctx) => ctx.db.get(orderId)))?.paymentStatus).toBe('paid');
  });

  it('voids an expired order', async () => {
    const t = convexTest(schema, modules);
    stubXendit({ status: 'INACTIVE', payments: [] });
    const orderId = await seedPending(t);
    const res = await t.action(internal.payments.qrisDynamic.reconcilePending, {});
    expect(res.voided).toBe(1);
    expect((await t.run((ctx) => ctx.db.get(orderId)))?.paymentStatus).toBe('void');
  });

  it('leaves a still-pending order', async () => {
    const t = convexTest(schema, modules);
    stubXendit({ status: 'ACTIVE', payments: [] });
    const orderId = await seedPending(t);
    const res = await t.action(internal.payments.qrisDynamic.reconcilePending, {});
    expect(res.left).toBe(1);
    expect((await t.run((ctx) => ctx.db.get(orderId)))?.paymentStatus).toBe('pending');
  });

  it('failsafe-voids unknown only when far past expiry', async () => {
    const t = convexTest(schema, modules);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_i, init) =>
      (init?.method ?? 'GET').toUpperCase() === 'POST'
        ? new Response(JSON.stringify({ id: 'qr_R', qr_string: 's', expires_at: '2099-01-01T00:00:00Z' }), { status: 201 })
        : new Response('err', { status: 500 })
    );
    const orderId = await seedPending(t);
    const r1 = await t.action(internal.payments.qrisDynamic.reconcilePending, {});
    expect(r1.left).toBe(1);
    expect((await t.run((ctx) => ctx.db.get(orderId)))?.paymentStatus).toBe('pending');
    await t.run(async (ctx) => {
      const p = await ctx.db.query('payments').withIndex('by_order', (q) => q.eq('orderId', orderId)).unique();
      if (p) await ctx.db.patch(p._id, { expiresAt: 1 });
    });
    const r2 = await t.action(internal.payments.qrisDynamic.reconcilePending, {});
    expect(r2.voided).toBe(1);
    expect((await t.run((ctx) => ctx.db.get(orderId)))?.paymentStatus).toBe('void');
  });
});
