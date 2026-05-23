# Phase 1 · Slice 4 — Inventory + Recipes

**Date:** 2026-05-23
**Status:** Design
**Parent spec:** `docs/superpowers/specs/2026-05-14-kodapos-v1-design.md` §2.2, §2.5, §4.2

## Goal

Turn kodapos from "takes orders" into "tracks ingredient consumption as you sell." Owner builds per-item recipes; cash sales automatically write event-sourced inventory movements; the inventory page surfaces current stock + low-stock highlights; the sale screen warns the cashier when an item's ingredients are running low. The deferred `recipeSnapshot` field from Slice 3 finally lands.

## Scope

**In (MVP+):**

- `ingredients` table — name, canonical unit (`g | ml | piece`), `reorderThreshold`, `lastCostPerUnitIDR`, `archived`.
- `recipes` table — one row per menu item with embedded `lines: [{ ingredientId, qty, wastageFactor }]`.
- `inventoryMovements` table — event-sourced; current stock derived as `Σ delta`.
- `recipeSnapshot` field added to `orders.lines[]` (was deferred in Slice 3).
- `ingredients.list / upsert / archive / adjustStock` + `recipes.upsert / getForItem` + `inventoryMovements` write from `createCashSale`.
- `menu.items.listForSale` gains a `lowStockIngredientNames: string[]` field per row.
- `/inventory` page — searchable ingredient list with current stock, reorder threshold, low-stock highlight, "Tambah Bahan" + per-row edit + "Catat Stok" actions.
- Recipe editor appended inline to `/menu/items/:itemId` edit page — line-by-line, ingredient autocomplete, live cost-per-cup pill.
- `<ItemCard>` on `/sale` shows ⚠ warning border + tooltip when any of its recipe ingredients are below threshold.
- "Catat Stok" modal — owner sets new qty + reason ("Pengiriman masuk" / "Stok opname" / "Limbah" / "Koreksi") + optional note.
- "Inventaris" link added to `<PosNav>` between "Menu" and "Pengaturan".

**Out (deferred):**

