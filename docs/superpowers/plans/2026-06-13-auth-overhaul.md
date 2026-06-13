# Auth Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). Security-critical (the login itself) → keep password login working, additive, + adversarial review.

**Goal:** A polished, professional centered-card auth experience on Convex Auth: **Google OAuth**, **passwordless email** (a 6-digit code + a magic link, unified — one email, tap the link OR type the code), **remember me**, **forgot password** (emailed reset code), keeping email/password sign-in intact.

**External deps (the user provisions; code stays dark until then):** Google OAuth app → `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET` in the Convex env + the callback URL `${CONVEX_SITE_URL}/api/auth/callback/google` registered in Google Cloud. Email flows reuse `RESEND_API_KEY` (+ `RESEND_FROM`, a verified sender). The signin page uses `CONVEX_SITE_URL`/the app origin for the magic link.

**Copy rules (project):** UI Bahasa via the catalog; **no em-dash `—`/`--`**; empty states shadcn `Empty` (icon+heading+desc). Email content English/off-catalog.

---

## File Structure
- **Create:** `convex/lib/resend.ts` (a `sendEmail` fetch helper), `convex/otp/ResendOTP.ts` + `convex/otp/ResendOTPReset.ts` (the OTP providers), `src/lib/auth-storage.ts` (remember-me storage adapter), `tests/convex/auth-otp.test.ts` (the OTP email-builder/token unit bits).
- **Modify:** `convex/auth.ts` (add Google + ResendOTP + Password reset), `src/routes/__root.tsx` (pass `storage` to ConvexAuthProvider), `src/routes/_public/signin.tsx` (redesign + Google + passwordless + remember-me + forgot-password + magic-link auto-submit), `src/routes/_public/signup.tsx` (redesign + Google), `src/components/auth/*` (shared auth card/social-button/divider/otp-input), `convex/email.ts` (optional: reuse the new `sendEmail` helper).
- **i18n:** `src/locales/{id,en}/messages.po`.

---

### Task 1: Backend — Google + passwordless OTP + password reset (Convex Auth)
**Files:** create `convex/lib/resend.ts`, `convex/otp/ResendOTP.ts`, `convex/otp/ResendOTPReset.ts`, `tests/convex/auth-otp.test.ts`; modify `convex/auth.ts`, `convex/email.ts` (optional reuse).

READ: `convex/auth.ts` (the current `Password` provider + `convexAuth`), `convex/email.ts` (the Resend `fetch` POST to `https://api.resend.com/emails` + the `RESEND_API_KEY`/`RESEND_FROM` env gating — extract this into the shared helper), `convex/http.ts` (`auth.addHttpRoutes` already registers OAuth + verification routes), the Convex Auth OTP recipe (`@auth/core/providers/email` Email provider + `generateVerificationToken` returning a short code + a custom `sendVerificationRequest`).

