/**
 * Whether this till may arm the offline cash path at all.
 *
 * Separate from `connectivity.ts`, which answers "can a mutation land right
 * now". This answers "is the feature switched on for this device", and the two
 * are deliberately independent: gating `useConnectionState` itself would also
 * gate the replay worker, and a till that has already taken cash must always
 * drain its outbox — see `drain` in ./replay.ts, which is intentionally not
 * flag-aware.
 */
import { useEffect, useState } from 'react';
import { isFeatureEnabled, onFeatureFlagsChanged } from '~/lib/analytics/client';

/** The PostHog flag key. Create it in the dashboard; target it by `business`. */
export const OFFLINE_SALES_FLAG = 'offline-cash-sales';

/**
 * Pure so it can be tested without a browser, a PostHog client, or a DOM —
 * the same reason `deriveState` is split out of `useConnectionState`.
 *
 * `flag` is the cached PostHog value, `undefined` when it has never resolved
 * on this device. `override` is the build-time `VITE_OFFLINE_SALES` opt-in,
 * which exists only because posthog-js never loads outside production hosts
 * (see `isTrackedHost` in ../analytics/policy.ts), so dev and preview would
 * otherwise have no way to exercise the feature.
 *
 * A resolved flag always wins. The override can only speak for a device the
 * kill switch has never reached — otherwise switching the feature off in
 * PostHog would quietly skip any build that shipped with the override set.
 */
export function deriveOfflineEnabled(input: {
  flag: boolean | undefined;
  override: boolean;
}): boolean {
  return input.flag !== undefined ? input.flag : input.override;
}

/**
 * Read at call time rather than at module scope so importing this module in a
 * test bakes in nothing. `'1'` only — an unset var, `'0'`, or `'false'` all
 * mean off, so a typo fails closed.
 */
function localOverride(): boolean {
  return import.meta.env.VITE_OFFLINE_SALES === '1';
}

/**
 * Live view of the flag. Re-reads on every flag payload, so flipping the
 * switch in PostHog reaches a till that is already running without a reload —
 * which is the whole point of a kill switch.
 *
 * Untested, like `useConnectionState`: vitest runs on edge-runtime here and
 * collects only `*.test.ts`, so there is no DOM to render a hook into. All the
 * decidable logic is in `deriveOfflineEnabled` above, which is tested.
 */
export function useOfflineSalesEnabled(): boolean {
  const [flag, setFlag] = useState<boolean | undefined>(() => isFeatureEnabled(OFFLINE_SALES_FLAG));

  useEffect(() => {
    const read = () => setFlag(isFeatureEnabled(OFFLINE_SALES_FLAG));
    // Read once on mount as well as on change: posthog-js may already have a
    // cached payload from a previous session, in which case `onFeatureFlags`
    // has nothing new to announce.
    read();
    return onFeatureFlagsChanged(read);
  }, []);

  return deriveOfflineEnabled({ flag, override: localOverride() });
}
