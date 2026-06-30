# Passwordless-first account flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make passwordless (emailed code) the single front door for register + sign-in, delete the `/signup` page, and route brand-new users straight into the onboarding wizard (which now collects owner name + Terms).

**Architecture:** No backend auth change — Convex Auth's `resend-otp` provider already auto-creates an account on first verified code. We add two small Convex functions (`users.setName`, `users.myName`) and one field (`cafes.ownerTermsAcceptedAt` via an extended `cafes.updateProfile`). Frontend changes: the onboarding profile step gains owner-name + Terms + a sign-out escape; `OnboardingGate` routes cafe-less users into onboarding instead of the no-access screen; `/signup` becomes a redirect to `/signin`; marketing CTAs repoint.

**Tech Stack:** Convex (`@convex-dev/auth` 0.0.92), React 19, TanStack Router, Lingui (source locale Bahasa Indonesia), vitest + convex-test (backend), Playwright (e2e). Package manager: pnpm.

## Global Constraints

- Convex function rules (from `convex/_generated/ai/guidelines.md`): every function has arg validators; derive identity via `getAuthUserId(ctx)` / `ctx.auth.getUserIdentity()`, never accept a userId arg for auth; use `withIndex`, not `.filter`.
- Run CI locally before any push: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`. Do not push-then-poll.
- After adding any user-facing string, run `pnpm lingui:extract`, fill the `en` translation, then `pnpm lingui:compile`. Source strings are Bahasa Indonesia.
- No em-dash (—) or `--` in user-facing copy (BI + en). Use commas/periods/parentheses.
- Empty/data states use the shadcn `Empty` component; this plan adds none.
- Conventional commits. End each commit message body with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Work stays on branch `feat/passwordless-first-signin`.
- `convex/_generated` is committed; if a new public function changes the API surface, run `./node_modules/.bin/convex codegen` (npx is broken by a shell hook) and commit the regenerated files.

---

### Task 1: Anchor the branch (commit the existing `/signin` default-to-OTP change)

The working tree already has `src/routes/_public/signin.tsx` modified (the sign-in card now defaults to the `otp` mode). Commit it so the branch has a clean base.

**Files:**
- Modify: `src/routes/_public/signin.tsx` (already changed in working tree, line ~73)

- [ ] **Step 1: Confirm the change is present**

Run: `git diff src/routes/_public/signin.tsx`
Expected: the `SigninPage` return now uses `initialMode={search.reset !== undefined ? 'reset' : 'otp'}` with an explanatory comment.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_public/signin.tsx
git commit -m "feat(auth): default the sign-in card to the passwordless code flow

Password stays one tap away behind the 'Pakai sandi' link; ?reset still
enters the reset flow.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `users.setName` mutation + `users.myName` query

The onboarding step needs to write the owner's name to `users.name` (an existing Convex Auth field, no schema change) and read it back to pre-fill (Google users have a name, OTP users do not).

**Files:**
- Modify: `convex/users.ts`
- Test: `tests/convex/users.test.ts`

**Interfaces:**
- Produces:
  - `api.users.setName({ name: string }) => null` — patches the authed user's `name` (trimmed, 1..80 chars), throws `"Not authenticated"` if signed out.
  - `api.users.myName() => string | null` — the authed user's `name`, or `null` if signed out / unset.

- [ ] **Step 1: Write the failing tests**

Append to `tests/convex/users.test.ts`:

```ts
describe('setName / myName', () => {
  it('sets and reads back the authed user name (trimmed)', async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) => ctx.db.insert('users', { email: 'o@x.com' }));
    const asUser = t.withIdentity({ subject: `${userId}|test_session` });

    expect(await asUser.query(api.users.myName)).toBeNull();
    await asUser.mutation(api.users.setName, { name: '  Warren  ' });
    expect(await asUser.query(api.users.myName)).toBe('Warren');
  });

  it('rejects an empty name', async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) => ctx.db.insert('users', { email: 'o2@x.com' }));
    const asUser = t.withIdentity({ subject: `${userId}|test_session` });
    await expect(asUser.mutation(api.users.setName, { name: '   ' })).rejects.toThrow();
  });

  it('setName throws when unauthenticated', async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.users.setName, { name: 'X' })).rejects.toThrow();
  });
});
```

(If `tests/convex/users.test.ts` lacks the `describe`/`expect`/`it` imports or the `modules`/`schema`/`api` setup, mirror the header already present in that file — it imports them and defines `const modules = import.meta.glob('../../convex/**/*.*s')`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- tests/convex/users.test.ts`
Expected: FAIL — `api.users.setName` / `api.users.myName` do not exist.

