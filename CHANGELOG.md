# Changelog

All notable changes to kodapos. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); dates are Asia/Jakarta.

## [Unreleased]

Pending: Slice 4 (Inventory + Recipes), Slice 5 (Payments expansion incl. QRIS), Slice 6 (Reports). Deferred Phase 0 items: Cloudflare deploy (Tasks 18–20), Sentry (16), PostHog (17), CI (21).

---

## Phase 1 · Slice 3 — POS Core (cash-only) · 2026-05-22 → 2026-05-23

The first revenue-generating screen. Cashier taps items into a cart, optionally picks modifiers, accepts cash, and the order persists with a printable receipt. QRIS, voids, discounts, and inventory deduction are deferred to later slices.

### Added
- `orders` table — one row per sale with embedded `lines[]` array. Snapshots: `nameSnapshot`, `unitPriceIDR`, `modifiersSnapshot`, `taxRatePct` so receipts stay correct after menu or PPN edits.
- `payments` table — one row per payment event. Cash always inserts `paymentStatus: 'paid'` + `confirmedAt: now`. Optional fields reserved for Slice 5 QRIS pending state.
- `orders.createCashSale` mutation — six layers of server-side defense: tenant ownership of shift + cashier, per-item active/archived check, modifier-option attachment verification, modifier-group min/max count enforcement, integer Rupiah validation, open-shift assertion. Idempotent via client-generated `clientId` (`by_cafe_clientId` index).
- `orders.listForShift` + `orders.getById` read queries — history page + receipt drawer.
- `menu.items.listForSale` — single round-trip read returning every active item plus its attached modifier groups + options.
- Pure cart reducer (`useReducer`-friendly, 9 unit specs) — de-dupes no-modifier additions, never de-dupes modified additions, caps qty at 99, decrement past 1 removes the line.
- `<ShiftGate>` — reactive `useQuery(api.shifts.current)` redirector. Closing the shift in another tab routes `/sale/*` and `/history` to `/shift/open` automatically.
- `/sale` UI — 70/30 menu/cart split, category tabs, `<ItemCard>` with "Pilihan" badge for items that have modifier groups, `<CartPane>` with qty stepper + Remove + Kosongkan confirm.
- `<ModifierPickerDialog>` — toggle chips per group, required-group gating, live total preview, qty stepper, "Tambah ke pesanan" button.
- `<CashPaymentDialog>` — compact stacked layout, smart denomination chips (`Pas`, next 5k, next 100k, next 200k), 3×4 numpad, idempotent `clientId` generated once per open.
- `<ReceiptPreview>` + `@media print` rule in `globals.css` — print hides everything except `[data-print-receipt]`.
- `/history` route — today's orders for the active shift, click to view receipt drawer.
- Auth-gated Playwright happy path (`tests/e2e/sale.spec.ts`): signup → onboarding → PIN → shift open → cash sale → receipt → /history.
- 23 Convex specs on `orders` mutation/queries; 2 specs on `listForSale`; 9 cart-reducer unit specs.

### Changed
- `convex/menu/items.ts`: extracted shared `resolveAttachedGroups(ctx, menuItemId)` helper used by `getById` and `listForSale`.
- Switched a `.filter()` call on `menuItemModifierGroups` to `.collect()` + JS `find` to comply with Convex query guidelines.

### Fixed
- `<ScrollRestoration />` deprecation warning — removed the component; `createRouter`'s `scrollRestoration: true` option in `src/router.tsx` covers the same behavior.
- Missing 404 — root route now declares `notFoundComponent` with a Bahasa "Halaman tidak ditemukan" page instead of the framework's generic text.

### Docs
- `docs/superpowers/specs/2026-05-22-phase-1-slice-3-pos-core-design.md`
- `docs/superpowers/plans/2026-05-22-phase-1-slice-3-pos-core.md`

---

## Phase 1 · Slice 2 — Shifts + PIN Auth · 2026-05-21 → 2026-05-22

Cashier identity + shift lifecycle on top of the device-owner Convex Auth session. Unblocks Slice 3's `cashierId` / `shiftId` requirement on every order.

### Added
- `cafeStaff` table — owner auto-inserted at signup via extended `cafes.createForOwner`; cashiers added via Settings → Staff.
- `shifts` table — `status: 'open' | 'closed'`, opening float, counted cash. One-open-per-cafe invariant enforced server-side.
- PBKDF2-SHA256 PIN hashing (100k iterations, 16-byte salt, 32-byte key, `salt:hash` hex format) via Web Crypto in `convex/lib/pin.ts`.
- `requireActiveCashier(ctx, cafeId, cashierId)` helper — tenant + archived check in one step.
- `staff.list / create / updateName / archive / verifyPin / resetPin` Convex functions.
- `shifts.current / open / close` Convex functions.
- `useActiveCashier()` hook — `localStorage.activeCashierId` with cross-tab sync via the `storage` event.
- `<PinGate>` — redirects to `/pin` when no active cashier.
- `<PinEntry>` 4-cell numeric input + `<StaffPickerCard>` + `<ShiftSummaryPanel>`.
- `/pin` PIN-picker route.
- `/shift/open` and `/shift/close` routes (wrapped by `<PinGate>`).
- Settings → Staff page (add, rename, set/reset PIN, archive).
- Onboarding step 4 — pemilik (owner) sets their own PIN + optional cashier rows.
- Auth-gated E2E (`tests/e2e/shifts.spec.ts`): signup → set PIN → pick cashier → open shift → close shift.
- ~25 Convex specs covering staff CRUD, PIN hash/verify, shift lifecycle, tenant isolation, race conditions.

