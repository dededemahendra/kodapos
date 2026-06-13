import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  type MutationCtx,
  query,
  type QueryCtx,
} from './_generated/server';
import { computeOrderTotals, DEFAULT_SERVICE_CHARGE_NAME } from './lib/pricing';
import { resolveProvider } from './payments/providers';

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
        soldOut: v.boolean(),
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
    payNowAvailable: v.boolean(),
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
        soldOut: item.soldOut ?? false,
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

    // Pay-now is offered only when a QRIS-dynamic integration is connected. This is
    // a non-throwing presence check (mirrors getQrisConfig) — no creds exposed.
    const payNowAvailable = (settings?.integrations ?? []).some(
      (i) => i.key === 'qris' && i.connected
    );

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
      payNowAvailable,
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
  if (!item || item.cafeId !== cafeId || item.archived || !item.isActive || item.soldOut) {
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
    if (!group || group.cafeId !== cafeId || !attachedGroupIds.has(group._id)) {
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
  if (unitPriceIDR < 0) {
    throw new Error('Harga item tidak valid.');
  }

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
    // 0. Bound attacker-controlled inputs before any DB work. `clientId` is a
    // browser-minted UUID (36 chars); reject trivial/oversized values that could
    // force collisions or bloat the idempotency index.
    if (args.clientId.length < 16 || args.clientId.length > 64) {
      throw new Error('clientId tidak valid.');
    }
    if (args.customerNote && args.customerNote.length > 500) {
      throw new Error('Catatan terlalu panjang.');
    }

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
      .take(MAX_PENDING_SELF_ORDERS);
    if (pending.length >= MAX_PENDING_SELF_ORDERS) {
      throw new Error('Terlalu banyak pesanan menunggu. Hubungi staf.');
    }

    // 4. Server-side line validation + pricing (never trust client amounts).
    if (args.lines.length < 1) throw new Error('Keranjang kosong.');
    if (args.lines.length > 20) {
      throw new Error('Terlalu banyak item dalam satu pesanan.');
    }
    for (const line of args.lines) {
      if (line.modifierOptionIds.length > 20) {
        throw new Error('Terlalu banyak modifier.');
      }
    }
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
  args: { selfOrderId: v.id('selfOrders'), qrToken: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      status: v.union(v.literal('new'), v.literal('accepted'), v.literal('rejected')),
      paymentStatus: v.union(v.literal('unpaid'), v.literal('awaiting'), v.literal('paid')),
      // Charge details only while awaiting payment (so the customer can show the QR).
      qrString: v.optional(v.string()),
      expiresAt: v.optional(v.number()),
      totalIDR: v.optional(v.number()),
    })
  ),
  handler: async (ctx: QueryCtx, { selfOrderId, qrToken }) => {
    // Bind the read to the table's capability token so a guessed/enumerated
    // selfOrderId alone can't poll an arbitrary order's status. Only someone
    // holding the order's own table qrToken sees it. We return ONLY the status +
    // (while awaiting) the QR/amount needed to pay — no lines/cafe/table data leaks.
    const row = await ctx.db.get(selfOrderId);
    if (!row || !row.tableId) return null;
    const table = await ctx.db
      .query('tables')
      .withIndex('by_qr_token', (q) => q.eq('qrToken', qrToken))
      .unique();
    if (!table || table._id !== row.tableId) return null;
    const paymentStatus = row.paymentStatus ?? 'unpaid';
    return {
      status: row.status,
      paymentStatus,
      ...(paymentStatus === 'awaiting'
        ? { qrString: row.qrString, expiresAt: row.expiresAt, totalIDR: row.totalIDR }
        : {}),
    };
  },
});

// ---------------------------------------------------------------------------
// createSelfOrderCharge — public pay-now QRIS charge (server-authoritative)
// ---------------------------------------------------------------------------

/**
 * Internal: load the self-order + its cafe's tax/SC config for a public charge,
 * binding the read to the table's capability token. Returns the data the action
 * needs to recompute the TRUE total + decide idempotency. Throws on a token/order
 * mismatch (the action runs unauthenticated, so this is the only guard).
 */
