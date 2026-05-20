# Phase 1 · Slice 1 — Onboarding + Menu Management

**Date:** 2026-05-20
**Status:** Design
**Parent spec:** `docs/superpowers/specs/2026-05-14-kodapos-v1-design.md` §4.1, §4.2 (menu portion only), §4.6

## Goal

Owner can build their cafe's menu from scratch in the UI: complete a guided onboarding for the cafe profile and an initial menu, then continue editing categories, items, and reusable modifier groups in the main app. Closes the menu-side dependency that subsequent slices (Shifts, POS Core, Inventory, Reports) read from.

## Scope

**In:**
- Cafe profile (name, phone, address, timezone, tax rate, tax toggle) — extends existing `cafes` row.
- Categories (per-cafe, ordered, soft-deletable).
- Menu items (per-cafe, per-category, with price and active/archived flags).
- Reusable modifier groups + options (per-cafe; many-to-many with menu items).
- Onboarding wizard scaffolding (4-step stepper; steps 1+2 implemented, 3+4 stub-disabled).
- Settings/profile page (post-onboarding cafe profile edits).

**Out (deferred):**
- Recipes + ingredients → Slice 4 (Inventory). Items can be sold without recipes per parent §4.2.
- Modifier option `recipeAdjustments` → Slice 4.
- CSV upload, starter menus ("Coffee Shop" / "Bubble Tea") → V1.1.
- Google Places autocomplete for address → V1.1.
- Drag-and-drop reorder → V1.1 (Slice 1 uses up/down arrow buttons).
- Multi-cafe per owner → V1.1 per parent §7.3 (Slice 1 enforces one cafe per owner).
- Optimistic UI → only adopted later if round-trips feel slow.
- Offline-first sync → owner has connectivity; not a Slice 1 concern.

## Success criteria

1. Owner signs up, completes the 2-step onboarding (or skips), and lands on a usable `/menu` page.
2. Owner can add ≥3 categories, ≥10 menu items with prices, and ≥2 reusable modifier groups attached to multiple items.
3. Convex function tests: 25–35 specs covering every menu mutation (success, tenant isolation, validation rejection) and every query (tenant scoping, archived filter, index correctness).
4. Playwright E2E (gated by `RUN_AUTH_E2E=1`): wizard happy path + CRUD round-trip both pass.
5. `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` exit 0.

## Architecture

Pure CRUD over Convex with reactive `useQuery`/`useMutation`. No client-state cache, no optimistic UI, no offline support. Convex's WebSocket subscriptions are the cache; multi-tab consistency comes for free.

**Tenant isolation pattern** (promoted from the Task 24 smoke-test to a project convention):

```ts
// convex/lib/auth.ts
export async function requireOwnerCafe(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error('not authenticated');
  const cafe = await ctx.db
    .query('cafes')
    .withIndex('by_owner', (q) => q.eq('ownerUserId', userId))
    .unique();
  if (!cafe) throw new Error('cafe not found');
  return { userId, cafeId: cafe._id };
}
```

Every Slice 1 function calls `requireOwnerCafe(ctx)` first; mutations stamp `cafeId` on every insert; queries filter every index lookup by `cafeId`. `cafeId` never flows in from the client — it's derived server-side from the user identity.

**Route layout** (under `_pos`, authenticated):

```
_pos/onboarding/_layout.tsx       wizard chrome (stepper, 1/2/3/4 with 3+4 disabled)
_pos/onboarding/profile.tsx       step 1: cafe profile
_pos/onboarding/menu.tsx          step 2: skip or seed first items

_pos/menu/_layout.tsx             tab nav: Items | Categories | Modifier Groups
_pos/menu/index.tsx               items list (variant A: sidebar + flat table)
_pos/menu/items.$itemId.tsx       item edit (variant B: full-page route)
_pos/menu/categories.tsx          category list + inline rename + reorder
_pos/menu/modifiers.tsx           modifier group list
_pos/menu/modifiers.$groupId.tsx  group edit + atomic options save

_pos/settings/_layout.tsx         left nav (future settings sections)
_pos/settings/profile.tsx         same form as onboarding step 1
```

