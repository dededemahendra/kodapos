import { convexTest } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../convex/_generated/api';
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

async function connectXendit(asOwner: Setup['asOwner'], token: string) {
  await asOwner.mutation(api.settings.connectQrisProvider, {
    secretApiKey: 'xnd_test_k',
    callbackToken: token,
  });
}

function stubXenditCreate(qrId: string) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({ id: qrId, qr_string: 's', expires_at: '2026-06-10T12:00:00Z' }),
      { status: 201 }
    )
  );
}

describe('POST /webhooks/qris/xendit', () => {
  it('settles with the cafe’s own token and rejects a wrong token', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await connectXendit(asOwner, 'tokenA');
    stubXenditCreate('qr_A');
    const r = await asOwner.action(api.payments.qrisDynamic.createQrisDynamicSale, {
      clientId: 'wh-A',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      createdAtClient: 1,
    });
    const body = JSON.stringify({
      event: 'qr.payment',
      data: { qr_id: 'qr_A', reference_id: r.orderId, status: 'SUCCEEDED' },
    });

    const bad = await t.fetch('/webhooks/qris/xendit', {
      method: 'POST',
      body,
      headers: { 'x-callback-token': 'WRONG' },
    });
    expect(bad.status).toBe(401);
    expect((await t.run((ctx) => ctx.db.get(r.orderId as Id<'orders'>)))?.paymentStatus).toBe(
      'pending'
    );

    const ok = await t.fetch('/webhooks/qris/xendit', {
      method: 'POST',
      body,
      headers: { 'x-callback-token': 'tokenA' },
    });
    expect(ok.status).toBe(200);
    expect((await t.run((ctx) => ctx.db.get(r.orderId as Id<'orders'>)))?.paymentStatus).toBe(
      'paid'
    );
  });

  it('acks 200 for an unknown providerRef and 400 for an unparseable body', async () => {
    const t = convexTest(schema, modules);
    await setup(t);
    const unknown = JSON.stringify({ data: { qr_id: 'qr_nope', status: 'SUCCEEDED' } });
    expect(
      (
        await t.fetch('/webhooks/qris/xendit', {
          method: 'POST',
          body: unknown,
          headers: { 'x-callback-token': 'x' },
        })
      ).status
    ).toBe(200);
    expect(
      (await t.fetch('/webhooks/qris/xendit', { method: 'POST', body: 'not-json', headers: {} }))
        .status
    ).toBe(400);
  });
});

describe('createQrisDynamicSale failure path', () => {
  it('voids the pending order when the provider charge fails', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await connectXendit(asOwner, 'tokenA');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"message":"bad"}', { status: 400 })
    );
    await expect(
      asOwner.action(api.payments.qrisDynamic.createQrisDynamicSale, {
        clientId: 'fail-1',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
        createdAtClient: 1,
      })
    ).rejects.toThrow();
    // The pending order was created then voided.
    const orders = await t.run((ctx) => ctx.db.query('orders').collect());
    expect(orders).toHaveLength(1);
    expect(orders[0]?.paymentStatus).toBe('void');
  });
});
