import { convexTest } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';
import { dayKeyFn } from '../../convex/lib/time';

const modules = import.meta.glob('../../convex/**/*.*s');
const TZ = 'Asia/Jakarta';
const DAY = 86_400_000;

type Refs = {
  asOwner: ReturnType<ReturnType<typeof convexTest>['withIdentity']>;
  cafeId: Id<'cafes'>;
  cashierId: Id<'cafeStaff'>;
  shiftId: Id<'shifts'>;
  itemKopi: Id<'menuItems'>;
  ingSusu: Id<'ingredients'>;
};

async function setup(t: ReturnType<typeof convexTest>, email = 'o@x.com'): Promise<Refs> {
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email }));
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  await asOwner.mutation(api.cafes.updateProfile, { name: 'Kopi Senja', timezone: TZ, taxRatePct: 0, taxEnabled: false });
  const cafe = await asOwner.query(api.cafes.myCafe, {});
  const cafeId = cafe!._id as Id<'cafes'>;
  const cashierId = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
  const shiftId = await asOwner.mutation(api.shifts.open, { cashierId, openingFloatIDR: 100000 });
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Minuman' });
  const itemKopi = await asOwner.mutation(api.menu.items.create, { categoryId, name: 'Kopi', priceIDR: 15000 });
  const ingSusu = await asOwner.mutation(api.ingredients.upsert, { name: 'Susu', canonicalUnit: 'ml', reorderThreshold: 0, lastCostPerUnitIDR: 100 });
  await asOwner.mutation(api.recipes.upsert, { menuItemId: itemKopi, lines: [{ ingredientId: ingSusu, qty: 50, wastageFactor: 1 }] });
  return { asOwner, cafeId, cashierId, shiftId, itemKopi, ingSusu };
}

async function seedSales(t: ReturnType<typeof convexTest>, refs: Refs, days: number, nowMs: number) {
  for (let d = 1; d <= days; d++) {
    const at = nowMs - d * DAY;
    await t.run((ctx) =>
      ctx.db.insert('orders', {
        cafeId: refs.cafeId, shiftId: refs.shiftId, cashierId: refs.cashierId,
        clientId: `c-${d}`,
        lines: [{ menuItemId: refs.itemKopi, nameSnapshot: 'Kopi', qty: 10, unitPriceIDR: 15000, modifiersSnapshot: [], lineTotalIDR: 150000 }],
        subtotalIDR: 150000, taxRatePct: 0, taxIDR: 0, discountIDR: 0, totalIDR: 150000,
        paymentMethod: 'cash', paymentStatus: 'paid', createdAtClient: at, syncedAt: at,
      })
    );
  }
}

describe('generateNightly', () => {
  it('persists a ready forecast + a draft restock for a cafe with data', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await seedSales(t, refs, 20, Date.now());
    await t.action(internal.forecast.generateNightly, {});
    const forecasts = await t.run((ctx) => ctx.db.query('forecasts').collect());
    const restocks = await t.run((ctx) => ctx.db.query('restockSuggestions').collect());
    expect(forecasts).toHaveLength(1);
    expect(forecasts[0]?.status).toBe('ready');
    expect((forecasts[0]?.lines ?? []).some((l) => l.name === 'Kopi')).toBe(true);
    expect(restocks).toHaveLength(1);
    expect(restocks[0]?.status).toBe('draft');
    expect(restocks[0]?.forecastId).toBe(forecasts[0]?._id);
    expect(restocks[0]?.lines.some((l) => l.name === 'Susu')).toBe(true);
  });

  it('cold-start cafe → learning forecast, no restock row', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await seedSales(t, refs, 5, Date.now());
    await t.action(internal.forecast.generateNightly, {});
    const forecasts = await t.run((ctx) => ctx.db.query('forecasts').collect());
    const restocks = await t.run((ctx) => ctx.db.query('restockSuggestions').collect());
    expect(forecasts[0]?.status).toBe('learning');
    expect(restocks).toHaveLength(0);
  });

  it('each cafe gets its own snapshot', async () => {
    const t = convexTest(schema, modules);
    const a = await setup(t, 'a@x.com');
    await seedSales(t, a, 20, Date.now());
    const b = await setup(t, 'b@x.com');
    await t.action(internal.forecast.generateNightly, {});
    const forecasts = await t.run((ctx) => ctx.db.query('forecasts').collect());
    expect(forecasts).toHaveLength(2);
    expect(forecasts.map((f) => f.cafeId).sort()).toEqual([a.cafeId, b.cafeId].sort());
  });
});

