# Waste Tracking — Design Spec

**Date:** 2026-05-29
**Slice:** Waste Tracking (first of the "build now" set)
**Branch:** `feat/waste-tracking`

## Problem

Waste is already being recorded today — but incorrectly. `StockAdjustDialog`
("Catat Stok") offers a "Limbah" reason, yet it writes
`inventoryMovements.reason: 'adjustment'` with the word "Limbah" buried in a
free-text `note`. Consequences:

- Waste is conflated with stock-opname and corrections — it cannot be measured
  separately.
- `reason: 'waste'` — the value the schema deliberately reserved for COGS — is
  never written.
- There is no way to answer "how much money did we lose to waste this week?"

## Goal

Make waste a first-class, separately-measurable event with **immutable COGS
accuracy**:

- Record waste as `reason: 'waste'` with a snapshot of cost-per-unit at the
  moment of waste (so later cost edits never rewrite history).
- Capture a structured waste **reason category** for future reporting.
- Show a waste **log** with a period rupiah-lost total.

Out of scope for this slice: a dedicated waste analytics dashboard (by
ingredient / trend over time) and wiring into the `reports/` section. That is a
later slice.

## Decisions (from brainstorming)

| Decision | Choice |
| --- | --- |
| Depth | COGS accuracy: `reason:'waste'` + cost snapshot + waste log w/ period total |
| Reason capture | Structured enum + optional free-text note |
| Access | Owner-only (`requireOwnerCafe`), consistent with other inventory actions |
| Location | Dedicated `/inventory/waste` page: "Catat Limbah" action + log |
| Input model | "Quantity wasted" (how much was lost), not "new total" |
| Cost storage | **Approach A** — extend `inventoryMovements` with optional fields |

### Approach A vs. alternatives

- **A (chosen):** add optional `costPerUnitIDR` + `wasteReason` to
  `inventoryMovements`. One row per waste event. Smallest change, stays
  event-sourced, matches the existing `recipeSnapshot` snapshot philosophy.
- **B (rejected):** separate `wasteEvents` table + a movement row. Dual-write,
  two sources of truth, over-engineered at counter-cafe scale.
- **C (rejected):** no cost snapshot, compute rupiah lost from current cost at
  read-time. Not immutable — contradicts the COGS goal.

## Data model — `convex/schema.ts`

Extend `inventoryMovements`:

```ts
// new optional fields (waste-only; undefined for sale/adjustment rows)
wasteReason: v.optional(
  v.union(
    v.literal('rusak'),
    v.literal('basi'),
    v.literal('tumpah'),
    v.literal('salah_masak'),
    v.literal('lainnya'),
  ),
),
costPerUnitIDR: v.optional(v.number()), // snapshot of ingredient.lastCostPerUnitIDR at waste time

// new index for the waste log + period total
.index('by_cafe_reason_at', ['cafeId', 'reason', 'at'])
```

`reason: 'waste'` already exists in the union. A waste record is a single row:
`{ reason:'waste', delta: -qtyWasted, costPerUnitIDR, wasteReason, note?, at }`.

Stock remains event-sourced (`currentStockQty` = sum of deltas); no stored
counter. Existing rows are untouched (new fields are optional).

## Backend — new `convex/waste.ts`

Keeps `ingredients.ts` focused; mirrors its auth + validation style.

### `record` mutation

- **args:** `{ ingredientId, qtyWasted: number, wasteReason: <enum>, note?: string }`
- **returns:** `v.id('inventoryMovements')`
- **logic:**
  1. `const { cafeId } = await requireOwnerCafe(ctx)`
  2. `const ing = await requireOwned(ctx, cafeId, ingredientId, 'Bahan')`
  3. Validate `qtyWasted` is an integer ≥ 1 → else
     `"Jumlah limbah harus bilangan bulat ≥ 1."`
  4. Compute `current = await currentStockQty(ctx, cafeId, ingredientId)`;
     reject `qtyWasted > current` →
     `"Jumlah limbah melebihi stok saat ini."` (keeps on-hand ≥ 0)
  5. Snapshot `costPerUnitIDR = ing.lastCostPerUnitIDR`
  6. Insert one `inventoryMovements` row:
     `{ cafeId, ingredientId, delta: -qtyWasted, reason: 'waste', costPerUnitIDR, wasteReason, note: trimmed-or-omitted, at: Date.now() }`

### `recent` query

