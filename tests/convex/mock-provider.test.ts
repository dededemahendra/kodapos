import { describe, expect, it } from 'vitest';
import { MockProvider, signMockBody } from '../../convex/payments/providers/mock';

const SECRET = 'test-secret';

describe('MockProvider', () => {
  it('createCharge returns a providerRef, qrString and future expiry', async () => {
    const p = new MockProvider(SECRET);
    const r = await p.createCharge({ amountIDR: 36000, ref: 'client-1', idempotencyKey: 'client-1' });
    expect(r.providerRef).toMatch(/^mock_/);
    expect(typeof r.qrString).toBe('string');
    expect(r.expiresAt).toBeGreaterThan(Date.now());
  });

  it('verifyWebhook accepts a correctly-signed body and rejects a bad signature', async () => {
    const p = new MockProvider(SECRET);
    const body = JSON.stringify({ providerRef: 'mock_abc', status: 'paid' });
    const sig = await signMockBody(SECRET, body);
    await expect(p.verifyWebhook({ body, signature: sig })).resolves.toEqual({ providerRef: 'mock_abc', status: 'paid' });
    await expect(p.verifyWebhook({ body, signature: 'wrong' })).resolves.toBeNull();
  });
});
