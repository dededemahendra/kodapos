import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

type AsOwner = ReturnType<ReturnType<typeof convexTest>['withIdentity']>;

async function setupOwner(t: ReturnType<typeof convexTest>, email = 'o@x.com') {
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email }));
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  await asOwner.mutation(api.cafes.updateProfile, {
    name: 'Kopi Senja',
    timezone: 'Asia/Jakarta',
    taxRatePct: 0,
    taxEnabled: false,
  });
  const cafe = await asOwner.query(api.cafes.myCafe, {});
  const cafeId = cafe!._id as Id<'cafes'>;
  return { asOwner, cafeId };
}

async function makeTable(asOwner: AsOwner, name = 'Meja 1'): Promise<Id<'tables'>> {
  return await asOwner.mutation(api.tables.create, { name });
}

async function makeCustomer(
  asOwner: AsOwner,
  name = 'Budi',
  phone = '08121111111'
): Promise<Id<'customers'>> {
  return await asOwner.mutation(api.customers.create, { name, phone });
}

// A datetime today around noon (well within the cafe-local day for any reasonable tz).
function todayNoon(): number {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}

describe('reservations create + list', () => {
  it('creates a booked reservation and lists it', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.reservations.create, {
      customerName: 'Andi',
      partySize: 4,
      at: todayNoon(),
    });
    expect(id).toBeTruthy();
    const { rows } = await asOwner.query(api.reservations.list, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(id);
    expect(rows[0]?.customerName).toBe('Andi');
    expect(rows[0]?.partySize).toBe(4);
    expect(rows[0]?.status).toBe('booked');
    expect(rows[0]?.durationMin).toBe(90);
    expect(rows[0]?.tableName).toBeUndefined();
  });

  it('enriches the list row with tableName when a table is set', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const tableId = await makeTable(asOwner, 'Meja 7');
    await asOwner.mutation(api.reservations.create, {
      customerName: 'Andi',
      partySize: 2,
      at: todayNoon(),
      tableId,
    });
    const { rows } = await asOwner.query(api.reservations.list, {});
    expect(rows[0]?.tableId).toBe(tableId);
    expect(rows[0]?.tableName).toBe('Meja 7');
  });

  it('resolves customerName from a linked customer when no name is given', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const customerId = await makeCustomer(asOwner, 'Citra', '08129999999');
    const id = await asOwner.mutation(api.reservations.create, {
      customerId,
      partySize: 3,
      at: todayNoon(),
    });
    const { rows } = await asOwner.query(api.reservations.list, {});
    expect(rows.find((r) => r.id === id)?.customerName).toBe('Citra');
  });

  it('rejects empty/whitespace customerName when no customerId', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await expect(
      asOwner.mutation(api.reservations.create, {
        customerName: '   ',
        partySize: 2,
        at: todayNoon(),
      })
    ).rejects.toThrow(/nama tamu/i);
    await expect(
      asOwner.mutation(api.reservations.create, { partySize: 2, at: todayNoon() })
    ).rejects.toThrow(/nama tamu/i);
  });

  it('rejects invalid partySize (0, 101, non-integer)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await expect(
      asOwner.mutation(api.reservations.create, {
        customerName: 'Andi',
        partySize: 0,
        at: todayNoon(),
      })
    ).rejects.toThrow(/jumlah tamu/i);
    await expect(
      asOwner.mutation(api.reservations.create, {
        customerName: 'Andi',
        partySize: 101,
        at: todayNoon(),
      })
    ).rejects.toThrow(/jumlah tamu/i);
    await expect(
      asOwner.mutation(api.reservations.create, {
        customerName: 'Andi',
        partySize: 2.5,
        at: todayNoon(),
      })
    ).rejects.toThrow(/jumlah tamu/i);
  });
});

describe('reservations setStatus lifecycle', () => {
  it('booked → seated → completed', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.reservations.create, {
      customerName: 'Andi',
      partySize: 2,
      at: todayNoon(),
    });
    await asOwner.mutation(api.reservations.setStatus, { id, status: 'seated' });
    expect((await asOwner.query(api.reservations.list, {})).rows[0]?.status).toBe('seated');
    await asOwner.mutation(api.reservations.setStatus, { id, status: 'completed' });
    expect((await asOwner.query(api.reservations.list, {})).rows[0]?.status).toBe('completed');
  });

  it('booked → cancelled and booked → no_show', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const a = await asOwner.mutation(api.reservations.create, {
      customerName: 'A',
      partySize: 2,
      at: todayNoon(),
    });
    const b = await asOwner.mutation(api.reservations.create, {
      customerName: 'B',
      partySize: 2,
      at: todayNoon(),
    });
    await asOwner.mutation(api.reservations.setStatus, { id: a, status: 'cancelled' });
    await asOwner.mutation(api.reservations.setStatus, { id: b, status: 'no_show' });
    expect((await asOwner.query(api.reservations.list, { status: 'cancelled' })).rows).toHaveLength(
      1
    );
    expect((await asOwner.query(api.reservations.list, { status: 'no_show' })).rows).toHaveLength(1);
  });

  it('list filters by status', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const a = await asOwner.mutation(api.reservations.create, {
      customerName: 'A',
      partySize: 2,
      at: todayNoon(),
    });
    await asOwner.mutation(api.reservations.create, {
      customerName: 'B',
      partySize: 2,
      at: todayNoon(),
    });
    await asOwner.mutation(api.reservations.setStatus, { id: a, status: 'seated' });
    const booked = await asOwner.query(api.reservations.list, { status: 'booked' });
    expect(booked.rows).toHaveLength(1);
    expect(booked.rows[0]?.customerName).toBe('B');
  });
});

