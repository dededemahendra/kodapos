# Catalog UI Kit — Menu polish (Sub-project 1)

**Date:** 2026-05-31
**Status:** Approved design, ready for implementation plan
**Branch:** `feat/catalog-ui-kit` (stacked on the kit foundation commits)
**Depends on:** Catalog UI kit foundation (PageHeader, Toolbar, DataTable, StatusBadge, RowActions, ConfirmDialog, toast) — see `2026-05-31-catalog-ui-kit-foundation-design.md`.

## Context

The Catalog UI kit foundation (sub-project 0) shipped a reusable component set and proved it by migrating Inventory › Stock. This sub-project applies the same kit to the three **Menu** pages and, per the foundation spec's note for sub-project 1, surfaces recipe/stock status on the item list.

Current state of the three pages:

- **Items** (`src/routes/_pos/menu/index.tsx`): a left category sidebar (Semua / per-category counts / Arsip) + search + a hand-rolled `<table>`. Name cell links to the edit page `/menu/items/$itemId`. Columns: Nama, Kategori, Harga, Status (Aktif/Off/Arsip). Backend `menu.items.list` returns only `name/categoryId/priceIDR/isActive/archived/position/createdAt` — it has **no** recipe or stock data (that lives only in `menu.items.listForSale`).
- **Kategori** (`src/routes/_pos/menu/categories.tsx` → `src/components/menu/category-table.tsx`): inline create form, inline-cell rename, manual ▲▼ reorder arrows (position drives cashier-screen + item-filter order), and an "Arsipkan" link. No archived view.
- **Modifier groups** (`src/routes/_pos/menu/modifiers.tsx`): a `<ul>` (not a table) of groups with meta (wajib/opsional · min/max · N opsi); each row links to `/menu/modifiers/$groupId`. A "+ Grup baru" link.

## Goal

Make all three Menu pages look and behave like the Stock reference page — PageHeader + Toolbar + kit table + StatusBadge + `⋯` RowActions + ConfirmDialog + toasts — while preserving each page's intent (category ordering, edit-page navigation), and surface recipe/low-stock status on the Items list.

## Decisions (from brainstorming)