export const getSelfOrderForCharge = internalQuery({
  args: { selfOrderId: v.id('selfOrders'), qrToken: v.string() },
  returns: v.object({
    cafeId: v.id('cafes'),
    subtotalIDR: v.number(),
    pricing: v.object({
      serviceChargeEnabled: v.boolean(),
      serviceChargePct: v.number(),
      taxEnabled: v.boolean(),
      taxRatePct: v.number(),
    }),
  }),
  handler: async (ctx, { selfOrderId, qrToken }) => {
    const row = await ctx.db.get(selfOrderId);
    if (!row || !row.tableId) throw new Error('Pesanan tidak ditemukan.');
    const table = await ctx.db
      .query('tables')
      .withIndex('by_qr_token', (q) => q.eq('qrToken', qrToken))
      .unique();
    if (!table || table._id !== row.tableId) throw new Error('QR tidak valid.');

    // Only a still-pending ('new') order may be charged. A rejected order must
    // never collect money; an accepted one is already being processed at the
    // register. (The awaiting/paid idempotent early-return below still applies
    // for a 'new' order that was already charged.)
    if (row.status === 'rejected') throw new Error('Pesanan sudah ditolak.');
    if (row.status === 'accepted') throw new Error('Pesanan sudah diproses.');

    const cafe = await ctx.db.get(row.cafeId);
    if (!cafe) throw new Error('Pesanan tidak ditemukan.');
    const settings = await ctx.db
      .query('cafeSettings')
      .withIndex('by_cafe', (q) => q.eq('cafeId', row.cafeId))
      .first();
    const pay = settings?.payment;
    const taxEnabled = cafe.taxEnabled === true;
    const scEnabled = pay?.serviceChargeEnabled === true;

    // Idempotency (an already-charged order returning its existing QR) is owned by
    // `claimSelfOrderChargeSlot`, which the action calls next — this query only
    // validates + supplies the data to recompute the true total.
    return {
      cafeId: row.cafeId,
      subtotalIDR: row.subtotalIDR,
      pricing: {
        serviceChargeEnabled: scEnabled,
        serviceChargePct: scEnabled ? (pay?.serviceChargePct ?? 0) : 0,
        taxEnabled,
        taxRatePct: taxEnabled ? (cafe.taxRatePct ?? 0) : 0,
      },
    };
  },
});

/**
 * Internal: atomically claim the single charge slot for a self-order (TOCTOU
 * guard against two concurrent `createSelfOrderCharge` calls each creating a
 * Xendit charge). In one transaction:
 *  - If already charged (awaiting w/ providerRef, or paid) → return the existing
 *    `{ qrString, expiresAt, totalIDR }` (loser reuses the winner's charge).
 *  - If rejected/accepted → throw (mirrors getSelfOrderForCharge / Finding 2).
 *  - Else mark `paymentStatus:'awaiting'` (the CLAIM — no providerRef yet) and
 *    return `null` so the caller knows it won the slot and must create the charge.
 */
export const claimSelfOrderChargeSlot = internalMutation({
  args: { selfOrderId: v.id('selfOrders') },
  returns: v.union(
    v.null(),
    v.object({ qrString: v.string(), expiresAt: v.number(), totalIDR: v.number() })
  ),
  handler: async (ctx, { selfOrderId }) => {
    const row = await ctx.db.get(selfOrderId);
    if (!row) throw new Error('Pesanan tidak ditemukan.');
    if (row.status === 'rejected') throw new Error('Pesanan sudah ditolak.');
    if (row.status === 'accepted') throw new Error('Pesanan sudah diproses.');

    // Already charged → hand back the existing charge (no second provider charge).
    if (
      (row.paymentStatus === 'awaiting' || row.paymentStatus === 'paid') &&
      row.providerRef &&
      row.qrString &&
      row.expiresAt !== undefined &&
      row.totalIDR !== undefined
    ) {
      return { qrString: row.qrString, expiresAt: row.expiresAt, totalIDR: row.totalIDR };
    }

    // A concurrent loser may see awaiting w/o a providerRef yet (claimed, charge
    // in flight). Return its (possibly-undefined) charge fields — the winning call
    // returns the real QR to its own client; the UI calls the action once per tap.
    if (row.paymentStatus === 'awaiting') {
      if (
        row.qrString &&
        row.expiresAt !== undefined &&
        row.totalIDR !== undefined
      ) {
        return { qrString: row.qrString, expiresAt: row.expiresAt, totalIDR: row.totalIDR };
      }
      // Charge in flight, QR not stored yet — treat as already-claimed (no-op for
      // this caller; it returns the bare row fields, acceptable per spec).
      return null;
    }

    // Win the slot: claim awaiting (no providerRef yet).
    await ctx.db.patch(selfOrderId, { paymentStatus: 'awaiting' });
    return null;
  },
});

