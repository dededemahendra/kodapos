# Catalog UI Kit — Foundation (Sub-project 0)

**Date:** 2026-05-31
**Status:** Approved design, ready for implementation plan
**Branch (suggested):** `feat/catalog-ui-kit`

## Context

The "Catalog" section of kodapos (Menu, Recipes, Inventory, Promotions) is a
mix of complete pages, backend-ready stubs, and net-new features. The user
wants the whole section built out and the existing pages made "proper and
professional," where professional means four things at once: **visual polish &
consistency, feature completeness, data density & workflow, and trust &
safety.**

The whole effort is too large for one spec, so it is decomposed into
independent sub-projects, each with its own spec → plan → build cycle:

0. **Foundation — shared Catalog UI kit** ← *this spec*
1. Menu polish (apply kit + surface recipe/stock status on item list)
2. Inventory polish + Adjustments page (backend already exists via `ingredients.adjustStock`)
3. Recipes standalone page
4. Purchases (net-new backend: schema + functions + page)
5. Promotions (net-new backend, largest: rules + cashier integration)

Today every page is hand-rolled (custom `FilterButton`/`FilterChip`, ad-hoc
headers, bare `ui/table`, spinner-only loading, inline-text feedback). The
fastest path to a consistent, professional section is to establish a shared UI
kit first, then snap every other sub-project onto it.

## Goal

Build one coherent set of reusable building blocks so every Catalog page (and
later, Reports) looks and behaves identically. Prove the kit by migrating a
single existing page onto it.

## Decisions (from brainstorming)

- **Page scaffold:** Hybrid direction — a clear page header (title + meta +
  primary action), a dedicated toolbar row (search + filter chips), and a
  medium-density, card-wrapped table with row highlighting for warnings (e.g.
  low stock).
- **Row actions:** `⋯` overflow menu (not inline text buttons), with
  destructive actions visually separated and tinted.
- **States package:** Full polish — skeleton loaders while loading, toast
  notifications for every success/error, confirm dialogs for all destructive
  actions.
- **Table engine:** `@tanstack/react-table` (headless) — sorting, column
  filtering, column model available now and future-proof. Pagination supported
  by the engine but not enabled (cafe-scale data is dozens of rows).
- **Toast library:** `sonner` (shadcn standard).
- **Kit home:** `src/components/ui/` (alongside existing shadcn primitives).
- **Reference migration:** Inventory › Stock (`src/routes/_pos/inventory/index.tsx`).

## New dependencies

- `@tanstack/react-table`
- `sonner`

## Components

Each component is single-purpose, built on existing `ui/` primitives
(`table`, `dropdown-menu`, `alert-dialog`, `skeleton`, `empty`, `input`,
`button`, `badge`), and independently testable.

| Component | File | Responsibility | Key props / API |
|---|---|---|---|
| **PageHeader** | `src/components/ui/page-header.tsx` | Title + optional description + meta line + primary-action slot. Top of every page. | `title`, `description?`, `meta?`, `actions?: ReactNode` |
| **Toolbar** | `src/components/ui/toolbar.tsx` | Search input + filter chips row + trailing slot. | `search: string`, `onSearch(v)`, `searchPlaceholder?`, `filters: {label, value, count?}[]`, `active: string`, `onFilter(value)`, `children?` |
| **DataTable** | `src/components/ui/data-table.tsx` | Generic `@tanstack/react-table` wrapper. Sortable headers (chevron indicator), skeleton loading, empty state, consistent styling, optional per-row className. | `columns: ColumnDef<T>[]`, `data: T[] \| undefined`, `emptyState: ReactNode`, `getRowClassName?(row): string`, `initialSort?` |
| **StatusBadge** | `src/components/ui/status-badge.tsx` | Dot + label pill with semantic variants. | `variant: 'success' \| 'warn' \| 'danger' \| 'muted'`, `children` |
| **RowActions** | `src/components/ui/row-actions.tsx` | The `⋯` dropdown used inside a table cell. Destructive items tinted + separated. | `items: {label, onSelect, icon?, destructive?, separatorBefore?}[]` |
| **ConfirmDialog** | `src/components/ui/confirm-dialog.tsx` | Destructive-action confirmation wrapping `alert-dialog`; manages async + pending state. | `open`, `onOpenChange`, `title`, `description?`, `confirmLabel`, `destructive?`, `onConfirm(): Promise<void>` |
| **Toaster** | `src/components/ui/sonner.tsx` | shadcn `sonner` Toaster, themed; mounted once in the POS layout. | — |
| **toast helper** | `src/lib/toast.ts` | Thin re-export of `toast` from `sonner` for a single import site. | `toast.success/error/...` |

### DataTable details

