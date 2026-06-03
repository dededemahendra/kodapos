import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setupOwner(t: ReturnType<typeof convexTest>, email = 'o@x.com') {
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email }));
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  return { asOwner };
}

describe('customers CRUD', () => {
  it('creates + lists (sorted, non-archived by default)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await asOwner.mutation(api.customers.create, { name: 'Budi', phone: '0812-1111-111' });
    await asOwner.mutation(api.customers.create, { name: 'Ani', phone: '0813-2222-222' });
    const list = await asOwner.query(api.customers.list, {});
    expect(list).toHaveLength(2);
    expect(list[0]?.name).toBe('Ani'); // id-ID sort
    expect(list[0]?.pointsBalance).toBe(0);
    expect(list[0]?.visitCount).toBe(0);
  });

  it('rejects a duplicate phone in the same cafe', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await asOwner.mutation(api.customers.create, { name: 'Budi', phone: '0812-1111-111' });
    await expect(
      asOwner.mutation(api.customers.create, { name: 'Other', phone: '0812 1111 111' })
    ).rejects.toThrow(/terdaftar/i);
  });

  it('findByPhone normalizes and ignores archived', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.customers.create, { name: 'Budi', phone: '08121111111' });
    const found = await asOwner.query(api.customers.findByPhone, { phone: '0812-1111-111' });
    expect(found?._id).toBe(id);
    await asOwner.mutation(api.customers.archive, { id });
    expect(await asOwner.query(api.customers.findByPhone, { phone: '08121111111' })).toBeNull();
  });

  it('adjustPoints writes a ledger row and updates balance; cannot go negative', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.customers.create, { name: 'Budi', phone: '08121111111' });
    await asOwner.mutation(api.customers.adjustPoints, { id, points: 50, note: 'bonus' });
    const detail = await asOwner.query(api.customers.getDetail, { id });
    expect(detail?.pointsBalance).toBe(50);
    expect(detail?.transactions).toHaveLength(1);
    expect(detail?.transactions[0]?.type).toBe('adjust');
    await expect(
      asOwner.mutation(api.customers.adjustPoints, { id, points: -100 })
    ).rejects.toThrow(/poin/i);
  });

  it('validates name + phone', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await expect(asOwner.mutation(api.customers.create, { name: '  ', phone: '08121111111' })).rejects.toThrow(/nama/i);
    await expect(asOwner.mutation(api.customers.create, { name: 'OK', phone: '12' })).rejects.toThrow(/telepon/i);
  });

  it('tenant isolation: cafe B cannot read or archive cafe A customer', async () => {
    const t = convexTest(schema, modules);
    const a = await setupOwner(t, 'a@x.com');
    const aId = await a.asOwner.mutation(api.customers.create, { name: 'A', phone: '08120000000' });
    const b = await setupOwner(t, 'b@x.com');
    expect(await b.asOwner.query(api.customers.list, {})).toHaveLength(0);
    await expect(b.asOwner.mutation(api.customers.archive, { id: aId })).rejects.toThrow();
  });
});