- `suppliers` table → V1.1.
- Modifier `recipeAdjustments` (oat-milk swap pattern) → V1.1. Base recipe always applies in Slice 4.
- Inventory snapshot report ("days of cover", trailing 14-day avg consumption) → Slice 6.
- Predictive demand AI + restock suggestions → separate slice / V1.1.
- Inventory deduction for items WITHOUT a recipe — no-op (yellow icon on /sale card NOT in this slice; items without recipes simply don't deduct).
- Onboarding wizard step for inventory — owners add ingredients/recipes lazily after onboarding.
- Receipt-side inventory display (the deduction is audit-only, not customer-visible).
- Bulk import of ingredients (CSV / paste-list) → V1.1.

## Success criteria

1. Owner can add an ingredient on `/inventory` with name, unit (`g`/`ml`/`piece`), reorder threshold, and last cost. Duplicate-name in same cafe is rejected with Bahasa error.
2. Owner can attach a recipe to a menu item via the inline editor on `/menu/items/:itemId` — at least one ingredient line with qty and (default) wastage 1.0. Save commits both item and recipe atomically.
3. Live cost-per-cup pill updates as the owner edits recipe lines. Formula: `Σ qty × wastageFactor × lastCostPerUnitIDR`, rounded to integer rupiah.
4. Cash sale of an item with a recipe writes one `inventoryMovements` row per recipe ingredient with `delta = -(orderLine.qty × recipeLine.qty × wastageFactor)`, `reason: 'sale'`, `refType: 'order'`, `refId: orderId`. Movements live in the SAME mutation as the order/payment insert.
5. Cash sale of an item WITHOUT a recipe writes the order normally and zero movements — no throw.
6. `recipeSnapshot` on each `orders.lines[]` captures `{ ingredientId, qty, wastageFactor }` at sale time. Editing the recipe later does not retroactively alter historical orders.
7. `/inventory` lists ingredients with current stock (derived `Σ delta`), reorder threshold, and last cost. Rows below threshold get a low-stock visual (border tint + ⚠ icon).
8. `<ItemCard>` on `/sale` shows a low-stock warning when any of the item's recipe ingredients are below threshold. Cashier can still tap and sell; the warning is informational.
9. Manual stock adjustment via "Catat Stok" modal writes one `inventoryMovements` row with `delta = newQty - currentQty`, `reason: 'adjustment'`, and the chosen reason as the note. Setting stock to the current value is a no-op (no zero-delta movement is written).
10. Negative stock is allowed (no hard block at sale time). If a cashier sells more than tracked, stock goes negative; owner reconciles via manual adjustment.
11. Tenant isolation: cafe B's owner cannot list, fetch, create, or adjust cafe A's ingredients or recipes; movements respect the same boundary.
12. Idempotency: a duplicate `clientId` call to `createCashSale` does not re-deduct (the existing-order short-circuit covers movements).
13. Convex function tests: ~24 specs (8 ingredients + 6 recipes + 6 orders extensions + 4 listForSale extensions); unit tests: ~4 specs on the cost-per-cup helper.
14. Playwright auth-gated E2E (`tests/e2e/inventory.spec.ts`): signup → add ingredient → add recipe → open shift → sell → verify stock decreased.
15. `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` exit 0.

## Architecture

### Event-sourced stock

Per parent spec §2.5: stock is a derived value, not a stored counter. Every change writes an `inventoryMovements` row; current stock is computed as `Σ delta` over `by_cafe_ingredient`. Rationale:

- Conflict-free for the eventual offline-first sync in Phase 2 (no last-writer-wins on a mutable counter).
- Full audit trail by construction (Slice 6 reports can replay any point in time).
- Negative stock is naturally representable.

Cost: every `currentStockQty(ingredientId)` read scans all movements for that ingredient. For counter-cafe scale (<50 ingredients, <500 movements per ingredient per month), this is fine. Performance optimization (cached counters, periodic snapshots) deferred to V2.

### Inventory and sale in one mutation

`orders.createCashSale` (extended from Slice 3) does the order + payment + movements writes in a single Convex mutation. This guarantees:

- Atomicity: an order never lands without its movements, and vice versa.
- Idempotency via existing `clientId` short-circuit — covers movements too. A duplicate call returns the existing order without re-deducting.
- No second-round-trip from the client.

### Recipe optionality and modifier neutrality

- Items WITHOUT a recipe sell normally and write no movements. This is intentional: the owner may not have built recipes yet, or some items genuinely don't track inventory (e.g., re-sold packaged snacks). No yellow "missing recipe" icon in Slice 4 — that's UI polish for V1.1.
- Modifier `recipeAdjustments` are deferred. In Slice 4, **the base recipe always applies** regardless of which modifier options the cashier picked. If a customer orders "Latte (Oat milk)" and the recipe says 200ml dairy, dairy is deducted. The parent spec example ("swap dairy_milk 200ml → oat_milk 200ml") needs the deferred recipeAdjustments machinery.

### Snapshot rule

`orders.lines[].recipeSnapshot: [{ ingredientId, qty, wastageFactor }]` — exact line shape captured at sale time. Why not snapshot ingredient names? Because:

- The receipt doesn't display recipe (customer doesn't care).
- Audit/inventory queries always JOIN by ingredient id; names come fresh from `ingredients`.

If an ingredient is later renamed or archived, `recipeSnapshot[i].ingredientId` still resolves. The `ingredients.list` query returns archived rows when needed for historical resolution.

### Cost-per-cup is derived, not stored

`costPerCupIDR(lines, ingredientsById) = round(Σ line.qty × line.wastageFactor × ingredient.lastCostPerUnitIDR)`. Pure function. Used:

- Live in the recipe editor (recomputes per edit).
- Reserved for Slice 6 margin reports (which will use the FROZEN snapshot prices via a separate helper that joins via id; not relevant in Slice 4).

Cost-per-cup is NOT snapshotted into orders. If margin reports later need historical cost, they can join `recipeSnapshot` lines against an `ingredients` table that has its own historical cost tracking — but that's a V2 design decision, not a Slice 4 concern.

## Data model

Three new tables. One existing modification.

