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
import { takeAuthMethod } from '~/lib/analytics/auth-method';
import {
  capturePageview,
  identifyUser,
  initAnalytics,
  isAnalyticsEnabled,
  registerSuperProperties,
  resetAnalytics,
  setGroup,
} from '~/lib/analytics/client';
import {
  buildSuperProperties,
  isCustomerSurface,
  isNewAccount,
  shouldTrackPath,
} from '~/lib/analytics/policy';
import { track } from '~/lib/analytics/track';

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
  // Gated on isAnalyticsEnabled(), not just isAuthenticated: without a key
  // configured this otherwise opened a live Convex subscription (reads
  // users, scans businessMembers, collects every cafes row, re-running on
  // any write in that read set) on every authenticated client, indefinitely,
  // for a feature that is switched off.
  const identity = useQuery(
    api.users.analyticsIdentity,
    isAuthenticated && isAnalyticsEnabled() ? {} : 'skip'
  );

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

  // Init once, on the client only. Never on a cafe-customer surface: those
  // people have no relationship with kodapos and never agreed to anything,
  // and initAnalytics alone (no events required) already writes a
  // persistent distinct_id and talks to PostHog. An allowlist can't cover
  // this decision because Google sign-in returns to `/` and only reaches
  // `/dashboard` after the router has already navigated away from it.
  useEffect(() => {
    if (started.current || !isAnalyticsEnabled() || isCustomerSurface(pathname)) return;
    started.current = true;
    void initAnalytics(buildSuperProperties({ locale, appVersion: __APP_VERSION__ })).then(
      (initialized) => {
        if (initialized) setReady(true);
      }
    );
  }, [locale, pathname]);

  // Pageviews, filtered through the allowlist in policy.ts. Gated on `ready`
  // so the first pageview fires once init resolves rather than being dropped.
  useEffect(() => {
    if (!ready || !isAnalyticsEnabled()) return;
    if (!shouldTrackPath(pathname)) return;
    capturePageview(pathname);
  }, [pathname, ready]);

  // Re-registers the super properties whenever `locale` changes. LocaleProvider
  // deliberately mounts at DEFAULT_LOCALE ('en') and only reads the stored
  // locale in an effect of its own; React runs child effects before parent
  // effects, so the init effect above always registers with the wrong locale
  // on first run. Without this, `started.current` is already true by the
  // time the real locale is known, so the `[locale]` dependency on the init
  // effect can never fire it again, and every event from every user reports
  // locale: 'en' for the rest of the session.
  useEffect(() => {
    if (!ready) return;
    registerSuperProperties(buildSuperProperties({ locale, appVersion: __APP_VERSION__ }));
  }, [locale, ready]);

  // Identity, plus the completion event. Firing here rather than in
  // signin.tsx is what makes Google work: it returns by redirect, so no
  // handler there ever sees its success. Opaque ids and counts only.
  //
  // Gated on `ready`, not just isAnalyticsEnabled(): without it, if `identity`
  // resolves before the dynamic import in initAnalytics does, this effect
  // still marks `identified.current` and consumes takeAuthMethod() while
  // identifyUser/setGroup/track silently no-op against a null client. The
  // guard above then blocks re-entry forever and the auth method is already
  // gone, so the session stays anonymous and the conversion is lost with no
  // way to retry or observe it.
  useEffect(() => {
    if (!ready || !isAnalyticsEnabled() || !identity) return;
    if (identified.current === identity.userId) return;
    identified.current = identity.userId;
    identifyUser(identity.userId, { role: identity.role });
    if (identity.businessId) {
      setGroup('business', identity.businessId, { outlet_count: identity.outletCount });
    }

    const method = takeAuthMethod();
    if (method) {
      track('auth_completed', {
        method,
        is_new_account: isNewAccount(identity.accountAgeMs),
      });
    }
  }, [identity, ready]);

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
