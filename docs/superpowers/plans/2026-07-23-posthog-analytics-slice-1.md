# PostHog Analytics Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire PostHog into the marketing surface with explicit events only, pseudonymous identity, and a hard no-op when no key is configured.

**Architecture:** All decisions live in pure functions in `src/lib/analytics/` so they are unit-testable; `posthog-js` is isolated behind one module that lazy-imports it; a thin React provider in `__root.tsx` drives the lifecycle. Feature code only ever imports `track()`.

**Tech Stack:** TanStack Start, React 19, Convex, `posthog-js`, Vitest (edge-runtime), Biome, Lingui.

**Design doc:** `docs/superpowers/specs/2026-07-23-posthog-analytics-design.md`

## Global Constraints

- **No autocapture, no session recording.** `autocapture: false`, `disable_session_recording: true`. The POS displays customer names, phone numbers and order values.
- **No PII, ever.** Never send email, name or phone as a property. Identity is `identify(user._id)` plus `group('business', businessId)`.
- **Persistence is `localStorage`**, never `localStorage+cookie`. The published privacy policy states we set no third-party tracking cookies.
- **The no-key path is a true no-op.** With `VITE_POSTHOG_KEY` unset, `posthog-js` must never be imported and no network request may be made. CI and the existing 1044 tests must be unaffected.
- **Production stays disabled.** This slice ships inert. Do **not** set `VITE_POSTHOG_KEY` in the Cloudflare dashboard — that happens only after the separate privacy-policy update lands.
- **Test environment is `edge-runtime`** and Vitest only picks up `tests/**/*.test.ts` and `src/**/*.test.ts` — `.tsx` files are not collected and there is no testing-library or jsdom. Component tests are not possible; put logic in `.ts` modules and keep `.tsx` a shell.
- **No em-dash or `--` in user-facing copy.** This plan adds no user-facing strings, so no Lingui extract is needed.
- **Property values come from closed sets.** Never send a raw error string; it can contain the email the user typed.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/analytics/events.ts` | The typed event registry. Single source of truth for names and property shapes. |
| `src/lib/analytics/policy.ts` | Pure decisions: which paths are tracked, the new-account heuristic, super-property assembly. Fully unit-tested. |
| `src/lib/analytics/client.ts` | The only module that touches `posthog-js`. Lazy import, init, capture, identify, group, reset. |
| `src/lib/analytics/track.ts` | The typed facade feature code imports. |
| `src/components/analytics-provider.tsx` | React lifecycle shell: init, pageviews, identity, reset. |
| `convex/users.ts` | Gains `analyticsIdentity`, the one query the provider needs. |

---

### Task 1: Event registry and tracking policy

**Files:**
- Create: `src/lib/analytics/events.ts`
- Create: `src/lib/analytics/policy.ts`
- Test: `tests/lib/analytics-policy.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `EventMap`, `EventName`, `CtaLocation`, `CtaLabel`, `AuthMethod`, `AuthFailureReason` from `events.ts`; `shouldTrackPath(pathname: string): boolean`, `isNewAccount(accountAgeMs: number): boolean`, `NEW_ACCOUNT_WINDOW_MS: number`, `buildSuperProperties(input: { locale: string; appVersion: string }): { locale: string; app_version: string; surface: 'public' }` from `policy.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/analytics-policy.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  buildSuperProperties,
  isNewAccount,
  NEW_ACCOUNT_WINDOW_MS,
  shouldTrackPath,
} from '../../src/lib/analytics/policy';

describe('shouldTrackPath', () => {
  it('tracks the marketing pages', () => {
    for (const path of ['/', '/signin', '/signup', '/changelog', '/privacy', '/terms']) {
      expect(shouldTrackPath(path)).toBe(true);
    }
  });

  it('ignores a trailing slash', () => {
    expect(shouldTrackPath('/signin/')).toBe(true);
    expect(shouldTrackPath('/')).toBe(true);
  });

  // These three are the privacy-critical exclusions from the design doc.
  it('never tracks the cafe customer self-order page', () => {
    expect(shouldTrackPath('/order/477289968ce6e4948622c74c87048c94')).toBe(false);
    expect(shouldTrackPath('/order')).toBe(false);
  });

  it('never tracks the unattended customer screens', () => {
    expect(shouldTrackPath('/menu-board')).toBe(false);
    expect(shouldTrackPath('/display')).toBe(false);
  });

  it('does not track authenticated surfaces in this slice', () => {
    for (const path of ['/dashboard', '/cashier', '/reservations', '/kitchen', '/admin/users']) {
      expect(shouldTrackPath(path)).toBe(false);
    }
  });

  it('default-denies an unknown route', () => {
    expect(shouldTrackPath('/some-route-added-next-week')).toBe(false);
  });
});

describe('isNewAccount', () => {
  it('treats a just-created account as new', () => {
    expect(isNewAccount(0)).toBe(true);
    expect(isNewAccount(NEW_ACCOUNT_WINDOW_MS - 1)).toBe(true);
  });

  it('treats an older account as returning', () => {
    expect(isNewAccount(NEW_ACCOUNT_WINDOW_MS)).toBe(false);
    expect(isNewAccount(86_400_000)).toBe(false);
  });

  it('treats clock skew as returning rather than new', () => {
    expect(isNewAccount(-5_000)).toBe(false);
  });
});

describe('buildSuperProperties', () => {
  it('emits snake_case keys and the public surface', () => {
    expect(buildSuperProperties({ locale: 'id', appVersion: '1.4.0' })).toEqual({
      locale: 'id',
      app_version: '1.4.0',
      surface: 'public',
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/lib/analytics-policy.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/lib/analytics/policy"`.

