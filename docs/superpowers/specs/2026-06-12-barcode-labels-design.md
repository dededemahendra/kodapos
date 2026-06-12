# Barcode Label Printing Design Spec

**Date:** 2026-06-12
**Branch:** `feat/barcode-labels` (off `main`)

## Context

Barcode **scan-to-cart** shipped (#61): a menu item can carry an optional `barcode`, matched
client-side at the register. But items made in-house (a pastry, a house blend) have no
manufacturer barcode, so they can't be scanned. This slice lets an owner **assign** an internal
barcode to such items and **print label sheets** (name + price + scannable barcode) to stick on
shelf tags / packaging. It closes the loop on the scan feature.

Off the money path, low-risk: an item `barcode` patch + a client-side print view.

## Approach — own a pure Code128 encoder (no dependency)

No barcode library is installed. Rather than add `jsbarcode` (DOM/canvas, client-only, a build
risk on Cloudflare Workers SSR), this slice ships a **pure, deterministic Code128-B encoder** in
`src/lib/barcode-code128.ts` that returns bar-module widths, rendered as crisp SVG `<rect>`s by a
`<BarcodeSVG>` component. Pure → unit-testable against known checksums, and SSR/print-safe.

## Backend — `convex/menu/items.ts`

- **`assignBarcode({ id })`** (new mutation, owner-gated): for an item, generate a unique internal
  numeric code (12 digits) and patch `barcode`. Reuse `assertBarcodeUnique`; retry generation on
  the rare collision (a handful of attempts, then throw `'Gagal membuat barcode unik.'`). Returns
  the code. Reject if the item already has a `barcode` (`'Item sudah punya barcode.'`) — the UI
  only offers it for items lacking one. The generated code is digits-only (Code128 renders it
  fine; scanners read it as keyboard input like any other).
- **`assignMissingBarcodes({})`** (new mutation, owner-gated): assign a fresh unique code to every
  sellable (active, non-archived) item that lacks one; return `{ assigned: number }`. For the
  "generate for all then print" flow.
- No new query — the label page reads `listForSale` (already returns `{ item: { …, barcode } }`
  with name + price).

## Frontend

### Pure encoder — `src/lib/barcode-code128.ts` (new)
`encodeCode128B(value: string): number[]` → the flat array of alternating bar/space module widths
(start B `104`, per-char symbols `charCode − 32`, mod-103 checksum, stop `106` + the final 2-module
bar), using the standard 108-row Code128 pattern table. Throws on non-Code128-B chars (outside
ASCII 32–126). A tiny `code128Checksum(value)` is exported for the unit test.

### Component — `src/components/menu/barcode-svg.tsx` (new)
`<BarcodeSVG value height? moduleWidth? />` — renders the encoder output as an SVG (black `<rect>`
bars on white, `shape-rendering="crispEdges"`), with the human-readable value below. Memoized on
`value`.

### Route — `src/routes/_pos/menu/labels.tsx` (new, `canEditMenu`)
`createFileRoute('/_pos/menu/labels')`. `listForSale` → a selectable list: each sellable item a
row with a checkbox, a qty `Input` (labels to print, default 1), the price, and either its
`barcode` or a **"Buat barcode"** button (→ `assignBarcode`) when missing; a **"Buat semua"**
button (→ `assignMissingBarcodes`) in the toolbar. A label-size `Select` (e.g. small / medium →
columns-per-row). A **"Cetak label"** button → `window.print()`.
- A **print area** renders the selected items × their qty as a CSS grid of labels (each: item
  name, `formatIDR(price)`, `<BarcodeSVG>`); a `@media print`/Tailwind `print:` block hides the
  app chrome and shows only the label grid (mirror the receipt-preview print approach + the
  `print:` classes already used in `shift/close.tsx`). Items without a barcode are excluded from
  the print grid (with a hint to generate first). `Empty` when no sellable items.

### Nav — `src/components/menu/...` / menu route tabs
Add a **"Label Barcode"** entry to the menu section nav (wherever the menu sub-pages — items /
categories / modifiers — are linked; mirror that tab/list), `requires: 'canEditMenu'`.

## Testing
**`tests/lib/barcode-code128.test.ts`** (new): `code128Checksum`/`encodeCode128B` against known
vectors — e.g. the checksum for a sample value matches the hand-computed mod-103 value; the
module array starts with the start-B pattern and ends with the stop pattern; encoding is
deterministic; a non-ASCII char throws.
**`tests/convex/menu-items.test.ts`** (extend): `assignBarcode` sets a unique digits-only code;
calling it on an item that already has one throws; two items get distinct codes;
`assignMissingBarcodes` assigns only to items lacking one and returns the count; cross-cafe
uniqueness is independent (mirror the existing barcode tests).

Frontend (selection, generate, print grid) by typecheck + smoke.

## i18n
New BI: `Label Barcode`, `Buat barcode`, `Buat semua`, `Cetak label`, `Ukuran label`,
`Belum ada item.`, server-thrown `'Item sudah punya barcode.'`/`'Gagal membuat barcode unik.'`
(off-catalog). Extract + fill `en` (`Barcode labels`, `Generate barcode`, `Generate all`,
`Print labels`, `Label size`, `No items yet.`), compile. The printed label content (name/price)
follows the receipt convention but here it IS on-screen UI, so keep it translatable via the item
data (name is user data; price via `formatIDR`).

## Conventions
- Run CI locally: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`; clean tree.
- Do NOT run codegen — `assignBarcode`/`assignMissingBarcodes` are additions to the registered
  `menu/items` module (no api.d.ts change). **New route** → commit `routeTree.gen.ts`.
- No new dependency (pure encoder). Small conventional commits; PR → review → merge commit.

## Out of scope
- EAN-13/UPC/QR symbologies (Code128-B only); a barcode-by-weight / price-embedded format;
  printing to a dedicated label printer via ESC/POS (uses the browser print dialog); editing the
  generated code (it's just a `barcode` value — edit via the item form); per-label custom fields
  beyond name + price + code.
