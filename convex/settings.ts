import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { requireOwnerCafe } from './lib/auth';
import { DEFAULT_SERVICE_CHARGE_NAME } from './lib/pricing';

/**
 * Default settings used whenever a cafe has no `cafeSettings` row yet, or a
 * group within it is unset. `settings.get` merges the stored row over this so
 * the client always receives a complete shape.
 */
export const DEFAULT_SETTINGS = {
  payment: {
    methods: {
      cash: true,
      qrisStatic: true,
      qrisDynamic: false,
      card: false,
      ewallet: false,
      transfer: false,
    },
    defaultMethod: 'cash' as const,
    cashRounding: 'none' as const,
    quickCashButtons: [20000, 50000, 100000],
    serviceChargeEnabled: false,
    serviceChargePct: 0,
    serviceChargeName: DEFAULT_SERVICE_CHARGE_NAME,
  },
  receipt: {
    showLogo: true,
    showAddress: true,
    showPhone: true,
    showCashier: true,
    showOrderNumber: true,
    showItemModifiers: true,
    showTaxBreakdown: true,
    paperSize: '80mm' as const,
    fontSize: 'normal' as const,
    autoPrint: false,
    printCopies: 1,
    printerType: 'bluetooth' as const,
    openDrawer: false,
  },
  integrations: [] as NonNullable<Doc<'cafeSettings'>['integrations']>,
  taxName: 'PB1',
  taxInclusive: false,
};

const paymentValidator = v.object({
  methods: v.object({
    cash: v.boolean(),
    qrisStatic: v.boolean(),
    qrisDynamic: v.boolean(),
    card: v.boolean(),
    ewallet: v.boolean(),
    transfer: v.boolean(),
  }),
  defaultMethod: v.union(
    v.literal('cash'),
    v.literal('qris_static'),
    v.literal('qris_dynamic'),
    v.literal('card'),
    v.literal('ewallet'),
    v.literal('transfer')
  ),
  cashRounding: v.union(
    v.literal('none'),
    v.literal('nearest_100'),
    v.literal('nearest_500'),
    v.literal('nearest_1000')
  ),
  quickCashButtons: v.array(v.number()),
  serviceChargeEnabled: v.boolean(),
  serviceChargePct: v.number(),
  serviceChargeName: v.string(),
  qrisMerchantName: v.optional(v.string()),
  qrisNmid: v.optional(v.string()),
  qrisImageStorageId: v.optional(v.id('_storage')),
});

const receiptValidator = v.object({
  headerText: v.optional(v.string()),
  footerText: v.optional(v.string()),
  orderNumberPrefix: v.optional(v.string()),
  showLogo: v.boolean(),
  showAddress: v.boolean(),
  showPhone: v.boolean(),
  showCashier: v.boolean(),
  showOrderNumber: v.boolean(),
  showItemModifiers: v.boolean(),
  showTaxBreakdown: v.boolean(),
  paperSize: v.union(v.literal('58mm'), v.literal('80mm')),
  fontSize: v.union(v.literal('small'), v.literal('normal'), v.literal('large')),
  autoPrint: v.boolean(),
  printCopies: v.number(),
  printerType: v.union(
    v.literal('bluetooth'),
    v.literal('usb'),
    v.literal('network')
  ),
  openDrawer: v.boolean(),
});

const notificationsValidator = v.object({
  summaryEmail: v.optional(v.string()),
  emailSummaryOnClose: v.boolean(),
});

const integrationsValidator = v.array(
  v.object({
    key: v.string(),
    connected: v.boolean(),
    connectedAt: v.optional(v.number()),
    config: v.optional(v.any()),
  })
);

const settingsValidator = v.object({
  payment: paymentValidator,
  receipt: receiptValidator,
  integrations: integrationsValidator,
  notifications: notificationsValidator,
  taxName: v.string(),
  taxInclusive: v.boolean(),
  npwp: v.optional(v.string()),
  taxRatePct: v.number(),
  taxEnabled: v.boolean(),
  qrisImageUrl: v.optional(v.string()),
});

export const get = query({
  args: {},
  returns: settingsValidator,
  handler: async (ctx) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const cafe = await ctx.db.get(cafeId);
    const row = await ctx.db
      .query('cafeSettings')
      .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
      .first();

    const payment = row?.payment ?? DEFAULT_SETTINGS.payment;
    // Resolve from `row` (a Doc, whose payment carries the optional storage id),
    // not the merged `payment` — DEFAULT_SETTINGS.payment is a literal without
    // the field, so the union would not type-check a direct property access.
    const storageId = row?.payment?.qrisImageStorageId;
    const qrisImageUrl = storageId ? await ctx.storage.getUrl(storageId) : null;

    // Strip server-only secrets (Xendit creds) from the qris integration before
    // returning to the client — only the non-sensitive provider + key hint leak.
    const integrations = (row?.integrations ?? DEFAULT_SETTINGS.integrations).map((i) =>
      i.key === 'qris'
        ? {
            key: i.key,
            connected: i.connected,
            ...(i.connectedAt !== undefined ? { connectedAt: i.connectedAt } : {}),
            config: {
              provider: (i.config as { provider?: string } | undefined)?.provider ?? 'xendit',
              keyHint: (i.config as { keyHint?: string } | undefined)?.keyHint ?? '',
            },
          }
        : i
    );

    return {
      payment,
      receipt: row?.receipt ?? DEFAULT_SETTINGS.receipt,
      integrations,
      notifications: row?.notifications ?? { emailSummaryOnClose: false },
      taxName: row?.taxName ?? DEFAULT_SETTINGS.taxName,
      taxInclusive: row?.taxInclusive ?? DEFAULT_SETTINGS.taxInclusive,
      ...(row?.npwp !== undefined ? { npwp: row.npwp } : {}),
      taxRatePct: cafe?.taxRatePct ?? 11,
      taxEnabled: cafe?.taxEnabled ?? true,
      ...(qrisImageUrl ? { qrisImageUrl } : {}),
    };
  },
});

