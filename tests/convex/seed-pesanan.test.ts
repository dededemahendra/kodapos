import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function seededCafe() {
  const t = convexTest(schema, modules);
  // `cafes` requires ownerUserId, and seed:run never creates a cafe itself
  // ("Seed never creates cafes") — so both rows must exist before seeding.
  const cafeId = await t.run(async (ctx) => {
    const ownerUserId = await ctx.db.insert('users', { name: 'Owner', email: 'shots@kodapos.test' });
    return ctx.db.insert('cafes', {
      name: 'Kopi Shots',
      ownerUserId,
      createdAt: Date.now(),
    });
  });
  await t.mutation(internal.seed.run, { cafeId, days: 14, seed: 12345 });
  return { t, cafeId };
}

describe('seed:run — pesanan demo state', () => {
  it('parks held orders on at least three tables in the open shift', async () => {
    const { t } = await seededCafe();
    const held = await t.run(async (ctx) => ctx.db.query('heldOrders').collect());
    const openShift = await t.run(async (ctx) =>
      ctx.db
        .query('shifts')
        .filter((q) => q.eq(q.field('status'), 'open'))
        .unique()
    );
    expect(held.length).toBeGreaterThanOrEqual(3);
    for (const h of held) {
      expect(h.shiftId).toBe(openShift!._id);
      expect(h.tableId).toBeDefined();
      expect(h.lines.length).toBeGreaterThan(0);
    }
    const tableIds = held.map((h) => h.tableId);
    expect(new Set(tableIds).size).toBe(tableIds.length); // one tab per table
  });

  it('queues pending self-orders covering paid, note, and variant+modifier cases', async () => {
    const { t } = await seededCafe();
    const rows = await t.run(async (ctx) =>
      ctx.db
        .query('selfOrders')
        .filter((q) => q.eq(q.field('status'), 'new'))
        .collect()
    );
    expect(rows.length).toBeGreaterThanOrEqual(4);
    expect(rows.some((r) => r.paymentStatus === 'paid')).toBe(true);
    expect(rows.some((r) => typeof r.customerNote === 'string' && r.customerNote.length > 0)).toBe(true);
    expect(rows.some((r) => r.lines.some((l) => l.variantName && l.modifierLabels.length > 0))).toBe(true);
    for (const r of rows) {
      expect(r.subtotalIDR).toBeGreaterThan(0);
      expect(r.tableName).toBeTruthy();
    }
  });

  it('stays under the 8-pending cap the public surface enforces', async () => {
    const { t } = await seededCafe();
    const rows = await t.run(async (ctx) =>
      ctx.db
        .query('selfOrders')
        .filter((q) => q.eq(q.field('status'), 'new'))
        .collect()
    );
    expect(rows.length).toBeLessThanOrEqual(8);
  });

  it('mints a qrToken on at least one table so the public order page is reachable', async () => {
    const { t } = await seededCafe();
    const tables = await t.run(async (ctx) => ctx.db.query('tables').collect());
    expect(tables.filter((tb) => typeof tb.qrToken === 'string' && tb.qrToken.length > 0).length)
      .toBeGreaterThanOrEqual(1);
  });

  it('guarantees a populated kitchen board in the open shift', async () => {
    const { t } = await seededCafe();
    const openShift = await t.run(async (ctx) =>
      ctx.db
        .query('shifts')
        .filter((q) => q.eq(q.field('status'), 'open'))
        .unique()
    );
    const orders = await t.run(async (ctx) =>
      ctx.db
        .query('orders')
        .filter((q) => q.eq(q.field('shiftId'), openShift!._id))
        .collect()
    );
    const paid = orders.filter((o) => o.paymentStatus === 'paid');
    expect(paid.filter((o) => o.kitchenStatus === 'new').length).toBeGreaterThanOrEqual(3);
    expect(paid.filter((o) => o.kitchenStatus === 'ready').length).toBeGreaterThanOrEqual(1);
  });

  it('is deterministic for a fixed seed', async () => {
    const a = await seededCafe();
    const b = await seededCafe();
    const countA = await a.t.run(async (ctx) => (await ctx.db.query('selfOrders').collect()).length);
    const countB = await b.t.run(async (ctx) => (await ctx.db.query('selfOrders').collect()).length);
    expect(countA).toBe(countB);
  });
});
