import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

type AsOwner = ReturnType<ReturnType<typeof convexTest>['withIdentity']>;

type Setup = {
  asOwner: AsOwner;
  cafeId: Id<'cafes'>;
  cashierId: Id<'cafeStaff'>;
  shiftId: Id<'shifts'>;
};

async function setup(
  t: ReturnType<typeof convexTest>,
  opts: { email?: string } = {}
): Promise<Setup> {
  const email = opts.email ?? 'o@x.com';
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
  const cashierId = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
  const shiftId = await asOwner.mutation(api.shifts.open, {
    cashierId,
    openingFloatIDR: 100000,
  });
  return { asOwner, cafeId, cashierId, shiftId };
}

/** Create a sellable menu item (category + item), returning the menuItems id. */
async function makeItem(asOwner: AsOwner): Promise<Id<'menuItems'>> {
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
  return await asOwner.mutation(api.menu.items.create, {
    categoryId,
    name: 'Espresso',
    priceIDR: 18000,
  });
}

async function closeShift(asOwner: AsOwner, shiftId: Id<'shifts'>): Promise<void> {
  await asOwner.mutation(api.shifts.close, { id: shiftId, countedCashIDR: 100000 });
}

const sampleLines = (menuItemId: Id<'menuItems'>) => [
  {
    menuItemId,
    nameSnapshot: 'Kopi',
    qty: 2,
    unitPriceIDR: 18000,
    modifierOptionIds: [] as Id<'modifierOptions'>[],
    modifierLabels: [] as Array<{
      groupName: string;
      optionName: string;
      priceAdjustmentIDR: number;
    }>,
  },
];

describe('heldOrders', () => {
  it('holds a cart and lists it for the shift', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId, shiftId } = await setup(t);
    const itemId = await makeItem(asOwner);
    const id = await asOwner.mutation(api.heldOrders.hold, {
      cashierId,
      label: 'Meja 4',
      orderType: 'dine_in',
      lines: sampleLines(itemId),
    });
    expect(id).toBeTruthy();
    const list = await asOwner.query(api.heldOrders.listForShift, { shiftId });
    expect(list).toHaveLength(1);
    expect(list[0]?.label).toBe('Meja 4');
    expect(list[0]?.lines[0]?.qty).toBe(2);
  });

  it('round-trips a scoped promo (scope + targetItemIds survive hold/recall)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId, shiftId } = await setup(t);
    const itemId = await makeItem(asOwner);
    await asOwner.mutation(api.heldOrders.hold, {
      cashierId,
      label: 'Meja 7',
      orderType: 'dine_in',
      lines: sampleLines(itemId),
      promo: {
        promoId: (await asOwner.mutation(api.promotions.create, {
          name: 'Item 10%',
          type: 'percent',
          value: 10,
          scope: 'item',
          targetItemIds: [itemId],
        })) as Id<'promotions'>,
        name: 'Item 10%',
        type: 'percent',
        value: 10,
        scope: 'item',
        targetItemIds: [itemId],
      },
    });
    const list = await asOwner.query(api.heldOrders.listForShift, { shiftId });
    expect(list).toHaveLength(1);
    expect(list[0]?.promo?.scope).toBe('item');
    expect(list[0]?.promo?.targetItemIds).toEqual([itemId]);
  });

  it('rejects an empty cart', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId } = await setup(t);
    await expect(
      asOwner.mutation(api.heldOrders.hold, {
        cashierId,
        label: '',
        orderType: 'dine_in',
        lines: [],
      })
    ).rejects.toThrow(/kosong/i);
  });

  it('rejects when there is no open shift', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId, shiftId } = await setup(t);
    await closeShift(asOwner, shiftId);
    const itemId = await makeItem(asOwner);
    await expect(
      asOwner.mutation(api.heldOrders.hold, {
        cashierId,
        label: 'x',
        orderType: 'dine_in',
        lines: sampleLines(itemId),
      })
    ).rejects.toThrow(/tidak ada shift terbuka/i);
  });

  it('removes a held order (owner-scoped)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId, shiftId } = await setup(t);
    const itemId = await makeItem(asOwner);
    const id = await asOwner.mutation(api.heldOrders.hold, {
      cashierId,
      label: 'a',
      orderType: 'takeaway',
      lines: sampleLines(itemId),
    });
    await asOwner.mutation(api.heldOrders.remove, { id });
    const list = await asOwner.query(api.heldOrders.listForShift, { shiftId });
    expect(list).toHaveLength(0);

    // A foreign owner cannot remove this owner's held order.
    const again = await asOwner.mutation(api.heldOrders.hold, {
      cashierId,
      label: 'b',
      orderType: 'dine_in',
      lines: sampleLines(itemId),
    });
    const { asOwner: asOther } = await setup(t, { email: 'other@x.com' });
    await expect(
      asOther.mutation(api.heldOrders.remove, { id: again })
    ).rejects.toThrow(/tidak ditemukan/i);
  });
});
