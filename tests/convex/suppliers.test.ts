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

describe('suppliers CRUD', () => {
  it('creates + lists (sorted, non-archived by default)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await asOwner.mutation(api.suppliers.create, { name: 'Sumber Susu', phone: '0812-1111-111' });
    await asOwner.mutation(api.suppliers.create, { name: 'Aneka Kopi', phone: '0813-2222-222' });
    const list = await asOwner.query(api.suppliers.list, {});
    expect(list).toHaveLength(2);
    expect(list[0]?.name).toBe('Aneka Kopi'); // id-ID sort
  });

  it('update + archive hides from default list', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.suppliers.create, { name: 'X', phone: '0812000000' });
    await asOwner.mutation(api.suppliers.update, { id, name: 'X2', phone: '0813000000' });
    expect((await asOwner.query(api.suppliers.list, {}))[0]?.name).toBe('X2');
    await asOwner.mutation(api.suppliers.archive, { id });
    expect(await asOwner.query(api.suppliers.list, {})).toHaveLength(0);
    expect(await asOwner.query(api.suppliers.list, { includeArchived: true })).toHaveLength(1);
  });

  it('validates name + phone', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await expect(asOwner.mutation(api.suppliers.create, { name: '  ', phone: '0812000000' })).rejects.toThrow(/nama/i);
    await expect(asOwner.mutation(api.suppliers.create, { name: 'OK', phone: '12' })).rejects.toThrow(/telepon/i);
  });

  it('tenant isolation: cafe B cannot archive cafe A supplier', async () => {
    const t = convexTest(schema, modules);
    const a = await setupOwner(t, 'a@x.com');
    const aId = await a.asOwner.mutation(api.suppliers.create, { name: 'A', phone: '0812000000' });
    const b = await setupOwner(t, 'b@x.com');
    expect(await b.asOwner.query(api.suppliers.list, { includeArchived: true })).toHaveLength(0);
    await expect(b.asOwner.mutation(api.suppliers.archive, { id: aId })).rejects.toThrow();
  });
});
