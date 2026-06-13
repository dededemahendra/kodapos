# Bulk CSV Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Bulk-import menu items and ingredients from a CSV to onboard a catalog fast. Create-only (skip duplicates by name), resolve/create categories by name, report created/skipped/errors per row.

**Copy rules (project):** UI Bahasa via the catalog; **no em-dash `—`/`--`**; empty states use shadcn `Empty` (icon + heading + description).

---

## File Structure
- **Create:** `src/components/import/csv-import-dialog.tsx` (a reusable import dialog), `tests/lib/csv-parse.test.ts`, `tests/convex/bulk-import.test.ts`.
- **Modify:** `src/lib/csv.ts` (add `parseCSV`), `convex/menu/items.ts` (`bulkImport`), `convex/ingredients.ts` (`bulkImport`), `src/routes/_pos/menu/index.tsx` (button), `src/routes/_pos/inventory/index.tsx` or the ingredients page (button).
- **i18n:** `src/locales/{id,en}/messages.po`.

---

### Task 1: Backend — parseCSV + bulkImport mutations (TDD)
**Files:** modify `src/lib/csv.ts`, `convex/menu/items.ts`, `convex/ingredients.ts`; create `tests/lib/csv-parse.test.ts`, `tests/convex/bulk-import.test.ts`.

READ: `src/lib/csv.ts` (`toCSV`/`CSVColumn`), `convex/menu/items.ts` `create` (args `{ categoryId, name, priceIDR, barcode? }`, the `assertBarcodeUnique`/name handling), `convex/menu/categories.ts` `create`/`list` (categories have no by-name index — resolve by scanning `by_cafe_active`), `convex/ingredients.ts` `upsert` (args `{ name, canonicalUnit: 'g'|'ml'|'piece', reorderThreshold, lastCostPerUnitIDR }`), `convex/lib/auth.ts`.

- [ ] **Step 1: `parseCSV`** in `src/lib/csv.ts` — `export function parseCSV(text: string): string[][]` — RFC4180-ish: splits rows + fields, handles double-quoted fields (commas/newlines/`""` escapes inside quotes), tolerates CRLF and a trailing newline, skips a fully-empty trailing line. Pure.
- [ ] **Step 2: FAILING tests**:
  - `tests/lib/csv-parse.test.ts`: `parseCSV('a,b\n1,2')` → `[['a','b'],['1','2']]`; a quoted field with a comma (`"x,y"`) stays one cell; an escaped quote (`"he said ""hi"""`) → `he said "hi"`; CRLF handled; a trailing newline does not add an empty row.
  - `tests/convex/bulk-import.test.ts`: `menu.items.bulkImport({ rows:[{ name:'Kopi', category:'Minuman', priceIDR:18000 }] })` → `{ created:1, skipped:0, errors:[] }`; the item exists + a "Minuman" category was created; a 2nd import of the same name → `skipped:1` (reason "sudah ada"); a row with priceIDR ≤ 0 or empty name → an `errors` entry (not created); a duplicate barcode → an error; rows referencing the SAME new category create it once. `ingredients.bulkImport({ rows:[{ name:'Susu', unit:'ml', reorderThreshold:1000, lastCostPerUnitIDR:25 }] })` → created; bad unit / negative threshold → errors; duplicate name → skipped. Owner-scope.
  Run → confirm FAIL.
- [ ] **Step 3: implement**
  - `convex/menu/items.ts`: `bulkImport({ rows: v.array(v.object({ name: v.string(), category: v.string(), priceIDR: v.number(), barcode: v.optional(v.string()) })) })` → returns `{ created: v.number(), skipped: v.number(), errors: v.array(v.object({ row: v.number(), name: v.string(), reason: v.string() })) }`. `requireOwnerCafe`; preload existing categories (by_cafe_active) into a name→id map + existing item names (lowercased) Set + existing barcodes; for each row (index): validate name (1-60) + priceIDR (int>0) + barcode (unique, trim); if an item with that name (lowercased) already exists → skipped; resolve category: find in the map (case-insensitive) else create it + add to the map; insert the item; on a validation throw push to `errors` and continue. Cap rows at e.g. 1000.
  - `convex/ingredients.ts`: `bulkImport({ rows: v.array(v.object({ name, unit: v.string(), reorderThreshold: v.number(), lastCostPerUnitIDR: v.optional(v.number()) })) })` → same result shape; validate unit ∈ {g,ml,piece} (else error), reorderThreshold int≥0, cost int≥0 (default 0); skip duplicate name; insert via the same logic as `upsert`'s insert branch.
