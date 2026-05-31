# Catalog UI Kit — Inventory: Movement history + Waste polish (Sub-project 2, partial)

**Date:** 2026-05-31
**Status:** Approved design, ready for implementation plan
**Branch (suggested):** `feat/inventory-history` (off `main`; the kit foundation + Menu polish are merged)
**Depends on:** Catalog UI kit foundation (PageHeader, DataTable, StatusBadge, RowActions, Toaster/toast, Empty, Sheet) — merged in PR #14.

## Context

Sub-project 0 polished Inventory › Stock onto the kit but left **"Lihat riwayat"** in the row `⋯` menu as a no-op placeholder (its destination was deferred to this slice). The Inventaris section also has a **Limbah** (waste) page at `/inventory/waste` that is still hand-rolled (bespoke `<table>`, spinner-only loading, custom header) — not yet on the kit.

The backend already records every stock change in `inventoryMovements` (`reason` ∈ `sale | adjustment | waste`, a signed `delta`, `at`, optional `note` / `wasteReason` / `costPerUnitIDR`), with indexes `by_cafe_ingredient_at` and `by_cafe_reason_at`. `ingredients.adjustStock` writes `adjustment` rows; `waste.record` writes `waste` rows; sales write `sale` rows. There is **no** query yet that lists a single ingredient's movement timeline.

This slice delivers two pieces (the standalone **Adjustments / Penyesuaian** page is explicitly deferred to a later slice):

1. Per-ingredient **movement history** opened from the Stock `⋯` menu, shown in a side **Sheet**.
2. **Waste page** migrated onto the kit.

## Goal

Let an owner audit how an ingredient's stock changed over time (a timeline with a running balance), and make the Waste log visually consistent with the rest of the Catalog section — both reusing the existing kit, with no new backend tables.

## Decisions (from brainstorming)

