import type { ChargeInput, ChargeResult, PaymentProvider, WebhookEvent } from './types';

/** HMAC-SHA256 hex over `body` using Web Crypto (available in the default Convex runtime). */
export async function signMockBody(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class MockProvider implements PaymentProvider {
  constructor(private readonly secret: string) {}

  async createCharge(input: ChargeInput): Promise<ChargeResult> {
    const providerRef = `mock_${input.idempotencyKey}`;
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes
    const qrString = `MOCKQR|${providerRef}|${input.amountIDR}`;
    return { providerRef, qrString, expiresAt };
  }

  async verifyWebhook(req: { body: string; signature: string | null }): Promise<WebhookEvent | null> {
    if (!req.signature) return null;
    const expected = await signMockBody(this.secret, req.body);
    if (req.signature.length !== expected.length || req.signature !== expected) return null;
    try {
      const parsed = JSON.parse(req.body) as { providerRef?: string; status?: string };
      if (!parsed.providerRef || !['paid', 'expired', 'failed'].includes(parsed.status ?? '')) return null;
      return { providerRef: parsed.providerRef, status: parsed.status as WebhookEvent['status'] };
    } catch {
      return null;
    }
  }
}
