import { v } from 'convex/values';
import { query } from '../_generated/server';
import { requireActiveOutlet } from '../lib/auth';

/**
 * Data for the wall-mounted menu board (`/menu-board`).
 *
 * Display-only and deliberately narrow: name, price, photo, sold-out. It must
 * never leak cost, stock, recipe, or id data, because this render ends up on a
 * screen pointed at customers. It mirrors the sellable-only assembly in
 * convex/public.ts -> menuForTable, but is scoped to the ACTIVE OUTLET (staff
 * auth) instead of a table's qrToken, and is trimmed to the four board fields.
 */
const boardResult = v.object({
  cafe: v.object({ name: v.string(), logoUrl: v.union(v.string(), v.null()) }),
  categories: v.array(
    v.object({
      name: v.string(),
      items: v.array(
        v.object({
          name: v.string(),
          priceIDR: v.number(),
          imageUrl: v.union(v.string(), v.null()),
          soldOut: v.boolean(),
        })
      ),
    })
  ),
});

export const get = query({
  args: {},
  returns: boardResult,
  handler: async (ctx) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const cafe = await ctx.db.get(cafeId);
    if (!cafe) throw new Error('Kafe tidak ditemukan.');

    // Sellable only: non-archived + active, in menu order.
    const itemRows = await ctx.db
      .query('menuItems')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId).eq('archived', false))
      .collect();
    const activeItems = itemRows
      .filter((i) => i.isActive)
      .sort((a, b) => a.position - b.position);

    const categoryRows = (
      await ctx.db
        .query('categories')
        .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId).eq('archived', false))
        .collect()
    ).sort((a, b) => a.position - b.position);

    const categories = [];
    for (const category of categoryRows) {
      const rows = activeItems.filter((i) => i.categoryId === category._id);
      if (rows.length === 0) continue; // empty categories never get a page
      const items = [];
      for (const item of rows) {
        items.push({
          name: item.name,
          priceIDR: item.priceIDR,
          imageUrl: item.imageStorageId
            ? await ctx.storage.getUrl(item.imageStorageId)
            : null,
          soldOut: item.soldOut ?? false,
        });
      }
      categories.push({ name: category.name, items });
    }

    return {
      cafe: {
        name: cafe.name,
        logoUrl: cafe.logoStorageId ? await ctx.storage.getUrl(cafe.logoStorageId) : null,
      },
      categories,
    };
  },
});