```ts
ingredients: defineTable({
  cafeId: v.id('cafes'),
  name: v.string(),
  canonicalUnit: v.union(v.literal('g'), v.literal('ml'), v.literal('piece')),
  reorderThreshold: v.number(),         // qty in canonical unit
  lastCostPerUnitIDR: v.number(),       // integer rupiah per canonical unit
  archived: v.boolean(),
  createdAt: v.number(),
})
  .index('by_cafe_active', ['cafeId', 'archived'])
  .index('by_cafe_name', ['cafeId', 'name']),

recipes: defineTable({
  cafeId: v.id('cafes'),
  menuItemId: v.id('menuItems'),
  lines: v.array(
    v.object({
      ingredientId: v.id('ingredients'),
      qty: v.number(),
      wastageFactor: v.number(),        // 1.0 = no wastage; 1.5 = 50% extra
    })
  ),
  updatedAt: v.number(),
})
  .index('by_cafe_item', ['cafeId', 'menuItemId']),

inventoryMovements: defineTable({
  cafeId: v.id('cafes'),
  ingredientId: v.id('ingredients'),
  delta: v.number(),                    // negative = consumed; positive = restock/adjust-up
  reason: v.union(
    v.literal('sale'),
    v.literal('adjustment'),
    v.literal('waste')                  // reserved; not written in Slice 4
  ),
  refType: v.optional(v.string()),      // 'order' when reason === 'sale'
  refId: v.optional(v.string()),        // orderId for sale movements
  note: v.optional(v.string()),         // free-text on manual adjustments
  at: v.number(),                       // ms epoch
})
  .index('by_cafe_ingredient', ['cafeId', 'ingredientId'])
  .index('by_cafe_ingredient_at', ['cafeId', 'ingredientId', 'at']),
```

```ts
// orders.lines[] gets a recipeSnapshot field.
// recipeSnapshot is OPTIONAL on the schema so existing Slice 3 rows
// (which were inserted before this field existed) continue to read.
// Going forward, every createCashSale call writes the field — `[]` for
// items without a recipe, populated lines for items with one.
orders: defineTable({
  // ... existing fields unchanged ...
  lines: v.array(
    v.object({
      // ... existing fields ...
      recipeSnapshot: v.optional(
        v.array(
          v.object({
            ingredientId: v.id('ingredients'),
            qty: v.number(),
            wastageFactor: v.number(),
          })
        )
      ),
    })
  ),
}),
```

**Index rationale:**

- `ingredients.by_cafe_active` — list/search on `/inventory` page.
- `ingredients.by_cafe_name` — duplicate-name validation on upsert.
- `recipes.by_cafe_item` — one-to-one lookup when loading or saving a recipe.
- `inventoryMovements.by_cafe_ingredient` — `currentStockQty` derivation; `Σ delta` over all movements for an ingredient.
- `inventoryMovements.by_cafe_ingredient_at` — date-range stock history (reserved for Slice 6 reports).

**Why a separate `recipes` table instead of embedding on `menuItems`:**

- Recipe edits don't touch `menuItems` doc — fewer reactive re-renders on the sale screen when the owner is editing recipes in another tab.
- Reads that don't need recipes (e.g., `menu.items.list` for the existing items page) don't pay for recipe data.
- Clean opt-out: items without a recipe just have no row in `recipes` (vs. `recipe: undefined` baggage on every menuItems row).

## Server functions

Three new files: `convex/ingredients.ts`, `convex/recipes.ts`, `convex/lib/inventory.ts`. Extensions to `convex/orders.ts` and `convex/menu/items.ts`.

### `convex/ingredients.ts`

```
list({ includeArchived? }) → Array<{ ...ingredientDoc, currentStockQty: number }>
get({ id }) → ingredientWithStock | null    // cross-cafe returns null
upsert({ id?, name, canonicalUnit, reorderThreshold, lastCostPerUnitIDR }) → ingredientId
archive({ id }) → null
adjustStock({ ingredientId, newQty, reasonLabel, note? }) → inventoryMovementId | null
```

**`upsert` validation:**
- `name` trimmed, length [1, 60]. Duplicate name in same cafe rejected (`/sudah ada/i`) via `by_cafe_name` lookup.
- `canonicalUnit` exact match to the union literal.
- `reorderThreshold` integer ≥ 0.
- `lastCostPerUnitIDR` integer ≥ 0.

