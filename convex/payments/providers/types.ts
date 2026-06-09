export type ChargeInput = { amountIDR: number; ref: string; idempotencyKey: string };
export type ChargeResult = { providerRef: string; qrString: string; expiresAt: number };
export type WebhookEvent = { providerRef: string; status: 'paid' | 'expired' | 'failed' };

export interface PaymentProvider {
  /** Create a per-transaction QR charge with the gateway. */
  createCharge(input: ChargeInput): Promise<ChargeResult>;
  /** Verify a webhook body's signature; return the parsed event, or null if invalid. */
  verifyWebhook(req: { body: string; signature: string | null }): Promise<WebhookEvent | null>;
}
