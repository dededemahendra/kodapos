import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  ...authTables,

  cafes: defineTable({
    name: v.string(),
    ownerUserId: v.id('users'),
    createdAt: v.number(),
    // Profile (added in Phase 1 · Slice 1). Optional in schema for
    // backward compatibility with existing rows; required when written
    // via cafes.updateProfile.
    phone: v.optional(v.string()),
    addressLine: v.optional(v.string()),
    timezone: v.optional(v.string()),
    taxRatePct: v.optional(v.number()),
    taxEnabled: v.optional(v.boolean()),
    setupCompletedAt: v.optional(v.number()),
    businessType: v.optional(v.string()),
    whatsapp: v.optional(v.string()),
    email: v.optional(v.string()),
    instagram: v.optional(v.string()),
    city: v.optional(v.string()),
    postalCode: v.optional(v.string()),
    logoStorageId: v.optional(v.id('_storage')),
    operatingHours: v.optional(
      v.array(
        v.object({
          day: v.number(), // 0=Mon .. 6=Sun
          open: v.boolean(),
          openTime: v.string(), // 'HH:MM'
          closeTime: v.string(),
        })
      )
    ),
  }).index('by_owner', ['ownerUserId']),

  categories: defineTable({
    cafeId: v.id('cafes'),
    name: v.string(),
    position: v.number(),
    archived: v.boolean(),
    createdAt: v.number(),
  }).index('by_cafe_active', ['cafeId', 'archived', 'position']),

  menuItems: defineTable({
    cafeId: v.id('cafes'),
    categoryId: v.id('categories'),
    name: v.string(),
    priceIDR: v.number(),
    isActive: v.boolean(),
    archived: v.boolean(),
    position: v.number(),
    createdAt: v.number(),
  })
    .index('by_cafe_category', ['cafeId', 'categoryId', 'archived', 'position'])
    .index('by_cafe_active', ['cafeId', 'archived', 'isActive']),

  modifierGroups: defineTable({
    cafeId: v.id('cafes'),
    name: v.string(),
    required: v.boolean(),
    minSelect: v.number(),
    maxSelect: v.number(),
    archived: v.boolean(),
    createdAt: v.number(),
  }).index('by_cafe_active', ['cafeId', 'archived']),

  modifierOptions: defineTable({
    cafeId: v.id('cafes'),
    groupId: v.id('modifierGroups'),
    name: v.string(),
    priceAdjustmentIDR: v.number(),
    position: v.number(),
    archived: v.boolean(),
    createdAt: v.number(),
  }).index('by_group_active', ['groupId', 'archived', 'position']),

  menuItemModifierGroups: defineTable({
    cafeId: v.id('cafes'),
    menuItemId: v.id('menuItems'),
    modifierGroupId: v.id('modifierGroups'),
    position: v.number(),
  })
    .index('by_item', ['menuItemId', 'position'])
    .index('by_group', ['modifierGroupId']),

  cafeStaff: defineTable({
    cafeId: v.id('cafes'),
    name: v.string(),
    pinHash: v.optional(v.string()),
    role: v.union(v.literal('owner'), v.literal('cashier')),
    archived: v.boolean(),
    createdAt: v.number(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    permissions: v.optional(
      v.object({
        canVoid: v.boolean(),
        canDiscount: v.boolean(),
        canManageShift: v.boolean(),
        canViewReports: v.boolean(),
        canEditMenu: v.boolean(),
      })
    ),
  }).index('by_cafe_active', ['cafeId', 'archived']),

  cafeSettings: defineTable({
    cafeId: v.id('cafes'),

    payment: v.optional(
      v.object({
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
      })
    ),

    receipt: v.optional(
      v.object({
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
        fontSize: v.union(
          v.literal('small'),
          v.literal('normal'),
          v.literal('large')
        ),
        autoPrint: v.boolean(),
        printCopies: v.number(),
        printerType: v.union(
          v.literal('bluetooth'),
          v.literal('usb'),
          v.literal('network')
        ),
        openDrawer: v.boolean(),
      })
    ),

    integrations: v.optional(
      v.array(
        v.object({
          key: v.string(),
          connected: v.boolean(),
          connectedAt: v.optional(v.number()),
          config: v.optional(v.any()),
        })
      )
    ),

    taxName: v.optional(v.string()),
    taxInclusive: v.optional(v.boolean()),
    npwp: v.optional(v.string()),

    updatedAt: v.number(),
  }).index('by_cafe', ['cafeId']),

  shifts: defineTable({
    cafeId: v.id('cafes'),
    cashierId: v.id('cafeStaff'),
    openedAt: v.number(),
    // Close-time fields. Optional because they are populated by
    // shifts.close (and Slice 5 will fill expectedCash/variance when
    // payments land); null/undefined while status === 'open'.
    closedAt: v.optional(v.number()),
    openingFloatIDR: v.number(),
    expectedCashIDR: v.optional(v.number()),
    countedCashIDR: v.optional(v.number()),
    varianceIDR: v.optional(v.number()),
    status: v.union(v.literal('open'), v.literal('closed')),
  })
    .index('by_cafe_status', ['cafeId', 'status'])
    .index('by_cafe_opened', ['cafeId', 'openedAt']),

  orders: defineTable({
    cafeId: v.id('cafes'),
    shiftId: v.id('shifts'),
    cashierId: v.id('cafeStaff'),
    clientId: v.string(),
    lines: v.array(
      v.object({
        menuItemId: v.id('menuItems'),
        nameSnapshot: v.string(),
        qty: v.number(),
        unitPriceIDR: v.number(),
        modifiersSnapshot: v.array(
          v.object({
            groupName: v.string(),
            optionName: v.string(),
            priceAdjustmentIDR: v.number(),
          })
        ),
        lineTotalIDR: v.number(),
        // Recipe frozen at sale time so retroactive recipe edits don't rewrite
        // history. Optional for backward compat with Slice 3 orders inserted
        // before this field existed. Going forward, every createCashSale writes
        // it — [] for items without a recipe.
        recipeSnapshot: v.optional(
          v.array(
            v.object({
              ingredientId: v.id('ingredients'),
              qty: v.number(),
              wastageFactor: v.number(),
            })
          )
        ),
      })
    ),
    subtotalIDR: v.number(),
    taxRatePct: v.number(),
    taxIDR: v.number(),
    discountIDR: v.number(),
    // Service charge (added in the service-charge slice). Optional for
    // backward-compat with orders created before it existed; createCashSale
    // always writes them going forward (serviceChargeIDR 0 when disabled).
    serviceChargeIDR: v.optional(v.number()),
    serviceChargePct: v.optional(v.number()),
    serviceChargeName: v.optional(v.string()),
    totalIDR: v.number(),
    paymentMethod: v.union(
      v.literal('cash'),
      v.literal('qris_static'),
      v.literal('qris_dynamic')
    ),
    // 'pending' + 'void' reserved for Slice 5 (QRIS + voids); cash always inserts 'paid'.
    paymentStatus: v.union(v.literal('pending'), v.literal('paid'), v.literal('void')),
    createdAtClient: v.number(),
    // Set by server at insert time today; optional reserved for Phase 2 offline-first when the client may persist an order before the backend confirms sync.
    syncedAt: v.optional(v.number()),
  })
    .index('by_cafe_clientId', ['cafeId', 'clientId'])
    .index('by_shift', ['shiftId'])
    .index('by_cafe_created', ['cafeId', 'createdAtClient']),

  payments: defineTable({
    cafeId: v.id('cafes'),
    orderId: v.id('orders'),
    method: v.union(
      v.literal('cash'),
      v.literal('qris_static'),
      v.literal('qris_dynamic')
    ),
    amountIDR: v.number(),
    cashTenderedIDR: v.optional(v.number()),
    changeIDR: v.optional(v.number()),
    providerRef: v.optional(v.string()),
    providerStatus: v.optional(v.string()),
    // Set on insert for cash; optional reserved for Slice 5 QRIS dynamic where the row exists in 'pending' state until the provider webhook fires.
    confirmedAt: v.optional(v.number()),
  })
    .index('by_order', ['orderId'])
    .index('by_cafe_method_confirmed', ['cafeId', 'method', 'confirmedAt']),

  ingredients: defineTable({
    cafeId: v.id('cafes'),
    name: v.string(),
    canonicalUnit: v.union(v.literal('g'), v.literal('ml'), v.literal('piece')),
    reorderThreshold: v.number(),
    lastCostPerUnitIDR: v.number(),
    archived: v.boolean(),
    createdAt: v.number(),
  })
    .index('by_cafe_active', ['cafeId', 'archived'])
    .index('by_cafe_name', ['cafeId', 'name']),

  recipes: defineTable({
    cafeId: v.id('cafes'),
    menuItemId: v.id('menuItems'),
    lines: v.array(
      v.object({
        ingredientId: v.id('ingredients'),
        qty: v.number(),
        wastageFactor: v.number(),
      })
    ),
    updatedAt: v.number(),
  }).index('by_cafe_item', ['cafeId', 'menuItemId']),

  purchases: defineTable({
    cafeId: v.id('cafes'),
    supplierName: v.optional(v.string()),
    at: v.number(),
    lines: v.array(
      v.object({
        ingredientId: v.id('ingredients'),
        qty: v.number(),
        unitCostIDR: v.number(),
      })
    ),
    totalIDR: v.number(),
    createdAt: v.number(),
  }).index('by_cafe_at', ['cafeId', 'at']),

  inventoryMovements: defineTable({
    cafeId: v.id('cafes'),
    ingredientId: v.id('ingredients'),
    delta: v.number(),
    reason: v.union(
      v.literal('sale'),
      v.literal('adjustment'),
      // 'waste' is written by waste.record (dedicated Catat Limbah flow).
      v.literal('waste'),
      // 'purchase' is written by purchases.record (Pembelian flow).
      v.literal('purchase')
    ),
    refType: v.optional(v.string()),
    refId: v.optional(v.string()),
    note: v.optional(v.string()),
    // Adjustment reason (e.g. "Pengiriman masuk"); set by adjustStock. Optional
    // so legacy rows (reason folded into note) still validate.
    reasonLabel: v.optional(v.string()),
    // Waste-only fields (undefined for sale/adjustment rows). Set by waste.record.
    wasteReason: v.optional(
      v.union(
        v.literal('rusak'),
        v.literal('basi'),
        v.literal('tumpah'),
        v.literal('salah_masak'),
        v.literal('lainnya')
      )
    ),
    // Snapshot of ingredient.lastCostPerUnitIDR at waste time, for immutable COGS.
    costPerUnitIDR: v.optional(v.number()),
    at: v.number(),
  })
    .index('by_cafe_ingredient', ['cafeId', 'ingredientId'])
    .index('by_cafe_ingredient_at', ['cafeId', 'ingredientId', 'at'])
    .index('by_cafe_reason_at', ['cafeId', 'reason', 'at']),
});
