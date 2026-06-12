# Expense Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Record non-inventory expenses (category + amount + note + date) and view/total them over a date range under a new Reports → Pengeluaran tab. Fully off the sale/inventory path.

**Architecture:** New `expenses` table + `convex/expenses.ts` (record/list-by-range/remove) using the reports range pattern (`tzFor` + `resolveRange`). A `/reports/expenses` route inherits the `canViewReports` gate + `RangePicker` from the reports layout; it lists/totals expenses, records via a dialog, and exports CSV.

**Tech Stack:** Convex, React + shadcn (Select/Input/DataTable/Badge/Empty), Lingui, convex-test/Vitest.

---

## File Structure
- **Create:** `convex/lib/expense.ts`, `convex/expenses.ts`, `tests/convex/expenses.test.ts`, `src/components/expenses/expense-categories.tsx`, `src/components/expenses/expense-dialog.tsx`, `src/routes/_pos/reports/expenses.tsx`.
- **Modify:** `convex/schema.ts`, `convex/_generated/api.d.ts`, `src/routes/_pos/reports/route.tsx`, `src/routeTree.gen.ts` (regenerated).
- **i18n:** `src/locales/{id,en}/messages.po`.

---

### Task 1: Backend — expenses table + functions (TDD)

**Files:** create `convex/lib/expense.ts`, `convex/expenses.ts`, `tests/convex/expenses.test.ts`; modify `convex/schema.ts`, `convex/_generated/api.d.ts`.

READ first: `convex/waste.ts` (record/recent shape + `requireOwnerCafe`/`requireOwned`), `convex/reports.ts` lines ~20–34 (`paidInRange` — the `tzFor` + `resolveRange(tz, range, now)` → `{ startMs, endMs }` + `by_cafe_at`-style index query), `convex/lib/time.ts` (`rangeArg`, `resolveRange`, `tzFor` exports), `tests/convex/waste.test.ts` (setup helper).

- [ ] **Step 1: `convex/lib/expense.ts`**
```ts
import { v } from 'convex/values';
export const EXPENSE_CATEGORIES = ['rent', 'utilities', 'supplies', 'salary', 'other'] as const;
export const expenseCategoryValidator = v.union(
  v.literal('rent'),
  v.literal('utilities'),
  v.literal('supplies'),
  v.literal('salary'),
  v.literal('other')
);
```

- [ ] **Step 2: schema — `convex/schema.ts`**
```ts
import { expenseCategoryValidator } from './lib/expense';
// ...
  expenses: defineTable({
    cafeId: v.id('cafes'),
    category: expenseCategoryValidator,
    amountIDR: v.number(),
    note: v.optional(v.string()),
    at: v.number(),
  }).index('by_cafe_at', ['cafeId', 'at']),
```

- [ ] **Step 3: Write FAILING tests — `tests/convex/expenses.test.ts`**
Copy the owner setup from `tests/convex/waste.test.ts`. Then:
```ts
describe('expenses', () => {
  it('records and lists expenses in range with totals', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t); // owner + cafe
    await asOwner.mutation(api.expenses.record, { category: 'rent', amountIDR: 1000000 });
    await asOwner.mutation(api.expenses.record, { category: 'utilities', amountIDR: 250000, note: 'PLN' });
    const data = await asOwner.query(api.expenses.list, { range: { preset: 'today' } });
    expect(data.totalIDR).toBe(1250000);
    expect(data.rows).toHaveLength(2);
    const rent = data.byCategory.find((c) => c.category === 'rent');
    expect(rent?.amountIDR).toBe(1000000);
  });

  it('rejects a non-positive amount', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    await expect(asOwner.mutation(api.expenses.record, { category: 'other', amountIDR: 0 }))
      .rejects.toThrow();
  });

  it('removes an expense (owner-scoped)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    const id = await asOwner.mutation(api.expenses.record, { category: 'other', amountIDR: 5000 });
    await asOwner.mutation(api.expenses.remove, { id });
    const data = await asOwner.query(api.expenses.list, { range: { preset: 'today' } });
    expect(data.rows).toHaveLength(0);
    const { asOwner: asOther } = await setup(t, { email: 'other@x.com' });
    const id2 = await asOwner.mutation(api.expenses.record, { category: 'rent', amountIDR: 9000 });
    await expect(asOther.mutation(api.expenses.remove, { id: id2 })).rejects.toThrow();
  });
});
```
> Adapt the `setup` signature/return to whatever `waste.test.ts` actually exports (it may
> be `setup(t, { email })` returning `{ asOwner }`). Keep the four behaviors.

