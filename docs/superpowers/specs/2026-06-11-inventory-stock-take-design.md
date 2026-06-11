# Inventory Stock Take (Bulk Recount) Design Spec

**Date:** 2026-06-11
**Branch:** `feat/inventory-stock-take` (off `main`)

## Context

Stock is corrected today one ingredient at a time via `StockAdjustDialog` →
`ingredients.adjustStock` (computes `delta = newQty − currentStockQty`, inserts a single
`adjustment` `inventoryMovement` with a `reasonLabel`). A periodic physical count
("stok opname") means re-counting *every* ingredient — doing that through the one-at-a-time
dialog is tedious and error-prone. This slice adds a **bulk recount**: one form listing
all active ingredients with their system quantity and a "counted" input, committing all
changes in a single batched mutation.

The `Stok opname` reason label already exists in `ADJUST_REASONS`
(`src/components/inventory/adjust-reasons.ts`) — bulk recounts are tagged with it, so
they show up in the existing `/inventory/adjustments` log exactly like single adjustments.

## Decisions (from brainstorming)

1. One **batched mutation** `ingredients.performStockTake` that takes an array of
   `{ ingredientId, countedQty }` and inserts one `adjustment` movement per ingredient
   **whose count differs** from current stock (unchanged rows write nothing). Reuses the
   event-sourced model — no new table, no stored counter.
2. Reason label is fixed to `'Stok opname'` for every movement the stock take writes
   (so the audit trail reads consistently); an optional free-text `note` applies to all
   rows in the session.
3. Frontend is a **dialog** opened from a "Stok opname" button in the stock page header
   (next to "Tambah Bahan"), listing the **active, non-archived** ingredients (the same
   set the stock list shows), each with system qty + a counted-qty input prefilled to the
   system qty. A live "{n} bahan akan disesuaikan" count shows how many rows differ.
4. Concurrency is accepted as-is: the mutation recomputes each ingredient's current stock
   server-side at commit time and diffs against the **submitted counted qty** (not the
   qty shown when the dialog opened), so a sale landing mid-count still produces a correct
   absolute-count adjustment. (A physical count is an absolute truth; we set stock to the
   counted number regardless of interim movements.)

## Data model

**No schema change.** Reuses `inventoryMovements` with `reason: 'adjustment'`,
`reasonLabel: 'Stok opname'`, and optional `note`. Stock is summed from movements as today
(`convex/lib/inventory.ts` `currentStockQty`).

## Backend — `convex/ingredients.ts`

New mutation `performStockTake`:

```ts
export const performStockTake = mutation({
  args: {
    counts: v.array(
      v.object({ ingredientId: v.id('ingredients'), countedQty: v.number() })
    ),
    note: v.optional(v.string()),
  },
  returns: v.object({ adjusted: v.number() }),
  handler: async (ctx, { counts, note }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    // Validate every count first (all-or-nothing on bad input).
    for (const c of counts) {
      if (!Number.isInteger(c.countedQty) || c.countedQty < 0) {
        throw new Error('Stok harus berupa angka bulat ≥ 0.');
      }
    }
    const trimmedNote = note?.trim();
    let adjusted = 0;
    for (const c of counts) {
      await requireOwned(ctx, cafeId, c.ingredientId, 'Bahan');
      const current = await currentStockQty(ctx, cafeId, c.ingredientId);
      const delta = c.countedQty - current;
      if (delta === 0) continue;
      await ctx.db.insert('inventoryMovements', {
        cafeId,
        ingredientId: c.ingredientId,
        delta,
        reason: 'adjustment',
        reasonLabel: 'Stok opname',
        ...(trimmedNote ? { note: trimmedNote } : {}),
        at: Date.now(),
      });
      adjusted += 1;
    }
    return { adjusted };
  },
});
```

Notes:
- Mutations are transactional in Convex, so the whole batch commits atomically — a bad
  qty (caught in the pre-validation loop) aborts the entire stock take with nothing
  written.
- `requireOwned` per id guards against a foreign/stale ingredient id in the payload.
- Empty `counts` → `{ adjusted: 0 }`, no writes (harmless).

`performStockTake` is a new export in the already-registered `convex/ingredients.ts`
module → **no `api.d.ts` change, no codegen.**

## Frontend

### New component — `src/components/inventory/stock-take-dialog.tsx`

A dialog (mirroring `StockAdjustDialog`'s structure: `Dialog`/`DialogContent`/`DialogHeader`/
`DialogFooter`, `useMutation`, `toast`, `Spinner`, error handling):

- Props: `{ open: boolean; ingredients: Ingredient[] | undefined; onOpenChange: (open: boolean) => void }`
  where `Ingredient = Doc<'ingredients'> & { currentStockQty: number }` (the same row type
  the stock page already has). The parent passes the **active** ingredients it already
  fetched (no second query).
