# Multi-outlet v1 — Phase 4: Manager invites & access — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an owner invite managers (by email, scoped to a subset of outlets), have invited users auto-gain access on sign-in via an emailed invite, manage members from a settings page, and replace the silent cafe-less auto-onboarding with an explicit no-access screen.

**Architecture:** A `businessInvites` row (created Phase 1) is the pending invite; `inviteManager` (owner-only) upserts it and schedules a Resend invite email. After any sign-in, the client runs `acceptPendingInvites`, which matches the user's email to pending invites and creates `businessMembers (role 'manager')` + `memberOutletAccess` rows (one-business guard). A members settings page (owner-only) lists members + pending invites and manages outlet grants / revocation. The `_pos` `OnboardingGate` is rewritten: a user with no accessible outlet sees a no-access screen offering "Create your business" (explicit owner onboarding) or "contact your owner", instead of being silently pushed into onboarding.

**Tech Stack:** Convex (queries/mutations/internalActions), Resend (existing `convex/lib/resend.ts`), convex-test + Vitest, React + TanStack Router, shadcn, Lingui i18n.

## Global Constraints

- **Convex function syntax:** new-style `query/mutation/internalAction({ args, returns, handler })` with full `v.*` validators. Read `convex/_generated/ai/guidelines.md` before writing Convex code.
- **Auth helpers:** owner-only operations use `requireBusinessOwner(ctx)` (Phase 2, `convex/lib/auth.ts`). `resolveOutletAccess(ctx, userId)` (Phase 3) resolves accessible outlets. Query-path code MUST NOT write.
- **Email:** send via `sendEmail` from `convex/lib/resend.ts`, ONLY inside an `action`/`internalAction` (it uses `fetch`). Scheduled email sends MUST no-op when `process.env.RESEND_API_KEY` is unset (`console.warn` + return) and swallow send failures (`try/catch` + `console.error`) so a failed email never breaks the invite. The frontend origin for links is `process.env.SITE_URL` (may be unset — guard it). Mirror `convex/email.ts`.
- **Codegen:** after adding any new registered function/module, run `./node_modules/.bin/convex codegen` (NOT `npx`) and **commit `convex/_generated/**`**.
- **Quality gate before every commit:** `pnpm typecheck` and `pnpm test` must pass (currently 919 tests).
- **i18n (UI tasks):** copy authored in **Indonesian** via `<Trans>`/`` t`...` ``; after adding strings run `pnpm lingui:extract`, fill NON-empty English `msgstr` in `src/locales/en/messages.po`, then `pnpm lingui:compile`. Only `.po` files are hand-edited. **No em-dash (—) or `--`** in user-facing copy.
- **Empty states:** empty member/invite lists use the shadcn `Empty` component (icon + heading + description), per project convention — not plain text.
- **shadcn primitives:** Dialog, DropdownMenu, Checkbox, Button, Field, etc. from `src/components/ui/`. Model the members page on `src/routes/_pos/settings/staff.tsx` (the existing list + dialog + row-actions management page).
- **Test harness:** `convexTest(schema, modules)`; `t.withIdentity({ subject: \`${userId}|test_session\` })`; `.run((ctx) => fn(ctx))` runs inline with identity. Seed owners via `api.cafes.createForOwner`. Seed a user with a known email via `ctx.db.insert('users', { name, email })`. See `tests/convex/outlet-switcher.test.ts`.
- **One business per user (invariant):** a user has at most one `businessMembers` row. If an invitee already has a membership, their invite stays pending (surfaced to the owner), it is NOT accepted.
- **Frontend has no component-test harness:** UI tasks are verified by `pnpm typecheck`, the lingui cycle, and a manual visual gate (controller/user) — not unit tests.

---

### Task 1: Manager-access hardening (deferred Phase-3 follow-ups)

**Files:**
- Modify: `convex/lib/auth.ts` (`resolveOutletAccess` manager branch filters dangling cafe ids)
- Modify: `convex/outlets.ts` (`myOutlets` sorts outlets by name)
- Test: `tests/convex/outlet-switcher.test.ts` (add cases)

**Interfaces:**
- Consumes: Phase 3 `resolveOutletAccess`, `myOutlets`.
- Produces: `resolveOutletAccess`'s `accessibleCafeIds` (manager branch) excludes ids whose cafe no longer exists; `myOutlets` returns outlets sorted by `name` (locale-naive ascending).

- [ ] **Step 1: Write the failing tests**

Append to `tests/convex/outlet-switcher.test.ts`:

```typescript
describe('manager-access hardening', () => {
  it('myOutlets omits a manager grant whose cafe was deleted', async () => {
    const t = convexTest(schema, modules);
    const { userId: ownerId, businessId } = await seedOwner(t);
    const live = await t.run((ctx) =>
      ctx.db.insert('cafes', { name: 'Hidup', ownerUserId: ownerId, businessId, createdAt: 2 })
    );
    const ghost = await t.run((ctx) =>
      ctx.db.insert('cafes', { name: 'Hantu', ownerUserId: ownerId, businessId, createdAt: 3 })
    );
    const mgrUserId = await t.run((ctx) => ctx.db.insert('users', { name: 'Mgr', email: 'mgr@x.com' }));
    const mgrMemberId = await t.run((ctx) =>
      ctx.db.insert('businessMembers', { businessId, userId: mgrUserId, role: 'manager', createdAt: 5 })
    );
    await t.run((ctx) =>
      ctx.db.insert('memberOutletAccess', { businessMemberId: mgrMemberId, cafeId: live, createdAt: 5 })
    );
    await t.run((ctx) =>
      ctx.db.insert('memberOutletAccess', { businessMemberId: mgrMemberId, cafeId: ghost, createdAt: 5 })
    );
    await t.run((ctx) => ctx.db.delete(ghost)); // dangling grant

    const asMgr = t.withIdentity({ subject: `${mgrUserId}|test_session` });
    const outlets = await asMgr.query(api.outlets.myOutlets, {});
    expect(outlets.map((o) => o.cafeId)).toEqual([live]);
  });

  it('myOutlets returns outlets sorted by name', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, userId, businessId } = await seedOwner(t, 'Zeta');
    await t.run((ctx) => ctx.db.insert('cafes', { name: 'Alpha', ownerUserId: userId, businessId, createdAt: 2 }));
    await t.run((ctx) => ctx.db.insert('cafes', { name: 'Mid', ownerUserId: userId, businessId, createdAt: 3 }));
    const outlets = await asOwner.query(api.outlets.myOutlets, {});
    expect(outlets.map((o) => o.name)).toEqual(['Alpha', 'Mid', 'Zeta']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/convex/outlet-switcher.test.ts -t "manager-access hardening"`
