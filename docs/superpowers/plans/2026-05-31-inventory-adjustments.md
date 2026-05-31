# Inventory: Adjustments page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/inventory/adjustments` ComingSoon stub with a kit page — a reason-filterable stock-adjustment audit log plus a record flow — backed by storing the adjustment reason in its own movement field.

**Architecture:** Add an optional `reasonLabel` field to `inventoryMovements`; `adjustStock` writes the reason + free-text note separately (no longer combined). A new `ingredients.recentAdjustments` query mirrors `waste.recent`. The page uses PageHeader + Toolbar (reason chips) + DataTable, and reuses `IngredientPicker` → `StockAdjustDialog` for recording.

**Tech Stack:** React 19, TanStack Router, Convex + convex-test, Tailwind v4, Lingui (id source / en target), shadcn/ui kit, Vitest (edge-runtime), Playwright. Package manager: **pnpm**. Branch: `feat/inventory-adjustments` (off `main`).

---

## Conventions for the implementing engineer (read once)

- **pnpm** for all commands. `~` = `src/`, `convex/...` for backend/generated.
- **Branch:** `feat/inventory-adjustments` (already created off `main`, has the design-spec commit). Stay on it.
- **Convex codegen:** after a schema change, run `./node_modules/.bin/convex codegen` (NOT `npx`) and commit the tracked `convex/_generated/*` files.
- **i18n:** author strings in **Indonesian**; `<Trans>` in JSX, `` t`…` `` for attributes/labels. Don't hand-edit `.po`; Task 6 runs extract/compile.
- **Strict TS:** `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` — build optional object fields with conditional spread (`...(x !== undefined ? { k: x } : {})`).
- **Convex loading contract:** `useQuery(...)` returns `undefined` while loading. Convex handlers may use `Date.now()`.
- **Run before any push:** `pnpm lingui:extract` → fill `en` → `pnpm typecheck && pnpm test && pnpm lingui:compile`.
- **Commit style:** small Conventional Commits, each ending with a blank line then:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File structure

**Modified**
- `convex/schema.ts` — add `reasonLabel` to `inventoryMovements`.
- `convex/_generated/*` — codegen output (committed).
- `convex/ingredients.ts` — `adjustStock` storage change + new `recentAdjustments` query (+ `adjustmentRow` validator).
- `src/components/inventory/stock-adjust-dialog.tsx` — import the shared reasons constant.
- `src/routes/_pos/inventory/adjustments.tsx` — replace the stub with the page.
- `tests/convex/ingredients.test.ts` — update the adjustStock assertion; add `recentAdjustments` tests.
- `tests/e2e/inventory.spec.ts` — record-adjustment smoke.
- Lingui catalogs.

**New**
- `src/components/inventory/adjust-reasons.ts` — shared `ADJUST_REASONS` constant.

---

## Task 1: Store the adjustment reason separately

**Files:**
- Modify: `convex/schema.ts`, `convex/ingredients.ts`, `convex/_generated/*`
- Test: `tests/convex/ingredients.test.ts`

- [ ] **Step 1: Add the schema field + codegen**

In `convex/schema.ts`, in the `inventoryMovements` table definition, add `reasonLabel` next to the existing `note` field:
```ts
    note: v.optional(v.string()),
    // Adjustment reason (e.g. "Pengiriman masuk"); set by adjustStock. Optional
    // so legacy rows (reason folded into note) still validate.
    reasonLabel: v.optional(v.string()),
```
Then run:
```bash
./node_modules/.bin/convex codegen
```
Expected: regenerates `convex/_generated/*` with no errors.

- [ ] **Step 2: Update the existing adjustStock test to expect separate storage (RED)**

In `tests/convex/ingredients.test.ts`, the test `it('writes a movement with delta = newQty - currentStock + the note', ...)` currently asserts (line ~146):
```ts
    expect(movement?.note).toBe('Pengiriman masuk — PT Sumber Susu');
```
Replace that single line with:
```ts
    expect(movement?.reasonLabel).toBe('Pengiriman masuk');
    expect(movement?.note).toBe('PT Sumber Susu');
```
Run: `pnpm test tests/convex/ingredients.test.ts -t "writes a movement"`
Expected: FAIL — `adjustStock` still combines into `note` and never sets `reasonLabel`.

