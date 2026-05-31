# Recipes standalone page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/recipes` ComingSoon stub with a kit page — a costing/coverage overview of every menu item's recipe (Item / Bahan / Harga / HPP-per-cup / Margin / Status) with in-place editing via the existing `RecipeEditor` in a side Sheet.

**Architecture:** A new `recipes.listForCatalog` query returns per-item recipe status + cost-per-cup; a pure `recipeMarginPct` helper computes margin %. The page is PageHeader + Toolbar (search + Lengkap/Belum chips) + DataTable; clicking an item's name opens `RecipeEditor` (reused as-is) in a Sheet, and the live query refreshes on save.

**Tech Stack:** React 19, TanStack Router, Convex + convex-test, Tailwind v4, Lingui (id source / en target), shadcn/ui kit, Vitest (edge-runtime), Playwright. Package manager: **pnpm**. Branch: `feat/recipes-page` (off `main`).

---

## Conventions for the implementing engineer (read once)

- **pnpm** for all commands. `~` = `src/`, `convex/...` for backend/generated.
- **Branch:** `feat/recipes-page` (already created off `main`, has the design-spec commit). Stay on it.
- **i18n:** author strings in **Indonesian**; `<Trans>` in JSX, `` t`…` `` for attributes. Don't hand-edit `.po`; Task 5 runs extract/compile.
- **Strict TS:** `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` — optional object fields via conditional spread (`...(x !== undefined ? { k: x } : {})`).
- **Convex loading contract:** `useQuery(...)` returns `undefined` while loading. Handlers may use `Date.now()`.
- **`/recipes` has no intermediate layout with padding** (the `_pos` layout is sidebar + header + Outlet), so the page renders its own `<main className="p-6">` (like the Stock page).
- **Run before any push:** `pnpm lingui:extract` → fill `en` → `pnpm typecheck && pnpm test && pnpm lingui:compile`.
- **Commit style:** small Conventional Commits, each ending with a blank line then:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File structure

**Modified**
- `convex/recipes.ts` — add `listForCatalog` query (+ `recipeCatalogRow` validator).
- `src/routes/_pos/recipes.tsx` — replace the `ComingSoon` stub with the page.
- `tests/convex/recipes.test.ts` — `listForCatalog` tests.
- `tests/e2e/inventory.spec.ts` — recipes edit-sheet smoke.
- Lingui catalogs.

**New**
- `src/lib/recipe.ts` + `src/lib/recipe.test.ts` — pure `recipeMarginPct`.

(Reused unchanged: `RecipeEditor`, kit components.)

---

## Task 1: `recipes.listForCatalog` query

**Files:**
- Modify: `convex/recipes.ts`
- Test: `tests/convex/recipes.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/convex/recipes.test.ts` (its `setup(t)` helper returns `{ asOwner, categoryId, itemId, susuId }` — `itemId` is "Espresso" priced 18000, `susuId` is "Susu" at Rp 25/ml):
```ts
describe('recipes.listForCatalog', () => {
  it('returns each non-archived item with recipe status + cost-per-cup', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, itemId, susuId } = await setup(t);
    // Item with a recipe: 200 ml × 1.0 × Rp 25 = Rp 5.000.
    await asOwner.mutation(api.recipes.upsert, {
      menuItemId: itemId,
      lines: [{ ingredientId: susuId, qty: 200, wastageFactor: 1.0 }],
    });
    const rows = await asOwner.query(api.recipes.listForCatalog, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('Espresso');
    expect(rows[0]?.priceIDR).toBe(18000);
    expect(rows[0]?.hasRecipe).toBe(true);
    expect(rows[0]?.lineCount).toBe(1);
    expect(rows[0]?.costPerCupIDR).toBe(5000);
  });

  it('reports items without a recipe as hasRecipe=false, cost 0', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    const rows = await asOwner.query(api.recipes.listForCatalog, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]?.hasRecipe).toBe(false);
    expect(rows[0]?.lineCount).toBe(0);
    expect(rows[0]?.costPerCupIDR).toBe(0);
  });

  it('excludes archived items', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, itemId } = await setup(t);
    await asOwner.mutation(api.menu.items.archive, { id: itemId });
    expect(await asOwner.query(api.recipes.listForCatalog, {})).toHaveLength(0);
  });

  it("does not return another cafe's items", async () => {
    const t = convexTest(schema, modules);
    await setup(t); // owner A (o@x.com) with an item
    const otherUserId = await t.run(async (ctx) =>
      ctx.db.insert('users', { name: 'B', email: 'b@x.com' })
    );
    const ownerB = t.withIdentity({ subject: `${otherUserId}|test_session` });
    await ownerB.mutation(api.cafes.createForOwner, { name: 'Cafe B' });
    expect(await ownerB.query(api.recipes.listForCatalog, {})).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/convex/recipes.test.ts -t listForCatalog`