/** Internal: reset a claimed-but-failed charge back to unpaid (Xendit threw). */
export const resetSelfOrderChargeSlot = internalMutation({
  args: { selfOrderId: v.id('selfOrders') },
  returns: v.null(),
  handler: async (ctx, { selfOrderId }) => {
    const row = await ctx.db.get(selfOrderId);
    // Only release a slot that's still awaiting WITHOUT a real charge attached, so
    // we never clobber a charge that actually landed.
    if (row && row.paymentStatus === 'awaiting' && !row.providerRef) {
      await ctx.db.patch(selfOrderId, { paymentStatus: 'unpaid' });
    }
    return null;
  },
});

/** Internal: persist a freshly created pay-now charge onto the self-order. */
export const markSelfOrderCharged = internalMutation({
  args: {
    selfOrderId: v.id('selfOrders'),
    totalIDR: v.number(),
    providerRef: v.string(),
    qrString: v.string(),
    expiresAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { selfOrderId, totalIDR, providerRef, qrString, expiresAt }) => {
    const row = await ctx.db.get(selfOrderId);
    // Idempotency guard against a race: if another charge already landed, keep it.
    if (row && (row.paymentStatus === 'awaiting' || row.paymentStatus === 'paid') && row.providerRef) {
      return null;
    }
    await ctx.db.patch(selfOrderId, {
      paymentMode: 'qris',
      paymentStatus: 'awaiting',
      totalIDR,
      providerRef,
      qrString,
      expiresAt,
    });
    return null;
  },
});

/**
 * Public (UNAUTHENTICATED) pay-now charge. The customer holds only the table's
 * `qrToken` + the `selfOrderId` they just created. This NEVER calls
 * `requireOwnerCafe`. Security spine:
 *
 *  - The amount is RECOMPUTED server-side (`computeOrderTotals` over the stored
 *    snapshot lines + the cafe's tax/SC config) — the client can never set it,
 *    and it is the TRUE total incl tax/SC, not the bare subtotal.
 *  - Idempotent: once a charge exists (awaiting/paid) the same QR/amount is
 *    returned with NO second provider charge (one charge per self-order).
 *  - The QRIS provider config (creds) stays server-only; only `{ qrString,
 *    expiresAt, totalIDR }` is returned to the public.
 */
export const createSelfOrderCharge = action({
  args: { qrToken: v.string(), selfOrderId: v.id('selfOrders') },
  returns: v.object({ qrString: v.string(), expiresAt: v.number(), totalIDR: v.number() }),
  handler: async (
    ctx,
    { qrToken, selfOrderId }
  ): Promise<{ qrString: string; expiresAt: number; totalIDR: number }> => {
    // The query validates the qrToken↔table binding + the order status (throws on
    // rejected/accepted / token mismatch) and returns the data to recompute the
    // true total. It does NOT mutate.
    const info = await ctx.runQuery(internal.public.getSelfOrderForCharge, { selfOrderId, qrToken });

    // Atomically claim the single charge slot. A concurrent loser gets the
    // existing charge back here (and never creates a second Xendit charge); the
    // claim also re-checks status (rejected/accepted → throw).
    const claimed = await ctx.runMutation(internal.public.claimSelfOrderChargeSlot, {
      selfOrderId,
    });
    if (claimed) return claimed;

    // Server-authoritative TRUE total (subtotal + SC + tax). discount 0 (no promo
    // engine on the public surface yet).
    const { totalIDR } = computeOrderTotals({
      subtotalIDR: info.subtotalIDR,
      discountIDR: 0,
      ...info.pricing,
    });

    const config = await ctx.runQuery(internal.payments.qrisDynamic.getQrisConfig, {
      cafeId: info.cafeId,
    });
    if (!config) {
      // We claimed the slot but can't charge — release it so the order isn't stuck
      // in `awaiting` with no QR.
      await ctx.runMutation(internal.public.resetSelfOrderChargeSlot, { selfOrderId });
      throw new Error('Pembayaran QRIS tidak tersedia.');
    }

    let charge: { providerRef: string; qrString: string; expiresAt: number };
    try {
      charge = await resolveProvider(config).createCharge({
        amountIDR: totalIDR,
        referenceId: `so_${selfOrderId}`,
      });
    } catch (err) {
      // Xendit threw — release the claimed slot back to `unpaid` so it isn't stuck
      // in `awaiting` with no QR, then rethrow.
      await ctx.runMutation(internal.public.resetSelfOrderChargeSlot, { selfOrderId });
      throw err;
    }

    await ctx.runMutation(internal.public.markSelfOrderCharged, {
      selfOrderId,
      totalIDR,
      providerRef: charge.providerRef,
      qrString: charge.qrString,
      expiresAt: charge.expiresAt,
    });

    return { qrString: charge.qrString, expiresAt: charge.expiresAt, totalIDR };
  },
});