**`adjustStock` behaviour:**
- Reads current stock via the shared `currentStockQty` helper.
- If `newQty === currentStock`, returns `null` without writing (zero-delta no-op).
- Otherwise writes one movement: `delta = newQty - currentStock`, `reason: 'adjustment'`, `note: reasonLabel + (' — ' + note if note)`.
- Returns the new movement id.

**`list` enrichment:**
- Loads ingredients filtered by `archived` flag, then attaches `currentStockQty` per ingredient via the shared helper. ~50 ingredients × 1 query each = acceptable for counter-cafe scale.

### `convex/recipes.ts`

```
getForItem({ menuItemId }) → recipeWithCost | null
upsert({ menuItemId, lines: [{ ingredientId, qty, wastageFactor }] }) → recipeId | null
```

**`getForItem` returns:**
```ts
{
  recipeId: Id<'recipes'>;
  lines: Array<{
    ingredient: Doc<'ingredients'>;
    qty: number;
    wastageFactor: number;
  }>;
  costPerCupIDR: number;
}
```

**`upsert` behaviour:**
- Verifies `menuItemId` belongs to the cafe.
- `lines.length === 0` → DELETES the recipe row entirely. Returns `null`. (Clean opt-out — equivalent to never having had one.)
- Otherwise: validate each line (`qty > 0`, `1.0 ≤ wastageFactor ≤ 5.0`, ingredient belongs to cafe + not archived). Then upsert by `by_cafe_item` lookup.
- Validation errors are Bahasa: "Jumlah harus lebih besar dari nol.", "Faktor wastage harus antara 1.0 dan 5.0.", "Bahan tidak ditemukan."

### `convex/lib/inventory.ts`

```ts
export async function currentStockQty(
  ctx: QueryCtx | MutationCtx,
  cafeId: Id<'cafes'>,
  ingredientId: Id<'ingredients'>
): Promise<number> {
  const movements = await ctx.db
    .query('inventoryMovements')
    .withIndex('by_cafe_ingredient', (q) =>
      q.eq('cafeId', cafeId).eq('ingredientId', ingredientId)
    )
    .collect();
  return movements.reduce((sum, m) => sum + m.delta, 0);
}

export function costPerCupIDR(
  lines: Array<{ qty: number; wastageFactor: number }>,
  ingredientsById: Map<Id<'ingredients'>, Doc<'ingredients'>>,
  // Note: third arg is the ingredient-id-keyed lookup; line.ingredientId is
  // expected on each line in addition to the qty/wastage fields.
  // (Signature simplified here — see implementation for full shape.)
): number;
```

### Extension: `convex/orders.ts:createCashSale`

The existing handler grows a recipe-lookup + movements-write phase, all inside the same mutation:

1. Existing validation (tenant, shift open, modifier counts, etc.) — unchanged.
2. **NEW (inside the per-line loop):** for each line, after computing `unitPriceIDR` + `modifiersSnapshot`, look up the recipe via `recipes.by_cafe_item`. If present and not all ingredients are archived, build `recipeSnapshot: [{ ingredientId, qty, wastageFactor }]` from the recipe's lines (skipping archived ingredients). If absent, `recipeSnapshot: []`.
3. Push `recipeSnapshot` into the built line.
4. Insert orders row + payments row (as today).
5. **NEW (after order insert):** for each built line, for each entry in `recipeSnapshot`, insert one `inventoryMovements` row with:
   ```ts
   {
     cafeId,
     ingredientId,
     delta: -(builtLine.qty * recipeLine.qty * recipeLine.wastageFactor),
     reason: 'sale',
     refType: 'order',
     refId: orderId,
     at: now,
   }
   ```

The handler stays one atomic mutation. Existing idempotency (`clientId` short-circuit at the top) covers movements automatically — a duplicate call returns the existing order without re-running steps 2–5.

### Extension: `convex/menu/items.ts:listForSale`

`listForSale` returns the same shape plus a new `lowStockIngredientNames: string[]` per row:

```ts
type ItemForSale = {
  item: Doc<'menuItems'>;
  attachedGroups: [...];                   // unchanged
  lowStockIngredientNames: string[];       // NEW — empty when none low
};
```

