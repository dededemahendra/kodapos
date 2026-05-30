import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setupOwner(
  t: ReturnType<typeof convexTest>,
  email = 'o@x.com',
  ownerName = 'Pemilik'
) {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: ownerName, email });
  });
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  return asOwner;
}

describe('staff.updateDetails', () => {
  it('sets name, phone, and email; list returns updated values', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const id = await asOwner.mutation(api.staff.create, { name: 'Budi', pin: '1234' });

    await asOwner.mutation(api.staff.updateDetails, {
      id,
      name: 'Budi Santoso',
      phone: '08123456789',
      email: 'budi@example.com',
    });

    const list = await asOwner.query(api.staff.list, {});
    const row = list.find((s) => s._id === id);
    expect(row?.name).toBe('Budi Santoso');
    expect(row?.phone).toBe('08123456789');
    expect(row?.email).toBe('budi@example.com');
  });

  it('passing empty string for phone/email clears them (returns undefined)', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const id = await asOwner.mutation(api.staff.create, { name: 'Ani', pin: '4321' });

    // First set them
    await asOwner.mutation(api.staff.updateDetails, {
      id,
      name: 'Ani',
      phone: '08111111111',
      email: 'ani@example.com',
    });

    // Now clear them with empty strings
    await asOwner.mutation(api.staff.updateDetails, {
      id,
      name: 'Ani',
      phone: '   ',
      email: '',
    });

    const list = await asOwner.query(api.staff.list, {});
    const row = list.find((s) => s._id === id);
    expect(row?.phone).toBeUndefined();
    expect(row?.email).toBeUndefined();
  });

  it('rejects empty name with /nama/i error', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const id = await asOwner.mutation(api.staff.create, { name: 'Citra', pin: '5678' });

    await expect(
      asOwner.mutation(api.staff.updateDetails, { id, name: '   ' })
    ).rejects.toThrow(/nama/i);

    await expect(
      asOwner.mutation(api.staff.updateDetails, { id, name: '' })
    ).rejects.toThrow(/nama/i);
  });
});

describe('staff.setPermissions', () => {
  it('stores permissions object; list returns it', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const id = await asOwner.mutation(api.staff.create, { name: 'Dodi', pin: '9999' });

    const perms = {
      canVoid: true,
      canDiscount: false,
      canManageShift: true,
      canViewReports: false,
      canEditMenu: true,
    };

    await asOwner.mutation(api.staff.setPermissions, { id, permissions: perms });

    const list = await asOwner.query(api.staff.list, {});
    const row = list.find((s) => s._id === id);
    expect(row?.permissions).toEqual(perms);
  });

  it('can update permissions to a different set of values', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const id = await asOwner.mutation(api.staff.create, { name: 'Eka', pin: '1111' });

    await asOwner.mutation(api.staff.setPermissions, {
      id,
      permissions: {
        canVoid: true,
        canDiscount: true,
        canManageShift: true,
        canViewReports: true,
        canEditMenu: true,
      },
    });

    await asOwner.mutation(api.staff.setPermissions, {
      id,
      permissions: {
        canVoid: false,
        canDiscount: false,
        canManageShift: false,
        canViewReports: false,
        canEditMenu: false,
      },
    });

    const list = await asOwner.query(api.staff.list, {});
    const row = list.find((s) => s._id === id);
    expect(row?.permissions?.canVoid).toBe(false);
    expect(row?.permissions?.canEditMenu).toBe(false);
  });
});

describe('staff cross-tenant guard', () => {
  it('setPermissions on another cafe staff rejects with /tidak ditemukan/i', async () => {
    const t = convexTest(schema, modules);
    const ownerA = await setupOwner(t, 'a@x.com', 'Owner A');
    const ownerB = await setupOwner(t, 'b@x.com', 'Owner B');

    // Create a staff in cafe A
    const staffAId = await ownerA.mutation(api.staff.create, { name: 'Staf A', pin: '1234' });

    // Owner B tries to set permissions on cafe A's staff
    await expect(
      ownerB.mutation(api.staff.setPermissions, {
        id: staffAId,
        permissions: {
          canVoid: true,
          canDiscount: true,
          canManageShift: true,
          canViewReports: true,
          canEditMenu: true,
        },
      })
    ).rejects.toThrow(/tidak ditemukan/i);
  });

  it('updateDetails on another cafe staff rejects with /tidak ditemukan/i', async () => {
    const t = convexTest(schema, modules);
    const ownerA = await setupOwner(t, 'aa@x.com', 'Owner AA');
    const ownerB = await setupOwner(t, 'bb@x.com', 'Owner BB');

    const staffAId = await ownerA.mutation(api.staff.create, { name: 'Staf AA', pin: '5678' });

    await expect(
      ownerB.mutation(api.staff.updateDetails, {
        id: staffAId,
        name: 'Hacked',
        phone: '000',
      })
    ).rejects.toThrow(/tidak ditemukan/i);
  });
});