A loader on `_pos/_layout` redirects to `/onboarding/profile` when `cafe.setupCompletedAt == null` and the user isn't already on an `_pos/onboarding/*` route. Step 1 ("Lanjut") writes the profile and advances; step 2 ("Selesai") or any step's "Lewati semua" link calls `markSetupComplete()` and routes to `/menu`. "Lewati" on an individual step advances without completing setup.

## Data model

Five new tables, one extension. All carry `cafeId` and support soft delete via `archived: boolean`.

```ts
// EXTEND
cafes: {
  // existing:
  name: v.string(),
  ownerUserId: v.id('users'),
  createdAt: v.number(),
  // new:
  phone: v.optional(v.string()),
  addressLine: v.optional(v.string()),
  timezone: v.string(),               // default "Asia/Jakarta"
  taxRatePct: v.number(),             // default 11 (PPN)
  taxEnabled: v.boolean(),            // default true
  setupCompletedAt: v.optional(v.number()),
}
// existing index: by_owner

// NEW
categories: {
  cafeId: v.id('cafes'),
  name: v.string(),
  position: v.number(),
  archived: v.boolean(),
  createdAt: v.number(),
}
.index('by_cafe_active', ['cafeId', 'archived', 'position'])

menuItems: {
  cafeId: v.id('cafes'),
  categoryId: v.id('categories'),
  name: v.string(),
  priceIDR: v.number(),
  isActive: v.boolean(),
  archived: v.boolean(),
  position: v.number(),
  createdAt: v.number(),
}
.index('by_cafe_category', ['cafeId', 'categoryId', 'archived', 'position'])
.index('by_cafe_active', ['cafeId', 'archived', 'isActive'])

modifierGroups: {
  cafeId: v.id('cafes'),
  name: v.string(),
  required: v.boolean(),
  minSelect: v.number(),
  maxSelect: v.number(),
  archived: v.boolean(),
  createdAt: v.number(),
}
.index('by_cafe_active', ['cafeId', 'archived'])

modifierOptions: {
  cafeId: v.id('cafes'),
  groupId: v.id('modifierGroups'),
  name: v.string(),
  priceAdjustmentIDR: v.number(),
  position: v.number(),
  archived: v.boolean(),
  createdAt: v.number(),
}
.index('by_group_active', ['groupId', 'archived', 'position'])

menuItemModifierGroups: {
  cafeId: v.id('cafes'),
  menuItemId: v.id('menuItems'),
  modifierGroupId: v.id('modifierGroups'),
  position: v.number(),
}
.index('by_item', ['menuItemId', 'position'])
.index('by_group', ['modifierGroupId'])
```

**Schema notes:**
- `priceIDR` and `priceAdjustmentIDR` are integers (no fractional rupiah). Reuses `formatIDR`/`parseIDR` from Task 14.
- `isActive` is a soft-disable toggle ("temporarily off the menu"); `archived` is permanent retire. Two different concepts because owners want to flip off out-of-stock drinks without deleting them.
- `position` is an integer; convention is gaps of 100 (10, 110, 210…) so inserts mid-list don't renumber every row. A `nextPositionAfter(rows)` helper returns `max(position) + 100`.
- `menuItemModifierGroups` carries `cafeId` redundantly so tenant filters work without a join — Convex queries don't optimize joins the way SQL does.
- Existing `cafes.createForOwner` mutation gets a follow-up `cafes.updateProfile` mutation; both must initialize the new fields. The migration is: new fields with defaults on first write.

## Convex API surface

All functions in `convex/menu/*.ts` and `convex/cafes.ts` (extended). All call `requireOwnerCafe(ctx)` first. All have argument validators and return validators.

