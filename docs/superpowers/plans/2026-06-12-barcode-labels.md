# Barcode Label Printing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). Off money-path, low-risk.

**Goal:** Assign an internal barcode to in-house items + print label sheets (name/price/scannable Code128) — closing the loop on barcode scan-to-cart.

---

## File Structure
- **Create:** `src/lib/barcode-code128.ts`, `src/components/menu/barcode-svg.tsx`, `src/routes/_pos/menu/labels.tsx`, `tests/lib/barcode-code128.test.ts`.
- **Modify:** `convex/menu/items.ts` (`assignBarcode`, `assignMissingBarcodes`), `tests/convex/menu-items.test.ts`, the menu-section nav, `src/routeTree.gen.ts`.
- **i18n:** `src/locales/{id,en}/messages.po`.

---

### Task 1: Pure Code128-B encoder (TDD)
**Files:** create `src/lib/barcode-code128.ts`, `tests/lib/barcode-code128.test.ts`.

READ: any existing `src/lib/*.ts` for the module style; the Code128 spec pattern table (108 rows of 6-width modules; start-B = index 104, stop = 106).

- [ ] **Step 1: FAILING test** (`tests/lib/barcode-code128.test.ts`): `code128Checksum('CODE128')` (or a chosen vector) equals the hand-computed mod-103 checksum; `encodeCode128B(value)` returns a number[] whose first 6 widths equal the start-B pattern `[2,1,1,4,1,2]` and whose tail equals the stop pattern `[2,3,3,1,1,1,2]`; deterministic (same input → same output); a value with a non-ASCII/<32 char throws. Run → FAIL.
- [ ] **Step 2: implement `src/lib/barcode-code128.ts`** — the 108-row `CODE128_PATTERNS` table; `code128Checksum(value)` = `(104 + Σ (charCode(value[i]) − 32) × (i+1)) % 103`; `encodeCode128B(value)`: validate chars in 32..126 (`throw new Error('Karakter tidak didukung Code128.')`), build symbol indices `[104, ...chars, checksum, 106]`, flat-map each to its pattern row, append the final `[2]` termination bar → `number[]` of module widths. Export both.
- [ ] **Step 3: tests pass + typecheck** — `pnpm test tests/lib/barcode-code128.test.ts` + `pnpm typecheck` PASS. Commit:
  `git add src/lib/barcode-code128.ts tests/lib/barcode-code128.test.ts && git commit -m "feat(menu): pure Code128-B barcode encoder"`

---

### Task 2: Backend — assignBarcode + assignMissingBarcodes (TDD)
**Files:** modify `convex/menu/items.ts`, `tests/convex/menu-items.test.ts`.

READ: `convex/menu/items.ts` — `assertBarcodeUnique` (~108), `create`/`update` (barcode handling), `listForSale`; the existing barcode tests in `tests/convex/menu-items.test.ts` (setup + cross-cafe assertions).

- [ ] **Step 1: FAILING tests** (append): `assignBarcode({id})` → item gains a digits-only `barcode` (`/^\d{12}$/`), unique; a second item gets a different code; calling it on an item that already has a barcode throws (`/sudah punya/i`); `assignMissingBarcodes({})` assigns only to items lacking one and returns `{assigned: n}` matching the count; an item in another cafe is unaffected (owner-scope). Run → FAIL.
- [ ] **Step 2: implement** — a private `genBarcode()` helper (12 random digits; since `Math.random` is unavailable in Convex? — use `crypto.getRandomValues` via `globalThis.crypto` which IS available in Convex runtime; build digits from it). `assignBarcode`: `requireOwnerCafe`+`requireOwned(item)`; if `item.barcode` throw `'Item sudah punya barcode.'`; loop up to ~8 times generating a candidate + `assertBarcodeUnique`; on success `patch({barcode})` and return it; exhausting attempts throws `'Gagal membuat barcode unik.'`. `assignMissingBarcodes`: query sellable items (active, non-archived) lacking `barcode`, assign each via the same helper, return `{assigned}`. Proper return validators.
- [ ] **Step 3: tests + typecheck + commit** — `pnpm test tests/convex/menu-items.test.ts` + full PASS; `pnpm typecheck` PASS.
  `git add convex/menu/items.ts tests/convex/menu-items.test.ts && git commit -m "feat(menu): assign internal barcode to items (single + bulk)"`
  > Do NOT run codegen (additions to a registered module).

---

### Task 3: Frontend — BarcodeSVG + labels page + nav
**Files:** create `src/components/menu/barcode-svg.tsx`, `src/routes/_pos/menu/labels.tsx`; modify the menu-section nav; commit `src/routeTree.gen.ts`.

