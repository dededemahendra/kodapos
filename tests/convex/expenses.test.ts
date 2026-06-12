import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setupOwner(t: ReturnType<typeof convexTest>, email = 'o@x.com') {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email });
  });
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  return { asOwner };
}

describe('expenses', () => {
  it('records and lists expenses in range with totals', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await asOwner.mutation(api.expenses.record, { category: 'rent', amountIDR: 1000000 });
    await asOwner.mutation(api.expenses.record, {
      category: 'utilities',
      amountIDR: 250000,
      note: 'PLN',
    });
    const data = await asOwner.query(api.expenses.list, { range: { preset: 'today' } });
    expect(data.totalIDR).toBe(1250000);
    expect(data.rows).toHaveLength(2);
    const rent = data.byCategory.find((c) => c.category === 'rent');
    expect(rent?.amountIDR).toBe(1000000);
  });

  it('rejects a non-positive amount', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await expect(
      asOwner.mutation(api.expenses.record, { category: 'other', amountIDR: 0 })
    ).rejects.toThrow();
  });

  it('removes an expense (owner-scoped)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.expenses.record, { category: 'other', amountIDR: 5000 });
    await asOwner.mutation(api.expenses.remove, { id });
    const data = await asOwner.query(api.expenses.list, { range: { preset: 'today' } });
    expect(data.rows).toHaveLength(0);

    const { asOwner: asOther } = await setupOwner(t, 'other@x.com');
    const id2 = await asOwner.mutation(api.expenses.record, { category: 'rent', amountIDR: 9000 });
    await expect(asOther.mutation(api.expenses.remove, { id: id2 })).rejects.toThrow();
  });
});
