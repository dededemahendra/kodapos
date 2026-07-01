# Passwordless-first account flow — design

Date: 2026-06-30
Branch: `feat/passwordless-first-signin`

## Summary

Make passwordless (emailed 8-digit code) the single front door for both
registration and sign-in. A new email entering a valid code *is* registration —
Convex Auth's `resend-otp` provider already auto-creates an account on first
verified code, exactly like Google sign-in already does. This lets us delete the
separate `/signup` page. Password becomes fully optional and is set later in
Settings (a separate fast-follow slice, not this one).

## Goals

- One page (`/signin`) for register + sign-in, passwordless by default.
- Remove `/signup`; repoint all marketing CTAs and redirect the old route.
- A brand-new (cafe-less) user lands straight in the onboarding wizard, which
  collects owner name + cafe name + Terms acceptance.

## Non-goals (this slice)

- Setting/changing a password in Settings. Deferred to a fast-follow because in
  Convex Auth accounts are per-provider: an OTP-only user has a `resend-otp`
  account, not a `password` one, so the existing reset flow cannot set a first
  password. Linking a Password credential to an existing user needs a small
  backend spike. Password stays optional; OTP-only is a complete experience.
- Removing the Password provider. Existing password users keep working; the
  password mode stays reachable on `/signin` behind the "Pakai sandi" link.

## Prerequisite (blocking)

`RESEND_API_KEY` MUST be set on the Convex deployment(s). With OTP as the only
front door for new users, a missing key means nobody can register or sign in.
This is the "Could not send the code. Email may not be configured" error seen in
testing. `RESEND_FROM` (`kodapos <no-reply@send.kodapos.app>`) and `SITE_URL`
are already set on dev; all three must also be set on prod with `--prod`.

## Current state (what already exists)

- `convex/auth.ts`: Password + Google + `ResendOTP` (passwordless 8-digit code +
  magic link) all wired. No backend auth change needed for this slice.
- `src/routes/_public/signin.tsx`: already defaults to the `otp` mode (done on
  this branch). Has `password`, `otp`, `reset` modes + magic-link handler.
- `src/routes/_pos.tsx` `OnboardingGate`: an authenticated user with
  `cafe === null` (after `acceptPendingInvites` runs) currently renders
  `<NoAccess />`. A user with a cafe but no `setupCompletedAt` is routed to
  `/onboarding/profile`.
- `src/components/onboarding/steps/profile-step.tsx`: already auto-creates a
  placeholder cafe (`createForOwner({ name: 'Kafe Saya' })`) when `cafe === null`,
  then `CafeProfileForm` collects the cafe name. It does NOT collect owner name.
- `convex/users.ts` `hello`: reads `users.name`, falls back to "kawan".

## Design

### 1. Routing: cafe-less user → wizard (not no-access)

In `OnboardingGate` (`src/routes/_pos.tsx`), replace the auto `<NoAccess />`
branch for `cafe === null` with a redirect to `/onboarding/profile`:

- Before: `if (cafe === null && !alreadyOnOnboarding) return <NoAccess />;`
- After: a cafe-less, signed-in user (after `acceptPendingInvites` has run) is
  redirected to `/onboarding/profile`. Invited managers already have a non-null
  cafe by this point, so only genuinely uninvited users reach the wizard — they
  self-serve a new business, which is the accepted SaaS behavior.

Keep the `NoAccess` component but make it no longer the auto-landing. To stay
honest about the uninvited-staff case, add a small "Bukan bisnis Anda? Keluar"
(not your business? sign out) link in the onboarding profile step that signs out
and returns to `/`. (Reuses `useAuthActions().signOut`.)

### 2. Onboarding profile step gains owner name + Terms

`profile-step.tsx` / `CafeProfileForm`:

