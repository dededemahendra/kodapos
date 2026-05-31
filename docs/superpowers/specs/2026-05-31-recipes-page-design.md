# Catalog UI Kit — Recipes standalone page (Sub-project 3)

**Date:** 2026-05-31
**Status:** Approved design, ready for implementation plan
**Branch (suggested):** `feat/recipes-page` (off `main`)
**Depends on:** Catalog UI kit (PageHeader, Toolbar, DataTable, StatusBadge, Sheet, Empty — merged), the existing `RecipeEditor` component, and `recipes.getForItem`/`recipes.upsert`.

## Context

Recipes today are editable only inline from the item edit page (`/menu/items/$itemId`) via the self-contained `RecipeEditor({ menuItemId })` component, which loads its own data (`recipes.getForItem`), lists ingredients, and saves (`recipes.upsert`). The sidebar's **Resep** → `/recipes` is a `ComingSoon` stub. There is no overview of recipe coverage or costing across the menu.

`recipes` rows are per `menuItemId` with `lines: [{ ingredientId, qty, wastageFactor }]`. `getForItem` already computes `costPerCupIDR` for one item (Σ `qty × wastageFactor × lastCostPerUnitIDR`). The Menu-polish `items.list` exposes `hasRecipe`, but not cost.

## Goal

Give the owner one page to see every menu item's recipe status and **profitability** — ingredient count, price, cost-per-cup (HPP), and margin — find items missing recipes, and edit any recipe in place without leaving the page.

## Decisions (from brainstorming)

- **Edit model:** in-place — opening an item opens the existing `RecipeEditor` in a side **Sheet** (reused as-is). The item edit page keeps its own inline `RecipeEditor` unchanged.
- **Columns:** Item · Bahan (line count) · Harga · HPP/cup · Margin % · Status. (Cost + margin overview.)
- **Item interaction:** the Item cell is a **button** that opens the edit Sheet (editing is the single primary action — no `⋯`).
- **Filters:** search by item name + chips Semua / Lengkap / Belum (has-recipe vs not).
- **No schema change.**

## Backend — `recipes.listForCatalog`

New query in `convex/recipes.ts`, no args:
```
listForCatalog() -> Array<{
  itemId: Id<'menuItems'>,
  name: string,
  priceIDR: number,
  hasRecipe: boolean,
  lineCount: number,
  costPerCupIDR: number,   // 0 when no recipe
}>
```
- Cafe-scoped via `requireOwnerCafe`.
- Read non-archived `menuItems` (via `by_cafe_active`); for each, load its recipe (`by_cafe_item`, `.unique()`); if present, `lineCount = recipe.lines.length` and `costPerCupIDR = Math.round(Σ qty × wastageFactor × ing.lastCostPerUnitIDR)` over ingredients that still belong to the cafe (mirrors `getForItem`); else `hasRecipe = false`, `lineCount = 0`, `costPerCupIDR = 0`.
- Returns items sorted by `name` (locale-aware, `id-ID`), so the list is stable regardless of recipe state.
- Per-item recipe + ingredient reads are bounded (café-scale, dozens of items) — documented in a handler comment.

## Pure helper — `recipeMarginPct`

`src/lib/recipe.ts`:
```
recipeMarginPct(priceIDR: number, costPerCupIDR: number): number | null
```
Returns `Math.round((priceIDR - costPerCupIDR) / priceIDR * 100)`, or `null` when `priceIDR <= 0` (avoid divide-by-zero / meaningless margin). Unit-tested in edge-runtime. Keeps margin math out of the component and testable.

## Components

| Unit | File | Responsibility |
|---|---|---|
| **listForCatalog** | `convex/recipes.ts` (new query) | Per-item recipe status + cost for the overview. |
| **recipeMarginPct** | `src/lib/recipe.ts` + `src/lib/recipe.test.ts` | Pure margin %. |
| **Recipes page** | `src/routes/_pos/recipes.tsx` (replace stub) | PageHeader + Toolbar (search + Lengkap/Belum chips) + DataTable + edit Sheet. |
| **Recipe edit Sheet** | inline in the page | `ui/sheet` wrapping `<RecipeEditor menuItemId={…} />`, controlled by `editItemId` state. |

### Recipes page details

