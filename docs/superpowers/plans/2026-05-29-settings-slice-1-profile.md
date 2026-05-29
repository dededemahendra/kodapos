# Settings Slice 1 — Profile page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Turn the basic Profile settings page into a rich, multi-section page (identity, logo, contacts, address, region, operating hours) backed by the server, without breaking the shared onboarding flow.

**Architecture:** Extend the `cafes` table with optional profile fields + a logo `storageId`. Add a tax-free `cafes.updateProfileDetails` mutation (onboarding keeps using the existing `cafes.updateProfile`, which still owns tax). Extend `cafes.myCafe` to return the new fields plus a resolved `logoUrl`. Rebuild `src/routes/_pos/settings/profile.tsx` with the Slice 0 primitives (`SettingsSection`, `SettingRow`, `SaveBar`, `useEditableState`). Logo upload uses Convex storage (`generateUploadUrl` → `setLogo`).

**Tech Stack:** Convex, TanStack Router, React, shadcn/ui, `@lingui/react/macro`.

**Reference spec:** `docs/superpowers/specs/2026-05-29-settings-pages-design.md`

> Onboarding (`src/routes/_pos/onboarding/profile.tsx`) and `CafeProfileForm` keep using `cafes.updateProfile` unchanged — do NOT modify them.

---

## Task 1: Extend `cafes` schema

**Files:** Modify `convex/schema.ts` (the `cafes` table, ~lines 8–21).

- [ ] **Step 1:** Add these optional fields inside the `cafes` `defineTable({...})`, after `setupCompletedAt`:

```ts
    businessType: v.optional(v.string()),
    whatsapp: v.optional(v.string()),
    email: v.optional(v.string()),
    instagram: v.optional(v.string()),
    city: v.optional(v.string()),
    postalCode: v.optional(v.string()),
    logoStorageId: v.optional(v.id('_storage')),
    operatingHours: v.optional(
      v.array(
        v.object({
          day: v.number(), // 0=Mon .. 6=Sun
          open: v.boolean(),
          openTime: v.string(), // 'HH:MM'
          closeTime: v.string(),
        })
      )
    ),
```

- [ ] **Step 2:** Run `npx convex codegen` then `pnpm typecheck`. Expected: PASS.
- [ ] **Step 3:** Commit: `git add convex/schema.ts convex/_generated && git commit -m "feat(profile): extend cafes with profile detail fields"`

---

## Task 2: Backend — `myCafe` returns new fields + logoUrl, plus `updateProfileDetails`, `generateUploadUrl`, `setLogo`, `removeLogo`

**Files:** Modify `convex/cafes.ts`; add tests to a new `tests/convex/cafes.details.test.ts`.

- [ ] **Step 1 (TDD): Write failing tests** — create `tests/convex/cafes.details.test.ts`:

```ts
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function seedOwner(t: ReturnType<typeof convexTest>) {
  const userId = await t.run(async (ctx) =>
    ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' })
  );
  await t
    .withIdentity({ subject: `${userId}|test_session` })
    .mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  return userId;
}

describe('cafes.updateProfileDetails', () => {
  it('writes the extended profile fields without touching tax', async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });

    await asOwner.mutation(api.cafes.updateProfileDetails, {
      name: 'Kopi Senja',
      businessType: 'cafe',
      phone: '0812',
      whatsapp: '0813',
      email: 'a@b.com',
      instagram: 'kopisenja',
      addressLine: 'Jl. Sudirman 1',
      city: 'Jakarta',
      postalCode: '12345',
      timezone: 'Asia/Jakarta',
      operatingHours: [
        { day: 0, open: true, openTime: '08:00', closeTime: '22:00' },
      ],
    });

    const cafe = await asOwner.query(api.cafes.myCafe);
    expect(cafe?.businessType).toBe('cafe');
    expect(cafe?.whatsapp).toBe('0813');
    expect(cafe?.city).toBe('Jakarta');
    expect(cafe?.operatingHours?.[0]?.openTime).toBe('08:00');
    // tax defaults from createForOwner remain untouched
    expect(cafe?.taxRatePct).toBe(11);
    expect(cafe?.taxEnabled).toBe(true);
  });

  it('rejects empty name', async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
    await expect(
      asOwner.mutation(api.cafes.updateProfileDetails, {
        name: '   ',
        timezone: 'Asia/Jakarta',
      })
    ).rejects.toThrow(/nama/i);
  });

  it('clears optional fields when given empty strings', async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
    await asOwner.mutation(api.cafes.updateProfileDetails, {
      name: 'Kopi Senja',
      city: 'Jakarta',
      timezone: 'Asia/Jakarta',
    });
    await asOwner.mutation(api.cafes.updateProfileDetails, {
      name: 'Kopi Senja',
      city: '',
      timezone: 'Asia/Jakarta',
    });
    const cafe = await asOwner.query(api.cafes.myCafe);
    expect(cafe?.city).toBeUndefined();
  });
});
```

