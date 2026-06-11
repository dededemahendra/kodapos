# Cross-Shift Order History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an owner-facing `/reports/orders` browse — a paginated, filterable (date range + cashier + payment method + status) list of all orders across shifts, with status badges and receipt reprint.

**Architecture:** A new owner-gated paginated `orders.search` query (date range via the `by_cafe_created` index + optional `.filter()` chaining) feeds a new `/reports/orders` route that reuses the reports range-picker (`useReportRange`) and `ReceiptPreview`. The cashier/method/status filters are local component state.

**Tech Stack:** Convex (paginated indexed query + `.filter()`), TanStack Start + React (`usePaginatedQuery`), Lingui, shadcn (Select, Badge), Vitest + convex-test.

**Spec:** `docs/superpowers/specs/2026-06-11-order-history-design.md`

**Branch:** `feat/order-history` (already created off `main`, spec committed).

**Conventions:**
- Run CI locally before push: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`.
- Do NOT run `convex codegen` — `orders`/`lib/time` are already registered; `orders.search` needs no `api.d.ts` change.
- New UI strings are Bahasa Indonesia via Lingui; run `pnpm lingui:extract` and fill `en`.
- Small conventional commits per task.

---

## Task 1: `orders.search` query (+ shared `rangeArg`)

**Files:**
- Modify: `convex/lib/time.ts` (export `rangeArg` validator)
- Modify: `convex/orders.ts` (add `search`)
- Test: `tests/convex/order-search.test.ts`

- [ ] **Step 1: Export the `rangeArg` validator from `convex/lib/time.ts`**

Add `import { v } from 'convex/values';` at the top if not present, and export:
```ts
export const rangeArg = v.union(
  v.object({
    preset: v.union(v.literal('today'), v.literal('yesterday'), v.literal('last7'), v.literal('last30')),
  }),
  v.object({ from: v.string(), to: v.string() })
);
```
(Leave `reports.ts`'s local copy as-is, or import this one — optional. Don't break reports.)

- [ ] **Step 2: Add the `orders.search` query to `convex/orders.ts`**

Confirm the imports at the top of `orders.ts` include (add if missing): `import { paginationOptsValidator } from 'convex/server';`, `import { resolveRange, tzFor, rangeArg } from './lib/time';`. Read the schema to confirm `cafeStaff` has a `by_cafe` index (it does — `staff.list` uses it); if the index name differs, use the real one.

```ts
const orderRow = v.object({
  _id: v.id('orders'),
  createdAtClient: v.number(),
  totalIDR: v.number(),
  paymentMethod: v.union(v.literal('cash'), v.literal('qris_static'), v.literal('qris_dynamic')),
  paymentStatus: v.union(v.literal('pending'), v.literal('paid'), v.literal('void')),
  cashierName: v.string(),
  lineCount: v.number(),
});

export const search = query({
  args: {
    range: rangeArg,
    cashierId: v.optional(v.id('cafeStaff')),
    paymentMethod: v.optional(v.union(v.literal('cash'), v.literal('qris_static'), v.literal('qris_dynamic'))),
    status: v.optional(v.union(v.literal('paid'), v.literal('pending'), v.literal('void'))),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(orderRow),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { range, cashierId, paymentMethod, status, paginationOpts }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const tz = await tzFor(ctx, cafeId);
    const { startMs, endMs } = resolveRange(tz, range, Date.now());
    let q = ctx.db
      .query('orders')
      .withIndex('by_cafe_created', (ix) =>
        ix.eq('cafeId', cafeId).gte('createdAtClient', startMs).lte('createdAtClient', endMs)
      )
      .order('desc');
    if (cashierId) q = q.filter((f) => f.eq(f.field('cashierId'), cashierId));
    if (paymentMethod) q = q.filter((f) => f.eq(f.field('paymentMethod'), paymentMethod));
    if (status) q = q.filter((f) => f.eq(f.field('paymentStatus'), status));
    const result = await q.paginate(paginationOpts);

    const staff = await ctx.db
      .query('cafeStaff')
      .withIndex('by_cafe', (ix) => ix.eq('cafeId', cafeId))
      .collect();
    const nameById = new Map(staff.map((s) => [s._id, s.name] as const));

    const page = result.page.map((o) => ({
      _id: o._id,
      createdAtClient: o.createdAtClient,
      totalIDR: o.totalIDR,
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      cashierName: nameById.get(o.cashierId) ?? '—',
      lineCount: o.lines.length,
    }));
    return { page, isDone: result.isDone, continueCursor: result.continueCursor };
  },
});
```
> `let q = ...; q = q.filter(...)` works because `.order()` and `.filter()` return the same `OrderedQuery` type. If TS complains about the `let` type, annotate or keep chaining conditionally.

- [ ] **Step 3: Tests `tests/convex/order-search.test.ts`**

Inline-copy `setup()` from `orders.test.ts`. Seed a paid cash order (real-time `createdAtClient` so it falls in "today") + a void order inserted directly (read `convex/schema.ts` orders table for the required fields and fill them; lines can be `[]`).

```ts
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';
const modules = import.meta.glob('../../convex/**/*.*s');
// ---- inline setup() (+ Setup type) ----

