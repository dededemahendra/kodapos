import { convexTest } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function ownerWithCafe(t: ReturnType<typeof convexTest>, city?: string) {
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' }));
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  const cafe = await asOwner.query(api.cafes.myCafe, {});
  const cafeId = cafe!._id as Id<'cafes'>;
  if (city !== undefined) {
    await t.run((ctx) => ctx.db.patch(cafeId, { city }));
  }
  return { asOwner, cafeId };
}

describe('cafes.createForOwner / cafes.mine', () => {
  it('creates a cafe owned by the authenticated user and returns it from mine()', async () => {
    const t = convexTest(schema, modules);

    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'Owner',
        email: 'owner@example.com',
      });
    });
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });

    await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
    const list = await asOwner.query(api.cafes.mine);

    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('Kopi Senja');
    expect(list[0]?.ownerUserId).toBe(userId);
  });

  it('returns an empty list when no cafe is owned', async () => {
    const t = convexTest(schema, modules);

    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'Empty Owner',
        email: 'empty@example.com',
      });
    });
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });

    const list = await asOwner.query(api.cafes.mine);
    expect(list).toEqual([]);
  });

  it('returns an empty list when not authenticated', async () => {
    const t = convexTest(schema, modules);
    const list = await t.query(api.cafes.mine);
    expect(list).toEqual([]);
  });

  it('createForOwner throws when not authenticated', async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.cafes.createForOwner, { name: 'Anon Cafe' })).rejects.toThrow(
      /not authenticated/i
    );
  });
});

describe('cafes.geocodeFromCity', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sets latitude/longitude from the geocode hit', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId } = await ownerWithCafe(t, 'Bandung');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [{ latitude: -6.9, longitude: 107.6 }] }) })
    );
    const res = await asOwner.action(api.cafes.geocodeFromCity, {});
    expect(res).toEqual({ found: true });
    const cafe = await t.run((ctx) => ctx.db.get(cafeId));
    expect(cafe?.latitude).toBe(-6.9);
    expect(cafe?.longitude).toBe(107.6);
  });

  it('returns found:false and does not fetch when the cafe has no city', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await ownerWithCafe(t); // no city
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const res = await asOwner.action(api.cafes.geocodeFromCity, {});
    expect(res).toEqual({ found: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns found:false on an empty geocode result (no patch)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId } = await ownerWithCafe(t, 'Atlantis');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) }));
    const res = await asOwner.action(api.cafes.geocodeFromCity, {});
    expect(res).toEqual({ found: false });
    const cafe = await t.run((ctx) => ctx.db.get(cafeId));
    expect(cafe?.latitude).toBeUndefined();
  });

  it('a second owner can only geocode their own cafe, not another owner\'s', async () => {
    const t = convexTest(schema, modules);
    const { cafeId: cafeA } = await ownerWithCafe(t, 'Bandung'); // owner o@x.com, has a city

    // A second owner, with their own cafe.
    const userId2 = await t.run((ctx) => ctx.db.insert('users', { name: 'B', email: 'b@x.com' }));
    const asOwner2 = t.withIdentity({ subject: `${userId2}|test_session` });
    await asOwner2.mutation(api.cafes.createForOwner, { name: 'Kopi B' });
    const cafeB = (await asOwner2.query(api.cafes.myCafe, {}))!._id as Id<'cafes'>;
    await t.run((ctx) => ctx.db.patch(cafeB, { city: 'Surabaya' }));

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [{ latitude: 1, longitude: 2 }] }) })
    );

    // Owner B geocodes — must patch ONLY cafe B.
    const res = await asOwner2.action(api.cafes.geocodeFromCity, {});
    expect(res).toEqual({ found: true });
    const aDoc = await t.run((ctx) => ctx.db.get(cafeA));
    const bDoc = await t.run((ctx) => ctx.db.get(cafeB));
    expect(bDoc?.latitude).toBe(1);
    expect(aDoc?.latitude).toBeUndefined(); // owner A's cafe untouched
  });
});