READ: `src/lib/barcode-code128.ts` (Task 1); `src/components/sale/receipt-preview.tsx` + `src/routes/_pos/shift/close.tsx` (the `print:`/`window.print()` pattern); `src/routes/_pos/menu/route.tsx` (the menu sub-page tabs/nav to add the entry); `src/routes/_pos/menu/index.tsx` (the items list + `listForSale`/`api.menu.items.*` usage, `RequirePermission canEditMenu`); `src/components/ui/{select,input,checkbox,button,empty}`; `~/lib/money`.

- [ ] **Step 1: `barcode-svg.tsx`** — `<BarcodeSVG value height?=48 moduleWidth?=2 />`: `useMemo(() => encodeCode128B(value), [value])`; map module widths to alternating black/white `<rect>`s (start with a bar), total width = Σ widths × moduleWidth; an SVG with `shapeRendering="crispEdges"`; the human-readable `value` in a `<div>` below (monospace, centered).
- [ ] **Step 2: `labels.tsx`** — `createFileRoute('/_pos/menu/labels')`, `<RequirePermission perm="canEditMenu">`. `useQuery(api.menu.items.listForSale)` → a selectable list (checkbox + qty `Input` default 1 + price + `barcode` or a "Buat barcode" `Button` → `useMutation(api.menu.items.assignBarcode)`); a toolbar "Buat semua" `Button` → `assignMissingBarcodes`; a label-size `Select` (small=4 cols / medium=3 / large=2). A "Cetak label" `Button` → `window.print()`. A **print grid**: for each checked item with a `barcode`, render `qty` labels (name, `formatIDR(price)`, `<BarcodeSVG value={barcode} />`) in a CSS grid; wrap the app in the existing print-hiding pattern so only `.print-labels` shows on `@media print`. `Empty` (icon `Tags`/`Barcode`) when no sellable items. Loading → Spinner.
- [ ] **Step 3: nav** — add `{ to: '/menu/labels', label: <Trans>Label Barcode</Trans> }` (or the icon-nav shape the menu section uses) next to the items/categories/modifiers entries in `menu/route.tsx` (or `app-shared.tsx` if that's where menu sub-nav lives — match siblings).
- [ ] **Step 4: routeTree** — `pnpm build`; confirm `grep -c "menu/labels\|MenuLabels\|labels" src/routeTree.gen.ts` includes the new route; stage it.
- [ ] **Step 5:** typecheck + test PASS. Commit:
  `git add src/components/menu/barcode-svg.tsx src/routes/_pos/menu/labels.tsx src/routes/_pos/menu/route.tsx src/routeTree.gen.ts && git commit -m "feat(menu): barcode label print page + BarcodeSVG + nav"`

---

### Task 4: i18n
New: `Label Barcode`, `Buat barcode`, `Buat semua`, `Cetak label`, `Ukuran label`, `Belum ada item.`, `Kecil`/`Sedang`/`Besar` (label sizes), `Jumlah` (reuse).
- [ ] `pnpm lingui:extract`; fill `en` (`Barcode labels`, `Generate barcode`, `Generate all`, `Print labels`, `Label size`, `No items yet.`, `Small`/`Medium`/`Large`) + any other new empties; `pnpm lingui:compile` → en 0 missing. Commit `src/locales`.

---

### Task 5: Final verification
- [ ] `pnpm typecheck` PASS; `pnpm test` PASS; `pnpm lingui:compile` en 0 missing; `git status` clean — **routeTree.gen.ts committed**.
- [ ] **Manual sanity:** an item without a barcode shows "Buat barcode" → click assigns a 12-digit code; select items + qty → "Cetak label" opens the browser print dialog showing only the label grid with scannable barcodes; "Buat semua" fills every sellable item lacking a code.

---

## Self-Review
**Spec coverage:** pure encoder (T1); assignBarcode + assignMissingBarcodes (T2); BarcodeSVG + labels page + print grid + nav (T3); tests encoder vectors + assign single/bulk/scope (T1–T2); i18n (T4). ✓
**Placeholder scan:** encoder pattern table is concrete spec; UI "mirror receipt print + menu index". Else spec code.
**Type consistency:** `encodeCode128B(value): number[]` ↔ `<BarcodeSVG>`; `assignBarcode({id}) → string`, `assignMissingBarcodes({}) → {assigned}` ↔ the page mutations; `listForSale` `{item:{barcode?}}` drives selection + print. ✓
