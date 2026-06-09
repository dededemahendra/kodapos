export type ChargeInput = { amountIDR: number; ref: string; idempotencyKey: string };
export type ChargeResult = { providerRef: string; qrString: string; expiresAt: number };

/** Single source of truth for webhook status values; the union derives from it. */
export const WEBHOOK_STATUSES = ['paid', 'expired', 'failed'] as const;
export type WebhookStatus = (typeof WEBHOOK_STATUSES)[number];
export type WebhookEvent = { providerRef: string; status: WebhookStatus };

export interface PaymentProvider {
  /** Create a per-transaction QR charge with the gateway. */
  createCharge(input: ChargeInput): Promise<ChargeResult>;
  /** Verify a webhook body's signature; return the parsed event, or null if invalid. */
  verifyWebhook(req: { body: string; signature: string | null }): Promise<WebhookEvent | null>;
}
