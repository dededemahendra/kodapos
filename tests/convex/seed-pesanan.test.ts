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
    const ownerUserId = await ctx.db.insert('users', {
      name: 'Owner',
      email: 'shots@kodapos.test',
    });
    return ctx.db.insert('cafes', {
      name: 'Kopi Shots',
      ownerUserId,
      createdAt: Date.now(),
    });
  });
  await t.mutation(internal.seed.run, { cafeId, days: 14, seed: 12345 });
  return { t, cafeId };
}

/**
 * A stable projection of the rng-determined values seed:run produces, used to
 * verify determinism across two independent runs of the same seed. Deliberately
 * excludes anything derived from wall-clock `now` (createdAt/openedAt etc. shift
 * between two calendar-time-separated runs even when every rng draw matches
 * exactly) and sorts every level so Convex's unordered `collect()` can't
 * introduce false mismatches.
 */
async function projectSeedValues(t: Awaited<ReturnType<typeof seededCafe>>['t']) {
  return t.run(async (ctx) => {
    const heldRows = await ctx.db.query('heldOrders').collect();
    const held = (
      await Promise.all(
        heldRows.map(async (h) => {
          const table = h.tableId ? await ctx.db.get(h.tableId) : null;
          const lines = h.lines
            .map((l) => ({
              nameSnapshot: l.nameSnapshot,
              qty: l.qty,
              unitPriceIDR: l.unitPriceIDR,
              variantName: l.variantName ?? null,
            }))
            .sort((a, b) =>
              `${a.nameSnapshot}|${a.variantName}`.localeCompare(
                `${b.nameSnapshot}|${b.variantName}`
              )
            );
          return { tableName: table?.name ?? null, lines };
        })
      )
    ).sort((a, b) => (a.tableName ?? '').localeCompare(b.tableName ?? ''));

    const selfRows = await ctx.db.query('selfOrders').collect();
    const self = selfRows
      .map((r) => ({
        tableName: r.tableName ?? null,
        subtotalIDR: r.subtotalIDR,
        hasNote: typeof r.customerNote === 'string' && r.customerNote.length > 0,
        paymentStatus: r.paymentStatus ?? null,
        lines: r.lines
          .map((l) => ({
            nameSnapshot: l.nameSnapshot,
            qty: l.qty,
            unitPriceIDR: l.unitPriceIDR,
            variantName: l.variantName ?? null,
            modifierLabels: [...l.modifierLabels].sort(),
          }))
          .sort((a, b) =>
            `${a.nameSnapshot}|${a.variantName}`.localeCompare(`${b.nameSnapshot}|${b.variantName}`)
          ),
      }))
      .sort(
        (a, b) =>
          a.subtotalIDR - b.subtotalIDR ||
          (a.tableName ?? '').localeCompare(b.tableName ?? '') ||
          a.lines.length - b.lines.length
      );

    return { held, self };
  });
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
    expect(rows.some((r) => typeof r.customerNote === 'string' && r.customerNote.length > 0)).toBe(
      true
    );
    expect(
      rows.some((r) => r.lines.some((l) => l.variantName && l.modifierLabels.length > 0))
    ).toBe(true);
    // The real app (convex/public.ts buildSelfOrderLine, convex/selfOrders.ts
    // toRecallLine) always derives modifierLabels from modifierOptionIds 1:1 —
    // a label with no matching id is a state the app can never produce.
    for (const r of rows) {
      expect(r.subtotalIDR).toBeGreaterThan(0);
      expect(r.tableName).toBeTruthy();
      for (const l of r.lines) {
        expect(l.modifierLabels.length).toBe(l.modifierOptionIds.length);
      }
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
    expect(
      tables.filter((tb) => typeof tb.qrToken === 'string' && tb.qrToken.length > 0).length
    ).toBeGreaterThanOrEqual(1);
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
    // A row-count comparison would pass even if every `rng` draw in the block
    // were replaced with Math.random() (the block always inserts exactly 5
    // self-orders regardless of what values it draws), so this compares the
    // actual rng-determined VALUES — table picks, item picks, qty, prices,
    // variant/modifier resolution — between two independently seeded runs.
    const a = await seededCafe();
    const b = await seededCafe();
    const projectedA = await projectSeedValues(a.t);
    const projectedB = await projectSeedValues(b.t);
    expect(projectedA).toEqual(projectedB);
    // Sanity check the projection actually has teeth: it's not vacuously
    // comparing two empty structures.
    expect(projectedA.held.length).toBeGreaterThanOrEqual(3);
    expect(projectedA.self.length).toBeGreaterThanOrEqual(4);
  });
});
