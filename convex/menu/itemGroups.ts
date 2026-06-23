import { v } from 'convex/values';
import { mutation } from '../_generated/server';
import { requireOwned, requireActiveOutlet } from '../lib/auth';

export const attach = mutation({
  args: { menuItemId: v.id('menuItems'), modifierGroupId: v.id('modifierGroups') },
  returns: v.null(),
  handler: async (ctx, { menuItemId, modifierGroupId }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    await requireOwned(ctx, cafeId, menuItemId, 'Item');
    await requireOwned(ctx, cafeId, modifierGroupId, 'Grup modifier');
    const existing = await ctx.db
      .query('menuItemModifierGroups')
      .withIndex('by_item', (q) => q.eq('menuItemId', menuItemId))
      .collect();
    if (existing.some((j) => j.modifierGroupId === modifierGroupId)) return null; // idempotent
    const nextPos =
      existing.length === 0 ? 100 : Math.max(...existing.map((j) => j.position)) + 100;
    await ctx.db.insert('menuItemModifierGroups', {
      cafeId,
      menuItemId,
      modifierGroupId,
      position: nextPos,
    });
    return null;
  },
});

export const detach = mutation({
  args: { menuItemId: v.id('menuItems'), modifierGroupId: v.id('modifierGroups') },
  returns: v.null(),
  handler: async (ctx, { menuItemId, modifierGroupId }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    await requireOwned(ctx, cafeId, menuItemId, 'Item');
    const joins = await ctx.db
      .query('menuItemModifierGroups')
      .withIndex('by_item', (q) => q.eq('menuItemId', menuItemId))
      .collect();
    const row = joins.find((j) => j.modifierGroupId === modifierGroupId);
    if (row) await ctx.db.delete(row._id);
    return null;
  },
});

export const reorder = mutation({
  args: {
    menuItemId: v.id('menuItems'),
    modifierGroupId: v.id('modifierGroups'),
    direction: v.union(v.literal('up'), v.literal('down')),
  },
  returns: v.null(),
  handler: async (ctx, { menuItemId, modifierGroupId, direction }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    await requireOwned(ctx, cafeId, menuItemId, 'Item');
    const joins = await ctx.db
      .query('menuItemModifierGroups')
      .withIndex('by_item', (q) => q.eq('menuItemId', menuItemId))
      .collect();
    joins.sort((a, b) => a.position - b.position);
    const idx = joins.findIndex((j) => j.modifierGroupId === modifierGroupId);
    if (idx < 0) return null;
    const swap = direction === 'up' ? joins[idx - 1] : joins[idx + 1];
    if (!swap) return null;
    const me = joins[idx];
    if (!me) return null;
    await ctx.db.patch(me._id, { position: swap.position });
    await ctx.db.patch(swap._id, { position: me.position });
    return null;
  },
});
