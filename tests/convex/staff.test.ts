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

describe('staff', () => {
  it('list returns the auto-inserted owner row after signup', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const list = await asOwner.query(api.staff.list, {});
    expect(list).toHaveLength(1);
    expect(list[0]?.role).toBe('owner');
  });

  it('create adds a cashier row with hashed PIN', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const id = await asOwner.mutation(api.staff.create, {
      name: 'Andi',
      pin: '4321',
    });
    expect(id).toBeTruthy();
    const list = await asOwner.query(api.staff.list, {});
    expect(list).toHaveLength(2);
    const andi = list.find((s) => s.name === 'Andi');
    expect(andi?.role).toBe('cashier');
    expect(andi?.pinHash).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
  });

  it('create rejects malformed PIN', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    await expect(asOwner.mutation(api.staff.create, { name: 'Andi', pin: '123' })).rejects.toThrow(
      /pin/i
    );
    await expect(
      asOwner.mutation(api.staff.create, { name: 'Andi', pin: '12345' })
    ).rejects.toThrow(/pin/i);
    await expect(asOwner.mutation(api.staff.create, { name: 'Andi', pin: '12a4' })).rejects.toThrow(
      /pin/i
    );
  });

  it('create rejects blank/long name', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    await expect(asOwner.mutation(api.staff.create, { name: '   ', pin: '1234' })).rejects.toThrow(
      /nama/i
    );
    await expect(
      asOwner.mutation(api.staff.create, { name: 'a'.repeat(61), pin: '1234' })
    ).rejects.toThrow(/nama/i);
  });

  it('updateName renames a row', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const id = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
    await asOwner.mutation(api.staff.updateName, { id, name: 'Andi B' });
    const list = await asOwner.query(api.staff.list, {});
    expect(list.find((s) => s.name === 'Andi B')).toBeDefined();
  });

  it('list sorts owners first, then cashiers by createdAt', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t, 'o@x.com', 'Pemilik');
    await asOwner.mutation(api.staff.create, { name: 'Cashier A', pin: '1111' });
    await asOwner.mutation(api.staff.create, { name: 'Cashier B', pin: '2222' });
    const list = await asOwner.query(api.staff.list, {});
    expect(list.map((s) => s.role)).toEqual(['owner', 'cashier', 'cashier']);
    expect(list[1]?.name).toBe('Cashier A');
    expect(list[2]?.name).toBe('Cashier B');
  });

  it('archive hides a cashier from the default list', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const id = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
    await asOwner.mutation(api.staff.archive, { id });
    expect(await asOwner.query(api.staff.list, {})).toHaveLength(1);
    expect(await asOwner.query(api.staff.list, { includeArchived: true })).toHaveLength(2);
  });

  it('archive refuses the last owner', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const ownerRow = (await asOwner.query(api.staff.list, {}))[0];
    await expect(asOwner.mutation(api.staff.archive, { id: ownerRow!._id })).rejects.toThrow(
      /pemilik/i
    );
  });

  it('tenant isolation: cafe B cannot touch cafe A staff', async () => {
    const t = convexTest(schema, modules);
    const ownerA = await setupOwner(t, 'a@x.com', 'A');
    const ownerB = await setupOwner(t, 'b@x.com', 'B');
    const aRow = (await ownerA.query(api.staff.list, {}))[0];
    await expect(
      ownerB.mutation(api.staff.updateName, { id: aRow!._id, name: 'pwn' })
    ).rejects.toThrow(/tidak ditemukan|akses/i);
  });

  it('verifyPin returns true on match, false on mismatch', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const id = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
    expect(await asOwner.query(api.staff.verifyPin, { id, pin: '1234' })).toBe(true);
    expect(await asOwner.query(api.staff.verifyPin, { id, pin: '0000' })).toBe(false);
  });

  it('verifyPin returns false on a row with no pinHash (owner before set)', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const owner = (await asOwner.query(api.staff.list, {}))[0];
    expect(await asOwner.query(api.staff.verifyPin, { id: owner!._id, pin: '0000' })).toBe(false);
  });

  it('resetPin changes the hash so old PIN no longer verifies', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const id = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
    await asOwner.mutation(api.staff.resetPin, { id, pin: '9999' });
    expect(await asOwner.query(api.staff.verifyPin, { id, pin: '1234' })).toBe(false);
    expect(await asOwner.query(api.staff.verifyPin, { id, pin: '9999' })).toBe(true);
  });

  it('resetPin rejects malformed PIN', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const id = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
    await expect(asOwner.mutation(api.staff.resetPin, { id, pin: 'abcd' })).rejects.toThrow(/pin/i);
  });
});