- [ ] **Step 1: `convex/lib/resend.ts`** — `export async function sendEmail({ to, subject, html, text }): Promise<void>` (env-gate `RESEND_API_KEY`, throw `'Email belum dikonfigurasi.'` if unset; `from = process.env.RESEND_FROM ?? 'kodapos <onboarding@resend.dev>'`; POST to Resend; throw on non-ok). Refactor `convex/email.ts`'s inline Resend POST to call this (keep behavior identical).
- [ ] **Step 2: `convex/otp/ResendOTP.ts`** — a passwordless provider built on `@auth/core/providers/email`'s `Email({...})`: `id: 'resend-otp'`, `maxAge: 60*15` (15 min), `generateVerificationToken: async () => <6 random digits via crypto.getRandomValues>`, `sendVerificationRequest: async ({ identifier: email, token }) => sendEmail({ to: email, subject: 'Kode masuk kodapos' (English subject for the email), html/text: the code prominently + a magic link \`${process.env.SITE_URL ?? <app origin>}/signin?email=<enc>&code=<token>\` ("tap to sign in") })`. English email content, no em-dash.
- [ ] **Step 3: `convex/otp/ResendOTPReset.ts`** — same shape, `id: 'resend-otp-password-reset'`, email a password-reset code (different subject/body).
- [ ] **Step 4: `convex/auth.ts`** — `providers: [ Password({ ...existing profile, reset: ResendOTPReset }), Google, ResendOTP ]`. Import `Google from '@auth/core/providers/google'` (reads `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`). Keep the Password `profile` mapping.
- [ ] **Step 5: FAILING/unit tests** (`tests/convex/auth-otp.test.ts`): the OTP token generator returns a 6-digit numeric string; the email builder (extract a pure `buildOtpEmail(email, code, link)` → text+html) contains the code + the link + no em-dash. (Auth E2E flows aren't unit-testable here; cover the pure bits.) Run → confirm FAIL → implement.
- [ ] **Step 6: verify + commit** — `pnpm test` + `pnpm typecheck` PASS. Commit:
  `git add convex/lib/resend.ts convex/otp/ResendOTP.ts convex/otp/ResendOTPReset.ts convex/auth.ts convex/email.ts tests/convex/auth-otp.test.ts && git commit -m "feat(auth): Google + passwordless OTP + password-reset providers (Convex Auth)"`
  > Do NOT run codegen. Keep the Password provider working (additive).

---

### Task 2: Remember-me storage adapter
**Files:** create `src/lib/auth-storage.ts`; modify `src/routes/__root.tsx`.

READ: `@convex-dev/auth/react` `ConvexAuthProvider` `storage` prop (it accepts a `{ getItem, setItem, removeItem }`), `src/routes/__root.tsx` (the provider mount).

- [ ] **Step 1: `auth-storage.ts`** — a storage object that routes Convex Auth token writes to `localStorage` when remember-me is ON (a flag in localStorage `kodapos.rememberMe` defaulting to `'1'`) or `sessionStorage` when OFF. `getItem` reads from the active store (sessionStorage first if a session token exists, else localStorage); `setItem`/`removeItem` target the active store. Export a `setRememberMe(boolean)` to set the flag (called at signin before `signIn`). SSR-guard (`typeof window`).
- [ ] **Step 2:** `__root.tsx` — pass `storage={authStorage}` to `<ConvexAuthProvider client={convex} storage={authStorage}>`.
- [ ] **Step 3:** typecheck + test PASS. Commit:
  `git add src/lib/auth-storage.ts src/routes/__root.tsx && git commit -m "feat(auth): remember-me token storage (localStorage vs sessionStorage)"`

---

### Task 3: Signin page redesign (centered card)
**Files:** create `src/components/auth/{auth-card,social-buttons,or-divider,otp-input}.tsx`; modify `src/routes/_public/signin.tsx`. READ `signin.tsx` (the existing field-validation pattern + `auth-validation` lib), `useAuthActions`, the shadcn `Card`/`Button`/`Input`/`Field`/`Checkbox`, the existing `PinEntry` (mirror for the OTP input).

- [ ] **Step 1: shared components** — `AuthCard` (centered, brand header `☕ kodapos`, soft background), `SocialButtons` (a "Lanjutkan dengan Google" button → `signIn('google')` with the Google glyph), `OrDivider` ("atau"), `OtpInput` (6-cell code entry, reuse `PinEntry`'s mechanics with digits=6).
- [ ] **Step 2: signin redesign** — a centered `AuthCard` with: the Google button, an OrDivider, the email+password fields (existing validation), a row with a **"Ingat saya"** `Checkbox` (left, default checked → `setRememberMe`) + a **"Lupa sandi?"** link (right) , the "Masuk" submit. Below: a **"Masuk dengan kode"** toggle that swaps the password area for a passwordless flow: enter email → "Kirim kode" (`signIn('resend-otp', { email })`) → an `OtpInput` (verify via `signIn('resend-otp', { email, code })`) with a resend timer. Call `setRememberMe(checked)` before any `signIn`.
- [ ] **Step 3: magic-link auto-submit** — on mount, if the URL has `?email=&code=`, auto-call `signIn('resend-otp', { email, code })` (show a spinner "Memproses tautan masuk..."); on success navigate in. (This is how the magic link in the OTP email signs the user in.)
- [ ] **Step 4: forgot-password** — a "Lupa sandi?" mode (inline on the card or a `?reset` query state): enter email → `signIn('password', { flow: 'reset', email })` → an OtpInput + a new-password field → `signIn('password', { flow: 'reset-verification', email, code, newPassword })` → signed in. Clear error/success messaging.
- [ ] **Step 5:** typecheck + test PASS. Commit:
  `git add src/components/auth src/routes/_public/signin.tsx && git commit -m "feat(auth): polished signin (Google, passwordless code+link, remember-me, forgot-password)"`

---

### Task 4: Signup page redesign
**Files:** modify `src/routes/_public/signup.tsx`. READ the existing signup (password + name + cafe creation flow) + the new `AuthCard`/`SocialButtons`.

- [ ] **Step 1:** wrap signup in the centered `AuthCard`; add the Google button (`signIn('google')`) + OrDivider above the existing email/password/name/cafe fields; keep the existing signup + cafe-creation logic intact; consistent styling with signin. (Google signups still need a cafe — if a Google sign-in lands with no cafe, the existing onboarding/landing should route them to create one; confirm the post-auth landing handles a cafe-less new user, else note it.)
- [ ] **Step 2:** typecheck + test PASS. Commit:
  `git add src/routes/_public/signup.tsx && git commit -m "feat(auth): polished signup with Google"`

---

### Task 5: i18n
New BI: `Lanjutkan dengan Google`, `atau`, `Ingat saya`, `Lupa sandi?`, `Masuk dengan kode`, `Kirim kode`, `Masukkan kode`, `Kirim ulang kode`, `Memproses tautan masuk...`, `Atur ulang sandi`, `Sandi baru`, `Kode masuk dikirim ke email Anda.`, etc.
- [ ] `pnpm lingui:extract`; fill `en` (`Continue with Google`, `or`, `Remember me`, `Forgot password?`, `Sign in with a code`, `Send code`, `Enter the code`, `Resend code`, `Signing you in...`, `Reset password`, `New password`, `A sign-in code was sent to your email.`, ...) for every new empty (no em-dash); watch collisions; `pnpm lingui:compile` → en 0 missing. Commit `src/locales`.

---

### Task 6: Final verification + security review + setup doc
- [ ] `pnpm typecheck` PASS; `pnpm test` PASS; `pnpm lingui:compile` en 0 missing; clean tree.
- [ ] code-reviewer on the auth changes: password sign-in still works (additive); the OTP code is server-generated + single-use + short-lived (Convex Auth enforces) and not logged; the magic-link query params don't enable an open-redirect or token leak; remember-me storage doesn't leave tokens where it shouldn't (session-only truly clears on close); no secret (Google secret / Resend key) reaches the client; the password-reset flow can't be used to take over an account without the emailed code; Google profile maps to a `users` row without clobbering an existing email account (account-linking behavior — note Convex Auth's default). Address findings; re-verify.
- [ ] **`docs/auth-setup.md`** — document: create a Google OAuth app, set `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` + the callback URL; `RESEND_API_KEY`/`RESEND_FROM` for code/reset emails; that without these, Google + passwordless + reset are unavailable but password sign-in works. No secrets committed.
- [ ] **Manual sanity:** password sign-in + signup still work; "Masuk dengan kode" sends a code (with Resend set) and verifies; the email's magic link signs in; "Lupa sandi?" resets; remember-me off → closing the browser logs out; the Google button starts the OAuth flow (with the env set).

---

## Self-Review
**Spec coverage:** Google + passwordless OTP (code+link) + password-reset providers (T1); remember-me storage (T2); polished signin with all methods + magic-link auto-submit + forgot-password (T3); polished signup + Google (T4); i18n (T5); security review + setup doc (T6). ✓
**Placeholder scan:** "reuse email.ts Resend / PinEntry / auth-validation / existing signup+cafe flow". Else spec code.
**Type consistency:** `signIn('google')`, `signIn('resend-otp',{email})`/`{email,code}`, `signIn('password',{flow:'reset'|'reset-verification',...})`; `setRememberMe(bool)` before signIn + `authStorage` on the provider; the OTP email carries `/signin?email&code` consumed by the auto-submit. Password provider kept. ✓