- Add an **owner name** field, kept **local to the profile step** (not added to
  `CafeProfileForm`, to avoid coupling owner identity into the cafe form). On
  submit, write it to `users.name` via a small mutation (e.g.
  `users.setName({ name })`) alongside the existing `cafes.updateProfile`.
  Pre-fill from `users` if already set (Google users have a name; OTP users do
  not).
- Add a **Terms & Privacy checkbox**, shown only to brand-new users (heuristic:
  cafe not yet `setupCompletedAt`). It gates the "Lanjut →" button. Acceptance is
  recorded by proceeding (no separate persistence required beyond, optionally, a
  `termsAcceptedAt` timestamp on the user — include the timestamp for an audit
  trail).

For a brand-new user, owner name + terms must be satisfied to leave the profile
step by **either** button ("Lanjut →" or "Lewati semua") — the gate is on
leaving the step, so "skip all" still skips the *rest* of the wizard but cannot
bypass name/terms. Cafe name remains required as today. For an already-onboarded
user revisiting, neither the name field nor the terms checkbox is shown.

### 3. Delete `/signup`, repoint CTAs

- Delete `src/routes/_public/signup.tsx`. Add a redirect so `/signup` →
  `/signin` (avoid 404s on bookmarks / external links). Regenerate and commit
  `src/routeTree.gen.ts`.
- Update marketing CTAs from `/signup` to `/signin` in: `hero.tsx`,
  `pricing.tsx` (×2), `ai-spotlight.tsx`, `cta-band.tsx`, `marketing-header.tsx`,
  `marketing-footer.tsx`.
- `signin.tsx`: remove the "Belum punya akun? Daftar" footer linking to
  `/signup` (same page now). Keep the value-prop copy minimal so the page reads
  as both "sign in" and "get started".

### 4. Copy / i18n

New strings (owner name label, terms checkbox, sign-out escape link, any signin
copy tweaks) go through Lingui: run `lingui:extract`, fill `en` translations,
then `lingui:compile`. Source locale is Bahasa Indonesia; receipt content is
unaffected.

## Affected files

- `src/routes/_pos.tsx` — cafe-less redirect to onboarding.
- `src/components/onboarding/steps/profile-step.tsx` — owner name + terms +
  sign-out escape.
- `src/components/menu/cafe-profile-form.tsx` — owner name field (if added here)
  OR keep the name field local to the profile step.
- `convex/users.ts` — `setName` mutation (+ optional `termsAcceptedAt`).
- `convex/schema.ts` — optional `users.termsAcceptedAt` field.
- `src/routes/_public/signup.tsx` — deleted; `/signup` → `/signin` redirect.
- `src/routeTree.gen.ts` — regenerated.
- Marketing: `hero.tsx`, `pricing.tsx`, `ai-spotlight.tsx`, `cta-band.tsx`,
  `marketing-header.tsx`, `marketing-footer.tsx` — CTA targets.
- `src/routes/_public/signin.tsx` — drop signup footer.
- Locale catalogs (`src/locales/*`).

## Testing

- Convex: a `users.setName` unit test (auth required, writes name).
- Existing `auth-otp.test.ts` continues to pass (no backend auth change).
- E2E smoke: extend `tests/e2e/smoke.spec.ts` to cover `/signup` redirecting to
  `/signin`, and that `/signin` renders the code flow by default.
- Manual: new email → code → onboarding wizard (name + cafe + terms) →
  dashboard; returning user with a cafe → dashboard; `?reset` still enters reset.
- Local CI before push: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`.

## Risks

- **Email reliability is now critical** — OTP is the only new-user path until
  password-on-settings ships. Mitigated by the blocking `RESEND_API_KEY`
  prerequisite and the verified `send.kodapos.app` sender.
- **Typo'd email creates an empty account** — low harm (no cafe, no data); the
  user simply re-enters the correct email.
- **Uninvited user lands in "create a business"** — accepted; the sign-out
  escape link covers the "I was supposed to join an existing business" case.

## Out of scope / fast-follow

- Set/change password in Settings (separate spec after a credential-linking
  spike).
