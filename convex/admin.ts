import { v } from 'convex/values';
import { query } from './_generated/server';
import { requirePlatformAdmin } from './lib/auth';

export const listUsers = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx) => {
    await requirePlatformAdmin(ctx);
    return [];
  },
});
