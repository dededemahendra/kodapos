# Barcode Scanning Design Spec

**Date:** 2026-06-11
**Branch:** `feat/barcode` (off `main`)

## Context

Ringing packaged items by tapping is slow. This slice adds an optional **barcode** per menu
item and a **scan-to-cart** input on the register: a barcode scanner (which types the code +
Enter like a keyboard) into the scan field adds the matching item to the cart. No special
hardware — scanners emulate a keyboard.

## Model

`menuItems` gains `barcode: v.optional(v.string())` + an index `by_cafe_barcode`
(`['cafeId', 'barcode']`) for the uniqueness check. The scanned lookup at the register is
**client-side** — `listForSale` already loads every sellable item, so the sale screen matches
the scanned code against the in-memory list (no new query, archived/inactive items correctly
won't match).

## Backend — `convex/menu/items.ts`

- `menuItemDoc` + `itemForSale` (the for-sale wrapper's `item`) + `itemDetail` validators: add
  `barcode: v.optional(v.string())`.
- **`create`** + **`update`** args gain `barcode: v.optional(v.string())`. Trim it; treat
  empty/whitespace as unset (don't store `''`). When a non-empty barcode is given, **reject a
  duplicate** within the cafe (query `by_cafe_barcode`; a different non-archived item with the
  same barcode → `'Barcode sudah dipakai item lain.'`). Store/patch it (patch with `undefined`
  clears it when removed).
- `listForSale` + `getById` already spread the item doc / build the wrapper — ensure `barcode`
  flows through (it's part of `menuItemDoc`/`itemForSale.item` once added to the validator).

No new query (client-side match). No schema-derived codegen.

## Frontend

### Item admin — `src/components/menu/item-edit-form.tsx`
Add a **Barcode** `Input` (optional) beside name/price, wired into the form state, passed to
`create`/`update` (`barcode: value.trim() || undefined`). Seed from the `getById` item's
`barcode`. A small hint: scan or type the product barcode.

### Sale — scan-to-cart
- `ItemForSale` (`menu-pane.tsx`) `item` type gains `barcode?: string` (flows from
  `listForSale`).
- **`menu-pane.tsx`**: add a **scan input** at the top of the pane — a `<form>` with an
  `Input` (`placeholder="Scan / ketik barcode…"`, `inputMode="numeric"`, autofocus, a
  `ScanLine`/`Barcode` lucide icon). On submit (Enter — how scanners end), call the parent
  `onScan(code)` and clear the field + refocus (so consecutive scans work). Add an
  `onScan?: (code: string) => void` prop.
- **`sale-screen.tsx`**: pass `onScan` to `MenuPane`:
  ```ts
  function onScan(code: string) {
    const c = code.trim();
    if (!c) return;
    const row = items.find((r) => r.item.barcode === c);
    if (row) onItemTap(row);           // reuse: plain item adds directly; variants/modifiers open the picker
    else toast.error(t`Barcode tidak ditemukan.`);
  }
  ```
  (`items` is the already-loaded `listForSale` result; `onItemTap` exists.)

> Scanner UX: the scanner types the digits fast then Enter into the focused scan field; the
> field stays focused/clears between scans. Tapping items still works (tap is a click).

## Testing
**`tests/convex/menu-items.test.ts`** (extend):
- `create`/`update` with `barcode: '8991234567890'` → stored; `getById`/`listForSale` return it.
- A second item with the **same** barcode in the cafe → rejected; a different cafe with the
  same barcode is allowed (owner-scoped uniqueness).
- `update` clearing the barcode (empty string → unset) leaves no barcode; an item with no
  barcode omits the field.

Frontend (admin input, scan-to-cart add, not-found toast) by typecheck + the sale e2e smoke.

## i18n
New BI: `Barcode`, `Scan / ketik barcode…`, `Barcode tidak ditemukan.`,
`Barcode sudah dipakai item lain.` (server). Run extract, fill `en` (`Barcode`,
`Scan / type barcode…`, `Barcode not found.`), compile.

## Conventions
- Run CI locally: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`; clean tree.
- Do NOT run codegen — schema change derives; `barcode` args/validators are additions to the
  registered `menu/items` module. No new route → no `routeTree.gen.ts` change.
- Small conventional commits; PR → review → merge commit.

## Out of scope
- A global keystroke-buffer scanner listener (use the focused scan field); generating/printing
  barcodes; barcode-by-weight / EAN price-embedded codes; scanning ingredients for stock;
  barcode on variants/modifiers; a hardware scanner config screen.