- [ ] **Step 2:** Run `pnpm test -- tests/convex/cafes.details.test.ts` → FAIL (`updateProfileDetails` undefined).

- [ ] **Step 3: Implement in `convex/cafes.ts`.**

(a) Refactor the existing `cafeDoc` so its field map is reusable, and add the new optional fields. Replace the current `const cafeDoc = v.object({...})` with:

```ts
const cafeFields = {
  _id: v.id('cafes'),
  _creationTime: v.number(),
  name: v.string(),
  ownerUserId: v.id('users'),
  createdAt: v.number(),
  phone: v.optional(v.string()),
  addressLine: v.optional(v.string()),
  timezone: v.optional(v.string()),
  taxRatePct: v.optional(v.number()),
  taxEnabled: v.optional(v.boolean()),
  setupCompletedAt: v.optional(v.number()),
  businessType: v.optional(v.string()),
  whatsapp: v.optional(v.string()),
  email: v.optional(v.string()),
  instagram: v.optional(v.string()),
  city: v.optional(v.string()),
  postalCode: v.optional(v.string()),
  logoStorageId: v.optional(v.id('_storage')),
  operatingHours: v.optional(
    v.array(
      v.object({
        day: v.number(),
        open: v.boolean(),
        openTime: v.string(),
        closeTime: v.string(),
      })
    )
  ),
};
const cafeDoc = v.object(cafeFields);
```

Leave the `mine` query returning `v.array(cafeDoc)` as-is.

(b) Change `myCafe`'s return validator to add a resolved `logoUrl`, and resolve it in the handler:

```ts
export const myCafe = query({
  args: {},
  returns: v.union(
    v.object({ ...cafeFields, logoUrl: v.optional(v.string()) }),
    v.null()
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const cafe = await ctx.db
      .query('cafes')
      .withIndex('by_owner', (q) => q.eq('ownerUserId', userId))
      .first();
    if (!cafe) return null;
    const logoUrl = cafe.logoStorageId
      ? await ctx.storage.getUrl(cafe.logoStorageId)
      : null;
    return { ...cafe, ...(logoUrl ? { logoUrl } : {}) };
  },
});
```

(c) Add the new mutation `updateProfileDetails` (NO tax fields):

```ts
export const updateProfileDetails = mutation({
  args: {
    name: v.string(),
    businessType: v.optional(v.string()),
    phone: v.optional(v.string()),
    whatsapp: v.optional(v.string()),
    email: v.optional(v.string()),
    instagram: v.optional(v.string()),
    addressLine: v.optional(v.string()),
    city: v.optional(v.string()),
    postalCode: v.optional(v.string()),
    timezone: v.string(),
    operatingHours: v.optional(
      v.array(
        v.object({
          day: v.number(),
          open: v.boolean(),
          openTime: v.string(),
          closeTime: v.string(),
        })
      )
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const name = args.name.trim();
    if (name.length < 1) throw new Error('Nama kafe wajib diisi.');
    if (name.length > 80) throw new Error('Nama kafe maksimal 80 karakter.');
    const clean = (s?: string) => s?.trim() || undefined;
    await ctx.db.patch(cafeId, {
      name,
      businessType: clean(args.businessType),
      phone: clean(args.phone),
      whatsapp: clean(args.whatsapp),
      email: clean(args.email),
      instagram: clean(args.instagram),
      addressLine: clean(args.addressLine),
      city: clean(args.city),
      postalCode: clean(args.postalCode),
      timezone: args.timezone,
      operatingHours: args.operatingHours,
    });
    return null;
  },
});
```

(d) Add logo mutations:

```ts
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireOwnerCafe(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const setLogo = mutation({
  args: { storageId: v.id('_storage') },
  returns: v.null(),
  handler: async (ctx, { storageId }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const cafe = await ctx.db.get(cafeId);
    if (cafe?.logoStorageId) await ctx.storage.delete(cafe.logoStorageId);
    await ctx.db.patch(cafeId, { logoStorageId: storageId });
    return null;
  },
});

export const removeLogo = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const cafe = await ctx.db.get(cafeId);
    if (cafe?.logoStorageId) {
      await ctx.storage.delete(cafe.logoStorageId);
      await ctx.db.patch(cafeId, { logoStorageId: undefined });
    }
    return null;
  },
});
```

- [ ] **Step 4:** Run `pnpm test -- tests/convex/cafes.details.test.ts` and `pnpm typecheck` → PASS. (`convex-test` supports `ctx.storage`.)
- [ ] **Step 5:** Commit: `git add convex/cafes.ts tests/convex/cafes.details.test.ts convex/_generated && git commit -m "feat(profile): add updateProfileDetails + logo upload mutations"`

