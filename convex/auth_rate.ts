import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { enforceRateLimit } from './lib/rateLimit';

/** Fixed window length (ms) for OTP / reset code issuance. */
const WINDOW_MS = 10 * 60_000;
/** Max codes issued per identifier per window. */
const MAX_PER_WINDOW = 5;

/**
 * Server-side issuance rate limit for emailed codes. Called at the START of
 * `sendVerificationRequest` (which runs in an action ctx) via `runMutation`,
 * BEFORE the email is sent. The client-side resend cooldown is bypassable
 * (anyone can call `signIn('resend-otp', { email })` directly), so this is the
 * real gate. Keyed per-provider (`otp:` / `reset:` prefixed) so the two flows
 * have independent buckets. Throws an off-catalog Bahasa message on trip.
 *
 * NOTE: this caps issuance only; platform throttling on the verify side plus
 * single-use-after-success bound brute force (see the 8-digit code space).
 */
export const checkAndBump = internalMutation({
  args: { identifier: v.string() },
  handler: async (ctx, { identifier }) => {
    await enforceRateLimit(ctx, {
      identifier,
      windowMs: WINDOW_MS,
      max: MAX_PER_WINDOW,
      message: 'Terlalu banyak permintaan kode. Coba lagi nanti.',
    });
  },
});

/**
 * Nightly cleanup: every identifier (per email for OTP/reset, per cafe for AI)
 * leaves a permanent row, so prune rows whose window ended long ago. A day-old
 * cutoff is far beyond any limiter window, so live buckets are never deleted.
 */
export const pruneStale = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - 24 * 60 * 60_000;
    const stale = await ctx.db
      .query('otpRateLimit')
      .withIndex('by_window', (q) => q.lt('windowStart', cutoff))
      .take(2000);
    for (const row of stale) await ctx.db.delete(row._id);
    return null;
  },
});
