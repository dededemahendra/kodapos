import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api, internal } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';
import {
  buildLowStockHtml,
  buildLowStockText,
} from '../../convex/lib/lowStockEmail';

const modules = import.meta.glob('../../convex/**/*.*s');

const NO_EM_DASH = /[—]|--/;

async function seedOwner(t: ReturnType<typeof convexTest>) {
  const userId = await t.run((ctx) =>
    ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' })
  );
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Kita' });
  const cafe = await asOwner.query(api.cafes.myCafe, {});
  return { asOwner, cafeId: cafe!._id as Id<'cafes'> };
}

describe('lowStockEmail builder', () => {
  const items = [
    { name: 'Susu', currentStockQty: 200, reorderThreshold: 1000, unit: 'ml' as const },
  ];

  it('text body contains the name, quantities, unit and heading; no em-dash', () => {
    const text = buildLowStockText('Kopi Kita', items);
    expect(text).toContain('Low stock');
    expect(text).toContain('Kopi Kita');
    expect(text).toContain('Susu');
    expect(text).toContain('200');
    expect(text).toContain('1000');
    expect(text).toContain('ml');
    expect(text).not.toMatch(NO_EM_DASH);
  });

  it('html body renders a table; no em-dash', () => {
    const html = buildLowStockHtml('Kopi Kita', items);
    expect(html).toContain('<table');
    expect(html).toContain('Susu');
    expect(html).not.toMatch(NO_EM_DASH);
  });
});

describe('alerts.lowStockForCafe', () => {
  it('returns ingredients below their reorder threshold, excludes those above', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId } = await seedOwner(t);

    // Below threshold: stocked at 200, reorder at 1000.
    const susu = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 1000,
      lastCostPerUnitIDR: 100,
    });
    await asOwner.mutation(api.ingredients.adjustStock, {
      ingredientId: susu,
      newQty: 200,
      reasonLabel: 'Seed',
    });

    // Above threshold: stocked at 5000, reorder at 1000 → excluded.
    const gula = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Gula',
      canonicalUnit: 'g',
      reorderThreshold: 1000,
      lastCostPerUnitIDR: 50,
    });
    await asOwner.mutation(api.ingredients.adjustStock, {
      ingredientId: gula,
      newQty: 5000,
      reasonLabel: 'Seed',
    });

    const result = await t.query(internal.alerts.lowStockForCafe, { cafeId });
    expect(result.cafeName).toBe('Kopi Kita');
    expect(result.items.map((i) => i.name)).toEqual(['Susu']);
    const susuItem = result.items.find((i) => i.name === 'Susu');
    expect(susuItem).toMatchObject({
      currentStockQty: 200,
      reorderThreshold: 1000,
      unit: 'ml',
    });
  });
});

describe('settings.updateNotifications emailLowStockDaily', () => {
  it('persists the flag and settings.get returns it', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await seedOwner(t);

    await asOwner.mutation(api.settings.updateNotifications, {
      notifications: { emailSummaryOnClose: false, emailLowStockDaily: true },
    });

    const s = await asOwner.query(api.settings.get);
    expect(s.notifications.emailLowStockDaily).toBe(true);
  });
});
