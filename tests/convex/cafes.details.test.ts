import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function seedOwner(t: ReturnType<typeof convexTest>) {
  const userId = await t.run(async (ctx) =>
    ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' })
  );
  await t
    .withIdentity({ subject: `${userId}|test_session` })
    .mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  return userId;
}

describe('cafes.updateProfileDetails', () => {
  it('writes the extended profile fields without touching tax', async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });

    await asOwner.mutation(api.cafes.updateProfileDetails, {
      name: 'Kopi Senja',
      businessType: 'cafe',
      phone: '0812',
      whatsapp: '0813',
      email: 'a@b.com',
      instagram: 'kopisenja',
      addressLine: 'Jl. Sudirman 1',
      city: 'Jakarta',
      postalCode: '12345',
      timezone: 'Asia/Jakarta',
      operatingHours: [
        { day: 0, open: true, openTime: '08:00', closeTime: '22:00' },
      ],
    });

    const cafe = await asOwner.query(api.cafes.myCafe);
    expect(cafe?.businessType).toBe('cafe');
    expect(cafe?.whatsapp).toBe('0813');
    expect(cafe?.city).toBe('Jakarta');
    expect(cafe?.operatingHours?.[0]?.openTime).toBe('08:00');
    // tax defaults from createForOwner remain untouched
    expect(cafe?.taxRatePct).toBe(11);
    expect(cafe?.taxEnabled).toBe(true);
  });

  it('rejects empty name', async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
    await expect(
      asOwner.mutation(api.cafes.updateProfileDetails, {
        name: '   ',
        timezone: 'Asia/Jakarta',
      })
    ).rejects.toThrow(/nama/i);
  });

  it('clears optional fields when given empty strings', async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
    await asOwner.mutation(api.cafes.updateProfileDetails, {
      name: 'Kopi Senja',
      city: 'Jakarta',
      timezone: 'Asia/Jakarta',
    });
    await asOwner.mutation(api.cafes.updateProfileDetails, {
      name: 'Kopi Senja',
      city: '',
      timezone: 'Asia/Jakarta',
    });
    const cafe = await asOwner.query(api.cafes.myCafe);
    expect(cafe?.city).toBeUndefined();
  });
});

it('updateProfile records ownerTermsAcceptedAt when provided', async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email: 'terms@x.com' }));
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  const cafeId = await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Terms' });

  await asOwner.mutation(api.cafes.updateProfile, {
    name: 'Kopi Terms',
    timezone: 'Asia/Jakarta',
    taxRatePct: 11,
    taxEnabled: true,
    ownerTermsAcceptedAt: 1_700_000_000_000,
  });

  const cafe = await t.run((ctx) => ctx.db.get(cafeId as Id<'cafes'>));
  expect(cafe!.ownerTermsAcceptedAt).toBe(1_700_000_000_000);
});

it('myCafe returns ownerTermsAcceptedAt without a validator error', async () => {
  // Guards the returns validator: once a cafe has ownerTermsAcceptedAt set,
  // myCafe must include it or convex rejects the return (ReturnsValidationError).
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email: 'mycafe@x.com' }));
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi MC' });
  await asOwner.mutation(api.cafes.updateProfile, {
    name: 'Kopi MC',
    timezone: 'Asia/Jakarta',
    taxRatePct: 11,
    taxEnabled: true,
    ownerTermsAcceptedAt: 1_700_000_000_000,
  });

  const cafe = await asOwner.query(api.cafes.myCafe, {});
  expect(cafe).not.toBeNull();
  expect(cafe!.ownerTermsAcceptedAt).toBe(1_700_000_000_000);
});

it('acceptOwnerTerms sets ownerTermsAcceptedAt once (idempotent)', async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email: 'aot@x.com' }));
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  const cafeId = await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi AOT' });

  await asOwner.mutation(api.cafes.acceptOwnerTerms, {});
  const first = await t.run((ctx) => ctx.db.get(cafeId as Id<'cafes'>));
  expect(typeof first!.ownerTermsAcceptedAt).toBe('number');

  // A second call keeps the original timestamp (idempotent).
  await asOwner.mutation(api.cafes.acceptOwnerTerms, {});
  const second = await t.run((ctx) => ctx.db.get(cafeId as Id<'cafes'>));
  expect(second!.ownerTermsAcceptedAt).toBe(first!.ownerTermsAcceptedAt);
});