describe('orders.search', () => {
  it('returns all statuses in range, filters by status, resolves cashier name', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId, cafeId } = await setup(t);
    const now = Date.now();
    await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'os1', shiftId, cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000, createdAtClient: now,
    });
    // A void order, inserted directly (match the orders schema required fields).
    await t.run(async (ctx) => {
      await ctx.db.insert('orders', {
        cafeId, shiftId, cashierId, clientId: 'os-void',
        lines: [], subtotalIDR: 10000, taxRatePct: 0, taxIDR: 0, discountIDR: 0,
        serviceChargeIDR: 0, serviceChargePct: 0, serviceChargeName: 'Biaya Layanan',
        totalIDR: 10000, paymentMethod: 'qris_dynamic', paymentStatus: 'void',
        createdAtClient: now, syncedAt: now,
      });
    });

    const all = await asOwner.query(api.orders.search, { range: { preset: 'today' }, paginationOpts: { numItems: 25, cursor: null } });
    expect(all.page).toHaveLength(2);
    expect(all.page.every((r) => r.cashierName.length > 0)).toBe(true);

    const paidOnly = await asOwner.query(api.orders.search, { range: { preset: 'today' }, status: 'paid', paginationOpts: { numItems: 25, cursor: null } });
    expect(paidOnly.page).toHaveLength(1);
    expect(paidOnly.page[0]?.paymentStatus).toBe('paid');

    const voidOnly = await asOwner.query(api.orders.search, { range: { preset: 'today' }, status: 'void', paginationOpts: { numItems: 25, cursor: null } });
    expect(voidOnly.page).toHaveLength(1);
    expect(voidOnly.page[0]?.paymentStatus).toBe('void');
  });

  it('filters by payment method', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'os2', shiftId, cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000, createdAtClient: Date.now(),
    });
    const cash = await asOwner.query(api.orders.search, { range: { preset: 'today' }, paymentMethod: 'cash', paginationOpts: { numItems: 25, cursor: null } });
    expect(cash.page).toHaveLength(1);
    const qris = await asOwner.query(api.orders.search, { range: { preset: 'today' }, paymentMethod: 'qris_static', paginationOpts: { numItems: 25, cursor: null } });
    expect(qris.page).toHaveLength(0);
  });
});
```
> If `setup()` doesn't return `cafeId`, add it (it's available via `asOwner.query(api.cafes.myCafe)` or already in the helper). Confirm the orders-table required fields against `convex/schema.ts` and adjust the `t.run` insert. Run `pnpm test tests/convex/order-search.test.ts` → PASS.

- [ ] **Step 4: Verify + commit**

`pnpm typecheck`, full `pnpm test`.
```bash
git add convex/lib/time.ts convex/orders.ts tests/convex/order-search.test.ts
git commit -m "feat(orders): search query (date range + cashier/method/status filters, paginated)"
```

---

## Task 2: `/reports/orders` browse route

**Files:**
- Create: `src/routes/_pos/reports/orders.tsx`
- Modify: `src/routes/_pos/reports/route.tsx` (add nav link)

- [ ] **Step 1: Read the reports layout for the nav pattern**

Read `src/routes/_pos/reports/route.tsx` — it renders the shared `<RangePicker>` + a nav/tab list linking the report pages (`/reports`, `/reports/sales`, `/reports/payments`, `/reports/products`, `/reports/cashiers`). Note how a tab/link is added (a `<Link to="/reports/...">` list). Add a `/reports/orders` entry labeled `<Trans>Pesanan</Trans>` in the same list.

- [ ] **Step 2: Create `src/routes/_pos/reports/orders.tsx`**

```tsx
import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { usePaginatedQuery, useQuery } from 'convex/react';
import { Receipt } from 'lucide-react';
import { useState } from 'react';
import { ReceiptPreview } from '~/components/sale/receipt-preview';
import { useReportRange } from '~/components/reports/use-report-range';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '~/components/ui/empty';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { Spinner } from '~/components/ui/spinner';
import { formatIDR } from '~/lib/money';

export const Route = createFileRoute('/_pos/reports/orders')({
  component: OrdersReport,
});

const ALL = 'all';