- [ ] **Step 3: Write `src/lib/analytics/events.ts`**

```typescript
/**
 * The event registry. Every tracked event and its property shape lives here.
 *
 * With autocapture off, every event name is written by hand. Without a central
 * type, names drift (`sale_completed` versus `saleCompleted`) and PostHog
 * treats those as different events, so funnels break silently while the
 * dashboard still renders. Compile-time checking is the cheap defence.
 *
 * Every property value comes from a closed set. Never widen one of these to
 * `string` and never pass a raw error message: those can contain whatever the
 * user typed, including their email address.
 */

/** The six marketing components that actually link to /signin. */
export type CtaLocation = 'header' | 'hero' | 'ai_spotlight' | 'pricing' | 'cta_band' | 'footer';

/**
 * A stable identifier, NOT the rendered button text. The rendered text is
 * translated, so using it would split every funnel by locale.
 */
export type CtaLabel = 'start_free' | 'sign_in';

export type AuthMethod = 'otp' | 'password' | 'google';

export type AuthFailureReason =
  | 'invalid_code'
  | 'invalid_password'
  | 'send_failed'
  | 'unknown';

export type EventMap = {
  marketing_cta_clicked: { location: CtaLocation; label: CtaLabel };
  auth_started: { method: AuthMethod };
  auth_code_sent: Record<string, never>;
  auth_completed: { method: AuthMethod; is_new_account: boolean };
  auth_failed: { method: AuthMethod; reason: AuthFailureReason };
};

export type EventName = keyof EventMap;
```

- [ ] **Step 4: Write `src/lib/analytics/policy.ts`**

