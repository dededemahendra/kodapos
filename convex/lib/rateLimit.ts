import type { MutationCtx } from '../_generated/server';

/**
 * Fixed-window rate limiter backed by the `otpRateLimit` table (a generic
 * identifier/window/count store). Callers pass a prefixed identifier so flows
 * have independent buckets (e.g. `otp:`, `reset:`, `ai:<cafeId>`). Throws the
 * given off-catalog message when the window's allowance is exhausted.
 */
export async function enforceRateLimit(
  ctx: MutationCtx,
  opts: { identifier: string; windowMs: number; max: number; message: string }
): Promise<void> {
  const now = Date.now();
  // .first() (not .unique()): if a rare write race ever produced two rows for
  // one identifier, .unique() would throw forever and permanently break that
  // bucket; .first() degrades gracefully instead.
  const existing = await ctx.db
    .query('otpRateLimit')
    .withIndex('by_identifier', (q) => q.eq('identifier', opts.identifier))
    .first();

  if (existing === null) {
    await ctx.db.insert('otpRateLimit', { identifier: opts.identifier, windowStart: now, count: 1 });
    return;
  }
  if (now - existing.windowStart > opts.windowMs) {
    await ctx.db.patch(existing._id, { windowStart: now, count: 1 });
    return;
  }
  if (existing.count >= opts.max) {
    throw new Error(opts.message);
  }
  await ctx.db.patch(existing._id, { count: existing.count + 1 });
}
