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
});
