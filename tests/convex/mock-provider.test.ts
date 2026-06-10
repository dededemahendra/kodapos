import { describe, expect, it } from 'vitest';
import { MockProvider, signMockBody } from '../../convex/payments/providers/mock';
const SECRET = 'test-secret';
describe('MockProvider', () => {
  it('createCharge returns providerRef/qrString/future expiry', async () => {
    const p = new MockProvider(SECRET);
    const r = await p.createCharge({ amountIDR: 36000, referenceId: 'ord-1' });
    expect(r.providerRef).toBe('mock_ord-1');
    expect(r.expiresAt).toBeGreaterThan(Date.now());
  });
  it('verifyWebhook accepts a valid x-signature and rejects a bad one', async () => {
    const p = new MockProvider(SECRET);
    const body = JSON.stringify({ providerRef: 'mock_abc', status: 'paid' });
    const ok = new Headers({ 'x-signature': await signMockBody(SECRET, body) });
    const bad = new Headers({ 'x-signature': 'wrong' });
    await expect(p.verifyWebhook({ body, headers: ok })).resolves.toEqual({ providerRef: 'mock_abc', status: 'paid' });
    await expect(p.verifyWebhook({ body, headers: bad })).resolves.toBeNull();
  });
});
