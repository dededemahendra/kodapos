import { describe, expect, it } from 'vitest';
import { deriveOfflineEnabled } from '~/lib/offline/offline-enabled';

describe('deriveOfflineEnabled', () => {
  it('is enabled when the flag is on', () => {
    expect(deriveOfflineEnabled({ flag: true, override: false })).toBe(true);
  });

  it('is disabled when the flag is off', () => {
    expect(deriveOfflineEnabled({ flag: false, override: false })).toBe(false);
  });

  it('lets a resolved kill switch beat the local override', () => {
    // The flag is the remote kill switch: once it has resolved to false, no
    // build-time override may re-arm the till. Otherwise turning the feature
    // off in PostHog would silently miss any deployment carrying the override.
    expect(deriveOfflineEnabled({ flag: false, override: true })).toBe(false);
  });

  it('falls back to the local override when the flag never resolved', () => {
    // PostHog does not load outside production hosts (see isTrackedHost), so
    // dev and preview have no flag value at all. The override is the only way
    // to exercise the feature there.
    expect(deriveOfflineEnabled({ flag: undefined, override: true })).toBe(true);
  });

  it('is disabled when nothing resolves', () => {
    // Fail closed: a fresh device, a blocked posthog-js chunk, DNT, or a till
    // that booted offline and has never held a flag value. Queueing real cash
    // on a device we cannot reach with the kill switch is the worse failure.
    expect(deriveOfflineEnabled({ flag: undefined, override: false })).toBe(false);
  });
});