- [ ] **Step 3: Implement the functions**

Edit `convex/users.ts` to add (keeping the existing `hello` query):

```ts
import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

// ...existing `hello` query stays above or below...

export const myName = query({
  args: {},
  returns: v.union(v.string(), v.null()),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    return (user as { name?: string } | null)?.name ?? null;
  },
});

export const setName = mutation({
  args: { name: v.string() },
  returns: v.null(),
  handler: async (ctx, { name }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    const trimmed = name.trim();
    if (trimmed.length < 1) throw new Error('Nama wajib diisi.');
    if (trimmed.length > 80) throw new Error('Nama maksimal 80 karakter.');
    await ctx.db.patch(userId, { name: trimmed });
    return null;
  },
});
```

Note: `convex/users.ts` currently imports only `query`; add `mutation` to that import and `getAuthUserId` is already imported.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/convex/users.test.ts`
Expected: PASS (all three new tests + the existing `hello` test).

- [ ] **Step 5: Regenerate Convex API types and commit**

```bash
./node_modules/.bin/convex codegen
git add convex/users.ts convex/_generated tests/convex/users.test.ts
git commit -m "feat(auth): add users.setName mutation and users.myName query

Lets onboarding capture the owner name for passwordless/Google users who
have no name from a signup form.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `cafes.ownerTermsAcceptedAt` field + extend `cafes.updateProfile`

Record Terms acceptance as a timestamp on the owner's cafe (audit trail). The cafe is the owned table, so this avoids overriding the Convex Auth `users` table.

**Files:**
- Modify: `convex/schema.ts` (the `cafes` table definition, around lines 31-48)
- Modify: `convex/cafes.ts` (`updateProfile`, lines 156-188)
- Test: `tests/convex/cafes.details.test.ts`

**Interfaces:**
- Consumes: `api.cafes.createForOwner`, `api.cafes.updateProfile` (existing).
- Produces: `api.cafes.updateProfile` gains an optional arg `ownerTermsAcceptedAt?: number`; when present it is patched onto the owner's active cafe.

- [ ] **Step 1: Write the failing test**

Append to `tests/convex/cafes.details.test.ts` (it already constructs an `asOwner` via `t.withIdentity`):

```ts
it('updateProfile records ownerTermsAcceptedAt when provided', async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email: 'terms@x.com' }));
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  const cafeId = await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Terms' });

  await asOwner.mutation(api.cafes.updateProfile, {
    name: 'Kopi Terms',
    timezone: 'Asia/Jakarta',
    taxRatePct: 11,
    taxEnabled: true,
    ownerTermsAcceptedAt: 1_700_000_000_000,
  });

  const cafe = await t.run((ctx) => ctx.db.get(cafeId as Id<'cafes'>));
  expect(cafe!.ownerTermsAcceptedAt).toBe(1_700_000_000_000);
});
```

