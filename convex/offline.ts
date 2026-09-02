import { v } from 'convex/values';
import { query } from './_generated/server';
import { requireActiveOutlet } from './lib/auth';
import {
  projectRegisterSettings,
  projectRegisterStaff,
  registerSettingsValidator,
  registerStaffValidator,
} from './lib/settings';
import schema from './schema';

/**
 * Doc validator for a table: its schema fields plus the two system fields
 * Convex adds. Derived from the schema rather than hand-written so a column
 * added later can never silently drop out of the cached snapshot.
 */
function docOf<T extends keyof typeof schema.tables>(table: T) {
  return v.object({
    _id: v.id(table),
    _creationTime: v.number(),
    ...schema.tables[table].validator.fields,
  });
}

const registerSnapshotValidator = v.object({
  items: v.array(docOf('menuItems')),
  categories: v.array(docOf('categories')),
  modifierGroups: v.array(docOf('modifierGroups')),
  modifierOptions: v.array(docOf('modifierOptions')),
  variants: v.array(docOf('menuItemVariants')),
  priceCategories: v.array(docOf('priceCategories')),
  promos: v.array(docOf('promotions')),
  // NOT `docOf('cafeSettings')`. The raw settings document carries
  // `integrations[].config`, which holds the live Xendit secret key + callback
  // token, the WhatsApp token, and the AI provider key. This query is gated by
  // `requireActiveOutlet`, so every cashier can call it, and the client writes
  // the result straight into IndexedDB — a raw document here would put a
  // production payment credential, unencrypted, on every till in the cafe.
  // `registerSettingsValidator` ships only the pricing/tax/receipt fields the
  // register actually needs; the redaction lives in `lib/settings.ts`.
  settings: registerSettingsValidator,
  shift: docOf('shifts'),
  // Likewise projected: `pinHash` and `hourlyRateIDR` are not needed to ring a
  // sale and must not be persisted to device storage.
  staff: v.array(registerStaffValidator),
});

/**
 * Everything the register needs to ring a cash sale from cached data during an
 * outage, read in ONE query so the client can persist it as a single snapshot
 * (`src/lib/offline/register-cache.ts`) without mixing prices from two
 * different points in time.
 *
 * Menu-side rows are the raw documents, not the reshaped rows
 * `menu.items.listForSale` returns: the cache's `RegisterSnapshot` is derived
 * from this query's return type, and assembling it out of the trimmed view
 * shapes would mean casting fabricated documents into a type the rest of the
 * offline code trusts.
 *
 * `settings` and `staff` are the exception and are projected down (see the
 * validator above): both carry fields — payment-provider credentials, PIN
 * hashes, hourly rates — that must never reach a client, let alone a client
 * that writes them to IndexedDB.
 *
 * Returns null when the cafe has no `cafeSettings` row or no open shift. There
 * is no complete snapshot to take in that state, and a partial one would be
 * worse than none: `isUsable` would wave it through and the till would price a
 * sale off it.
 *
 * Prices here are the STANDARD ones. Price-category overrides are not part of
 * the snapshot shape, so a rehydrated offline register rings at standard
 * prices — the same reason the cart resets to Standard on recall.
 */
export const registerSnapshot = query({
  args: {},
  returns: v.union(registerSnapshotValidator, v.null()),
  handler: async (ctx) => {
    const { cafeId } = await requireActiveOutlet(ctx);

    const settings = await ctx.db
      .query('cafeSettings')
      .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
      .first();
    if (!settings) return null;

    const shift = await ctx.db
      .query('shifts')
      .withIndex('by_cafe_status', (q) => q.eq('cafeId', cafeId).eq('status', 'open'))
      .first();
    if (!shift) return null;

    const items = (
      await ctx.db
        .query('menuItems')
        .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId).eq('archived', false))
        .collect()
    ).filter((item) => item.isActive);

    const categories = await ctx.db
      .query('categories')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId).eq('archived', false))
      .collect();

    const modifierGroups = await ctx.db
      .query('modifierGroups')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId).eq('archived', false))
      .collect();

    // modifierOptions is indexed by group, not by cafe, so it is one indexed
    // read per (non-archived) group rather than a table scan.
    const modifierOptions = [];
    for (const group of modifierGroups) {
      const options = await ctx.db
        .query('modifierOptions')
        .withIndex('by_group_active', (q) => q.eq('groupId', group._id).eq('archived', false))
        .collect();
      modifierOptions.push(...options);
    }

    const variants = (
      await ctx.db
        .query('menuItemVariants')
        .withIndex('by_cafe_item', (q) => q.eq('cafeId', cafeId))
        .collect()
    ).filter((variant) => !variant.archived);

    const priceCategories = await ctx.db
      .query('priceCategories')
      .withIndex('by_cafe_and_active', (q) => q.eq('cafeId', cafeId).eq('archived', false))
      .collect();

    const promos = await ctx.db
      .query('promotions')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId).eq('archived', false))
      .collect();

    const staff = await ctx.db
      .query('cafeStaff')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId).eq('archived', false))
      .collect();

    return {
      items,
      categories,
      modifierGroups,
      modifierOptions,
      variants,
      priceCategories,
      promos,
      settings: projectRegisterSettings(settings),
      shift,
      staff: staff.map(projectRegisterStaff),
    };
  },
});
