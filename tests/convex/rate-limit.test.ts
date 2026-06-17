import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

// Guards the shared fixed-window limiter (enforceRateLimit) via the OTP issuance
// entry point, plus the prune job. The AI actions reuse the same helper.
describe('rate limit (enforceRateLimit)', () => {
  it('allows up to the max per window, then throws', async () => {
    const t = convexTest(schema, modules);
    const id = 'otp:user@example.com';
    for (let i = 0; i < 5; i++) {
      await t.mutation(internal.auth_rate.checkAndBump, { identifier: id });
    }
    await expect(
      t.mutation(internal.auth_rate.checkAndBump, { identifier: id })
    ).rejects.toThrow(/Terlalu banyak/);
  });

  it('keeps separate identifiers in independent buckets', async () => {
    const t = convexTest(schema, modules);
    for (let i = 0; i < 5; i++) {
      await t.mutation(internal.auth_rate.checkAndBump, { identifier: 'a' });
    }
    // A different identifier is unaffected by 'a' being maxed out.
    await t.mutation(internal.auth_rate.checkAndBump, { identifier: 'b' });
  });

  it('pruneStale deletes rows whose window ended long ago, keeps fresh ones', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('otpRateLimit', { identifier: 'old', windowStart: 1, count: 1 });
      await ctx.db.insert('otpRateLimit', {
        identifier: 'fresh',
        windowStart: Date.now(),
        count: 1,
      });
    });
    await t.mutation(internal.auth_rate.pruneStale, {});
    const ids = await t.run(async (ctx) =>
      (await ctx.db.query('otpRateLimit').collect()).map((r) => r.identifier)
    );
    expect(ids).toEqual(['fresh']);
  });
});