- [ ] **Step 3: Change adjustStock to store reason + note separately (GREEN)**

In `convex/ingredients.ts`, the `adjustStock` handler currently ends with (≈ lines 203-213):
```ts
    const noteText = args.note?.trim()
      ? `${args.reasonLabel} — ${args.note.trim()}`
      : args.reasonLabel;
    return await ctx.db.insert('inventoryMovements', {
      cafeId,
      ingredientId: args.ingredientId,
      delta,
      reason: 'adjustment',
      note: noteText,
      at: Date.now(),
    });
```
Replace that with:
```ts
    return await ctx.db.insert('inventoryMovements', {
      cafeId,
      ingredientId: args.ingredientId,
      delta,
      reason: 'adjustment',
      reasonLabel: args.reasonLabel,
      ...(args.note?.trim() ? { note: args.note.trim() } : {}),
      at: Date.now(),
    });
```

- [ ] **Step 4: Run to verify pass + full ingredients suite**

Run: `pnpm test tests/convex/ingredients.test.ts`
Expected: PASS (all — the updated assertion + existing listMovements/no-op/rejection tests).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck
git add convex/schema.ts convex/ingredients.ts convex/_generated tests/convex/ingredients.test.ts
git commit -m "feat(inventory): store adjustment reasonLabel separately from note"
```

---

## Task 2: `ingredients.recentAdjustments` query

**Files:**
- Modify: `convex/ingredients.ts`
- Test: `tests/convex/ingredients.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/convex/ingredients.test.ts`:
```ts
describe('ingredients.recentAdjustments', () => {
  it('returns adjustment rows newest-first with ingredient name + reasonLabel', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const susuId = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 100,
      lastCostPerUnitIDR: 25,
    });
    await asOwner.mutation(api.ingredients.adjustStock, {
      ingredientId: susuId,
      newQty: 1000,
      reasonLabel: 'Pengiriman masuk',
      note: 'PT Sumber Susu',
    });
    await asOwner.mutation(api.ingredients.adjustStock, {
      ingredientId: susuId,
      newQty: 950,
      reasonLabel: 'Koreksi',
    });
    const rows = await asOwner.query(api.ingredients.recentAdjustments, {});
    expect(rows).toHaveLength(2);
    // Newest first: the -50 Koreksi.
    expect(rows[0]?.delta).toBe(-50);
    expect(rows[0]?.reasonLabel).toBe('Koreksi');
    expect(rows[0]?.ingredientName).toBe('Susu');
    expect(rows[0]?.unit).toBe('ml');
    expect(rows[1]?.delta).toBe(1000);
    expect(rows[1]?.reasonLabel).toBe('Pengiriman masuk');
    expect(rows[1]?.note).toBe('PT Sumber Susu');
  });

  it('excludes sale and waste movements', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const susuId = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 100,
      lastCostPerUnitIDR: 25,
    });
    await asOwner.mutation(api.ingredients.adjustStock, {
      ingredientId: susuId,
      newQty: 500,
      reasonLabel: 'Stok opname',
    });
    // A waste movement should NOT appear in adjustments.
    await asOwner.mutation(api.waste.record, {
      ingredientId: susuId,
      qtyWasted: 50,
      wasteReason: 'tumpah',
    });
    const rows = await asOwner.query(api.ingredients.recentAdjustments, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]?.reasonLabel).toBe('Stok opname');
  });

  it("does not return another cafe's adjustments", async () => {
    const t = convexTest(schema, modules);
    const { asOwner: ownerA } = await setupOwner(t, 'a@x.com');
    const { asOwner: ownerB } = await setupOwner(t, 'b@x.com');
    const aIng = await ownerA.mutation(api.ingredients.upsert, {
      name: 'A-Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 0,
      lastCostPerUnitIDR: 1,
    });
    await ownerA.mutation(api.ingredients.adjustStock, {
      ingredientId: aIng,
      newQty: 10,
      reasonLabel: 'Koreksi',
    });
    expect(await ownerB.query(api.ingredients.recentAdjustments, {})).toHaveLength(0);
  });
});
```
> Note: confirm `api.waste.record` args are `{ ingredientId, qtyWasted, wasteReason }`. If the signature differs, read `convex/waste.ts` and match it — the waste row exists only to prove `recentAdjustments` filters by `reason === 'adjustment'`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/convex/ingredients.test.ts -t recentAdjustments`
Expected: FAIL — `api.ingredients.recentAdjustments` does not exist.

