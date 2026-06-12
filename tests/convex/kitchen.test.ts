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
  itemId: Id<'menuItems'>;
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
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
  const itemId = await asOwner.mutation(api.menu.items.create, {
    categoryId,
    name: 'Espresso',
    priceIDR: 18000,
  });
  return { asOwner, cafeId, cashierId, shiftId, itemId };
}

describe('kitchen.tickets', () => {
  it('a settled cash sale becomes a "new" ticket with the right lines', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const res = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'k-1',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 2, modifierOptionIds: [] }],
      cashTenderedIDR: 40000,
      createdAtClient: 1700000000000,
    });

    const tickets = await asOwner.query(api.kitchen.tickets, {});
    expect(tickets).toHaveLength(1);
    expect(tickets[0]?._id).toBe(res.orderId);
    expect(tickets[0]?.kitchenStatus).toBe('new');
    expect(tickets[0]?.orderType).toBe('dine_in');
    expect(tickets[0]?.createdAtClient).toBe(1700000000000);
    expect(tickets[0]?.tableName).toBeUndefined();
    expect(tickets[0]?.lines).toEqual([
      { nameSnapshot: 'Espresso', qty: 2, modifiers: [] },
    ]);
  });

  it('includes modifier labels on the ticket lines', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const groupId = await asOwner.mutation(api.menu.modifierGroups.upsert, {
      name: 'Susu',
      required: true,
      minSelect: 1,
      maxSelect: 1,
      options: [{ name: 'Oat', priceAdjustmentIDR: 5000, position: 0 }],
    });
    await asOwner.mutation(api.menu.itemGroups.attach, {
      menuItemId: itemId,
      modifierGroupId: groupId,
    });
    const group = await asOwner.query(api.menu.modifierGroups.getById, { id: groupId });
    const oat = group!.options[0]!;

    await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'k-mod',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [oat._id] }],
      cashTenderedIDR: 30000,
      createdAtClient: 1700000000000,
    });

    const tickets = await asOwner.query(api.kitchen.tickets, {});
    expect(tickets).toHaveLength(1);
    expect(tickets[0]?.lines[0]?.modifiers).toEqual(['Susu: Oat']);
  });

  it('a sale carrying a tableId shows the table name on the ticket', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const tableId = await asOwner.mutation(api.tables.create, { name: 'Meja 3' });
    const res = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'k-table',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
      tableId,
    });
    const order = await t.run((ctx) => ctx.db.get(res.orderId));
    expect(order?.tableId).toBe(tableId);

    const tickets = await asOwner.query(api.kitchen.tickets, {});
    expect(tickets).toHaveLength(1);
    expect(tickets[0]?.tableName).toBe('Meja 3');
  });

  it('a sale WITHOUT tableId stores no tableId field on the order', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const res = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'k-notable',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    });
    const order = await t.run((ctx) => ctx.db.get(res.orderId));
    expect(order?.tableId).toBeUndefined();
  });

  it('advance to "ready" keeps the ticket on the board; "done" removes it', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const res = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'k-advance',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    });

    await asOwner.mutation(api.kitchen.advance, { orderId: res.orderId, status: 'ready' });
    let tickets = await asOwner.query(api.kitchen.tickets, {});
    expect(tickets).toHaveLength(1);
    expect(tickets[0]?.kitchenStatus).toBe('ready');

    await asOwner.mutation(api.kitchen.advance, { orderId: res.orderId, status: 'done' });
    tickets = await asOwner.query(api.kitchen.tickets, {});
    expect(tickets).toHaveLength(0);
  });

  it('a voided order is not returned by tickets', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const res = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'k-void',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    });
    await asOwner.mutation(api.orders.voidSale, { orderId: res.orderId });
    const tickets = await asOwner.query(api.kitchen.tickets, {});
    expect(tickets).toHaveLength(0);
  });

  it('tickets are FIFO (oldest createdAtClient first)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const older = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'k-old',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    });
    const newer = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'k-new',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000005000,
    });
    const tickets = await asOwner.query(api.kitchen.tickets, {});
    expect(tickets.map((x) => x._id)).toEqual([older.orderId, newer.orderId]);
  });

  it('only returns the open shift\'s tickets', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'k-shift1',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    });
    // Close the shift → its tickets are no longer from the open shift.
    await asOwner.mutation(api.shifts.close, { id: shiftId, countedCashIDR: 100000 });
    expect(await asOwner.query(api.kitchen.tickets, {})).toHaveLength(0);

    // Open a fresh shift → still no tickets (none rung yet).
    const shift2 = await asOwner.mutation(api.shifts.open, {
      cashierId,
      openingFloatIDR: 100000,
    });
    await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'k-shift2',
      shiftId: shift2,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000010000,
    });
    const tickets = await asOwner.query(api.kitchen.tickets, {});
    expect(tickets).toHaveLength(1);
  });

  it('no open shift → empty list', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId } = await setup(t);
    await asOwner.mutation(api.shifts.close, { id: shiftId, countedCashIDR: 100000 });
    expect(await asOwner.query(api.kitchen.tickets, {})).toEqual([]);
  });

  it('owner-scope: tickets are scoped to the calling owner only', async () => {
    const t = convexTest(schema, modules);
    const a = await setup(t, { email: 'a@x.com' });
    await a.asOwner.mutation(api.orders.createCashSale, {
      clientId: 'a-1',
      shiftId: a.shiftId,
      cashierId: a.cashierId,
      lines: [{ menuItemId: a.itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    });
    const b = await setup(t, { email: 'b@x.com' });
    expect(await b.asOwner.query(api.kitchen.tickets, {})).toEqual([]);
  });
});

describe('kitchen.advance', () => {
  it('owner-scope: advancing a foreign order throws', async () => {
    const t = convexTest(schema, modules);
    const a = await setup(t, { email: 'a@x.com' });
    const res = await a.asOwner.mutation(api.orders.createCashSale, {
      clientId: 'a-adv',
      shiftId: a.shiftId,
      cashierId: a.cashierId,
      lines: [{ menuItemId: a.itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    });
    const b = await setup(t, { email: 'b@x.com' });
    await expect(
      b.asOwner.mutation(api.kitchen.advance, { orderId: res.orderId, status: 'ready' })
    ).rejects.toThrow(/tidak ditemukan/i);
  });
});