---

## Task 3: Rebuild the Profile settings page

**Files:** Rewrite `src/routes/_pos/settings/profile.tsx`.

Build a rich page using the Slice 0 primitives. Requirements:

- Use `SettingsPageHeader` title `<Trans>Profil kafe</Trans>`, description `<Trans>Kelola identitas, kontak, dan jam operasional kafe Anda.</Trans>`.
- Loading state: `cafe === undefined` → `<Trans>Memuat…</Trans>`; `cafe === null` → `<Trans>Kafe tidak ditemukan.</Trans>`.
- Build a `draft` object from the loaded `cafe` and drive it with `useEditableState`. Shape:
  `{ name, businessType, phone, whatsapp, email, instagram, addressLine, city, postalCode, timezone, operatingHours }` where `operatingHours` is always a 7-element array (default each day open 08:00–22:00 if the cafe has none).
- Sections (each a `SettingsSection` with `SettingRow`s + `RowSep` between rows):
  1. **Identitas** (`<Trans>Identitas</Trans>`): name (`Input`, required, maxLength 80); businessType (`Select`: cafe→"Kafe", restoran→"Restoran", coffee_shop→"Kedai kopi", bakery→"Bakery", bar→"Bar", other→"Lainnya"); logo (preview `<img>` from `cafe.logoUrl` if present, an upload control, and a remove button).
  2. **Kontak** (`<Trans>Kontak</Trans>`): phone (tel), whatsapp (tel), email (email), instagram (text, placeholder `@namakafe`).
  3. **Alamat** (`<Trans>Alamat</Trans>`): addressLine, city, postalCode (inputMode numeric).
  4. **Wilayah** (`<Trans>Wilayah</Trans>`): timezone (`Select`: Asia/Jakarta→"WIB (Jakarta)", Asia/Makassar→"WITA (Makassar)", Asia/Jayapura→"WIT (Jayapura)").
  5. **Jam operasional** (`<Trans>Jam operasional</Trans>`): 7 rows labeled Senin..Minggu; each row a `Switch` (open/closed) and two `<Input type="time">` (disabled when closed).
- `SaveBar` at the bottom: `dirty` from the hook; `onReset` = hook `reset`; `onSave` = call `updateProfileDetails` with the draft. The `onSave` MUST catch errors and surface them (set a local `error` string rendered above the SaveBar) so failures are not silent and never become unhandled rejections.
- **Logo upload flow** (separate from the dirty draft — applies immediately):
  - On file pick: `const url = await generateUploadUrl(); const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': file.type }, body: file }); const { storageId } = await res.json(); await setLogo({ storageId });` The reactive `myCafe` query refreshes the preview.
  - Remove button calls `removeLogo()`.
  - Guard with an `uploading` state + show `Spinner`. Wrap in try/catch into the same `error` state.

Mutations:
```ts
const updateProfileDetails = useMutation(api.cafes.updateProfileDetails);
const generateUploadUrl = useMutation(api.cafes.generateUploadUrl);
const setLogo = useMutation(api.cafes.setLogo);
const removeLogo = useMutation(api.cafes.removeLogo);
```

When calling `updateProfileDetails`, only include optional keys when non-empty (the mutation trims/clears anyway, so passing `''` is acceptable — it clears the field). Always pass `name`, `timezone`, and `operatingHours`.

All visible strings via `<Trans>` / `t\`\``. Use existing imports: `Input`, `Switch`, `Select*` from `~/components/ui/*`, `Button`, `Spinner`, and the settings primitives from `~/components/settings/primitives` + `~/components/settings/save-bar` + `~/components/settings/use-editable-state`.

- [ ] **Step 1:** Implement the page.
- [ ] **Step 2:** `pnpm typecheck` → PASS; `pnpm lingui:compile` → PASS.
- [ ] **Step 3:** Commit: `git add src/routes/_pos/settings/profile.tsx && git commit -m "feat(profile): rich profile settings page"`

---

## Task 4: Full local CI gate

- [ ] Run `pnpm typecheck && pnpm test && pnpm lingui:compile` → all PASS.

---

## Self-Review

- Schema fields (Task 1) match `updateProfileDetails` args and `cafeFields` (Task 2) and the page draft (Task 3). ✓
- Onboarding + `CafeProfileForm` + `cafes.updateProfile` untouched; tax stays out of `updateProfileDetails`. ✓
- `myCafe` adds `logoUrl` without breaking `mine` (which still returns `cafeDoc`). ✓
- Logo upload uses Convex storage correctly; old logo deleted on replace/remove. ✓
- No placeholders; all backend code complete. Page JSX follows `general.tsx` conventions. ✓
