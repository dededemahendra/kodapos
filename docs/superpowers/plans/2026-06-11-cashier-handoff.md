# Cashier Handoff + Session Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit mid-shift cashier handoff (re-PIN → new active cashier, shift stays open) and a `cashierSessions` audit ledger (login/switch/logout) surfaced as a timeline in the shift-history detail.

**Architecture:** A new `cashierSessions` table + `record`/`listForShift`. The `/pin` flow records a session on PIN success (type `switch` if someone was already active, else `login`) and routes to `/sale` when a shift is open (else `/shift/open`). Both logout paths record a `logout`. A "Ganti kasir" button on the sale screen enters `/pin`. The `/shifts` detail shows a cashier timeline.

**Tech Stack:** Convex (mutation/query), TanStack Start + React, Lingui, Vitest + convex-test.

**Spec:** `docs/superpowers/specs/2026-06-11-cashier-handoff-design.md`

**Branch:** `feat/cashier-handoff` (already created off `main`, spec committed).

**Conventions:**
- Run CI locally before push: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`. Confirm `git status` is clean before push (a tracked generated file left uncommitted passes local typecheck but fails CI).
- Do NOT run `convex codegen`. `cashierSessions` is a NEW module referenced via `api.cashierSessions.*` — hand-add it to `convex/_generated/api.d.ts` (import + `fullApi` entry, alphabetical) and commit; the dev watcher may do it.
- New UI strings are Bahasa Indonesia via Lingui; run `pnpm lingui:extract` and fill `en`.
- Small conventional commits per task.

---

## Task 1: `cashierSessions` table + `record` + `listForShift`

**Files:**
- Modify: `convex/schema.ts`
- Create: `convex/cashierSessions.ts`
- Modify: `convex/_generated/api.d.ts`
- Test: `tests/convex/cashier-sessions.test.ts`

- [ ] **Step 1: Add the table to `convex/schema.ts`**
```ts
  cashierSessions: defineTable({
    cafeId: v.id('cafes'),
    cashierId: v.id('cafeStaff'),
    shiftId: v.optional(v.id('shifts')),
    type: v.union(v.literal('login'), v.literal('switch'), v.literal('logout')),
    at: v.number(),
  }).index('by_shift', ['shiftId']),
```

- [ ] **Step 2: Create `convex/cashierSessions.ts`**
```ts
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwnerCafe } from './lib/auth';

export const record = mutation({
  args: {
    cashierId: v.id('cafeStaff'),
    type: v.union(v.literal('login'), v.literal('switch'), v.literal('logout')),
  },
  returns: v.id('cashierSessions'),
  handler: async (ctx, { cashierId, type }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const openShift = await ctx.db
      .query('shifts')
      .withIndex('by_cafe_status', (q) => q.eq('cafeId', cafeId).eq('status', 'open'))
      .first();
    return await ctx.db.insert('cashierSessions', {
      cafeId,
      cashierId,
      ...(openShift ? { shiftId: openShift._id } : {}),
      type,
      at: Date.now(),
    });
  },
});