// ---------------------------------------------------------------------------
// Private helper
// ---------------------------------------------------------------------------

async function getOrCreateSettingsId(
  ctx: MutationCtx,
  cafeId: Id<'cafes'>
): Promise<Id<'cafeSettings'>> {
  const row = await ctx.db
    .query('cafeSettings')
    .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
    .first();
  if (row) return row._id;
  return await ctx.db.insert('cafeSettings', { cafeId, updatedAt: Date.now() });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export const updatePayment = mutation({
  args: { payment: paymentValidator },
  returns: v.null(),
  handler: async (ctx, { payment }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const id = await getOrCreateSettingsId(ctx, cafeId);
    await ctx.db.patch(id, { payment, updatedAt: Date.now() });
    return null;
  },
});

export const updateNotifications = mutation({
  args: { notifications: notificationsValidator },
  returns: v.null(),
  handler: async (ctx, { notifications }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const id = await getOrCreateSettingsId(ctx, cafeId);
    await ctx.db.patch(id, { notifications, updatedAt: Date.now() });
    return null;
  },
});

export const updateReceipt = mutation({
  args: { receipt: receiptValidator },
  returns: v.null(),
  handler: async (ctx, { receipt }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const id = await getOrCreateSettingsId(ctx, cafeId);
    await ctx.db.patch(id, { receipt, updatedAt: Date.now() });
    return null;
  },
});

export const updateTaxPayment = mutation({
  args: {
    taxRatePct: v.number(),
    taxEnabled: v.boolean(),
    taxName: v.string(),
    taxInclusive: v.boolean(),
    npwp: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { taxRatePct, taxEnabled, taxName, taxInclusive, npwp }) => {
    if (taxRatePct < 0 || taxRatePct > 100) {
      throw new Error('Persentase pajak harus antara 0 dan 100.');
    }
    const { cafeId } = await requireOwnerCafe(ctx);
    await ctx.db.patch(cafeId, { taxRatePct, taxEnabled });
    const id = await getOrCreateSettingsId(ctx, cafeId);
    await ctx.db.patch(id, {
      taxName: taxName.trim(),
      taxInclusive,
      npwp: npwp?.trim() || undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const connectIntegration = mutation({
  args: { key: v.string(), config: v.optional(v.any()) },
  returns: v.null(),
  handler: async (ctx, { key, config }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const id = await getOrCreateSettingsId(ctx, cafeId);
    const row = await ctx.db.get(id);
    const existing = row?.integrations ?? [];
    const items = existing.filter((item) => item.key !== key);
    items.push({
      key,
      connected: true,
      connectedAt: Date.now(),
      ...(config !== undefined ? { config } : {}),
    });
    await ctx.db.patch(id, { integrations: items, updatedAt: Date.now() });
    return null;
  },
});

export const connectQrisProvider = mutation({
  args: { secretApiKey: v.string(), callbackToken: v.string() },
  returns: v.null(),
  handler: async (ctx, { secretApiKey, callbackToken }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const key = secretApiKey.trim();
    const token = callbackToken.trim();
    if (!key.startsWith('xnd_')) throw new Error('Secret API Key Xendit tidak valid.');
    if (!token) throw new Error('Callback token wajib diisi.');
    const id = await getOrCreateSettingsId(ctx, cafeId);
    const row = await ctx.db.get(id);
    const keyHint = `${key.slice(0, 8)}…${key.slice(-4)}`;
    const existing = (row?.integrations ?? []).filter((i) => i.key !== 'qris');
    existing.push({
      key: 'qris',
      connected: true,
      connectedAt: Date.now(),
      config: { provider: 'xendit', secretApiKey: key, callbackToken: token, keyHint },
    });
    await ctx.db.patch(id, { integrations: existing, updatedAt: Date.now() });
    return null;
  },
});

export const disconnectIntegration = mutation({
  args: { key: v.string() },
  returns: v.null(),
  handler: async (ctx, { key }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    // Disconnecting QRIS while a dynamic order is awaiting payment would strand it:
    // a later genuine webhook can't be verified (no cafe config), so the order
    // gets swept to void even though the customer paid. Block until it resolves.
    if (key === 'qris') {
      const unconfirmed = await ctx.db
        .query('payments')
        .withIndex('by_cafe_method_confirmed', (q) =>
          q.eq('cafeId', cafeId).eq('method', 'qris_dynamic').eq('confirmedAt', undefined)
        )
        .collect();
      for (const p of unconfirmed) {
        const order = await ctx.db.get(p.orderId);
        if (order?.paymentStatus === 'pending') {
          throw new Error('Tidak bisa memutuskan QRIS saat ada pembayaran QRIS dinamis yang tertunda.');
        }
      }
    }
    const id = await getOrCreateSettingsId(ctx, cafeId);
    const row = await ctx.db.get(id);
    const existing = row?.integrations ?? [];
    const items = existing.filter((item) => item.key !== key);
    await ctx.db.patch(id, { integrations: items, updatedAt: Date.now() });
    return null;
  },
});