### Fixed
- `Uint8Array<ArrayBufferLike>` not assignable to `BufferSource` in TS 5.7+ — narrowed `convex/lib/pin.ts` helper signatures to `Uint8Array<ArrayBuffer>`.

### Docs
- `docs/superpowers/specs/2026-05-21-phase-1-slice-2-shifts-design.md`
- `docs/superpowers/plans/2026-05-21-phase-1-slice-2-shifts.md`

---

## Phase 1 · Slice 1 — Onboarding + Menu · 2026-05-21

Real signup wired to Convex Auth + four-step onboarding wizard + menu management (categories, items, modifier groups). First slice to leave the placeholder stage.

### Added
- `cafes.createForOwner` + `cafes.updateProfile` mutations; `cafes.myCafe` + `cafes.mine` queries; `cafes.markSetupComplete` mutation.
- `categories`, `menuItems`, `modifierGroups`, `modifierOptions`, `menuItemModifierGroups` tables.
- `menu.categories` (CRUD + reorder + archive) + `menu.items` (CRUD + reorder + archive + setActive) + `menu.modifierGroups` (upsert + archive) + `menu.itemGroups` (attach + detach + reorder).
- `requireOwned<T extends TenantTable>(ctx, cafeId, id, label)` helper — centralizes the tenant ownership check.
- Onboarding wizard — `/onboarding/profile`, `/onboarding/menu`, `/onboarding/cashier` (cashier step extended in Slice 2). Wizard stepper component.
- `<OnboardingGate>` — redirects to `/onboarding/profile` if `!cafe.setupCompletedAt`.
- Menu management UI: category table (reorder + archive confirm), item edit form (price + category + modifier-group attachment), modifier-group form.
- `<ConfirmArchive>` AlertDialog wrapper (replaces `confirm()` for archive flows).
- Brand-token UI via shadcn/ui + Tailwind v4 design tokens (`bg-bg`, `bg-surface`, `text-fg`, `text-fg-muted`, `bg-brand-600`, etc.).
- shadcn primitives: Field, FieldGroup, FieldError, Spinner, Input, Label, AlertDialog, Dialog, Sheet, Select, Switch, Separator, Empty, Skeleton.
- Lingui 6 + Vite 8 macro pipeline via `@rolldown/plugin-babel` + `linguiTransformerBabelPreset` (Addendum §A.13).
- Auth-gated Playwright suite (`tests/e2e/menu.spec.ts`): signup → onboarding → category → item.
- `gotoHydrated` / `waitForUrlHydrated` Playwright helpers — avoid native-form-submit races caused by pre-hydration clicks.

### Fixed
- Convex Auth dropped `user.name` — added `profile` callback to the Password provider so `params.name` lands in `users.name`.
- Onboarding never created a cafe — added `createCafeWhenAuthReady` retry helper (20 attempts × 150ms) to handle the auth-token-propagation race at signup.

### Known issues
- Menu CRUD E2E test occasionally flakes at the final `waitForUrlHydrated` when run back-to-back with other auth-gated tests. Per-test timeout bumped to 180s; documented as deferred.

### Docs
- `docs/superpowers/specs/2026-05-20-phase-1-slice-1-onboarding-menu-design.md`
- `docs/superpowers/plans/2026-05-20-phase-1-slice-1-onboarding-menu.md`

---

## Phase 0 — Foundations · 2026-05-14 → 2026-05-20

Project scaffolding, design docs, and the toolchain choices everything else builds on.

### Added
- V1 design document for kodapos.
- Phase 0 (foundations week) implementation plan + Addendum A translating outdated TanStack Start API references in the plan to the current API.
- Repo skeleton (`d8660b7`).
- TanStack Start application bootstrap (`6c3cc10`).
- Tailwind v4 + design tokens (`dde0d83`).
- shadcn/ui initialization with Button + Lucide icons (`1f05f81`).
- `(public)` and `(pos)` route groups (later renamed to `_public` / `_pos` per Addendum §A.9 — underscore convention).
- Convex backend with Phase 0 schema (`56c797a`).
- Convex React client wired into the root layout (`1c3ac63`).
- Convex Auth configured with Password provider (`14b4638`).
- `users.hello` query + first Convex tests (`9515885`).
- Biome lint + format configuration (`71ed9cc`).

### Deferred (still pending)
- Cloudflare deploy (Tasks 18–20)
- Sentry observability (16)
- PostHog analytics (17)
- CI pipeline (21)

### Docs
- `docs/superpowers/specs/2026-05-14-kodapos-v1-design.md`
- `docs/superpowers/plans/phase-0-foundations.md`

[Unreleased]: https://github.com/dededemahendra/kodapos/compare/main...HEAD