export const listForShift = query({
  args: { shiftId: v.id('shifts') },
  returns: v.array(
    v.object({
      _id: v.id('cashierSessions'),
      cashierId: v.id('cafeStaff'),
      cashierName: v.string(),
      type: v.union(v.literal('login'), v.literal('switch'), v.literal('logout')),
      at: v.number(),
    })
  ),
  handler: async (ctx, { shiftId }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const rows = await ctx.db
      .query('cashierSessions')
      .withIndex('by_shift', (q) => q.eq('shiftId', shiftId))
      .collect();
    const staff = await ctx.db
      .query('cafeStaff')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId))
      .collect();
    const nameById = new Map(staff.map((s) => [s._id, s.name] as const));
    return rows
      .filter((r) => r.cafeId === cafeId)
      .sort((a, b) => a.at - b.at)
      .map((r) => ({ _id: r._id, cashierId: r.cashierId, cashierName: nameById.get(r.cashierId) ?? '—', type: r.type, at: r.at }));
  },
});
```
> Confirm `cafeStaff`'s index is `by_cafe_active` (`['cafeId','archived']`) — `.eq('cafeId', cafeId)` on it returns all staff for the cafe. If the name differs, adjust.

- [ ] **Step 3: Register `cashierSessions` in `convex/_generated/api.d.ts`**

Add alphabetically (after `cashMovements`): `import type * as cashierSessions from "../cashierSessions.js";` and `cashierSessions: typeof cashierSessions;` in `fullApi`. (Note alphabetical: `cashierSessions` vs `cashMovements` — `cashMovements` < `cashierSessions`? compare char-by-char: `cashM` vs `cashi` → 'M'(0x4D) < 'i'(0x69), so `cashMovements` comes first. Place `cashierSessions` after `cashMovements`.) Verify against the existing ordering; a dev watcher may already have added it correctly.

- [ ] **Step 4: Tests `tests/convex/cashier-sessions.test.ts`**

Inline-copy `setup()` from `orders.test.ts` (opens a shift). Confirm `shifts.close` args.
```ts
describe('cashierSessions', () => {
  it('record attaches the open shift; listForShift returns ordered events with names', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId } = await setup(t);
    await asOwner.mutation(api.cashierSessions.record, { cashierId, type: 'login' });
    await asOwner.mutation(api.cashierSessions.record, { cashierId, type: 'switch' });
    await asOwner.mutation(api.cashierSessions.record, { cashierId, type: 'logout' });
    const list = await asOwner.query(api.cashierSessions.listForShift, { shiftId });
    expect(list.map((e) => e.type)).toEqual(['login', 'switch', 'logout']);
    expect(list.every((e) => e.cashierName.length > 0)).toBe(true);
  });

  it('record omits shiftId when no shift is open', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId } = await setup(t);
    await asOwner.mutation(api.shifts.close, { id: shiftId, countedCashIDR: 100000 });
    const id = await asOwner.mutation(api.cashierSessions.record, { cashierId, type: 'logout' });
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row?.shiftId).toBeUndefined();
  });
});
```
Run `pnpm test tests/convex/cashier-sessions.test.ts` → PASS.

- [ ] **Step 5: Verify + commit**
`pnpm typecheck`, full `pnpm test`.
```bash
git add convex/schema.ts convex/cashierSessions.ts convex/_generated/api.d.ts tests/convex/cashier-sessions.test.ts
git commit -m "feat(cashier): cashierSessions ledger (record + listForShift)"
```

---

## Task 2: `/pin` records the session + smart navigation

**Files:**
- Modify: `src/routes/_pos/pin.tsx`

- [ ] **Step 1: Record + route by open-shift in `pin.tsx`**

Add `const record = useMutation(api.cashierSessions.record);` (import `useMutation` from `convex/react`) and read the previous active cashier: change `const { setCashier } = useActiveCashier();` to `const { cashierId, setCashier } = useActiveCashier();`. Add a shared helper that records, sets, and routes:
```tsx
async function activate(id: Id<'cafeStaff'>): Promise<void> {
  const wasActive = cashierId !== null;
  await record({ cashierId: id, type: wasActive ? 'switch' : 'login' });
  setCashier(id);
  const open = await convex.query(api.shifts.current, {});
  navigate({ to: open ? '/sale' : '/shift/open' });
}
```
Rewrite both entry points to use it:
```tsx
async function selectWithoutPin(id: Id<'cafeStaff'>): Promise<void> {
  await activate(id);
}
async function selectWithPin(pin: string): Promise<void> {
  if (!picking) return;
  const ok = await convex.query(api.staff.verifyPin, { id: picking.id, pin });
  if (!ok) { setError(t`PIN salah.`); return; }
  const id = picking.id;
  setPicking(null);
  await activate(id);
}
```
(`convex` is already from `useConvex()`. `api.shifts.current` takes `{}`.)

- [ ] **Step 2: Typecheck + commit**
`pnpm typecheck` (PASS).
```bash
git add src/routes/_pos/pin.tsx
git commit -m "feat(cashier): /pin records session + routes to /sale when a shift is open"
```

---

## Task 3: "Ganti kasir" button + logout events

**Files:**
- Modify: `src/components/sale/sale-screen.tsx`
- Modify: `src/routes/_pos/shift/close.tsx`
- Modify: `src/components/nav-user.tsx`

- [ ] **Step 1: "Ganti kasir" button on the sale screen**

In `sale-screen.tsx`, near the existing "Kas" affordance (the cart header / `onKas` wiring), add a switch entry to `/pin`. Simplest: a `<Button asChild variant="outline" size="sm"><Link to="/pin"><Trans>Ganti kasir</Trans></Link></Button>` rendered only when `shift && cashierId` (same gating as Kas). If the Kas button lives in `CartPane` via an `onSwitch`-style prop, mirror that; otherwise place the Link button alongside it. Import `Link` from `@tanstack/react-router` and `Trans` if needed.

- [ ] **Step 2: Record `logout` on shift close (`close.tsx`)**

In `close.tsx` `onSubmit`, before `clearCashier()`, record a logout for the active cashier. Add `const record = useMutation(api.cashierSessions.record);` and `const { clearCashier, cashierId } = useActiveCashier();` (add `cashierId`). Then:
```tsx
      if (cashierId) await record({ cashierId, type: 'logout' });
      clearCashier();