Expected: FAIL — `api.recipes.listForCatalog` does not exist.

- [ ] **Step 3: Implement the query**

In `convex/recipes.ts`, add a validator near the other validators (after `recipeDetail`):
```ts
const recipeCatalogRow = v.object({
  itemId: v.id('menuItems'),
  name: v.string(),
  priceIDR: v.number(),
  hasRecipe: v.boolean(),
  lineCount: v.number(),
  costPerCupIDR: v.number(),
});
```
Add the query (e.g. after `getForItem`):
```ts
export const listForCatalog = query({
  args: {},
  returns: v.array(recipeCatalogRow),
  handler: async (ctx) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    // Non-archived items; per-item recipe + ingredient reads (café-scale,
    // dozens of items). Cost mirrors getForItem.
    const items = await ctx.db
      .query('menuItems')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId))
      .collect();
    const out = [];
    for (const item of items) {
      if (item.archived) continue;
      const recipe = await ctx.db
        .query('recipes')
        .withIndex('by_cafe_item', (q) =>
          q.eq('cafeId', cafeId).eq('menuItemId', item._id)
        )
        .unique();
      let lineCount = 0;
      let costPerCupIDR = 0;
      if (recipe) {
        lineCount = recipe.lines.length;
        let cost = 0;
        for (const line of recipe.lines) {
          const ing = await ctx.db.get(line.ingredientId);
          if (!ing || ing.cafeId !== cafeId) continue;
          cost += line.qty * line.wastageFactor * ing.lastCostPerUnitIDR;
        }
        costPerCupIDR = Math.round(cost);
      }
      out.push({
        itemId: item._id,
        name: item.name,
        priceIDR: item.priceIDR,
        hasRecipe: recipe !== null,
        lineCount,
        costPerCupIDR,
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name, 'id-ID'));
    return out;
  },
});
```

- [ ] **Step 4: Run to verify pass + full recipes suite**

Run: `pnpm test tests/convex/recipes.test.ts`
Expected: PASS (all — the 4 new cases + existing upsert/getForItem tests).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck
git add convex/recipes.ts tests/convex/recipes.test.ts
git commit -m "feat(recipes): add recipes.listForCatalog query"
```

---

## Task 2: `recipeMarginPct` pure helper

**Files:**
- Create: `src/lib/recipe.ts`
- Test: `src/lib/recipe.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/recipe.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { recipeMarginPct } from './recipe';

