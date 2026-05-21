import { describe, expect, it } from 'vitest';
import { hashPin, verifyPin } from '../../../convex/lib/pin';

describe('hashPin / verifyPin', () => {
  it('produces a hash that verifies against the same pin', async () => {
    const hash = await hashPin('1234');
    expect(hash).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(await verifyPin('1234', hash)).toBe(true);
  });

  it('rejects a different pin', async () => {
    const hash = await hashPin('1234');
    expect(await verifyPin('0000', hash)).toBe(false);
  });

  it('uses per-call salt so two hashes of the same pin differ', async () => {
    const a = await hashPin('1234');
    const b = await hashPin('1234');
    expect(a).not.toBe(b);
    expect(await verifyPin('1234', a)).toBe(true);
    expect(await verifyPin('1234', b)).toBe(true);
  });

  it('returns false on malformed stored hash', async () => {
    expect(await verifyPin('1234', 'not-a-hash')).toBe(false);
    expect(await verifyPin('1234', '')).toBe(false);
    expect(await verifyPin('1234', 'abcdef')).toBe(false);
  });
});
