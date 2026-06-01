import { describe, expect, it } from 'vitest';
import { resolveRange, eachDayKey, dowOfKey, addDaysToKey } from '../../convex/lib/time';

const TZ = 'Asia/Jakarta'; // fixed +07:00
// 2026-06-01T03:00:00Z === 2026-06-01 10:00 WIB
const NOW = Date.UTC(2026, 5, 1, 3, 0, 0);

describe('resolveRange', () => {
  it('today → single local day, inclusive end', () => {
    const r = resolveRange(TZ, { preset: 'today' }, NOW);
    expect(r.fromKey).toBe('2026-06-01');
    expect(r.toKey).toBe('2026-06-01');
    expect(r.startMs).toBe(Date.UTC(2026, 4, 31, 17, 0, 0));
    expect(r.endMs).toBe(Date.UTC(2026, 5, 1, 17, 0, 0) - 1);
  });
  it('yesterday → previous local day', () => {
    const r = resolveRange(TZ, { preset: 'yesterday' }, NOW);
    expect(r.fromKey).toBe('2026-05-31');
    expect(r.toKey).toBe('2026-05-31');
  });
  it('last7 → 7 local days ending today', () => {
    const r = resolveRange(TZ, { preset: 'last7' }, NOW);
    expect(r.fromKey).toBe('2026-05-26');
    expect(r.toKey).toBe('2026-06-01');
  });
  it('last30 → 30 local days ending today', () => {
    const r = resolveRange(TZ, { preset: 'last30' }, NOW);
    expect(r.fromKey).toBe('2026-05-03');
    expect(r.toKey).toBe('2026-06-01');
  });
  it('custom from/to passes through', () => {
    const r = resolveRange(TZ, { from: '2026-05-10', to: '2026-05-12' }, NOW);
    expect(r.fromKey).toBe('2026-05-10');
    expect(r.toKey).toBe('2026-05-12');
    expect(r.startMs).toBe(Date.UTC(2026, 4, 9, 17, 0, 0));
    expect(r.endMs).toBe(Date.UTC(2026, 4, 12, 17, 0, 0) - 1);
  });
  it('rejects from > to', () => {
    expect(() => resolveRange(TZ, { from: '2026-05-12', to: '2026-05-10' }, NOW)).toThrow(/tidak valid/i);
  });
  it('rejects a malformed date key', () => {
    expect(() => resolveRange(TZ, { from: '2026-5-1', to: '2026-05-10' }, NOW)).toThrow(/tidak valid/i);
  });
  it('rejects a span over 366 days', () => {
    expect(() => resolveRange(TZ, { from: '2024-01-01', to: '2026-01-01' }, NOW)).toThrow(/tidak valid/i);
  });
});

describe('eachDayKey', () => {
  it('lists inclusive calendar days', () => {
    expect(eachDayKey('2026-05-30', '2026-06-02')).toEqual([
      '2026-05-30', '2026-05-31', '2026-06-01', '2026-06-02',
    ]);
  });
  it('single day → one entry', () => {
    expect(eachDayKey('2026-06-01', '2026-06-01')).toEqual(['2026-06-01']);
  });
});

describe('dowOfKey (0=Mon..6=Sun)', () => {
  it('maps known dates', () => {
    expect(dowOfKey('2026-06-01')).toBe(0); // Monday
    expect(dowOfKey('2026-06-06')).toBe(5); // Saturday
    expect(dowOfKey('2026-06-07')).toBe(6); // Sunday
  });
});

describe('addDaysToKey', () => {
  it('adds days across a month boundary', () => {
    expect(addDaysToKey('2026-05-30', 3)).toBe('2026-06-02');
  });
  it('subtracts with negative n', () => {
    expect(addDaysToKey('2026-06-02', -3)).toBe('2026-05-30');
  });
  it('zero is identity', () => {
    expect(addDaysToKey('2026-06-01', 0)).toBe('2026-06-01');
  });
});
