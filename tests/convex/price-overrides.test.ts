import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setup(t: ReturnType<typeof convexTest>, email = 'o@x.com') {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email });
  });
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
  const itemId = await asOwner.mutation(api.menu.items.create, {
    categoryId,
    name: 'Espresso',
    priceIDR: 18000,
  });
  const tierId = await asOwner.mutation(api.menu.priceCategories.create, { name: 'Turis' });
  return { asOwner, itemId, tierId };
}

describe('price overrides', () => {
  it('sets and lists an override', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, itemId, tierId } = await setup(t);
    await asOwner.mutation(api.menu.priceOverrides.set, {
      priceCategoryId: tierId,
      targetKind: 'item',
      targetId: itemId,
      priceIDR: 30000,
    });
    const rows = await asOwner.query(api.menu.priceOverrides.listForCategory, {
      priceCategoryId: tierId,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.priceIDR).toBe(30000);
  });

  // Convex has no unique constraint, so the mutation has to enforce this or a
  // second edit silently creates a duplicate and resolution picks one at random.
  it('upserts rather than duplicating on a repeat set', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, itemId, tierId } = await setup(t);
    for (const price of [30000, 32000]) {
      await asOwner.mutation(api.menu.priceOverrides.set, {
        priceCategoryId: tierId,
        targetKind: 'item',
        targetId: itemId,
        priceIDR: price,
      });
    }
    const rows = await asOwner.query(api.menu.priceOverrides.listForCategory, {
      priceCategoryId: tierId,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.priceIDR).toBe(32000);
  });

  it('clears an override back to the standard price', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, itemId, tierId } = await setup(t);
    await asOwner.mutation(api.menu.priceOverrides.set, {
      priceCategoryId: tierId,
      targetKind: 'item',
      targetId: itemId,
      priceIDR: 30000,
    });
    await asOwner.mutation(api.menu.priceOverrides.clear, {
      priceCategoryId: tierId,
      targetKind: 'item',
      targetId: itemId,
    });
    expect(
      await asOwner.query(api.menu.priceOverrides.listForCategory, { priceCategoryId: tierId })
    ).toEqual([]);
  });

  it('rejects a negative or non-integer price', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, itemId, tierId } = await setup(t);
    for (const bad of [-1, 1500.5]) {
      await expect(
        asOwner.mutation(api.menu.priceOverrides.set, {
          priceCategoryId: tierId,
          targetKind: 'item',
          targetId: itemId,
          priceIDR: bad,
        })
      ).rejects.toThrow();
    }
  });

  // In a multi-outlet business this is what stops one outlet repricing another
  // outlet's menu.
  it('rejects a target belonging to another cafe', async () => {
    const t = convexTest(schema, modules);
    const a = await setup(t, 'a@x.com');
    const b = await setup(t, 'b@x.com');
    await expect(
      a.asOwner.mutation(api.menu.priceOverrides.set, {
        priceCategoryId: a.tierId,
        targetKind: 'item',
        targetId: b.itemId,
        priceIDR: 30000,
      })
    ).rejects.toThrow();
  });

  // targetKind and targetId are validated independently, so nothing but this
  // check stops a mismatched pair. If it were allowed through, the dedup key
  // (priceCategoryId, targetKind, targetId) would not collide with the real
  // target's row, and the same variant could end up with two override rows
  // that resolution picks between nondeterministically.
  it('rejects a targetKind that does not match the targetId', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, itemId, tierId } = await setup(t);
    const variantId = await asOwner.mutation(api.menu.variants.create, {
      menuItemId: itemId,
      name: 'Large',
      priceIDR: 22000,
    });
    await expect(
      asOwner.mutation(api.menu.priceOverrides.set, {
        priceCategoryId: tierId,
        targetKind: 'item',
        targetId: variantId,
        priceIDR: 30000,
      })
    ).rejects.toThrow();
  });
});