- **args:** `{ days?: number }` (default 30)
- **returns:** array of enriched rows, newest-first:
  `{ id, at, ingredientName, unit, qtyWasted, wasteReason, note?, costPerUnitIDR, totalCostIDR }`
  where `qtyWasted = -delta`, `totalCostIDR = qtyWasted * costPerUnitIDR`
- **logic:** read via `by_cafe_reason_at`
  (`eq cafeId`, `eq reason 'waste'`, `gte at cutoff`), join ingredient name/unit
  (cache lookups by id), sort by `at` desc.

The page derives the period total by summing `totalCostIDR` (counter-scale,
cheap; no separate aggregate query).

## Frontend

### `src/routes/_pos/inventory/waste.tsx` (replace `ComingSoon` stub)

- Header + **"Catat Limbah"** button (opens dialog)
- Period total card: *"Kerugian limbah (30 hari): Rp X"*
- Log table: Tanggal · Bahan · Jumlah · Alasan · Kerugian (Rp) · Catatan
- Loading + empty states, mirroring `inventory/index.tsx`

### `src/components/inventory/waste-dialog.tsx` (new)

Mirrors `StockAdjustDialog` structure (Dialog, Field, Select, Spinner, error
handling):

- Ingredient picker — `Select` over `api.ingredients.list` (active only); shows
  current stock + unit for the selected ingredient
- `qtyWasted` number input (`min=1 step=1`), unit shown
- Reason `Select` — 5 categories, labels keyed by raw enum value (same i18n
  trick as the adjust dialog so the `value` prop stays untranslated)
- Optional note (`maxLength=200`)
- Live **"Perkiraan kerugian: Rp …"** preview = `qtyWasted * lastCostPerUnitIDR`
- Submit → `api.waste.record`

## Cleanup (in scope)

Remove `'Limbah'` from `StockAdjustDialog`'s `REASONS` array (leaving
`'Pengiriman masuk'`, `'Stok opname'`, `'Koreksi'`). This removes the old
mis-categorized path so waste has exactly one correct home.

## i18n

New `Trans`/`msg` strings for the page + dialog, plus reason labels:

| enum value | id | en |
| --- | --- | --- |
| `rusak` | Rusak | Damaged |
| `basi` | Basi/Kedaluwarsa | Spoiled/Expired |
| `tumpah` | Tumpah | Spilled |
| `salah_masak` | Salah masak | Mis-cooked |
| `lainnya` | Lainnya | Other |

Run `pnpm lingui:extract`, fill in the `en` catalog.

## Error handling

- All mutation validation errors are thrown as Indonesian `Error` messages
  (matches `ingredients.ts` convention); the dialog surfaces `err.message`.
- Cross-cafe / missing ingredient → `requireOwned` throws.
- Concurrent waste vs. stock: the `qtyWasted > current` check runs inside the
  mutation transaction, so on-hand cannot go negative.

## Testing — `tests/convex/waste.test.ts`

1. `record` writes one `reason:'waste'` row with negative `delta`,
   `wasteReason`, and `costPerUnitIDR` snapshot.
2. Recording waste lowers `currentStockQty` by `qtyWasted`.
3. **Cost snapshot is immutable** — after `record`, editing the ingredient's
   `lastCostPerUnitIDR` does NOT change the recorded row's `totalCostIDR` via
   `recent`.
4. Validation: rejects `qtyWasted` ≤ 0 / non-integer; rejects
   `qtyWasted > currentStockQty`; rejects an ingredient from another cafe.
5. `recent` returns period rows newest-first with correct `totalCostIDR`,
   scoped to the cafe, respecting the `days` window.

## Verification before done (local CI)

`pnpm typecheck` · `pnpm test` · `pnpm lingui:compile` — all green before push.

## Files touched

- `convex/schema.ts` — extend `inventoryMovements` + index
- `convex/waste.ts` — new module (`record`, `recent`)
- `src/routes/_pos/inventory/waste.tsx` — real page (replaces stub)
- `src/components/inventory/waste-dialog.tsx` — new
- `src/components/inventory/stock-adjust-dialog.tsx` — drop 'Limbah' reason
- `src/locales/{id,en}/messages.po` — extracted strings
- `tests/convex/waste.test.ts` — new
- `convex/_generated/*` — regenerated (the repo tracks generated types so CI
  typechecks without a deploy key; the new `waste.ts` module must appear in
  `api.d.ts`)
