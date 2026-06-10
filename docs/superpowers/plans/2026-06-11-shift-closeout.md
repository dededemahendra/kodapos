# Shift Close-out + Cash Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn shift close into a true cash reconciliation — an append-only `cashMovements` ledger, expected-vs-counted computed and stored at close (`openingFloat + cashSales + cashIn − cashOut`), a full close-out breakdown screen, and the stored variance wired into the shift-history list.

**Architecture:** New `cashMovements` table + `record`/`listForShift`. `shifts.close` computes and stores `expectedCashIDR`/`varianceIDR`; a `closeoutSummary` query feeds the breakdown UI; `shifts.listClosed` reads the stored values (estimate fallback for legacy shifts). A `CashMovementDialog` (launched from the sale screen) records drawer movements; `close.tsx` shows the full breakdown.

**Tech Stack:** Convex (mutations/queries), TanStack Start + React, Lingui, shadcn, Vitest + convex-test.

**Spec:** `docs/superpowers/specs/2026-06-11-shift-closeout-design.md`

**Branch:** `feat/shift-closeout` (already created off `main`, spec committed).

**Conventions:**
- Run CI locally before push: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`.
- Do NOT run `convex codegen` (interactive auth unavailable). `cashMovements` is a NEW module referenced via `api.cashMovements.*` — hand-add it to `convex/_generated/api.d.ts` (import line + `fullApi` entry, alphabetical) following the existing pattern, and commit it. The dev watcher may do this automatically.
- New UI strings are Bahasa Indonesia via Lingui; run `pnpm lingui:extract` and fill `en`.
- Small conventional commits per task.

---

## Task 1: `cashMovements` schema + module registration

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/_generated/api.d.ts`

- [ ] **Step 1: Add the table to `convex/schema.ts`**

Add (e.g. after `inventoryMovements` or near the other movement tables):
```ts
  cashMovements: defineTable({
    cafeId: v.id('cafes'),
    shiftId: v.id('shifts'),
    cashierId: v.id('cafeStaff'),
    direction: v.union(v.literal('in'), v.literal('out')),
    amountIDR: v.number(),
    note: v.optional(v.string()),
    at: v.number(),
  }).index('by_shift', ['shiftId']),
```

- [ ] **Step 2: Register the module in `convex/_generated/api.d.ts`**

The file will not yet reference `cashMovements` (the module is created in Task 2). After Task 2 exists, OR pre-emptively now: add, alphabetically:
- import line: `import type * as cashMovements from "../cashMovements.js";` (after the `cafes` import)
- `fullApi` entry: `cashMovements: typeof cashMovements;` (after `cafes`)

> If you do Step 2 before `convex/cashMovements.ts` exists, `pnpm typecheck` will error on the missing import — so create an empty `convex/cashMovements.ts` (`export {}`) now, or do this registration as part of Task 2's commit. Recommended: defer the api.d.ts edit to Task 2 (commit them together). Here, just do Step 1 (schema) + typecheck.

- [ ] **Step 3: Typecheck + commit (schema only)**

Run: `pnpm typecheck` (PASS — schema-only change; `DataModel` derives from `typeof schema`).
```bash
git add convex/schema.ts
git commit -m "feat(shift): cashMovements table"
```

---

## Task 2: `cashMovements.record` + `listForShift`

**Files:**
- Create: `convex/cashMovements.ts`
- Modify: `convex/_generated/api.d.ts`
- Test: `tests/convex/cash-movements.test.ts`

- [ ] **Step 1: Implement `convex/cashMovements.ts`**