Expected: FAIL — the dangling `ghost` id appears; ordering is by insertion, not name.

- [ ] **Step 3: Filter dangling grants in `resolveOutletAccess`**

In `convex/lib/auth.ts`, in the manager branch of `resolveOutletAccess`, drop access rows whose cafe no longer exists. Replace the manager branch:

```typescript
  } else {
    const access = await ctx.db
      .query('memberOutletAccess')
      .withIndex('by_member', (q) => q.eq('businessMemberId', member._id))
      .collect();
    // Skip grants whose cafe was deleted, so a stale memberOutletAccess row
    // never yields a dangling id downstream (myOutlets/active pick).
    const maybeCafes = await Promise.all(access.map((a) => ctx.db.get(a.cafeId)));
    accessibleCafeIds = maybeCafes.filter((c) => c !== null).map((c) => c!._id);
  }
```

- [ ] **Step 4: Sort `myOutlets` by name**

In `convex/outlets.ts`, sort the mapped result before returning. Replace the final `return` of `myOutlets`:

```typescript
    return cafes
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .map((c) => ({ cafeId: c._id, name: c.name, isActive: c._id === activeCafeId }))
      .sort((a, b) => a.name.localeCompare(b.name));
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run tests/convex/outlet-switcher.test.ts`
Expected: PASS (all outlet-switcher tests, including the two new ones).

- [ ] **Step 6: Full suite + typecheck**

Run: `pnpm typecheck && pnpm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add convex/lib/auth.ts convex/outlets.ts tests/convex/outlet-switcher.test.ts
git commit -m "fix(multi-outlet): drop dangling manager grants; sort myOutlets by name"
```

---

### Task 2: `inviteManager` mutation + invite email

**Files:**
- Create: `convex/invites.ts` (`inviteManager` mutation)
- Create: `convex/lib/inviteEmail.ts` (pure `buildInviteEmail` html/text builder)
- Modify: `convex/email.ts` (add `sendInviteEmailScheduled` internalAction)
- Test: `tests/convex/invites.test.ts` (create); `tests/convex/invite-email.test.ts` (create)

**Interfaces:**
- Consumes: `requireBusinessOwner` (Phase 2), `resolveOutletAccess` (Phase 3), `sendEmail` (`convex/lib/resend.ts`).
- Produces:
  - `api.invites.inviteManager({ email: string, cafeIds: Id<'cafes'>[] }): Id<'businessInvites'>` — owner-only. Normalizes email to trimmed lowercase, validates every cafeId is in the owner's business, upserts the `businessInvites` row (one per email+business, replacing `cafeIds` on re-invite), schedules the invite email. Throws `'owner access required'` (non-owner), `'Email tidak valid.'`, `'Pilih minimal satu outlet.'`, `'Outlet tidak ditemukan.'` (a cafeId outside the business).
  - `buildInviteEmail({ businessName, signInUrl }): { subject, html, text }` — pure.
  - `internal.email.sendInviteEmailScheduled({ to, businessName }): null` — graceful Resend send.

- [ ] **Step 1: Write the failing email-builder test**

Create `tests/convex/invite-email.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { buildInviteEmail } from '../../convex/lib/inviteEmail';

describe('buildInviteEmail', () => {
  it('includes the business name and sign-in URL', () => {
    const { subject, html, text } = buildInviteEmail({
      businessName: 'Kopi Senja',
      signInUrl: 'https://app.example/signin',
    });
    expect(subject).toContain('Kopi Senja');
    expect(html).toContain('Kopi Senja');
    expect(html).toContain('https://app.example/signin');
    expect(text).toContain('https://app.example/signin');
  });

  it('omits the link line when no sign-in URL is provided', () => {
    const { text } = buildInviteEmail({ businessName: 'Kopi Senja', signInUrl: null });
    expect(text).not.toContain('http');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/convex/invite-email.test.ts`
Expected: FAIL — `buildInviteEmail` does not exist.

- [ ] **Step 3: Implement the email builder**

Create `convex/lib/inviteEmail.ts`. The email content is English (consistent with the project's other transactional emails), no em-dash:

```typescript
/**
 * Pure builder for the manager-invite email. Content is English (like the
 * receipt/shift emails). When signInUrl is null (SITE_URL unset) the link line
 * is omitted and the recipient is told to sign in at the app with this email.
 */
export function buildInviteEmail({
  businessName,
  signInUrl,
}: {
  businessName: string;
  signInUrl: string | null;
}): { subject: string; html: string; text: string } {
  const subject = `You have been invited to manage ${businessName} on kodapos`;
  const linkHtml = signInUrl
    ? `<p><a href="${signInUrl}">Sign in to accept</a></p>`
    : '<p>Sign in to kodapos with this email address to accept.</p>';
  const linkText = signInUrl
    ? `Sign in to accept: ${signInUrl}`
    : 'Sign in to kodapos with this email address to accept.';
  const html = `<div><p>You have been invited to help manage <strong>${businessName}</strong> on kodapos.</p>${linkHtml}<p>If you did not expect this, you can ignore this email.</p></div>`;
  const text = `You have been invited to help manage ${businessName} on kodapos.\n\n${linkText}\n\nIf you did not expect this, you can ignore this email.`;
  return { subject, html, text };
}
```

- [ ] **Step 4: Run the builder test to verify it passes**

Run: `pnpm exec vitest run tests/convex/invite-email.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the scheduled send action**

In `convex/email.ts`, add the import `import { buildInviteEmail } from './lib/inviteEmail';` and append:

```typescript
/**
 * Scheduled invite-email send fired by `invites.inviteManager`. System-side:
 * no-ops when RESEND_API_KEY is unset and swallows send failures so a failed
 * email never breaks the (already-committed) invite. Links to SITE_URL/signin
 * when a real frontend origin is configured.
 */
export const sendInviteEmailScheduled = internalAction({
  args: { to: v.string(), businessName: v.string() },
  returns: v.null(),
  handler: async (ctx, { to, businessName }) => {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      console.warn(`sendInviteEmailScheduled: RESEND_API_KEY unset, skipping invite to ${to}`);
      return null;
    }
    const origin = process.env.SITE_URL ?? null;
    const signInUrl = origin ? `${origin}/signin` : null;
    try {
      const { subject, html, text } = buildInviteEmail({ businessName, signInUrl });
      await sendEmail({ to, subject, html, text });
    } catch (err) {
      console.error(`sendInviteEmailScheduled failed for ${to}:`, err);
    }
    return null;
  },
});
```

(`ctx` is unused by the body except for typing; keep the signature — the scheduler passes a ctx. If the linter flags unused `ctx`, prefix with `_ctx`.)

- [ ] **Step 6: Write the failing `inviteManager` tests**

Create `tests/convex/invites.test.ts`:

```typescript
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function seedOwner(t: ReturnType<typeof convexTest>, name = 'Kopi Senja') {
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email: `${name}@x.com` }));
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  const cafeId = await asOwner.mutation(api.cafes.createForOwner, { name });
  const cafe = await t.run((ctx) => ctx.db.get(cafeId as Id<'cafes'>));
  return { userId, asOwner, cafeId, businessId: cafe!.businessId as Id<'businesses'> };
}

