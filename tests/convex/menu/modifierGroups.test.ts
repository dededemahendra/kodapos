import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../../convex/_generated/api';
import schema from '../../../convex/schema';

const modules = import.meta.glob('../../../convex/**/*.*s');

async function setupOwner(t: ReturnType<typeof convexTest>, email = 'o@x.com') {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email });
  });
  await t
    .withIdentity({ subject: `${userId}|test_session` })
    .mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  return t.withIdentity({ subject: `${userId}|test_session` });
}

describe('menu.modifierGroups', () => {
  it('upsert creates a group with options in one call', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const groupId = await asOwner.mutation(api.menu.modifierGroups.upsert, {
      name: 'Ukuran',
      required: true,
      minSelect: 1,
      maxSelect: 1,
      options: [
        { name: 'Reguler', priceAdjustmentIDR: 0, position: 100 },
        { name: 'Large', priceAdjustmentIDR: 5000, position: 200 },
      ],
    });
    const group = await asOwner.query(api.menu.modifierGroups.getById, { id: groupId });
    expect(group?.name).toBe('Ukuran');
    expect(group?.options).toHaveLength(2);
    expect(group?.options[0]?.name).toBe('Reguler');
    expect(group?.options[1]?.priceAdjustmentIDR).toBe(5000);
  });

  it('upsert updates existing group, adds new option, archives removed option', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const groupId = await asOwner.mutation(api.menu.modifierGroups.upsert, {
      name: 'Susu',
      required: false,
      minSelect: 0,
      maxSelect: 1,
      options: [
        { name: 'Sapi', priceAdjustmentIDR: 0, position: 100 },
        { name: 'Oat', priceAdjustmentIDR: 5000, position: 200 },
      ],
    });
    const created = await asOwner.query(api.menu.modifierGroups.getById, { id: groupId });
    const sapiId = created!.options[0]!._id;

    // Now update: rename group, drop "Oat", add "Almond", keep "Sapi".
    await asOwner.mutation(api.menu.modifierGroups.upsert, {
      id: groupId,
      name: 'Susu (revised)',
      required: false,
      minSelect: 0,
      maxSelect: 1,
      options: [
        { id: sapiId, name: 'Sapi', priceAdjustmentIDR: 0, position: 100 },
        { name: 'Almond', priceAdjustmentIDR: 5000, position: 200 },
      ],
    });
    const after = await asOwner.query(api.menu.modifierGroups.getById, { id: groupId });
    expect(after?.name).toBe('Susu (revised)');
    expect(after?.options.map((o) => o.name).sort()).toEqual(['Almond', 'Sapi']);
  });

  it('upsert rejects minSelect > maxSelect', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    await expect(
      asOwner.mutation(api.menu.modifierGroups.upsert, {
        name: 'Bad',
        required: true,
        minSelect: 2,
        maxSelect: 1,
        options: [{ name: 'Only', priceAdjustmentIDR: 0, position: 100 }],
      })
    ).rejects.toThrow(/minimal/i);
  });

  it('upsert rejects required with empty options', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    await expect(
      asOwner.mutation(api.menu.modifierGroups.upsert, {
        name: 'Empty',
        required: true,
        minSelect: 1,
        maxSelect: 1,
        options: [],
      })
    ).rejects.toThrow(/opsi/i);
  });

  it('upsert rejects negative price adjustment', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    await expect(
      asOwner.mutation(api.menu.modifierGroups.upsert, {
        name: 'Bad',
        required: false,
        minSelect: 0,
        maxSelect: 1,
        options: [{ name: 'X', priceAdjustmentIDR: -100, position: 100 }],
      })
    ).rejects.toThrow(/harga|negatif/i);
  });

  it('archive hides group from default list', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const id = await asOwner.mutation(api.menu.modifierGroups.upsert, {
      name: 'Tmp',
      required: false,
      minSelect: 0,
      maxSelect: 1,
      options: [{ name: 'X', priceAdjustmentIDR: 0, position: 100 }],
    });
    await asOwner.mutation(api.menu.modifierGroups.archive, { id });
    expect(await asOwner.query(api.menu.modifierGroups.list, {})).toHaveLength(0);
    expect(
      await asOwner.query(api.menu.modifierGroups.list, { includeArchived: true })
    ).toHaveLength(1);
  });

  it('tenant isolation: cafe B cannot read cafe A groups', async () => {
    const t = convexTest(schema, modules);
    const ownerA = await setupOwner(t, 'a@x.com');
    const ownerB = await setupOwner(t, 'b@x.com');
    await ownerA.mutation(api.menu.modifierGroups.upsert, {
      name: 'A-only',
      required: false,
      minSelect: 0,
      maxSelect: 1,
      options: [{ name: 'X', priceAdjustmentIDR: 0, position: 100 }],
    });
    expect(await ownerB.query(api.menu.modifierGroups.list, {})).toHaveLength(0);
  });
});
