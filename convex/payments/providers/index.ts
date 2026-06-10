import type { PaymentProvider } from './types';
import { MockProvider } from './mock';
import { XenditProvider } from './xendit';

export function qrisWebhookSecret(): string {
  return process.env.QRIS_WEBHOOK_SECRET ?? 'dev-qris-secret';
}

/**
 * Select the active QRIS provider from the connected `qris` integration's config.
 * Returns XenditProvider when a complete Xendit config is present; otherwise falls
 * back to MockProvider so dev/incomplete-config flows stay functional.
 */
export function resolveProvider(config?: unknown): PaymentProvider {
  const c = config as { provider?: string; secretApiKey?: string; callbackToken?: string } | undefined;
  if (c?.provider === 'xendit' && c.secretApiKey && c.callbackToken) {
    return new XenditProvider({ secretApiKey: c.secretApiKey, callbackToken: c.callbackToken });
  }
  return new MockProvider(qrisWebhookSecret());
}