describe('reservations update + remove', () => {
  it('update edits partySize/at/note', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.reservations.create, {
      customerName: 'Andi',
      partySize: 2,
      at: todayNoon(),
    });
    const newAt = todayNoon() + 3_600_000;
    await asOwner.mutation(api.reservations.update, {
      id,
      partySize: 6,
      at: newAt,
      note: 'Dekat jendela',
    });
    const { rows } = await asOwner.query(api.reservations.list, {});
    expect(rows[0]?.partySize).toBe(6);
    expect(rows[0]?.at).toBe(newAt);
    expect(rows[0]?.note).toBe('Dekat jendela');
  });

  it('remove deletes the reservation', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.reservations.create, {
      customerName: 'Andi',
      partySize: 2,
      at: todayNoon(),
    });
    await asOwner.mutation(api.reservations.remove, { id });
    expect((await asOwner.query(api.reservations.list, {})).rows).toHaveLength(0);
  });
});

describe('reservations list window + todayByTable', () => {
  it('list({from,to}) excludes a reservation stamped outside the window', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const today = todayNoon();
    const inside = await asOwner.mutation(api.reservations.create, {
      customerName: 'Inside',
      partySize: 2,
      at: today,
    });
    await asOwner.mutation(api.reservations.create, {
      customerName: 'Outside',
      partySize: 2,
      at: today + 7 * 86_400_000,
    });
    const { rows } = await asOwner.query(api.reservations.list, {
      from: today - 3_600_000,
      to: today + 3_600_000,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(inside);
  });

  it('todayByTable returns only today active table-assigned bookings', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const tableId = await makeTable(asOwner, 'Meja 1');
    const today = todayNoon();

    // today + table + booked → included
    const r1 = await asOwner.mutation(api.reservations.create, {
      customerName: 'Booked',
      partySize: 2,
      at: today,
      tableId,
    });
    // today + table + seated → included
    const r2 = await asOwner.mutation(api.reservations.create, {
      customerName: 'Seated',
      partySize: 3,
      at: today + 60_000,
      tableId,
    });
    await asOwner.mutation(api.reservations.setStatus, { id: r2, status: 'seated' });
    // today + table + cancelled → excluded
    const r3 = await asOwner.mutation(api.reservations.create, {
      customerName: 'Cancelled',
      partySize: 2,
      at: today,
      tableId,
    });
    await asOwner.mutation(api.reservations.setStatus, { id: r3, status: 'cancelled' });
    // today + no table → excluded
    await asOwner.mutation(api.reservations.create, {
      customerName: 'NoTable',
      partySize: 2,
      at: today,
    });
    // other day + table + booked → excluded (backdate via t.run)
    const r5 = await asOwner.mutation(api.reservations.create, {
      customerName: 'Yesterday',
      partySize: 2,
      at: today,
      tableId,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(r5, { at: today - 2 * 86_400_000 });
    });

    const floor = await asOwner.query(api.reservations.todayByTable, {});
    const ids = floor.map((f) => f.customerName).sort();
    expect(ids).toEqual(['Booked', 'Seated']);
    for (const f of floor) {
      expect(f.tableId).toBe(tableId);
    }
    expect(floor.find((f) => f.customerName === 'Booked')?.status).toBe('booked');
    expect(floor.find((f) => f.customerName === 'Seated')?.status).toBe('seated');
    // sanity: r1 is the booked one
    expect(floor.find((f) => f.customerName === 'Booked')).toBeTruthy();
    expect(r1).toBeTruthy();
  });
});

describe('reservations owner-scope', () => {
  it('rejects a foreign table on create', async () => {
    const t = convexTest(schema, modules);
    const a = await setupOwner(t, 'a@x.com');
    const aTable = await makeTable(a.asOwner, 'A');
    const b = await setupOwner(t, 'b@x.com');
    await expect(
      b.asOwner.mutation(api.reservations.create, {
        customerName: 'X',
        partySize: 2,
        at: todayNoon(),
        tableId: aTable,
      })
    ).rejects.toThrow();
  });

  it('rejects a foreign customer on create', async () => {
    const t = convexTest(schema, modules);
    const a = await setupOwner(t, 'a@x.com');
    const aCustomer = await makeCustomer(a.asOwner, 'A', '08120000000');
    const b = await setupOwner(t, 'b@x.com');
    await expect(
      b.asOwner.mutation(api.reservations.create, {
        customerId: aCustomer,
        partySize: 2,
        at: todayNoon(),
      })
    ).rejects.toThrow();
  });

  it('rejects a foreign reservation on setStatus/update/remove', async () => {
    const t = convexTest(schema, modules);
    const a = await setupOwner(t, 'a@x.com');
    const aRes = await a.asOwner.mutation(api.reservations.create, {
      customerName: 'A',
      partySize: 2,
      at: todayNoon(),
    });
    const b = await setupOwner(t, 'b@x.com');
    await expect(
      b.asOwner.mutation(api.reservations.setStatus, { id: aRes, status: 'seated' })
    ).rejects.toThrow();
    await expect(
      b.asOwner.mutation(api.reservations.update, { id: aRes, partySize: 5 })
    ).rejects.toThrow();
    await expect(b.asOwner.mutation(api.reservations.remove, { id: aRes })).rejects.toThrow();
  });
});