```ts
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwnerCafe } from './lib/auth';

function assertIDR(n: number, label: string): number {
  if (!Number.isInteger(n)) throw new Error(`${label} harus berupa angka bulat (rupiah).`);
  if (n <= 0) throw new Error(`${label} harus lebih dari nol.`);
  return n;
}

export const record = mutation({
  args: {
    direction: v.union(v.literal('in'), v.literal('out')),
    amountIDR: v.number(),
    note: v.optional(v.string()),
  },
  returns: v.id('cashMovements'),
  handler: async (ctx, { direction, amountIDR, note }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const shift = await ctx.db
      .query('shifts')
      .withIndex('by_cafe_status', (q) => q.eq('cafeId', cafeId).eq('status', 'open'))
      .first();
    if (!shift) throw new Error('Tidak ada shift terbuka.');
    const amount = assertIDR(amountIDR, 'Jumlah kas');
    const trimmed = note?.trim();
    return await ctx.db.insert('cashMovements', {
      cafeId,
      shiftId: shift._id,
      cashierId: shift.cashierId,
      direction,
      amountIDR: amount,
      ...(trimmed ? { note: trimmed } : {}),
      at: Date.now(),
    });
  },
});

export const listForShift = query({
  args: { shiftId: v.id('shifts') },
  returns: v.array(
    v.object({
      _id: v.id('cashMovements'),
      direction: v.union(v.literal('in'), v.literal('out')),
      amountIDR: v.number(),
      note: v.optional(v.string()),
      at: v.number(),
    })
  ),
  handler: async (ctx, { shiftId }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const rows = await ctx.db
      .query('cashMovements')
      .withIndex('by_shift', (q) => q.eq('shiftId', shiftId))
      .collect();
    return rows
      .filter((m) => m.cafeId === cafeId)
      .sort((a, b) => b.at - a.at)
      .map((m) => ({
        _id: m._id,
        direction: m.direction,
        amountIDR: m.amountIDR,
        ...(m.note !== undefined ? { note: m.note } : {}),
        at: m.at,
      }));
  },
});
```

- [ ] **Step 2: Register in `convex/_generated/api.d.ts`**

Add (alphabetical): `import type * as cashMovements from "../cashMovements.js";` and `cashMovements: typeof cashMovements;` in `fullApi`.

- [ ] **Step 3: Tests `tests/convex/cash-movements.test.ts`**

Inline-copy `setup()` (opens a shift) from `tests/convex/orders.test.ts`.
```ts
describe('cashMovements', () => {
  it('records a movement against the open shift and lists it', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId } = await setup(t);
    const id = await asOwner.mutation(api.cashMovements.record, { direction: 'out', amountIDR: 15000, note: 'beli es' });
    expect(id).toBeDefined();
    const list = await asOwner.query(api.cashMovements.listForShift, { shiftId });
    expect(list).toHaveLength(1);
    expect(list[0]?.direction).toBe('out');
    expect(list[0]?.amountIDR).toBe(15000);
    expect(list[0]?.note).toBe('beli es');
  });

  it('rejects when no shift is open', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId } = await setup(t);
    await asOwner.mutation(api.shifts.close, { id: shiftId, countedCashIDR: 100000 });
    await expect(asOwner.mutation(api.cashMovements.record, { direction: 'in', amountIDR: 5000 }))
      .rejects.toThrow(/tidak ada shift terbuka/i);
  });

  it('rejects a non-positive amount', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    await expect(asOwner.mutation(api.cashMovements.record, { direction: 'in', amountIDR: 0 }))
      .rejects.toThrow(/lebih dari nol/i);
  });
});
```
Run `pnpm test tests/convex/cash-movements.test.ts` → PASS.

- [ ] **Step 4: Verify + commit**

`pnpm typecheck` (PASS — `api.cashMovements.*` resolves via the api.d.ts entry), full `pnpm test` (no regressions).
```bash
git add convex/cashMovements.ts convex/_generated/api.d.ts tests/convex/cash-movements.test.ts
git commit -m "feat(shift): cashMovements record + listForShift"
```

---

## Task 3: `shifts.close` stores reconciliation; `closeoutSummary`; `listClosed` reads stored

**Files:**
- Modify: `convex/shifts.ts`
- Test: `tests/convex/shifts.test.ts`

- [ ] **Step 1: Add a shared `computeExpectedCash` helper + modify `close`**

