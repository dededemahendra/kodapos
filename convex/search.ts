import { v } from 'convex/values';
import { query } from './_generated/server';
import { requireOwnerCafe } from './lib/auth';

export const global = query({
  args: { term: v.string() },
  returns: v.object({
    menuItems: v.array(
      v.object({
        _id: v.id('menuItems'),
        name: v.string(),
        priceIDR: v.number(),
        categoryName: v.string(),
      })
    ),
    customers: v.array(
      v.object({
        _id: v.id('customers'),
        name: v.string(),
        phone: v.string(),
      })
    ),
  }),
  handler: async (ctx, { term }) => {
    if (term.trim().length < 2) {
      return { menuItems: [], customers: [] };
    }
    const { cafeId } = await requireOwnerCafe(ctx);
    const q = term.trim().toLowerCase();

    // Menu items: scope to cafe's active (non-archived, isActive) items, filter by name
    const allItems = await ctx.db
      .query('menuItems')
      .withIndex('by_cafe_active', (idx) =>
        idx.eq('cafeId', cafeId).eq('archived', false).eq('isActive', true)
      )
      .collect();
    const matchingItems = allItems.filter((item) =>
      item.name.toLowerCase().includes(q)
    );
    const menuItems = await Promise.all(
      matchingItems.slice(0, 5).map(async (item) => {
        const cat = await ctx.db.get(item.categoryId);
        return {
          _id: item._id,
          name: item.name,
          priceIDR: item.priceIDR,
          categoryName: cat?.name ?? '',
        };
      })
    );

    // Customers: scope to cafe's active customers, filter by name or phone
    const allCustomers = await ctx.db
      .query('customers')
      .withIndex('by_cafe_active', (idx) =>
        idx.eq('cafeId', cafeId).eq('archived', false)
      )
      .collect();
    const customers = allCustomers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q)
      )
      .slice(0, 5)
      .map((c) => ({ _id: c._id, name: c.name, phone: c.phone }));

    return { menuItems, customers };
  },
});
