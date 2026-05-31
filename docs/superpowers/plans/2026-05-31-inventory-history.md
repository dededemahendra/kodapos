# Inventory: Movement history + Waste polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-ingredient stock movement history (opened from the Stock `⋯` "Lihat riwayat" in a side Sheet) and migrate the Waste page onto the Catalog UI kit.

**Architecture:** A new pure-read Convex query `ingredients.listMovements` returns one ingredient's movements with a running balance (most recent 100, `truncated` flag). A `MovementHistorySheet` (on existing `ui/sheet`) renders the timeline; the Stock page's existing "Lihat riwayat" `⋯` item opens it. The Waste page is rebuilt on `PageHeader` + `DataTable`, with `StatusBadge` reasons and toasts added to `WasteDialog`. No schema changes.

**Tech Stack:** React 19, TanStack Router, Convex + convex-test, Tailwind v4, Lingui (id source / en target), shadcn/ui kit, Vitest (edge-runtime), Playwright. Package manager: **pnpm**. Branch: `feat/inventory-history` (off `main`).

---

## Conventions for the implementing engineer (read once)

- **pnpm** for all commands. `~` = `src/`, `convex/...` for backend/generated.
- **Branch:** `feat/inventory-history` (already created off `main`, has the design-spec commit). Stay on it.
- **i18n:** author strings in **Indonesian**; `<Trans>` in JSX, `` t`…` `` for attributes. Don't hand-edit `.po`; Task 8 runs extract/compile.
- **Convex loading contract:** `useQuery(...)` returns `undefined` while loading.
- **Convex handlers may use `Date.now()`**; that ban is only for workflow scripts.
- **Strict TS:** the repo has `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. Build optional object fields with conditional spread (`...(x ? { k: x } : {})`) — the existing code does this.
- **Tests:** Vitest runs in `edge-runtime`; convex tests use `convex-test`. Pure helpers are `.test.ts`. No DOM unit tests — UI is covered by Playwright.
- **Run before any push:** `pnpm lingui:extract` → fill `en` → `pnpm typecheck && pnpm test && pnpm lingui:compile`.
- **Commit style:** small Conventional Commits, each ending with a blank line then:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File structure

**New**
- `convex/ingredients.ts` — add `listMovements` query (+ `movementRow` validator) to the existing file.
- `src/lib/inventory-movement.ts` + `src/lib/inventory-movement.test.ts` — pure `movementTypeVariant` helper.
- `src/components/inventory/waste-reason.tsx` — shared `WASTE_REASON_LABELS` map (reused by the sheet + waste page).
- `src/components/inventory/movement-history-sheet.tsx` — the history Sheet.
- convex test block in `tests/convex/ingredients.test.ts`.

**Modified**
- `src/routes/_pos/inventory/index.tsx` — wire "Lihat riwayat" → sheet.
- `src/components/inventory/waste-dialog.tsx` — add success/error toasts.
- `src/routes/_pos/inventory/waste.tsx` — kit rewrite (also adopt the shared reason map).
- `tests/e2e/inventory.spec.ts` — smoke the history sheet.
- Lingui catalogs.

---

## Task 1: `ingredients.listMovements` query

**Files:**
- Modify: `convex/ingredients.ts`
- Test: `tests/convex/ingredients.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/convex/ingredients.test.ts` (its `setupOwner` helper returns `{ asOwner }`):
```ts
describe('ingredients.listMovements', () => {
  it('returns movements newest-first with a running balance', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const susuId = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 100,
      lastCostPerUnitIDR: 25,
    });
    // Two adjustments: 0 → 1000, then 1000 → 800.
    await asOwner.mutation(api.ingredients.adjustStock, {
      ingredientId: susuId,
      newQty: 1000,
      reasonLabel: 'Pengiriman masuk',
    });
    await asOwner.mutation(api.ingredients.adjustStock, {
      ingredientId: susuId,
      newQty: 800,
      reasonLabel: 'Koreksi',
    });
    const { rows, truncated } = await asOwner.query(api.ingredients.listMovements, {
      ingredientId: susuId,
    });
    expect(truncated).toBe(false);
    expect(rows).toHaveLength(2);
    // Newest first: the -200 correction, balance 800.
    expect(rows[0]?.delta).toBe(-200);
    expect(rows[0]?.balanceAfter).toBe(800);
    expect(rows[1]?.delta).toBe(1000);
    expect(rows[1]?.balanceAfter).toBe(1000);
  });

  it('caps at 100 rows but keeps the newest balance equal to current stock', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Biji',
      canonicalUnit: 'g',
      reorderThreshold: 0,
      lastCostPerUnitIDR: 100,
    });
    // 101 adjustments of +1 each: 1, 2, …, 101.
    for (let qty = 1; qty <= 101; qty++) {
      await asOwner.mutation(api.ingredients.adjustStock, {
        ingredientId: id,
        newQty: qty,
        reasonLabel: 'Stok opname',
      });
    }
    const { rows, truncated } = await asOwner.query(api.ingredients.listMovements, {
      ingredientId: id,
    });
    expect(truncated).toBe(true);
    expect(rows).toHaveLength(100);
    // Newest row's balance is the current stock (101), not a truncated partial.
    expect(rows[0]?.balanceAfter).toBe(101);
  });

  it("rejects reading another cafe's ingredient", async () => {
    const t = convexTest(schema, modules);
    const { asOwner: ownerA } = await setupOwner(t, 'a@x.com');
    const { asOwner: ownerB } = await setupOwner(t, 'b@x.com');
    const aIng = await ownerA.mutation(api.ingredients.upsert, {
      name: 'A-only',
      canonicalUnit: 'ml',
      reorderThreshold: 0,
      lastCostPerUnitIDR: 1,
    });
    await expect(
      ownerB.query(api.ingredients.listMovements, { ingredientId: aIng })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/convex/ingredients.test.ts -t listMovements`
Expected: FAIL — `api.ingredients.listMovements` does not exist.

- [ ] **Step 3: Implement the query**

In `convex/ingredients.ts`, add a validator near the other validators (after `ingredientWithStock`):
```ts
const movementRow = v.object({
  id: v.id('inventoryMovements'),
  at: v.number(),
  delta: v.number(),
  reason: v.union(v.literal('sale'), v.literal('adjustment'), v.literal('waste')),
  note: v.optional(v.string()),
  wasteReason: v.optional(
    v.union(
      v.literal('rusak'),
      v.literal('basi'),
      v.literal('tumpah'),
      v.literal('salah_masak'),
      v.literal('lainnya')
    )
  ),
  balanceAfter: v.number(),
});
```
Then add the query (e.g. after `get`):
```ts
export const listMovements = query({
  args: { ingredientId: v.id('ingredients') },
  returns: v.object({ rows: v.array(movementRow), truncated: v.boolean() }),
  handler: async (ctx, { ingredientId }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, ingredientId, 'Bahan');
    // Oldest→newest so we can accumulate a running balance; the newest row's
    // balance then equals current stock.
    const movements = await ctx.db
      .query('inventoryMovements')
      .withIndex('by_cafe_ingredient_at', (q) =>
        q.eq('cafeId', cafeId).eq('ingredientId', ingredientId)
      )
      .order('asc')
      .collect();
    let balance = 0;
    const withBalance = movements.map((m) => {
      balance += m.delta;
      return {
        id: m._id,
        at: m.at,
        delta: m.delta,
        reason: m.reason,
        ...(m.note ? { note: m.note } : {}),
        ...(m.wasteReason ? { wasteReason: m.wasteReason } : {}),
        balanceAfter: balance,
      };
    });
    const truncated = withBalance.length > 100;
    // Most recent 100, newest first (each keeps its already-correct balance).
    const rows = withBalance.slice(-100).reverse();
    return { rows, truncated };
  },
});
```

- [ ] **Step 4: Run to verify pass + full ingredients suite**

Run: `pnpm test tests/convex/ingredients.test.ts`
Expected: PASS (all, including the 3 new cases).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck
git add convex/ingredients.ts tests/convex/ingredients.test.ts
git commit -m "feat(inventory): add ingredients.listMovements with running balance"
```

---

## Task 2: `movementTypeVariant` pure helper + test

**Files:**
- Create: `src/lib/inventory-movement.ts`
- Test: `src/lib/inventory-movement.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/inventory-movement.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { movementTypeVariant } from './inventory-movement';

describe('movementTypeVariant', () => {
  it('maps each movement reason to a StatusBadge variant', () => {
    expect(movementTypeVariant('sale')).toBe('muted');
    expect(movementTypeVariant('adjustment')).toBe('success');
    expect(movementTypeVariant('waste')).toBe('danger');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/lib/inventory-movement.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/inventory-movement.ts`:
```ts
import type { StatusBadgeVariant } from '~/components/ui/status-badge-variant';

export type MovementReason = 'sale' | 'adjustment' | 'waste';

// Semantic colour for a movement row's type badge. Pure → unit-testable.
export function movementTypeVariant(reason: MovementReason): StatusBadgeVariant {
  switch (reason) {
    case 'sale':
      return 'muted';
    case 'adjustment':
      return 'success';
    case 'waste':
      return 'danger';
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/lib/inventory-movement.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/inventory-movement.ts src/lib/inventory-movement.test.ts
git commit -m "feat(inventory): add movementTypeVariant helper with tests"
```

---

## Task 3: Shared `WASTE_REASON_LABELS` map

Extract the waste-reason labels currently inline in `waste.tsx` so the history sheet and the rebuilt waste page share one source.

**Files:**
- Create: `src/components/inventory/waste-reason.tsx`

- [ ] **Step 1: Create the shared map**

```tsx
import { Trans } from '@lingui/react/macro';
import type { ReactNode } from 'react';

// Raw DB waste-reason value → translated label. Shared by the waste log and
// the movement-history sheet so both read in the UI locale.
export const WASTE_REASON_LABELS: Record<string, ReactNode> = {
  rusak: <Trans>Rusak</Trans>,
  basi: <Trans>Basi/Kedaluwarsa</Trans>,
  tumpah: <Trans>Tumpah</Trans>,
  salah_masak: <Trans>Salah masak</Trans>,
  lainnya: <Trans>Lainnya</Trans>,
};
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm typecheck
git add src/components/inventory/waste-reason.tsx
git commit -m "refactor(inventory): extract shared WASTE_REASON_LABELS"
```

---

## Task 4: `MovementHistorySheet` component

**Files:**
- Create: `src/components/inventory/movement-history-sheet.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { Trans } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { WASTE_REASON_LABELS } from '~/components/inventory/waste-reason';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { Skeleton } from '~/components/ui/skeleton';
import { StatusBadge } from '~/components/ui/status-badge';
import { formatDate } from '~/lib/formater';
import { movementTypeVariant } from '~/lib/inventory-movement';
import { cn } from '~/lib/utils';

type Unit = 'g' | 'ml' | 'piece';

export function MovementHistorySheet({
  ingredient,
  onOpenChange,
}: {
  /** null = closed. Carries the name + unit for display. */
  ingredient: { _id: Id<'ingredients'>; name: string; canonicalUnit: Unit } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const data = useQuery(
    api.ingredients.listMovements,
    ingredient ? { ingredientId: ingredient._id } : 'skip'
  );
  const unit = ingredient?.canonicalUnit ?? '';

  return (
    <Sheet open={ingredient !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            <Trans>Riwayat</Trans> — {ingredient?.name}
          </SheetTitle>
        </SheetHeader>
        <div className="mt-4 text-sm">
          {data === undefined ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows are positional and never reorder
                <Skeleton key={`skeleton-${i}`} className="h-8 w-full" />
              ))}
            </div>
          ) : data.rows.length === 0 ? (
            <p className="text-muted-foreground">
              <Trans>Belum ada pergerakan stok.</Trans>
            </p>
          ) : (
            <>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2"><Trans>Tanggal</Trans></th>
                    <th className="py-2"><Trans>Tipe</Trans></th>
                    <th className="py-2 text-right"><Trans>Perubahan</Trans></th>
                    <th className="py-2 text-right"><Trans>Saldo</Trans></th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id} className="border-b border-border/50">
                      <td className="py-2 tabular-nums">
                        {formatDate(new Date(r.at).toISOString(), 'day-month')}
                      </td>
                      <td className="py-2">
                        <StatusBadge variant={movementTypeVariant(r.reason)}>
                          {r.reason === 'sale' ? (
                            <Trans>Penjualan</Trans>
                          ) : r.reason === 'adjustment' ? (
                            <Trans>Penyesuaian</Trans>
                          ) : (
                            <Trans>Limbah</Trans>
                          )}
                        </StatusBadge>
                        {r.reason === 'waste' && r.wasteReason ? (
                          <span className="ml-1 text-xs text-muted-foreground">
                            {WASTE_REASON_LABELS[r.wasteReason]}
                          </span>
                        ) : null}
                      </td>
                      <td
                        className={cn(
                          'py-2 text-right tabular-nums',
                          r.delta < 0 ? 'text-destructive' : 'text-primary'
                        )}
                      >
                        {r.delta > 0 ? '+' : ''}
                        {r.delta} {unit}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {r.balanceAfter} {unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.truncated ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  <Trans>Menampilkan 100 pergerakan terbaru.</Trans>
                </p>
              ) : null}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm typecheck
git add src/components/inventory/movement-history-sheet.tsx
git commit -m "feat(inventory): add MovementHistorySheet"
```

---

## Task 5: Wire "Lihat riwayat" on the Stock page

**Files:**
- Modify: `src/routes/_pos/inventory/index.tsx`

- [ ] **Step 1: Import the sheet**

Add after the `StockAdjustDialog` import (line ~10):
```tsx
import { MovementHistorySheet } from '~/components/inventory/movement-history-sheet';
```

- [ ] **Step 2: Add history state**

Next to the other `useState` rows (after `const [archiveRow, setArchiveRow] = useState<Ingredient | null>(null);`, line ~45):
```tsx
  const [historyRow, setHistoryRow] = useState<Ingredient | null>(null);
```

- [ ] **Step 3: Make the "Lihat riwayat" item open the sheet**

Replace the placeholder item (lines ~167-172):
```tsx
                {
                  label: <Trans>Lihat riwayat</Trans>,
                  icon: <History />,
                  // Destination view ships in sub-project 2 (Inventory polish).
                  onSelect: () => {},
                },
```
with:
```tsx
                {
                  label: <Trans>Lihat riwayat</Trans>,
                  icon: <History />,
                  onSelect: () => setHistoryRow(row.original),
                },
```

- [ ] **Step 4: Mount the sheet**

After the `<ConfirmDialog ... />` block near the end of the component (after its closing `/>`), add:
```tsx
      <MovementHistorySheet
        ingredient={historyRow}
        onOpenChange={(open) => {
          if (!open) setHistoryRow(null);
        }}
      />
```
(`Ingredient` in this file is `Doc<'ingredients'> & { currentStockQty: number }`, which structurally satisfies the sheet's `{ _id, name, canonicalUnit }` prop — no cast needed. `setHistoryRow` is a stable setter, so the `columns` `useMemo` dep array does not change.)

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck
git add src/routes/_pos/inventory/index.tsx
git commit -m "feat(inventory): open movement history from the Stock ⋯ menu"
```

---

## Task 6: Toasts in `WasteDialog`

**Files:**
- Modify: `src/components/inventory/waste-dialog.tsx`

- [ ] **Step 1: Import the toast helper**

Add after the existing `Spinner` import:
```tsx
import { toast } from '~/lib/toast';
```

- [ ] **Step 2: Add success + error toasts**

In `onSubmit`, the current success/catch is (around lines 80-85):
```tsx
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Gagal mencatat limbah.`);
```
Change it to fire toasts (keep the inline `setError`):
```tsx
      toast.success(t`Limbah dicatat.`);
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t`Gagal mencatat limbah.`;
      setError(message);
      toast.error(message);
```
(Leave the `finally` block and the rest unchanged.)

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm typecheck
git add src/components/inventory/waste-dialog.tsx
git commit -m "feat(inventory): toast on waste record success/error"
```

---

## Task 7: Waste page rewrite onto the kit

**Files:**
- Modify (rewrite): `src/routes/_pos/inventory/waste.tsx`

- [ ] **Step 1: Replace the whole file**

```tsx
import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { WasteDialog } from '~/components/inventory/waste-dialog';
import { WASTE_REASON_LABELS } from '~/components/inventory/waste-reason';
import { Button } from '~/components/ui/button';
import { DataTable } from '~/components/ui/data-table';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { PageHeader } from '~/components/ui/page-header';
import { StatusBadge } from '~/components/ui/status-badge';
import { formatDate } from '~/lib/formater';
import { formatIDR } from '~/lib/money';

export const Route = createFileRoute('/_pos/inventory/waste')({
  component: WastePage,
});

type WasteRow = {
  id: string;
  at: number;
  ingredientName: string;
  unit: 'g' | 'ml' | 'piece';
  qtyWasted: number;
  wasteReason: string;
  note?: string;
  totalCostIDR: number;
};

function WastePage() {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const rows = useQuery(api.waste.recent, {}) as WasteRow[] | undefined;
  const totalLoss = (rows ?? []).reduce((sum, r) => sum + r.totalCostIDR, 0);

  const columns = useMemo<ColumnDef<WasteRow, unknown>[]>(
    () => [
      {
        accessorKey: 'at',
        header: () => <Trans>Tanggal</Trans>,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatDate(new Date(row.original.at).toISOString(), 'day-month')}
          </span>
        ),
      },
      {
        accessorKey: 'ingredientName',
        enableSorting: false,
        header: () => <Trans>Bahan</Trans>,
        cell: ({ row }) => row.original.ingredientName,
      },
      {
        id: 'qty',
        enableSorting: false,
        header: () => <Trans>Jumlah</Trans>,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.qtyWasted} {row.original.unit}
          </span>
        ),
      },
      {
        id: 'reason',
        enableSorting: false,
        header: () => <Trans>Alasan</Trans>,
        cell: ({ row }) => (
          <StatusBadge variant="danger">
            {WASTE_REASON_LABELS[row.original.wasteReason] ?? row.original.wasteReason}
          </StatusBadge>
        ),
      },
      {
        accessorKey: 'totalCostIDR',
        header: () => <Trans>Kerugian</Trans>,
        cell: ({ row }) => (
          <span className="tabular-nums">{formatIDR(row.original.totalCostIDR)}</span>
        ),
      },
      {
        id: 'note',
        enableSorting: false,
        header: () => <Trans>Catatan</Trans>,
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.note ?? '—'}</span>
        ),
      },
    ],
    []
  );

  const emptyState = (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Trash2 />
        </EmptyMedia>
        <EmptyTitle>
          <Trans>Belum ada limbah</Trans>
        </EmptyTitle>
        <EmptyDescription>
          <Trans>Belum ada limbah tercatat dalam 30 hari terakhir.</Trans>
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  return (
    <main className="p-6">
      <PageHeader
        title={<Trans>Limbah</Trans>}
        meta={
          rows ? (
            <Trans>Kerugian 30 hari · {formatIDR(totalLoss)}</Trans>
          ) : null
        }
        actions={
          <Button type="button" onClick={() => setOpen(true)}>
            <Trash2 />
            <Trans>Catat Limbah</Trans>
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={rows}
        emptyState={emptyState}
        initialSort={[{ id: 'at', desc: true }]}
      />

      <WasteDialog open={open} onOpenChange={setOpen} />
    </main>
  );
}
```

> Note: the inventory layout (`route.tsx`) is only `PinGate` + `Outlet` (no `p-6`), so this page keeps its own `<main className="p-6">` like the Stock page. The `as WasteRow[]` cast bridges the generated `waste.recent` return to the local row type (same shape).

- [ ] **Step 2: Typecheck + full suite**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_pos/inventory/waste.tsx
git commit -m "feat(inventory): migrate Waste page onto the kit"
```

---

## Task 8: Playwright smoke — open the history sheet

**Files:**
- Modify: `tests/e2e/inventory.spec.ts`

The existing "Stock page" kit test (added in the foundation slice) already signs up, adds "Susu", and records stock via the `⋯` → "Catat stok masuk" → adjust dialog. Extend it to open the history.

- [ ] **Step 1: Append history-sheet assertions to the existing Stock kit test**

In `tests/e2e/inventory.spec.ts`, find the test titled `'Stock page: sort, ⋯ menu, cancel archive, adjust-stock toast'`. After its final assertion (`await expect(page.getByText(/Stok dicatat/)).toBeVisible();`), append:
```ts
    // Open the movement history from the ⋯ menu → the sheet shows a balance.
    await page.getByRole('button', { name: /Aksi baris/ }).first().click();
    await page.getByRole('menuitem', { name: /Lihat riwayat/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/Riwayat/)).toBeVisible();
    await expect(page.getByText(/Saldo/)).toBeVisible();
```
(`ui/sheet` is built on the Radix Dialog primitive, so the panel has `role="dialog"`.)

- [ ] **Step 2: Typecheck the spec**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Attempt to run (auth-gated)**

Run:
```bash
RUN_AUTH_E2E=1 pnpm test:e2e tests/e2e/inventory.spec.ts
```
Expected: tests pass (needs the dev server + Convex backend). If the backend isn't available here, do NOT fake a pass — report "could not run: no backend" and confirm the spec typechecks and skips cleanly without the env var. If a selector fails on a real run (e.g. `/Riwayat/` matches the title plus a row), tighten it (role-scoped / `.first()`) and report the fix.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/inventory.spec.ts
git commit -m "test(e2e): open movement history sheet from Stock ⋯"
```

---

## Task 9: i18n — extract, fill English, compile

**Files:** `src/locales/id/messages.po`, `src/locales/en/messages.po`

- [ ] **Step 1: Extract**

Run: `pnpm lingui:extract`

- [ ] **Step 2: Fill English**

In `src/locales/en/messages.po`, fill each NEW empty `msgstr ""`. Preserve placeholders exactly. Mapping:
- `Riwayat` → `History`
- `Tipe` → `Type`
- `Perubahan` → `Change`
- `Saldo` → `Balance`
- `Penjualan` → `Sale`
- `Penyesuaian` → `Adjustment`
- `Limbah` → `Waste`
- `Belum ada pergerakan stok.` → `No stock movements yet.`
- `Menampilkan 100 pergerakan terbaru.` → `Showing the 100 most recent movements.`
- `Limbah dicatat.` → `Waste recorded.`
- `Kerugian 30 hari · {0}` → `30-day loss · {0}`  (match the exact placeholder the extractor emits for `formatIDR(totalLoss)`)
- `Catat Limbah` → `Record Waste`  (if already translated from the old page, leave it)
- Any waste-reason / "Belum ada limbah" / "Belum ada limbah tercatat…" / "Bahan" / "Jumlah" / "Alasan" / "Kerugian" / "Catatan" strings that are already translated from the previous waste page — **leave untouched**.

For any new empty `en` msgstr not listed, translate sensibly and note it.

- [ ] **Step 3: Compile + typecheck**

Run: `pnpm lingui:compile && pnpm typecheck`
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add src/locales/id/messages.po src/locales/en/messages.po
git commit -m "i18n(inventory): extract + fill en for movement history + waste"
```

---

## Task 10: Full local verification

**Files:** none

- [ ] **Step 1: Full gate**

Run:
```bash
pnpm typecheck && pnpm test && pnpm lingui:compile
```
Expected: typecheck clean; all unit/convex tests PASS (existing + new `listMovements` (3) and `movementTypeVariant` (1)); compile clean.

- [ ] **Step 2: Lint changed files (Biome, if it runs here)**

Run: `pnpm lint`
Expected: PASS or only pre-existing unrelated findings. Use `// biome-ignore lint/suspicious/noArrayIndexKey: …` for the sheet's skeleton index keys (already in the Task 4 code).

- [ ] **Step 3: Confirm clean tree + no generated drift**

Run: `git status` then `./node_modules/.bin/convex codegen` then `git status`
Expected: clean both times (no schema change → no `_generated` drift). If codegen changes tracked files, commit them.

- [ ] **Step 4: Integrate (after user OK)**

Per the trunk-based workflow, wait for the user's go-ahead, then push `feat/inventory-history` and open a PR to `main` (or merge per their choice). Do not merge without approval.

---

## Self-Review (performed against the spec)

**Spec coverage:**
- `ingredients.listMovements` (running balance, 100-cap + `truncated`, cafe-scoped ownership) → Task 1 (+ tests for balance/order, truncation, tenant isolation).
- Pure type→variant helper → Task 2; shared waste-reason labels → Task 3.
- `MovementHistorySheet` (Sheet, Tanggal/Tipe/Perubahan/Saldo, skeleton/empty/truncated, waste sub-reason) → Task 4.
- Stock `⋯` "Lihat riwayat" wiring (state + mount, no longer a no-op) → Task 5.
- `WasteDialog` toasts → Task 6.
- Waste page kit rewrite (PageHeader + meta loss, DataTable, `StatusBadge` Alasan danger, no `⋯`, sort by Tanggal/Kerugian, Empty with Trash2) → Task 7.
- Playwright smoke opening the sheet → Task 8. i18n → Task 9. Verification → Task 10.
- Out-of-scope respected: no Adjustments page, no edit/delete, no global movements log, no schema change.

**Placeholder scan:** none. The `useMemo` empty-dep `[]` for the waste `columns` is intentional (the cell renderers close over nothing render-variant). 

**Type consistency:** `movementRow` validator fields (`id/at/delta/reason/note?/wasteReason?/balanceAfter`) match what `MovementHistorySheet` reads. `movementTypeVariant(reason)` parameter type (`MovementReason`) matches the `reason` union returned by `listMovements`. `WASTE_REASON_LABELS` (Task 3) is consumed by both Task 4 (sheet) and Task 7 (waste page). The sheet's `ingredient` prop (`{_id, name, canonicalUnit}`) is satisfied by the Stock page's `Ingredient` type passed in Task 5. `WasteRow` (Task 7) matches `waste.recent`'s returned shape.