In `convex/shifts.ts`, add a helper used by both `close` and `closeoutSummary`:
```ts
async function shiftCashBreakdown(ctx: QueryCtx | MutationCtx, shift: Doc<'shifts'>) {
  const orders = await ctx.db
    .query('orders')
    .withIndex('by_shift', (q) => q.eq('shiftId', shift._id))
    .collect();
  const cashSalesIDR = orders
    .filter((o) => o.paymentStatus === 'paid' && o.paymentMethod === 'cash')
    .reduce((s, o) => s + o.totalIDR, 0);
  const movements = await ctx.db
    .query('cashMovements')
    .withIndex('by_shift', (q) => q.eq('shiftId', shift._id))
    .collect();
  let cashInIDR = 0;
  let cashOutIDR = 0;
  for (const m of movements) {
    if (m.direction === 'in') cashInIDR += m.amountIDR;
    else cashOutIDR += m.amountIDR;
  }
  const expectedCashIDR = shift.openingFloatIDR + cashSalesIDR + cashInIDR - cashOutIDR;
  return { cashSalesIDR, cashInIDR, cashOutIDR, expectedCashIDR };
}
```
Add `import type { MutationCtx } from './_generated/server';` (alongside `QueryCtx`). Modify `close`'s patch to compute and store expected + variance:
```ts
    const counted = assertIDR(countedCashIDR, 'Uang terhitung');
    const { expectedCashIDR } = await shiftCashBreakdown(ctx, shift);
    await ctx.db.patch(id, {
      status: 'closed',
      closedAt: Date.now(),
      countedCashIDR: counted,
      expectedCashIDR,
      varianceIDR: counted - expectedCashIDR,
    });
```

- [ ] **Step 2: Add `closeoutSummary` query**

```ts
export const closeoutSummary = query({
  args: { shiftId: v.id('shifts') },
  returns: v.object({
    cashierName: v.string(),
    openingFloatIDR: v.number(),
    cashSalesIDR: v.number(),
    cashInIDR: v.number(),
    cashOutIDR: v.number(),
    expectedCashIDR: v.number(),
    countedCashIDR: v.union(v.number(), v.null()),
    varianceIDR: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, { shiftId }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const shift = await requireOwned(ctx, cafeId, shiftId, 'Shift');
    const { cashSalesIDR, cashInIDR, cashOutIDR, expectedCashIDR } = await shiftCashBreakdown(ctx, shift);
    const cashier = await ctx.db.get(shift.cashierId);
    const countedCashIDR = shift.countedCashIDR ?? null;
    return {
      cashierName: cashier?.name ?? '—',
      openingFloatIDR: shift.openingFloatIDR,
      cashSalesIDR,
      cashInIDR,
      cashOutIDR,
      expectedCashIDR,
      countedCashIDR,
      varianceIDR: countedCashIDR !== null ? countedCashIDR - expectedCashIDR : null,
    };
  },
});
```

- [ ] **Step 3: `summarizeShift` (in `listClosed`) reads stored values**

Change the two computed lines in `summarizeShift` to prefer stored:
```ts
  const countedCashIDR = shift.countedCashIDR ?? null;
  const expectedCashIDR = shift.expectedCashIDR ?? (shift.openingFloatIDR + cashSalesIDR);
  // ... in the return object:
  expectedCashIDR,
  varianceIDR: shift.varianceIDR ?? (countedCashIDR !== null ? countedCashIDR - expectedCashIDR : null),
```
(Legacy closed shifts have no stored `expectedCashIDR`/`varianceIDR` → estimate; new ones use stored, which include movements.)

- [ ] **Step 4: Tests in `tests/convex/shifts.test.ts`**

