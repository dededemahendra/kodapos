import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function seedOwner(t: ReturnType<typeof convexTest>) {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' });
  });
  await t
    .withIdentity({ subject: `${userId}|test_session` })
    .mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  return userId;
}

describe('cafes profile', () => {
  it('myCafe returns the owner cafe with new fields defaulted', async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
    const cafe = await asOwner.query(api.cafes.myCafe);
    expect(cafe).not.toBeNull();
    expect(cafe?.name).toBe('Kopi Senja');
    expect(cafe?.setupCompletedAt).toBeUndefined();
  });

  it('myCafe returns null when not authenticated', async () => {
    const t = convexTest(schema, modules);
    const cafe = await t.query(api.cafes.myCafe);
    expect(cafe).toBeNull();
  });

  it('updateProfile writes all profile fields', async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });

    await asOwner.mutation(api.cafes.updateProfile, {
      name: 'Kopi Senja Baru',
      phone: '08123456789',
      addressLine: 'Jl. Sudirman 1',
      timezone: 'Asia/Jakarta',
      taxRatePct: 11,
      taxEnabled: true,
    });

    const cafe = await asOwner.query(api.cafes.myCafe);
    expect(cafe?.name).toBe('Kopi Senja Baru');
    expect(cafe?.phone).toBe('08123456789');
    expect(cafe?.taxRatePct).toBe(11);
    expect(cafe?.taxEnabled).toBe(true);
  });

  it('updateProfile rejects empty name', async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
    await expect(
      asOwner.mutation(api.cafes.updateProfile, {
        name: '   ',
        timezone: 'Asia/Jakarta',
        taxRatePct: 11,
        taxEnabled: true,
      })
    ).rejects.toThrow(/nama/i);
  });

  it('updateProfile rejects negative tax rate', async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
    await expect(
      asOwner.mutation(api.cafes.updateProfile, {
        name: 'Kopi',
        timezone: 'Asia/Jakarta',
        taxRatePct: -1,
        taxEnabled: true,
      })
    ).rejects.toThrow(/pajak/i);
  });

  it('markSetupComplete sets setupCompletedAt once', async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });

    await asOwner.mutation(api.cafes.markSetupComplete);
    const cafe1 = await asOwner.query(api.cafes.myCafe);
    expect(cafe1?.setupCompletedAt).toEqual(expect.any(Number));

    const firstTime = cafe1?.setupCompletedAt;
    await asOwner.mutation(api.cafes.markSetupComplete);
    const cafe2 = await asOwner.query(api.cafes.myCafe);
    expect(cafe2?.setupCompletedAt).toBe(firstTime);
  });

  it('createForOwner auto-inserts an owner cafeStaff row', async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Pak Budi', email: 'b@x.com' });
    });
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
    await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });

    const staff = await t.run(async (ctx) => await ctx.db.query('cafeStaff').collect());
    expect(staff).toHaveLength(1);
    expect(staff[0]?.role).toBe('owner');
    expect(staff[0]?.name).toBe('Pak Budi');
    expect(staff[0]?.archived).toBe(false);
    expect(staff[0]?.pinHash).toBeUndefined();
  });
});
