# Phase 1 · Slice 2 — Shifts + PIN Auth

**Date:** 2026-05-21
**Status:** Design
**Parent spec:** `docs/superpowers/specs/2026-05-14-kodapos-v1-design.md` §2.3, §4.3, §4.6 (step 4)

## Goal

Cashier identity + shift lifecycle on top of the device-owner Convex Auth session. Owner sets a PIN for themselves (and optionally adds cashiers); the device's PIN picker selects who's working the till; that cashier can open and close a shift. Unblocks Slice 3 (POS Core) which writes `cashierId` and `shiftId` on every order.

## Scope

**In:**
- `cafeStaff` table — owner auto-inserted at signup; cashiers added via Settings.
- `shifts` table — one open shift per cafe; opening float; counted cash; close summary.
- PIN auth (4-digit numeric, Argon2id-hashed server-side, verified via Convex query).
- PIN picker route (`_pos/pin.tsx`) with `PinGate` that gates only shift/sale routes.
- Onboarding step 4 ("First cashier") — adds owner PIN + optional cashier rows.
- Settings → Staff page (owner adds/edits/archives cashiers, resets PINs).
- Active cashier session persisted in `localStorage`, cross-tab synced via the `storage` event.

**Out (deferred):**
- Wrong-PIN lockout (no retry tracking) → Phase 2 multi-cafe pilot.
- Manager role (full app access, second-class to owner) → V1.1.
- `expectedCashIDR` + `varianceIDR` computation → Slice 5 (depends on payments).
- Owner-PIN override for high variance → Slice 5+.
- Scheduled flag for shifts open >12h → V1.1.
- Multi-register (multiple open shifts per cafe) → V2 per parent §7.3.
- Audit log entries → V1.1.

## Success criteria

1. Owner signs up, completes onboarding through step 4, sets their PIN, optionally adds one cashier.
2. Navigating to `/shift/open` from `/menu` (no active cashier yet) redirects to `/pin`; entering the right PIN routes back to `/shift/open`.
3. Opening a shift with float Rp 100.000 succeeds; navigating to `/shift/open` again shows "Shift sudah dibuka" with the cashier's name and a link to `/shift/close`.
4. Closing with counted cash Rp 100.000 records `closedAt`, `countedCashIDR`, clears `activeCashierId`.
5. Two cafes' staff/shifts are tenant-isolated (cafe B can't open a shift assigning cafe A's cashier).
6. Convex function tests: ~25–30 specs (staff CRUD + PIN verify + shift lifecycle + tenant + race).
7. Playwright E2E (gated by `RUN_AUTH_E2E=1`): signup → onboarding → set PIN → open → close → menu happy path passes.
8. `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` exit 0.

## Architecture

Two identity layers stack:

- **Device identity** = Convex Auth session = owner. Long-lived sliding session via Convex Auth's default (no change from Slice 1).
- **Active cashier** = `localStorage.activeCashierId`. Selected via PIN picker. Cleared on shift close or "switch cashier."

Every mutation continues to call `requireOwnerCafe(ctx)` first. POS-side mutations additionally call a new helper:

```ts
// convex/lib/staff.ts (new file)
export async function requireActiveCashier(
  ctx: QueryCtx | MutationCtx,
  cafeId: Id<'cafes'>,
  cashierId: Id<'cafeStaff'>
): Promise<Doc<'cafeStaff'>> {
  const row = await ctx.db.get(cashierId);
  if (!row || row.cafeId !== cafeId || row.archived) {
    throw new Error('Kasir tidak ditemukan atau sudah diarsipkan.');
  }
  return row;
}
```

This is the cashier equivalent of `requireOwned`. Kept separate because the not-found message is specific ("atau sudah diarsipkan") and it's the only owned-row check that combines tenant + archived in one step.

**Gating sequence on `_pos` routes** (extends the Slice-1 stack):

```
Unauthenticated → SignedOutRedirect → /signin
Authenticated
  ├─ OnboardingGate → /onboarding/profile if !setupCompletedAt
  └─ Authenticated + onboarded:
       ├─ Owner-only routes (menu, settings)   → render directly
       └─ Cashier-required routes (shift/*)    →
            PinGate: if !activeCashierId       → /pin (and remember the intent)
            Render
```