Run `pnpm test tests/convex/expenses.test.ts` → FAIL (module missing).

- [ ] **Step 4: Implement `convex/expenses.ts`**
```ts
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwned, requireOwnerCafe } from './lib/auth';
import { expenseCategoryValidator } from './lib/expense';
import { rangeArg, resolveRange, tzFor } from './lib/time';

export const record = mutation({
  args: {
    category: expenseCategoryValidator,
    amountIDR: v.number(),
    note: v.optional(v.string()),
  },
  returns: v.id('expenses'),
  handler: async (ctx, { category, amountIDR, note }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    if (!Number.isInteger(amountIDR) || amountIDR <= 0) {
      throw new Error('Jumlah harus lebih dari nol.');
    }
    const trimmed = note?.trim();
    return await ctx.db.insert('expenses', {
      cafeId,
      category,
      amountIDR,
      ...(trimmed ? { note: trimmed } : {}),
      at: Date.now(),
    });
  },
});

const expenseRow = v.object({
  id: v.id('expenses'),
  at: v.number(),
  category: expenseCategoryValidator,
  amountIDR: v.number(),
  note: v.optional(v.string()),
});

export const list = query({
  args: { range: rangeArg },
  returns: v.object({
    rows: v.array(expenseRow),
    totalIDR: v.number(),
    byCategory: v.array(v.object({ category: expenseCategoryValidator, amountIDR: v.number() })),
  }),
  handler: async (ctx, { range }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const tz = await tzFor(ctx, cafeId);
    const { startMs, endMs } = resolveRange(tz, range, Date.now());
    const rows = await ctx.db
      .query('expenses')
      .withIndex('by_cafe_at', (q) => q.eq('cafeId', cafeId).gte('at', startMs).lte('at', endMs))
      .order('desc')
      .collect();
    const byCatMap = new Map<string, number>();
    let totalIDR = 0;
    for (const r of rows) {
      totalIDR += r.amountIDR;
      byCatMap.set(r.category, (byCatMap.get(r.category) ?? 0) + r.amountIDR);
    }
    return {
      rows: rows.map((r) => ({
        id: r._id,
        at: r.at,
        category: r.category,
        amountIDR: r.amountIDR,
        ...(r.note ? { note: r.note } : {}),
      })),
      totalIDR,
      byCategory: [...byCatMap.entries()].map(([category, amountIDR]) => ({
        category: category as (typeof r.category),
        amountIDR,
      })),
    };
  },
});

export const remove = mutation({
  args: { id: v.id('expenses') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, id, 'Pengeluaran');
    await ctx.db.delete(id);
    return null;
  },
});
```
> The `category as (typeof r.category)` cast won't compile (no `r` in scope there). Instead
> type the map as `Map<typeof EXPENSE_CATEGORIES[number], number>` (import `EXPENSE_CATEGORIES`)
> or cast to the union type. Simplest: `byCategory: [...byCatMap.entries()].map(([category, amountIDR]) => ({ category: category as 'rent'|'utilities'|'supplies'|'salary'|'other', amountIDR }))`. Make typecheck pass.

- [ ] **Step 5: Register modules** — after creating files + running tests, check `git status`
for the dev-watcher edit to `convex/_generated/api.d.ts` (adds `expenses` + `lib/expense`).
Keep it; if absent, add manually (alphabetical). `pnpm typecheck` must pass.