- [ ] **Step 4: tests + typecheck + commit** — `pnpm test` + `pnpm typecheck` PASS. Commit:
  `git add src/lib/csv.ts convex/menu/items.ts convex/ingredients.ts tests/lib/csv-parse.test.ts tests/convex/bulk-import.test.ts && git commit -m "feat(import): parseCSV + bulk import for menu items and ingredients"`
  > Do NOT run codegen.

---

### Task 2: Frontend — CSV import dialog + buttons + template
**Files:** create `src/components/import/csv-import-dialog.tsx`; modify `src/routes/_pos/menu/index.tsx`, the ingredients list page (find it: `src/routes/_pos/inventory/index.tsx` or wherever `api.ingredients.list` renders).

READ: `src/routes/_pos/menu/index.tsx` (the PageHeader actions + `RequirePermission`/perm), the ingredients page, `src/lib/csv` (`parseCSV` + `toCSV`/`downloadCSV` for the template), `src/components/ui/{dialog,button,table,empty}`, `~/lib/toast`.

- [ ] **Step 1: `csv-import-dialog.tsx`** — a generic dialog, props `{ open, onOpenChange, kind: 'items'|'ingredients', onImport: (rows) => Promise<{created,skipped,errors}> }` (or pass the mutation + a row-mapper). It: a file `<input type="file" accept=".csv">` → read text → `parseCSV` → take the header row, map known columns by header name (case-insensitive: items expect `name,category,price[,barcode]`; ingredients expect `name,unit,reorder[,cost]`), build typed rows → show a **preview** (a small table of the first N parsed rows + a count) → an "Impor" button → call `onImport(rows)` → show the result counts (created / skipped / errors, listing the first few error reasons). A "Unduh template" link (`downloadCSV` with a header-only + one example row). Handle a bad/empty file with a clear message. Empty parse → an `Empty` state (icon + heading + desc).
- [ ] **Step 2: wire** — menu items page: an "Impor CSV" button (next to "Tambah") opening the dialog with `kind:'items'` → `api.menu.items.bulkImport` (map preview rows to `{name, category, priceIDR:Number, barcode?}`). Ingredients page: an "Impor CSV" button → `api.ingredients.bulkImport` (map to `{name, unit, reorderThreshold:Number, lastCostPerUnitIDR?:Number}`). Reuse `canEditMenu` gating. On success, toast a summary.
- [ ] **Step 3:** `pnpm typecheck` + `pnpm test` PASS. Commit:
  `git add src/components/import/csv-import-dialog.tsx src/routes/_pos/menu/index.tsx <ingredients-page> && git commit -m "feat(import): CSV import dialog + buttons for menu and ingredients"`

UI Bahasa via `<Trans>`/`t\`...\``, no em-dash/`--`.

---

### Task 3: i18n
New BI: `Impor CSV`, `Unduh template`, `Impor`, `{0} dibuat, {1} dilewati`, `Pilih file CSV`, `Format tidak dikenali`, `Baris {0}`, etc.
- [ ] `pnpm lingui:extract`; fill `en` (`Import CSV`, `Download template`, `Import`, `{0} created, {1} skipped`, `Choose a CSV file`, `Unrecognized format`, `Row {0}`, …) for every new empty (no em-dash); watch collisions; `pnpm lingui:compile` → en 0 missing. Commit `src/locales`.

---

### Task 4: Final verification
- [ ] `pnpm typecheck` PASS; `pnpm test` PASS; `pnpm lingui:compile` en 0 missing; clean tree.
- [ ] **Manual sanity:** download the items template, fill a few rows (incl. a new category name), import → items created + the category appears; a duplicate name is skipped; a bad price row is reported; the same for ingredients (unit g/ml/piece).

---

## Self-Review
**Spec coverage:** parseCSV (T1); menu + ingredient bulkImport with category-resolve + skip-dupe + per-row errors (T1); import dialog + buttons + template (T2); tests parse + import create/skip/error/scope (T1); i18n (T3). ✓
**Placeholder scan:** "mirror create / upsert / menu page actions". Else spec code.
**Type consistency:** `parseCSV(text) → string[][]`; `menu.items.bulkImport({rows:[{name,category,priceIDR,barcode?}]}) → {created,skipped,errors}`; `ingredients.bulkImport({rows:[{name,unit,reorderThreshold,lastCostPerUnitIDR?}]})` same shape; the dialog maps headers → these row shapes. ✓