`PinGate` is a wrapper component used by `_pos/shift/route.tsx` (and Slice 3's `_pos/sale/route.tsx`). Routes outside the cashier-required zone don't fire it.

**Route layout** (new):

```
_pos/onboarding/cashier.tsx           wizard step 4 (owner PIN + optional cashier list)
_pos/pin.tsx                          PIN picker; redirect target of PinGate
_pos/shift/route.tsx                  layout: wraps Outlet in <PinGate>
_pos/shift/open.tsx                   opening float entry
_pos/shift/close.tsx                  counted cash + summary
_pos/settings/staff.tsx               owner-only staff management
```

`WizardStepper` already supports disabled steps; step 4's `enabled` flag flips to `true`. Step 3 stays disabled (payments, Slice 5).

## Data model

Two new tables. No changes to `cafes` or existing tables.

```ts
cafeStaff: defineTable({
  cafeId: v.id('cafes'),
  name: v.string(),
  pinHash: v.optional(v.string()),                     // Argon2id; null until owner sets one
  role: v.union(v.literal('owner'), v.literal('cashier')),
  archived: v.boolean(),
  createdAt: v.number(),
}).index('by_cafe_active', ['cafeId', 'archived']),

shifts: defineTable({
  cafeId: v.id('cafes'),
  cashierId: v.id('cafeStaff'),
  openedAt: v.number(),
  closedAt: v.optional(v.number()),
  openingFloatIDR: v.number(),
  expectedCashIDR: v.optional(v.number()),             // filled by Slice 5 close
  countedCashIDR: v.optional(v.number()),
  varianceIDR: v.optional(v.number()),                 // filled by Slice 5 close
  status: v.union(v.literal('open'), v.literal('closed')),
})
  .index('by_cafe_status', ['cafeId', 'status'])       // "is there an open shift?"
  .index('by_cafe_opened', ['cafeId', 'openedAt']),    // history listing
```

**Schema notes:**
- `cafeStaff.pinHash` is optional because the owner is auto-inserted at signup before they've chosen a PIN. The picker shows their card with a "Pemilik tanpa PIN" affordance until they set one (no PIN required to select).
- Only `role: 'owner' | 'cashier'` in Slice 2. Manager is V1.1; adding `v.literal('manager')` to the union is a one-line non-breaking schema change.
- `shifts` has `expectedCashIDR` and `varianceIDR` as optional so Slice 2 ships without payments. Slice 5's `close` mutation will compute and patch them in the same row.
- **"One open shift per cafe"** is enforced in the `shifts.open` mutation (check `by_cafe_status` for `status: 'open'`). Convex doesn't support multi-field unique indexes; application-level enforcement with the serializable-transaction guarantee covers it.

**Owner auto-insert:** the existing `cafes.createForOwner` mutation gets one new line — after inserting the cafe, insert a `cafeStaff` row with `cafeId`, `name: ownerName` (passed through from signup or derived from the user row), `role: 'owner'`, `archived: false`, `pinHash: undefined`. The owner's name comes from `users.name` which Slice 1's auth fix now persists correctly.

## Convex API surface

All functions in `convex/staff.ts` and `convex/shifts.ts`. All call `requireOwnerCafe(ctx)` first. All have argument + return validators.

```
staff.list({ includeArchived?: boolean }) → CafeStaffDoc[]
  // sorted: owners first, then by createdAt ascending

staff.create({ name: string, pin: string }) → Id<'cafeStaff'>
  // role is always 'cashier'; owner row only created via cafes.createForOwner

staff.updateName({ id: Id<'cafeStaff'>, name: string }) → null

staff.resetPin({ id: Id<'cafeStaff'>, pin: string }) → null

staff.archive({ id: Id<'cafeStaff'> }) → null
  // throws if last owner, or if cashier has open shift

staff.verifyPin({ id: Id<'cafeStaff'>, pin: string }) → boolean
  // query (not mutation); constant-time compare; returns false for rows with no pinHash

shifts.current() → ShiftWithCashier | null
  // any open shift for this cafe, with cashier's name embedded for the UI

shifts.open({ cashierId: Id<'cafeStaff'>, openingFloatIDR: number }) → Id<'shifts'>
  // throws if open shift already exists, with the existing cashier's name in the message

shifts.close({ id: Id<'shifts'>, countedCashIDR: number }) → null
  // Slice 2: leaves expectedCashIDR / varianceIDR undefined; Slice 5 will fill
```

**PIN hashing:** new `convex/lib/pin.ts` exposes `hashPin(plain)` and `verifyPin(plain, hash)`. Implementation reuses the same Argon2id parameters Convex Auth's Password provider uses for password hashing (so we don't drift on parameters and so we don't bundle a second crypto library). If reusing the Convex Auth internals proves awkward, fallback: scrypt from `node:crypto` exposed via a `"use node"` action — slower but no extra dep. The reuse-Convex-Auth path is the goal.

## Client components

Shadcn convention throughout (Field / FieldGroup / Spinner / ConfirmArchive same as Slice 1).

**New shared components:**

- `<PinEntry digits={4} onComplete onCancel />` (`src/components/staff/pin-entry.tsx`) — 4-cell numeric input. `inputMode="numeric"` + `pattern="\d"` per cell; auto-advance on input; `Backspace` moves back; submit-on-fill via `onComplete(pin: string)`. No retry counter (lockout deferred).

- `<StaffPickerCard name role hasPin onClick />` (`src/components/staff/staff-picker-card.tsx`) — avatar (initials) + name + role badge ("Pemilik" for owner). Click hands off to the parent which opens `<PinEntry>` in a Dialog.

- `<ShiftSummaryPanel shift />` (`src/components/shift/shift-summary-panel.tsx`) — opened-at, by-whom, opening float, [expected cash slot for Slice 5], counted cash, [variance slot for Slice 5]. Used by `/shift/close` and (later) reports.

**New hook:**

- `useActiveCashier()` (`src/lib/active-cashier.ts`) — wraps `localStorage.activeCashierId`. Returns `{ cashierId, setCashier, clearCashier }`. Subscribes to the `storage` event so a second tab on the same device sees the same cashier session without manual refresh.

**Route components:**

- `_pos/onboarding/cashier.tsx` — wizard step 4. Two sections: (1) "PIN Pemilik" set-PIN form (writes `staff.resetPin` for the auto-inserted owner row); (2) "Kasir lain (opsional)" — name + PIN inline form that calls `staff.create`, table below of cashiers added so far. "Selesai" → `markSetupComplete` → `/menu`.
- `_pos/pin.tsx` — picker grid + PIN entry dialog. Owner row first. After successful verify: `setCashier(id)`, then `navigate` to wherever the redirect was bound from (default `/menu`).
- `_pos/shift/route.tsx` — layout that wraps `<Outlet />` in `<PinGate>`. Also responsible for redirecting between `/shift/open` and `/shift/close` based on `shifts.current()` so deep-linking lands the user on the right step.
- `_pos/shift/open.tsx` — single form (read-only cashier name, opening float input, submit). On success: `navigate('/shift/close')` for Slice 2 (Slice 3 will change this to `/sale`).
- `_pos/shift/close.tsx` — `<ShiftSummaryPanel>` left, counted-cash form right. On success: clear `activeCashierId`, show a confirmation card with "Cetak ringkasan" (browser print stub for Slice 2) + "Kembali ke menu" buttons.
- `_pos/settings/staff.tsx` — Settings layout (already exists from Slice 1) gets a new left-nav entry "Staff". Page is a table with inline rename, PIN-reset modal, archive (via existing `<ConfirmArchive>`). New cashier form pinned at top.

## Data flow & error handling

**Read path:** reactive `useQuery` everywhere. `shifts.current()` is reactive — when an open shift transitions to closed, every consumer re-renders.

**PIN verify path:** the `<PinEntry onComplete>` handler calls `convex.query(api.staff.verifyPin, { id, pin })`. Raw pin never persists past the query call. On `true`: `setCashier(id)`, navigate. On `false`: clear cells, set inline "PIN salah." (no count, no lockout).

**Write paths:** all forms use `useMutation` + try/finally `submitting` state. Errors are caught and rendered via `<FieldError>`. Same shape as Slice 1 — Bahasa messages for user-facing validation, English for system errors (`not authenticated`).

**Validation rules** (server-side, throw Bahasa for `<FieldError>`):
- Staff name: trimmed, 1–60 chars.
- PIN: exactly 4 ASCII digits (`/^\d{4}$/`).
- Opening float: integer, ≥ 0.
- Counted cash: integer, ≥ 0.
- `staff.archive`: can't archive the last `role: 'owner'`; can't archive a cashier with an open shift (message: "Tutup shift sebelum mengarsipkan.").

**Race conditions:**
- Two devices try to open simultaneously: Convex's serializable transactions ensure exactly one wins. The second sees the first's row via `by_cafe_status` and throws.
- localStorage tampering: the server validates `cashierId` belongs to the cafe (`requireActiveCashier`). A malicious staff member on the same cafe could impersonate another cafe member from the SAME cafe — that's the trust boundary. PIN check is the security gate.
- Archived mid-shift: open shift survives; can still be closed; the archived cashier just can't be picked for new shifts.

## Testing strategy

**Convex function tests** (~25–30 specs) split across:

- `tests/convex/staff.test.ts`:
  - `staff.create` happy path; rejects blank/long name (60 char cap); rejects malformed PIN (3 digits, 5 digits, non-numeric); tenant isolation
  - `staff.verifyPin` true on match, false on mismatch, false (no throw) when target has no `pinHash`
  - `staff.resetPin` happy path; old PIN no longer verifies; new PIN does
  - `staff.archive` happy path; can't archive last owner; can't archive cashier with open shift; tenant isolation
  - `staff.list` sorts owners first, then by createdAt; `includeArchived` flag works
  - **Owner auto-insert** when `cafes.createForOwner` runs: assert exactly one cafeStaff row exists with `role: 'owner'`, `pinHash: undefined`, `name` set from the user row.

- `tests/convex/shifts.test.ts`:
  - `shifts.current` returns null when none open; returns shift when one open; returns null after close
  - `shifts.open` happy path; rejects when an open shift already exists (message includes existing cashier name); rejects cashierId from another cafe; rejects archived cashier; rejects negative/fractional opening float
  - `shifts.close` happy path: patches `status`, `closedAt`, `countedCashIDR`; rejects already-closed shift; rejects negative counted cash; leaves `expectedCashIDR` / `varianceIDR` undefined (Slice 2 contract)
  - **Two-mutation race**: open two shifts in parallel against the same cafe; one wins, one throws

**Unit tests:** none planned. The only candidate is a `digit-only` filter for `PinEntry` and it's exercised at runtime by the E2E.

**Playwright E2E** — one new spec at `tests/e2e/shifts.spec.ts`, gated behind `RUN_AUTH_E2E=1`:

> Signup ("E2E Owner", "Kopi E2E S2") → onboarding/profile → submit → onboarding/menu → "Mulai dengan kategori" → add a category → switch to onboarding/cashier step → set owner PIN '1234' → "Selesai" → `/menu` → click "Buka Shift" → `PinGate` redirects to `/pin` → click owner card → enter '1234' → routes to `/shift/open` → enter opening float `100000` → submit → `/shift/close` → enter counted cash `100000` → submit → confirmation screen → "Kembali ke menu" → `/menu`.

The test routes through the cashier onboarding step (rather than "Selesaikan nanti") so the PIN-set path is covered by the happy flow.

That single happy path exercises: device auth, onboarding step 4, PIN persistence, PinGate trigger, PIN verify, localStorage cashier session, shift open, shift close, summary computation (without payments), session clear, navigation cycle.

**Out of scope for Slice 2 E2E:**
- Wrong PIN (no retry behavior to test).
- Two-device race (covered by Convex test).
- Cross-tab sync (manual smoke; not worth Playwright overhead).
- Archived-mid-shift (covered by Convex test).

## Open follow-ups (not in this slice)

- **Wrong-PIN lockout** when Phase 2 multi-cafe pilot begins (5 wrong in 1 min → owner re-auth). Needs a rate-limit table or in-memory counter; minor.
- **Manager role** as V1.1 lift. Schema is forward-compatible (add `'manager'` to the role union).
- **Variance + owner-PIN override** ships in Slice 5 alongside the payments table; `shifts.close` mutation gets the expected-cash computation and the variance gate at the same time.
- **Overnight-shift flag** (scheduled function) is V1.1 polish.
- **Audit log** for staff changes / large variances — V1.1.

## Dependencies on prior work

- `requireOwnerCafe` + `requireOwned` from Slice 1 (`convex/lib/auth.ts`) — both reused.
- `cafes.createForOwner` from Slice 1 — extended in this slice to also insert the owner's `cafeStaff` row.
- `users.name` from the Slice 1 auth fix — owner's display name comes from there.
- shadcn primitives from Slice 1 (`Field`, `FieldGroup`, `FieldError`, `Spinner`, `ConfirmArchive`, `AlertDialog`, `Dialog`/`Sheet` for PIN modal) — all already installed.
- Settings layout from Slice 1 (`_pos/settings/route.tsx`) — adds a Staff link.
- WizardStepper from Slice 1 — step 4 `enabled` flips to `true`.
- `formatIDR` from Phase 0 — used in the summary panel.

## Next step

Invoke the writing-plans skill to produce the Slice 2 implementation plan. The plan will sequence:
1. Schema migration + `cafes.createForOwner` extension (owner auto-insert) + `requireActiveCashier` helper + `convex/lib/pin.ts`.
2. Staff backend (TDD) — list/create/updateName/resetPin/archive/verifyPin.
3. Shifts backend (TDD) — current/open/close.
4. `<PinEntry>` + `<StaffPickerCard>` + `useActiveCashier` hook.
5. PIN picker route + PinGate component.
6. Shift open/close routes + ShiftSummaryPanel.
7. Settings → Staff page.
8. Onboarding step 4 (wizard step toggle + cashier route).
9. Playwright E2E.
10. Final verification + lingui extract.

Each backend step is TDD-first; UI follows. Aim for 15–18 tasks total — smaller than Slice 1 because the shadcn primitives + helpers are already in place.