```
cafes.updateProfile({ name, phone?, addressLine?, timezone, taxRatePct, taxEnabled }) → null
cafes.markSetupComplete() → null
cafes.myCafe() → cafeDoc | null

menu.categories.create({ name }) → Id<'categories'>
menu.categories.update({ id, name }) → null
menu.categories.reorder({ id, direction: 'up' | 'down' }) → null
menu.categories.archive({ id }) → null
menu.categories.list({ includeArchived?: boolean }) → CategoryDoc[]

menu.items.create({ categoryId, name, priceIDR }) → Id<'menuItems'>
menu.items.update({ id, categoryId, name, priceIDR }) → null
menu.items.setActive({ id, isActive }) → null
menu.items.reorder({ id, direction }) → null
menu.items.archive({ id }) → null
menu.items.list({ categoryId?, includeArchived?, includeInactive? }) → MenuItemDoc[]
  // categoryId omitted → all items for the cafe; otherwise filtered to that category.
menu.items.getById({ id }) → { item: MenuItemDoc, attachedGroups: { group: ModifierGroupDoc, options: ModifierOptionDoc[], position: number }[] } | null

menu.modifierGroups.upsert({ id?, name, required, minSelect, maxSelect, options: [{ id?, name, priceAdjustmentIDR, position }] }) → Id<'modifierGroups'>
menu.modifierGroups.archive({ id }) → null
menu.modifierGroups.list({ includeArchived? }) → ModifierGroupWithOptionsDoc[]
menu.modifierGroups.getById({ id }) → ModifierGroupWithOptionsDoc | null

menu.itemGroups.attach({ menuItemId, modifierGroupId }) → null
menu.itemGroups.detach({ menuItemId, modifierGroupId }) → null
menu.itemGroups.reorder({ menuItemId, modifierGroupId, direction }) → null
```

The `modifierGroups.upsert` mutation is the one non-trivial signature: it accepts the group plus its options array and reconciles atomically in a single transaction (insert new options, update existing by id, archive options whose ids are absent from the array). Single round-trip from the form save; easier to test than per-row mutations.

## Components

Shadcn convention everywhere (per `.agents/skills/shadcn/`):
- Forms use `FieldGroup` + `Field` + `FieldLabel` + `FieldError` (same as signup/signin).
- Submit buttons use `<Spinner data-icon="inline-start" />` for the loading state.
- Destructive actions (archive, delete) use `AlertDialog` with explicit confirmation text.
- Tables use shadcn `Table`. Empty states use `Empty`.
- Up/down reorder buttons in each row (no DnD).

**Key components:**
- `<WizardStepper steps={...} currentIndex={...} />` — renders all 4 steps; ones beyond `currentIndex` show as disabled (gray). Reused by Slices 2+5.
- `<CafeProfileForm />` — shared between `onboarding/profile.tsx` and `settings/profile.tsx`.
- `<ItemEditForm />` — full-page form with two columns: basic info (name, price, category, isActive toggle) and attached modifier groups (sortable list + "+ Tambah" picker). "Buat grup baru" link opens `_pos/menu/modifiers/$groupId` in a new tab to avoid losing edit context.
- `<ModifierGroupForm />` — single form holding group fields + the options table. Save dispatches one `modifierGroups.upsert` mutation.
- `<CategoryTable />` — inline rename via double-click, archive via row menu, up/down arrows, "+ Kategori" pinned at top.
- `<ItemsListPage />` — variant A from brainstorming: left sidebar of categories with counts, right pane is the filtered items table.

## Data flow & error handling

**Reads:** `useQuery(api.menu.<thing>, args)`. Loading = `data === undefined`; empty = `data === []` (or `null` for singletons). Loading states use `<Spinner />` for full-page loads, `<Skeleton />` rows for tables.

**Writes:** `await useMutation(api.menu.<thing>)({ ... })` inside an `async function` handler with a local `submitting: boolean` toggled in try/finally. On success: form clears or stays mounted depending on the action. On error: caught in catch block, `error.message` rendered in a top-of-form `<FieldError>`.

**Validation:**
1. Convex arg validators catch shape errors.
2. Each mutation handler runs `validate*` helpers for business rules: `priceIDR >= 0 && Number.isInteger(priceIDR)`, `name.trim().length >= 1 && name.length <= 80`, `minSelect <= maxSelect`, etc. Throws `Error('Harga tidak boleh negatif.')` (Bahasa Indonesia messages — render directly in the UI).
3. Per-field validation marks `aria-invalid` + `<FieldError>` under the offending `Field`.

**Race conditions** all benign for Slice 1:
- Two-tab edit: last write wins; loser sees update via reactive query.
- Concurrent reorder: 1-tick visual blip; settles.
- Double-submit onboarding completion: `markSetupComplete` is idempotent (sets only if currently null).

## Testing strategy

**Convex function tests** (Vitest + `convex-test`) — the primary defense layer. Target 25–35 specs:

