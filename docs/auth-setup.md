# Auth setup

kodapos auth runs on Convex Auth (`@convex-dev/auth`). Email/password sign-in works out of the
box. The other methods need environment configuration in the **Convex deployment** (the Convex
dashboard, currently the DEV deployment). None of these are committed secrets.

## Sign in / sign up methods

| Method | Works without setup? | Needs |
|---|---|---|
| Email + password | Yes | nothing |
| Forgot password (emailed reset code) | No | `RESEND_API_KEY` |
| Sign in with a code (passwordless OTP) | No | `RESEND_API_KEY` (+ `SITE_URL` for the tap-to-sign-in link) |
| Continue with Google | No | a Google OAuth app + `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` |
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
- **`AUTH_GOOGLE_ID`** / **`AUTH_GOOGLE_SECRET`** — from a Google Cloud OAuth 2.0 client.

## Google OAuth app

1. Google Cloud Console → APIs & Services → Credentials → Create credentials → OAuth client ID →
   Web application.
2. Authorized redirect URI: **`${CONVEX_SITE_URL}/api/auth/callback/google`** (your Convex
   deployment's `.convex.site` host, the one in `CONVEX_SITE_URL`).
3. Copy the client id + secret into `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` in the Convex env.
4. Convex Auth links a Google sign-in to an existing user by matching email, so an owner who
   registered with a password can also sign in with Google on the same email (same account, no
   duplicate). A first-time Google user with no cafe is routed to onboarding to create one.

## Security notes (hardened in the auth overhaul)

- The OTP / reset code is an 8-digit server-generated (CSPRNG) single-use code with a 15-minute
  expiry; issuance is rate-limited server-side (5 per 10 minutes per email, per flow).
- The magic link carries the code in the URL **fragment** (never sent to servers / Referer).
- **Remember me is opt-in** (off by default): on → the session token persists in `localStorage`;
  off → `sessionStorage` (cleared when the browser closes). Sign-out clears both. Prefer off on a
  shared register device.
- Secrets (`AUTH_GOOGLE_SECRET`, `RESEND_API_KEY`) live only in the Convex env, never in the client.