- **PageHeader:** title "Resep"; meta "{n} item · {k} tanpa resep" (k = items with `hasRecipe === false`); no primary action.
- **Toolbar:** `search` (placeholder "Cari item…"); filter chips Semua / Lengkap / Belum with counts. Filtering + counts are client-side over the fetched rows.
- **Row type:** `RecipeRow = { itemId; name; priceIDR; hasRecipe; lineCount; costPerCupIDR }` (the `listForCatalog` element).
- **DataTable columns:**
  - **Item** — a `<button>` (left-aligned, `font-medium hover:underline`) that calls `setEditItemId(row.itemId)`. Sortable by `name`.
  - **Bahan** — `lineCount`, tabular-nums. Sortable.
  - **Harga** — `formatIDR(priceIDR)`, tabular-nums. Sortable.
  - **HPP/cup** — `hasRecipe ? formatIDR(costPerCupIDR) : '—'`, tabular-nums. Sortable (by `costPerCupIDR`).
  - **Margin** — `hasRecipe` and `recipeMarginPct(priceIDR, costPerCupIDR) !== null` → `"{pct}%"`, else `'—'`. Sortable (by computed margin; see note). 
  - **Status** — `StatusBadge`: `Lengkap` (success) when `hasRecipe`, `Belum` (muted) otherwise.
  - No actions column.
  - `initialSort`: `[{ id: 'name', desc: false }]`.
  - Sorting the Margin column: give that column an `accessorFn` returning the computed margin (or `-Infinity`/a sentinel when null) so TanStack can sort it; the cell renders the `%`/`—`.
- **Edit Sheet:** `<Sheet open={editItemId !== null} onOpenChange={(o)=>{ if(!o) setEditItemId(null); }}>` with `SheetContent` (right, `overflow-y-auto`, `sm:max-w-lg`), `SheetTitle` "Resep — {name of the selected item}", an sr-only `SheetDescription`, and `{editItemId ? <RecipeEditor menuItemId={editItemId} /> : null}`. The live `listForCatalog` query re-renders cost/margin/status after `RecipeEditor` saves. (The selected item's name comes from the row that set `editItemId` — store the row, or look it up from the fetched list.)
- **Empty state** via `ui/empty` (e.g. a `NotebookText`/`ChefHat` icon; "Belum ada item." with a hint to add menu items first).

## i18n

New strings via Lingui (`<Trans>` / `t`). After implementation: `pnpm lingui:extract`, fill `en`, `pnpm lingui:compile`. New strings include: "Resep" (already exists as the nav label — reuse), "{n} item · {k} tanpa resep", "Cari item…", "Lengkap", "Belum", "Bahan", "Harga", "HPP/cup", "Margin", "Status", "Resep — " context, "Belum ada item.". Reason/ingredient strings inside `RecipeEditor` are already translated (unchanged).

## Testing

- **Vitest / convex-test** (`tests/convex/recipes.test.ts`):
  - `listForCatalog` returns one entry per non-archived item with correct `hasRecipe`/`lineCount`/`costPerCupIDR` (e.g. 200 ml × Rp 25 = Rp 5.000); items with no recipe report `hasRecipe=false`, `costPerCupIDR=0`; archived items excluded; cafe-scoped (another cafe's items absent).
- **Vitest pure** (`src/lib/recipe.test.ts`): `recipeMarginPct` — normal case (28000/8500 → 70), `null` when price 0, rounding.
- **Playwright** (extend `tests/e2e/menu.spec.ts` or `inventory.spec.ts`, auth-gated): from `/recipes`, click an item with no recipe (Status "Belum") → the Sheet opens → add an ingredient line → save → the row's Status shows "Lengkap" and an HPP value appears.
- Gate: `pnpm typecheck && pnpm test && pnpm lingui:compile`. No schema change → no codegen drift expected.

## Affected / new files (anticipated)

**Modified**
- `convex/recipes.ts` (add `listForCatalog`).
- `src/routes/_pos/recipes.tsx` (replace the `ComingSoon` stub).
- `tests/convex/recipes.test.ts`, an e2e spec.
- Lingui catalogs.

**New**
- `src/lib/recipe.ts` + `src/lib/recipe.test.ts`.

(Reused unchanged: `RecipeEditor`, kit components.)

## Out of scope

- Editing item price/name from this page (stays on the item edit page).
- Changing `RecipeEditor` itself.
- Bulk recipe operations; recipe templates/duplication.
- Purchases (sub-project 4), Promotions (sub-project 5).
- The "archived views strictly read-only" follow-up.
