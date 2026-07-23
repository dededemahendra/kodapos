'use client';

import { useRouterState } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useConvexAuth, useQuery } from 'convex/react';
import { useEffect, useRef, useState } from 'react';
import { useLocale } from '~/components/locale-provider';
import {
  CHANGE_EVENT as CASHIER_CHANGE_EVENT,
  STORAGE_KEY as CASHIER_STORAGE_KEY,
} from '~/lib/active-cashier';
import {
  capturePageview,
  identifyUser,
  initAnalytics,
  isAnalyticsEnabled,
  resetAnalytics,
  setGroup,
} from '~/lib/analytics/client';
import { buildSuperProperties, shouldTrackPath } from '~/lib/analytics/policy';

/**
 * Drives the analytics lifecycle. Renders nothing.
 *
 * Deliberately thin: every decision it makes lives in policy.ts, because the
 * test environment cannot collect .tsx files. If you find yourself adding a
 * condition here, it probably belongs in policy.ts with a test.
 *
 * posthog-js is browser-only and __root.tsx renders on the server, so init
 * happens in an effect and never at module scope.
 */
export function AnalyticsProvider(): null {
  const { locale } = useLocale();
  const { isAuthenticated } = useConvexAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const identity = useQuery(api.users.analyticsIdentity, isAuthenticated ? {} : 'skip');

  const started = useRef(false);
  const wasAuthenticated = useRef(false);
  const identified = useRef<string | null>(null);
  // capturePageview() is a no-op until initAnalytics()'s dynamic import
  // resolves, because the module-level client is still null. Without this
  // gate the very first pageview (the top of the marketing funnel) is
  // silently dropped. Flipping it true only after init resolves lets the
  // pageview effect wait instead of firing into the void.
  //
  // initAnalytics() never rejects, and it only resolves `true` once the SDK
  // has actually initialized, so `ready` can never end up true with the
  // client still absent. If the dynamic import fails (e.g. an ad blocker),
  // it resolves `false` and `ready` simply stays false for the session,
  // which is a harmless no-op via the other capture functions' `client?.`
  // guards, rather than an unhandled rejection.
  const [ready, setReady] = useState(false);

  // Init once, on the client only.
  useEffect(() => {
    if (started.current || !isAnalyticsEnabled()) return;
    started.current = true;
    void initAnalytics(buildSuperProperties({ locale, appVersion: __APP_VERSION__ })).then(
      (initialized) => {
        if (initialized) setReady(true);
      }
    );
  }, [locale]);

  // Pageviews, filtered through the allowlist in policy.ts. Gated on `ready`
  // so the first pageview fires once init resolves rather than being dropped.
  useEffect(() => {
    if (!ready || !isAnalyticsEnabled()) return;
    if (!shouldTrackPath(pathname)) return;
    capturePageview(pathname);
  }, [pathname, ready]);

  // Identity. Opaque ids and counts only.
  useEffect(() => {
    if (!isAnalyticsEnabled() || !identity) return;
    if (identified.current === identity.userId) return;
    identified.current = identity.userId;
    identifyUser(identity.userId, { role: identity.role });
    if (identity.businessId) {
      setGroup('business', identity.businessId, { outlet_count: identity.outletCount });
    }
  }, [identity]);

  // Reset on sign-out. Watching the auth transition covers all three signOut
  // call sites without touching any of them.
  useEffect(() => {
    if (!isAnalyticsEnabled()) return;
    if (wasAuthenticated.current && !isAuthenticated) {
      identified.current = null;
      resetAnalytics();
    }
    wasAuthenticated.current = isAuthenticated;
  }, [isAuthenticated]);

  // Reset on cashier switch. active-cashier.ts already broadcasts this event.
  useEffect(() => {
    if (!isAnalyticsEnabled()) return;
    function onCashierChange(): void {
      if (window.localStorage.getItem(CASHIER_STORAGE_KEY) === null) {
        identified.current = null;
        resetAnalytics();
      }
    }
    window.addEventListener(CASHIER_CHANGE_EVENT, onCashierChange);
    return () => window.removeEventListener(CASHIER_CHANGE_EVENT, onCashierChange);
  }, []);

  return null;
}