Implementation: after gathering the active items + their attached groups, the handler also loads each item's recipe (one read per item via `by_cafe_item`), then for each recipe line resolves the ingredient + its current stock. If `currentStockQty < ingredient.reorderThreshold`, the ingredient name goes into `lowStockIngredientNames`. Items without recipes have an empty array.

Performance note: this is `N items × M recipe lines × O(K movements)` where K is movements per ingredient. For counter cafes (<100 items × <5 ingredients × <500 movements/ingredient), this is acceptable. Future optimization (cached stock counters or precomputed low-stock flags) deferred to V2.

## Data flow & error handling

### Adding an ingredient

```
Owner taps "Tambah Bahan" on /inventory
   → <IngredientForm> drawer/dialog opens
   → fields: Nama, Satuan, Ambang isi ulang, Biaya per satuan
   → "Simpan" → ingredients.upsert
     ↳ validation throws Bahasa string → inline <FieldError>
     ↳ duplicate name → "Bahan dengan nama yang sama sudah ada."
   → close drawer, list refetches reactively
```

### Building a recipe

```
Owner opens /menu/items/:itemId
   → existing item edit form renders
   → below it, <RecipeEditor> renders:
     ↳ useQuery(api.recipes.getForItem, { menuItemId })
     ↳ each line: <IngredientPicker> + qty input + (collapsed) wastage input + × remove
     ↳ "Tambah bahan" appends a blank line in local state
     ↳ live cost-per-cup pill recomputes via the pure helper on every edit
   → "Simpan" button on the page commits BOTH:
     ↳ api.menu.items.update (existing) for item fields
     ↳ api.recipes.upsert for the recipe lines
     ↳ chained: item save first, then recipe (so the recipe's menuItemId is stable)
     ↳ single spinner; on either failure, surface the Bahasa error inline
```

### Cash sale with recipe → inventory deduction

```
Cashier on /sale taps Espresso (recipe = [Susu 200ml × 1.0])
   → cart line built in client useReducer
   → "Bayar" → cash dialog → "Konfirmasi"
   → api.orders.createCashSale({ clientId, shiftId, cashierId, lines, cashTendered })
     ↳ EXISTING validation
     ↳ NEW: load Espresso's recipe → recipeSnapshot = [{ susuId, qty: 200, wastageFactor: 1.0 }]
     ↳ insert orders row (lines now carry recipeSnapshot)
     ↳ insert payments row
     ↳ NEW: insert inventoryMovements { ingredientId: susuId, delta: -200, reason: 'sale', refId: orderId }
   → return { orderId, totalIDR, changeIDR }
   → ReceiptPreview opens (no inventory mention on the receipt)
   → /inventory reactively reflects susu stock = previous − 200
```

### Manual stock adjustment

```
Owner on /inventory taps "Catat Stok" on a row
   → <StockAdjustDialog> opens
   → header shows current stock (read-only)
   → fields: "Stok baru" (number), "Alasan" (Select), "Catatan" (optional text)
   → "Simpan" → api.ingredients.adjustStock({ ingredientId, newQty, reasonLabel, note })
     ↳ if newQty === current → no-op, dialog closes
     ↳ else writes one inventoryMovements row with delta = newQty - current
   → dialog closes; /inventory refetches
```

### Validation summary

| Where | Rule | Error |
|---|---|---|
| `ingredients.upsert` (server) | `name.trim().length in [1, 60]` | `'Nama bahan wajib diisi.'` / `'Nama bahan maksimal 60 karakter.'` |
| `ingredients.upsert` (server) | unique `name` per `cafeId` (case-insensitive) | `'Bahan dengan nama yang sama sudah ada.'` |
| `ingredients.upsert` (server) | `reorderThreshold` integer ≥ 0 | `'Ambang isi ulang harus bilangan bulat ≥ 0.'` |
| `ingredients.upsert` (server) | `lastCostPerUnitIDR` integer ≥ 0 | `'Biaya per satuan harus bilangan bulat ≥ 0.'` |
| `ingredients.adjustStock` (server) | `newQty` integer ≥ 0 | `'Stok harus berupa angka bulat ≥ 0.'` |
| `recipes.upsert` (server) | each `line.qty > 0` | `'Jumlah harus lebih besar dari nol.'` |
| `recipes.upsert` (server) | each `line.wastageFactor in [1.0, 5.0]` | `'Faktor wastage harus antara 1.0 dan 5.0.'` |
| `recipes.upsert` (server) | each `line.ingredientId` belongs to cafe + not archived | `'Bahan tidak ditemukan.'` |
| `recipes.upsert` (server) | `menuItemId` belongs to cafe | `'Item tidak ditemukan.'` (existing helper) |

