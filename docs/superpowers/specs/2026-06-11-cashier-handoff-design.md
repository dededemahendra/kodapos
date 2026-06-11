# Cashier Handoff + Session Audit Design Spec

**Date:** 2026-06-11
**Branch:** `feat/cashier-handoff` (off `main`)

## Context

The active cashier (who rings → `orders.cashierId`) is held client-side in
`localStorage` (`useActiveCashier`). A shift is opened under one cashier
(`shift.cashierId`) and the active cashier is cleared on close. There is **no
explicit mid-shift switch** (a new cashier must improvise via `/pin`, which then
wrongly routes to `/shift/open`) and **no record of who was active when**. This
slice adds an explicit cashier **handoff** that keeps the shift open, and a
`cashierSessions` **audit log** (login / switch / logout) surfaced in the
shift-history detail.

## Decisions (from brainstorming)

1. **Shift stays under its opener** (`shift.cashierId` unchanged); the active
   cashier changes for per-order attribution. Matches existing behavior.
2. **Switch requires the new cashier's PIN** (identity). No lock screen.
3. **Audit ledger** records `login` / `switch` / `logout` events, shown as a
   timeline in the `/shifts` shift detail.
4. Out of scope: UI permission enforcement (separate slice B).

## Data model

**New table `cashierSessions`:**
```ts
cashierSessions: defineTable({
  cafeId: v.id('cafes'),
  cashierId: v.id('cafeStaff'),
  shiftId: v.optional(v.id('shifts')), // the open shift at the time, if any
  type: v.union(v.literal('login'), v.literal('switch'), v.literal('logout')),
  at: v.number(),
}).index('by_shift', ['shiftId']),
```
No change to `shifts` (opener stays) or `orders` (already attribute to the active
cashier passed by the sale flow).

## Backend — `convex/cashierSessions.ts` (new)

- **`record({ cashierId, type })`** (mutation, owner-gated): looks up the cafe's
  open shift (`shifts.by_cafe_status` `status==='open'`) and inserts
  `{ cafeId, cashierId, shiftId: openShift?._id, type, at: Date.now() }`.
  Returns the new id.
- **`listForShift({ shiftId })`** (query, owner-gated): the shift's events via
  `by_shift`, oldest-first, each enriched with `cashierName` (resolved from a
  one-time `cafeStaff` map): `{ _id, cashierId, cashierName, type, at }[]`.

## Frontend

### `/pin` flow (`src/routes/_pos/pin.tsx`)

On PIN success (and the no-PIN path), before navigating:
1. Capture the previous active cashier (`const prev = cashierId` from
   `useActiveCashier()` — read before `setCashier`).
2. `await record({ cashierId: selectedId, type: prev ? 'switch' : 'login' })`.
3. `setCashier(selectedId)`.
4. **Smart navigation:** query `api.shifts.current`; if an open shift exists →
   `navigate({ to: '/sale' })` (a mid-shift handoff returns to the register);
   else → `navigate({ to: '/shift/open' })` (first login of the day). Use
   `useConvex().query(api.shifts.current, {})` at click time (the page already
   uses `useConvex()` for `verifyPin`).

Add `const record = useMutation(api.cashierSessions.record);` and
`const { cashierId, setCashier } = useActiveCashier();`.

### Switch affordance (`src/components/sale/sale-screen.tsx`)

A **"Ganti kasir"** button near the existing "Kas" control →
`<Link to="/pin">` (or `navigate`). Visiting `/pin` shows the picker; the flow
above re-PINs the new cashier and returns to `/sale` (shift stays open). Only
shown when a shift is open (same gating as the Kas button).

### Logout records a `logout` event

Both `clearCashier` call sites record first:
- `src/routes/_pos/shift/close.tsx` (on shift close): before `clearCashier()`,
  `await record({ cashierId: <active>, type: 'logout' })`.
- `src/components/nav-user.tsx` (sign-out): same — record `logout` before
  `clearCashier()`.
(The active cashier id is available from `useActiveCashier()`; skip recording if
it's already null.)

### Cashier timeline in the shift detail (`src/routes/_pos/shifts.tsx`)

In the selected-shift detail view (the #36 drill-in that renders
`ShiftOrderList`), add a small **cashier timeline** above the order list from
`useQuery(api.cashierSessions.listForShift, { shiftId: selected })`: a row per
event — `cashierName` · type label (`Masuk` / `Ganti` / `Keluar`) ·
`HH:MM`. Empty/omitted when there are no events (legacy shifts).

## Testing

- **`cashierSessions.record`**: attaches the open shift's id when one is open;
  `shiftId` omitted when none; stores the given `type`; owner-scoped.
- **`cashierSessions.listForShift`**: returns the shift's events oldest-first with
  `cashierName` resolved; owner-scoped; empty for a shift with no events.
- A sequence test: login → switch → logout produces three events of the right
  types for the shift.
- Frontend (`/pin` nav, switch button, timeline) validated by typecheck + the
  existing e2e shift flow.

## i18n

New Bahasa Indonesia strings (`Ganti kasir`, `Masuk`, `Ganti`, `Keluar`,
`Riwayat kasir` / timeline heading, etc.); fill the `en` catalog.

## Conventions

- Run CI locally before push: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`.
- Do NOT run `convex codegen` — `cashierSessions` is a NEW module referenced via
  `api.cashierSessions.*`, so add it to `convex/_generated/api.d.ts` (import +
  `fullApi` entry, alphabetical); the dev watcher may do this. Commit it.
- **Adding/removing a route?** Not here (no new route). If any route change is
  introduced, commit `src/routeTree.gen.ts` (it's tracked; local typecheck
  passes off the working tree but CI fails if uncommitted).
- Small conventional commits; PR → review → merge commit.

## Out of scope

- UI permission enforcement (slice B); a lock screen; reassigning the shift to a
  new cashier; per-cashier sub-totals within a shift; editing/deleting session
  events.
