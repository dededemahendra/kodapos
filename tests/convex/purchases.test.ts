import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setup(t: ReturnType<typeof convexTest>, email = 'o@x.com') {
  const userId = await t.run(async (ctx) =>
    ctx.db.insert('users', { name: 'Owner', email })
  );
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  const biji = await asOwner.mutation(api.ingredients.upsert, {
    name: 'Biji', canonicalUnit: 'g', reorderThreshold: 0, lastCostPerUnitIDR: 40,
  });
  const susu = await asOwner.mutation(api.ingredients.upsert, {
    name: 'Susu', canonicalUnit: 'ml', reorderThreshold: 0, lastCostPerUnitIDR: 20,
  });
  return { asOwner, biji, susu };
}

describe('purchases.record', () => {
  it('records a multi-line purchase: stock rises, lastCost updated, total stored', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, biji, susu } = await setup(t);
    const purchaseId = await asOwner.mutation(api.purchases.record, {
      supplierName: 'Kopi Jaya',
      lines: [
        { ingredientId: biji, qty: 5000, unitCostIDR: 50 },
        { ingredientId: susu, qty: 10000, unitCostIDR: 25 },
      ],
    });
    expect(purchaseId).toBeTruthy();
    // Stock rose by each qty.
    const ings = await asOwner.query(api.ingredients.list, {});
    const bijiRow = ings.find((i) => i._id === biji);
    const susuRow = ings.find((i) => i._id === susu);
    expect(bijiRow?.currentStockQty).toBe(5000);
    expect(susuRow?.currentStockQty).toBe(10000);
    // lastCostPerUnitIDR overwritten with the purchase unit cost.
    expect(bijiRow?.lastCostPerUnitIDR).toBe(50);
    expect(susuRow?.lastCostPerUnitIDR).toBe(25);
    // Total stored = 5000×50 + 10000×25 = 250000 + 250000 = 500000.
    const recent = await asOwner.query(api.purchases.recent, {});
    expect(recent[0]?.totalIDR).toBe(500000);
    expect(recent[0]?.lineCount).toBe(2);
    expect(recent[0]?.supplierName).toBe('Kopi Jaya');
  });

  it('writes one purchase movement per line (visible in listMovements, not recentAdjustments)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, biji } = await setup(t);
    await asOwner.mutation(api.purchases.record, {
      lines: [{ ingredientId: biji, qty: 1000, unitCostIDR: 40 }],
    });
    const { rows } = await asOwner.query(api.ingredients.listMovements, { ingredientId: biji });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.reason).toBe('purchase');
    expect(rows[0]?.delta).toBe(1000);
    // Purchases are NOT adjustments.
    expect(await asOwner.query(api.ingredients.recentAdjustments, {})).toHaveLength(0);
  });

  it('rejects empty lines / bad qty / negative cost / foreign ingredient', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, biji } = await setup(t);
    await expect(
      asOwner.mutation(api.purchases.record, { lines: [] })
    ).rejects.toThrow(/minimal satu/i);
    await expect(
      asOwner.mutation(api.purchases.record, { lines: [{ ingredientId: biji, qty: 0, unitCostIDR: 10 }] })
    ).rejects.toThrow(/jumlah/i);
    await expect(
      asOwner.mutation(api.purchases.record, { lines: [{ ingredientId: biji, qty: 5, unitCostIDR: -1 }] })
    ).rejects.toThrow(/biaya/i);
    const { biji: otherBiji } = await setup(t, 'b@x.com');
    await expect(
      asOwner.mutation(api.purchases.record, { lines: [{ ingredientId: otherBiji, qty: 5, unitCostIDR: 10 }] })
    ).rejects.toThrow(/tidak ditemukan/i);
  });
});

describe('purchases.recent / get', () => {
  it('lists purchases newest-first and resolves detail lines', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, biji, susu } = await setup(t);
    const id = await asOwner.mutation(api.purchases.record, {
      supplierName: 'Kopi Jaya',
      lines: [
        { ingredientId: biji, qty: 5000, unitCostIDR: 50 },
        { ingredientId: susu, qty: 10000, unitCostIDR: 25 },
      ],
    });
    const recent = await asOwner.query(api.purchases.recent, {});
    expect(recent).toHaveLength(1);
    expect(recent[0]?.id).toBe(id);
    expect(recent[0]?.lineCount).toBe(2);
    const detail = await asOwner.query(api.purchases.get, { id });
    expect(detail?.supplierName).toBe('Kopi Jaya');
    expect(detail?.totalIDR).toBe(500000);
    expect(detail?.lines).toHaveLength(2);
    const bijiLine = detail?.lines.find((l) => l.ingredientName === 'Biji');
    expect(bijiLine?.qty).toBe(5000);
    expect(bijiLine?.unit).toBe('g');
    expect(bijiLine?.unitCostIDR).toBe(50);
    expect(bijiLine?.subtotalIDR).toBe(250000);
  });

  it('get + recent are cafe-scoped', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, biji } = await setup(t);
    const id = await asOwner.mutation(api.purchases.record, {
      lines: [{ ingredientId: biji, qty: 100, unitCostIDR: 40 }],
    });
    const { asOwner: ownerB } = await setup(t, 'b@x.com');
    expect(await ownerB.query(api.purchases.recent, {})).toHaveLength(0);
    expect(await ownerB.query(api.purchases.get, { id })).toBeNull();
  });
});