- [ ] **Step 3: Implement the query**

In `convex/ingredients.ts`, add a validator near the other validators:
```ts
const adjustmentRow = v.object({
  id: v.id('inventoryMovements'),
  at: v.number(),
  ingredientName: v.string(),
  unit: v.union(v.literal('g'), v.literal('ml'), v.literal('piece')),
  delta: v.number(),
  reasonLabel: v.optional(v.string()),
  note: v.optional(v.string()),
});
```
Add the query (e.g. after `listMovements`):
```ts
export const recentAdjustments = query({
  args: { days: v.optional(v.number()) },
  returns: v.array(adjustmentRow),
  handler: async (ctx, { days = 30 }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const cutoff = Date.now() - days * 86_400_000;
    const movements = await ctx.db
      .query('inventoryMovements')
      .withIndex('by_cafe_reason_at', (q) =>
        q.eq('cafeId', cafeId).eq('reason', 'adjustment').gt('at', cutoff)
      )
      .order('desc')
      .collect();
    // Cache ingredient name/unit per id to avoid refetching for repeats.
    const info = new Map<string, { name: string; unit: 'g' | 'ml' | 'piece' }>();
    const out = [];
    for (const m of movements) {
      let ing = info.get(m.ingredientId);
      if (!ing) {
        const doc = await ctx.db.get(m.ingredientId);
        ing = { name: doc?.name ?? '—', unit: doc?.canonicalUnit ?? 'piece' };
        info.set(m.ingredientId, ing);
      }
      out.push({
        id: m._id,
        at: m.at,
        ingredientName: ing.name,
        unit: ing.unit,
        delta: m.delta,
        ...(m.reasonLabel ? { reasonLabel: m.reasonLabel } : {}),
        ...(m.note ? { note: m.note } : {}),
      });
    }
    return out;
  },
});
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test tests/convex/ingredients.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck
git add convex/ingredients.ts tests/convex/ingredients.test.ts
git commit -m "feat(inventory): add ingredients.recentAdjustments query"
```

---

## Task 3: Shared `ADJUST_REASONS` constant

**Files:**
- Create: `src/components/inventory/adjust-reasons.ts`
- Modify: `src/components/inventory/stock-adjust-dialog.tsx`

- [ ] **Step 1: Create the shared constant**

```ts
// The fixed set of stock-adjustment reasons (raw DB values; translated for
// display at the call site). Shared by the adjust dialog and the adjustments
// log filter so they never drift.
export const ADJUST_REASONS = ['Pengiriman masuk', 'Stok opname', 'Koreksi'] as const;

export type AdjustReason = (typeof ADJUST_REASONS)[number];
```

- [ ] **Step 2: Use it in the dialog**

In `src/components/inventory/stock-adjust-dialog.tsx`, replace the local declaration
```ts
const REASONS = ['Pengiriman masuk', 'Stok opname', 'Koreksi'] as const;
```
with an import (keep the local name `REASONS` so the rest of the file is untouched). Add near the top imports:
```ts
import { ADJUST_REASONS as REASONS } from '~/components/inventory/adjust-reasons';
```
and delete the old `const REASONS = ...` line.

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm typecheck
git add src/components/inventory/adjust-reasons.ts src/components/inventory/stock-adjust-dialog.tsx
git commit -m "refactor(inventory): share ADJUST_REASONS between dialog and log"
```

---

## Task 4: Adjustments page

**Files:**
- Modify (replace stub): `src/routes/_pos/inventory/adjustments.tsx`

- [ ] **Step 1: Replace the whole file**

```tsx
import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { PackagePlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ADJUST_REASONS } from '~/components/inventory/adjust-reasons';
import { IngredientPicker } from '~/components/inventory/ingredient-picker';
import { StockAdjustDialog } from '~/components/inventory/stock-adjust-dialog';
import { Button } from '~/components/ui/button';
import { DataTable } from '~/components/ui/data-table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { PageHeader } from '~/components/ui/page-header';
import { StatusBadge } from '~/components/ui/status-badge';
import { Toolbar } from '~/components/ui/toolbar';
import { formatDate } from '~/lib/formater';