### Race conditions

| Scenario | Handling |
|---|---|
| Owner edits recipe while a cashier is on /sale | Reactive `listForSale` refetches; the new recipe applies to subsequent sales. In-flight cart at /sale uses the recipe at SUBMIT time (server reload), so the current edit wins or the previous version wins depending on which lands first — both are valid. |
| Ingredient archived between recipe edit and sale | Server-side, the archived ingredient's line is SKIPPED in `recipeSnapshot` building. The sale completes; that ingredient simply doesn't deduct. Reflects intentional opt-out by the owner. |
| Stock goes negative due to manual-adjust drift | Allowed by design. Movements still write; current-stock derivation just returns a negative number. Owner reconciles via another adjustment. |
| Two cashiers on two tabs both sell the last unit | Each sale writes its own movement. Stock becomes negative by 1 unit after both. Acceptable for V1 counter-cafe (one-cashier-per-shift convention from Slice 2). |
| Duplicate `clientId` (network retry / double-click) | Existing short-circuit returns the existing order without re-running deduction. Movements not duplicated. |
| Recipe deleted (`lines: []` upsert) while in-flight sale | If the recipe is gone by the time `createCashSale` reads it, `recipeSnapshot: []` is captured and no movements are written. Order completes normally. |

## Components & routes

```
src/routes/_pos/inventory/
  route.tsx                                 PinGate wrapper
  index.tsx                                 ingredient list page
  $ingredientId.tsx                         edit drawer route (modal-style)

src/components/inventory/
  ingredient-form.tsx                       create/edit ingredient form
  stock-adjust-dialog.tsx                   "Catat Stok" modal
  low-stock-badge.tsx                       reusable warning chip
  recipe-editor.tsx                         appended below item-edit-form
  ingredient-picker.tsx                     autocomplete combobox for recipe lines

src/components/sale/item-card.tsx           EXTENDED — low-stock warning + tooltip
src/components/pos-nav.tsx                  EXTENDED — "Inventaris" link
```

### `/inventory` route (`src/routes/_pos/inventory/route.tsx` + `index.tsx`)

- New top-level entry under the `_pos` group. Wrapped by `<PinGate>` (any signed-in staff can view; mutations call `requireOwnerCafe` which restricts to the owner).
- `index.tsx` is the list page; `$ingredientId.tsx` is a sibling route that pops up as a drawer for edit + "Catat Stok" actions.

### `<InventoryPage>`

- Header: `<h1>Inventaris</h1>` + `<Button>Tambah Bahan</Button>` (opens create dialog).
- Search input (client-side filter by name).
- Filter chips: "Semua" / "Stok rendah" / "Arsip".
- Table columns: Nama · Stok saat ini + satuan · Ambang isi ulang · Biaya / satuan · Status (Aktif / Rendah / Arsip).
- Row click → opens the edit drawer (`/inventory/:ingredientId`).
- Low-stock highlight: row gets `bg-amber-50` + small `⚠` icon in the leading column.
- Empty state: `"Belum ada bahan. Tambah bahan pertama untuk mulai melacak stok."`

### `<IngredientForm>`

- Fields: Nama (Input), Satuan (Select: g/ml/piece), Ambang isi ulang (number), Biaya per satuan (Rp, number).
- "Simpan" + "Batal" footer.
- On edit, an extra "Catat Stok" button opens `<StockAdjustDialog>` and an "Arsipkan" button using the existing `<ConfirmArchive>` pattern.

### `<StockAdjustDialog>`

- Header: `Catat stok: {ingredient.name}`.
- Read-only current stock row: `Stok saat ini: 1.200 ml`.
- "Stok baru" number input (qty in canonical unit).
- "Alasan" Select with four hard-coded options: `Pengiriman masuk` / `Stok opname` / `Limbah` / `Koreksi`.
- "Catatan" textarea (optional, max 200 chars).
- "Simpan" → `api.ingredients.adjustStock`. On success: close dialog, refetch list.

