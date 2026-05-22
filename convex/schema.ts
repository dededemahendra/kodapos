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
  }).index('by_cafe_active', ['cafeId', 'archived']),

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
      })
    ),
    subtotalIDR: v.number(),
    taxRatePct: v.number(),
    taxIDR: v.number(),
    discountIDR: v.number(),
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
});
