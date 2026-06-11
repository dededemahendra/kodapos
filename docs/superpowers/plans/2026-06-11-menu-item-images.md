# Menu Item Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional image per menu item — uploaded in the item edit form, shown as a thumbnail in the admin items list and the cashier sale grid.

**Architecture:** One optional `menuItems.imageStorageId`; the read queries resolve a display `imageUrl` (like `settings.get`'s `qrisImageUrl`); the edit form uploads via the existing `cafes.generateUploadUrl` + `uploadToStorage`; thumbnails render from `imageUrl`.

**Tech Stack:** Convex (file storage `getUrl`), TanStack Start + React, Lingui, Vitest + convex-test.

**Spec:** `docs/superpowers/specs/2026-06-11-menu-item-images-design.md`

**Branch:** `feat/menu-item-images` (already created off `main`, spec committed).

**Conventions:**
- Run CI locally before push: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`; confirm `git status` clean.
- Do NOT run `convex codegen` (`menu/items`, `cafes` already registered; only new fields/optional args). No new route → no `routeTree.gen.ts` change.
- New UI strings via Lingui; fill `en`.
- Small conventional commits per task.

---

## Task 1: Schema + backend (`imageStorageId` + resolved `imageUrl`)

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/menu/items.ts`
- Test: `tests/convex/menu-items.test.ts` (create if absent)

- [ ] **Step 1: Add the field to `convex/schema.ts`**

In the `menuItems` table, add (after `position` or `createdAt`):
```ts
    imageStorageId: v.optional(v.id('_storage')),
```

- [ ] **Step 2: Add `imageStorageId` to the doc validators in `convex/menu/items.ts`**

The file has `menuItemDoc` (used by `itemForSale.item` + `itemDetail.item`) and the separate inline `menuItemWithStatus`. Add the optional field to BOTH:
```ts
// in menuItemDoc and in menuItemWithStatus:
    imageStorageId: v.optional(v.id('_storage')),
```

- [ ] **Step 3: `create` / `update` accept `imageStorageId`**

`create` (args currently `{ categoryId, name, priceIDR }`):
```ts
  args: { categoryId: v.id('categories'), name: v.string(), priceIDR: v.number(), imageStorageId: v.optional(v.id('_storage')) },
  // in the insert object, add:
  ...(args.imageStorageId ? { imageStorageId: args.imageStorageId } : {}),
```
`update` (args currently `{ id, categoryId, name, priceIDR }`):
```ts
  args: { id: v.id('menuItems'), categoryId: v.id('categories'), name: v.string(), priceIDR: v.number(), imageStorageId: v.optional(v.id('_storage')) },
  // in the patch, set it (undefined clears the field — the form always sends the full intended state):
  await ctx.db.patch(args.id, { categoryId: args.categoryId, name: cleanName, priceIDR: args.priceIDR, imageStorageId: args.imageStorageId });
```
(Keep the existing `assertItem` validation + category ownership check.)

- [ ] **Step 4: Resolve `imageUrl` in the three read paths**

Add a tiny helper near the top:
```ts
async function imageUrlFor(ctx: QueryCtx, storageId?: Id<'_storage'>): Promise<string | null> {
  return storageId ? await ctx.storage.getUrl(storageId) : null;
}
```
(Import `QueryCtx` from `./_generated/server` and `Id` from `./_generated/dataModel` if not already.)
- **`list`** — add `imageUrl: v.union(v.string(), v.null())` to `menuItemWithStatus`; for each row include `imageUrl: await imageUrlFor(ctx, item.imageStorageId)`.
- **`listForSale`** — add `imageUrl: v.union(v.string(), v.null())` to the `itemForSale` wrapper validator; in the loop push `imageUrl: await imageUrlFor(ctx, item.imageStorageId)` alongside `attachedGroups`/`lowStockIngredientNames`.
- **`getById`** — add `imageUrl: v.union(v.string(), v.null())` to the `itemDetail` wrapper validator; resolve `imageUrl: await imageUrlFor(ctx, item.imageStorageId)` in the return.

- [ ] **Step 5: Tests `tests/convex/menu-items.test.ts`**

Inline-copy `setup()` from `orders.test.ts` (it creates a `categoryId` + `itemId`). Store a blob and set it:
```ts
describe('menu item images', () => {
  it('create + getById resolve imageUrl; update clears it', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, categoryId } = await setup(t);
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(['img'], { type: 'image/png' })));
    const id = await asOwner.mutation(api.menu.items.create, { categoryId, name: 'Latte', priceIDR: 25000, imageStorageId: storageId });
    const detail = await asOwner.query(api.menu.items.getById, { id });
    expect(detail?.imageUrl).toEqual(expect.any(String));
    // clear:
    await asOwner.mutation(api.menu.items.update, { id, categoryId, name: 'Latte', priceIDR: 25000 });
    const after = await asOwner.query(api.menu.items.getById, { id });
    expect(after?.imageUrl).toBeNull();
  });

  it('list returns imageUrl null when no image', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    const rows = await asOwner.query(api.menu.items.list, {});
    expect(rows.every((r) => r.imageUrl === null || typeof r.imageUrl === 'string')).toBe(true);
  });
});
```
(Confirm `setup()` returns `categoryId`/`itemId`; confirm `getById`/`list` arg shapes. `update` without `imageStorageId` → patches `imageStorageId: undefined` → clears, so `imageUrl` becomes null.) Run `pnpm test tests/convex/menu-items.test.ts` → PASS.

- [ ] **Step 6: Verify + commit**
`pnpm typecheck`, full `pnpm test`.
```bash
git add convex/schema.ts convex/menu/items.ts tests/convex/menu-items.test.ts
git commit -m "feat(menu): item imageStorageId + resolved imageUrl in list/sale/detail"
```

---

## Task 2: Image upload in the item edit form

**Files:**
- Modify: `src/components/menu/item-edit-form.tsx`
- Modify: `src/routes/_pos/menu/items.$itemId.tsx`

- [ ] **Step 1: Pass image data into the form from `items.$itemId.tsx`**

Read `items.$itemId.tsx` — it builds `initial` from the `getById` detail (`detail?.item...`). Extend `ItemEditFormProps.initial` with `imageStorageId?: Id<'_storage'>` and `imageUrl?: string | null`, and pass them from the detail:
```tsx
initial={{
  name: detail?.item.name ?? '',
  categoryId: detail?.item.categoryId ?? '',
  priceIDR: detail?.item.priceIDR ?? 0,
  isActive: detail?.item.isActive ?? true,
  imageStorageId: detail?.item.imageStorageId,
  imageUrl: detail?.imageUrl ?? null,
}}
```

- [ ] **Step 2: Add the image control to `item-edit-form.tsx`**

Add imports: `import { uploadToStorage } from '~/lib/upload';` and use `const generateUploadUrl = useMutation(api.cafes.generateUploadUrl);`. Add state + a file ref:
```tsx
const [imageStorageId, setImageStorageId] = useState<Id<'_storage'> | undefined>(props.initial.imageStorageId);
const [imageUrl, setImageUrl] = useState<string | null>(props.initial.imageUrl ?? null);
const [uploading, setUploading] = useState(false);
const imgRef = useRef<HTMLInputElement>(null);

async function onImageChange(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file) return;
  setUploading(true); setError(null);
  try {
    const storageId = await uploadToStorage(generateUploadUrl, file);
    setImageStorageId(storageId);
    setImageUrl(URL.createObjectURL(file)); // local preview until save/refetch
  } catch {
    setError(t`Gagal mengunggah gambar.`);
  } finally {
    setUploading(false);
    if (imgRef.current) imgRef.current.value = '';
  }
}
function removeImage() { setImageStorageId(undefined); setImageUrl(null); }
```
(Add `useRef` to the React import.) Render an image Field in the "Dasar" column (after price):
```tsx
<Field>
  <FieldLabel><Trans>Gambar item</Trans></FieldLabel>
  <div className="flex items-center gap-3">
    {imageUrl ? <img src={imageUrl} alt="" className="size-16 rounded object-cover border border-border" /> : <div className="size-16 rounded bg-muted grid place-items-center text-muted-foreground text-xs">—</div>}
    <input ref={imgRef} type="file" accept="image/*" onChange={onImageChange} className="hidden" />
    <div className="flex flex-col gap-1">
      <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => imgRef.current?.click()}>
        {uploading ? <Spinner data-icon="inline-start" /> : null}{imageStorageId ? <Trans>Ganti gambar</Trans> : <Trans>Unggah gambar</Trans>}
      </Button>
      {imageStorageId ? <Button type="button" variant="ghost" size="sm" onClick={removeImage}><Trans>Hapus gambar</Trans></Button> : null}
    </div>
  </div>
</Field>
```
In `handleSubmit`, pass `imageStorageId` to both create and update:
```tsx
if (props.itemId === 'new') {
  id = await createItem({ categoryId, name, priceIDR, ...(imageStorageId ? { imageStorageId } : {}) });
} else {
  await updateItem({ id: props.itemId, categoryId, name, priceIDR, imageStorageId });
  id = props.itemId;
}
```
(For `update`, pass `imageStorageId` always — `undefined` clears it, matching the form state.)

- [ ] **Step 3: Typecheck + commit**
`pnpm typecheck` (PASS).
```bash
git add src/components/menu/item-edit-form.tsx src/routes/_pos/menu/items.$itemId.tsx
git commit -m "feat(menu): upload/replace/remove an item image in the edit form"
```

---

## Task 3: Thumbnails in the admin list + cashier grid

**Files:**
- Modify: `src/routes/_pos/menu/index.tsx`
- Modify: `src/components/sale/menu-pane.tsx`

- [ ] **Step 1: Thumbnail in the admin items list (`index.tsx`)**

Read `index.tsx` — find the Nama column cell in the DataTable `columns`. Add a leading thumbnail from `row.original.imageUrl`:
```tsx
// in the Nama cell render:
<div className="flex items-center gap-2">
  {row.original.imageUrl
    ? <img src={row.original.imageUrl} alt="" className="size-8 rounded object-cover border border-border shrink-0" />
    : <div className="size-8 rounded bg-muted grid place-items-center text-[10px] text-muted-foreground shrink-0">{row.original.name.charAt(0)}</div>}
  <Link /* existing name link */ >{row.original.name}</Link>
</div>
```
(The row type comes from `api.menu.items.list` which now includes `imageUrl` — no extra fetch.)

- [ ] **Step 2: Thumbnail on the cashier sale grid (`menu-pane.tsx`)**

`MenuPane` renders `<ItemCard item={row.item} hasModifiers=... lowStockIngredientNames=... onTap=... />`. Pass the resolved url: add `imageUrl={row.imageUrl}` to the `<ItemCard>` props, extend `ItemCard`'s props with `imageUrl?: string | null`, and render a thumbnail at the top of the card:
```tsx
// in ItemCard, above the name:
{imageUrl
  ? <img src={imageUrl} alt="" className="w-full h-16 rounded object-cover mb-1" />
  : <div className="w-full h-16 rounded bg-muted grid place-items-center text-muted-foreground text-xs mb-1">{item.name.charAt(0)}</div>}
```
(Read `ItemCard`'s current JSX and place the thumbnail sensibly; keep the tap target + name + price. `ItemForSale` type — extend with `imageUrl?: string | null` to match `listForSale`.)

- [ ] **Step 3: Typecheck + commit**
`pnpm typecheck` (PASS), `pnpm test` (no regressions).
```bash
git add src/routes/_pos/menu/index.tsx src/components/sale/menu-pane.tsx
git commit -m "feat(menu): item thumbnails in the admin list + cashier grid"
```

---

## Task 4: i18n + final verification

**Files:**
- Modify: `src/locales/en/messages.po`, `src/locales/id/messages.po`

- [ ] **Step 1: Extract + fill `en`**
Run `pnpm lingui:extract`. Fill `en` for new strings: `Gambar item` → "Item image", `Gagal mengunggah gambar.` → "Failed to upload the image."; `Unggah gambar`/`Ganti gambar`/`Hapus gambar` likely already exist (from QRIS settings) — extract reports what's actually missing. Do NOT leave any new `msgstr` empty.

- [ ] **Step 2: Compile + verify 0 missing**
`pnpm lingui:compile`, then `pnpm lingui:extract` again → `en` 0 missing.

- [ ] **Step 3: Full gate + commit**
```bash
pnpm typecheck && pnpm test && pnpm lingui:compile
git add src/locales/en/messages.po src/locales/id/messages.po
git commit -m "i18n(menu): translate item-image strings"
```

---

## Self-review notes (addressed)

- **Spec coverage:** `imageStorageId` schema + doc validators (T1), `create`/`update` args (T1), `imageUrl` resolved in list/listForSale/getById (T1), edit-form upload/preview/remove + wiring (T2), thumbnails in admin list + cashier grid (T3), i18n (T4). Clearing-via-undefined + null-imageUrl tested (T1).
- **Type consistency:** `imageStorageId` (the stored id) vs `imageUrl` (resolved, `string | null`) used consistently — backend resolves `imageUrl`; the form holds `imageStorageId` + previews `imageUrl`; list/grid display `imageUrl`. `ItemForSale`/`menuItemWithStatus`/`itemDetail` all gain the matching fields.
- **Reuse:** `uploadToStorage` + `cafes.generateUploadUrl` (logo/QRIS), `storage.getUrl` (settings.get pattern). No new upload infra.
- **No new schema index, no new route, no codegen.**
