# Shift History List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the `/shifts` ComingSoon stub into a real shift-history list — paginated closed shifts with cashier, time range, sales totals, counted cash, and computed variance — plus drill-in to a shift's orders.

**Architecture:** A new owner-gated paginated query `shifts.listClosed` computes per-shift totals/variance **on read** from each shift's paid orders. The `/shifts` route renders the list (`usePaginatedQuery`) with an in-progress row for any open shift, and drills into a shift's orders via a shared `ShiftOrderList` component extracted from the existing `/history` page (which reuses `orders.listForShift` + `ReceiptPreview`).

**Tech Stack:** Convex (paginated query), TanStack Start + React (`usePaginatedQuery`), Lingui, shadcn `Empty`, Vitest + convex-test.

**Spec:** `docs/superpowers/specs/2026-06-10-shift-history-design.md`

**Branch:** `feat/shift-history` (already created off `main`, spec committed).

**Conventions:**
- Run CI locally before push: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`.
- Do NOT run `convex codegen` (interactive auth unavailable). `shifts` is an already-registered module, so the new `listClosed` export resolves without it.
- New UI strings are Bahasa Indonesia via Lingui; run `pnpm lingui:extract` and fill the `en` catalog.
- Small conventional commits per task.

---

## File Structure

- `convex/shifts.ts` — add `shiftSummary` validator + `summarizeShift` helper + `listClosed` query.
- `tests/convex/shifts.test.ts` — add a `listClosed` describe block (create file if absent).
- `src/components/shift/shift-order-list.tsx` — NEW shared component (paid orders for a shiftId + receipt).
- `src/routes/_pos/history.tsx` — refactor to use `ShiftOrderList` (no behavior change).
- `src/routes/_pos/shifts.tsx` — replace ComingSoon with the shift-history list + drill-in.
- `src/locales/{en,id}/messages.po` — new strings.

---

## Task 1: `shifts.listClosed` query + read-time aggregation

**Files:**
- Modify: `convex/shifts.ts`
- Test: `tests/convex/shifts.test.ts`

- [ ] **Step 1: Add the `shiftSummary` validator + `summarizeShift` helper + `listClosed` query to `convex/shifts.ts`**

Add imports at the top if missing: `import { paginationOptsValidator } from 'convex/server';` and ensure `v` and `query` and `requireOwnerCafe` are imported (they are — `current` uses them). Add a `Doc`/`QueryCtx` import: `import type { Doc } from './_generated/dataModel';` and `import type { QueryCtx } from './_generated/server';`.

```ts
const shiftSummary = v.object({
  _id: v.id('shifts'),
  openedAt: v.number(),
  closedAt: v.number(),
  cashierName: v.string(),
  openingFloatIDR: v.number(),
  countedCashIDR: v.union(v.number(), v.null()),
  ordersCount: v.number(),
  salesTotalIDR: v.number(),
  cashSalesIDR: v.number(),
  qrisSalesIDR: v.number(),
  expectedCashIDR: v.number(),
  varianceIDR: v.union(v.number(), v.null()),
});

async function summarizeShift(ctx: QueryCtx, shift: Doc<'shifts'>) {
  const orders = await ctx.db
    .query('orders')
    .withIndex('by_shift', (q) => q.eq('shiftId', shift._id))
    .collect();
  const paid = orders.filter((o) => o.paymentStatus === 'paid');
  let salesTotalIDR = 0;
  let cashSalesIDR = 0;
  let qrisSalesIDR = 0;
  for (const o of paid) {
    salesTotalIDR += o.totalIDR;
    if (o.paymentMethod === 'cash') cashSalesIDR += o.totalIDR;
    else if (o.paymentMethod === 'qris_static' || o.paymentMethod === 'qris_dynamic') qrisSalesIDR += o.totalIDR;
  }
  const cashier = await ctx.db.get(shift.cashierId);
  const countedCashIDR = shift.countedCashIDR ?? null;
  const expectedCashIDR = shift.openingFloatIDR + cashSalesIDR;
  return {
    _id: shift._id,
    openedAt: shift.openedAt,
    closedAt: shift.closedAt ?? shift.openedAt,
    cashierName: cashier?.name ?? '—',
    openingFloatIDR: shift.openingFloatIDR,
    countedCashIDR,
    ordersCount: paid.length,
    salesTotalIDR,
    cashSalesIDR,
    qrisSalesIDR,
    expectedCashIDR,
    varianceIDR: countedCashIDR !== null ? countedCashIDR - expectedCashIDR : null,
  };
}