function stubForecastFetch(days: number) {
  const time: string[] = [];
  const temperature_2m_max: number[] = [];
  const precipitation_sum: number[] = [];
  for (let i = 0; i < days; i++) {
    time.push(`2026-06-${String(3 + i).padStart(2, '0')}`);
    temperature_2m_max.push(33); // hot
    precipitation_sum.push(0);
  }
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ daily: { time, temperature_2m_max, precipitation_sum } }) })
  );
}

describe('generateNightly weather (C2a)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores a weatherSignal when the cafe has coordinates', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await seedSales(t, refs, 20, Date.now());
    await t.run((ctx) => ctx.db.patch(refs.cafeId, { latitude: -6.2, longitude: 106.8 }));
    stubForecastFetch(7);
    await t.action(internal.forecast.generateNightly, {});
    const forecasts = await t.run((ctx) => ctx.db.query('forecasts').collect());
    const signal = forecasts[0]?.weatherSignal;
    expect(signal).toHaveLength(7);
    expect(signal?.[0]).toMatchObject({ condition: 'hot', tempMaxC: 33, precipMm: 0 });
    expect(typeof signal?.[0]?.dateKey).toBe('string');
  });

  it('no coordinates → forecast persisted, weatherSignal undefined (no fetch)', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await seedSales(t, refs, 20, Date.now());
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await t.action(internal.forecast.generateNightly, {});
    const forecasts = await t.run((ctx) => ctx.db.query('forecasts').collect());
    expect(forecasts[0]?.status).toBe('ready');
    expect(forecasts[0]?.weatherSignal).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetch failure → degrades to a forecast with no weatherSignal', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await seedSales(t, refs, 20, Date.now());
    await t.run((ctx) => ctx.db.patch(refs.cafeId, { latitude: -6.2, longitude: 106.8 }));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await t.action(internal.forecast.generateNightly, {});
    const forecasts = await t.run((ctx) => ctx.db.query('forecasts').collect());
    expect(forecasts).toHaveLength(1);
    expect(forecasts[0]?.status).toBe('ready');
    expect(forecasts[0]?.weatherSignal).toBeUndefined();
  });

  it('fetch failure on one cafe does not prevent the other from persisting', async () => {
    const t = convexTest(schema, modules);
    const a = await setup(t, 'a@x.com');
    const b = await setup(t, 'b@x.com');
    await seedSales(t, a, 20, Date.now());
    await seedSales(t, b, 20, Date.now());
    // Only cafe a has coords, so fetch is attempted (and made to fail) only for a.
    await t.run((ctx) => ctx.db.patch(a.cafeId, { latitude: -6.2, longitude: 106.8 }));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await t.action(internal.forecast.generateNightly, {});
    const forecasts = await t.run((ctx) => ctx.db.query('forecasts').collect());
    expect(forecasts).toHaveLength(2);
    const aForecast = forecasts.find((f) => f.cafeId === a.cafeId);
    const bForecast = forecasts.find((f) => f.cafeId === b.cafeId);
    expect(aForecast?.weatherSignal).toBeUndefined(); // degraded
    expect(bForecast?.status).toBe('ready'); // unaffected
  });

  it('requests tomorrow..today+7 in the cafe timezone (not today, no forecast_days)', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t); // tz Asia/Jakarta
    await seedSales(t, refs, 20, Date.now());
    await t.run((ctx) => ctx.db.patch(refs.cafeId, { latitude: -6.2, longitude: 106.8 }));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ daily: { time: [], temperature_2m_max: [], precipitation_sum: [] } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await t.action(internal.forecast.generateNightly, {});
    const url = fetchMock.mock.calls[0]?.[0] as string;
    const keyOf = dayKeyFn(TZ);
    const now = Date.now();
    // The demand model forecasts tomorrow..today+7; the weather window must match.
    expect(url).toContain(`start_date=${keyOf(now + DAY)}`);
    expect(url).toContain(`end_date=${keyOf(now + 7 * DAY)}`);
    expect(url).not.toContain(`start_date=${keyOf(now)}`); // never today (off-by-one guard)
    expect(url).not.toContain('forecast_days');
    expect(url).toContain('timezone=Asia%2FJakarta');
  });

  it('learning cafe with coordinates → no weather fetch (result would be discarded)', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await seedSales(t, refs, 5, Date.now()); // < 14 days → learning
    await t.run((ctx) => ctx.db.patch(refs.cafeId, { latitude: -6.2, longitude: 106.8 }));
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await t.action(internal.forecast.generateNightly, {});
    const forecasts = await t.run((ctx) => ctx.db.query('forecasts').collect());
    expect(forecasts[0]?.status).toBe('learning');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
