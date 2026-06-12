import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, type MutationCtx, query, type QueryCtx } from './_generated/server';
import { DEFAULT_SERVICE_CHARGE_NAME } from './lib/pricing';

/**
 * Public (UNAUTHENTICATED) QR self-order intake. These functions are kodapos's
 * first surface reachable without a login, so the security posture is the spine:
 *
 *  - They NEVER call `requireOwnerCafe`. The cafe/table are resolved ONLY from an
 *    unguessable per-table `qrToken` (a 128-bit capability). An unknown token
 *    yields `null` (menuForTable) or a generic throw (submit) — no error oracle.
 *  - `menuForTable` exposes ONLY sellable menu data — no cost, stock, recipe, or
 *    any other owner field.
 *  - `submitSelfOrder` RECOMPUTES every price server-side. The client sends only
 *    item ids + quantities (+ variant/modifier ids); it can never set an amount.
 *  - Abuse guards: per-cafe pending cap + `clientId` idempotency + qty bounds.
 *
 * A submitted self-order is only a *request*. It becomes a real order solely
 * through the authenticated staff Accept → register path (convex/selfOrders.ts).
 */

/** Per-cafe cap on outstanding `new` self-orders before submission is refused. */
export const MAX_PENDING_SELF_ORDERS = 8;

// ---------------------------------------------------------------------------
// menuForTable — public, sellable-only menu assembly
// ---------------------------------------------------------------------------

const menuForTableResult = v.union(
  v.null(),
  v.object({
    cafe: v.object({ name: v.string(), logoUrl: v.union(v.string(), v.null()) }),
    table: v.object({ id: v.id('tables'), name: v.string() }),
    categories: v.array(v.object({ id: v.id('categories'), name: v.string() })),
    items: v.array(
      v.object({
        id: v.id('menuItems'),
        categoryId: v.id('categories'),
        name: v.string(),
        priceIDR: v.number(),
        imageUrl: v.union(v.string(), v.null()),
        variants: v.array(
          v.object({ id: v.id('menuItemVariants'), name: v.string(), priceIDR: v.number() })
        ),
        modifierGroups: v.array(
          v.object({
            id: v.id('modifierGroups'),
            name: v.string(),
            required: v.boolean(),
            minSelect: v.number(),
            maxSelect: v.number(),
            options: v.array(
              v.object({
                id: v.id('modifierOptions'),
                name: v.string(),
                priceAdjustmentIDR: v.number(),
              })
            ),
          })
        ),
      })
    ),
    pricing: v.object({
      taxEnabled: v.boolean(),
      taxRatePct: v.number(),
      serviceChargeEnabled: v.boolean(),
      serviceChargePct: v.number(),
      serviceChargeName: v.string(),
    }),
  })
);

