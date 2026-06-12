import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

type AsOwner = ReturnType<ReturnType<typeof convexTest>['withIdentity']>;

type Setup = {
  t: ReturnType<typeof convexTest>;
  asOwner: AsOwner;
  cafeId: Id<'cafes'>;
  tableId: Id<'tables'>;
  qrToken: string;
  itemId: Id<'menuItems'>;
  variantLId: Id<'menuItemVariants'>;
  oatId: Id<'modifierOptions'>;
  regularId: Id<'modifierOptions'>;
};

/** Owner + cafe + a table (with a qrToken) + a sellable item w/ a variant + a
 * min/max modifier group, so the public `submitSelfOrder` can seed a `new`
 * self-order on the owner's table. */
async function setup(
  t: ReturnType<typeof convexTest>,
  opts: { email?: string; qrToken?: string } = {}
): Promise<Setup> {
  const email = opts.email ?? 'o@x.com';
  const qrToken = opts.qrToken ?? 'a'.repeat(32);
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email });
  });
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  await asOwner.mutation(api.cafes.updateProfile, {
    name: 'Kopi Senja',
    timezone: 'Asia/Jakarta',
    taxRatePct: 0,
    taxEnabled: false,
  });
  const cafe = await asOwner.query(api.cafes.myCafe, {});
  const cafeId = cafe!._id;

  const tableId = await asOwner.mutation(api.tables.create, { name: 'A1' });
  await t.run(async (ctx) => {
    await ctx.db.patch(tableId, { qrToken });
  });

  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
  const itemId = await asOwner.mutation(api.menu.items.create, {
    categoryId,
    name: 'Espresso',
    priceIDR: 18000,
  });
  const variantLId = await asOwner.mutation(api.menu.variants.create, {
    menuItemId: itemId,
    name: 'L',
    priceIDR: 25000,
  });
  const groupId = await asOwner.mutation(api.menu.modifierGroups.upsert, {
    name: 'Susu',
    required: true,
    minSelect: 1,
    maxSelect: 1,
    options: [
      { name: 'Reguler', priceAdjustmentIDR: 0, position: 0 },
      { name: 'Oat (+5k)', priceAdjustmentIDR: 5000, position: 1 },
    ],
  });
  await asOwner.mutation(api.menu.itemGroups.attach, {
    menuItemId: itemId,
    modifierGroupId: groupId,
  });
  const group = await asOwner.query(api.menu.modifierGroups.getById, { id: groupId });
  const oatId = group!.options.find((o) => o.name === 'Oat (+5k)')!._id;
  const regularId = group!.options.find((o) => o.name === 'Reguler')!._id;

  return { t, asOwner, cafeId, tableId, qrToken, itemId, variantLId, oatId, regularId };
}

/** Seed a `new` self-order on `s`'s table via the public intake. */
async function seedOrder(
  s: Setup,
  opts: { clientId?: string; note?: string } = {}
): Promise<Id<'selfOrders'>> {
  const { selfOrderId } = await s.t.mutation(api.public.submitSelfOrder, {
    qrToken: s.qrToken,
    clientId: opts.clientId ?? 'client-1',
    ...(opts.note ? { customerNote: opts.note } : {}),
    lines: [
      // variant L (25000) + Oat (+5000) → 30000, qty 2 → 60000
      { menuItemId: s.itemId, qty: 2, variantId: s.variantLId, modifierOptionIds: [s.oatId] },
      // base 18000 + Reguler (0) → 18000, qty 1 → 18000
      { menuItemId: s.itemId, qty: 1, modifierOptionIds: [s.regularId] },
    ],
  });
  return selfOrderId;
}

describe('selfOrders.queue', () => {
  it('lists pending orders newest-first with preview fields (owner-scoped)', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const id = await seedOrder(s, { clientId: 'c-1', note: 'Tanpa gula' });

    const queue = await s.asOwner.query(api.selfOrders.queue, {});
    expect(queue).toHaveLength(1);
    const row = queue.find((r) => r.id === id)!;
    expect(row).toBeTruthy();
    expect(row.tableName).toBe('A1');
    expect(row.lineCount).toBe(2);
    expect(row.subtotalIDR).toBe(78000); // 2*30000 + 1*18000
    expect(row.customerNote).toBe('Tanpa gula');
    expect(typeof row.createdAt).toBe('number');
    // lines preview carries display fields only.
    expect(row.lines).toHaveLength(2);
    expect(row.lines[0]!.nameSnapshot).toBe('Espresso');
    expect(row.lines[0]!.qty).toBe(2);
    expect(row.lines[0]!.variantName).toBe('L');
    expect(row.lines[0]!.modifierLabels).toContain('Oat (+5k)');
  });

  it('is newest-first by createdAt desc', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const first = await seedOrder(s, { clientId: 'c-a' });
    await s.t.run(async (ctx) => {
      await ctx.db.patch(first, { createdAt: 1 });
    });
    const second = await seedOrder(s, { clientId: 'c-b' });
    await s.t.run(async (ctx) => {
      await ctx.db.patch(second, { createdAt: 2 });
    });

    const queue = await s.asOwner.query(api.selfOrders.queue, {});
    expect(queue.map((r) => r.id)).toEqual([second, first]);
  });

  it("does NOT list another cafe's self-order (owner-scope)", async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await seedOrder(s, { clientId: 'mine' });
    const other = await setup(t, { email: 'o2@x.com', qrToken: 'b'.repeat(32) });
    await seedOrder(other, { clientId: 'theirs' });

    const mine = await s.asOwner.query(api.selfOrders.queue, {});
    expect(mine).toHaveLength(1);
    const theirs = await other.asOwner.query(api.selfOrders.queue, {});
    expect(theirs).toHaveLength(1);
    // The two queues are disjoint.
    expect(mine[0]!.id).not.toBe(theirs[0]!.id);
  });

  it('excludes accepted/rejected orders', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const a = await seedOrder(s, { clientId: 'acc' });
    const r = await seedOrder(s, { clientId: 'rej' });
    const keep = await seedOrder(s, { clientId: 'keep' });

    await s.asOwner.mutation(api.selfOrders.accept, { id: a });
    await s.asOwner.mutation(api.selfOrders.reject, { id: r });

    const queue = await s.asOwner.query(api.selfOrders.queue, {});
    expect(queue.map((q) => q.id)).toEqual([keep]);
  });
});