- [ ] **Step 6: Tests + commit**
`pnpm test tests/convex/expenses.test.ts` → PASS. `pnpm typecheck` → PASS.
```bash
git add convex/lib/expense.ts convex/expenses.ts convex/schema.ts convex/_generated/api.d.ts tests/convex/expenses.test.ts
git commit -m "feat(expenses): expenses table + record/list/remove (range-aware)"
```

---

### Task 2: Frontend — categories + dialog + report tab

**Files:** create `src/components/expenses/expense-categories.tsx`, `src/components/expenses/expense-dialog.tsx`, `src/routes/_pos/reports/expenses.tsx`; modify `src/routes/_pos/reports/route.tsx`; commit regenerated `src/routeTree.gen.ts`.

READ: `src/routes/_pos/reports/payments.tsx` (the report-page pattern: `useReportRange`,
`useQuery(api.X, { range })`, DataTable, `~/lib/csv` `toCSV`/`downloadCSV`), `src/components/inventory/stock-adjust-dialog.tsx` (dialog pattern), `src/routes/_pos/reports/route.tsx` (TABS).

- [ ] **Step 1: `src/components/expenses/expense-categories.tsx`**
```tsx
import { Trans } from '@lingui/react/macro';
import type { ReactNode } from 'react';
export type ExpenseCategory = 'rent' | 'utilities' | 'supplies' | 'salary' | 'other';
export const EXPENSE_CATEGORY_OPTIONS: { value: ExpenseCategory; label: ReactNode }[] = [
  { value: 'rent', label: <Trans>Sewa</Trans> },
  { value: 'utilities', label: <Trans>Utilitas</Trans> },
  { value: 'supplies', label: <Trans>Perlengkapan</Trans> },
  { value: 'salary', label: <Trans>Gaji</Trans> },
  { value: 'other', label: <Trans>Lainnya</Trans> },
];
```

- [ ] **Step 2: `src/components/expenses/expense-dialog.tsx`**
A dialog (mirror `StockAdjustDialog`): props `{ open, onOpenChange }`. State: `category`
(default 'rent'), `amount` (string), `note`. A `Select` over `EXPENSE_CATEGORY_OPTIONS`, an
amount `Input` (`type="number" min="1" step="1"`), a note `Input`. On submit:
`await record({ category, amountIDR: Number.parseInt(amount,10)||0, ...(note.trim()?{note:note.trim()}:{}) })`,
`toast.success(t\`Pengeluaran dicatat.\`)`, reset + close; on error toast
`t\`Gagal mencatat pengeluaran.\``. `const record = useMutation(api.expenses.record)`.
Disable submit while submitting / when amount ≤ 0.

