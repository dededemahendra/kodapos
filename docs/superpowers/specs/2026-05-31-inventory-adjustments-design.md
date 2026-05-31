# Catalog UI Kit — Inventory: Adjustments page (Sub-project 2, remainder)

**Date:** 2026-05-31
**Status:** Approved design, ready for implementation plan
**Branch (suggested):** `feat/inventory-adjustments` (off `main`)
**Depends on:** Catalog UI kit (PageHeader, Toolbar, DataTable, StatusBadge, Empty, toast — merged), and the existing `IngredientPicker` + `StockAdjustDialog` + `ingredients.adjustStock`.

## Context

The Inventaris section has Stok (✓), Limbah (✓), Penyesuaian, and Pembelian. **Penyesuaian** (`/inventory/adjustments`) is still a `ComingSoon` stub. This slice builds it: a kit-based audit log of stock adjustments across all ingredients, plus a record flow.

Today `ingredients.adjustStock({ ingredientId, newQty, reasonLabel, note? })` writes an `adjustment` movement, **combining** the reason and note into a single `note` field (`"Pengiriman masuk — kirim pagi"` or just `"Pengiriman masuk"`). The reason labels come from a fixed list in `StockAdjustDialog`: `['Pengiriman masuk', 'Stok opname', 'Koreksi']`. There is no query that lists adjustments across ingredients (only the per-ingredient `listMovements` and `waste.recent`).

## Goal

Let an owner see and record stock adjustments from one page — a filterable log (by reason) with Alasan and Catatan as distinct columns — reusing the kit and the existing adjust dialog. This completes the Inventaris polish.

## Decisions (from brainstorming)

- **Store the reason separately:** add an optional `reasonLabel` field to `inventoryMovements`; `adjustStock` writes `reasonLabel` (the reason) and `note` (free text only), stopping the combine. Enables separate Alasan/Catatan columns and a reason filter. Existing combined-note rows keep working (Alasan blank, note shown as Catatan).
- **Reason filter:** chips Semua / Pengiriman masuk / Stok opname / Koreksi, filtered **client-side**.
- **Record flow:** two-step, max reuse — "+ Catat Penyesuaian" opens an ingredient-picker dialog (`IngredientPicker`); selecting an ingredient opens the existing `StockAdjustDialog` for it. No new-ingredient creation from here.
- **Read-only log:** adjustments are append-only — no `⋯`, no edit/delete.

## Schema + backend

### 1. Schema — `inventoryMovements.reasonLabel`

Add `reasonLabel: v.optional(v.string())` to the `inventoryMovements` table in `convex/schema.ts`. Optional, so existing rows validate unchanged; no migration. Run codegen and commit the tracked `_generated` files (schema change → drift expected).

### 2. `adjustStock` — store reason + note separately

Change the insert in `convex/ingredients.ts` `adjustStock`: instead of building a combined `noteText`, write `reasonLabel: args.reasonLabel` and include `note` only when the trimmed free-text note is non-empty:
```
reason: 'adjustment',
reasonLabel: args.reasonLabel,
...(args.note?.trim() ? { note: args.note.trim() } : {}),
```
Args and the `StockAdjustDialog` contract are unchanged. (The movement-history sheet from the prior slice renders type/change/balance only — not the note — so it is unaffected.)

### 3. New query — `ingredients.recentAdjustments({ days? })`

Mirrors `waste.recent`: default 30-day window; query `inventoryMovements` via `by_cafe_reason_at` (`reason === 'adjustment'`, `at > cutoff`), `order('desc')`, join ingredient name + unit (cached per ingredient). Returns:
```
Array<{
  id: Id<'inventoryMovements'>,
  at: number,
  ingredientName: string,
  unit: 'g' | 'ml' | 'piece',
  delta: number,
  reasonLabel?: string,
  note?: string,
}>
```
Cafe-scoped via `requireOwnerCafe`. Reason filtering happens client-side on the page (not a query arg).

## Components

| Unit | File | Responsibility |
|---|---|---|
| **reasonLabel field** | `convex/schema.ts` (modify) | Persist the adjustment reason separately. |
| **adjustStock** | `convex/ingredients.ts` (modify) | Write `reasonLabel` + free-text `note`. |
| **recentAdjustments** | `convex/ingredients.ts` (new query) | Cross-ingredient adjustment log (30d), ingredient join. |
| **Adjustments page** | `src/routes/_pos/inventory/adjustments.tsx` (replace stub) | PageHeader + reason-filter Toolbar + DataTable + record flow. |
| **Pick-ingredient dialog** | inline in the page (or a tiny local component) | Wraps `IngredientPicker`; on select → opens `StockAdjustDialog`. |

