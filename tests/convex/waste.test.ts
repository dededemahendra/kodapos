import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setupOwner(t: ReturnType<typeof convexTest>, email = 'o@x.com') {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email });
  });
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  return { asOwner };
}

/** Create an ingredient and stock it to `qty` via adjustStock. */
async function stockedIngredient(
  asOwner: ReturnType<ReturnType<typeof convexTest>['withIdentity']>,
  opts: { name?: string; cost?: number; qty?: number } = {}
): Promise<Id<'ingredients'>> {
  const id = await asOwner.mutation(api.ingredients.upsert, {
    name: opts.name ?? 'Susu',
    canonicalUnit: 'ml',
    reorderThreshold: 0,
    lastCostPerUnitIDR: opts.cost ?? 25,
  });
  if (opts.qty && opts.qty > 0) {
    await asOwner.mutation(api.ingredients.adjustStock, {
      ingredientId: id,
      newQty: opts.qty,
      reasonLabel: 'Pengiriman masuk',
    });
  }
  return id;
}

describe('waste.record', () => {
  it('writes a waste movement with negative delta, category, and cost snapshot', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await stockedIngredient(asOwner, { cost: 25, qty: 1000 });

    const movementId = await asOwner.mutation(api.waste.record, {
      ingredientId: id,
      qtyWasted: 200,
      wasteReason: 'basi',
      note: 'kulkas mati semalam',
    });

    const m = await t.run(async (ctx) => await ctx.db.get(movementId));
    expect(m?.reason).toBe('waste');
    expect(m?.delta).toBe(-200);
    expect(m?.wasteReason).toBe('basi');
    expect(m?.costPerUnitIDR).toBe(25);
    expect(m?.note).toBe('kulkas mati semalam');
  });

  it('lowers currentStockQty by the wasted amount', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await stockedIngredient(asOwner, { qty: 1000 });

    await asOwner.mutation(api.waste.record, {
      ingredientId: id,
      qtyWasted: 200,
      wasteReason: 'rusak',
    });

    const list = await asOwner.query(api.ingredients.list, {});
    expect(list[0]?.currentStockQty).toBe(800);
  });

  it('rejects qtyWasted that is not a positive integer', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await stockedIngredient(asOwner, { qty: 1000 });
    await expect(
      asOwner.mutation(api.waste.record, {
        ingredientId: id,
        qtyWasted: 0,
        wasteReason: 'rusak',
      })
    ).rejects.toThrow(/bulat/i);
    await expect(
      asOwner.mutation(api.waste.record, {
        ingredientId: id,
        qtyWasted: 10.5,
        wasteReason: 'rusak',
      })
    ).rejects.toThrow(/bulat/i);
  });

  it('rejects waste greater than current stock', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await stockedIngredient(asOwner, { qty: 100 });
    await expect(
      asOwner.mutation(api.waste.record, {
        ingredientId: id,
        qtyWasted: 101,
        wasteReason: 'tumpah',
      })
    ).rejects.toThrow(/melebihi stok/i);
  });

  it('rejects an ingredient from another cafe', async () => {
    const t = convexTest(schema, modules);
    const { asOwner: ownerA } = await setupOwner(t, 'a@x.com');
    const { asOwner: ownerB } = await setupOwner(t, 'b@x.com');
    const idB = await stockedIngredient(ownerB, { qty: 1000 });
    await expect(
      ownerA.mutation(api.waste.record, {
        ingredientId: idB,
        qtyWasted: 10,
        wasteReason: 'rusak',
      })
    ).rejects.toThrow(/tidak ditemukan/i);
  });
});