- [ ] **Step 3: `src/routes/_pos/reports/expenses.tsx`**
```tsx
import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { Plus, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useReportRange } from '~/components/reports/use-report-range';
import { EXPENSE_CATEGORY_OPTIONS, type ExpenseCategory } from '~/components/expenses/expense-categories';
import { ExpenseDialog } from '~/components/expenses/expense-dialog';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { DataTable } from '~/components/ui/data-table';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '~/components/ui/empty';
import { Spinner } from '~/components/ui/spinner';
import { downloadCSV, toCSV } from '~/lib/csv';
import { formatIDR } from '~/lib/money';
import { toast } from '~/lib/toast';

export const Route = createFileRoute('/_pos/reports/expenses')({ component: ExpensesReport });

type Row = { id: Id<'expenses'>; at: number; category: ExpenseCategory; amountIDR: number; note?: string };

function catLabel(c: ExpenseCategory) {
  return EXPENSE_CATEGORY_OPTIONS.find((o) => o.value === c)?.label ?? c;
}

function ExpensesReport() {
  const { t } = useLingui();
  const { range } = useReportRange();
  const data = useQuery(api.expenses.list, { range });
  const remove = useMutation(api.expenses.remove);
  const [addOpen, setAddOpen] = useState(false);
  const [delId, setDelId] = useState<Id<'expenses'> | null>(null);

  const columns = useMemo<ColumnDef<Row, unknown>[]>(() => [
    { accessorKey: 'at', header: () => <Trans>Tanggal</Trans>,
      cell: ({ row }) => <span className="text-sm">{new Date(row.original.at).toLocaleDateString('id-ID')}</span> },
    { accessorKey: 'category', header: () => <Trans>Kategori</Trans>,
      cell: ({ row }) => <Badge variant="muted">{catLabel(row.original.category)}</Badge> },
    { accessorKey: 'amountIDR', header: () => <Trans>Jumlah</Trans>,
      cell: ({ row }) => <span className="tabular-nums">{formatIDR(row.original.amountIDR)}</span> },
    { accessorKey: 'note', header: () => <Trans>Catatan</Trans>,
      cell: ({ row }) => <span className="text-muted-foreground text-sm">{row.original.note ?? '—'}</span> },
    { id: 'actions', enableSorting: false, header: () => null,
      cell: ({ row }) => (
        <div className="text-right">
          <Button type="button" size="sm" variant="ghost" className="text-muted-foreground"
            onClick={() => setDelId(row.original.id)}><Trans>Hapus</Trans></Button>
        </div>
      ) },
  ], []);

  function exportCSV() {
    if (!data) return;
    const csv = toCSV(
      [t`Tanggal`, t`Kategori`, t`Jumlah`, t`Catatan`],
      data.rows.map((r) => [
        new Date(r.at).toLocaleDateString('id-ID'),
        String(catLabel(r.category)),
        String(r.amountIDR),
        r.note ?? '',
      ])
    );
    downloadCSV('pengeluaran.csv', csv);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <Trans>Total</Trans>:{' '}
          <span className="font-semibold tabular-nums">{data ? formatIDR(data.totalIDR) : '—'}</span>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={exportCSV} disabled={!data || data.rows.length === 0}>
            <Trans>Unduh CSV</Trans>
          </Button>
          <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
            <Plus /><Trans>Catat pengeluaran</Trans>
          </Button>
        </div>
      </div>

      {data && data.byCategory.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {data.byCategory.map((c) => (
            <div key={c.category} className="rounded-md border border-border px-2 py-1 text-xs">
              {catLabel(c.category)}: <span className="tabular-nums">{formatIDR(c.amountIDR)}</span>
            </div>
          ))}
        </div>
      ) : null}

      {data === undefined ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : data.rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Wallet /></EmptyMedia>
            <EmptyTitle><Trans>Belum ada pengeluaran pada rentang ini.</Trans></EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <DataTable columns={columns} data={data.rows} initialSort={[{ id: 'at', desc: true }]} />
      )}

      <ExpenseDialog open={addOpen} onOpenChange={setAddOpen} />
      <ConfirmDialog
        open={delId !== null}
        onOpenChange={(o) => { if (!o) setDelId(null); }}
        title={<Trans>Hapus pengeluaran?</Trans>}
        confirmLabel={<Trans>Hapus</Trans>}
        destructive
        onConfirm={async () => {
          if (!delId) return;
          try { await remove({ id: delId }); toast.success(t`Pengeluaran dihapus.`); }
          catch (err) { toast.error(err instanceof Error ? err.message : t`Gagal menghapus.`); throw err; }
        }}
      />
    </div>
  );
}
```
> Verify against the real files: `DataTable` props (`columns`/`data`/`initialSort`),
> `ConfirmDialog` props (title/confirmLabel/destructive/onConfirm/open/onOpenChange — copy
> from `inventory/index.tsx`), `Empty*` exports, `toCSV`/`downloadCSV` signatures in
> `~/lib/csv` (match arg order — header row + rows, and `downloadCSV(filename, csv)`),
> `Badge` `variant` values. Adjust to the real APIs.

- [ ] **Step 4: Reports tab — `src/routes/_pos/reports/route.tsx`**
Add to the `TABS` array (after the `/reports/orders` entry):
```tsx
  { to: '/reports/expenses', label: <Trans>Pengeluaran</Trans> },
```