### Adjustments page details

- **PageHeader:** title "Penyesuaian Stok"; meta "{n} penyesuaian · 30 hari"; action "+ Catat Penyesuaian".
- **Toolbar:** reason chips Semua / Pengiriman masuk / Stok opname / Koreksi (labels translated via the same map `StockAdjustDialog` uses; counts per chip from the fetched rows). No search box (use the kit Toolbar's now-optional search by omitting `search`/`onSearch`).
- **DataTable columns:**
  - **Tanggal** — `formatDate(..., 'day-month')`, sortable (accessor `at`).
  - **Bahan** — `ingredientName`.
  - **Perubahan** — `+N`/`−N {unit}`, tabular-nums, tinted (`text-primary` for ≥0, `text-destructive` for <0), sortable (accessor `delta`).
  - **Alasan** — `StatusBadge`: `success` when `reasonLabel === 'Pengiriman masuk'` (stock-in), else `muted`; render the translated label; `—` when `reasonLabel` absent (legacy rows).
  - **Catatan** — muted free text; `—` when absent.
  - No actions column.
  - `initialSort`: `[{ id: 'at', desc: true }]`.
- **Empty state** via `ui/empty` (e.g. a `ClipboardList`/`PackagePlus` icon, "Belum ada penyesuaian.").
- **Record flow:** `setPickerOpen(true)` on the action. The picker dialog renders `IngredientPicker`; `onChange(id)` → `setPickerOpen(false)` + `setAdjustId(id)`. `StockAdjustDialog` is mounted with `open={adjustId !== null}` / `ingredientId={adjustId}`; on close, clear `adjustId`. The live `recentAdjustments` query re-renders with the new row after a successful adjust.

## i18n

New strings use Lingui (`<Trans>` / `t`). The reason labels themselves are raw DB values; their translated display reuses the label map pattern from `StockAdjustDialog`. After implementation: `pnpm lingui:extract`, fill `en`, `pnpm lingui:compile`. New strings include: "Penyesuaian Stok", "{n} penyesuaian · 30 hari", "Catat Penyesuaian", "Belum ada penyesuaian.", "Pilih bahan untuk disesuaikan." (picker dialog title), plus column headers already present (Tanggal/Bahan/Catatan) and reason labels (already translated from the dialog).

## Testing

- **Vitest / convex-test** (`tests/convex/ingredients.test.ts`):
  - `adjustStock` now stores `reasonLabel` in its own field and `note` as free text only (update any existing assertion that expected the combined note; add an assertion reading the inserted movement's `reasonLabel`).
  - `recentAdjustments`: returns `adjustment` movements newest-first with ingredient name/unit joined and `reasonLabel`/`note` surfaced; excludes `sale`/`waste` rows; honors the 30-day window; cafe-scoped (another cafe's adjustments are not returned).
- **Playwright** (extend `tests/e2e/inventory.spec.ts`, auth-gated): from `/inventory/adjustments`, click "+ Catat Penyesuaian", pick "Susu", set a new qty, save → assert the "Stok dicatat" toast and that a row appears in the log. If driving both dialogs is awkward, assert the page renders with the reason chips and the record toast.
- Gate before push: `pnpm typecheck && pnpm test && pnpm lingui:compile`. Run `convex codegen` and commit the `_generated` drift from the schema change.

## Affected / new files (anticipated)

**Modified**
- `convex/schema.ts` (add `reasonLabel`), `convex/_generated/*` (codegen).
- `convex/ingredients.ts` (`adjustStock` storage + new `recentAdjustments`).
- `src/routes/_pos/inventory/adjustments.tsx` (replace the `ComingSoon` stub).
- `tests/convex/ingredients.test.ts`, `tests/e2e/inventory.spec.ts`.
- Lingui catalogs.

(Reused unchanged: `IngredientPicker`, `StockAdjustDialog`, kit components.)

## Out of scope

- Editing/deleting adjustments; backfilling `reasonLabel` on legacy rows (they display note-only).
- Creating a new ingredient from the record flow (`onRequestCreate` omitted).
- Purchases (sub-project 4), Promotions (sub-project 5).
- Changes to the movement-history sheet, Stock, or Waste pages.
- The "archived views strictly read-only" follow-up.
