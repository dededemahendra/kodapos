import type { PaymentProvider, WebhookEvent } from './types';
import { timingSafeEqual } from './util';

export type XenditConfig = { secretApiKey: string; callbackToken: string };

const XENDIT_QR_URL = 'https://api.xendit.co/qr_codes';

export class XenditProvider implements PaymentProvider {
  constructor(private readonly config: XenditConfig) {}

  async createCharge(input: { amountIDR: number; referenceId: string }) {
    const auth = btoa(`${this.config.secretApiKey}:`);
    const res = await fetch(XENDIT_QR_URL, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', 'api-version': '2022-07-31' },
      body: JSON.stringify({ reference_id: input.referenceId, type: 'DYNAMIC', currency: 'IDR', amount: input.amountIDR }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Gagal membuat QRIS di Xendit (${res.status}). ${detail}`.trim());
    }
    const json = (await res.json()) as { id: string; qr_string: string; expires_at: string };
    const parsedExpiry = Date.parse(json.expires_at);
    const expiresAt = Number.isFinite(parsedExpiry) ? parsedExpiry : Date.now() + 15 * 60 * 1000;
    return { providerRef: json.id, qrString: json.qr_string, expiresAt };
  }

  /** Pure parse of the lookup key (qr_id); no creds. Used before the cafe is known. */
  static parseReference(body: string): string | null {
    try {
      const data = (JSON.parse(body) as { data?: { qr_id?: string } }).data;
      return data?.qr_id ?? null;
    } catch {
      return null;
    }
  }

  async verifyWebhook(req: { body: string; headers: Headers }): Promise<WebhookEvent | null> {
    const token = req.headers.get('x-callback-token');
    if (!token || !timingSafeEqual(token, this.config.callbackToken)) return null;
    try {
      const data = (JSON.parse(req.body) as { data?: { qr_id?: string; status?: string } }).data;
      if (!data?.qr_id || !data.status) return null;
      const map: Record<string, WebhookEvent['status']> = {
        SUCCEEDED: 'paid', COMPLETED: 'paid', EXPIRED: 'expired', FAILED: 'failed', INACTIVE: 'expired',
      };
      const status = map[data.status];
      if (!status) return null;
      return { providerRef: data.qr_id, status };
    } catch {
      return null;
    }
  }
}