export const menuForTable = query({
  args: { qrToken: v.string() },
  returns: menuForTableResult,
  handler: async (ctx, { qrToken }) => {
    // Resolve the table ONLY via the capability token. An unknown token returns
    // null — never an error that would confirm/deny a token's existence.
    const table = await ctx.db
      .query('tables')
      .withIndex('by_qr_token', (q) => q.eq('qrToken', qrToken))
      .unique();
    if (!table || table.archived) return null;

    const cafe = await ctx.db.get(table.cafeId);
    if (!cafe) return null;
    const cafeId = table.cafeId;

    // Sellable items only: active + not archived (mirrors menu.items.listForSale,
    // MINUS the owner bits — no cost/stock/recipe).
    const itemRows = await ctx.db
      .query('menuItems')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId).eq('archived', false))
      .collect();
    const activeItems = itemRows
      .filter((i) => i.isActive)
      .sort((a, b) => a.position - b.position);

    const items = [];
    for (const item of activeItems) {
      const variants = (
        await ctx.db
          .query('menuItemVariants')
          .withIndex('by_item_active', (q) =>
            q.eq('menuItemId', item._id).eq('archived', false)
          )
          .collect()
      )
        .sort((a, b) => a.position - b.position)
        .map((vr) => ({ id: vr._id, name: vr.name, priceIDR: vr.priceIDR }));

      const joins = (
        await ctx.db
          .query('menuItemModifierGroups')
          .withIndex('by_item', (q) => q.eq('menuItemId', item._id))
          .collect()
      ).sort((a, b) => a.position - b.position);
      const modifierGroups = [];
      for (const j of joins) {
        const group = await ctx.db.get(j.modifierGroupId);
        if (!group || group.archived) continue;
        const options = (
          await ctx.db
            .query('modifierOptions')
            .withIndex('by_group_active', (q) =>
              q.eq('groupId', group._id).eq('archived', false)
            )
            .collect()
        )
          .sort((a, b) => a.position - b.position)
          .map((o) => ({ id: o._id, name: o.name, priceAdjustmentIDR: o.priceAdjustmentIDR }));
        modifierGroups.push({
          id: group._id,
          name: group.name,
          required: group.required,
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
          options,
        });
      }

      items.push({
        id: item._id,
        categoryId: item.categoryId,
        name: item.name,
        priceIDR: item.priceIDR,
        imageUrl: item.imageStorageId ? await ctx.storage.getUrl(item.imageStorageId) : null,
        variants,
        modifierGroups,
      });
    }

    const categories = (
      await ctx.db
        .query('categories')
        .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId).eq('archived', false))
        .collect()
    )
      .sort((a, b) => a.position - b.position)
      .map((c) => ({ id: c._id, name: c.name }));

    const settings = await ctx.db
      .query('cafeSettings')
      .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
      .first();
    const pay = settings?.payment;

    const taxEnabled = cafe.taxEnabled === true;
    const scEnabled = pay?.serviceChargeEnabled === true;

    return {
      cafe: {
        name: cafe.name,
        logoUrl: cafe.logoStorageId ? await ctx.storage.getUrl(cafe.logoStorageId) : null,
      },
      table: { id: table._id, name: table.name },
      categories,
      items,
      pricing: {
        taxEnabled,
        taxRatePct: taxEnabled ? (cafe.taxRatePct ?? 0) : 0,
        serviceChargeEnabled: scEnabled,
        serviceChargePct: scEnabled ? (pay?.serviceChargePct ?? 0) : 0,
        serviceChargeName: pay?.serviceChargeName ?? DEFAULT_SERVICE_CHARGE_NAME,
      },
    };
  },
});

// ---------------------------------------------------------------------------
// submitSelfOrder — public intake with server-side validation + pricing
// ---------------------------------------------------------------------------

/**
 * The line arg validator accepts ONLY ids + qty — deliberately NO price field, so
 * a malicious client cannot inject `unitPriceIDR`/`subtotal`. Every amount is
 * recomputed server-side from the menu.
 */
const submitLine = v.object({
  menuItemId: v.id('menuItems'),
  qty: v.number(),
  variantId: v.optional(v.id('menuItemVariants')),
  modifierOptionIds: v.array(v.id('modifierOptions')),
});

type SubmitLine = {
  menuItemId: Id<'menuItems'>;
  qty: number;
  variantId?: Id<'menuItemVariants'>;
  modifierOptionIds: Id<'modifierOptions'>[];
};

type BuiltLine = Doc<'selfOrders'>['lines'][number];

/**
 * Validate one cart line against the cafe's menu and compute its authoritative
 * snapshot. Mirrors `buildOrder`'s per-line logic (item active+in-cafe+not
 * archived; variant valid; modifier options belong to the item's attached groups
 * and satisfy each group's min/max; `unitPriceIDR = (variant?.priceIDR ??
 * item.priceIDR) + Σ option.priceAdjustmentIDR`), but with NO auth/shift/cashier
 * and no recipe snapshot (stock stays on the authenticated path).
 */
