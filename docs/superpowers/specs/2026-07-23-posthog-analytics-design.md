# PostHog analytics, design

**Date:** 2026-07-23
**Status:** Approved, ready for planning
**Slice:** 1 of 3 (foundation + marketing funnel)

## Background

Analytics were scoped in Phase 0 and deferred. `docs/superpowers/plans/2026-05-14-phase-0-foundations.md` Task 17 was skipped on 2026-05-20 with the reasoning: "at zero traffic the data is noise. Revisit before broader beta launch."

`.env.example` still carries the placeholders from that task:

```
VITE_POSTHOG_KEY=
VITE_POSTHOG_HOST=https://app.posthog.com
```

Nothing reads them. There is no analytics package installed and no tracking code anywhere in the app.

The Phase 0 sketch is stale and must not be followed. It patches `src/client.tsx`, which no longer exists in this version of TanStack Start, and it configures `persistence: 'localStorage+cookie'`, which conflicts with the published privacy policy (see Constraints).

## Goals

Answer three questions, in three slices sharing one foundation:

1. **Marketing funnel** (this slice) — do visitors reach sign-up, and where do they drop?
2. **Activation** (slice 2) — do new cafes reach their first sale?
3. **Feature usage** (slice 3) — which of the shipped features see real use?

This slice delivers the foundation plus the marketing funnel, so data is flowing and verifiable before a twenty-feature taxonomy is committed to.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Collection mode | Explicit events only | No autocapture, no session recording. The POS displays customer names, phone numbers and order values; explicit-only removes any path for that to reach PostHog by accident. |
| Identity | Pseudonymous | `identify(user._id)` + `group('business', businessId)`. Never email, name or phone. Cross-reference ids in Convex when a human needs to act on a result. |
| Project | Pre-existing | The owner supplies key and host. They are set in `.env.local` locally and the Cloudflare dashboard in production, per the existing CD setup. |
| Ingestion | Direct | No reverse proxy. Loses ad-blocked traffic, which mostly affects marketing; cafe staff on POS tablets rarely run blockers. Adding a proxy later touches one module. |
| Persistence | `localStorage` | Not the Phase 0 sketch's `localStorage+cookie`. Avoids setting third-party cookies, narrowing the gap with the published privacy policy. |

## Constraints

### The privacy policy currently forbids this

`src/content/legal/privacy.ts` states, in both locales, under the `cookies` section:

> "We do not use third party advertising or tracking cookies."
> "Kami tidak menggunakan cookie iklan atau pelacakan pihak ketiga."

The policy is explicitly framed against UU PDP. Shipping PostHog makes that sentence false.

**Handled as separate work, not in this slice.** This is not a legal opinion, and the wording should be reviewed by someone qualified, including on whether UU PDP requires consent for this processing.

**Enablement condition.** Because the integration is env-gated, this slice ships to production with no key set and therefore fully inert. PostHog is enabled by setting `VITE_POSTHOG_KEY` in the Cloudflare dashboard, and that must not happen until the privacy policy update has landed. The two pieces of work stay independent, and the published statement is never false in production.

### Surfaces excluded from all tracking

| Route | Why excluded |
|---|---|
| `/order/$token` | The QR self-order page, used by cafe end-customers who have no relationship with kodapos and never agreed to anything. Tracking them is a categorically different decision from tracking prospects. |
| `/menu-board` | An unattended TV screen that sits powered-on in a cafe all day. Would emit pageviews indefinitely and inflate every metric. |
| `/display` | The customer-facing second screen. Same reasoning. |

`_pos` and `_admin` are also untracked in this slice; they arrive in slices 2 and 3.

## Architecture

Four modules, each with a single responsibility:

| Module | Responsibility |
|---|---|
| `src/lib/analytics/client.ts` | Owns `posthog-js`. Init, the no-op path, the low-level capture call. The only module that imports the SDK. |
| `src/lib/analytics/events.ts` | The typed event registry: a discriminated union of every event name and its properties. Single source of truth for the taxonomy. |
| `src/lib/analytics/track.ts` | The public API. `track(event)`, typed against the registry. The only module feature code imports. |
| `src/components/analytics-provider.tsx` | Lifecycle. Mounted in `__root.tsx`. Init, pageviews, identify, group, reset. |

Feature code depends only on `track.ts` and the event union. Swapping providers, or adding the reverse proxy later, touches `client.ts` alone.

### Why a typed registry