- `tests/convex/cafes.profile.test.ts`: `updateProfile` happy path; rejects empty name; rejects negative tax rate; `markSetupComplete` idempotent; `myCafe` returns own cafe only.
- `tests/convex/menu/categories.test.ts`: create / rename / reorder / archive / list; archived filter; cafe A can't touch cafe B.
- `tests/convex/menu/items.test.ts`: create / update / setActive / reorder / archive / list (with `categoryId` filter, `includeArchived`, `includeInactive` flags); `getById` returns attached groups in position order; tenant isolation; price validation; long-name rejection.
- `tests/convex/menu/modifierGroups.test.ts`: `upsert` atomic create with options; `upsert` updates existing group + adds new option + archives removed option in one call; `min > max` rejected; tenant isolation.
- `tests/convex/menu/itemGroups.test.ts`: attach / detach / reorder; can't attach a group from another cafe; double-attach is no-op.

Patterns from Task 24: `t.withIdentity({ subject: '${userId}|test_session' })`, `import.meta.glob('../../convex/**/*.*s')` for `modules`, return validators on every mutation.

**Unit tests** — only for extracted pure helpers:
- `tests/lib/position.test.ts`: `nextPositionAfter([{ position: 10 }, { position: 110 }])` returns 210; empty array returns 100; non-integer input rejected.

**Playwright E2E** (`tests/e2e/menu.spec.ts`) — gated by `RUN_AUTH_E2E=1`:
1. **Wizard happy path**: signup → onboarding/profile → fill name/phone/timezone → submit → onboarding/menu → add category "Kopi" → add item "Kopi Susu Gula Aren" / Rp 22.000 → attach a new "Ukuran" modifier group with two options → "Selesai" → lands on `_pos/menu`. Assert the item is visible.
2. **CRUD round-trip**: sign in to a pre-seeded cafe → menu → click row to open `/menu/items/$id` → change price to 25.000 → save → list reflects new price → archive item → confirm hidden from default view → toggle "Tampilkan arsip" → confirm visible.

**Out of scope for Slice 1:**
- Visual regression (parent §7.1).
- Multi-cafe scenarios (V1 = one cafe).
- Concurrent-tab races (called out as low-stakes).
- Performance with large menus (no realistic dataset).

## Open follow-ups (not in this slice)

- **Drag-and-drop reorder** is a clear V1.1 candidate once an owner has ~20+ items. The up/down arrow loop becomes friction; drag-and-drop pays for itself.
- **Modifier group preview** ("here's how a sale flow would show this group") would help owners catch min/max mistakes before the cashier hits them. Defer until Slice 3 (POS Core) lands so the preview can render the actual cashier widget.
- **Bulk price adjustment** (raise everything 10%) is a real owner ask but not Phase 1.
- **Image uploads for items** — not in V1 per parent §1.2.

## Dependencies on prior work

- Convex Auth (Task 8) + sign-in/sign-up (Task 11) — owner identity.
- `cafes.createForOwner` (Task 24) — gets extended; `cafes.myCafe` is new.
- shadcn skill + components (`button`, `input`, `label`, `field`, `spinner`, `separator`) — Task 10 and follow-ups. Slice 1 adds: `table`, `alert-dialog`, `sheet` (for the modifier-group-from-item-edit cross-link if we keep it as a side panel), `skeleton`, `empty`, `select`, `switch`.
- Lingui (Task 12) — all UI strings wrapped in `<Trans>` macros; new strings extracted via `pnpm lingui:extract`.
- `formatIDR` / `parseIDR` (Task 14) — used in price inputs and display.
- Tenant pattern (Task 24) — formalized as `requireOwnerCafe(ctx)` helper.

## Next step

Invoke the writing-plans skill to produce the Slice 1 implementation plan. The plan will sequence:
1. Schema migration + `requireOwnerCafe` helper + `cafes.updateProfile`/`markSetupComplete`/`myCafe`.
2. Categories (smallest standalone table; gets the index pattern right).
3. Modifier groups + options (`upsert` is the trickiest mutation; isolate it).
4. Menu items + the `menuItemModifierGroups` join.
5. Onboarding wizard scaffolding + step 1 (profile) + step 2 (menu seed).
6. Main `_pos/menu/*` pages (items list, item edit, categories, modifier groups).
7. Settings/profile.
8. Playwright E2E specs.

Each step is TDD: Convex tests before the mutation/query, then the page that consumes them.