async function buildSelfOrderLine(
  ctx: MutationCtx,
  cafeId: Id<'cafes'>,
  line: SubmitLine
): Promise<BuiltLine> {
  if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > 99) {
    throw new Error('Jumlah item tidak valid.');
  }

  const item = await ctx.db.get(line.menuItemId);
  if (!item || item.cafeId !== cafeId || item.archived || !item.isActive) {
    throw new Error('Item tidak tersedia.');
  }

  const variant = line.variantId ? await ctx.db.get(line.variantId) : null;
  if (
    line.variantId &&
    (!variant ||
      variant.menuItemId !== item._id ||
      variant.cafeId !== cafeId ||
      variant.archived)
  ) {
    throw new Error('Varian tidak tersedia.');
  }

  const attachments = await ctx.db
    .query('menuItemModifierGroups')
    .withIndex('by_item', (q) => q.eq('menuItemId', item._id))
    .collect();
  const attachedGroupIds = new Set(attachments.map((a) => a.modifierGroupId));

  const modifierLabels: string[] = [];
  let modifierAdjustments = 0;
  const countByGroup = new Map<string, number>();
  for (const optionId of line.modifierOptionIds) {
    const option = await ctx.db.get(optionId);
    if (!option || option.cafeId !== cafeId || option.archived) {
      throw new Error('Modifier tidak tersedia.');
    }
    const group = await ctx.db.get(option.groupId);
    if (!group || !attachedGroupIds.has(group._id)) {
      throw new Error('Modifier tidak tersedia.');
    }
    countByGroup.set(group._id, (countByGroup.get(group._id) ?? 0) + 1);
    modifierLabels.push(option.name);
    modifierAdjustments += option.priceAdjustmentIDR;
  }

  for (const attachment of attachments) {
    const group = await ctx.db.get(attachment.modifierGroupId);
    if (!group || group.archived) continue;
    const count = countByGroup.get(group._id) ?? 0;
    if (count < group.minSelect) {
      throw new Error(`Modifier wajib pada grup ${group.name} belum dipilih.`);
    }
    if (count > group.maxSelect) {
      throw new Error(`Pilihan modifier melebihi batas pada grup ${group.name}.`);
    }
  }

  const basePrice = variant ? variant.priceIDR : item.priceIDR;
  const unitPriceIDR = basePrice + modifierAdjustments;

  return {
    menuItemId: item._id,
    nameSnapshot: item.name,
    qty: line.qty,
    unitPriceIDR,
    ...(variant ? { variantId: variant._id, variantName: variant.name } : {}),
    modifierOptionIds: line.modifierOptionIds,
    modifierLabels,
  };
}

export const submitSelfOrder = mutation({
  args: {
    qrToken: v.string(),
    clientId: v.string(),
    lines: v.array(submitLine),
    customerNote: v.optional(v.string()),
  },
  returns: v.object({ selfOrderId: v.id('selfOrders') }),
  handler: async (ctx, args) => {
    // 1. Resolve the table+cafe ONLY from the capability token.
    const table = await ctx.db
      .query('tables')
      .withIndex('by_qr_token', (q) => q.eq('qrToken', args.qrToken))
      .unique();
    if (!table || table.archived) throw new Error('QR tidak valid.');
    const cafeId = table.cafeId;

    // 2. Idempotency — a replay of the same browser-minted clientId returns the
    // existing row instead of inserting a duplicate.
    const existing = await ctx.db
      .query('selfOrders')
      .withIndex('by_cafe_clientId', (q) =>
        q.eq('cafeId', cafeId).eq('clientId', args.clientId)
      )
      .first();
    if (existing) return { selfOrderId: existing._id };

    // 3. Abuse guard — refuse once too many orders are outstanding for the cafe.
    const pending = await ctx.db
      .query('selfOrders')
      .withIndex('by_cafe_status', (q) => q.eq('cafeId', cafeId).eq('status', 'new'))
      .collect();
    if (pending.length >= MAX_PENDING_SELF_ORDERS) {
      throw new Error('Terlalu banyak pesanan menunggu. Hubungi staf.');
    }

    // 4. Server-side line validation + pricing (never trust client amounts).
    if (args.lines.length < 1) throw new Error('Keranjang kosong.');
    const builtLines: BuiltLine[] = [];
    for (const line of args.lines) {
      builtLines.push(await buildSelfOrderLine(ctx, cafeId, line));
    }
    const subtotalIDR = builtLines.reduce((sum, l) => sum + l.qty * l.unitPriceIDR, 0);

    // 5. Insert as a pending request, snapshotting the table name for the queue.
    const note = args.customerNote?.trim();
    const selfOrderId = await ctx.db.insert('selfOrders', {
      cafeId,
      tableId: table._id,
      tableName: table.name,
      status: 'new',
      clientId: args.clientId,
      ...(note ? { customerNote: note } : {}),
      lines: builtLines,
      subtotalIDR,
      createdAt: Date.now(),
    });
    return { selfOrderId };
  },
});

// ---------------------------------------------------------------------------
// selfOrderStatus — public status read, leaking ONLY the status
// ---------------------------------------------------------------------------

export const selfOrderStatus = query({
  args: { selfOrderId: v.id('selfOrders') },
  returns: v.union(
    v.null(),
    v.object({
      status: v.union(v.literal('new'), v.literal('accepted'), v.literal('rejected')),
    })
  ),
  handler: async (ctx: QueryCtx, { selfOrderId }) => {
    // The id is known only to the submitter (returned by submitSelfOrder). We
    // return ONLY the status — no lines/prices/cafe/table data leaks.
    const row = await ctx.db.get(selfOrderId);
    if (!row) return null;
    return { status: row.status };
  },
});