```
(Record BEFORE clearCashier so the open shift is still current and gets attached.) Note: `shifts.close` runs first in the handler — record after close is fine too, but recording before clearCashier with the shift just-closed means `record` finds no open shift → `shiftId` omitted. To attach the closing shift, record `logout` **before** calling `closeShift`. Reorder so it's: `if (cashierId) await record({ cashierId, type: 'logout' });` then `await closeShift(...)` then `clearCashier()`. Place the record call as the first awaited action in the try block.

- [ ] **Step 3: Record `logout` on sign-out (`nav-user.tsx`)**

In `handleSignOut`, before `clearCashier()`:
```tsx
  const record = useMutation(api.cashierSessions.record); // add at top with other hooks
  // ... in handleSignOut, first line:
  if (cashierId) { try { await record({ cashierId, type: 'logout' }); } catch { /* best effort */ } }
  clearCashier();
```
Add `cashierId` to the `useActiveCashier()` destructure and the `api`/`useMutation` imports if missing. Wrap in try/catch (sign-out must proceed even if recording fails).

- [ ] **Step 4: Typecheck + commit**
`pnpm typecheck` (PASS), `pnpm test` (no regressions).
```bash
git add src/components/sale/sale-screen.tsx src/routes/_pos/shift/close.tsx src/components/nav-user.tsx
git commit -m "feat(cashier): switch button + record logout on close/sign-out"
```

---

## Task 4: Cashier timeline in the shift-history detail

**Files:**
- Modify: `src/routes/_pos/shifts.tsx`

- [ ] **Step 1: Render the timeline in the selected-shift detail**

In `shifts.tsx`, the `if (selected) { ... }` detail block renders `<ShiftOrderList shiftId={selected} />`. Above it, add a cashier timeline from `useQuery(api.cashierSessions.listForShift, { shiftId: selected })`:
```tsx
const sessions = useQuery(api.cashierSessions.listForShift, selected ? { shiftId: selected } : 'skip');
// inside the `if (selected)` return, above <ShiftOrderList>:
{sessions && sessions.length > 0 ? (
  <div className="rounded-md border border-border p-3">
    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2"><Trans>Riwayat kasir</Trans></div>
    <ul className="text-sm space-y-1">
      {sessions.map((s) => (
        <li key={s._id} className="flex justify-between">
          <span>{s.cashierName} · {s.type === 'login' ? <Trans>Masuk</Trans> : s.type === 'switch' ? <Trans>Ganti</Trans> : <Trans>Keluar</Trans>}</span>
          <span className="text-muted-foreground tabular-nums">{new Date(s.at).toLocaleTimeString('id-ID')}</span>
        </li>
      ))}
    </ul>
  </div>
) : null}
```
Call the `useQuery` at the top level of the component (not inside the `if`) with the `'skip'` guard, so hooks order is stable. Import `Trans` (already imported) and `api` (already imported).

- [ ] **Step 2: Typecheck + commit**
`pnpm typecheck` (PASS).
```bash
git add src/routes/_pos/shifts.tsx
git commit -m "feat(cashier): cashier timeline in the shift-history detail"
```

---

## Task 5: i18n + final verification

**Files:**
- Modify: `src/locales/en/messages.po`, `src/locales/id/messages.po`

- [ ] **Step 1: Extract + fill `en`**

Run `pnpm lingui:extract`. Fill `en` for new strings: `Ganti kasir` → "Switch cashier", `Riwayat kasir` → "Cashier activity", `Masuk` → "In", `Ganti` → "Switch", `Keluar` → "Out", and any other surfaced msgid. Do NOT leave any new `msgstr` empty.

- [ ] **Step 2: Compile + verify 0 missing**
`pnpm lingui:compile`, then `pnpm lingui:extract` again → `en` 0 missing.

- [ ] **Step 3: Full gate + commit**
```bash
pnpm typecheck && pnpm test && pnpm lingui:compile
git add src/locales/en/messages.po src/locales/id/messages.po
git commit -m "i18n(cashier): translate handoff + session strings"
```

---

## Self-review notes (addressed)

- **Spec coverage:** `cashierSessions` table + record/listForShift (T1), `/pin` record + switch/login type + smart nav (T2), switch button + logout at both clearCashier sites (T3), timeline in shift detail (T4), i18n (T5). Tests cover record/list/ordering/shift-attach/no-shift (T1).
- **Type consistency:** `record({ cashierId, type })` and the `type` union (`login`/`switch`/`logout`) used identically in T1 (mutation) and T2/T3 (callers); `listForShift` row `{ _id, cashierId, cashierName, type, at }` matches the T4 timeline render.
- **Logout-before-close ordering:** T3 Step 2 records `logout` BEFORE `closeShift` so the open shift is still current and `shiftId` attaches.
- **Hooks stability:** T4 calls `useQuery(... 'skip')` at top level, not inside the `if (selected)` branch.
- **Module registration:** `cashierSessions` added to `api.d.ts` (codegen unavailable). No route change → no `routeTree.gen.ts` concern.
- **Shift unchanged:** no write to `shift.cashierId`; orders keep attributing to the active cashier passed by the sale flow.