- **Branch:** stack on `feat/catalog-ui-kit` (kit + Menu polish ship together).
- **Items category filter:** Toolbar with search + a **category `<Select>` dropdown** (in the Toolbar's trailing `children` slot) + **Aktif / Arsip** chips. (Not a sidebar; not per-category chips.)
- **Items recipe/stock:** **Yes** — enrich `items.list` with `hasRecipe` + low-stock, add a "Resep" column and low-stock row tint.
- **Categories ordering:** **drag-to-reorder, drag-only** — the table renders in saved `position` order with a drag handle that persists the new order; columns are **not** view-sortable on this page (position is the meaningful order).
- **Edit interaction (Items, Modifiers):** **Nama is a link** to the edit page; the `⋯` menu holds secondary actions.
- **Archived views are read-only** across all pages (no unarchive/restore mutation exists; consistent with the Stock page).

## New dependencies

- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/modifiers` — used **only** by the Categories drag-reorder table.

## Shared kit additions

The generic `DataTable` stays pure (view-sort, used by Items and Modifiers). Drag-reorder is a distinct responsibility, so it gets its own focused component rather than complicating `DataTable`:

| Component | File | Responsibility | Key props / API |
|---|---|---|---|
| **ReorderableTable** | `src/components/ui/reorderable-table.tsx` | Vertical drag-to-reorder table built on the existing `ui/table` primitives + dnd-kit. Renders a drag-handle column, manages drag state, calls back with the new order. Loading skeleton + empty state like `DataTable`. | `columns: ReorderableColumn<T>[]`, `data: T[] \| undefined`, `getRowId(row): string`, `emptyState: ReactNode`, `onReorder(orderedIds: string[]): void \| Promise<void>`, `getRowClassName?(row): string`, `skeletonRows?: number` |

`ReorderableColumn<T>` is a minimal `{ id: string; header: ReactNode; cell: (row: T) => ReactNode }` (no tanstack sorting — order is drag-driven). The drag handle (`☰`, `GripVertical` from lucide) is rendered as the first column by the component itself.

Reuse of existing kit: `PageHeader`, `Toolbar` (its `children` slot for the Items dropdown), `DataTable` (Items, Modifiers), `StatusBadge`, `RowActions`, `ConfirmDialog`, `toast`, `ui/empty`, `ui/select`.

## Backend changes

### 1. `menu/items.list` enrichment

Extract the per-item low-stock computation currently inline in `menu/items.ts` `listForSale` (the block that loads a recipe and sums `inventoryMovements` to compare against `reorderThreshold`) into a shared helper so both queries use one implementation:

- New file `convex/menu/itemStock.ts` exporting `itemRecipeStatus(ctx, cafeId, menuItemId): Promise<{ hasRecipe: boolean; lowStockIngredientNames: string[] }>`.
- `listForSale` calls it (replacing its inline block; its existing `lowStockIngredientNames` field keeps the same shape).
- `list` calls it per row and adds `hasRecipe` and `lowStockIngredientNames` to each returned object. Update the `returns` validator (`menuItemDoc` → an enriched object validator `menuItemWithStatus = v.object({ ...menuItemDoc fields, hasRecipe: v.boolean(), lowStockIngredientNames: v.array(v.string()) })`). Because `list` can include archived/inactive items (unlike `listForSale`), compute status for every returned row.

> Performance note: `list` now does per-item recipe + movement reads. Cafe-scale data is dozens of items; acceptable. Document it in the handler comment. If it ever matters, a later sub-project can denormalize stock — out of scope here.

### 2. `menu/categories.setOrder` (new mutation for drag)

The existing `categories.reorder({ id, direction })` only swaps adjacent siblings. Drag produces a full new ordering, so add:

- `categories.setOrder({ orderedIds: v.array(v.id('categories')) })` → reassigns `position = index` for each id, after verifying every id belongs to the owner cafe and the set matches the cafe's non-archived categories (reject if ids are missing/foreign, to avoid partial reorders). Returns `null`.
- Keep the existing `reorder` mutation (still covered by tests; harmless). The Categories UI uses `setOrder` only.

No schema changes.

## Page designs

### Items — `src/routes/_pos/menu/index.tsx` (rewrite)

- **PageHeader:** title "Item Menu"; meta "{n} item · {k} stok rendah" (k = count of non-archived items with a low-stock ingredient); action `+ Item` (`Plus` icon, link to `/menu/items/$itemId` params `{ itemId: 'new' }`).
- **Toolbar:** `search` (placeholder "Cari item…"); trailing `children` = a category `<Select>` ("Semua kategori" + each category, each showing its item count); filter chips `Aktif` / `Arsip`.
- **Data:** `useQuery(api.menu.items.list, { includeArchived, includeInactive: true })` — fetch inactive too so the Aktif view can show Nonaktif items; archived gated by the chip. Client-side filter by selected category + search. (Mirrors the Stock page's "fetch broad, filter client-side" approach so counts/filters stay correct.) Categories via `api.menu.categories.list`.
- **DataTable columns:**
  - **Nama** — `<Link>` to the edit page; low-stock items get an aria-hidden `⚠` prefix. Sortable.
  - **Kategori** — category name (lookup), muted. Not sortable (keep it simple — only Nama and Harga sort).
  - **Harga** — `formatIDR`, tabular-nums, right-aligned. Sortable.
  - **Resep** — `StatusBadge`: `Ada` (success) when `hasRecipe`, `Belum` (muted) otherwise. Not sortable.
  - **Status** — `StatusBadge`: `Aktif` (success) / `Nonaktif` (muted) / `Arsip` (muted). Not sortable.
  - **actions** — `RowActions`, not sortable.
  - `getRowClassName`: low-stock non-archived rows tinted `bg-destructive/10`.
  - `initialSort`: `[{ id: 'name', desc: false }]`.
- **`⋯` actions:** `Aktifkan` or `Nonaktifkan` (toggles via `api.menu.items.setActive`, label depends on current `isActive`) · separator · `Arsipkan` (destructive → `ConfirmDialog`, calls `api.menu.items.archive`). Each fires a success/error toast.
- Remove the bespoke left sidebar and `FilterButton`.

### Kategori — `src/routes/_pos/menu/categories.tsx` + `src/components/menu/category-table.tsx` (rewrite the table component)

- **PageHeader:** title "Kategori"; description "Kategori muncul sebagai filter di daftar Items dan di layar kasir."; action `+ Tambah Kategori` → opens `CategoryFormDialog` in create mode.
- **Filter chips:** `Aktif` / `Arsip` (uses `categories.list` `includeArchived`).
- **ReorderableTable** (only in the Aktif view; the Arsip view uses a plain non-draggable list/`DataTable` since reordering archived categories is meaningless):
  - columns: **Nama**, **Item** (count of items whose `categoryId` === this category, from `items.list`), **Status** (`Aktif` success — in the archived view, `Arsip` muted).
  - `getRowId` = category `_id`; `onReorder(orderedIds)` → `api.menu.categories.setOrder({ orderedIds })`, with an error toast on failure (the live query re-snaps order on success).
  - Drag is the only ordering mechanism; no column sort.
- **`⋯` actions:** `Ubah nama` → `CategoryFormDialog` in rename mode · separator · `Arsipkan` (destructive → `ConfirmDialog`, `api.menu.categories.archive`). Toasts.
- **New component `src/components/menu/category-form-dialog.tsx`:** a `Dialog` with a single name field, used for both create (`api.menu.categories.create`) and rename (`api.menu.categories.update`). Mirrors `IngredientForm`'s structure (submit/pending/error + success toast). Replaces the old inline create form and inline-cell edit.
- The existing `src/components/menu/confirm-archive.tsx` is **not** used here anymore (replaced by the kit `ConfirmDialog`); leave the file as-is for any other consumers.

### Modifier groups — `src/routes/_pos/menu/modifiers.tsx` (rewrite)

- **PageHeader:** title "Grup Modifier"; description "Dipakai ulang di banyak item, ubah di satu tempat."; action `+ Grup baru` (link to `/menu/modifiers/$groupId` params `{ groupId: 'new' }`).
- **Filter chips:** `Aktif` / `Arsip` (`modifierGroups.list` supports `includeArchived`).
- **DataTable columns:**
  - **Nama** — `<Link>` to `/menu/modifiers/$groupId`. Sortable.
  - **Tipe** — `StatusBadge`: `Wajib` (success) when `required`, `Opsional` (muted) otherwise. Not sortable.
  - **Aturan** — `{minSelect}–{maxSelect}`, tabular-nums. Not sortable.
  - **Opsi** — `options.length`, tabular-nums. Sortable.
  - **Status** — `Aktif` (success) / `Arsip` (muted). Not sortable.
  - **actions** — `RowActions`.
  - `initialSort`: `[{ id: 'name', desc: false }]`.
- **`⋯` actions:** `Ubah grup` (link/navigate to the edit page) · separator · `Arsipkan` (destructive → `ConfirmDialog`, `api.menu.modifierGroups.archive`). Toasts.

## Data flow

Unchanged philosophy: pages keep `useQuery` (value is `undefined` while loading) and pass it straight into `DataTable`/`ReorderableTable`. Mutations run from event handlers / `⋯` items / dialog submits wrapped in `try/catch` firing toasts; destructive actions gated behind `ConfirmDialog`. Drag-reorder calls `setOrder` optimistically; the live Convex query re-renders with the persisted order (and an error toast on failure).

## i18n

All new UI strings use Lingui `msg`/`<Trans>` (source locale Indonesian). After implementation run `pnpm lingui:extract`, fill the `en` translations, then `pnpm lingui:compile`. Receipt content remains out of the catalog (unaffected).

## Testing

- **Vitest / Convex tests (edge-runtime):**
  - `convex/menu/itemStock.ts` `itemRecipeStatus`: returns `hasRecipe=false` with empty low-stock when no recipe; `hasRecipe=true` and the correct low-stock names when ingredients are below threshold; ignores archived/foreign ingredients.
  - `menu.items.list`: returned rows carry `hasRecipe` and `lowStockIngredientNames`; archived/inactive inclusion still honored.
  - `menu.categories.setOrder`: reassigns positions to match `orderedIds`; rejects when ids don't match the cafe's category set.
- **Playwright smoke (auth-gated, extend `tests/e2e/menu.spec.ts`):** Items list renders with the Resep column and the category dropdown filter; toggling Nonaktif via `⋯` shows a toast; Modifiers list renders with the Arsip filter; Categories renders, rename via `⋯` works, and a drag-reorder persists (or, if drag is hard to drive in Playwright, assert the table renders + rename works and cover `setOrder` via the Convex test).
- Gate before push: `pnpm typecheck && pnpm test && pnpm lingui:compile` locally. Commit tracked Convex `_generated` files if codegen changes anything (no schema change expected).

## Affected / new files (anticipated)

**New**
- `src/components/ui/reorderable-table.tsx`
- `src/components/menu/category-form-dialog.tsx`
- `convex/menu/itemStock.ts`
- Convex tests for `itemStock` / `items.list` enrichment / `categories.setOrder`; Playwright additions in `tests/e2e/menu.spec.ts`.

**Modified**
- `convex/menu/items.ts` (`list` enrichment; `listForSale` uses the shared helper)
- `convex/menu/categories.ts` (add `setOrder`)
- `src/routes/_pos/menu/index.tsx` (Items rewrite)
- `src/routes/_pos/menu/categories.tsx` (PageHeader + dialog wiring)
- `src/components/menu/category-table.tsx` (rewrite onto ReorderableTable; keep the filename and the `CategoryTable` export so `categories.tsx`'s import is unchanged)
- `src/routes/_pos/menu/modifiers.tsx` (Modifiers rewrite)
- `package.json` / lockfile (dnd-kit)
- Lingui catalogs (extract + en fills)

## Out of scope

- Editing the detail/edit pages themselves (`items.$itemId`, `modifiers.$groupId`).
- Bulk actions; unarchive/restore flows (archived views are read-only).
- Recipes standalone page, Inventory adjustments page, Purchases, Promotions (later sub-projects 2–5).
- Item-level drag reorder (items keep their existing position/up-down semantics untouched; only categories get drag here).