With autocapture off, every event name is written by hand. Without a central union type, names drift (`sale_completed` versus `saleCompleted`), and PostHog treats those as distinct events. Funnels then break silently, which is the worst failure mode in analytics: the dashboard still renders, it is just wrong. Compile-time checking is cheap insurance against that.

### SSR safety

`posthog-js` is browser-only and `__root.tsx` renders on the server. Init happens in an effect inside the provider, never at module scope, and `client.ts` guards every entry point on `typeof window`.

### The no-key path is a true no-op

With `VITE_POSTHOG_KEY` unset, `posthog-js` is never imported and no network request is made. Local development, CI and the existing 1044-test suite are unaffected. This is also what makes the enablement condition above work.

### Identity lifecycle

`identify(user._id)` and `group('business', businessId)` when auth resolves.

Person properties are limited to `role`, taken from `businessMembers.role` (`owner` or `manager`). This is deliberately **not** `cafeStaff.role` (`owner` or `cashier`), which is a per-outlet staff record tied to PIN sessions rather than to the authenticated account. Sending the wrong one would silently mix two different concepts under one property name.

Group properties are limited to `outlet_count`, the number of `cafes` rows belonging to the business. (Outlets are the `cafes` table; there is no `outlets` table.)

No `plan` property. There is no plan or subscription concept in the schema, and pricing is still advertised as "coming soon". It gets added when billing does, not before.

`reset()` fires on both sign-out **and** cashier switch. This is a correctness requirement rather than hygiene: the POS runs on shared tablets and has an explicit "Switch cashier" flow, so without a reset every cashier inherits the first one's identity and per-user figures become fiction.

## Event catalog

### Super properties

Attached to every event:

- `app_version` — correlate regressions with releases
- `locale` — `id` or `en`
- `surface` — `public` in this slice; `pos` and `admin` follow

### Automatic

`$pageview` on marketing routes only, subject to the exclusion list above.

### Custom events

| Event | Properties | Fires when |
|---|---|---|
| `marketing_cta_clicked` | `location`, `label` | A sign-in CTA is clicked |
| `auth_started` | `method` | User submits email, or taps Google |
| `auth_code_sent` | none | OTP email dispatched |
| `auth_completed` | `method`, `is_new_account` | Sign-in succeeds |
| `auth_failed` | `method`, `reason` | Attempt fails |

All property values come from closed sets. No free text.

- `location`: `header` | `hero` | `ai_spotlight` | `pricing` | `cta_band` | `footer`. These are the six components that actually link to `/signin`, verified against the source rather than assumed.
- `label`: a stable identifier such as `start_free` or `sign_in`. **Not** the rendered button text, which is translated and would split every funnel by locale.
- `method`: `otp` | `password` | `google`
- `reason`: `invalid_code` | `invalid_password` | `send_failed` | `unknown`. Never the raw error string, which can contain the email the user typed.

### The funnel

```
$pageview /  →  marketing_cta_clicked  →  $pageview /signin
             →  auth_started  →  auth_code_sent  →  auth_completed
```

Registration is `auth_completed` where `is_new_account` is true.

### Known heuristic: `is_new_account`

Registration is implicit in the passwordless flow: the account is created on first successful verify, and the client cannot currently distinguish that from a returning sign-in. The cheapest signal is comparing the authenticated user's `_creationTime` against the current time, treating under sixty seconds as new.

This is a heuristic and is recorded as one. It will misclassify a user whose verification is delayed past the threshold. If it proves unreliable in practice, the alternative is returning an explicit flag from the auth mutation, which is more accurate and more invasive.

## Testing

| Area | Test |
|---|---|
| No-key path | With no key set, nothing is imported and no request is made. This is the test that keeps CI and the existing suite honest. |
| Registry | Events serialise as expected; closed value sets are enforced by the type system. |
| Identity lifecycle | identify and group fire on auth resolve with the right ids and no PII, and `role` comes from `businessMembers`, not `cafeStaff`. |
| Reset | `reset()` fires on sign-out and on cashier switch. This is the correctness risk, so it gets a dedicated test. |
| Exclusions | No pageview is emitted on `/order/$token`, `/menu-board` or `/display`. |

## Out of scope

- Privacy policy update (separate work; gates production enablement)
- Slices 2 and 3, activation and feature usage
- Reverse proxy for ad-blocked traffic
- Session recording, autocapture, feature flags, A/B testing
- Any tracking of cafe end-customers