```ts
describe('shifts.close reconciliation', () => {
  it('stores expected = float + cashSales + in − out, and variance', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t); // openingFloat 100000
    await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'c1', shiftId, cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000, createdAtClient: 1,
    }); // cash sale 18000
    await asOwner.mutation(api.cashMovements.record, { direction: 'in', amountIDR: 5000 });
    await asOwner.mutation(api.cashMovements.record, { direction: 'out', amountIDR: 3000 });
    // expected = 100000 + 18000 + 5000 - 3000 = 120000
    await asOwner.mutation(api.shifts.close, { id: shiftId, countedCashIDR: 121000 });
    const shift = await t.run((ctx) => ctx.db.get(shiftId));
    expect(shift?.expectedCashIDR).toBe(120000);
    expect(shift?.varianceIDR).toBe(1000); // 121000 - 120000
    // listClosed reads the STORED values (incl. movements):
    const res = await asOwner.query(api.shifts.listClosed, { paginationOpts: { numItems: 20, cursor: null } });
    expect(res.page[0]?.expectedCashIDR).toBe(120000);
    expect(res.page[0]?.varianceIDR).toBe(1000);
  });

  it('closeoutSummary breaks down an open shift (counted/variance null)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'c2', shiftId, cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000, createdAtClient: 1,
    });
    const s = await asOwner.query(api.shifts.closeoutSummary, { shiftId });
    expect(s.cashSalesIDR).toBe(18000);
    expect(s.expectedCashIDR).toBe(118000);
    expect(s.countedCashIDR).toBeNull();
    expect(s.varianceIDR).toBeNull();
  });
});
```
Run `pnpm test tests/convex/shifts.test.ts` → PASS (adjust opening-float number if `setup()` differs).

- [ ] **Step 5: Verify + commit**

`pnpm typecheck` + full `pnpm test`.
```bash
git add convex/shifts.ts tests/convex/shifts.test.ts
git commit -m "feat(shift): close stores expected/variance; closeoutSummary; history reads stored"
```

---

## Task 4: `CashMovementDialog` + "Kas" button on the sale screen

**Files:**
- Create: `src/components/shift/cash-movement-dialog.tsx`
- Modify: `src/components/sale/sale-screen.tsx`

- [ ] **Step 1: Create `src/components/shift/cash-movement-dialog.tsx`**