- Uses `useReactTable` with `getCoreRowModel` and `getSortedRowModel`.
- `data === undefined` → render N skeleton rows (N ≈ visible-row default, e.g.
  6) matching the column count, using existing `ui/skeleton`.
- `data.length === 0` (and not loading) → render the passed `emptyState`
  (built with existing `ui/empty`).
- Otherwise render sortable rows. Sortable column headers are buttons with an
  up/down chevron reflecting `column.getIsSorted()`.
- `getRowClassName(row)` lets a page tint rows (e.g. low-stock amber row in
  Stock).
- Column cells may render any ReactNode (StatusBadge, RowActions, formatted
  numbers), so custom cells stay flexible.

### Toast integration

- `<Toaster />` mounted once in `src/routes/_pos.tsx` (the POS layout), themed
  to match the dark UI.
- Mutations call `toast.success(...)` / `toast.error(...)` in their
  `try/catch`. This replaces ad-hoc inline "Tersimpan" text on migrated pages.

## Data flow

Unchanged philosophy. Pages keep `useQuery(...)`; the returned value (which is
`undefined` while loading) is passed straight into `DataTable`, which owns the
loading/empty/data rendering. Mutations are called from event handlers wrapped
in `try/catch` that fire toasts. Destructive mutations are gated behind
`ConfirmDialog`. No new state-management layer is introduced.

## Reference migration: Inventory › Stock

Rebuild `src/routes/_pos/inventory/index.tsx` on the kit to validate it and
establish the canonical page pattern. This page exercises every component:

- **PageHeader**: title "Stok Bahan", meta "{n} bahan · {k} stok rendah",
  primary action "+ Tambah Bahan".
- **Toolbar**: search by name; filter chips Semua / Stok rendah / Arsip with
  counts.
- **DataTable**: columns Bahan, Stok, Ambang, Biaya/satuan, Status, actions;
  sortable; `getRowClassName` highlights low-stock rows; tabular-nums for
  numeric columns.
- **StatusBadge**: Aktif (success) / Rendah (warn) / Arsip (muted).
- **RowActions** (`⋯`): Catat stok masuk · Ubah bahan · Lihat riwayat · —
  · Arsipkan (destructive).
- **ConfirmDialog**: on Arsipkan.
- **Toasts**: on create/update/adjust/archive success and on error.

The existing bespoke `FilterChip` and hand-rolled header markup on this page
are removed in favor of the kit. The `IngredientForm` and `StockAdjustDialog`
dialogs are reused as-is (only their success paths gain toasts).

> Note: "Lihat riwayat" (movement history) is wired as a menu item but its
> destination view is part of sub-project 2 (Inventory polish). In this
> sub-project it may be a no-op/placeholder handler so the menu shape is final.

## i18n

All new UI strings use Lingui `msg`/`<Trans>`. After implementation, run
`pnpm lingui:extract`, fill the `en` translations (not just compile), then
`pnpm lingui:compile`. Receipt content remains out of the i18n catalog
(unaffected here).

## Testing

- **Vitest**
  - DataTable: renders skeleton when `data === undefined`; renders empty state
    when `data.length === 0`; renders rows for data; sort toggle reorders rows.
  - StatusBadge: each variant renders its dot/label.
- **Playwright smoke**: Stock page loads, sort a column, open the `⋯` menu,
  open then cancel an archive confirm, observe a success toast on an action.
- Run `pnpm typecheck && pnpm test && pnpm lingui:compile` locally before any
  push (per project workflow). Commit the tracked Convex `_generated` files if
  codegen changes anything (no schema change expected in this sub-project).

## Out of scope (later sub-projects)

- Migrating the remaining pages (Menu items/categories/modifiers, Waste,
  Purchases) onto the kit — sub-projects 1–2.
- The movement-history view behind "Lihat riwayat" — sub-project 2.
- New Adjustments / Purchases / Recipes / Promotions features — sub-projects
  2–5.
- Table pagination (engine supports it; enable only if data grows).

## Affected / new files (anticipated)

**New**
- `src/components/ui/page-header.tsx`
- `src/components/ui/toolbar.tsx`
- `src/components/ui/data-table.tsx`
- `src/components/ui/status-badge.tsx`
- `src/components/ui/row-actions.tsx`
- `src/components/ui/confirm-dialog.tsx`
- `src/components/ui/sonner.tsx`
- `src/lib/toast.ts`
- Vitest specs for DataTable + StatusBadge; Playwright spec for Stock.

**Modified**
- `src/routes/_pos.tsx` (mount `<Toaster/>`)
- `src/routes/_pos/inventory/index.tsx` (reference migration)
- `package.json` / lockfile (new deps)
- Lingui catalogs (extract + en fills)