### `<RecipeEditor>`

- Lives in `src/components/inventory/recipe-editor.tsx` but composed into `src/routes/_pos/menu/items.$itemId.tsx` (the existing item edit page).
- Header: `<h2>Resep</h2>` + cost-per-cup pill `≈ Rp 4.500 / porsi` (live).
- Lines list (local state in the editor): each line is `<IngredientPicker> + qty input + collapsed "advanced" toggle (wastage) + × remove`.
- "Tambah bahan" button at bottom appends a blank line.
- Empty state: `"Belum ada resep. Item tetap bisa dijual, tapi stok bahan tidak berkurang otomatis."`
- The page's "Simpan" button at the bottom commits BOTH `api.menu.items.update` and `api.recipes.upsert` (chained mutations; one spinner on the button).
- Save-failure UX: inline `<FieldError>` next to the recipe editor section. If item save succeeds but recipe save fails, surface the recipe error and keep the item save (no rollback — owner can retry recipe save).

### `<IngredientPicker>`

- Combobox over `api.ingredients.list({ includeArchived: false })`.
- Substring match on name. Keyboard nav (↑ / ↓ / Enter / Esc).
- Footer when no match: `+ Buat bahan baru: 'foo'` — opens the create dialog inline; on save, autoselects the new ingredient.

### `<ItemCard>` extension at `/sale`

- New prop: `lowStockIngredientNames: string[]`.
- When non-empty:
  - Border tinted amber (`border-amber-400`).
  - Small `⚠` icon in the top-right corner.
  - `title` attribute (browser tooltip): `Stok rendah: {names.join(', ')}`.
- Cashier can still tap and sell. Warning is informational, not blocking.

### `<PosNav>` update

- Add `{ to: '/inventory', label: 'Inventaris' }` between "Menu" and "Pengaturan" in the `LINKS` array.

## Testing

### Convex function tests (~24 specs)

`tests/convex/ingredients.test.ts` (~8 specs):
- `upsert` creates with valid fields; returns id.
- `upsert` validates trimmed name length [1, 60]; throws `/wajib diisi/i` and `/maksimal/i`.
- `upsert` rejects duplicate name in same cafe (case-insensitive) with `/sudah ada/i`.
- `upsert` allows the same name in DIFFERENT cafes (tenant isolation positive case).
- `list` returns active ingredients with `currentStockQty: 0` when no movements; includes archived only when `includeArchived: true`.
- `archive` flips the flag; the ingredient still resolves in queries that don't filter on archived.
- `adjustStock` writes one movement with correct delta + note; verifies movement persisted.
- `adjustStock` with `newQty === currentStock` returns `null` and writes no movement.

`tests/convex/recipes.test.ts` (~6 specs):
- `upsert` creates a row on first call, patches lines on subsequent calls.
- `upsert` with `lines: []` deletes the recipe row.
- `upsert` rejects `qty <= 0` with `/lebih besar dari nol/i`.
- `upsert` rejects `wastageFactor` outside [1.0, 5.0] with `/antara 1.0/i`.
- `upsert` rejects archived ingredient with `/tidak tersedia|tidak ditemukan/i`.
- `getForItem` returns `null` when no recipe; returns `{ lines, costPerCupIDR }` when present.

`tests/convex/orders.test.ts` extensions (~6 specs):
- Sale of an item with a 1-line recipe writes 1 movement with correct `delta = -(orderLine.qty × recipeLine.qty × wastageFactor)`, `reason: 'sale'`, `refType: 'order'`, `refId: orderId`.
- Sale of an item with a multi-line recipe writes N movements (one per ingredient).
- `recipeSnapshot` on `orders.lines[]` matches the recipe at sale time.
- Editing the recipe AFTER the sale does not mutate the historical `recipeSnapshot`.
- Sale of an item WITHOUT a recipe writes the order + payment but zero movements; `recipeSnapshot` is `[]`.
- Sale with a partially-archived recipe (one ingredient archived) — archived line is SKIPPED in deduction; other ingredients still deduct. Order completes without throwing.
- Idempotency: a duplicate `clientId` call returns the existing `orderId` and does NOT write additional movements.

