import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
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

describe('ingredients.upsert', () => {
  it('creates a new ingredient with valid fields', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 25,
    });
    expect(id).toBeTruthy();
    const list = await asOwner.query(api.ingredients.list, {});
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('Susu');
    expect(list[0]?.canonicalUnit).toBe('ml');
    expect(list[0]?.reorderThreshold).toBe(500);
    expect(list[0]?.lastCostPerUnitIDR).toBe(25);
    expect(list[0]?.currentStockQty).toBe(0);
    expect(list[0]?.archived).toBe(false);
  });
});

describe('ingredients.upsert validation', () => {
  it('rejects empty name', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await expect(
      asOwner.mutation(api.ingredients.upsert, {
        name: '   ',
        canonicalUnit: 'ml',
        reorderThreshold: 500,
        lastCostPerUnitIDR: 25,
      })
    ).rejects.toThrow(/wajib diisi/i);
  });

  it('rejects > 60 chars', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await expect(
      asOwner.mutation(api.ingredients.upsert, {
        name: 'x'.repeat(61),
        canonicalUnit: 'ml',
        reorderThreshold: 500,
        lastCostPerUnitIDR: 25,
      })
    ).rejects.toThrow(/maksimal/i);
  });

  it('rejects duplicate name in same cafe (case-insensitive)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 25,
    });
    await expect(
      asOwner.mutation(api.ingredients.upsert, {
        name: 'susu',
        canonicalUnit: 'ml',
        reorderThreshold: 100,
        lastCostPerUnitIDR: 30,
      })
    ).rejects.toThrow(/sudah ada/i);
  });

  it('allows the same name across different cafes', async () => {
    const t = convexTest(schema, modules);
    const { asOwner: ownerA } = await setupOwner(t, 'a@x.com');
    const { asOwner: ownerB } = await setupOwner(t, 'b@x.com');
    await ownerA.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 25,
    });
    const idB = await ownerB.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 25,
    });
    expect(idB).toBeTruthy();
  });
});

describe('ingredients.list / archive', () => {
  it('excludes archived by default; includes when requested', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 25,
    });
    await asOwner.mutation(api.ingredients.archive, { id });
    const active = await asOwner.query(api.ingredients.list, {});
    expect(active).toHaveLength(0);
    const all = await asOwner.query(api.ingredients.list, { includeArchived: true });
    expect(all).toHaveLength(1);
    expect(all[0]?.archived).toBe(true);
  });
});

describe('ingredients.adjustStock', () => {
  it('writes a movement with delta = newQty - currentStock + the note', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 25,
    });
    const movementId = await asOwner.mutation(api.ingredients.adjustStock, {
      ingredientId: id,
      newQty: 1000,
      reasonLabel: 'Pengiriman masuk',
      note: 'PT Sumber Susu',
    });
    expect(movementId).toBeTruthy();
    const after = await asOwner.query(api.ingredients.list, {});
    expect(after[0]?.currentStockQty).toBe(1000);
    const movement = await t.run(async (ctx) => await ctx.db.get(movementId!));
    expect(movement?.delta).toBe(1000);
    expect(movement?.reason).toBe('adjustment');
    expect(movement?.reasonLabel).toBe('Pengiriman masuk');
    expect(movement?.note).toBe('PT Sumber Susu');
  });

  it('is a no-op when newQty equals currentStock', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 25,
    });
    const result = await asOwner.mutation(api.ingredients.adjustStock, {
      ingredientId: id,
      newQty: 0,
      reasonLabel: 'Koreksi',
    });
    expect(result).toBeNull();
  });

  it('rejects fractional / negative newQty', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 25,
    });
    await expect(
      asOwner.mutation(api.ingredients.adjustStock, {
        ingredientId: id,
        newQty: 100.5,
        reasonLabel: 'Koreksi',
      })
    ).rejects.toThrow(/bulat/i);
    await expect(
      asOwner.mutation(api.ingredients.adjustStock, {
        ingredientId: id,
        newQty: -1,
        reasonLabel: 'Koreksi',
      })
    ).rejects.toThrow(/bulat/i);
  });
});

describe('ingredients.listMovements', () => {
  it('returns movements newest-first with a running balance', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const susuId = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 100,
      lastCostPerUnitIDR: 25,
    });
    // Two adjustments: 0 → 1000, then 1000 → 800.
    await asOwner.mutation(api.ingredients.adjustStock, {
      ingredientId: susuId,
      newQty: 1000,
      reasonLabel: 'Pengiriman masuk',
    });
    await asOwner.mutation(api.ingredients.adjustStock, {
      ingredientId: susuId,
      newQty: 800,
      reasonLabel: 'Koreksi',
    });
    const { rows, truncated } = await asOwner.query(api.ingredients.listMovements, {
      ingredientId: susuId,
    });
    expect(truncated).toBe(false);
    expect(rows).toHaveLength(2);
    // Newest first: the -200 correction, balance 800.
    expect(rows[0]?.delta).toBe(-200);
    expect(rows[0]?.balanceAfter).toBe(800);
    expect(rows[1]?.delta).toBe(1000);
    expect(rows[1]?.balanceAfter).toBe(1000);
  });

  it('caps at 100 rows but keeps the newest balance equal to current stock', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Biji',
      canonicalUnit: 'g',
      reorderThreshold: 0,
      lastCostPerUnitIDR: 100,
    });
    // 101 adjustments of +1 each: 1, 2, …, 101.
    for (let qty = 1; qty <= 101; qty++) {
      await asOwner.mutation(api.ingredients.adjustStock, {
        ingredientId: id,
        newQty: qty,
        reasonLabel: 'Stok opname',
      });
    }
    const { rows, truncated } = await asOwner.query(api.ingredients.listMovements, {
      ingredientId: id,
    });
    expect(truncated).toBe(true);
    expect(rows).toHaveLength(100);
    // Newest row's balance is the current stock (101), not a truncated partial.
    expect(rows[0]?.balanceAfter).toBe(101);
  });

  it("rejects reading another cafe's ingredient", async () => {
    const t = convexTest(schema, modules);
    const { asOwner: ownerA } = await setupOwner(t, 'a@x.com');
    const { asOwner: ownerB } = await setupOwner(t, 'b@x.com');
    const aIng = await ownerA.mutation(api.ingredients.upsert, {
      name: 'A-only',
      canonicalUnit: 'ml',
      reorderThreshold: 0,
      lastCostPerUnitIDR: 1,
    });
    await expect(
      ownerB.query(api.ingredients.listMovements, { ingredientId: aIng })
    ).rejects.toThrow();
  });
});