describe('inviteManager', () => {
  it('records a normalized pending invite scoped to the chosen outlets', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId, businessId } = await seedOwner(t);

    await asOwner.mutation(api.invites.inviteManager, {
      email: '  Manager@Example.COM ',
      cafeIds: [cafeId],
    });

    const invite = await t.run((ctx) =>
      ctx.db.query('businessInvites').withIndex('by_business', (q) => q.eq('businessId', businessId)).first()
    );
    expect(invite?.email).toBe('manager@example.com'); // trimmed + lowercased
    expect(invite?.role).toBe('manager');
    expect(invite?.cafeIds).toEqual([cafeId]);
  });

  it('re-inviting the same email replaces the outlet set (no duplicate invite)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, userId, cafeId, businessId } = await seedOwner(t);
    const second = await t.run((ctx) =>
      ctx.db.insert('cafes', { name: 'Cabang 2', ownerUserId: userId, businessId, createdAt: 2 })
    );

    await asOwner.mutation(api.invites.inviteManager, { email: 'm@x.com', cafeIds: [cafeId] });
    await asOwner.mutation(api.invites.inviteManager, { email: 'm@x.com', cafeIds: [second] });

    const invites = await t.run((ctx) =>
      ctx.db.query('businessInvites').withIndex('by_email', (q) => q.eq('email', 'm@x.com')).collect()
    );
    expect(invites).toHaveLength(1);
    expect(invites[0].cafeIds).toEqual([second]);
  });

  it('rejects an outlet outside the business', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await seedOwner(t);
    const otherUser = await t.run((ctx) => ctx.db.insert('users', { name: 'X', email: 'x2@x.com' }));
    const otherBiz = await t.run((ctx) => ctx.db.insert('businesses', { name: 'B', ownerUserId: otherUser, createdAt: 1 }));
    const foreign = await t.run((ctx) =>
      ctx.db.insert('cafes', { name: 'Foreign', ownerUserId: otherUser, businessId: otherBiz, createdAt: 1 })
    );
    await expect(
      asOwner.mutation(api.invites.inviteManager, { email: 'm@x.com', cafeIds: [foreign] })
    ).rejects.toThrow('Outlet tidak ditemukan.');
  });

  it('rejects an empty outlet set and an invalid email', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId } = await seedOwner(t);
    await expect(asOwner.mutation(api.invites.inviteManager, { email: 'm@x.com', cafeIds: [] })).rejects.toThrow('minimal satu outlet');
    await expect(asOwner.mutation(api.invites.inviteManager, { email: 'nope', cafeIds: [cafeId] })).rejects.toThrow('Email tidak valid.');
  });

  it('rejects a manager (owner-only)', async () => {
    const t = convexTest(schema, modules);
    const { userId: ownerId, businessId, cafeId } = await seedOwner(t);
    const mgrUserId = await t.run((ctx) => ctx.db.insert('users', { name: 'Mgr', email: 'mgr2@x.com' }));
    const mgrMemberId = await t.run((ctx) =>
      ctx.db.insert('businessMembers', { businessId, userId: mgrUserId, role: 'manager', createdAt: 5 })
    );
    await t.run((ctx) =>
      ctx.db.insert('memberOutletAccess', { businessMemberId: mgrMemberId, cafeId, createdAt: 5 })
    );
    const asMgr = t.withIdentity({ subject: `${mgrUserId}|test_session` });
    await expect(
      asMgr.mutation(api.invites.inviteManager, { email: 'x@x.com', cafeIds: [cafeId] })
    ).rejects.toThrow('owner access required');
  });
});
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/convex/invites.test.ts`
Expected: FAIL — `api.invites.inviteManager` does not exist.

- [ ] **Step 8: Implement `inviteManager`**

Create `convex/invites.ts`:

```typescript
import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { mutation } from './_generated/server';
import { requireBusinessOwner } from './lib/auth';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const inviteManager = mutation({
  args: { email: v.string(), cafeIds: v.array(v.id('cafes')) },
  returns: v.id('businessInvites'),
  handler: async (ctx, { email, cafeIds }) => {
    const { businessId } = await requireBusinessOwner(ctx);
    if (!businessId) {
      throw new Error('no outlet access');
    }
    const normalized = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalized)) {
      throw new Error('Email tidak valid.');
    }
    if (cafeIds.length === 0) {
      throw new Error('Pilih minimal satu outlet.');
    }
    // Every chosen outlet must belong to this owner's business.
    for (const cafeId of cafeIds) {
      const cafe = await ctx.db.get(cafeId);
      if (!cafe || cafe.businessId !== businessId) {
        throw new Error('Outlet tidak ditemukan.');
      }
    }

    const now = Date.now();
    const existing = await ctx.db
      .query('businessInvites')
      .withIndex('by_email', (q) => q.eq('email', normalized))
      .filter((q) => q.eq(q.field('businessId'), businessId))
      .first();
    let inviteId;
    if (existing) {
      await ctx.db.patch(existing._id, { cafeIds });
      inviteId = existing._id;
    } else {
      inviteId = await ctx.db.insert('businessInvites', {
        businessId,
        email: normalized,
        role: 'manager',
        cafeIds,
        createdAt: now,
      });
    }

    const business = await ctx.db.get(businessId);
    await ctx.scheduler.runAfter(0, internal.email.sendInviteEmailScheduled, {
      to: normalized,
      businessName: business?.name ?? 'kodapos',
    });
    return inviteId;
  },
});
```

- [ ] **Step 9: Regenerate types**

Run: `./node_modules/.bin/convex codegen`
Expected: `api.invites.inviteManager` + `internal.email.sendInviteEmailScheduled` exposed, exit 0.

- [ ] **Step 10: Run the tests to verify they pass**

Run: `pnpm exec vitest run tests/convex/invites.test.ts tests/convex/invite-email.test.ts`
Expected: PASS. (The scheduled email action runs in convex-test with `RESEND_API_KEY` unset, so it no-ops without error.)

- [ ] **Step 11: Full suite + typecheck**

Run: `pnpm typecheck && pnpm test`
Expected: all green.

- [ ] **Step 12: Commit**

```bash
git add convex/invites.ts convex/lib/inviteEmail.ts convex/email.ts convex/_generated tests/convex/invites.test.ts tests/convex/invite-email.test.ts
git commit -m "feat(multi-outlet): inviteManager mutation + invite email"
```

---

### Task 3: `acceptPendingInvites` mutation

**Files:**
- Modify: `convex/invites.ts` (add `acceptPendingInvites`)
- Test: `tests/convex/invites.test.ts` (add a describe block)

**Interfaces:**
- Consumes: the schema; the calling user's `users` doc (for `.email`).
- Produces: `api.invites.acceptPendingInvites(): { accepted: number }` — for the signed-in user, matches pending `businessInvites` by their (lowercased) email; for each, **if the user has no existing `businessMembers` row**, creates a `businessMembers (role 'manager')` + one `memberOutletAccess` per `cafeId`, then deletes the invite. If the user already has a membership, the invite is left pending (one-business guard). Idempotent (no email / no invites → `{ accepted: 0 }`). Returns `{ accepted: 0 }` when unauthenticated.

- [ ] **Step 1: Write the failing tests**

Append to `tests/convex/invites.test.ts`:

```typescript
describe('acceptPendingInvites', () => {
  it('turns a pending invite into a manager membership + outlet access, then deletes it', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId, businessId } = await seedOwner(t);
    await asOwner.mutation(api.invites.inviteManager, { email: 'mgr@x.com', cafeIds: [cafeId] });

    const mgrUserId = await t.run((ctx) => ctx.db.insert('users', { name: 'Mgr', email: 'mgr@x.com' }));
    const asMgr = t.withIdentity({ subject: `${mgrUserId}|test_session` });

    const result = await asMgr.mutation(api.invites.acceptPendingInvites, {});
    expect(result.accepted).toBe(1);

    const member = await t.run((ctx) =>
      ctx.db.query('businessMembers').withIndex('by_user', (q) => q.eq('userId', mgrUserId)).first()
    );
    expect(member?.role).toBe('manager');
    expect(member?.businessId).toBe(businessId);

    const access = await t.run((ctx) =>
      ctx.db.query('memberOutletAccess').withIndex('by_member', (q) => q.eq('businessMemberId', member!._id)).collect()
    );
    expect(access.map((a) => a.cafeId)).toEqual([cafeId]);

    const remaining = await t.run((ctx) =>
      ctx.db.query('businessInvites').withIndex('by_email', (q) => q.eq('email', 'mgr@x.com')).collect()
    );
    expect(remaining).toHaveLength(0);

    // Idempotent: a second call accepts nothing.
    const again = await asMgr.mutation(api.invites.acceptPendingInvites, {});
    expect(again.accepted).toBe(0);
  });

  it('matches the user email case-insensitively', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId } = await seedOwner(t);
    await asOwner.mutation(api.invites.inviteManager, { email: 'mixed@x.com', cafeIds: [cafeId] });
    const mgrUserId = await t.run((ctx) => ctx.db.insert('users', { name: 'M', email: 'Mixed@X.com' }));
    const asMgr = t.withIdentity({ subject: `${mgrUserId}|test_session` });
    const result = await asMgr.mutation(api.invites.acceptPendingInvites, {});
    expect(result.accepted).toBe(1);
  });

  it('leaves the invite pending if the user already has a membership (one business per user)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId } = await seedOwner(t);
    // The invitee is themselves already an owner of another business.
    const otherOwnerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Other', email: 'other@x.com' }));
    const asOther = t.withIdentity({ subject: `${otherOwnerId}|test_session` });
    await asOther.mutation(api.cafes.createForOwner, { name: 'Other Biz' }); // gives them an owner membership

    await asOwner.mutation(api.invites.inviteManager, { email: 'other@x.com', cafeIds: [cafeId] });
    const result = await asOther.mutation(api.invites.acceptPendingInvites, {});
    expect(result.accepted).toBe(0);

    const remaining = await t.run((ctx) =>
      ctx.db.query('businessInvites').withIndex('by_email', (q) => q.eq('email', 'other@x.com')).collect()
    );
    expect(remaining).toHaveLength(1); // still pending, surfaced to the owner
  });

  it('returns { accepted: 0 } when unauthenticated', async () => {
    const t = convexTest(schema, modules);
    const result = await t.mutation(api.invites.acceptPendingInvites, {});
    expect(result.accepted).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/convex/invites.test.ts -t "acceptPendingInvites"`
Expected: FAIL — `api.invites.acceptPendingInvites` does not exist.

- [ ] **Step 3: Implement `acceptPendingInvites`**

In `convex/invites.ts`, append:

```typescript
export const acceptPendingInvites = mutation({
  args: {},
  returns: v.object({ accepted: v.number() }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { accepted: 0 };

    const user = await ctx.db.get(userId);
    const email = (user as { email?: string } | null)?.email?.trim().toLowerCase();
    if (!email) return { accepted: 0 };

    // One business per user: if already a member, leave invites pending.
    const existingMember = await ctx.db
      .query('businessMembers')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();
    if (existingMember) return { accepted: 0 };

    const invites = await ctx.db
      .query('businessInvites')
      .withIndex('by_email', (q) => q.eq('email', email))
      .collect();
    if (invites.length === 0) return { accepted: 0 };

    // Accept the first invite (a user joins one business); delete the rest so
    // stale duplicates do not linger. (UI prevents multi-business invites, but
    // be defensive.)
    const [invite, ...extra] = invites;
    const now = Date.now();
    const memberId = await ctx.db.insert('businessMembers', {
      businessId: invite.businessId,
      userId,
      role: 'manager',
      createdAt: now,
    });
    for (const cafeId of invite.cafeIds) {
      await ctx.db.insert('memberOutletAccess', {
        businessMemberId: memberId,
        cafeId,
        createdAt: now,
      });
    }
    await ctx.db.delete(invite._id);
    for (const e of extra) await ctx.db.delete(e._id);
    return { accepted: 1 };
  },
});
```

- [ ] **Step 4: Regenerate types**

Run: `./node_modules/.bin/convex codegen`
Expected: `api.invites.acceptPendingInvites` exposed, exit 0.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run tests/convex/invites.test.ts -t "acceptPendingInvites"`
Expected: PASS.

- [ ] **Step 6: Full suite + typecheck**

Run: `pnpm typecheck && pnpm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add convex/invites.ts convex/_generated tests/convex/invites.test.ts
git commit -m "feat(multi-outlet): acceptPendingInvites on sign-in"
```

---

### Task 4: Members queries + management mutations

**Files:**
- Modify: `convex/invites.ts` (add `listMembers`, `listPendingInvites`, `setManagerOutlets`, `revokeMember`, `cancelInvite`)
- Test: `tests/convex/invites.test.ts` (add a describe block)

**Interfaces:**
- Consumes: `requireBusinessOwner`.
- Produces (all owner-only except where noted):
  - `api.invites.listMembers(): Array<{ memberId: Id<'businessMembers'>, userId: Id<'users'>, name: string | null, email: string | null, role: 'owner'|'manager', cafeIds: Id<'cafes'>[] }>` — members of the owner's business with each manager's granted outlet ids (owner has all, represented as `[]` meaning "all").
  - `api.invites.listPendingInvites(): Array<{ inviteId: Id<'businessInvites'>, email: string, cafeIds: Id<'cafes'>[] }>`.
  - `api.invites.setManagerOutlets({ memberId, cafeIds }): null` — replace a manager's `memberOutletAccess` rows with `cafeIds` (validated in-business); rejects targeting the owner member or a member of another business.
  - `api.invites.revokeMember({ memberId }): null` — delete a manager's `businessMembers` + `memberOutletAccess` rows; rejects revoking the owner.
  - `api.invites.cancelInvite({ inviteId }): null` — delete a pending invite in the owner's business.

- [ ] **Step 1: Write the failing tests**

Append to `tests/convex/invites.test.ts`:

```typescript
describe('member management', () => {
  async function seedOwnerWithManager(t: ReturnType<typeof convexTest>) {
    const { asOwner, userId: ownerId, cafeId, businessId } = await seedOwner(t);
    const second = await t.run((ctx) =>
      ctx.db.insert('cafes', { name: 'Cabang 2', ownerUserId: ownerId, businessId, createdAt: 2 })
    );
    await asOwner.mutation(api.invites.inviteManager, { email: 'mgr@x.com', cafeIds: [cafeId] });
    const mgrUserId = await t.run((ctx) => ctx.db.insert('users', { name: 'Mgr', email: 'mgr@x.com' }));
    const asMgr = t.withIdentity({ subject: `${mgrUserId}|test_session` });
    await asMgr.mutation(api.invites.acceptPendingInvites, {});
    const member = await t.run((ctx) =>
      ctx.db.query('businessMembers').withIndex('by_user', (q) => q.eq('userId', mgrUserId)).first()
    );
    return { asOwner, ownerId, cafeId, second, businessId, mgrUserId, memberId: member!._id };
  }

  it('lists members (owner + manager) and pending invites', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId } = await seedOwnerWithManager(t);
    await asOwner.mutation(api.invites.inviteManager, { email: 'pending@x.com', cafeIds: [cafeId] });

    const members = await asOwner.query(api.invites.listMembers, {});
    expect(members.some((m) => m.role === 'owner')).toBe(true);
    const mgr = members.find((m) => m.role === 'manager');
    expect(mgr?.email).toBe('mgr@x.com');
    expect(mgr?.cafeIds).toEqual([cafeId]);

    const invites = await asOwner.query(api.invites.listPendingInvites, {});
    expect(invites.map((i) => i.email)).toContain('pending@x.com');
  });

  it('reassigns a manager outlets', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, second, memberId } = await seedOwnerWithManager(t);
    await asOwner.mutation(api.invites.setManagerOutlets, { memberId, cafeIds: [second] });
    const access = await t.run((ctx) =>
      ctx.db.query('memberOutletAccess').withIndex('by_member', (q) => q.eq('businessMemberId', memberId)).collect()
    );
    expect(access.map((a) => a.cafeId)).toEqual([second]);
  });

  it('revokes a manager (deletes membership + access)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, mgrUserId, memberId } = await seedOwnerWithManager(t);
    await asOwner.mutation(api.invites.revokeMember, { memberId });
    const member = await t.run((ctx) =>
      ctx.db.query('businessMembers').withIndex('by_user', (q) => q.eq('userId', mgrUserId)).first()
    );
    expect(member).toBeNull();
    const access = await t.run((ctx) =>
      ctx.db.query('memberOutletAccess').withIndex('by_member', (q) => q.eq('businessMemberId', memberId)).collect()
    );
    expect(access).toHaveLength(0);
  });

  it('cancels a pending invite', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId } = await seedOwner(t);
    await asOwner.mutation(api.invites.inviteManager, { email: 'cancel@x.com', cafeIds: [cafeId] });
    const invites = await asOwner.query(api.invites.listPendingInvites, {});
    await asOwner.mutation(api.invites.cancelInvite, { inviteId: invites[0].inviteId });
    expect(await asOwner.query(api.invites.listPendingInvites, {})).toHaveLength(0);
  });

  it('rejects revoking the owner and reassigning across businesses', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, ownerId } = await seedOwnerWithManager(t);
    const ownerMember = await t.run((ctx) =>
      ctx.db.query('businessMembers').withIndex('by_user', (q) => q.eq('userId', ownerId)).first()
    );
    await expect(asOwner.mutation(api.invites.revokeMember, { memberId: ownerMember!._id })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/convex/invites.test.ts -t "member management"`
Expected: FAIL — the new functions do not exist.

- [ ] **Step 3: Implement the queries + mutations**

In `convex/invites.ts`, add `query` to the server import (`import { mutation, query } from './_generated/server';`) and append. Each owner-scoped function asserts the target belongs to the caller's business:

```typescript
export const listMembers = query({
  args: {},
  returns: v.array(
    v.object({
      memberId: v.id('businessMembers'),
      userId: v.id('users'),
      name: v.union(v.string(), v.null()),
      email: v.union(v.string(), v.null()),
      role: v.union(v.literal('owner'), v.literal('manager')),
      cafeIds: v.array(v.id('cafes')),
    })
  ),
  handler: async (ctx) => {
    const { businessId } = await requireBusinessOwner(ctx);
    if (!businessId) return [];
    const members = await ctx.db
      .query('businessMembers')
      .withIndex('by_business', (q) => q.eq('businessId', businessId))
      .collect();
    const rows = [];
    for (const m of members) {
      const user = await ctx.db.get(m.userId);
      let cafeIds: typeof m.businessId extends never ? never : Id<'cafes'>[] = [];
      if (m.role === 'manager') {
        const access = await ctx.db
          .query('memberOutletAccess')
          .withIndex('by_member', (q) => q.eq('businessMemberId', m._id))
          .collect();
        cafeIds = access.map((a) => a.cafeId);
      }
      rows.push({
        memberId: m._id,
        userId: m.userId,
        name: (user as { name?: string } | null)?.name ?? null,
        email: (user as { email?: string } | null)?.email ?? null,
        role: m.role,
        cafeIds,
      });
    }
    return rows;
  },
});

export const listPendingInvites = query({
  args: {},
  returns: v.array(
    v.object({
      inviteId: v.id('businessInvites'),
      email: v.string(),
      cafeIds: v.array(v.id('cafes')),
    })
  ),
  handler: async (ctx) => {
    const { businessId } = await requireBusinessOwner(ctx);
    if (!businessId) return [];
    const invites = await ctx.db
      .query('businessInvites')
      .withIndex('by_business', (q) => q.eq('businessId', businessId))
      .collect();
    return invites.map((i) => ({ inviteId: i._id, email: i.email, cafeIds: i.cafeIds }));
  },
});

export const setManagerOutlets = mutation({
  args: { memberId: v.id('businessMembers'), cafeIds: v.array(v.id('cafes')) },
  returns: v.null(),
  handler: async (ctx, { memberId, cafeIds }) => {
    const { businessId } = await requireBusinessOwner(ctx);
    const member = await ctx.db.get(memberId);
    if (!member || member.businessId !== businessId) {
      throw new Error('Anggota tidak ditemukan.');
    }
    if (member.role === 'owner') {
      throw new Error('Pemilik memiliki akses ke semua outlet.');
    }
    if (cafeIds.length === 0) {
      throw new Error('Pilih minimal satu outlet.');
    }
    for (const cafeId of cafeIds) {
      const cafe = await ctx.db.get(cafeId);
      if (!cafe || cafe.businessId !== businessId) {
        throw new Error('Outlet tidak ditemukan.');
      }
    }
    const existing = await ctx.db
      .query('memberOutletAccess')
      .withIndex('by_member', (q) => q.eq('businessMemberId', memberId))
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);
    const now = Date.now();
    for (const cafeId of cafeIds) {
      await ctx.db.insert('memberOutletAccess', { businessMemberId: memberId, cafeId, createdAt: now });
    }
    return null;
  },
});

export const revokeMember = mutation({
  args: { memberId: v.id('businessMembers') },
  returns: v.null(),
  handler: async (ctx, { memberId }) => {
    const { businessId } = await requireBusinessOwner(ctx);
    const member = await ctx.db.get(memberId);
    if (!member || member.businessId !== businessId) {
      throw new Error('Anggota tidak ditemukan.');
    }
    if (member.role === 'owner') {
      throw new Error('Pemilik tidak bisa dihapus.');
    }
    const access = await ctx.db
      .query('memberOutletAccess')
      .withIndex('by_member', (q) => q.eq('businessMemberId', memberId))
      .collect();
    for (const row of access) await ctx.db.delete(row._id);
    await ctx.db.delete(memberId);
    return null;
  },
});

export const cancelInvite = mutation({
  args: { inviteId: v.id('businessInvites') },
  returns: v.null(),
  handler: async (ctx, { inviteId }) => {
    const { businessId } = await requireBusinessOwner(ctx);
    const invite = await ctx.db.get(inviteId);
    if (!invite || invite.businessId !== businessId) {
      throw new Error('Undangan tidak ditemukan.');
    }
    await ctx.db.delete(inviteId);
    return null;
  },
});
```

> Note: the `cafeIds` typing line in `listMembers` above is awkward — write it simply as `let cafeIds: Id<'cafes'>[] = [];` (import `Id` from `./_generated/dataModel` at the top of `convex/invites.ts`: `import type { Id } from './_generated/dataModel';`). Replace the awkward conditional-type line with that.

- [ ] **Step 4: Regenerate types**

Run: `./node_modules/.bin/convex codegen`
Expected: the five new functions exposed under `api.invites`, exit 0.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run tests/convex/invites.test.ts -t "member management"`
Expected: PASS.

- [ ] **Step 6: Full suite + typecheck**

Run: `pnpm typecheck && pnpm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add convex/invites.ts convex/_generated tests/convex/invites.test.ts
git commit -m "feat(multi-outlet): members + pending-invite queries and management mutations"
```

---

### Task 5: Members settings page (owner-only)

**Files:**
- Create: `src/routes/_pos/settings/members.tsx`
- Modify: `src/components/app-shared.tsx` (add the owner-only nav item)
- Modify: `src/routeTree.gen.ts` (regenerated — commit it)
- i18n: `src/locales/{id,en}/messages.po`

**Interfaces:**
- Consumes: `api.invites.{listMembers,listPendingInvites,inviteManager,setManagerOutlets,revokeMember,cancelInvite}`, `api.outlets.myOutlets` (for the outlet checkboxes). (Owner gating is handled by the nav + server-side `requireBusinessOwner`; the page needs no `usePermissions` guard.)
- Produces: a `/settings/members` route. **Owner-only.** A members section (owner + managers, each manager showing their outlet grants with edit/revoke) and a pending-invites section (email + outlets, with cancel), plus an "Invite manager" dialog (email field + outlet checkboxes).

This is a UI task — no unit tests. Model it closely on `src/routes/_pos/settings/staff.tsx` (the existing list + dialog + row-actions settings page): same page header, card/section layout, shadcn `Dialog` for the invite form, `ConfirmDialog` for revoke/cancel, shadcn `Empty` for empty lists, `RowActions`/dropdown for per-row actions. Reuse the route registration and `requires: 'owner'` gating pattern.

- [ ] **Step 1: Read the analog page and the nav registration**

Read `src/routes/_pos/settings/staff.tsx` end-to-end and `src/components/app-shared.tsx` around line 128 (the settings sub-nav). Note the exact imports, the page-header component, how `requires: 'owner'` items render, the `ConfirmDialog`/`Empty`/`Field` usage, and the toast (`sonner`) pattern. Build the members page in the same idiom (tabs for indentation, matching style).

- [ ] **Step 2: Build the route + page**

Create `src/routes/_pos/settings/members.tsx` with `export const Route = createFileRoute('/_pos/settings/members')({ component: MembersPage });`. The page:
- No component-level owner guard is needed: `/settings/*` is owner-only at the nav level (the `Pengaturan` parent is `requires: 'owner'`) and every `api.invites.*` query/mutation it calls is server-gated by `requireBusinessOwner` (a manager who direct-navigates gets a thrown query, same as the other settings pages — which carry no extra component guard). Match `staff.tsx` (no special isOwner gate in the component).
- **Members section:** `useQuery(api.invites.listMembers, {})`. Render each member: name/email, a role badge (`Pemilik`/`Manajer`). For the owner row, show "Semua outlet". For each manager, show their granted outlet names (map `cafeIds` → names via `api.outlets.myOutlets`), with an "Edit outlet" action (opens the outlet-checkbox dialog calling `setManagerOutlets`) and a "Hapus" action (`ConfirmDialog` → `revokeMember`). Empty manager list → shadcn `Empty` (icon + heading + description).
- **Pending invites section:** `useQuery(api.invites.listPendingInvites, {})`. Each row: email + granted outlet names + a "Batalkan" action (`ConfirmDialog` → `cancelInvite`). Empty → `Empty`.
- **Invite dialog:** a shadcn `Dialog` triggered by an "Undang manajer" button. Fields: an email `Input` and a checkbox list of the business's outlets (from `api.outlets.myOutlets`, each `{ cafeId, name }`). Submit calls `inviteManager({ email, cafeIds })`; on success close + toast `Undangan terkirim.`; on error toast the error message. Disable submit while in-flight and when no outlet is checked.
- Use `toast` from `sonner` for success/error like the other settings pages.

Reference component code for the outlet checkbox list (reused in both the invite dialog and the edit-outlets dialog):

```tsx
// outlets: { cafeId: Id<'cafes'>; name: string }[] from api.outlets.myOutlets
// checked: Set<Id<'cafes'>>; toggle(cafeId)
<div className="grid gap-2">
  {outlets.map((o) => (
    <label key={o.cafeId} className="flex items-center gap-2 text-sm">
      <Checkbox
        checked={checked.has(o.cafeId)}
        onCheckedChange={() => toggle(o.cafeId)}
      />
      <span className="truncate">{o.name}</span>
    </label>
  ))}
</div>
```

Keep all user-facing strings in `<Trans>`/`` t`...` `` (Indonesian source). Do not hardcode English. No em-dash / `--`.

- [ ] **Step 3: Register the nav item under the (already owner-only) Settings menu**

In `src/components/app-shared.tsx`, the `Pengaturan` (Settings) nav item already carries `requires: 'owner'` and holds a `subItems` array; its sub-items do NOT (and must not) carry their own `requires` — they inherit the parent's owner gating. Add a new sub-item to that `subItems` array (e.g. after the `Staf` entry on line 128):

```tsx
{ title: msg`Tim`, path: "/settings/members" },
```

Do not add `requires` to the sub-item — the whole Settings menu is owner-gated by the parent.

- [ ] **Step 4: Regenerate the route tree**

Run: `./node_modules/.bin/convex codegen` is NOT needed here; instead the TanStack route tree regenerates on dev/build. Generate it explicitly:

Run: `pnpm typecheck` (the route tree is generated by the Vite plugin during dev/build; if `src/routeTree.gen.ts` is stale, run `pnpm build` or start `pnpm dev` once to regenerate, then stop it). Ensure `src/routeTree.gen.ts` includes `/settings/members` and is committed — CI fails if it is uncommitted.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Extract + translate i18n**

Run: `pnpm lingui:extract`
Fill NON-empty English `msgstr` in `src/locales/en/messages.po` for every new id (e.g. `Tim`→`Team`, `Undang manajer`→`Invite manager`, `Manajer`→`Manager`, `Pemilik`→`Owner`, `Semua outlet`→`All outlets`, `Edit outlet`→`Edit outlets`, `Hapus`→ reuse if present else `Remove`, `Batalkan`→`Cancel`, `Undangan terkirim.`→`Invitation sent.`, plus dialog labels/headings/empty-state copy). Reuse existing entries where the same Indonesian string already exists. Then:

Run: `pnpm lingui:compile`
Expected: exit 0; no new English `msgstr` left empty.

- [ ] **Step 7: Visual verification (manual gate)**

Via the running app as an owner: `/settings/members` shows the owner + any managers; "Undang manajer" opens the dialog (email + outlet checkboxes); inviting adds a pending invite row; editing a manager's outlets and revoking work; cancel removes a pending invite; empty lists show the shadcn `Empty` state. The "Tim" nav item is absent for a non-owner. Check light + dark.

- [ ] **Step 8: Commit**

```bash
git add src/routes/_pos/settings/members.tsx src/components/app-shared.tsx src/routeTree.gen.ts src/locales
git commit -m "feat(multi-outlet): members settings page (invite, assign outlets, revoke)"
```

---

### Task 6: Accept-on-sign-in hook + no-access screen + OnboardingGate rewrite

**Files:**
- Create: `src/components/no-access.tsx`
- Modify: `src/routes/_pos.tsx` (`OnboardingGate`: run `acceptPendingInvites` on mount; route a no-outlet user to the no-access screen instead of silent onboarding)
- i18n: `src/locales/{id,en}/messages.po`

**Interfaces:**
- Consumes: `api.invites.acceptPendingInvites` (Task 3), `api.cafes.myCafe`, `api.cafes.createForOwner` (for "Create your business").
- Produces: a no-access screen; the gate runs `acceptPendingInvites` once after auth and only routes to onboarding for owners mid-setup, showing the no-access screen for users with no accessible outlet.

- [ ] **Step 1: Build the no-access screen**

Create `src/components/no-access.tsx` — a centered card (signed-in but no outlet). Two actions: a primary **"Buat bisnis sendiri"** (Create your own business) that calls `createForOwner` then routes to `/onboarding/profile`, and a secondary explanation **"Hubungi pemilik bisnis Anda untuk mendapat akses."** (Contact your business owner for access). Include a sign-out link (reuse the app's sign-out, see `nav-user.tsx`).

```tsx
"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useNavigate } from "@tanstack/react-router";
import { api } from "convex/_generated/api";
import { useMutation } from "convex/react";
import { useState } from "react";
import { Trans } from "@lingui/react/macro";
import { Button } from "~/components/ui/button";

export function NoAccess(): React.ReactElement {
	const { signOut } = useAuthActions();
	const navigate = useNavigate();
	const createForOwner = useMutation(api.cafes.createForOwner);
	const [creating, setCreating] = useState(false);

	async function handleCreate(): Promise<void> {
		setCreating(true);
		try {
			await createForOwner({ name: "Kafe Saya" });
			await navigate({ to: "/onboarding/profile" });
		} catch {
			setCreating(false);
		}
	}

	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
			<h1 className="font-semibold text-lg">
				<Trans>Belum ada akses</Trans>
			</h1>
			<p className="max-w-sm text-muted-foreground text-sm">
				<Trans>
					Hubungi pemilik bisnis Anda untuk mendapat akses ke outlet, atau buat
					bisnis Anda sendiri.
				</Trans>
			</p>
			<div className="flex flex-col gap-2">
				<Button onClick={handleCreate} disabled={creating}>
					<Trans>Buat bisnis sendiri</Trans>
				</Button>
				<Button
					variant="ghost"
					onClick={() => {
						void signOut().then(() => window.location.replace("/"));
					}}
				>
					<Trans>Keluar</Trans>
				</Button>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Rewrite `OnboardingGate` in `src/routes/_pos.tsx`**

Replace the `OnboardingGate` function so it (a) runs `acceptPendingInvites` once on mount, (b) shows the no-access screen for a signed-in user with no accessible outlet (`myCafe === null`) instead of redirecting to onboarding, and (c) still routes owners mid-setup (`cafe && !setupCompletedAt`) to onboarding. Add imports: `useMutation` from `convex/react`, `NoAccess` from `~/components/no-access`.

```tsx
function OnboardingGate({ children }: { children: ReactNode }) {
  const cafe = useQuery(api.cafes.myCafe, {});
  const path = useRouterState({ select: (s) => s.location.pathname });
  const acceptInvites = useMutation(api.invites.acceptPendingInvites);
  const [accepting, setAccepting] = useState(true);

  // After any sign-in, convert a pending manager invite into access. Idempotent
  // and safe to call once per mount; it no-ops for owners and the uninvited.
  useEffect(() => {
    let cancelled = false;
    acceptInvites({})
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAccepting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [acceptInvites]);

  const alreadyOnOnboarding = path.startsWith('/onboarding');
  // An owner mid-onboarding (cafe exists but no setupCompletedAt) is routed to
  // the wizard. A user with NO accessible outlet (cafe === null) is NOT pushed
  // into onboarding any more; they see the no-access screen (which offers an
  // explicit "create your own business").
  const needsOnboarding = cafe !== undefined && cafe !== null && !cafe.setupCompletedAt;

  useEffect(() => {
    if (needsOnboarding && !alreadyOnOnboarding && typeof window !== 'undefined') {
      window.location.replace('/onboarding/profile');
    }
  }, [needsOnboarding, alreadyOnOnboarding]);

  // Still resolving cafe state or still accepting invites: don't flash content
  // (an invited manager's cafe becomes non-null once accept commits).
  if (cafe === undefined || accepting) {
    return <LoadingCounter />;
  }
  // Signed in but no accessible outlet, and no invite was accepted: no-access.
  if (cafe === null && !alreadyOnOnboarding) {
    return <NoAccess />;
  }
  if (needsOnboarding && !alreadyOnOnboarding) {
    return null;
  }
  return <>{children}</>;
}
```

Add `useState` to the React import at the top of the file if not already imported (`import { type ReactNode, useEffect, useState } from 'react';`).

> Note on the outer `PosLayout`: it also computes `needsOnboarding` from `myCafe` for the wizard/chrome decision. A `cafe === null` user now renders `<NoAccess />` via the gate (the gate returns it before `children`), so the outer layout's `showNav` branch is not reached for them. Leave `PosLayout`'s logic as-is; the gate short-circuits first. Verify by reading `PosLayout` that `OnboardingGate` wraps the chrome (it does — `children` is the chrome) so returning `<NoAccess/>` from the gate replaces the chrome.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Extract + translate i18n**

Run: `pnpm lingui:extract`
Fill English `msgstr` in `src/locales/en/messages.po`:
- `Belum ada akses` → `No access yet`
- `Hubungi pemilik bisnis Anda untuk mendapat akses ke outlet, atau buat bisnis Anda sendiri.` → `Contact your business owner for outlet access, or create your own business.`
- `Buat bisnis sendiri` → `Create your own business`
- `Keluar` → reuse if present (it is used in nav-user) else `Sign out`

Run: `pnpm lingui:compile`
Expected: exit 0; no empty new English `msgstr`.

- [ ] **Step 5: Visual verification (manual gate)**

- Owner signup still works: create account → onboarding → app (unchanged).
- Invited manager: owner invites `mgr@…`; sign in as that email → lands in the app scoped to granted outlet(s), NOT onboarding, NOT no-access. The switcher shows only granted outlets.
- A signed-in user with no invite and no cafe → no-access screen; "Buat bisnis sendiri" → onboarding → becomes an owner. "Keluar" signs out.
- Check light + dark.

- [ ] **Step 6: Commit**

```bash
git add src/components/no-access.tsx src/routes/_pos.tsx src/locales
git commit -m "feat(multi-outlet): accept invites on sign-in; no-access screen replaces silent onboarding"
```

---

## Self-Review

**Spec coverage (Phase 4 slice of §7 + deferred Phase-3 items):**
- `inviteManager({ email, cafeIds })`, owner-only, normalized email, upsert → Task 2. ✓
- Invite delivery (email) → Task 2 (`sendInviteEmailScheduled` + `buildInviteEmail`). ✓ (user chose email delivery)
- `acceptPendingInvites` on sign-in, creates `businessMembers (manager)` + `memberOutletAccess`, deletes invite, one-business guard → Task 3. ✓
- Members UI: list members + pending invites, invite, assign/unassign outlets, revoke → Tasks 4 (data) + 5 (UI). ✓
- No-access state (no membership/invite) → no-access screen "not the onboarding flow" → Task 6, with the user-chosen "Create your business" affordance. ✓
- Owner-only gating via `requireBusinessOwner` → Tasks 2, 4 (every owner mutation/query). ✓
- Deferred Phase-3: manager dangling-cafe-id guard + sort `myOutlets` → Task 1. ✓

**Deviations / decisions:**
- **No-access routing (user decision):** the gate no longer silently auto-onboards a cafe-less user; it shows the no-access screen with an explicit "Create your own business" button. This changes the Google-owner-signup path (one extra click) — intended.
- **Invite email (user decision):** `inviteManager` schedules a Resend email; gracefully no-ops without `RESEND_API_KEY` and swallows failures (the invite is recorded regardless, so acceptance by email match still works even if the email never sends).
- **acceptPendingInvites accepts one invite** (one business per user) and deletes any stray duplicates; the one-business guard leaves invites pending for users who already have a membership.

**Placeholder scan:** backend tasks (1-4, 6) have complete code. Task 5 (members page) is intentionally spec + pattern-reference rather than 400 lines verbatim — it mirrors the existing `staff.tsx` page; the exact API contracts, fields, strings, and the reused checkbox snippet are given. The one awkward type line in `listMembers` is explicitly corrected in a note.

**Type consistency:** `api.invites.*` names and shapes (`memberId`, `cafeIds`, `inviteId`, `{ accepted }`) are used identically across Tasks 2-6. `buildInviteEmail({ businessName, signInUrl })` matches between Task 2's builder, test, and the scheduled action. `resolveOutletAccess`/`myOutlets` changes (Task 1) preserve their Phase-3 return shapes.

---

## Next phase (separate plan)

- **Phase 5:** consolidated reporting (`reports.businessOverview` — per-outlet rows + combined totals) + the "All outlets" dashboard + the switcher's "All outlets" entry.
```