- **Scope:** Movement history + Waste polish only. Adjustments page stays a `ComingSoon` stub.
- **History UI:** a side **Sheet/drawer** (existing `ui/sheet`) opened over the Stock page — no new route, glanceable, close to return.
- **History contents:** ALL movements for the ingredient (sale + adjustment + waste) with a running balance.
- **Truncation cap:** show the most recent **100** movements; balances stay correct (computed over the full history before slicing); flag `truncated` so the UI can footnote it.
- **Waste "Alasan":** rendered as a `StatusBadge` (consistent with the history sheet's "Tipe" badge).
- **Immutability:** movement and waste records are an append-only log — no edit/delete; the Waste table has no `⋯`.

## Backend — `ingredients.listMovements`

New query in `convex/ingredients.ts`:

```
listMovements({ ingredientId }) -> {
  rows: Array<{
    id: Id<'inventoryMovements'>,
    at: number,
    delta: number,
    reason: 'sale' | 'adjustment' | 'waste',
    note?: string,
    wasteReason?: 'rusak' | 'basi' | 'tumpah' | 'salah_masak' | 'lainnya',
    balanceAfter: number,
  }>,
  truncated: boolean,
}
```

- Auth + ownership: `requireOwnerCafe` then `requireOwned(ctx, cafeId, ingredientId, 'Bahan')` — cafe-scoped, so no cross-tenant reads.
- Read all movements for the ingredient via `by_cafe_ingredient_at`, **ascending** by `at`; accumulate `balanceAfter` (running sum of `delta`) per row. This makes the oldest row's balance the delta itself and the newest row's balance equal to current stock.
- Return the most recent **100** rows in `at`-**descending** order (reverse the tail of the accumulated list), each carrying its already-correct `balanceAfter`. `truncated = total > 100`.
- A returned `note` is included only when present; `wasteReason` only on waste rows (mirrors how movements are written).

The query is **pure-read** and bounded (one ingredient's history). No new index or schema change is required.

## Components

| Unit | File | Responsibility |
|---|---|---|
| **listMovements** | `convex/ingredients.ts` (new query) | Per-ingredient timeline with running balance + truncation flag. |
| **movement label/variant helper** | `src/lib/inventory-movement.ts` | Pure map from a movement row → `{ label, variant }` for display (Penjualan/muted, Penyesuaian/success, Limbah/danger), plus the waste-reason sub-label. Unit-tested. |
| **MovementHistorySheet** | `src/components/inventory/movement-history-sheet.tsx` | The `ui/sheet`-based drawer: title = ingredient name, a compact timeline table, loading/empty/truncated states. |
| **Stock page wiring** | `src/routes/_pos/inventory/index.tsx` (modify) | Add `historyId` state; the `⋯` "Lihat riwayat" item sets it; mount `MovementHistorySheet`. |
| **Waste page** | `src/routes/_pos/inventory/waste.tsx` (rewrite) | Kit migration: PageHeader + DataTable. |
| **WasteDialog toasts** | `src/components/inventory/waste-dialog.tsx` (modify) | Add success/error toasts on record (keep inline `FieldError`). |

### MovementHistorySheet details

- Controlled: `{ ingredientId: Id<'ingredients'> | null, ingredientName: string, onOpenChange }`. Open when `ingredientId !== null`.
- Queries `api.ingredients.listMovements` with `ingredientId ? { ingredientId } : 'skip'`.
- Header: `<SheetHeader>` with `<SheetTitle>` = `Riwayat — {ingredientName}` (the ingredient name is data, not a translatable string).
- Body: a table with columns **Tanggal** (`formatDate(..., 'day-month')`), **Tipe** (`StatusBadge` via the helper; waste appends its reason), **Perubahan** (`+N` green / `−N` red `{unit}`, tabular-nums), **Saldo** (`balanceAfter` `{unit}`, tabular-nums). The unit comes from the ingredient (passed in or read from the row's ingredient — pass the ingredient's `canonicalUnit` into the sheet alongside the name).
- States: `rows === undefined` → skeleton rows; empty → "Belum ada pergerakan stok."; `truncated` → footnote "Menampilkan 100 pergerakan terbaru."

### Stock page wiring

`src/routes/_pos/inventory/index.tsx` already has the `⋯` menu with a "Lihat riwayat" item whose `onSelect` is currently a no-op. Change it to `setHistoryRow(row.original)` (store the ingredient row so the sheet gets its name + `canonicalUnit`), and mount `<MovementHistorySheet>` driven by that state. No other Stock behavior changes.

### Waste page

Rewrite `/inventory/waste` on the kit (the menu layout for inventory is just `PinGate`, so the page renders its own `<main className="p-6">` like the Stock page does):
- **PageHeader**: title "Limbah", meta "Kerugian 30 hari · {formatIDR(totalLoss)}", action "+ Catat Limbah".
- **DataTable** columns: **Tanggal** (`formatDate 'day-month'`, sortable), **Bahan**, **Jumlah** (`{qtyWasted} {unit}`, tabular-nums), **Alasan** (`StatusBadge` variant `danger`, label via the existing waste-reason map), **Kerugian** (`formatIDR(totalCostIDR)`, tabular-nums, sortable), **Catatan** (muted, `—` when absent). No `⋯` (immutable log). `initialSort` by Tanggal desc — note: `at` is the sortable accessor; show `formatDate` in the cell.
- Empty state via `ui/empty` (keep the `Trash2` icon + existing copy).
- Reuse `WasteDialog`; add `toast.success(t\`Limbah dicatat.\`)` on success and `toast.error(message)` in its catch (it currently only sets `FieldError`).

## i18n

New Indonesian strings use Lingui `msg`/`<Trans>`. After implementation: `pnpm lingui:extract`, fill `en`, `pnpm lingui:compile`. New strings include: "Lihat riwayat" (already exists), "Riwayat", "Belum ada pergerakan stok.", "Menampilkan 100 pergerakan terbaru.", "Penjualan", "Penyesuaian", "Limbah", "Tipe", "Perubahan", "Saldo", "Limbah dicatat.", and the Waste page header/labels (most already exist from the current page).

## Testing

- **Vitest / convex-test** (`tests/convex/ingredients.test.ts` or a new file):
  - `listMovements` accumulates `balanceAfter` correctly across mixed reasons; newest row balance equals current stock; rows are `at`-descending.
  - truncation: >100 movements → `truncated: true`, exactly 100 rows, balances still correct (newest balance = current stock).
  - tenant isolation: another cafe's owner cannot read the ingredient's movements (ownership check throws).
- **Vitest pure** (`src/lib/inventory-movement.test.ts`): the row→`{label, variant}` mapping for each reason (+ waste sub-reason).
- **Playwright smoke** (extend `tests/e2e/inventory.spec.ts`, auth-gated): after recording stock, open the `⋯` → "Lihat riwayat" → assert the Sheet shows a movement row with a balance; visit `/inventory/waste` and assert the kit table renders (or, if driving the sheet is awkward, assert the sheet opens and the convex test covers balances).
- Gate before push: `pnpm typecheck && pnpm test && pnpm lingui:compile` locally. Commit tracked Convex `_generated` files if codegen changes (no schema change expected).

## Affected / new files (anticipated)

**New**
- `convex/ingredients.ts` — `listMovements` query (added to the existing file).
- `src/lib/inventory-movement.ts` + `src/lib/inventory-movement.test.ts`.
- `src/components/inventory/movement-history-sheet.tsx`.
- convex test for `listMovements`; Playwright additions.

**Modified**
- `src/routes/_pos/inventory/index.tsx` (wire "Lihat riwayat" → sheet).
- `src/routes/_pos/inventory/waste.tsx` (kit rewrite).
- `src/components/inventory/waste-dialog.tsx` (toasts).
- Lingui catalogs.

## Out of scope

- The **Adjustments / Penyesuaian** page (`/inventory/adjustments` stays `ComingSoon`) — a later slice.
- Purchases (sub-project 4), Promotions (sub-project 5).
- Editing/deleting movement or waste records (append-only log).
- A global cross-ingredient movements log (the history is per-ingredient; the global adjustment log belongs to the deferred Adjustments page).
- The optional "archived views strictly read-only" follow-up from PR #14.