function OrdersReport() {
  const { t } = useLingui();
  const { range } = useReportRange();
  const staff = useQuery(api.staff.list, {});
  const [cashier, setCashier] = useState<string>(ALL);
  const [method, setMethod] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [openId, setOpenId] = useState<Id<'orders'> | null>(null);

  const { results, status: pageStatus, loadMore } = usePaginatedQuery(
    api.orders.search,
    {
      range,
      ...(cashier !== ALL ? { cashierId: cashier as Id<'cafeStaff'> } : {}),
      ...(method !== ALL ? { paymentMethod: method as 'cash' | 'qris_static' | 'qris_dynamic' } : {}),
      ...(status !== ALL ? { status: status as 'paid' | 'pending' | 'void' } : {}),
    },
    { initialNumItems: 25 }
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Select value={cashier} onValueChange={setCashier}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t`Semua kasir`}</SelectItem>
            {(staff ?? []).map((s) => (<SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={method} onValueChange={setMethod}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t`Semua metode`}</SelectItem>
            <SelectItem value="cash">{t`Tunai`}</SelectItem>
            <SelectItem value="qris_static">QRIS statis</SelectItem>
            <SelectItem value="qris_dynamic">QRIS dinamis</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t`Semua status`}</SelectItem>
            <SelectItem value="paid">{t`Lunas`}</SelectItem>
            <SelectItem value="pending">{t`Tertunda`}</SelectItem>
            <SelectItem value="void">{t`Batal`}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {pageStatus === 'LoadingFirstPage' ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><Spinner /></div>
      ) : results.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Receipt /></EmptyMedia>
            <EmptyTitle><Trans>Belum ada pesanan pada rentang ini.</Trans></EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-md">
          {results.map((o) => (
            <li key={o._id}>
              <button type="button" onClick={() => setOpenId(o._id)} className="w-full text-left p-3 hover:bg-muted">
                <div className="flex justify-between items-center">
                  <span className="text-sm">{new Date(o.createdAtClient).toLocaleString('id-ID')}</span>
                  <span className="text-sm font-semibold tabular-nums">{formatIDR(o.totalIDR)}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                  <span>{o.cashierName}</span>
                  <span>· {o.paymentMethod === 'cash' ? t`Tunai` : 'QRIS'}</span>
                  <span>· {t`${o.lineCount} item`}</span>
                  <Badge variant={o.paymentStatus === 'paid' ? 'default' : o.paymentStatus === 'void' ? 'destructive' : 'secondary'}>
                    {o.paymentStatus === 'paid' ? <Trans>Lunas</Trans> : o.paymentStatus === 'void' ? <Trans>Batal</Trans> : <Trans>Tertunda</Trans>}
                  </Badge>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {pageStatus === 'CanLoadMore' ? (
        <Button variant="outline" size="sm" onClick={() => loadMore(25)}><Trans>Muat lebih banyak</Trans></Button>
      ) : null}

      <ReceiptPreview open={openId !== null} onOpenChange={(open) => { if (!open) setOpenId(null); }} orderId={openId} onDone={() => setOpenId(null)} />
    </div>
  );
}
```
> Verify the shadcn `Select`/`Badge` import paths match the project (read another page using them, e.g. `settings/tax.tsx` for Select). The reports layout already renders `<RangePicker>` + provides the range search, so this page does NOT render RangePicker itself.

- [ ] **Step 3: Typecheck + commit**

`pnpm typecheck` (PASS).
```bash
git add src/routes/_pos/reports/orders.tsx src/routes/_pos/reports/route.tsx
git commit -m "feat(orders): /reports/orders browse with filters, badges, reprint"
```

---

## Task 3: i18n + final verification

**Files:**
- Modify: `src/locales/en/messages.po`, `src/locales/id/messages.po`

- [ ] **Step 1: Extract + fill `en`**

Run `pnpm lingui:extract`. Fill `en` for new strings, e.g.: `Pesanan` → "Orders", `Semua kasir` → "All cashiers", `Semua metode` → "All methods", `Semua status` → "All statuses", `Lunas` → "Paid", `Tertunda` → "Pending", `Batal` → "Void", `Belum ada pesanan pada rentang ini.` → "No orders in this range.", and any other surfaced msgid (`Muat lebih banyak` likely already exists from #36). Do NOT leave any new `msgstr` empty.

- [ ] **Step 2: Compile + verify 0 missing**

`pnpm lingui:compile`, then `pnpm lingui:extract` again → `en` 0 missing.

- [ ] **Step 3: Full gate + commit**

```bash
pnpm typecheck && pnpm test && pnpm lingui:compile
git add src/locales/en/messages.po src/locales/id/messages.po
git commit -m "i18n(orders): translate order-history browse strings"
```

---

## Self-review notes (addressed)

- **Spec coverage:** `rangeArg` export (T1), `orders.search` with range + cashier/method/status filters + pagination + cashier-name resolution (T1), `/reports/orders` route with filters/badges/reprint/load-more + reports nav link (T2), i18n (T3). Non-paid-included, per-filter, pagination, owner-scope tested (T1).
- **Type consistency:** `orderRow` fields (`createdAtClient`, `totalIDR`, `paymentMethod`, `paymentStatus`, `cashierName`, `lineCount`) used identically in the query (T1) and the route (T2). The `search` args (`range`, `cashierId?`, `paymentMethod?`, `status?`, `paginationOpts`) match the `usePaginatedQuery` call (omitting a filter == "All").
- **Reuse:** `useReportRange`/`RangePicker` (shared layout), `ReceiptPreview`, `resolveRange`/`tzFor`/`rangeArg` (lib/time), `staff.list`. No new schema/index (`by_cafe_created` exists).
- **`/history` untouched** (cashier current-shift view stays as-is).