```typescript
/**
 * Pure tracking decisions: no SDK, no React, no side effects.
 *
 * Everything decidable lives here rather than in the provider because the test
 * environment is edge-runtime and Vitest only collects `*.test.ts`, so there is
 * no way to test a `.tsx` component in this repo. Keeping the logic pure is what
 * makes the privacy-critical rules testable at all.
 */

/**
 * Slice 1 tracks the marketing surface only, expressed as an allowlist rather
 * than a blocklist. Default-deny means a route added next week is untracked
 * until someone deliberately adds it, which is the correct failure direction
 * for privacy.
 *
 * It also excludes, without having to name them:
 *   /order/$token  cafe end-customers, who have no relationship with kodapos
 *                  and never agreed to anything
 *   /menu-board    an unattended TV that would emit pageviews all day
 *   /display       the customer-facing second screen, same reasoning
 */
const MARKETING_PATHS: ReadonlySet<string> = new Set([
  '/',
  '/signin',
  '/signup',
  '/changelog',
  '/privacy',
  '/terms',
]);

export function shouldTrackPath(pathname: string): boolean {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return MARKETING_PATHS.has(path);
}

/**
 * Registration is implicit in the passwordless flow: the account is created on
 * the first successful verify, so the client cannot distinguish it from a
 * returning sign-in. Inferring it from the age of the user document is a
 * heuristic and is recorded as one in the design doc. A verify delayed past
 * this window is misclassified as a returning sign-in.
 */
export const NEW_ACCOUNT_WINDOW_MS = 60_000;

export function isNewAccount(accountAgeMs: number): boolean {
  return accountAgeMs >= 0 && accountAgeMs < NEW_ACCOUNT_WINDOW_MS;
}

export function buildSuperProperties(input: { locale: string; appVersion: string }): {
  locale: string;
  app_version: string;
  surface: 'public';
} {
  return { locale: input.locale, app_version: input.appVersion, surface: 'public' };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/lib/analytics-policy.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 6: Typecheck and lint**

Run: `pnpm typecheck && ./node_modules/.bin/biome check src/lib/analytics tests/lib/analytics-policy.test.ts`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/analytics/events.ts src/lib/analytics/policy.ts tests/lib/analytics-policy.test.ts
git commit -m "feat(analytics): add the event registry and tracking policy"
```

---

### Task 2: Convex identity query

**Files:**
- Modify: `convex/users.ts` (append a new query)
- Test: `tests/convex/analytics-identity.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `api.users.analyticsIdentity`, returning `{ userId: Id<'users'>; accountAgeMs: number; businessId: Id<'businesses'> | null; role: 'owner' | 'manager' | null; outletCount: number } | null`.

Note on `role`: this is `businessMembers.role` (`owner` | `manager`), deliberately **not** `cafeStaff.role` (`owner` | `cashier`). The latter is a per-outlet staff record tied to PIN sessions, not to the authenticated account. Mixing them would merge two different concepts under one property name.

- [ ] **Step 1: Write the failing test**

Create `tests/convex/analytics-identity.test.ts`:

```typescript
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