describe('recipeMarginPct', () => {
  it('computes margin percent (rounded)', () => {
    expect(recipeMarginPct(28000, 8500)).toBe(70); // 0.6964 → 70
    expect(recipeMarginPct(18000, 5000)).toBe(72); // 0.7222 → 72
  });

  it('returns null when price is zero or negative', () => {
    expect(recipeMarginPct(0, 100)).toBeNull();
    expect(recipeMarginPct(-1, 0)).toBeNull();
  });

  it('handles cost above price (negative margin)', () => {
    expect(recipeMarginPct(1000, 1500)).toBe(-50);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/lib/recipe.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/recipe.ts`:
```ts
// Gross margin percent for a menu item given its price and cost-per-cup (HPP).
// Returns null when price is non-positive (margin is undefined/meaningless).
export function recipeMarginPct(priceIDR: number, costPerCupIDR: number): number | null {
  if (priceIDR <= 0) return null;
  return Math.round(((priceIDR - costPerCupIDR) / priceIDR) * 100);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/lib/recipe.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/recipe.ts src/lib/recipe.test.ts
git commit -m "feat(recipes): add recipeMarginPct helper with tests"
```

---

## Task 3: Recipes page

**Files:**
- Modify (replace stub): `src/routes/_pos/recipes.tsx`

- [ ] **Step 1: Replace the whole file**

```tsx
import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { NotebookText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { RecipeEditor } from '~/components/inventory/recipe-editor';
import { DataTable } from '~/components/ui/data-table';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { PageHeader } from '~/components/ui/page-header';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { StatusBadge } from '~/components/ui/status-badge';
import { Toolbar } from '~/components/ui/toolbar';
import { formatIDR } from '~/lib/money';
import { recipeMarginPct } from '~/lib/recipe';

export const Route = createFileRoute('/_pos/recipes')({
  component: RecipesPage,
});

type RecipeRow = {
  itemId: Id<'menuItems'>;
  name: string;
  priceIDR: number;
  hasRecipe: boolean;
  lineCount: number;
  costPerCupIDR: number;
};
type Filter = 'all' | 'complete' | 'missing';

function RecipesPage() {
  const { t } = useLingui();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [editRow, setEditRow] = useState<RecipeRow | null>(null);

  const rows = useQuery(api.recipes.listForCatalog, {}) as RecipeRow[] | undefined;

  const counts = useMemo(() => {
    if (!rows) return undefined;
    return {
      all: rows.length,
      complete: rows.filter((r) => r.hasRecipe).length,
      missing: rows.filter((r) => !r.hasRecipe).length,
    };
  }, [rows]);

  const visible = useMemo<RecipeRow[] | undefined>(() => {
    if (!rows) return undefined;
    let out = rows;
    if (filter === 'complete') out = out.filter((r) => r.hasRecipe);
    else if (filter === 'missing') out = out.filter((r) => !r.hasRecipe);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((r) => r.name.toLowerCase().includes(q));
    }
    return out;
  }, [rows, filter, search]);

  const columns = useMemo<ColumnDef<RecipeRow, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: () => <Trans>Item</Trans>,
        cell: ({ row }) => (
          <button
            type="button"
            className="text-left font-medium hover:underline"
            onClick={() => setEditRow(row.original)}
          >
            {row.original.name}
          </button>
        ),
      },
      {
        accessorKey: 'lineCount',
        header: () => <Trans>Bahan</Trans>,
        cell: ({ row }) => <span className="tabular-nums">{row.original.lineCount}</span>,
      },
      {
        accessorKey: 'priceIDR',
        header: () => <Trans>Harga</Trans>,
        cell: ({ row }) => (
          <span className="tabular-nums">{formatIDR(row.original.priceIDR)}</span>
        ),
      },
      {
        accessorKey: 'costPerCupIDR',
        header: () => <Trans>HPP/cup</Trans>,
        cell: ({ row }) =>
          row.original.hasRecipe ? (
            <span className="tabular-nums">{formatIDR(row.original.costPerCupIDR)}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'margin',
        accessorFn: (r) => {
          const m = r.hasRecipe ? recipeMarginPct(r.priceIDR, r.costPerCupIDR) : null;
          return m ?? Number.NEGATIVE_INFINITY;
        },
        header: () => <Trans>Margin</Trans>,
        cell: ({ row }) => {
          const m = row.original.hasRecipe
            ? recipeMarginPct(row.original.priceIDR, row.original.costPerCupIDR)
            : null;
          return m !== null ? (
            <span className="tabular-nums">{m}%</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
      {
        id: 'status',
        enableSorting: false,
        header: () => <Trans>Status</Trans>,
        cell: ({ row }) =>
          row.original.hasRecipe ? (
            <StatusBadge variant="success">
              <Trans>Lengkap</Trans>
            </StatusBadge>
          ) : (
            <StatusBadge variant="muted">
              <Trans>Belum</Trans>
            </StatusBadge>
          ),
      },
    ],
    []
  );

  const emptyState = (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <NotebookText />
        </EmptyMedia>
        <EmptyTitle>
          <Trans>Belum ada item.</Trans>
        </EmptyTitle>
        <EmptyDescription>
          <Trans>Tambah item menu dulu untuk mulai menyusun resep.</Trans>
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  return (
    <main className="p-6">
      <PageHeader
        title={<Trans>Resep</Trans>}
        meta={
          counts ? (
            <Trans>
              {counts.all} item · {counts.missing} tanpa resep
            </Trans>
          ) : null
        }
      />

      <Toolbar
        search={search}
        onSearch={setSearch}
        searchPlaceholder={t`Cari item…`}
        active={filter}
        onFilter={(v) => setFilter(v as Filter)}
        filters={[
          { label: <Trans>Semua</Trans>, value: 'all', ...(counts !== undefined ? { count: counts.all } : {}) },
          { label: <Trans>Lengkap</Trans>, value: 'complete', ...(counts !== undefined ? { count: counts.complete } : {}) },
          { label: <Trans>Belum</Trans>, value: 'missing', ...(counts !== undefined ? { count: counts.missing } : {}) },
        ]}
      />

      <DataTable
        columns={columns}
        data={visible}
        emptyState={emptyState}
        initialSort={[{ id: 'name', desc: false }]}
      />

      <Sheet
        open={editRow !== null}
        onOpenChange={(o) => {
          if (!o) setEditRow(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>
              <Trans>Resep</Trans> — {editRow?.name}
            </SheetTitle>
            <SheetDescription className="sr-only">
              <Trans>Sunting bahan dan jumlah untuk resep item ini.</Trans>
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {editRow ? <RecipeEditor menuItemId={editRow.itemId} /> : null}
          </div>
        </SheetContent>
      </Sheet>
    </main>
  );
}
```

> Notes: the `columns` memo dep is `[]` — its cells close over only stable references (`setEditRow` is a stable state setter; `recipeMarginPct`/`formatIDR` are module functions; headers use `<Trans>`, not `t`). The `as RecipeRow[]` cast bridges the generated `listForCatalog` return to the local row type. The Margin column's `accessorFn` returns `-Infinity` for null so it sorts to the bottom; the cell still renders "—".

- [ ] **Step 2: Typecheck + full suite**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_pos/recipes.tsx
git commit -m "feat(recipes): build standalone Recipes page (overview + edit sheet)"
```

---

## Task 4: Playwright smoke — edit a recipe from the page

**Files:**
- Modify: `tests/e2e/inventory.spec.ts`

This test does a full minimal setup (signup → onboarding category → item → ingredient) then edits a recipe from `/recipes`. It reuses the shared helpers `gotoHydrated` and `waitForUrlHydrated` (imported at the top of the file).

- [ ] **Step 1: Add the test inside the describe block**

In `tests/e2e/inventory.spec.ts`, add this test inside `test.describe('inventory + recipes (auth-gated)', ...)`, after the existing tests:
```ts
  test('Recipes page: add a recipe via the edit sheet flips status to Lengkap', async ({ page }) => {
    const email = `e2e+${Date.now()}@kodapos.test`;
    const password = 'Sa{ngat-Aman-123';

    // Signup + onboarding (category "Kopi" + item "Espresso").
    await gotoHydrated(page, '/signup');
    await page.getByLabel('Nama Anda').fill('E2E Owner');
    await page.getByLabel('Nama kafe').fill('Kopi E2E Resep');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.locator('#terms').click();
    await page.getByRole('button', { name: /Daftar/ }).click();
    await waitForUrlHydrated(page, /\/onboarding\/profile$/, { timeout: 15_000 });
    await page.getByLabel('Persentase PPN').fill('11');
    await page.getByRole('button', { name: /Lanjut/ }).click();
    await waitForUrlHydrated(page, /\/onboarding\/menu$/);
    await page.getByRole('button', { name: /Mulai dengan kategori/ }).click();
    await waitForUrlHydrated(page, /\/menu\/categories$/);
    await page.getByRole('button', { name: /Tambah Kategori/ }).click();
    await page.getByLabel('Nama kategori').fill('Kopi');
    await page.getByRole('button', { name: /^Simpan$/ }).click();
    await expect(page.getByText(/Kategori ditambahkan/)).toBeVisible();
    await page.getByRole('link', { name: 'Items' }).click();
    await page.getByRole('link', { name: /Tambah Item/ }).click();
    await waitForUrlHydrated(page, /\/menu\/items\/new$/);
    await page.getByLabel('Nama').fill('Espresso');
    await page.getByLabel('Kategori').selectOption({ label: 'Kopi' });
    await page.getByLabel('Harga (Rp)').fill('18000');
    await page.getByRole('button', { name: /^Simpan$/ }).click();
    await waitForUrlHydrated(page, /\/menu$/);

    // Cashier PIN so /inventory + /recipes are reachable.
    await page.goto('/onboarding/cashier');
    await waitForUrlHydrated(page, /\/onboarding\/cashier$/);
    await page.getByRole('button', { name: /Atur PIN/ }).click();
    for (const digit of '1234') await page.keyboard.type(digit);
    await expect(page.getByRole('button', { name: /Ganti PIN/ })).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: /Selesai/ }).click();
    await page.goto('/pin');
    await waitForUrlHydrated(page, /\/pin$/);
    await page.getByRole('button', { name: /E2E Owner/ }).click();
    for (const digit of '1234') await page.keyboard.type(digit);
    await waitForUrlHydrated(page, /\/shift\/open$/);

    // Add ingredient "Susu".
    await page.goto('/inventory');
    await waitForUrlHydrated(page, /\/inventory$/);
    await page.getByRole('button', { name: /Tambah Bahan/ }).click();
    await page.getByLabel('Nama').fill('Susu');
    await page.getByLabel('Satuan', { exact: true }).click();
    await page.getByRole('option', { name: /Mililiter/ }).click();
    await page.getByLabel('Ambang isi ulang').fill('500');
    await page.getByLabel('Biaya per satuan (Rp)').fill('25');
    await page.getByRole('button', { name: /^Simpan$/ }).click();
    await expect(page.getByText(/Bahan ditambahkan/)).toBeVisible();

    // Recipes page: Espresso starts "Belum"; open its edit sheet and add Susu.
    await page.goto('/recipes');
    await waitForUrlHydrated(page, /\/recipes$/);
    await page.getByRole('button', { name: 'Espresso' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: /Tambah bahan/ }).click();
    await sheet.getByPlaceholder('Pilih bahan…').click();
    await page.getByRole('button', { name: /^Susu/ }).click();
    await sheet.getByLabel('Jumlah').fill('200');
    await sheet.getByRole('button', { name: /Simpan resep/ }).click();
    await expect(sheet.getByText(/Tersimpan/)).toBeVisible();

    // Close the sheet; the row now reads "Lengkap".
    await page.keyboard.press('Escape');
    await expect(page.getByRole('cell', { name: /Lengkap/ })).toBeVisible();
  });
```
> Note: the `RecipeEditor` selectors (`+ Tambah bahan`, `Pilih bahan…`, `Jumlah`, `Simpan resep`, `Tersimpan`) match its existing usage in the first inventory test. The picker option list renders outside the sheet's DOM subtree in some cases, so the `/^Susu/` option click is page-scoped (not sheet-scoped).

- [ ] **Step 2: Typecheck the spec**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Attempt to run (auth-gated)**

Run:
```bash
RUN_AUTH_E2E=1 pnpm test:e2e tests/e2e/inventory.spec.ts
```
Expected: all tests pass (Playwright auto-starts `pnpm dev:all`). If the backend can't start here, do NOT fake a pass — report "could not run: no backend" and confirm the spec typechecks + skips cleanly without the env var. If a selector fails on a real run, fix it to match the rendered UI (prefer role-scoped / `.first()`; the picker option / sheet-scoping are the likely spots) and report the fix.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/inventory.spec.ts
git commit -m "test(e2e): add a recipe from the standalone Recipes page"
```

---

## Task 5: i18n — extract, fill English, compile

**Files:** `src/locales/id/messages.po`, `src/locales/en/messages.po`

- [ ] **Step 1: Extract**

Run: `pnpm lingui:extract`

- [ ] **Step 2: Fill English**

In `src/locales/en/messages.po`, fill each NEW empty `msgstr ""`. Preserve placeholders exactly. Mapping:
- `{0} item · {1} tanpa resep` → `{0} items · {1} without recipe`  (match the exact placeholders the extractor emits)
- `HPP/cup` → `Cost/cup`
- `Margin` → `Margin`
- `Lengkap` → `Complete`
- `Belum ada item.` → `No items yet.`
- `Tambah item menu dulu untuk mulai menyusun resep.` → `Add menu items first to start building recipes.`
- `Sunting bahan dan jumlah untuk resep item ini.` → `Edit ingredients and quantities for this item's recipe.`
- Already translated from prior work — leave untouched: `Resep`, `Item`, `Bahan`, `Harga`, `Status`, `Belum`, `Semua`, `Cari item…`.

For any new empty `en` msgstr not listed, translate sensibly and note it.

- [ ] **Step 3: Compile + typecheck**

Run: `pnpm lingui:compile && pnpm typecheck`
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add src/locales/id/messages.po src/locales/en/messages.po
git commit -m "i18n(recipes): extract + fill en for Recipes page"
```

---

## Task 6: Full local verification

**Files:** none

- [ ] **Step 1: Full gate**

Run:
```bash
pnpm typecheck && pnpm test && pnpm lingui:compile
```
Expected: typecheck clean; all unit/convex tests PASS (existing + 4 new `listForCatalog` + 3 `recipeMarginPct`); compile clean.

- [ ] **Step 2: Lint changed files (Biome, if it runs here)**

Run: `pnpm lint`
Expected: PASS or only pre-existing unrelated findings. Fix anything this work introduced.

- [ ] **Step 3: Confirm clean tree + no codegen drift**

Run: `git status` then `./node_modules/.bin/convex codegen` then `git status`
Expected: clean both times (no schema change → no `_generated` drift).

- [ ] **Step 4: Integrate (after user OK)**

Per the trunk-based workflow, wait for the user's go-ahead, then push `feat/recipes-page` and open a PR to `main` (or merge per their choice). Do not merge without approval.

---

## Self-Review (performed against the spec)

**Spec coverage:**
- `recipes.listForCatalog` (per-item status + cost, non-archived, cafe-scoped) → Task 1 (+ 4 tests incl. archived exclusion + tenant isolation).
- `recipeMarginPct` pure helper → Task 2 (+ test).
- Page: PageHeader (title/meta "{n} item · {k} tanpa resep"), Toolbar (search + Semua/Lengkap/Belum chips, counts), DataTable (Item button → sheet, Bahan, Harga, HPP/cup with "—", Margin with accessorFn sort + "—", Status badge), `<main className="p-6">`, edit Sheet reusing `RecipeEditor` with sr-only description → Task 3.
- Playwright edit-sheet round-trip (Belum → add line → save → Lengkap) → Task 4. i18n → Task 5. Verification → Task 6.
- Out-of-scope respected: no item price/name editing here, `RecipeEditor` unchanged, no schema change.

**Placeholder scan:** none. The `columns` `[]` dep is intentional and justified inline (only stable refs captured).

**Type consistency:** `recipeCatalogRow` validator fields (`itemId/name/priceIDR/hasRecipe/lineCount/costPerCupIDR`) match the page's `RecipeRow` type and all column/filter usages. `recipeMarginPct(priceIDR, costPerCupIDR)` signature matches both the page's calls and the margin `accessorFn`. `RecipeEditor`'s `{ menuItemId }` prop matches the Sheet's `<RecipeEditor menuItemId={editRow.itemId} />`. `Filter = 'all' | 'complete' | 'missing'` is used consistently in `visible`, `counts`, and the chips.
