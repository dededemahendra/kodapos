import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { query } from './_generated/server';
import { requireOwnerCafe } from './lib/auth';

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
    serviceChargeName: 'Biaya Layanan',
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
  taxName: v.string(),
  taxInclusive: v.boolean(),
  npwp: v.optional(v.string()),
  taxRatePct: v.number(),
  taxEnabled: v.boolean(),
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

    return {
      payment: row?.payment ?? DEFAULT_SETTINGS.payment,
      receipt: row?.receipt ?? DEFAULT_SETTINGS.receipt,
      integrations: row?.integrations ?? DEFAULT_SETTINGS.integrations,
      taxName: row?.taxName ?? DEFAULT_SETTINGS.taxName,
      taxInclusive: row?.taxInclusive ?? DEFAULT_SETTINGS.taxInclusive,
      ...(row?.npwp ? { npwp: row.npwp } : {}),
      taxRatePct: cafe?.taxRatePct ?? 11,
      taxEnabled: cafe?.taxEnabled ?? true,
    };
  },
});