describe('users.analyticsIdentity', () => {
  it('returns null when signed out', async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.users.analyticsIdentity, {})).toBeNull();
  });

  it('returns the pseudonymous identity for a signed-in owner', async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' });
    });
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
    await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });

    const identity = await asOwner.query(api.users.analyticsIdentity, {});
    expect(identity).not.toBeNull();
    expect(identity?.userId).toBe(userId);
    expect(identity?.role).toBe('owner');
    expect(identity?.outletCount).toBe(1);
    expect(identity?.accountAgeMs).toBeGreaterThanOrEqual(0);
  });

  it('never returns personal data', async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' });
    });
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
    await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });

    const identity = await asOwner.query(api.users.analyticsIdentity, {});
    const keys = Object.keys(identity ?? {}).sort();
    expect(keys).toEqual(['accountAgeMs', 'businessId', 'outletCount', 'role', 'userId']);
    expect(JSON.stringify(identity)).not.toContain('o@x.com');
    expect(JSON.stringify(identity)).not.toContain('Owner');
    expect(JSON.stringify(identity)).not.toContain('Kopi Senja');
  });

  it('counts every outlet in the business', async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' });
    });
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
    await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
    const identity = await asOwner.query(api.users.analyticsIdentity, {});

    await t.run(async (ctx) => {
      await ctx.db.insert('cafes', {
        name: 'Kopi Senja 2',
        ownerUserId: userId,
        businessId: identity?.businessId ?? undefined,
        createdAt: Date.now(),
      });
    });

    const after = await asOwner.query(api.users.analyticsIdentity, {});
    expect(after?.outletCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/convex/analytics-identity.test.ts`
Expected: FAIL — `analyticsIdentity` does not exist on `api.users`.

- [ ] **Step 3: Append the query to `convex/users.ts`**

Add at the end of the file (`getAuthUserId`, `v`, `query` are already imported at the top):

```typescript
/**
 * The single query the analytics provider needs to identify a session.
 *
 * Deliberately returns opaque ids and counts only. No name, no email, no phone
 * ever leaves through this query, and the test asserts that. `role` is the
 * account-level businessMembers role (owner | manager), NOT cafeStaff.role
 * (owner | cashier), which is a per-outlet PIN record and a different concept.
 *
 * `accountAgeMs` rather than a boolean: the new-account threshold is a product
 * heuristic, so it lives in src/lib/analytics/policy.ts where it is unit-tested,
 * not baked into the backend.
 */
export const analyticsIdentity = query({
  args: {},
  returns: v.union(
    v.object({
      userId: v.id('users'),
      accountAgeMs: v.number(),
      businessId: v.union(v.id('businesses'), v.null()),
      role: v.union(v.literal('owner'), v.literal('manager'), v.null()),
      outletCount: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;

    const membership = await ctx.db
      .query('businessMembers')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();

    const businessId = membership?.businessId ?? null;
    const outlets = businessId
      ? await ctx.db
          .query('cafes')
          .withIndex('by_business', (q) => q.eq('businessId', businessId))
          .collect()
      : [];

    return {
      userId,
      accountAgeMs: Math.max(0, Date.now() - user._creationTime),
      businessId,
      role: membership?.role ?? null,
      outletCount: outlets.length,
    };
  },
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/convex/analytics-identity.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add convex/users.ts tests/convex/analytics-identity.test.ts
git commit -m "feat(analytics): add the pseudonymous identity query"
```

---

### Task 3: PostHog client and typed track facade

**Files:**
- Create: `src/lib/analytics/client.ts`
- Create: `src/lib/analytics/track.ts`
- Modify: `.env.example`
- Test: `tests/lib/analytics-client.test.ts`

**Interfaces:**
- Consumes: `EventMap`, `EventName` from Task 1.
- Produces: from `client.ts` — `isAnalyticsEnabled(): boolean`, `initAnalytics(superProps): Promise<void>`, `capture(name: string, props?: Record<string, unknown>): void`, `identifyUser(distinctId: string, props: Record<string, unknown>): void`, `setGroup(type: string, key: string, props: Record<string, unknown>): void`, `resetAnalytics(): void`, `capturePageview(path: string): void`. From `track.ts` — `track<K extends EventName>(name: K, props: EventMap[K]): void`.

- [ ] **Step 1: Install posthog-js**

Run: `pnpm add posthog-js`
Expected: adds `posthog-js` to `dependencies`.

- [ ] **Step 2: Write the failing test**

Create `tests/lib/analytics-client.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { isAnalyticsEnabled } from '../../src/lib/analytics/client';

describe('isAnalyticsEnabled', () => {
  // The whole integration is env-gated. With no key configured, posthog-js is
  // never imported and no request is made, which is what keeps CI and the
  // existing suite unaffected and what lets this slice ship to production inert.
  it('is disabled when no key is configured', () => {
    expect(import.meta.env.VITE_POSTHOG_KEY ?? '').toBe('');
    expect(isAnalyticsEnabled()).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/lib/analytics-client.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/lib/analytics/client"`.

- [ ] **Step 4: Write `src/lib/analytics/client.ts`**

```typescript
/**
 * The only module in the app that touches posthog-js.
 *
 * Everything else goes through track.ts, so swapping providers or adding a
 * reverse proxy later changes this file alone.
 *
 * posthog-js is imported lazily and only when a key is configured. With the key
 * unset nothing is imported and no network request is made, so local dev, CI
 * and the existing test suite are completely unaffected. That is also what lets
 * this slice ship to production inert while the privacy policy is updated
 * separately.
 */
import type { PostHog } from 'posthog-js';

let client: PostHog | null = null;

function key(): string {
  return import.meta.env.VITE_POSTHOG_KEY ?? '';
}

function host(): string {
  return import.meta.env.VITE_POSTHOG_HOST ?? 'https://us.i.posthog.com';
}

export function isAnalyticsEnabled(): boolean {
  return typeof window !== 'undefined' && key().length > 0;
}

export async function initAnalytics(superProps: Record<string, string>): Promise<void> {
  if (!isAnalyticsEnabled() || client) return;
  const { default: posthog } = await import('posthog-js');
  posthog.init(key(), {
    api_host: host(),
    // Explicit events only. The POS shows customer names, phone numbers and
    // order values; autocapture and session recording would scrape them.
    autocapture: false,
    disable_session_recording: true,
    // Pageviews are emitted by hand from the provider so the exclusion list in
    // policy.ts is enforced. PostHog's own automatic pageview would bypass it.
    capture_pageview: false,
    capture_pageleave: false,
    // localStorage rather than localStorage+cookie: the published privacy
    // policy states we set no third-party tracking cookies.
    persistence: 'localStorage',
  });
  posthog.register(superProps);
  client = posthog;
}

export function capture(name: string, props?: Record<string, unknown>): void {
  client?.capture(name, props);
}

export function capturePageview(path: string): void {
  client?.capture('$pageview', { $current_url: path });
}

export function identifyUser(distinctId: string, props: Record<string, unknown>): void {
  client?.identify(distinctId, props);
}

export function setGroup(type: string, groupKey: string, props: Record<string, unknown>): void {
  client?.group(type, groupKey, props);
}

/**
 * Clears the current identity. Called on sign-out and on cashier switch.
 *
 * This is a correctness requirement, not hygiene: the POS runs on shared
 * tablets with an explicit "Ganti kasir" flow, so without a reset every
 * subsequent cashier inherits the first one's distinct id and all per-user
 * figures become fiction.
 */
export function resetAnalytics(): void {
  client?.reset();
}
```

- [ ] **Step 5: Write `src/lib/analytics/track.ts`**

```typescript
/**
 * The public tracking API. Feature code imports this and nothing else from
 * the analytics module.
 *
 * The generic ties each event name to its property shape from the registry, so
 * a typo in a name or a missing property is a compile error rather than a
 * silently broken funnel.
 */
import { capture } from './client';
import type { EventMap, EventName } from './events';

export function track<K extends EventName>(name: K, props: EventMap[K]): void {
  capture(name, props);
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/lib/analytics-client.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 7: Update `.env.example`**

Replace the PostHog block with:

```
# PostHog (analytics). Leave BLANK to disable: with no key, posthog-js is never
# imported and no request is made.
# Do not set this in production until the privacy policy has been updated to
# disclose PostHog as a processor. See
# docs/superpowers/specs/2026-07-23-posthog-analytics-design.md
VITE_POSTHOG_KEY=
VITE_POSTHOG_HOST=https://us.i.posthog.com
```

- [ ] **Step 8: Verify the whole suite still passes**

Run: `pnpm test`
Expected: 115 test files, 1059 tests passing (baseline 112/1044, plus 10 policy, 4 identity, 1 client). No new network activity.

- [ ] **Step 9: Commit**

```bash
git add src/lib/analytics/client.ts src/lib/analytics/track.ts tests/lib/analytics-client.test.ts .env.example package.json pnpm-lock.yaml
git commit -m "feat(analytics): add the PostHog client and typed track facade"
```

---

### Task 4: Analytics provider

**Files:**
- Create: `src/components/analytics-provider.tsx`
- Modify: `src/routes/__root.tsx`

**Interfaces:**
- Consumes: `initAnalytics`, `capturePageview`, `identifyUser`, `setGroup`, `resetAnalytics`, `isAnalyticsEnabled` from Task 3; `shouldTrackPath`, `isNewAccount`, `buildSuperProperties` from Task 1; `api.users.analyticsIdentity` from Task 2.
- Produces: `<AnalyticsProvider />`, a component rendering nothing.

Two lifecycle notes that shape the implementation:

**Sign-out needs no call-site changes.** There are three `signOut()` call sites (`nav-user.tsx`, `admin-top-bar.tsx`, `no-access.tsx`). Rather than patch each, the provider watches `useConvexAuth().isAuthenticated` and resets on the true-to-false transition, which covers all three and any added later.

**Cashier switch needs no call-site changes either.** `src/lib/active-cashier.ts` already dispatches a `kodapos:active-cashier-change` DOM event on this tab whenever the cashier is set or cleared. The provider listens for it and resets when the stored id has gone.

- [ ] **Step 1: Write `src/components/analytics-provider.tsx`**

```typescript
'use client';

import { useConvexAuth, useQuery } from 'convex/react';
import { useEffect, useRef } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useLocale } from '~/components/locale-provider';
import {
  capturePageview,
  identifyUser,
  initAnalytics,
  isAnalyticsEnabled,
  resetAnalytics,
  setGroup,
} from '~/lib/analytics/client';
import { buildSuperProperties, shouldTrackPath } from '~/lib/analytics/policy';

const CASHIER_STORAGE_KEY = 'kodapos.activeCashierId';
const CASHIER_CHANGE_EVENT = 'kodapos:active-cashier-change';

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

  // Init once, on the client only.
  useEffect(() => {
    if (started.current || !isAnalyticsEnabled()) return;
    started.current = true;
    void initAnalytics(buildSuperProperties({ locale, appVersion: __APP_VERSION__ }));
  }, [locale]);

  // Pageviews, filtered through the allowlist in policy.ts.
  useEffect(() => {
    if (!isAnalyticsEnabled()) return;
    if (!shouldTrackPath(pathname)) return;
    capturePageview(pathname);
  }, [pathname]);

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
```

- [ ] **Step 2: Mount it in `src/routes/__root.tsx`**

Add the import alongside the existing component imports:

```typescript
import { AnalyticsProvider } from '~/components/analytics-provider';
```

Then place it inside `ConvexAuthProvider`, as a sibling of `<Outlet />`, so it can read auth state:

```tsx
<I18nProvider i18n={i18n}>
  <LocaleProvider>
    <ConvexAuthProvider client={convex} storage={authStorage}>
      <AnalyticsProvider />
      <Outlet />
    </ConvexAuthProvider>
  </LocaleProvider>
</I18nProvider>
```

- [ ] **Step 3: Typecheck, lint and build**

Run: `pnpm typecheck && ./node_modules/.bin/biome check src/components/analytics-provider.tsx && pnpm build`
Expected: no errors, build succeeds.

- [ ] **Step 4: Verify the disabled path by hand**

With `VITE_POSTHOG_KEY` blank in `.env.local`, run `pnpm dev`, open `http://localhost:5173/`, and check the Network tab.
Expected: no request to any PostHog host, and no `posthog-js` chunk fetched.

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`
Expected: 1059 tests passing, unchanged from Task 3. This task adds no tests, since .tsx files are not collected.

- [ ] **Step 6: Commit**

```bash
git add src/components/analytics-provider.tsx src/routes/__root.tsx
git commit -m "feat(analytics): add the provider driving init, pageviews and identity"
```

---

### Task 5: Marketing CTA events

**Files:**
- Modify: `src/components/marketing/marketing-header.tsx`
- Modify: `src/components/marketing/hero.tsx`
- Modify: `src/components/marketing/ai-spotlight.tsx`
- Modify: `src/components/marketing/pricing.tsx`
- Modify: `src/components/marketing/cta-band.tsx`
- Modify: `src/components/marketing/marketing-footer.tsx`

**Interfaces:**
- Consumes: `track` from Task 3, `CtaLocation` and `CtaLabel` from Task 1.
- Produces: no new exports.

These six files are exactly the components containing a `to="/signin"` link, verified with `grep -rl 'to="/signin"' src/components/marketing/`. If a seventh appears, add it to `CtaLocation` in `events.ts` first so the type still covers reality.

- [ ] **Step 1: Add the handler to each CTA link**

In each file, import the tracker:

```typescript
import { track } from '~/lib/analytics/track';
```

Then add an `onClick` to every `<Link to="/signin">`, using that file's location value from the table below. Example, for the hero:

```tsx
<Link
  to="/signin"
  onClick={() => track('marketing_cta_clicked', { location: 'hero', label: 'start_free' })}
>
```

Location value per file:

| File | `location` |
|---|---|
| `marketing-header.tsx` | `header` |
| `hero.tsx` | `hero` |
| `ai-spotlight.tsx` | `ai_spotlight` |
| `pricing.tsx` | `pricing` |
| `cta-band.tsx` | `cta_band` |
| `marketing-footer.tsx` | `footer` |

For `label`, use `sign_in` where the link's visible text is the sign-in action, and `start_free` for every primary conversion CTA. Do not derive the label from the rendered text: it is translated, and using it would split the funnel by locale.

- [ ] **Step 2: Verify every CTA is covered**

Run: `grep -c 'marketing_cta_clicked' src/components/marketing/*.tsx | grep -v ':0'`
Expected: all six files listed, with a count matching the number of `to="/signin"` links each contains. Cross-check with `grep -c 'to="/signin"' src/components/marketing/*.tsx`.

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm typecheck && ./node_modules/.bin/biome check src/components/marketing`
Expected: no errors. A wrong `location` string is a compile error, since `CtaLocation` is a closed union.

- [ ] **Step 4: Commit**

```bash
git add src/components/marketing
git commit -m "feat(analytics): track marketing sign-in CTA clicks"
```

---

### Task 6: Auth funnel events

**Files:**
- Modify: `src/routes/_public/signin.tsx`
- Modify: `src/components/analytics-provider.tsx`
- Create: `src/lib/analytics/auth-method.ts`
- Test: `tests/lib/analytics-auth-method.test.ts`

**Interfaces:**
- Consumes: `track` from Task 3, `AuthMethod` from Task 1, `isNewAccount` from Task 1.
- Produces: `rememberAuthMethod(method: AuthMethod): void`, `takeAuthMethod(): AuthMethod | null` from `auth-method.ts`.

**Why the completion event does not live in `signin.tsx`.** Google sign-in leaves the page and returns via redirect, so no handler in `signin.tsx` ever observes its success. Firing `auth_completed` from the provider on the unauthenticated-to-authenticated transition handles all three methods uniformly. The method is carried across the redirect in `sessionStorage`, written when the attempt starts and consumed once on completion.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/analytics-auth-method.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rememberAuthMethod, takeAuthMethod } from '../../src/lib/analytics/auth-method';

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal('window', {
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
});

describe('auth method handoff', () => {
  it('round-trips a remembered method', () => {
    rememberAuthMethod('google');
    expect(takeAuthMethod()).toBe('google');
  });

  it('consumes the value so a later sign-in is not misattributed', () => {
    rememberAuthMethod('otp');
    expect(takeAuthMethod()).toBe('otp');
    expect(takeAuthMethod()).toBeNull();
  });

  it('returns null when nothing was remembered', () => {
    expect(takeAuthMethod()).toBeNull();
  });

  it('rejects a value that is not a known method', () => {
    store.set('kodapos.analytics.authMethod', 'carrier_pigeon');
    expect(takeAuthMethod()).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/lib/analytics-auth-method.test.ts`
Expected: FAIL — cannot resolve `auth-method`.

- [ ] **Step 3: Write `src/lib/analytics/auth-method.ts`**

```typescript
/**
 * Carries the auth method across a sign-in attempt.
 *
 * Google sign-in leaves the page and returns by redirect, so no handler in
 * signin.tsx observes its success. The provider fires auth_completed on the
 * auth transition instead, and reads the method from here.
 *
 * sessionStorage rather than localStorage: this is scoped to one attempt in one
 * tab, and must not outlive the browser session.
 */
import type { AuthMethod } from './events';

const KEY = 'kodapos.analytics.authMethod';
const VALID: readonly AuthMethod[] = ['otp', 'password', 'google'];

export function rememberAuthMethod(method: AuthMethod): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(KEY, method);
}

/** Reads and clears, so a later sign-in is never misattributed to this method. */
export function takeAuthMethod(): AuthMethod | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(KEY);
  window.sessionStorage.removeItem(KEY);
  return VALID.includes(raw as AuthMethod) ? (raw as AuthMethod) : null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/lib/analytics-auth-method.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Add the start, sent and failure events to `signin.tsx`**

Add the imports:

```typescript
import { rememberAuthMethod } from '~/lib/analytics/auth-method';
import { track } from '~/lib/analytics/track';
```

In `onGoogle` (around line 221), before `void signIn('google')`:

```typescript
rememberAuthMethod('google');
track('auth_started', { method: 'google' });
```

In `onPasswordSubmit` (around line 232), after the validation guard and before the `try`:

```typescript
rememberAuthMethod('password');
track('auth_started', { method: 'password' });
```

In its `catch` (around line 250), alongside `setAuthError`:

```typescript
track('auth_failed', { method: 'password', reason: 'invalid_password' });
```

In `onSendCode` (around line 257), before the `try`:

```typescript
rememberAuthMethod('otp');
track('auth_started', { method: 'otp' });
```

After the successful send (around line 271, alongside `setInfo(t\`Kode dikirim ke email Anda.\`)`):

```typescript
track('auth_code_sent', {});
```

In its `catch` (around line 291, alongside `setAuthError`):

```typescript
track('auth_failed', { method: 'otp', reason: 'send_failed' });
```

In `onOtpComplete` (around line 319), in the `catch`:

```typescript
track('auth_failed', { method: 'otp', reason: 'invalid_code' });
```

Never pass the caught error into a property. The closed `AuthFailureReason` union makes that a compile error, which is the point.

- [ ] **Step 6: Fire the completion event from the provider**

In `src/components/analytics-provider.tsx`, extend the imports:

```typescript
import { takeAuthMethod } from '~/lib/analytics/auth-method';
import { track } from '~/lib/analytics/track';
import { buildSuperProperties, isNewAccount, shouldTrackPath } from '~/lib/analytics/policy';
```

Then replace the identity effect with one that also reports completion. `identity` arriving is the first moment both the method and the account age are known:

```typescript
  // Identity, plus the completion event. Firing here rather than in signin.tsx
  // is what makes Google work: it returns by redirect, so no handler there ever
  // sees its success.
  useEffect(() => {
    if (!isAnalyticsEnabled() || !identity) return;
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
  }, [identity]);
```

- [ ] **Step 7: Typecheck, lint and full suite**

Run: `pnpm typecheck && ./node_modules/.bin/biome check src convex && pnpm test`
Expected: no new errors; 116 test files, 1063 tests passing.

- [ ] **Step 8: Commit**

```bash
git add src/lib/analytics/auth-method.ts tests/lib/analytics-auth-method.test.ts src/routes/_public/signin.tsx src/components/analytics-provider.tsx
git commit -m "feat(analytics): track the auth funnel"
```

---

## Manual verification before opening the PR

The disabled path is the only one CI can prove. Verify the enabled path locally, never against production:

- [ ] Put a real key in `.env.local` only. Do **not** set it in the Cloudflare dashboard.
- [ ] `pnpm dev`, then load `/`, click a hero CTA, and complete an OTP sign-in.
- [ ] In PostHog's live events view, confirm the funnel: `$pageview /`, `marketing_cta_clicked`, `$pageview /signin`, `auth_started`, `auth_code_sent`, `auth_completed`.
- [ ] Confirm every event carries `locale`, `app_version` and `surface`.
- [ ] Confirm the person has `role` and no email, name or phone.
- [ ] Load `/menu-board` and `/display`, and open a `/order/<token>` link. Confirm **no** events are emitted from any of them. This is the privacy-critical check.
- [ ] Sign out, then sign in as a different user. Confirm the second session is a distinct person, not a continuation of the first.
- [ ] Blank the key again before committing anything.

## Definition of done

- All six tasks committed, `pnpm typecheck`, `pnpm test` and `pnpm build` green.
- No new Biome findings beyond those already present on main.
- `VITE_POSTHOG_KEY` unset everywhere except a local `.env.local`, so production remains inert.
- The PR body states that enablement is blocked on the privacy-policy update.
