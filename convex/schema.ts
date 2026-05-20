import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  ...authTables,

  // Minimal Phase 0 cafes table — used only to verify the auth → query path.
  // Full §2 domain model lands in Phase 1.
  cafes: defineTable({
    name: v.string(),
    ownerUserId: v.id('users'),
    createdAt: v.number(),
  }).index('by_owner', ['ownerUserId']),
});