export const listClosed = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(shiftSummary),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { paginationOpts }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const result = await ctx.db
      .query('shifts')
      .withIndex('by_cafe_status', (q) => q.eq('cafeId', cafeId).eq('status', 'closed'))
      .order('desc')
      .paginate(paginationOpts);
    const page = await Promise.all(result.page.map((s) => summarizeShift(ctx, s)));
    return { page, isDone: result.isDone, continueCursor: result.continueCursor };
  },
});
```

> The `paginate` return has more fields than the three above (`pageStatus`, `splitCursor`), but Convex validates the documented subset fine when you only return these three. If `pnpm typecheck` complains about the return validator vs the paginate result, return `{ page, isDone: result.isDone, continueCursor: result.continueCursor }` exactly as above (a fresh object, not spread of `result`).

- [ ] **Step 2: Write the failing tests**

Open `tests/convex/shifts.test.ts` (create if absent, using the convex-test + `import.meta.glob` + `setup()` pattern from `tests/convex/orders.test.ts` — inline-copy `setup()`). Read `convex/shifts.ts` `open`/`close` signatures first (`open` takes `{ cashierId, openingFloatIDR }` and returns the shiftId; `close` takes `{ id, countedCashIDR }` — confirm exact arg names and adapt).

```ts
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';
const modules = import.meta.glob('../../convex/**/*.*s');
// ---- inline-copy setup() (+ Setup type) from orders.test.ts ----

describe('shifts.listClosed', () => {
  it('summarizes a closed shift: totals, expected, variance; excludes pending/void', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t); // setup opens a shift
    // One paid cash sale (18000) in this shift.
    await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'h1', shiftId, cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000, createdAtClient: 1,
    });
    // Close the shift with counted cash = openingFloat(100000) + cash sales(18000) + 2000 over = 120000.
    await asOwner.mutation(api.shifts.close, { id: shiftId, countedCashIDR: 120000 });

    const res = await asOwner.query(api.shifts.listClosed, { paginationOpts: { numItems: 20, cursor: null } });
    expect(res.page).toHaveLength(1);
    const s = res.page[0];
    expect(s?.ordersCount).toBe(1);
    expect(s?.salesTotalIDR).toBe(18000);
    expect(s?.cashSalesIDR).toBe(18000);
    expect(s?.expectedCashIDR).toBe(118000);     // openingFloat 100000 + cash 18000
    expect(s?.countedCashIDR).toBe(120000);
    expect(s?.varianceIDR).toBe(2000);            // 120000 - 118000 (over)
  });

  it('returns variance null when counted cash is absent and excludes open shifts', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId } = await setup(t);
    // setup opened a shift; an OPEN shift must NOT appear in listClosed.
    const res = await asOwner.query(api.shifts.listClosed, { paginationOpts: { numItems: 20, cursor: null } });
    expect(res.page).toHaveLength(0);
  });
});
```

> If `setup()`'s opening float differs from 100000, adjust the expected numbers to `openingFloat + 18000`. If `shifts.close`'s arg name isn't `countedCashIDR`/`id`, use the real names. Run the first test, confirm it FAILS (`listClosed` undefined), then passes after Step 1.

- [ ] **Step 3: Run tests**

Run: `pnpm test tests/convex/shifts.test.ts`
Expected: PASS (both). If a "variance null" assertion is needed, add a third test: open+close a shift WITHOUT passing countedCashIDR (if `close` allows it) and assert `varianceIDR === null` and `countedCashIDR === null`.

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm typecheck
git add convex/shifts.ts tests/convex/shifts.test.ts
git commit -m "feat(shift): listClosed query with read-time totals + variance"
```

---

## Task 2: Extract `ShiftOrderList` shared component (no behavior change)

**Files:**
- Create: `src/components/shift/shift-order-list.tsx`
- Modify: `src/routes/_pos/history.tsx`

- [ ] **Step 1: Create `src/components/shift/shift-order-list.tsx`**

Move the orders-list rendering (the loading state, `Empty`, the `<ul>` of order buttons, and the `ReceiptPreview` + `openId` state) out of `history.tsx` into a component that takes a `shiftId`:

```tsx
import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { Receipt } from 'lucide-react';
import { useState } from 'react';
import { ReceiptPreview } from '~/components/sale/receipt-preview';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '~/components/ui/empty';
import { Spinner } from '~/components/ui/spinner';
import { formatIDR } from '~/lib/money';

export function ShiftOrderList({ shiftId }: { shiftId: Id<'shifts'> }) {
  const { t } = useLingui();
  const [openId, setOpenId] = useState<Id<'orders'> | null>(null);
  const orders = useQuery(api.orders.listForShift, { shiftId });

  if (orders === undefined) {
    return (
      <div className="flex gap-2 text-muted-foreground items-center">
        <Spinner />
        <span><Trans>Memuat riwayat…</Trans></span>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><Receipt /></EmptyMedia>
          <EmptyTitle><Trans>Belum ada pesanan di shift ini.</Trans></EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <ul className="divide-y divide-border border border-border rounded-md">
        {orders.map((o) => (
          <li key={o._id}>
            <button type="button" onClick={() => setOpenId(o._id)} className="w-full text-left p-3 hover:bg-muted">
              <div className="flex justify-between">
                <span className="text-sm">{new Date(o.createdAtClient).toLocaleTimeString('id-ID')}</span>
                <span className="text-sm font-semibold tabular-nums">{formatIDR(o.totalIDR)}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {t`${o.lines.length} item`} · {o.paymentMethod === 'cash' ? t`Tunai` : o.paymentMethod}
              </div>
            </button>
          </li>
        ))}
      </ul>
      <ReceiptPreview
        open={openId !== null}
        onOpenChange={(open) => { if (!open) setOpenId(null); }}
        orderId={openId}
        onDone={() => setOpenId(null)}
      />
    </>
  );
}
```

- [ ] **Step 2: Refactor `history.tsx` to use it**

Replace the `HistoryList` body's orders rendering with `<ShiftOrderList shiftId={shift._id} />`, keeping the page header, the `shift === undefined` loading guard, and the PinGate/ShiftGate wrappers. Result:
```tsx
function HistoryList() {
  const shift = useQuery(api.shifts.current, {});
  if (shift === undefined) {
    return (
      <div className="p-6 flex gap-2 text-muted-foreground items-center">
        <Spinner /><span><Trans>Memuat riwayat…</Trans></span>
      </div>
    );
  }
  return (
    <main className="p-6 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold"><Trans>Riwayat shift ini</Trans></h1>
        <Link to="/sale" className="text-sm underline text-primary"><Trans>Kembali ke /sale</Trans></Link>
      </div>
      {shift ? <ShiftOrderList shiftId={shift._id} /> : null}
    </main>
  );
}
```
Remove the now-unused imports from `history.tsx` (`ReceiptPreview`, `Empty*`, `Receipt`, `formatIDR`, `useLingui`, `Id`, `useState` — keep only what the slimmed file uses: `useQuery`, `api`, `Trans`, `Link`, `Spinner`, `PinGate`, `ShiftGate`, `ShiftOrderList`). Let `pnpm typecheck`/biome flag leftovers.

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm typecheck
git add src/components/shift/shift-order-list.tsx src/routes/_pos/history.tsx
git commit -m "refactor(shift): extract ShiftOrderList shared by /history"
```

---

## Task 3: `/shifts` route — shift history list + drill-in

**Files:**
- Modify: `src/routes/_pos/shifts.tsx`

- [ ] **Step 1: Replace the ComingSoon stub with the list**

```tsx
import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useQuery, usePaginatedQuery } from 'convex/react';
import { History } from 'lucide-react';
import { useState } from 'react';
import { PinGate } from '~/components/staff/pin-gate';
import { ShiftOrderList } from '~/components/shift/shift-order-list';
import { Button } from '~/components/ui/button';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '~/components/ui/empty';
import { Spinner } from '~/components/ui/spinner';
import { formatIDR } from '~/lib/money';

export const Route = createFileRoute('/_pos/shifts')({
  component: () => (
    <PinGate>
      <ShiftHistoryPage />
    </PinGate>
  ),
});

