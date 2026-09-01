import { MockProvider } from './mock';
import type { PaymentProvider } from './types';
import { XenditProvider } from './xendit';

/**
 * Shared secret for the mock QRIS webhook route. Deliberately has no default:
 * a well-known fallback would let anyone who can read this repo sign a `paid`
 * event against a deployment where the var was never seeded. Returns null when
 * unset so callers fail closed rather than verifying against a known constant.
 */
export function qrisWebhookSecret(): string | null {
  // `||`, not `??`: an env var present but empty is unset, not a secret of ''.
  return process.env.QRIS_WEBHOOK_SECRET || null;
}

/**
 * Select the active QRIS provider from the connected `qris` integration's config.
 * Returns XenditProvider when a complete Xendit config is present; otherwise falls
 * back to MockProvider so dev/incomplete-config flows stay functional.
 */
export function resolveProvider(config?: unknown): PaymentProvider {
  const c = config as
    | { provider?: string; secretApiKey?: string; callbackToken?: string }
    | undefined;
  if (c?.provider === 'xendit' && c.secretApiKey && c.callbackToken) {
    return new XenditProvider({ secretApiKey: c.secretApiKey, callbackToken: c.callbackToken });
  }
  return new MockProvider(qrisWebhookSecret());
}
