import type { PaymentProvider } from './types';
import { MockProvider } from './mock';

export function qrisWebhookSecret(): string {
  return process.env.QRIS_WEBHOOK_SECRET ?? 'dev-qris-secret';
}

/**
 * Select the active QRIS provider. Until a real Midtrans/Xendit adapter is wired,
 * this always returns MockProvider. `integrationConfig` (the connected `qris`
 * integration's config) is accepted now so the real selector can branch on it.
 */
export function resolveProvider(_integrationConfig?: unknown): PaymentProvider {
  return new MockProvider(qrisWebhookSecret());
}
