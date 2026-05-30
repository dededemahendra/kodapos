import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
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
