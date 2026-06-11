# Menu Item Images Design Spec

**Date:** 2026-06-11
**Branch:** `feat/menu-item-images` (off `main`)

## Context

Menu items are text-only everywhere — the admin items list and the cashier sale
grid show name + price with no photo. Item photos aid recognition (faster ringing
for the cashier, easier setup for the owner). This slice adds an optional image
per item, reusing the existing storage-upload infrastructure (cafe logo / static
QRIS image already use `cafes.generateUploadUrl` + `src/lib/upload.ts`
`uploadToStorage`, and `settings.get` resolves a stored image to a URL the same
way).

The prior `2026-05-31-menu-polish` slice delivered the list/table UX (toolbar,
filters, drag-reorder categories, recipe status). This is a focused follow-on.

## Data model

`menuItems` gains one optional field:
```ts
imageStorageId: v.optional(v.id('_storage')),
```
No other schema change. The stored file is uploaded via the existing
`api.cafes.generateUploadUrl` flow.

## Backend — `convex/menu/items.ts`

Every place that validates a `menuItems` doc must add the new optional field, and
the read paths resolve a display URL (mirroring `settings.get`'s `qrisImageUrl`):

- **`create`** args gain `imageStorageId: v.optional(v.id('_storage'))`; insert it
  when present.
- **`update`** args gain `imageStorageId: v.optional(v.id('_storage'))`; patch it
  (Convex `patch` with `imageStorageId: undefined` clears the field, so passing
  `undefined` removes the image).
- **`list`** (`menuItemWithStatus`): add `imageStorageId: v.optional(v.id('_storage'))`
  to the validator AND a resolved `imageUrl: v.union(v.string(), v.null())`
  (`item.imageStorageId ? await ctx.storage.getUrl(item.imageStorageId) : null`).
- **`listForSale`** (`itemForSale` wrapper): the `item` doc validator adds
  `imageStorageId` optional; add a resolved `imageUrl: v.union(v.string(), v.null())`
  to the wrapper `{ item, attachedGroups, lowStockIngredientNames, imageUrl }`.
- **`getById`** (`itemDetail`): the `item` doc validator adds `imageStorageId`
  optional; add resolved `imageUrl` so the edit form can preview the current image.

> The frontend displays `imageUrl` (resolved); only the edit form holds
> `imageStorageId` (to set/clear). Per-item `storage.getUrl` on `listForSale` is
> the cashier hot path — acceptable at typical menu sizes (tens of items); noted.

## Frontend

### Item edit form (`src/components/menu/item-edit-form.tsx`)

Add an image control beside name/price, reusing the logo/QRIS pattern:
- A file input → `uploadToStorage(generateUploadUrl, file)` (`~/lib/upload`,
  `api.cafes.generateUploadUrl`) → store the returned id in form state
  `imageStorageId`.
- Preview: the current `imageUrl` (from `getById`) or the freshly-uploaded one;
  "Ganti gambar" / "Hapus gambar" (clearing sets the form's `imageStorageId` to
  undefined).
- On save, pass `imageStorageId` to `create`/`update`. The form props gain
  `initial.imageStorageId?` / `initial.imageUrl?` (wired from the `getById`
  detail in `items.$itemId.tsx`).

### Admin items list (`src/routes/_pos/menu/index.tsx`)

In the DataTable's Nama cell, render a small leading thumbnail (`size-8` rounded,
`object-cover`) from `imageUrl`, with a placeholder (the item's initial in a muted
box) when none.

### Cashier sale grid (`src/components/sale/menu-pane.tsx`)

Each item card/button shows its `imageUrl` thumbnail (a small image area, with a
placeholder when none), above/beside the name + price. Keep the existing tap
behavior (`onItemTap`). The `ItemForSale` type gains `imageUrl?: string | null`.

## Testing

- **`items.create`/`update`** (convex-test): persist `imageStorageId`; `update`
  with `imageStorageId: undefined` clears it.
- **`items.list` / `getById` / `listForSale`**: resolve `imageUrl` — store a blob
  via `ctx.storage.store(new Blob([...]))`, set it on an item, assert `imageUrl`
  is a non-null string; assert `null` when no image.
- Frontend (edit-form upload, list/grid thumbnails) validated by typecheck + the
  existing menu e2e flow.

## i18n

New Bahasa Indonesia strings: `Gambar item` (and reuse existing `Unggah gambar` /
`Ganti gambar` / `Hapus gambar` from the QRIS settings if already in the catalog —
extract will report what's actually missing). Fill `en`.

## Conventions

- Run CI locally before push: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`;
  confirm `git status` clean.
- Do NOT run `convex codegen` (`menu/items` already registered; only new fields/
  optional args). No new route → no `routeTree.gen.ts` change.
- `fetch` (in `uploadToStorage`) is client-side; `storage.getUrl` is server-side in
  queries.
- Small conventional commits; PR → review → merge commit.

## Out of scope

- Image resize/crop/optimization (display as `object-cover` thumbnails; recommend a
  square image); a dedicated image library/picker; images for categories or
  modifier options; bulk image upload.