describe('selfOrders.accept / reject', () => {
  it('accept sets status accepted + acceptedAt', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const id = await seedOrder(s, { clientId: 'c' });
    await s.asOwner.mutation(api.selfOrders.accept, { id });
    const row = await s.t.run(async (ctx) => await ctx.db.get(id));
    expect(row!.status).toBe('accepted');
    expect(typeof row!.acceptedAt).toBe('number');
  });

  it('reject sets status rejected', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const id = await seedOrder(s, { clientId: 'c' });
    await s.asOwner.mutation(api.selfOrders.reject, { id });
    const row = await s.t.run(async (ctx) => await ctx.db.get(id));
    expect(row!.status).toBe('rejected');
  });

  it('owner-scope: accept/reject a foreign self-order throws', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const id = await seedOrder(s, { clientId: 'c' });
    const other = await setup(t, { email: 'o2@x.com', qrToken: 'b'.repeat(32) });
    await expect(other.asOwner.mutation(api.selfOrders.accept, { id })).rejects.toThrow();
    await expect(other.asOwner.mutation(api.selfOrders.reject, { id })).rejects.toThrow();
  });
});

describe('selfOrders.getForCart', () => {
  it('returns the recall payload shape (tableId + cart lines)', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const id = await seedOrder(s, { clientId: 'c' });

    const payload = await s.asOwner.query(api.selfOrders.getForCart, { id });
    expect(payload.tableId).toBe(s.tableId);
    expect(payload.lines).toHaveLength(2);

    const l0 = payload.lines[0]!;
    // Same field names as the held-order recall line so the sale-screen loads it
    // identically.
    expect(l0.menuItemId).toBe(s.itemId);
    expect(l0.nameSnapshot).toBe('Espresso');
    expect(l0.qty).toBe(2);
    expect(l0.unitPriceIDR).toBe(30000);
    expect(l0.variantId).toBe(s.variantLId);
    expect(l0.variantName).toBe('L');
    expect(l0.modifierOptionIds).toEqual([s.oatId]);
    // modifierLabels are CartLineModifier objects (group/option/adjustment).
    expect(l0.modifierLabels).toEqual([
      { groupName: 'Susu', optionName: 'Oat (+5k)', priceAdjustmentIDR: 5000 },
    ]);

    const l1 = payload.lines[1]!;
    expect(l1.variantId).toBeUndefined();
    expect(l1.modifierOptionIds).toEqual([s.regularId]);
  });

  it('owner-scope: a foreign id throws', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const id = await seedOrder(s, { clientId: 'c' });
    const other = await setup(t, { email: 'o2@x.com', qrToken: 'b'.repeat(32) });
    await expect(other.asOwner.query(api.selfOrders.getForCart, { id })).rejects.toThrow();
  });
});

describe('tables.ensureQrToken', () => {
  it('returns a 32-char lowercase hex token', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    const tableId = await asOwner.mutation(api.tables.create, { name: 'Fresh' });
    const token = await asOwner.mutation(api.tables.ensureQrToken, { id: tableId });
    expect(token).toMatch(/^[0-9a-f]{32}$/);
  });

  it('is idempotent: a second call returns the SAME token', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    const tableId = await asOwner.mutation(api.tables.create, { name: 'Fresh' });
    const first = await asOwner.mutation(api.tables.ensureQrToken, { id: tableId });
    const second = await asOwner.mutation(api.tables.ensureQrToken, { id: tableId });
    expect(second).toBe(first);
  });

  it('owner-scope: a foreign table throws', async () => {
    const t = convexTest(schema, modules);
    const a = await setup(t, { email: 'a@x.com' });
    const aTable = await a.asOwner.mutation(api.tables.create, { name: 'A' });
    const b = await setup(t, { email: 'b@x.com', qrToken: 'b'.repeat(32) });
    await expect(
      b.asOwner.mutation(api.tables.ensureQrToken, { id: aTable })
    ).rejects.toThrow();
  });
});