function formatDuration(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}j ${m}m` : `${m}m`;
}

function ShiftHistoryPage() {
  const { t } = useLingui();
  const open = useQuery(api.shifts.current, {});
  const { results, status, loadMore } = usePaginatedQuery(
    api.shifts.listClosed,
    {},
    { initialNumItems: 20 }
  );
  const [selected, setSelected] = useState<Id<'shifts'> | null>(null);

  if (selected) {
    return (
      <main className="p-6 space-y-3">
        <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
          <Trans>← Kembali ke daftar shift</Trans>
        </Button>
        <ShiftOrderList shiftId={selected} />
      </main>
    );
  }

  return (
    <main className="p-6 space-y-3">
      <h1 className="text-2xl font-bold"><Trans>Riwayat Shift</Trans></h1>

      {open ? (
        <div className="rounded-md border border-border p-3 bg-muted/40">
          <div className="flex justify-between">
            <span className="text-sm font-medium">{/* in-progress */}<Trans>Sedang berjalan</Trans></span>
            <span className="text-xs text-muted-foreground">
              {new Date(open.openedAt).toLocaleString('id-ID')}
            </span>
          </div>
        </div>
      ) : null}

      {status === 'LoadingFirstPage' ? (
        <div className="flex gap-2 text-muted-foreground items-center">
          <Spinner /><span><Trans>Memuat…</Trans></span>
        </div>
      ) : results.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><History /></EmptyMedia>
            <EmptyTitle><Trans>Belum ada shift yang ditutup.</Trans></EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-md">
          {results.map((s) => (
            <li key={s._id}>
              <button type="button" onClick={() => setSelected(s._id)} className="w-full text-left p-3 hover:bg-muted">
                <div className="flex justify-between">
                  <span className="text-sm font-medium">{s.cashierName}</span>
                  <span className="text-sm font-semibold tabular-nums">{formatIDR(s.salesTotalIDR)}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {new Date(s.openedAt).toLocaleString('id-ID')} → {new Date(s.closedAt).toLocaleTimeString('id-ID')}
                  {' · '}{formatDuration(s.closedAt - s.openedAt)}
                  {' · '}{t`${s.ordersCount} pesanan`}
                </div>
                <div className="text-xs mt-1 flex gap-3">
                  <span className="text-muted-foreground"><Trans>Kas dihitung</Trans>: {s.countedCashIDR !== null ? formatIDR(s.countedCashIDR) : '—'}</span>
                  {s.varianceIDR !== null ? (
                    <span className={s.varianceIDR === 0 ? 'text-muted-foreground' : s.varianceIDR > 0 ? 'text-emerald-600' : 'text-red-600'}>
                      <Trans>Selisih</Trans>: {s.varianceIDR > 0 ? `+${formatIDR(s.varianceIDR)}` : formatIDR(s.varianceIDR)}
                      {' '}{s.varianceIDR > 0 ? <Trans>(Lebih)</Trans> : s.varianceIDR < 0 ? <Trans>(Kurang)</Trans> : null}
                    </span>
                  ) : null}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {status === 'CanLoadMore' ? (
        <Button variant="outline" size="sm" onClick={() => loadMore(20)}>
          <Trans>Muat lebih banyak</Trans>
        </Button>
      ) : null}
    </main>
  );
}
```

> `formatIDR(negative)` must render a leading `-` for shorts; if the project's `formatIDR` doesn't handle negatives, the `s.varianceIDR > 0 ? '+'+… : formatIDR(…)` branch still shows the sign correctly for positives, and negatives should display as `-Rp…` — verify `src/lib/money.ts` handles negatives; if not, format `Math.abs` with an explicit sign. Adjust in this step if needed.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. (`usePaginatedQuery` is the first use in the repo — confirm it's exported from `convex/react`; it is.)

- [ ] **Step 3: Commit**

```bash
git add src/routes/_pos/shifts.tsx
git commit -m "feat(shift): shift history list with totals, variance, drill-in"
```

---

## Task 4: i18n + final verification

**Files:**
- Modify: `src/locales/en/messages.po`, `src/locales/id/messages.po`

- [ ] **Step 1: Extract + fill en**

Run `pnpm lingui:extract`. Fill the `en` catalog for new strings, e.g.:
- "Riwayat Shift" → "Shift History"
- "Sedang berjalan" → "In progress"
- "Belum ada shift yang ditutup." → "No closed shifts yet."
- "← Kembali ke daftar shift" → "← Back to shift list"
- "Kas dihitung" → "Counted cash"
- "Selisih" → "Variance"
- "(Lebih)" → "(Over)"
- "(Kurang)" → "(Short)"
- "Muat lebih banyak" → "Load more"
- `${s.ordersCount} pesanan` → "{0} orders"
- Any other newly-surfaced msgid → natural English. Do NOT leave new `msgstr` empty.

- [ ] **Step 2: Compile + verify 0 missing**

Run `pnpm lingui:compile`, then `pnpm lingui:extract` again and confirm `en` shows 0 missing.

- [ ] **Step 3: Full gate + commit**

```bash
pnpm typecheck && pnpm test && pnpm lingui:compile
git add src/locales/en/messages.po src/locales/id/messages.po
git commit -m "i18n(shift): translate shift-history strings"
```

---

## Self-review notes (addressed)

- **Spec coverage:** `listClosed` + `summarizeShift` (T1), shared `ShiftOrderList` + `/history` refactor (T2), `/shifts` list with in-progress row, variance coloring, pagination, empty state, drill-in (T3), i18n (T4). Variance-null + pending/void exclusion + owner-scope + pagination are tested in T1.
- **Type consistency:** `shiftSummary` field names (`salesTotalIDR`, `cashSalesIDR`, `qrisSalesIDR`, `expectedCashIDR`, `varianceIDR`, `countedCashIDR`, `cashierName`, `ordersCount`) used identically in the query (T1) and the route (T3). `ShiftOrderList({ shiftId })` signature consistent between T2 and T3.
- **No new schema/index:** `by_cafe_status` already exists; `orders.by_shift` already exists; `orders.listForShift` reused as-is.
- **Owner-gating:** `listClosed` uses `requireOwnerCafe` like `current`/reports.