(Confirm `Id` is imported in that file: `import type { Id } from '../../convex/_generated/dataModel';`. Add it if missing.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/convex/cafes.details.test.ts`
Expected: FAIL — `ownerTermsAcceptedAt` is not a valid arg (validator rejects it) and not stored.

- [ ] **Step 3: Add the schema field**

In `convex/schema.ts`, inside the `cafes: defineTable({ ... })` object, add alongside the other optional profile fields (e.g. right after `setupCompletedAt: v.optional(v.number()),`):

```ts
    // When the owner accepted Terms & Privacy during onboarding (passwordless
    // flow). Optional for backward compatibility with pre-existing cafes.
    ownerTermsAcceptedAt: v.optional(v.number()),
```

- [ ] **Step 4: Extend `updateProfile`**

In `convex/cafes.ts`, in `updateProfile`:

Add to `args`:
```ts
    ownerTermsAcceptedAt: v.optional(v.number()),
```

In the handler, change the `ctx.db.patch(cafeId, { ... })` call to conditionally include the timestamp:

```ts
    await ctx.db.patch(cafeId, {
      name: trimmedName,
      phone: args.phone?.trim() || undefined,
      addressLine: args.addressLine?.trim() || undefined,
      timezone: args.timezone,
      taxRatePct: args.taxRatePct,
      taxEnabled: args.taxEnabled,
      ...(args.ownerTermsAcceptedAt !== undefined
        ? { ownerTermsAcceptedAt: args.ownerTermsAcceptedAt }
        : {}),
    });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- tests/convex/cafes.details.test.ts`
Expected: PASS.

- [ ] **Step 6: Regenerate types and commit**

```bash
./node_modules/.bin/convex codegen
git add convex/schema.ts convex/cafes.ts convex/_generated tests/convex/cafes.details.test.ts
git commit -m "feat(onboarding): record owner Terms acceptance on the cafe

Adds cafes.ownerTermsAcceptedAt and an optional updateProfile arg so the
onboarding profile step can persist Terms consent for the passwordless flow.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Onboarding profile step gains owner name + Terms + sign-out escape

Extend `CafeProfileForm` with two optional, generic props (`prepend`, `disableSubmit`) and use them from `ProfileStep` to add owner-name and Terms fields whose state stays local to the step. Add a "not your business? sign out" link.

**Files:**
- Modify: `src/components/menu/cafe-profile-form.tsx`
- Modify: `src/components/onboarding/steps/profile-step.tsx`
- Verify: e2e covered later in Task 7 (no component-unit-test lib in this stack).

**Interfaces:**
- Consumes: `api.users.setName`, `api.users.myName` (Task 2), `api.cafes.updateProfile` with `ownerTermsAcceptedAt` (Task 3).
- Produces: `CafeProfileFormProps` gains `prepend?: React.ReactNode` and `disableSubmit?: boolean`.

- [ ] **Step 1: Add the two optional props to `CafeProfileForm`**

In `src/components/menu/cafe-profile-form.tsx`:

Extend the props interface:
```ts
export interface CafeProfileFormProps {
  initial: CafeProfileFormValues;
  submitLabel: string;
  onSubmit: (values: CafeProfileFormValues) => Promise<void>;
  secondaryAction?: { label: string; onClick: () => void };
  prepend?: React.ReactNode;
  disableSubmit?: boolean;
}
```

Destructure them:
```ts
export function CafeProfileForm({
  initial,
  submitLabel,
  onSubmit,
  secondaryAction,
  prepend,
  disableSubmit,
}: CafeProfileFormProps) {
```

Render `prepend` as the first child inside `<FieldGroup>` (above the cafe-name `Field`):
```tsx
      <FieldGroup>
        {prepend}
        <Field>
          <FieldLabel htmlFor="name"><Trans>Nama kafe</Trans></FieldLabel>
```

Add `disableSubmit` to the primary submit button's `disabled` (find the primary submit `<Button type="submit" ...>` and OR it in):
```tsx
        <Button type="submit" disabled={submitting || disableSubmit}>
```

(Add `import type { ReactNode } from 'react';` is not required if you reference `React.ReactNode`; the file already imports from `'react'` — extend that import to include the `ReactNode` type or use `React.ReactNode` consistently.)

- [ ] **Step 2: Wire owner name + Terms into `ProfileStep`**

Rewrite `src/components/onboarding/steps/profile-step.tsx` to add local state for owner name and terms, render them via `prepend`, gate submit, and persist via `setName` + `updateProfile`:

```tsx
import { useNavigate } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useEffect, useRef, useState } from 'react';
import { Store, User } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { CafeProfileForm, type CafeProfileFormValues } from '~/components/menu/cafe-profile-form';
import { OnboardingStepHeader } from '~/components/onboarding/step-header';
import { FormSkeleton } from '~/components/ui/loading-skeletons';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Field, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';

export function ProfileStep() {
  const { t } = useLingui();
  const cafe = useQuery(api.cafes.myCafe);
  const savedName = useQuery(api.users.myName);
  const updateProfile = useMutation(api.cafes.updateProfile);
  const markComplete = useMutation(api.cafes.markSetupComplete);
  const setName = useMutation(api.users.setName);
  const createForOwner = useMutation(api.cafes.createForOwner);
  const { signOut } = useAuthActions();
  const navigate = useNavigate();

  const [ownerName, setOwnerName] = useState('');
  const [agreed, setAgreed] = useState(false);

  // Pre-fill the owner name once it loads (Google users have one; OTP users do not).
  useEffect(() => {
    if (typeof savedName === 'string' && savedName.length > 0) setOwnerName(savedName);
  }, [savedName]);

  // A passwordless / Google sign-up lands here authenticated but cafe-less.
  // Create a default cafe so onboarding can proceed; createForOwner is idempotent.
  const creating = useRef(false);
  useEffect(() => {
    if (cafe !== null || creating.current) return;
    creating.current = true;
    void createForOwner({ name: 'Kafe Saya' }).catch(() => {
      creating.current = false;
    });
  }, [cafe, createForOwner]);

  if (cafe === undefined || cafe === null) {
    return <FormSkeleton rows={5} />;
  }

  const initial: CafeProfileFormValues = {
    name: cafe.name,
    timezone: cafe.timezone ?? 'Asia/Jakarta',
    taxRatePct: cafe.taxRatePct ?? 11,
    taxEnabled: cafe.taxEnabled ?? true,
  };
  if (cafe.phone) initial.phone = cafe.phone;
  if (cafe.addressLine) initial.addressLine = cafe.addressLine;

  const ownerNameTrimmed = ownerName.trim();
  const gateBlocked = ownerNameTrimmed.length < 1 || !agreed;

  const prepend = (
    <>
      <Field>
        <FieldLabel htmlFor="ownerName"><Trans>Nama Anda</Trans></FieldLabel>
        <div className="relative">
          <User
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="ownerName"
            name="ownerName"
            autoComplete="name"
            placeholder={t`mis. Warren`}
            className="pl-9"
            maxLength={80}
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
          />
        </div>
      </Field>
      <label className="flex items-start gap-2 text-sm text-muted-foreground select-none">
        <Checkbox
          checked={agreed}
          onCheckedChange={(c) => setAgreed(c === true)}
          className="mt-0.5"
        />
        <span>
          <Trans>
            Saya menyetujui{' '}
            <Link to="/terms" className="text-primary underline">Syarat Layanan</Link>{' '}
            dan{' '}
            <Link to="/privacy" className="text-primary underline">Kebijakan Privasi</Link>.
          </Trans>
        </span>
      </label>
    </>
  );

  return (
    <>
      <OnboardingStepHeader
        icon={<Store />}
        title={<Trans>Profil kafe</Trans>}
        description={<Trans>Bisa diubah kapan saja di Pengaturan.</Trans>}
      />
      <CafeProfileForm
        initial={initial}
        submitLabel={t`Lanjut →`}
        prepend={prepend}
        disableSubmit={gateBlocked}
        onSubmit={async (values) => {
          await setName({ name: ownerNameTrimmed });
          await updateProfile({ ...values, ownerTermsAcceptedAt: Date.now() });
          navigate({ to: '/onboarding/menu' });
        }}
        secondaryAction={{
          label: t`Lewati semua`,
          onClick: async () => {
            if (gateBlocked) return;
            await setName({ name: ownerNameTrimmed });
            await updateProfile({ ...initial, ownerTermsAcceptedAt: Date.now() });
            await markComplete();
            navigate({ to: '/menu' });
          },
        }}
      />
      <div className="mt-6 text-center">
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 text-sm text-muted-foreground"
          onClick={() => {
            void signOut().then(() => window.location.replace('/'));
          }}
        >
          <Trans>Bukan bisnis Anda? Keluar</Trans>
        </Button>
      </div>
    </>
  );
}
```

Notes:
- The "Lewati semua" (skip all) path preserves the original behavior: it calls `markSetupComplete` (sets `setupCompletedAt`) before navigating to `/menu`, now additionally gated on owner name + Terms. The primary "Lanjut →" path does NOT call `markSetupComplete` — completion happens later on the existing cashier/final wizard step, unchanged.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors. (If `disableSubmit`/`prepend` types mismatch, re-check Task 4 Step 1.)

- [ ] **Step 4: Commit**

```bash
git add src/components/menu/cafe-profile-form.tsx src/components/onboarding/steps/profile-step.tsx
git commit -m "feat(onboarding): collect owner name and Terms in the profile step

Adds optional prepend/disableSubmit props to CafeProfileForm and uses them
to gate onboarding on owner name + Terms acceptance, with a sign-out escape
for users who landed in the wrong business.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Route cafe-less users into onboarding (drop the no-access auto-screen)

A freshly-registered, cafe-less user should land in the wizard, not the "Belum ada akses" screen. Change `OnboardingGate` so a `cafe === null` user (after invite acceptance) is redirected to `/onboarding/profile`.

**Files:**
- Modify: `src/routes/_pos.tsx` (`OnboardingGate`, the redirect effect + the cafe-less branch, around lines 86-133)

**Interfaces:**
- Consumes: `api.cafes.myCafe`, `api.invites.acceptPendingInvites` (existing).

- [ ] **Step 1: Update the gate logic**

In `src/routes/_pos.tsx`, inside `OnboardingGate`:

Replace the `needsOnboarding` derivation + redirect effect + render branches so a cafe-less user also redirects to onboarding. Concretely:

```tsx
  const alreadyOnOnboarding = path.startsWith('/onboarding');
  const noCafe = cafe === null;
  // An owner mid-onboarding (cafe exists but not yet completed) OR a brand-new
  // cafe-less user (passwordless/Google register) both belong in the wizard.
  const needsOnboarding = cafe !== undefined && cafe !== null && !cafe.setupCompletedAt;
  const shouldOnboard = (noCafe || needsOnboarding) && !alreadyOnOnboarding;

  useEffect(() => {
    if (shouldOnboard && typeof window !== 'undefined') {
      window.location.replace('/onboarding/profile');
    }
  }, [shouldOnboard]);

  // Still resolving cafe state or still accepting invites: don't flash content
  // (an invited manager's cafe becomes non-null once accept commits).
  if (cafe === undefined || accepting) {
    return <LoadingCounter />;
  }
  if (shouldOnboard) {
    return null; // redirecting to /onboarding/profile
  }
  return <>{children}</>;
```

Remove the now-unused `import { NoAccess } from '~/components/no-access';` from the top of `src/routes/_pos.tsx`. Leave the `no-access.tsx` file in place (still imported elsewhere? verify with the grep in Step 2; if nothing imports it, that is fine — it is a self-contained component and can be removed in a later cleanup).

- [ ] **Step 2: Verify nothing else still imports NoAccess and typecheck**

Run: `grep -rn "no-access\|NoAccess" src --include=*.tsx`
Expected: only the `no-access.tsx` definition remains (no live importers), or any remaining importer is intentional.

Run: `pnpm typecheck`
Expected: no errors (no unused-import error for `NoAccess`).

- [ ] **Step 3: Commit**

```bash
git add src/routes/_pos.tsx
git commit -m "feat(auth): route cafe-less users into onboarding, not no-access

A passwordless/Google register lands authenticated but cafe-less; send them
straight to the onboarding wizard instead of the 'no access' screen.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Replace `/signup` with a redirect; repoint marketing CTAs; drop the signin footer

**Files:**
- Modify: `src/routes/_public/signup.tsx` (replace contents with a redirect-only route — keeps `routeTree.gen.ts` valid, no regeneration needed)
- Modify: `src/routes/_public/signin.tsx` (remove the "Belum punya akun? Daftar" footer block)
- Modify marketing CTAs: `src/components/marketing/hero.tsx`, `src/components/marketing/pricing.tsx` (2 links), `src/components/marketing/ai-spotlight.tsx`, `src/components/marketing/cta-band.tsx`, `src/components/marketing/marketing-header.tsx`, `src/components/marketing/marketing-footer.tsx`

- [ ] **Step 1: Turn `/signup` into a redirect to `/signin`**

Replace the entire contents of `src/routes/_public/signup.tsx` with:

```tsx
import { createFileRoute, redirect } from '@tanstack/react-router';

// The dedicated signup page is gone: registration now happens inline on
// /signin (enter email, get a code, account is created on first verify).
// Keep this route as a permanent redirect so old links and bookmarks resolve.
export const Route = createFileRoute('/_public/signup')({
  beforeLoad: () => {
    throw redirect({ to: '/signin' });
  },
});
```

- [ ] **Step 2: Repoint every marketing CTA from `/signup` to `/signin`**

For each file below, change `to="/signup"` to `to="/signin"` (leave the visible label text, e.g. "Daftar" / "Coba gratis", unchanged):

- `src/components/marketing/hero.tsx` (1 link)
- `src/components/marketing/pricing.tsx` (2 links)
- `src/components/marketing/ai-spotlight.tsx` (1 link)
- `src/components/marketing/cta-band.tsx` (1 link)
- `src/components/marketing/marketing-header.tsx` (1 link)
- `src/components/marketing/marketing-footer.tsx` (1 link)

Verify none remain:
Run: `grep -rn 'to="/signup"' src`
Expected: no matches.

- [ ] **Step 3: Remove the signup footer on the sign-in card**

In `src/routes/_public/signin.tsx`, delete the trailing footer block that links to `/signup`:

```tsx
      <div className="mt-6 border-t border-border pt-6 text-center text-sm text-muted-foreground">
        <Trans>Belum punya akun?</Trans>{' '}
        <Link to="/signup" className="text-primary underline">
          <Trans>Daftar</Trans>
        </Link>
      </div>
```

If `Link` becomes unused in `signin.tsx` after this removal, drop it from the `@tanstack/react-router` import to satisfy the linter.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/routes/_public/signup.tsx src/routes/_public/signin.tsx src/components/marketing
git commit -m "feat(auth): remove the signup page, redirect /signup to /signin

Registration is now inline on /signin (passwordless). Repoints all marketing
CTAs and drops the now-redundant 'Daftar' footer on the sign-in card.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: e2e smoke updates, i18n, and full local CI

The gated auth e2e drove the old password `/signup` form, which no longer exists; replace it with ungated checks for the redirect and the default code flow. Then extract/compile i18n and run the full local CI.

**Files:**
- Modify: `tests/e2e/smoke.spec.ts`
- Modify: locale catalogs via Lingui (`src/locales/*`)

- [ ] **Step 1: Replace the gated signup e2e with redirect + default-mode checks**

In `tests/e2e/smoke.spec.ts`, remove the `test.describe('auth flow', ...)` block that fills the `/signup` password form (it cannot run now — there is no signup form and OTP needs an email inbox). Replace it with an ungated test:

```ts
test('signup URL redirects to signin, which defaults to the code flow', async ({ page }) => {
  await gotoHydrated(page, '/signup');
  await waitForUrlHydrated(page, /\/signin$/);
  // Passwordless-first: the email-code form is the default (no password field shown).
  await expect(page.getByRole('button', { name: /Kirim kode/ })).toBeVisible();
  await expect(page.getByLabel('Password')).toHaveCount(0);
});
```

Keep the first test ('public home renders and links to sign-in / sign-up') as-is: the marketing header/footer still render a "Daftar" link (now pointing at `/signin`), so its `getByRole('link', { name: /Daftar/ })` assertion still passes.

- [ ] **Step 2: Run the e2e smoke locally (best-effort)**

Run: `pnpm test:e2e -- tests/e2e/smoke.spec.ts`
Expected: the two ungated tests pass. (If the dev server is not running per the Playwright config, follow the repo's existing e2e run convention; do not block the task on environment setup beyond what CI does.)

- [ ] **Step 3: Extract and compile i18n**

Run: `pnpm lingui:extract`
Then open the English catalog and fill any newly-extracted strings (e.g. "Nama Anda", the Terms checkbox sentence if newly introduced, "Bukan bisnis Anda? Keluar", "Kirim kode" if new) with their English equivalents. Do not introduce em-dashes.

Run: `pnpm lingui:compile`
Expected: compiles with no missing-translation errors.

- [ ] **Step 4: Full local CI**

Run: `pnpm typecheck && pnpm test && pnpm lingui:compile`
Expected: all pass (952+ backend tests including the new ones).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/smoke.spec.ts src/locales
git commit -m "test(auth): cover /signup redirect + passwordless-default signin; i18n

Replaces the obsolete password-signup e2e with redirect and default-mode
assertions, and fills English translations for the new onboarding strings.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Post-implementation (out of plan scope)

- Set `RESEND_API_KEY` on dev and prod Convex deployments before this reaches real users, or no one can register/sign in.
- Manual end-to-end check (needs `RESEND_API_KEY`): new email -> code -> onboarding (name + cafe + terms) -> dashboard; returning user with a cafe -> dashboard; `?reset` still enters reset.
- Fast-follow slice: "set a password in Settings" (needs a Convex Auth credential-linking spike, per the design doc).

## Verification checklist (maps to spec)

- Passwordless single front door: Task 1 (default mode) + Task 6 (no signup page).
- Owner name collected: Tasks 2 + 4.
- Terms accepted + recorded: Tasks 3 + 4.
- Cafe-less user -> wizard: Task 5.
- `/signup` redirect + CTAs repointed: Task 6.
- Password provider untouched / still reachable: unchanged (verified by Task 1 leaving `password` mode in place).
- Tests + i18n + CI: Task 7.
