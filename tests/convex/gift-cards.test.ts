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

describe('gift cards management', () => {
  it('issue uppercases + trims the code, sets balance, writes an issue ledger row', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.giftCards.issue, {
      code: '  gift-1  ',
      balanceIDR: 100_000,
    });
    const card = await asOwner.query(api.giftCards.getByCode, { code: 'gift-1' });
    expect(card?._id).toBe(id);
    expect(card?.code).toBe('GIFT-1');
    expect(card?.balanceIDR).toBe(100_000);
    expect(card?.status).toBe('active');

    const txns = await asOwner.query(api.giftCards.transactions, { id });
    expect(txns).toHaveLength(1);
    expect(txns[0]?.type).toBe('issue');
    expect(txns[0]?.amountIDR).toBe(100_000);
  });

  it('topup increases the balance and writes a topup ledger row', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.giftCards.issue, { code: 'CARD2', balanceIDR: 50_000 });
    await asOwner.mutation(api.giftCards.topup, { id, amountIDR: 25_000 });
    const card = await asOwner.query(api.giftCards.getByCode, { code: 'card2' });
    expect(card?.balanceIDR).toBe(75_000);

    const txns = await asOwner.query(api.giftCards.transactions, { id });
    // newest-first: topup, then issue
    expect(txns).toHaveLength(2);
    expect(txns[0]?.type).toBe('topup');
    expect(txns[0]?.amountIDR).toBe(25_000);
    expect(txns[1]?.type).toBe('issue');
  });

  it('getByCode resolves by uppercased code and returns null for unknown', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await asOwner.mutation(api.giftCards.issue, { code: 'abcd', balanceIDR: 10_000 });
    const card = await asOwner.query(api.giftCards.getByCode, { code: ' AbCd ' });
    expect(card?.code).toBe('ABCD');
    expect(await asOwner.query(api.giftCards.getByCode, { code: 'nope' })).toBeNull();
  });

  it('list returns newest-first and excludes archived by default', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const first = await asOwner.mutation(api.giftCards.issue, { code: 'FIRST', balanceIDR: 10_000 });
    const second = await asOwner.mutation(api.giftCards.issue, {
      code: 'SECOND',
      balanceIDR: 20_000,
    });
    const list = await asOwner.query(api.giftCards.list, {});
    expect(list).toHaveLength(2);
    expect(list[0]?._id).toBe(second); // newest-first
    expect(list[1]?._id).toBe(first);

    await asOwner.mutation(api.giftCards.archive, { id: second });
    const active = await asOwner.query(api.giftCards.list, {});
    expect(active).toHaveLength(1);
    expect(active[0]?._id).toBe(first);
    const all = await asOwner.query(api.giftCards.list, { includeArchived: true });
    expect(all).toHaveLength(2);
  });

  it('archive sets the status to archived', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.giftCards.issue, { code: 'ARCH1', balanceIDR: 5_000 });
    await asOwner.mutation(api.giftCards.archive, { id });
    const card = await asOwner.query(api.giftCards.getByCode, { code: 'ARCH1' });
    expect(card?.status).toBe('archived');
  });

  it('rejects a duplicate code in the same cafe', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await asOwner.mutation(api.giftCards.issue, { code: 'DUP1', balanceIDR: 10_000 });
    await expect(
      asOwner.mutation(api.giftCards.issue, { code: ' dup1 ', balanceIDR: 5_000 })
    ).rejects.toThrow();
  });

  it('rejects a non-positive balance', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await expect(
      asOwner.mutation(api.giftCards.issue, { code: 'ZERO1', balanceIDR: 0 })
    ).rejects.toThrow();
    await expect(
      asOwner.mutation(api.giftCards.issue, { code: 'NEG1', balanceIDR: -100 })
    ).rejects.toThrow();
  });

  it('rejects a code shorter than 4 chars', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await expect(
      asOwner.mutation(api.giftCards.issue, { code: 'abc', balanceIDR: 10_000 })
    ).rejects.toThrow();
  });

  it('rejects a non-positive topup', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.giftCards.issue, { code: 'TOP1', balanceIDR: 10_000 });
    await expect(asOwner.mutation(api.giftCards.topup, { id, amountIDR: 0 })).rejects.toThrow();
    await expect(asOwner.mutation(api.giftCards.topup, { id, amountIDR: -5 })).rejects.toThrow();
  });

  it('owner-scope: cafe B cannot topup or archive cafe A card', async () => {
    const t = convexTest(schema, modules);
    const a = await setupOwner(t, 'a@x.com');
    const aId = await a.asOwner.mutation(api.giftCards.issue, {
      code: 'ACARD',
      balanceIDR: 10_000,
    });
    const b = await setupOwner(t, 'b@x.com');
    expect(await b.asOwner.query(api.giftCards.list, { includeArchived: true })).toHaveLength(0);
    await expect(
      b.asOwner.mutation(api.giftCards.topup, { id: aId, amountIDR: 1_000 })
    ).rejects.toThrow();
    await expect(b.asOwner.mutation(api.giftCards.archive, { id: aId })).rejects.toThrow();
  });
});