`tests/convex/menu/items.listForSale.test.ts` extensions (~4 specs):
- Active item with all ingredients above threshold returns empty `lowStockIngredientNames`.
- Active item with one ingredient below threshold returns that ingredient's name.
- Active item with multiple low ingredients returns all names.
- Item without a recipe has empty `lowStockIngredientNames` regardless of any ingredient state.

### Unit tests (~4 specs)

`src/lib/inventory.test.ts` (a new file):
- `costPerCupIDR` over a single line: `200ml × wastage 1.0 × Rp 25/ml = Rp 5.000`.
- Returns `0` for empty lines.
- Handles `wastageFactor = 1.5` correctly with integer rounding.
- Handles a zero-cost ingredient (e.g., tap water) without dividing or returning NaN.

### Playwright E2E (1 happy path, auth-gated)

`tests/e2e/inventory.spec.ts`:

1. `gotoHydrated('/signup')` → fill Nama / Nama kafe / Email / Password → Daftar.
2. `/onboarding/profile` → PPN 11 → Lanjut.
3. `/onboarding/menu` → "Mulai dengan kategori" → category "Kopi" → Items → add item "Espresso" Rp 18.000.
4. `/onboarding/cashier` → set owner PIN `1234` → Selesai.
5. Navigate to `/inventory` via the nav.
6. "Tambah Bahan" → fill Susu / ml / 500 / 25 → Simpan. Expect row appears.
7. Navigate to `/menu/items/{espressoId}` (find via the items list).
8. In the Resep section: "Tambah bahan" → pick Susu, qty 200, wastage 1.0.
9. Expect the cost-per-cup pill shows `≈ Rp 5.000 / porsi`.
10. "Simpan" — page refreshes / commits.
11. `/pin` → enter PIN.
12. `/shift/open` → Modal awal 100.000 → Buka Shift.
13. `/sale` → tap Espresso → "Bayar" → 100k chip → Konfirmasi → Selesai.
14. Back to `/inventory` → Susu row shows current stock = `-200 ml` (started from 0, deducted 200).

Single E2E covers every Slice 4 surface end-to-end. No separate "low-stock UI" E2E (the warning rendering is covered by Convex tests + by-eye during this flow if a low-stock row exists).

### Out of scope

- Performance with hundreds of ingredients / thousands of movements.
- Modifier `recipeAdjustments` (deferred to V1.1).
- Suppliers (deferred).
- Inventory reports / "days of cover" (Slice 6).
- Bulk-import flows.
- Receipt-side display of inventory deductions.

## Open questions

None blocking. Resolved during brainstorm:

- **Scope**: MVP+ — adds wastage factor + cost-per-cup live calc on top of the minimum spec.
- **Recipe editor placement**: inline on the existing menu item edit page (`/menu/items/:itemId`); one save button commits item + recipe back-to-back (two chained mutations, not atomic). If item save succeeds but recipe save fails, the owner sees the recipe error and can retry the recipe save without losing the item update.
- **Low-stock visibility at the till**: per-item warning on `<ItemCard>` (border tint + ⚠ icon + tooltip listing low ingredients).
- **Data model**: separate `recipes` table (not embedded on `menuItems`); embedded `lines` array inside the recipe row.
- **Event-sourcing**: stock is derived from movements; no mutable counter.
- **Negative stock**: allowed (no hard block at sale time).
- **Modifier handling**: base recipe always applies; modifier `recipeAdjustments` deferred.

## Addendum touchpoints

No new addendum entries needed. Existing patterns continue to apply:

- §A.9 underscore route groups: `_pos/inventory/*` joins the existing `_pos` group.
- §A.13 Lingui 6 + Vite 8 macro pipeline: user-facing strings in new components use `<Trans>` / `t\`…\`` (or remain raw Bahasa to match the established Slice 1–3 pattern).
- Slice 2 PIN/Auth gating composes with the new `/inventory` route via the existing `<PinGate>`.

## Plan handoff

After user review of this spec, invoke `superpowers:writing-plans` to produce `docs/superpowers/plans/2026-05-23-phase-1-slice-4-inventory-recipes.md` with task-by-task TDD steps, then execute via `superpowers:subagent-driven-development`.
