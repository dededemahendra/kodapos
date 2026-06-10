import type { PaymentProvider, WebhookEvent } from './types';
import { WEBHOOK_STATUSES } from './types';
import { timingSafeEqual } from './util';

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

  async createCharge(input: { amountIDR: number; referenceId: string }) {
    const providerRef = `mock_${input.referenceId}`;
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes
    const qrString = `MOCKQR|${providerRef}|${input.amountIDR}`;
    return { providerRef, qrString, expiresAt };
  }

  async verifyWebhook(req: { body: string; headers: Headers }): Promise<WebhookEvent | null> {
    const signature = req.headers.get('x-signature');
    if (!signature) return null;
    const expected = await signMockBody(this.secret, req.body);
    if (!timingSafeEqual(signature, expected)) return null;
    try {
      const parsed = JSON.parse(req.body) as { providerRef?: string; status?: string };
      if (!parsed.providerRef || !(WEBHOOK_STATUSES as readonly string[]).includes(parsed.status ?? '')) {
        return null;
      }
      return { providerRef: parsed.providerRef, status: parsed.status as WebhookEvent['status'] };
    } catch {
      return null;
    }
  }
}
