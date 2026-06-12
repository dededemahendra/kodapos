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
  opts: { email?: string; openShift?: boolean } = {}
): Promise<Setup> {
  const email = opts.email ?? 'o@x.com';
  const openShift = opts.openShift ?? true;
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
  let shiftId = '' as Id<'shifts'>;
  if (openShift) {
    shiftId = await asOwner.mutation(api.shifts.open, {
      cashierId,
      openingFloatIDR: 100000,
    });
  }
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

const sampleLines = (menuItemId: Id<'menuItems'>, qty = 2, unitPriceIDR = 18000) => [
  {
    menuItemId,
    nameSnapshot: 'Kopi',
    qty,
    unitPriceIDR,
    modifierOptionIds: [] as Id<'modifierOptions'>[],
    modifierLabels: [] as Array<{
      groupName: string;
      optionName: string;
      priceAdjustmentIDR: number;
    }>,
  },
];

describe('tables CRUD', () => {
  it('creates + lists (active first, ordered by sortOrder)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    const a = await asOwner.mutation(api.tables.create, { name: 'Meja 1' });
    const b = await asOwner.mutation(api.tables.create, { name: 'Meja 2' });
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    const list = await asOwner.query(api.tables.list, {});
    expect(list).toHaveLength(2);
    expect(list[0]?.name).toBe('Meja 1');
    expect(list[1]?.name).toBe('Meja 2');
    expect(list[0]?.sortOrder).toBeLessThan(list[1]!.sortOrder);
  });

  it('update + archive hides from default list', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    const id = await asOwner.mutation(api.tables.create, { name: 'X' });
    await asOwner.mutation(api.tables.update, { id, name: 'X2' });
    expect((await asOwner.query(api.tables.list, {}))[0]?.name).toBe('X2');
    await asOwner.mutation(api.tables.archive, { id });
    expect(await asOwner.query(api.tables.list, {})).toHaveLength(0);
    expect(await asOwner.query(api.tables.list, { includeArchived: true })).toHaveLength(1);
  });

  it('validates name', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    await expect(asOwner.mutation(api.tables.create, { name: '  ' })).rejects.toThrow(/nama/i);
    await expect(
      asOwner.mutation(api.tables.create, { name: 'x'.repeat(41) })
    ).rejects.toThrow(/nama/i);
  });

  it('owner-scope: foreign owner cannot update/archive', async () => {
    const t = convexTest(schema, modules);
    const a = await setup(t, { email: 'a@x.com' });
    const aTable = await a.asOwner.mutation(api.tables.create, { name: 'A' });
    const b = await setup(t, { email: 'b@x.com' });
    await expect(
      b.asOwner.mutation(api.tables.update, { id: aTable, name: 'hax' })
    ).rejects.toThrow();
    await expect(
      b.asOwner.mutation(api.tables.archive, { id: aTable })
    ).rejects.toThrow();
  });
});

describe('tables.floor', () => {
  it('shows a table occupied with correct total + itemCount after a hold, others empty', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId } = await setup(t);
    const itemId = await makeItem(asOwner);
    const tableA = await asOwner.mutation(api.tables.create, { name: 'Meja 1' });
    await asOwner.mutation(api.tables.create, { name: 'Meja 2' });

    const heldId = await asOwner.mutation(api.heldOrders.hold, {
      cashierId,
      label: 'Meja 1',
      orderType: 'dine_in',
      lines: sampleLines(itemId, 2, 18000),
      tableId: tableA,
    });

    const floor = await asOwner.query(api.tables.floor, {});
    expect(floor).toHaveLength(2);
    const a = floor.find((f) => f._id === tableA)!;
    expect(a.occupied).toBe(true);
    expect(a.heldOrderId).toBe(heldId);
    expect(a.totalIDR).toBe(2 * 18000); // Σ qty*unitPriceIDR
    expect(a.itemCount).toBe(2); // Σ qty
    const b = floor.find((f) => f._id !== tableA)!;
    expect(b.occupied).toBe(false);
    expect(b.totalIDR).toBe(0);
    expect(b.itemCount).toBe(0);
    expect(b.heldOrderId).toBeUndefined();
  });

  it('no open shift → all tables empty', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t, { openShift: false });
    await asOwner.mutation(api.tables.create, { name: 'Meja 1' });
    const floor = await asOwner.query(api.tables.floor, {});
    expect(floor).toHaveLength(1);
    expect(floor[0]?.occupied).toBe(false);
    expect(floor[0]?.totalIDR).toBe(0);
  });
});

describe('heldOrders.hold with tableId — one per table', () => {
  it('stores tableId and rejects a second hold to the same table; frees after remove', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId, shiftId } = await setup(t);
    const itemId = await makeItem(asOwner);
    const tableA = await asOwner.mutation(api.tables.create, { name: 'Meja 1' });

    const heldId = await asOwner.mutation(api.heldOrders.hold, {
      cashierId,
      label: 'Meja 1',
      orderType: 'dine_in',
      lines: sampleLines(itemId),
      tableId: tableA,
    });

    const list = await asOwner.query(api.heldOrders.listForShift, { shiftId });
    expect(list[0]?.tableId).toBe(tableA);

    // A second hold to the same table is rejected.
    await expect(
      asOwner.mutation(api.heldOrders.hold, {
        cashierId,
        label: 'Meja 1 again',
        orderType: 'dine_in',
        lines: sampleLines(itemId),
        tableId: tableA,
      })
    ).rejects.toThrow(/terisi/i);

    // After removing the held order, the table frees up.
    await asOwner.mutation(api.heldOrders.remove, { id: heldId });
    const again = await asOwner.mutation(api.heldOrders.hold, {
      cashierId,
      label: 'Meja 1 reseat',
      orderType: 'dine_in',
      lines: sampleLines(itemId),
      tableId: tableA,
    });
    expect(again).toBeTruthy();
  });

  it('owner-scope: a foreign table id in hold throws', async () => {
    const t = convexTest(schema, modules);
    const a = await setup(t, { email: 'a@x.com' });
    const aTable = await a.asOwner.mutation(api.tables.create, { name: 'A' });
    const b = await setup(t, { email: 'b@x.com' });
    const itemId = await makeItem(b.asOwner);
    await expect(
      b.asOwner.mutation(api.heldOrders.hold, {
        cashierId: b.cashierId,
        label: 'x',
        orderType: 'dine_in',
        lines: sampleLines(itemId),
        tableId: aTable,
      })
    ).rejects.toThrow();
  });
});
