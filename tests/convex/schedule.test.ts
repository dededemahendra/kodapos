import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setup(t: ReturnType<typeof convexTest>, email = 'o@x.com') {
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
  const staffId = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
  return { asOwner, cafeId, staffId };
}

describe('schedule create + list', () => {
  it('creates a shift and lists it enriched with the staff name', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, staffId } = await setup(t);
    const id = await asOwner.mutation(api.schedule.create, {
      staffId,
      date: '2026-06-15',
      startTime: '09:00',
      endTime: '17:00',
      note: 'Buka toko',
    });
    expect(id).toBeTruthy();
    const { rows } = await asOwner.query(api.schedule.list, { from: '2026-06-15', to: '2026-06-15' });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(id);
    expect(rows[0]?.staffId).toBe(staffId);
    expect(rows[0]?.staffName).toBe('Andi');
    expect(rows[0]?.date).toBe('2026-06-15');
    expect(rows[0]?.startTime).toBe('09:00');
    expect(rows[0]?.endTime).toBe('17:00');
    expect(rows[0]?.note).toBe('Buka toko');
  });

  it('sorts by date then startTime', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, staffId } = await setup(t);
    await asOwner.mutation(api.schedule.create, {
      staffId,
      date: '2026-06-16',
      startTime: '08:00',
      endTime: '12:00',
    });
    await asOwner.mutation(api.schedule.create, {
      staffId,
      date: '2026-06-15',
      startTime: '14:00',
      endTime: '18:00',
    });
    await asOwner.mutation(api.schedule.create, {
      staffId,
      date: '2026-06-15',
      startTime: '08:00',
      endTime: '12:00',
    });
    const { rows } = await asOwner.query(api.schedule.list, { from: '2026-06-15', to: '2026-06-16' });
    expect(rows.map((r) => `${r.date} ${r.startTime}`)).toEqual([
      '2026-06-15 08:00',
      '2026-06-15 14:00',
      '2026-06-16 08:00',
    ]);
  });

  it('list({from,to}) excludes a shift dated outside the window', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, staffId } = await setup(t);
    const inside = await asOwner.mutation(api.schedule.create, {
      staffId,
      date: '2026-06-15',
      startTime: '09:00',
      endTime: '17:00',
    });
    await asOwner.mutation(api.schedule.create, {
      staffId,
      date: '2026-06-22',
      startTime: '09:00',
      endTime: '17:00',
    });
    const { rows } = await asOwner.query(api.schedule.list, { from: '2026-06-15', to: '2026-06-21' });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(inside);
  });
});

describe('schedule validation', () => {
  it('rejects a bad date format', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, staffId } = await setup(t);
    await expect(
      asOwner.mutation(api.schedule.create, {
        staffId,
        date: '2026-6-1',
        startTime: '09:00',
        endTime: '17:00',
      })
    ).rejects.toThrow(/tanggal tidak valid/i);
  });

  it('rejects a bad time format', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, staffId } = await setup(t);
    await expect(
      asOwner.mutation(api.schedule.create, {
        staffId,
        date: '2026-06-15',
        startTime: '9:00',
        endTime: '17:00',
      })
    ).rejects.toThrow(/waktu tidak valid/i);
  });

  it('rejects end <= start', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, staffId } = await setup(t);
    await expect(
      asOwner.mutation(api.schedule.create, {
        staffId,
        date: '2026-06-15',
        startTime: '17:00',
        endTime: '17:00',
      })
    ).rejects.toThrow(/selesai harus setelah mulai/i);
    await expect(
      asOwner.mutation(api.schedule.create, {
        staffId,
        date: '2026-06-15',
        startTime: '17:00',
        endTime: '09:00',
      })
    ).rejects.toThrow(/selesai harus setelah mulai/i);
  });
});

describe('schedule update + remove', () => {
  it('update edits fields and re-validates', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, staffId } = await setup(t);
    const id = await asOwner.mutation(api.schedule.create, {
      staffId,
      date: '2026-06-15',
      startTime: '09:00',
      endTime: '17:00',
    });
    await asOwner.mutation(api.schedule.update, {
      id,
      date: '2026-06-16',
      startTime: '10:00',
      note: 'Shift sore',
    });
    const { rows } = await asOwner.query(api.schedule.list, { from: '2026-06-15', to: '2026-06-16' });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.date).toBe('2026-06-16');
    expect(rows[0]?.startTime).toBe('10:00');
    expect(rows[0]?.endTime).toBe('17:00');
    expect(rows[0]?.note).toBe('Shift sore');

    await expect(
      asOwner.mutation(api.schedule.update, { id, startTime: '18:00' })
    ).rejects.toThrow(/selesai harus setelah mulai/i);
  });

  it('remove deletes the shift', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, staffId } = await setup(t);
    const id = await asOwner.mutation(api.schedule.create, {
      staffId,
      date: '2026-06-15',
      startTime: '09:00',
      endTime: '17:00',
    });
    await asOwner.mutation(api.schedule.remove, { id });
    const { rows } = await asOwner.query(api.schedule.list, { from: '2026-06-15', to: '2026-06-15' });
    expect(rows).toHaveLength(0);
  });
});

describe('schedule owner-scope', () => {
  it('rejects a foreign staffId on create', async () => {
    const t = convexTest(schema, modules);
    const a = await setup(t, 'a@x.com');
    const b = await setup(t, 'b@x.com');
    await expect(
      b.asOwner.mutation(api.schedule.create, {
        staffId: a.staffId,
        date: '2026-06-15',
        startTime: '09:00',
        endTime: '17:00',
      })
    ).rejects.toThrow();
  });

  it('rejects a foreign shift on update/remove', async () => {
    const t = convexTest(schema, modules);
    const a = await setup(t, 'a@x.com');
    const aShift = await a.asOwner.mutation(api.schedule.create, {
      staffId: a.staffId,
      date: '2026-06-15',
      startTime: '09:00',
      endTime: '17:00',
    });
    const b = await setup(t, 'b@x.com');
    await expect(
      b.asOwner.mutation(api.schedule.update, { id: aShift, startTime: '10:00' })
    ).rejects.toThrow();
    await expect(b.asOwner.mutation(api.schedule.remove, { id: aShift })).rejects.toThrow();
  });
});
