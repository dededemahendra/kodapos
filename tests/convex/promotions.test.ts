import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setupOwner(t: ReturnType<typeof convexTest>, email = 'o@x.com') {
  const userId = await t.run(async (ctx) =>
    ctx.db.insert('users', { name: 'Owner', email })
  );
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  return { asOwner };
}

describe('promotions CRUD', () => {
  it('creates + lists (non-archived by default)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await asOwner.mutation(api.promotions.create, { name: 'Diskon Kopi', type: 'percent', value: 20 });
    await asOwner.mutation(api.promotions.create, { name: 'Promo Lebaran', type: 'fixed', value: 10000 });
    const list = await asOwner.query(api.promotions.list, {});
    expect(list).toHaveLength(2);
    // Sorted by name (id-ID): "Diskon Kopi" before "Promo Lebaran".
    expect(list[0]?.name).toBe('Diskon Kopi');
    expect(list[0]?.type).toBe('percent');
    expect(list[0]?.value).toBe(20);
    expect(list[1]?.type).toBe('fixed');
    expect(list[1]?.value).toBe(10000);
  });

  it('update changes fields; archive hides from default list', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.promotions.create, { name: 'X', type: 'percent', value: 10 });
    await asOwner.mutation(api.promotions.update, { id, name: 'X2', type: 'fixed', value: 5000 });
    let list = await asOwner.query(api.promotions.list, {});
    expect(list[0]?.name).toBe('X2');
    expect(list[0]?.type).toBe('fixed');
    expect(list[0]?.value).toBe(5000);
    await asOwner.mutation(api.promotions.archive, { id });
    expect(await asOwner.query(api.promotions.list, {})).toHaveLength(0);
    expect(await asOwner.query(api.promotions.list, { includeArchived: true })).toHaveLength(1);
  });

  it('validates name + value', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await expect(
      asOwner.mutation(api.promotions.create, { name: '  ', type: 'percent', value: 10 })
    ).rejects.toThrow(/nama/i);
    await expect(
      asOwner.mutation(api.promotions.create, { name: 'P', type: 'percent', value: 0 })
    ).rejects.toThrow(/1.*100|persentase/i);
    await expect(
      asOwner.mutation(api.promotions.create, { name: 'P', type: 'percent', value: 150 })
    ).rejects.toThrow(/1.*100|persentase/i);
    await expect(
      asOwner.mutation(api.promotions.create, { name: 'P', type: 'fixed', value: 0 })
    ).rejects.toThrow(/nominal|≥ 1/i);
    await expect(
      asOwner.mutation(api.promotions.create, { name: 'P', type: 'percent', value: 10.5 })
    ).rejects.toThrow(/1.*100|persentase/i);
    await expect(
      asOwner.mutation(api.promotions.create, { name: 'P', type: 'fixed', value: 1.5 })
    ).rejects.toThrow(/nominal|≥ 1/i);
  });

  it('tenant isolation: cafe B cannot list or archive cafe A promos', async () => {
    const t = convexTest(schema, modules);
    const { asOwner: ownerA } = await setupOwner(t, 'a@x.com');
    const aId = await ownerA.mutation(api.promotions.create, { name: 'A', type: 'percent', value: 10 });
    const { asOwner: ownerB } = await setupOwner(t, 'b@x.com');
    expect(await ownerB.query(api.promotions.list, { includeArchived: true })).toHaveLength(0);
    await expect(ownerB.mutation(api.promotions.archive, { id: aId })).rejects.toThrow();
  });
});