- [ ] **Step 5: Regenerate + commit the route tree**
The TanStack route watcher regenerates `src/routeTree.gen.ts` when the new route file
exists. If `git status` shows it modified, stage it. If the dev server isn't running, run
the project's route-gen (check `package.json` scripts, e.g. `pnpm dev` briefly, or the
generator) — but typically the file updates on save. CONFIRM `src/routeTree.gen.ts` includes
`/reports/expenses` and commit it.

- [ ] **Step 6: Typecheck + test + commit**
`pnpm typecheck` → PASS. `pnpm test` → PASS.
```bash
git add src/components/expenses/expense-categories.tsx src/components/expenses/expense-dialog.tsx src/routes/_pos/reports/expenses.tsx src/routes/_pos/reports/route.tsx src/routeTree.gen.ts
git commit -m "feat(expenses): reports → pengeluaran tab (record/list/total/CSV)"
```

---

### Task 3: i18n
New strings: `Pengeluaran`, `Sewa`, `Utilitas`, `Perlengkapan`, `Gaji`, `Lainnya`,
`Catat pengeluaran`, `Kategori`, `Jumlah`, `Tanggal`, `Belum ada pengeluaran pada rentang ini.`,
`Pengeluaran dicatat.`, `Gagal mencatat pengeluaran.`, `Hapus pengeluaran?`,
`Pengeluaran dihapus.`, `Total` (+ reuse `Catatan`, `Hapus`, `Unduh CSV`, `Catatan (opsional)`).

- [ ] **Step 1:** `pnpm lingui:extract` — note new entries.
- [ ] **Step 2:** Fill `en` for new empties:

| id | en |
|---|---|
| `Pengeluaran` | `Expenses` |
| `Sewa` | `Rent` |
| `Utilitas` | `Utilities` |
| `Perlengkapan` | `Supplies` |
| `Gaji` | `Salary` |
| `Lainnya` | `Other` |
| `Catat pengeluaran` | `Record expense` |
| `Kategori` | `Category` |
| `Jumlah` | `Amount` |
| `Tanggal` | `Date` |
| `Belum ada pengeluaran pada rentang ini.` | `No expenses in this range.` |
| `Pengeluaran dicatat.` | `Expense recorded.` |
| `Gagal mencatat pengeluaran.` | `Could not record the expense.` |
| `Hapus pengeluaran?` | `Delete expense?` |
| `Pengeluaran dihapus.` | `Expense deleted.` |
| `Total` | `Total` |

(Leave already-present entries like `Hapus`, `Unduh CSV`, `Catatan`, `Lainnya` if already filled.)

- [ ] **Step 3:** `pnpm lingui:compile` → `en` 0 missing.
- [ ] **Step 4:** `git add src/locales && git commit -m "i18n(expenses): expense-tracking strings + en fill"`

---

### Task 4: Final verification
- [ ] `pnpm typecheck` → PASS
- [ ] `pnpm test` → PASS (all suites)
- [ ] `pnpm lingui:compile` → `en` 0 missing
- [ ] `git status` → clean — **confirm `src/routeTree.gen.ts` is committed** (CI fails if not).
- [ ] **Manual sanity:** `/reports` shows a "Pengeluaran" tab (owner/canViewReports only); it
  lists expenses for the picked range with a total + by-category chips; "Catat pengeluaran"
  records one (appears immediately); delete removes one; "Unduh CSV" downloads; the sale flow
  is untouched.

---

## Self-Review
**Spec coverage:** shared category validator (T1); schema table + record/list-range/remove
(T1); dialog + report tab + total + by-category + CSV + delete (T2); route registration +
routeTree commit (T2); tests record/total/reject/remove-scope (T1); i18n (T3). ✓
**Placeholder scan:** none — full code; the `byCategory` cast is explicitly called out to be
made typecheck-clean. Test `setup` shape says "adapt to waste.test.ts".
**Type consistency:** `ExpenseCategory` union identical in `lib/expense.ts` (validator) and
`expense-categories.tsx` (TS). `api.expenses.list` returns `{ rows, totalIDR, byCategory }`
(T1) consumed exactly in the report page (T2). `record({category, amountIDR, note?})` matches
the dialog call (T2). Route gated by the existing reports-layout `canViewReports`. ✓
