# Auth setup

kodapos auth runs on Convex Auth (`@convex-dev/auth`). Email/password sign-in works out of the
box. The other methods need environment configuration in the **Convex deployment** (the Convex
dashboard). None of these are committed secrets. Every deployment carries its own environment
and its own JWT keypair — see [Production Convex cutover](./deploy-production.md) for what
production needs beyond dev.

> **The sign-in page currently offers email only.** "Continue with Google" is hidden: the
> button was removed from `src/routes/_public/signin.tsx`, but the `Google` provider is still
> registered in `convex/auth.ts`, so the OAuth callback route still answers. Hiding the button
> is a UI change, not an auth change — see [Google OAuth app](#google-oauth-app).

## Sign in / sign up methods

| Method | Works without setup? | Needs |
|---|---|---|
| Email + password | Yes | nothing |
| Forgot password (emailed reset code) | No | `RESEND_API_KEY` |
| Sign in with a code (passwordless OTP) | No | `RESEND_API_KEY` (+ `SITE_URL` for the tap-to-sign-in link) |
| Continue with Google | **Hidden in the UI** | nothing today; re-enabling needs a Google OAuth app + `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` |
| Remember me | Yes | nothing (opt-in checkbox; off by default) |

If a method's env is not set, that button/flow surfaces a clean message and the others keep
working. Password sign-in is never affected.

## Environment variables (set in the Convex dashboard)

- **`RESEND_API_KEY`** — enables the OTP code, the magic link, the password-reset email, and the
  existing receipt / shift-summary / low-stock emails. Optionally **`RESEND_FROM`** (a verified
  sender, e.g. `Kafe Anda <noreply@yourdomain.com>`; defaults to `kodapos <onboarding@resend.dev>`,
  which only delivers to the Resend account owner in test mode).
- **`SITE_URL`** — the FRONTEND app origin (e.g. `https://app.kodapos.com`). Used ONLY to build
  the tap-to-sign-in magic link in the OTP email. If unset, the OTP email still sends the code
  (the customer types it); the link is omitted. Do not point this at the Convex backend host.
- **`AUTH_GOOGLE_ID`** / **`AUTH_GOOGLE_SECRET`** — from a Google Cloud OAuth 2.0 client. Not
  needed while the Google button is hidden; set them only when re-enabling it.

## Google OAuth app

The button is hidden today. To re-enable it:

1. Restore `<GoogleButton>` + `<OrDivider>` and the `onGoogle` handler in
   `src/routes/_public/signin.tsx` (removed in the email-only change; the components themselves
   were left in `src/components/auth/`).
2. Google Cloud Console → APIs & Services → Credentials → Create credentials → OAuth client ID →
   Web application.
3. Authorized redirect URI: **`${CONVEX_SITE_URL}/api/auth/callback/google`** (your Convex
   deployment's `.convex.site` host, the one in `CONVEX_SITE_URL`).
4. Copy the client id + secret into `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` in the Convex env.

### Account linking is directional

Convex Auth only auto-links accounts for **trusted** providers — ones that guarantee a verified
email. Google OAuth and the emailed-code OTP are trusted. Our `Password` provider is **not**: it
is configured with `reset` but no `verify` (`convex/auth.ts`), so it never auto-links.

That asymmetry matters now that Google is hidden:

- **Google sign-in over an existing password account (same email) → links.** One user document.
- **Password sign-up over an existing Google account (same email) → does NOT link.** It creates a
  *second, empty* user document, and the owner lands in onboarding with no cafe.

So an owner who originally registered with Google must sign in with the **emailed code**, which
links to their existing account. Steering them to "create a password" instead will silently
strand them on a duplicate account. To close that hole permanently, give the `Password` provider
a `verify: ResendOTP` so it becomes trusted too.

A first-time Google user with no cafe is routed to onboarding to create one.

## Security notes (hardened in the auth overhaul)

- The OTP / reset code is an 8-digit server-generated (CSPRNG) single-use code with a 15-minute
  expiry; issuance is rate-limited server-side (5 per 10 minutes per email, per flow).
- The magic link carries the code in the URL **fragment** (never sent to servers / Referer).
- **Remember me is opt-in** (off by default): on → the session token persists in `localStorage`;
  off → `sessionStorage` (cleared when the browser closes). Sign-out clears both. Prefer off on a
  shared register device.
- Secrets (`AUTH_GOOGLE_SECRET`, `RESEND_API_KEY`) live only in the Convex env, never in the client.