- On open, seed a local `Record<ingredientId, string>` of counted-qty inputs, each
  prefilled to `String(currentStockQty)`. Reset on open (mirror `StockAdjustDialog`'s
  `useEffect`).
- Body: a scrollable list/table — one row per active ingredient: name, system qty
  (`{currentStockQty} {unit}`, muted), and a numeric `Input` (`type="number" min=0 step=1`)
  for the counted qty. Plus one optional `note` Input applied to the whole session.
- A live footer/summary: count of rows where `parseInt(input) !== currentStockQty` →
  "{n} bahan akan disesuaikan" (0 → the submit button is disabled / a no-op).
- Submit: build `counts` = every row mapped to `{ ingredientId, countedQty: parseInt||0 }`
  (send all; the server skips unchanged). `await performStockTake({ counts, note? })`,
  then `toast.success(t\`Stok opname selesai · {adjusted} bahan disesuaikan.\`)` using the
  returned `adjusted`, and close. Disable the submit button while submitting (`Spinner`).
- Empty ingredient list → a short "Belum ada bahan untuk dihitung." message, submit hidden.

> Performance: typical café has tens of ingredients; rendering them all in one dialog is
> fine. No pagination. Inputs are uncontrolled-ish via the local record (same approach as
> existing multi-line forms like purchases).

### Stock page — `src/routes/_pos/inventory/index.tsx`

- Add a secondary header action **"Stok opname"** (button, `variant="outline"`, a
  `ClipboardList`/`ClipboardCheck` lucide icon) beside the existing "Tambah Bahan" button
  (wrap both in the `actions` slot).
- Add `const [takeOpen, setTakeOpen] = useState(false)`.
- Render `<StockTakeDialog open={takeOpen} ingredients={activeIngredients} onOpenChange={setTakeOpen} />`,
  where `activeIngredients` is the non-archived subset already derivable from the fetched
  `ingredients` (e.g. `useMemo(() => ingredients?.filter((r) => !r.archived), [ingredients])`).
  After a successful stock take, the `ingredients` query is reactive and refreshes the
  table automatically — no manual refetch.

No change to columns, filters, the `StockSummary` tiles, the existing adjust dialog, or
the `PageHeader` meta.

## Testing

**`tests/convex/ingredients.test.ts`** (extend; mirror the existing `adjustStock` tests):

- `performStockTake` writes one `adjustment` movement per **changed** ingredient and skips
  unchanged ones → seed 3 ingredients (set stock via existing adjust/movement), submit a
  mix of changed+unchanged counts, assert `{ adjusted }` equals the number changed and that
  each changed ingredient's `currentStockQty` (via `ingredients.list`/`get`) equals its
  counted qty.
- Every written movement has `reason: 'adjustment'` and `reasonLabel: 'Stok opname'`
  (assert via `ingredients.recentAdjustments` or a direct `t.run` movement query) — so it
  appears in the adjustments log.
- Rejects a non-integer / negative `countedQty` (whole batch throws, nothing written —
  assert stock unchanged afterward).
- Owner-scoped: a foreign `ingredientId` (other cafe) throws via `requireOwned`.
- Empty `counts` → `{ adjusted: 0 }`.

Frontend (dialog render, live diff count, submit) validated by typecheck + the existing
inventory e2e flow.

## i18n

New Bahasa Indonesia strings: `Stok opname`, `Hitung fisik`, `Sistem`,
`{n} bahan akan disesuaikan`, `Stok opname selesai · {adjusted} bahan disesuaikan.`,
`Belum ada bahan untuk dihitung.`, `Catatan (opsional)` (may already exist). Run
`pnpm lingui:extract`, fill `en` (`Stock take`, `Counted`, `System`,
`{n} items will be adjusted`, `Stock take done · {adjusted} items adjusted.`,
`No ingredients to count yet.`), then `pnpm lingui:compile`. (`Stok opname` already exists
as an adjust reason → reuse its `en`.)

## Conventions

- Run CI locally before push: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`;
  confirm `git status` clean before push.
- Do NOT run `convex codegen` — `performStockTake` is a new export in the already-registered
  `ingredients` module (no `api.d.ts` change).
- No new route → no `src/routeTree.gen.ts` change.
- Small conventional commits; PR → review → merge commit.

## Out of scope

- A dedicated stock-take *route*/page (dialog is enough at café ingredient counts).
- Stock-freeze/snapshot/lock during counting (we accept interim movements; the count is
  treated as absolute truth at commit time).
- Partial/blind counts, count sessions/history beyond the adjustments log, variance
  valuation report, CSV import of counts, scanning.
- Expiry/FIFO/batch tracking.