```tsx
import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { formatIDR } from '~/lib/money';

export function CashMovementDialog({
  open, onOpenChange, shiftId,
}: { open: boolean; onOpenChange: (o: boolean) => void; shiftId: Id<'shifts'> }) {
  const { t } = useLingui();
  const record = useMutation(api.cashMovements.record);
  const movements = useQuery(api.cashMovements.listForShift, open ? { shiftId } : 'skip');
  const [direction, setDirection] = useState<'in' | 'out'>('out');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const amt = Number.parseInt(amount, 10);
    if (!Number.isInteger(amt) || amt <= 0) { setError(t`Jumlah harus lebih dari nol.`); return; }
    setSubmitting(true); setError(null);
    try {
      await record({ direction, amountIDR: amt, ...(note.trim() ? { note: note.trim() } : {}) });
      setAmount(''); setNote('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t`Gagal mencatat kas.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle><Trans>Kas masuk / keluar</Trans></DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={direction === 'in' ? 'default' : 'outline'} onClick={() => setDirection('in')}>
              <Trans>Kas masuk</Trans>
            </Button>
            <Button type="button" variant={direction === 'out' ? 'default' : 'outline'} onClick={() => setDirection('out')}>
              <Trans>Kas keluar</Trans>
            </Button>
          </div>
          <Input type="number" min="1" step="1000" inputMode="numeric" placeholder={t`Jumlah (Rp)`}
            value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Input placeholder={t`Catatan (opsional)`} value={note} onChange={(e) => setNote(e.target.value)} />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="button" onClick={submit} disabled={submitting} className="w-full">
            {submitting ? <Spinner data-icon="inline-start" /> : null}<Trans>Catat</Trans>
          </Button>
          {movements && movements.length > 0 ? (
            <ul className="text-xs divide-y divide-border border border-border rounded-md max-h-40 overflow-auto">
              {movements.map((m) => (
                <li key={m._id} className="flex justify-between p-2">
                  <span className="text-muted-foreground">
                    {m.direction === 'in' ? <Trans>Masuk</Trans> : <Trans>Keluar</Trans>}{m.note ? ` · ${m.note}` : ''}
                  </span>
                  <span className={`tabular-nums ${m.direction === 'in' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {m.direction === 'in' ? '+' : '−'}{formatIDR(m.amountIDR)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Add a "Kas" button to `sale-screen.tsx`**

Read `src/components/sale/sale-screen.tsx` to find where the open shift is in scope (it reads `shift` from `api.shifts.current` — confirm; if not, add `const shift = useQuery(api.shifts.current, {})`). Add a small "Kas" button (e.g. into the MenuPane toolbar or a corner of the sale screen) and mount the dialog:
```tsx
const [kasOpen, setKasOpen] = useState(false);
// ... a Button somewhere visible in the sale screen:
//   {shift ? <Button variant="outline" size="sm" onClick={() => setKasOpen(true)}><Trans>Kas</Trans></Button> : null}
// ... mounted near the other dialogs:
{shift && cashierId ? (
  <CashMovementDialog open={kasOpen} onOpenChange={setKasOpen} shiftId={shift._id} />
) : null}
```
Place the button where it's reachable but unobtrusive (read the JSX and pick a sensible spot — e.g. a header row above the MenuPane, or next to the existing controls). Import `CashMovementDialog` + `Button` + `Trans` as needed.

- [ ] **Step 3: Typecheck + commit**

`pnpm typecheck` (PASS).
```bash
git add src/components/shift/cash-movement-dialog.tsx src/components/sale/sale-screen.tsx
git commit -m "feat(shift): cash-movement dialog launched from the sale screen"
```

---

## Task 5: Close-out breakdown on `close.tsx` + `ShiftSummaryPanel`

**Files:**
- Modify: `src/components/shift/shift-summary-panel.tsx`
- Modify: `src/routes/_pos/shift/close.tsx`

- [ ] **Step 1: Extend `ShiftSummary` + `ShiftSummaryPanel`**

Add optional fields to the `ShiftSummary` interface: `cashSalesIDR?: number; cashInIDR?: number; cashOutIDR?: number;`. In the panel, render these rows (when present) between "Modal awal" and "Uang seharusnya":
```tsx
{shift.cashSalesIDR !== undefined && (<><dt className="text-muted-foreground"><Trans>Penjualan tunai</Trans></dt><dd>{formatIDR(shift.cashSalesIDR)}</dd></>)}
{shift.cashInIDR !== undefined && shift.cashInIDR > 0 && (<><dt className="text-muted-foreground"><Trans>Kas masuk</Trans></dt><dd>+{formatIDR(shift.cashInIDR)}</dd></>)}
{shift.cashOutIDR !== undefined && shift.cashOutIDR > 0 && (<><dt className="text-muted-foreground"><Trans>Kas keluar</Trans></dt><dd>−{formatIDR(shift.cashOutIDR)}</dd></>)}
```

- [ ] **Step 2: Rework `close.tsx` to show the breakdown**

In the open-shift (pre-close) view, fetch `closeoutSummary` for the current shift and feed its fields into `ShiftSummaryPanel` (cashier, opening float, cash sales, cash in/out, expected). Keep the counted-cash `Input`; add a **live variance preview** computed client-side as `Number(countedInput) − summary.expectedCashIDR` (show Over/Short). On submit call `close` as today; after close, build the `ShiftSummary` for the result panel from the same `closeoutSummary` fields + the entered counted + the now-stored variance.

Concretely, replace the pre-close `ShiftSummaryPanel shift={current}` with a summary built from `useQuery(api.shifts.closeoutSummary, current ? { shiftId: current._id } : 'skip')`:
```tsx
const summary = useQuery(api.shifts.closeoutSummary, current ? { shiftId: current._id } : 'skip');
// panelShift for ShiftSummaryPanel:
const panelShift = summary && current ? {
  _id: current._id, cashierId: current.cashierId, cashierName: summary.cashierName,
  openedAt: current.openedAt, openingFloatIDR: summary.openingFloatIDR,
  cashSalesIDR: summary.cashSalesIDR, cashInIDR: summary.cashInIDR, cashOutIDR: summary.cashOutIDR,
  expectedCashIDR: summary.expectedCashIDR,
} : null;
```
Show a live variance hint below the input:
```tsx
{summary && countedStr ? (() => {
  const variance = Number.parseInt(countedStr, 10) - summary.expectedCashIDR;
  return Number.isFinite(variance) ? (
    <p className={`text-sm ${variance === 0 ? 'text-muted-foreground' : variance > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
      <Trans>Selisih</Trans>: {variance > 0 ? `+${formatIDR(variance)}` : formatIDR(variance)}
      {' '}{variance > 0 ? <Trans>(Lebih)</Trans> : variance < 0 ? <Trans>(Kurang)</Trans> : null}
    </p>
  ) : null;
})() : null}
```
(Track the input in state `countedStr` instead of only reading FormData, so the preview is live. `current.cashierId` exists on the `shifts.current` result — confirm; if not, use `summary` only.) After a successful close, set the result panel's shift to include `countedCashIDR` + `varianceIDR: counted - summary.expectedCashIDR`.

- [ ] **Step 3: Typecheck + commit**

`pnpm typecheck` (PASS).
```bash
git add src/components/shift/shift-summary-panel.tsx src/routes/_pos/shift/close.tsx
git commit -m "feat(shift): full close-out breakdown with live variance preview"
```

---

## Task 6: i18n + final verification

**Files:**
- Modify: `src/locales/en/messages.po`, `src/locales/id/messages.po`

- [ ] **Step 1: Extract + fill `en`**

Run `pnpm lingui:extract`. Fill `en` for new strings, e.g.: `Kas` → "Cash", `Kas masuk / keluar` → "Cash in / out", `Kas masuk` → "Cash in", `Kas keluar` → "Cash out", `Catat` → "Record", `Catatan (opsional)` → "Note (optional)", `Jumlah (Rp)` → "Amount (Rp)", `Jumlah harus lebih dari nol.` → "Amount must be greater than zero.", `Gagal mencatat kas.` → "Failed to record cash movement.", `Penjualan tunai` → "Cash sales", `Masuk` → "In", `Keluar` → "Out", `(Lebih)`/`(Kurang)` if not already present → "(Over)"/"(Short)". Do NOT leave any new `msgstr` empty.

- [ ] **Step 2: Compile + verify 0 missing**

`pnpm lingui:compile`, then `pnpm lingui:extract` again → `en` shows 0 missing.

- [ ] **Step 3: Full gate + commit**

```bash
pnpm typecheck && pnpm test && pnpm lingui:compile
git add src/locales/en/messages.po src/locales/id/messages.po
git commit -m "i18n(shift): translate cash-movement + close-out strings"
```

---

## Self-review notes (addressed)

- **Spec coverage:** `cashMovements` table (T1), record/listForShift (T2), close stores expected/variance + closeoutSummary + listClosed reads stored (T3), CashMovementDialog + sale-screen entry (T4), close.tsx breakdown + ShiftSummaryPanel (T5), i18n (T6). Expected formula `openingFloat + cashSales + cashIn − cashOut` implemented once in `shiftCashBreakdown` and reused by close + closeoutSummary (DRY).
- **Type consistency:** `direction: 'in'|'out'`, `amountIDR`, `cashSalesIDR`/`cashInIDR`/`cashOutIDR`/`expectedCashIDR`/`varianceIDR`/`countedCashIDR` used identically across `cashMovements.ts`, `shifts.ts` (`shiftCashBreakdown`/`closeoutSummary`/`close`/`summarizeShift`), `ShiftSummary`, and the UI.
- **api.d.ts:** `cashMovements` is a new module → registered manually (T1/T2) since codegen is unavailable.
- **Backward-compat:** `listClosed` falls back to the on-read estimate for legacy shifts (no stored `expectedCashIDR`).
- **Append-only:** no edit/delete mutations; mistakes corrected by an opposite movement.