export const Route = createFileRoute('/_pos/inventory/adjustments')({
  component: AdjustmentsPage,
});

type AdjustmentRow = {
  id: string;
  at: number;
  ingredientName: string;
  unit: 'g' | 'ml' | 'piece';
  delta: number;
  reasonLabel?: string;
  note?: string;
};
type Filter = 'all' | (typeof ADJUST_REASONS)[number];

function AdjustmentsPage() {
  const { t } = useLingui();
  const [filter, setFilter] = useState<Filter>('all');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [adjustId, setAdjustId] = useState<Id<'ingredients'> | null>(null);

  const rows = useQuery(api.ingredients.recentAdjustments, {}) as
    | AdjustmentRow[]
    | undefined;

  // Translated chip labels keyed by raw reason value.
  const reasonLabels: Record<string, string> = {
    'Pengiriman masuk': t`Pengiriman masuk`,
    'Stok opname': t`Stok opname`,
    Koreksi: t`Koreksi`,
  };

  const counts = useMemo(() => {
    if (!rows) return undefined;
    const c: Record<string, number> = { all: rows.length };
    for (const r of ADJUST_REASONS) c[r] = rows.filter((x) => x.reasonLabel === r).length;
    return c;
  }, [rows]);

  const visible = useMemo<AdjustmentRow[] | undefined>(() => {
    if (!rows) return undefined;
    return filter === 'all' ? rows : rows.filter((r) => r.reasonLabel === filter);
  }, [rows, filter]);

  const columns = useMemo<ColumnDef<AdjustmentRow, unknown>[]>(() => {
    const labels: Record<string, string> = {
      'Pengiriman masuk': t`Pengiriman masuk`,
      'Stok opname': t`Stok opname`,
      Koreksi: t`Koreksi`,
    };
    return [
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
        accessorKey: 'delta',
        header: () => <Trans>Perubahan</Trans>,
        cell: ({ row }) => (
          <span
            className={`tabular-nums ${row.original.delta < 0 ? 'text-destructive' : 'text-primary'}`}
          >
            {row.original.delta > 0 ? '+' : ''}
            {row.original.delta} {row.original.unit}
          </span>
        ),
      },
      {
        id: 'reason',
        enableSorting: false,
        header: () => <Trans>Alasan</Trans>,
        cell: ({ row }) =>
          row.original.reasonLabel ? (
            <StatusBadge
              variant={row.original.reasonLabel === 'Pengiriman masuk' ? 'success' : 'muted'}
            >
              {labels[row.original.reasonLabel] ?? row.original.reasonLabel}
            </StatusBadge>
          ) : (
            <span className="text-muted-foreground">—</span>
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
    ];
  }, [t]);

  const emptyState = (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <PackagePlus />
        </EmptyMedia>
        <EmptyTitle>
          <Trans>Belum ada penyesuaian.</Trans>
        </EmptyTitle>
        <EmptyDescription>
          <Trans>Catat penyesuaian stok untuk mulai melacak koreksi dan pengiriman.</Trans>
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  return (
    <main className="p-6">
      <PageHeader
        title={<Trans>Penyesuaian Stok</Trans>}
        meta={counts ? <Trans>{counts.all} penyesuaian · 30 hari</Trans> : null}
        actions={
          <Button type="button" onClick={() => setPickerOpen(true)}>
            <PackagePlus />
            <Trans>Catat Penyesuaian</Trans>
          </Button>
        }
      />

      <Toolbar
        active={filter}
        onFilter={(v) => setFilter(v as Filter)}
        filters={[
          { label: <Trans>Semua</Trans>, value: 'all', ...(counts !== undefined ? { count: counts.all } : {}) },
          ...ADJUST_REASONS.map((r) => ({
            label: reasonLabels[r],
            value: r,
            ...(counts !== undefined ? { count: counts[r] } : {}),
          })),
        ]}
      />

      <DataTable
        columns={columns}
        data={visible}
        emptyState={emptyState}
        initialSort={[{ id: 'at', desc: true }]}
      />

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <Trans>Pilih bahan untuk disesuaikan</Trans>
            </DialogTitle>
          </DialogHeader>
          <IngredientPicker
            value={null}
            onChange={(id) => {
              setPickerOpen(false);
              setAdjustId(id);
            }}
          />
        </DialogContent>
      </Dialog>

      <StockAdjustDialog
        open={adjustId !== null}
        ingredientId={adjustId}
        onOpenChange={(open) => {
          if (!open) setAdjustId(null);
        }}
      />
    </main>
  );
}
```

> Notes: the inventory layout (`route.tsx`) has no `p-6`, so this page keeps its own `<main className="p-6">`. `Toolbar` search is omitted (it's optional). The `reasonLabels` map (for chips) and the `labels` map inside the `columns` memo are intentionally separate so the memo's dep stays `[t]` (a single shared object rebuilt each render would defeat the memo). The `as AdjustmentRow[]` cast bridges the generated `recentAdjustments` return to the local row type.

- [ ] **Step 2: Typecheck + full suite**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_pos/inventory/adjustments.tsx
git commit -m "feat(inventory): build Adjustments page (log + record flow)"
```

---

## Task 5: Playwright smoke — record an adjustment

**Files:**
- Modify: `tests/e2e/inventory.spec.ts`

The existing Stock kit test signs up and adds ingredient "Susu". Add a focused test that records an adjustment from the Adjustments page and sees it in the log. Reuse the `signupAndAddSusu` helper already at the top of the file (it signs up, onboards, PINs in, and adds "Susu" via the Stock page).

- [ ] **Step 1: Add the test inside the describe block**

In `tests/e2e/inventory.spec.ts`, add this test inside `test.describe('inventory + recipes (auth-gated)', ...)`, after the existing tests:
```ts
  test('Adjustments page: record an adjustment appears in the log', async ({ page }) => {
    await signupAndAddSusu(page);

    await page.goto('/inventory/adjustments');
    await waitForUrlHydrated(page, /\/inventory\/adjustments$/);

    await page.getByRole('button', { name: /Catat Penyesuaian/ }).click();
    // Pick the ingredient in the picker dialog.
    await page.getByPlaceholder('Pilih bahan…').click();
    await page.getByRole('button', { name: /^Susu/ }).click();
    // The StockAdjustDialog opens; set a new quantity and save.
    await page.getByLabel(/Stok baru/).fill('1000');
    await page.getByRole('button', { name: /^Simpan$/ }).click();
    await expect(page.getByText(/Stok dicatat/)).toBeVisible();

    // The new adjustment shows in the log (a +1000 ml change row).
    await expect(page.getByRole('cell', { name: /\+1000 ml/ })).toBeVisible();
  });
```
> Note: confirm `signupAndAddSusu` exists at the top of this file (added in an earlier slice). If its name differs, use the actual helper. The picker input placeholder is `Pilih bahan…` (from `IngredientPicker`); the option text is the ingredient name + stock, so `/^Susu/` matches.

- [ ] **Step 2: Typecheck the spec**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Attempt to run (auth-gated)**

Run:
```bash
RUN_AUTH_E2E=1 pnpm test:e2e tests/e2e/inventory.spec.ts
```
Expected: all tests pass (needs the dev server + Convex backend — Playwright auto-starts `pnpm dev:all`). If the backend can't start here, do NOT fake a pass — report "could not run: no backend" and confirm the spec typechecks and skips cleanly without the env var. If a selector fails on a real run (e.g. the `+1000 ml` cell text spacing, or the picker option), fix it to match the rendered UI (prefer role-scoped locators) and report the fix.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/inventory.spec.ts
git commit -m "test(e2e): record an adjustment from the Adjustments page"
```

---

## Task 6: i18n — extract, fill English, compile

**Files:** `src/locales/id/messages.po`, `src/locales/en/messages.po`

- [ ] **Step 1: Extract**

Run: `pnpm lingui:extract`

- [ ] **Step 2: Fill English**

In `src/locales/en/messages.po`, fill each NEW empty `msgstr ""`. Preserve placeholders exactly. Mapping:
- `Penyesuaian Stok` → `Stock Adjustments`
- `{0} penyesuaian · 30 hari` → `{0} adjustments · 30 days`  (match the exact placeholder the extractor emits)
- `Catat Penyesuaian` → `Record Adjustment`
- `Perubahan` → `Change`  (already exists from the movement-history slice — leave it if already translated)
- `Alasan` → `Reason`  (already exists — leave if translated)
- `Catatan` → `Notes`  (already exists — leave if translated)
- `Belum ada penyesuaian.` → `No adjustments yet.`
- `Catat penyesuaian stok untuk mulai melacak koreksi dan pengiriman.` → `Record stock adjustments to start tracking corrections and deliveries.`
- `Pilih bahan untuk disesuaikan` → `Pick an ingredient to adjust`
- Reason labels (`Pengiriman masuk`, `Stok opname`, `Koreksi`) and `Semua`, `Tanggal`, `Bahan` already exist from prior work — leave them.

For any new empty `en` msgstr not listed, translate sensibly and note it.

- [ ] **Step 3: Compile + typecheck**

Run: `pnpm lingui:compile && pnpm typecheck`
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add src/locales/id/messages.po src/locales/en/messages.po
git commit -m "i18n(inventory): extract + fill en for Adjustments page"
```

---

## Task 7: Full local verification

**Files:** none

- [ ] **Step 1: Full gate**

Run:
```bash
pnpm typecheck && pnpm test && pnpm lingui:compile
```
Expected: typecheck clean; all unit/convex tests PASS (existing + updated adjustStock + 3 new `recentAdjustments`); compile clean.

- [ ] **Step 2: Lint changed files (Biome, if it runs here)**

Run: `pnpm lint`
Expected: PASS or only pre-existing unrelated findings. Fix anything this work introduced.

- [ ] **Step 3: Confirm clean tree + no further codegen drift**

Run: `git status` then `./node_modules/.bin/convex codegen` then `git status`
Expected: clean after the schema change was committed in Task 1; running codegen again produces no new drift.

- [ ] **Step 4: Integrate (after user OK)**

Per the trunk-based workflow, wait for the user's go-ahead, then push `feat/inventory-adjustments` and open a PR to `main` (or merge per their choice). Do not merge without approval.

---

## Self-Review (performed against the spec)

**Spec coverage:**
- `inventoryMovements.reasonLabel` field + codegen → Task 1.
- `adjustStock` stores reason + free-text note separately (test updated) → Task 1.
- `recentAdjustments` query (30d, ingredient join, reasonLabel/note, cafe-scoped, excludes sale/waste) → Task 2 (+ 3 tests).
- Shared `ADJUST_REASONS` (dialog + page) → Task 3.
- Page: PageHeader (title/meta/action), reason-filter Toolbar chips (Semua + 3 reasons, counts, no search), DataTable (Tanggal/Bahan/Perubahan/Alasan StatusBadge/Catatan, read-only, sort by at desc), empty state, two-step record flow (IngredientPicker dialog → StockAdjustDialog) → Task 4.
- Alasan badge: success for "Pengiriman masuk" else muted; "—" for legacy rows → Task 4.
- Playwright record smoke → Task 5. i18n → Task 6. Verification → Task 7.
- Out-of-scope respected: no edit/delete, no legacy backfill, no new-ingredient from picker (`value={null}`, no `onRequestCreate`), no changes to history sheet / Stock / Waste.

**Placeholder scan:** none. The two `recentAdjustments`/Playwright "confirm the signature/helper" notes are verification instructions, not placeholders (the code is fully given; the note guards against drift in a dependency).

**Type consistency:** `adjustmentRow` validator fields (`id/at/ingredientName/unit/delta/reasonLabel?/note?`) match the page's `AdjustmentRow` type and the chips/columns usage. `ADJUST_REASONS` (Task 3) is imported by both the dialog (Task 3) and the page (Task 4); `Filter = 'all' | (typeof ADJUST_REASONS)[number]`. `recentAdjustments` arg `{ days? }` matches the page's `useQuery(..., {})` call. The `StockAdjustDialog` prop contract (`open`/`ingredientId`/`onOpenChange`) is unchanged and matches Task 4's usage.
