export const WEBHOOK_STATUSES = ['paid', 'expired', 'failed'] as const;
export type WebhookStatus = (typeof WEBHOOK_STATUSES)[number];
export type WebhookEvent = { providerRef: string; status: WebhookStatus };

export type ChargeStatus = 'paid' | 'pending' | 'expired' | 'failed' | 'unknown';

export interface PaymentProvider {
  createCharge(input: { amountIDR: number; referenceId: string }):
    Promise<{ providerRef: string; qrString: string; expiresAt: number }>;
  verifyWebhook(req: { body: string; headers: Headers }): Promise<WebhookEvent | null>;
  fetchStatus(providerRef: string): Promise<ChargeStatus>;
}
