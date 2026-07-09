# Register barcode-scan hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make register barcode scanning reliable and complete — resolve any sellable product (via a backend fallback), support per-variant barcodes that scan straight to a variant line, and give cashiers a clear hit/miss signal.

**Architecture:** Barcodes already live on `menuItems.barcode`. This slice adds `barcode` to `menuItemVariants` (which already carries `cafeId`), a per-cafe `by_cafe_barcode` index on variants, a `getByBarcode` query that resolves item-or-variant within the caller's outlet, and a register `onScan` that matches loaded rows in-memory first (items + variants) and falls back to `getByBarcode` on a miss. A scanned variant adds that variant line directly unless the parent item has modifier groups, in which case it opens the existing picker pre-selected. Feedback is a Web Audio beep + a brief input flash.

**Tech Stack:** Convex (query/mutation new-function syntax with `args`/`returns` validators, indexed queries), convex-test + vitest, TanStack Router + React, shadcn UI, Lingui i18n, Web Audio API.

## Global Constraints

- Convex rules: read `convex/_generated/ai/guidelines.md` first; use the new function syntax with `args`/`returns` validators; never write explicit `undefined` (spread conditionally for `exactOptionalPropertyTypes`); prefer indexed queries over `.filter`.
- Codegen: after adding/removing Convex functions run `./node_modules/.bin/convex codegen` and commit the tracked `convex/_generated` files (npx is broken by a shell hook).
- CI gates (run locally before push): `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`. Run `pnpm lingui:extract` after adding UI strings and fill the `en` translations.
- Copy rules for any user-facing string: Indonesian source + English translation, NO em-dash (—) or `--` (use commas/periods/parentheses), shadcn primitives.
- Read-only invariant does not apply here (this is register write flow), but tenancy does: every Convex handler scopes via `requireActiveOutlet(ctx)` / `requireOwned(ctx, cafeId, id, label)`.
- Barcode uniqueness invariant: a code is unique across BOTH `menuItems.barcode` and `menuItemVariants.barcode` within one cafe. Error copy stays Indonesian ("Barcode sudah dipakai ...").
- Route tree: no new routes; do NOT touch `src/routeTree.gen.ts`.
- Commits: small and conventional; end messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## File structure

- Modify `convex/schema.ts` — add `barcode` + `by_cafe_barcode` index to `menuItemVariants`.
- Modify `convex/menu/items.ts` — extend `assertBarcodeUnique`/`isBarcodeFree` to also check variants; add `getByBarcode` query; add `barcode` to `variantForSale` validator + `listForSale` mapping.
- Modify `convex/menu/variants.ts` — accept `barcode` on `create`/`update`; add it to `variantDoc`; add `assignBarcode` mutation for a variant.
- Modify `src/components/sale/menu-pane.tsx` — add `barcode` to the `ItemForSale` variant shape.
- Modify `src/components/sale/sale-screen.tsx` — new `onScan` resolution (in-memory items+variants → backend fallback → variant-direct-add vs picker) + scan feedback wiring.
- Create `src/lib/scan-feedback.ts` — Web Audio beep helper (success/error tones) with an in-session mute default ON.
- Modify `src/components/menu/item-edit-form.tsx` — per-variant barcode input + auto-generate in `VariantEditRow`.
- Tests: `tests/convex/menu/variants.test.ts` (extend), `tests/convex/menu/items.test.ts` (extend) — or a focused new `tests/convex/menu/barcode.test.ts` for `getByBarcode`.

---

### Task 1: `menuItemVariants.barcode` field + index

**Files:**
- Modify: `convex/schema.ts:203-213`

**Interfaces:**
- Produces: `menuItemVariants` gains `barcode?: string` and index `by_cafe_barcode` on `['cafeId','barcode']`.

- [ ] **Step 1: Add the field + index** in `convex/schema.ts`, replacing the `menuItemVariants` block:

```ts
  menuItemVariants: defineTable({
    cafeId: v.id('cafes'),
    menuItemId: v.id('menuItems'),
    name: v.string(), // "S" / "M" / "L"
    priceIDR: v.number(), // absolute price for this variant
    position: v.number(),
    archived: v.boolean(),
    createdAt: v.number(),
    barcode: v.optional(v.string()),
  })
    .index('by_item_active', ['menuItemId', 'archived', 'position'])
    .index('by_cafe_item', ['cafeId', 'menuItemId'])
    .index('by_cafe_barcode', ['cafeId', 'barcode']),
```

- [ ] **Step 2: Codegen + typecheck**

Run: `./node_modules/.bin/convex codegen && pnpm typecheck`
Expected: clean (no functions use the field yet).

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts convex/_generated
git commit -m "feat(scan): add barcode field + index to menuItemVariants"
```

---

### Task 2: Barcode uniqueness spans items + variants

Extend the existing item-only uniqueness guard so a code used by a variant also collides, and vice versa. This is a pure refactor of the guard plus new tests; no caller changes yet.

**Files:**
- Modify: `convex/menu/items.ts:111-132` (`isBarcodeFree`, `assertBarcodeUnique`)
- Test: `tests/convex/menu/items.test.ts`

**Interfaces:**
- Consumes: `menuItemVariants.by_cafe_barcode` (Task 1).
- Produces: `assertBarcodeUnique(ctx, cafeId, barcode, opts?)` where `opts?: { itemId?: Id<'menuItems'>; variantId?: Id<'menuItemVariants'> }` — the row being edited is excluded so re-saving it is allowed. `isBarcodeFree` gains the same `opts`.

- [ ] **Step 1: Write the failing test** — append to `tests/convex/menu/items.test.ts`. The variant is seeded via a raw `ctx.db.insert` so this task stays independent of Task 3's variant `barcode` arg:

```ts
it('rejects an item barcode already used by a variant in the same cafe', async () => {
  const t = convexTest(schema, modules);
  const { asOwner, categoryId } = await setupOwnerAndCategory(t);
  const itemId = await asOwner.mutation(api.menu.items.create, {
    categoryId,
    name: 'Latte',
    priceIDR: 25000,
  });
  // Seed a variant carrying the barcode directly (Task 3 adds the mutation arg).
  await t.run(async (ctx) => {
    const item = await ctx.db.get(itemId);
    if (!item) throw new Error('seed item missing');
    await ctx.db.insert('menuItemVariants', {
      cafeId: item.cafeId,
      menuItemId: itemId,
      name: 'L',
      priceIDR: 30000,
      position: 0,
      archived: false,
      createdAt: 0,
      barcode: '111222333',
    });
  });
  await expect(
    asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Kopi Lain',
      priceIDR: 20000,
      barcode: '111222333',
    })
  ).rejects.toThrow('Barcode sudah dipakai');
});
```

- [ ] **Step 2: Run, expect FAIL** — Run: `./node_modules/.bin/vitest run tests/convex/menu/items.test.ts` — Expected: FAIL (the guard only checks `menuItems`, so the item create wrongly succeeds).

- [ ] **Step 3: Rewrite the guard** in `convex/menu/items.ts`, replacing `isBarcodeFree` + `assertBarcodeUnique` (lines 108-132):

```ts
// A barcode must be unique across BOTH menuItems and menuItemVariants within a
// cafe, so a scan resolves to exactly one target. Query each by_cafe_barcode
// index, ignore archived rows and the row currently being edited.
async function isBarcodeFree(
  ctx: QueryCtx,
  cafeId: Id<'cafes'>,
  barcode: string,
  opts?: { itemId?: Id<'menuItems'>; variantId?: Id<'menuItemVariants'> }
): Promise<boolean> {
  const itemMatches = await ctx.db
    .query('menuItems')
    .withIndex('by_cafe_barcode', (q) => q.eq('cafeId', cafeId).eq('barcode', barcode))
    .collect();
  if (itemMatches.some((m) => !m.archived && m._id !== opts?.itemId)) return false;
  const variantMatches = await ctx.db
    .query('menuItemVariants')
    .withIndex('by_cafe_barcode', (q) => q.eq('cafeId', cafeId).eq('barcode', barcode))
    .collect();
  if (variantMatches.some((m) => !m.archived && m._id !== opts?.variantId)) return false;
  return true;
}

async function assertBarcodeUnique(
  ctx: QueryCtx,
  cafeId: Id<'cafes'>,
  barcode: string,
  opts?: { itemId?: Id<'menuItems'>; variantId?: Id<'menuItemVariants'> }
): Promise<void> {
  if (!(await isBarcodeFree(ctx, cafeId, barcode, opts)))
    throw new Error('Barcode sudah dipakai item lain.');
}
```

- [ ] **Step 4: Update existing callers in `items.ts`** to the new `opts` signature:
  - `create` (line 220): `if (bc) await assertBarcodeUnique(ctx, cafeId, bc);` — unchanged (no opts).
  - `update` (line 260): `if (bc) await assertBarcodeUnique(ctx, cafeId, bc, { itemId: args.id });`
  - `assignOneBarcode` (line 151): `if (await isBarcodeFree(ctx, cafeId, bc)) {` — unchanged.

- [ ] **Step 5: Run test, expect PASS** — Run: `./node_modules/.bin/vitest run tests/convex/menu/items.test.ts` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add convex/menu/items.ts tests/convex/menu/items.test.ts
git commit -m "feat(scan): barcode uniqueness spans items and variants"
```

---

### Task 3: Variant create/update accept a barcode + assign mutation

**Files:**
- Modify: `convex/menu/variants.ts`
- Test: `tests/convex/menu/variants.test.ts`

**Interfaces:**
- Consumes: `assertBarcodeUnique` with `opts` (Task 2); `genBarcode`/`isBarcodeFree` are private to `items.ts` — do NOT import them; for variant auto-generate, replicate a minimal digits generator locally (see Step 4) to avoid cross-file coupling.
- Produces: `api.menu.variants.create({ menuItemId, name, priceIDR, barcode? })`, `api.menu.variants.update({ id, name, priceIDR, barcode? })`, `api.menu.variants.assignBarcode({ id }) -> string`. `variantDoc` gains `barcode: v.optional(v.string())`.

- [ ] **Step 1: Write failing tests** — append to `tests/convex/menu/variants.test.ts` (mirror the file's existing owner-setup helper):

```ts
it('create stores a barcode and rejects a duplicate', async () => {
  const t = convexTest(schema, modules);
  const { asOwner, itemId } = await setupOwnerItem(t); // existing helper in this file
  await asOwner.mutation(api.menu.variants.create, {
    menuItemId: itemId,
    name: 'S',
    priceIDR: 20000,
    barcode: '900900900',
  });
  const list = await asOwner.query(api.menu.variants.listForItem, { menuItemId: itemId });
  expect(list[0]?.barcode).toBe('900900900');
  await expect(
    asOwner.mutation(api.menu.variants.create, {
      menuItemId: itemId,
      name: 'M',
      priceIDR: 24000,
      barcode: '900900900',
    })
  ).rejects.toThrow('Barcode sudah dipakai');
});

it('assignBarcode gives a variant a fresh code and refuses if it already has one', async () => {
  const t = convexTest(schema, modules);
  const { asOwner, itemId } = await setupOwnerItem(t);
  const variantId = await asOwner.mutation(api.menu.variants.create, {
    menuItemId: itemId,
    name: 'S',
    priceIDR: 20000,
  });
  const code = await asOwner.mutation(api.menu.variants.assignBarcode, { id: variantId });
  expect(code).toMatch(/^\d{12}$/);
  await expect(
    asOwner.mutation(api.menu.variants.assignBarcode, { id: variantId })
  ).rejects.toThrow('sudah punya barcode');
});
```

If `setupOwnerItem` does not exist in the file, add it near the top mirroring `items.test.ts`'s `setupOwnerAndCategory`, creating a category + one item and returning `{ asOwner, itemId }`.

- [ ] **Step 2: Run, expect FAIL** — Run: `./node_modules/.bin/vitest run tests/convex/menu/variants.test.ts` — Expected: FAIL (`barcode` arg rejected / `assignBarcode` undefined).

- [ ] **Step 3: Export the uniqueness guard from `items.ts`** so variants can reuse it. In `convex/menu/items.ts`, change `async function assertBarcodeUnique` to `export async function assertBarcodeUnique`.

- [ ] **Step 4: Implement in `convex/menu/variants.ts`.** Add imports and rewrite `variantDoc`, `create`, `update`, and add `assignBarcode`:

```ts
import { assertBarcodeUnique } from './items';

const variantDoc = v.object({
  _id: v.id('menuItemVariants'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  menuItemId: v.id('menuItems'),
  name: v.string(),
  priceIDR: v.number(),
  position: v.number(),
  archived: v.boolean(),
  createdAt: v.number(),
  barcode: v.optional(v.string()),
});

// 12 random digits (Web Crypto). Digits-only so Code128 + handheld scanners
// handle it cleanly. Mirrors the item generator; kept local to avoid coupling.
function genVariantBarcode(): string {
  const a = new Uint8Array(12);
  globalThis.crypto.getRandomValues(a);
  return Array.from(a, (b) => String(b % 10)).join('');
}
```

`create` — add `barcode` to args and set it:

```ts
export const create = mutation({
  args: {
    menuItemId: v.id('menuItems'),
    name: v.string(),
    priceIDR: v.number(),
    barcode: v.optional(v.string()),
  },
  returns: v.id('menuItemVariants'),
  handler: async (ctx, args) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    await requireOwned(ctx, cafeId, args.menuItemId, 'Item');
    const cleanName = assertVariant(args.name, args.priceIDR);
    const bc = args.barcode?.trim();
    if (bc) await assertBarcodeUnique(ctx, cafeId, bc);
    const existing = await ctx.db
      .query('menuItemVariants')
      .withIndex('by_item_active', (q) =>
        q.eq('menuItemId', args.menuItemId).eq('archived', false)
      )
      .collect();
    const position =
      existing.length === 0 ? 0 : Math.max(...existing.map((x) => x.position)) + 1;
    return await ctx.db.insert('menuItemVariants', {
      cafeId,
      menuItemId: args.menuItemId,
      name: cleanName,
      priceIDR: args.priceIDR,
      position,
      archived: false,
      createdAt: Date.now(),
      ...(bc ? { barcode: bc } : {}),
    });
  },
});
```

`update` — add `barcode` to args, validate against the variant's own cafe, patch (empty string clears it):

```ts
export const update = mutation({
  args: {
    id: v.id('menuItemVariants'),
    name: v.string(),
    priceIDR: v.number(),
    barcode: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    await requireOwned(ctx, cafeId, args.id, 'Varian');
    const cleanName = assertVariant(args.name, args.priceIDR);
    const bc = args.barcode?.trim();
    if (bc) await assertBarcodeUnique(ctx, cafeId, bc, { variantId: args.id });
    await ctx.db.patch(args.id, {
      name: cleanName,
      priceIDR: args.priceIDR,
      barcode: bc || undefined,
    });
    return null;
  },
});
```

`assignBarcode` — new mutation (after `archive`):

```ts
export const assignBarcode = mutation({
  args: { id: v.id('menuItemVariants') },
  returns: v.string(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const variant = await requireOwned(ctx, cafeId, id, 'Varian');
    if (variant.barcode) throw new Error('Varian sudah punya barcode.');
    for (let attempt = 0; attempt < 8; attempt++) {
      const bc = genVariantBarcode();
      try {
        await assertBarcodeUnique(ctx, cafeId, bc);
      } catch {
        continue;
      }
      await ctx.db.patch(id, { barcode: bc });
      return bc;
    }
    throw new Error('Gagal membuat barcode unik.');
  },
});
```

- [ ] **Step 5: Codegen + run both test files** — Run: `./node_modules/.bin/convex codegen && ./node_modules/.bin/vitest run tests/convex/menu/variants.test.ts tests/convex/menu/items.test.ts` — Expected: PASS (this also greens Task 2's test).

- [ ] **Step 6: Commit**

```bash
git add convex/menu/variants.ts convex/menu/items.ts convex/_generated tests/convex/menu/variants.test.ts tests/convex/menu/items.test.ts
git commit -m "feat(scan): variant barcodes on create/update + assignBarcode"
```

---

### Task 4: `getByBarcode` resolution query

**Files:**
- Modify: `convex/menu/items.ts` (add query near `getById`)
- Test: `tests/convex/menu/items.test.ts`

**Interfaces:**
- Consumes: `menuItems.by_cafe_barcode`, `menuItemVariants.by_cafe_barcode`.
- Produces: `api.menu.items.getByBarcode({ barcode }) -> { kind: 'item', itemId } | { kind: 'variant', itemId, variantId } | null`. Resolution order: item first, then variant. Active/non-archived only.

- [ ] **Step 1: Write failing tests** — append to `tests/convex/menu/items.test.ts`:

```ts
it('getByBarcode resolves an item, a variant, and null for unknown', async () => {
  const t = convexTest(schema, modules);
  const { asOwner, categoryId } = await setupOwnerAndCategory(t);
  const itemId = await asOwner.mutation(api.menu.items.create, {
    categoryId,
    name: 'Latte',
    priceIDR: 25000,
    barcode: '111000111',
  });
  const variantId = await asOwner.mutation(api.menu.variants.create, {
    menuItemId: itemId,
    name: 'L',
    priceIDR: 30000,
    barcode: '222000222',
  });
  expect(await asOwner.query(api.menu.items.getByBarcode, { barcode: '111000111' })).toEqual({
    kind: 'item',
    itemId,
  });
  expect(await asOwner.query(api.menu.items.getByBarcode, { barcode: '222000222' })).toEqual({
    kind: 'variant',
    itemId,
    variantId,
  });
  expect(await asOwner.query(api.menu.items.getByBarcode, { barcode: 'nope' })).toBeNull();
});

it('getByBarcode is tenant-isolated', async () => {
  const t = convexTest(schema, modules);
  const { asOwner, categoryId } = await setupOwnerAndCategory(t, 'a@x.com');
  await asOwner.mutation(api.menu.items.create, {
    categoryId,
    name: 'Latte',
    priceIDR: 25000,
    barcode: '333000333',
  });
  const { asOwner: asOther } = await setupOwnerAndCategory(t, 'b@x.com');
  expect(await asOther.query(api.menu.items.getByBarcode, { barcode: '333000333' })).toBeNull();
});
```

- [ ] **Step 2: Run, expect FAIL** — Run: `./node_modules/.bin/vitest run tests/convex/menu/items.test.ts` — Expected: FAIL (`getByBarcode` undefined).

- [ ] **Step 3: Implement the query** in `convex/menu/items.ts` (after `getById`):

```ts
const barcodeHit = v.union(
  v.object({ kind: v.literal('item'), itemId: v.id('menuItems') }),
  v.object({
    kind: v.literal('variant'),
    itemId: v.id('menuItems'),
    variantId: v.id('menuItemVariants'),
  }),
  v.null()
);

export const getByBarcode = query({
  args: { barcode: v.string() },
  returns: barcodeHit,
  handler: async (ctx, { barcode }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const code = barcode.trim();
    if (!code) return null;
    // Item first: a sellable item is active + not archived.
    const items = await ctx.db
      .query('menuItems')
      .withIndex('by_cafe_barcode', (q) => q.eq('cafeId', cafeId).eq('barcode', code))
      .collect();
    const item = items.find((i) => i.isActive && !i.archived);
    if (item) return { kind: 'item' as const, itemId: item._id };
    // Then variant: not archived, and its parent item must be sellable.
    const variants = await ctx.db
      .query('menuItemVariants')
      .withIndex('by_cafe_barcode', (q) => q.eq('cafeId', cafeId).eq('barcode', code))
      .collect();
    for (const variant of variants) {
      if (variant.archived) continue;
      const parent = await ctx.db.get(variant.menuItemId);
      if (parent && parent.isActive && !parent.archived) {
        return { kind: 'variant' as const, itemId: parent._id, variantId: variant._id };
      }
    }
    return null;
  },
});
```

- [ ] **Step 4: Codegen + run test, expect PASS** — Run: `./node_modules/.bin/convex codegen && ./node_modules/.bin/vitest run tests/convex/menu/items.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/menu/items.ts convex/_generated tests/convex/menu/items.test.ts
git commit -m "feat(scan): getByBarcode item-or-variant resolution query"
```

---

### Task 5: Expose variant `barcode` to the register (`listForSale`)

**Files:**
- Modify: `convex/menu/items.ts:66-70` (`variantForSale`), `:553-557` (`listForSale` variant mapping)
- Modify: `src/components/sale/menu-pane.tsx:23` (`ItemForSale` variant type)
- Test: `tests/convex/menu/items.test.ts`

**Interfaces:**
- Produces: `listForSale` variants now include `barcode: v.optional(v.string())`. Client `ItemForSale.variants[]` gains `barcode?: string`.

- [ ] **Step 1: Write the failing test** — append to `tests/convex/menu/items.test.ts`:

```ts
it('listForSale exposes variant barcodes', async () => {
  const t = convexTest(schema, modules);
  const { asOwner, categoryId } = await setupOwnerAndCategory(t);
  const itemId = await asOwner.mutation(api.menu.items.create, {
    categoryId,
    name: 'Latte',
    priceIDR: 25000,
  });
  await asOwner.mutation(api.menu.variants.create, {
    menuItemId: itemId,
    name: 'L',
    priceIDR: 30000,
    barcode: '444000444',
  });
  const rows = await asOwner.query(api.menu.items.listForSale, {});
  expect(rows[0]?.variants[0]?.barcode).toBe('444000444');
});
```

- [ ] **Step 2: Run, expect FAIL** — Run: `./node_modules/.bin/vitest run tests/convex/menu/items.test.ts` — Expected: FAIL (validator strips `barcode`).

- [ ] **Step 3: Add `barcode` to the `variantForSale` validator** (`convex/menu/items.ts:66`):

```ts
const variantForSale = v.object({
  _id: v.id('menuItemVariants'),
  name: v.string(),
  priceIDR: v.number(),
  barcode: v.optional(v.string()),
});
```

- [ ] **Step 4: Include `barcode` in the `listForSale` mapping** (`convex/menu/items.ts:553`), replacing the variants map:

```ts
      const variants = (await resolveActiveVariants(ctx, item._id)).map((vr) => ({
        _id: vr._id,
        name: vr.name,
        priceIDR: vr.priceIDR,
        ...(vr.barcode ? { barcode: vr.barcode } : {}),
      }));
```

- [ ] **Step 5: Widen the client type** in `src/components/sale/menu-pane.tsx:23`:

```ts
  variants: { _id: Id<'menuItemVariants'>; name: string; priceIDR: number; barcode?: string }[];
```

- [ ] **Step 6: Codegen + typecheck + run test, expect PASS** — Run: `./node_modules/.bin/convex codegen && pnpm typecheck && ./node_modules/.bin/vitest run tests/convex/menu/items.test.ts` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add convex/menu/items.ts convex/_generated src/components/sale/menu-pane.tsx tests/convex/menu/items.test.ts
git commit -m "feat(scan): expose variant barcodes in listForSale"
```

---

### Task 6: Scan feedback helper (Web Audio beep + mute)

**Files:**
- Create: `src/lib/scan-feedback.ts`

**Interfaces:**
- Produces: `scanBeep(kind: 'hit' | 'miss'): void`, `isScanMuted(): boolean`, `setScanMuted(muted: boolean): void`. Module-level in-session mute state, default `false` (sound ON). No React state; callable from event handlers.

- [ ] **Step 1: Write `src/lib/scan-feedback.ts`:**

```ts
// Short Web Audio tones for register scanning. No audio asset: a single shared
// AudioContext synthesizes a high blip on a hit and a lower buzz on a miss.
// Mute is in-session only (module state); a persisted per-user setting is a
// deferred fast-follow. Safe on SSR/no-audio: every call is guarded in try/catch.

let muted = false;
let ctx: AudioContext | null = null;

export function isScanMuted(): boolean {
  return muted;
}

export function setScanMuted(next: boolean): void {
  muted = next;
}

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

export function scanBeep(kind: 'hit' | 'miss'): void {
  if (muted) return;
  try {
    const ac = audioContext();
    if (!ac) return;
    // A user gesture (the scan submit) precedes this, so resume is allowed.
    if (ac.state === 'suspended') void ac.resume();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'square';
    osc.frequency.value = kind === 'hit' ? 880 : 220;
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(ac.destination);
    const now = ac.currentTime;
    const dur = kind === 'hit' ? 0.06 : 0.18;
    // Quick fade-out to avoid a click at the end of the tone.
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.start(now);
    osc.stop(now + dur);
  } catch {
    // Audio is best-effort; never let a beep break a scan.
  }
}
```

- [ ] **Step 2: Typecheck** — Run: `pnpm typecheck` — Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/scan-feedback.ts
git commit -m "feat(scan): web audio hit/miss beep helper"
```

---

### Task 7: Register `onScan` — variants, backend fallback, feedback

**Files:**
- Modify: `src/components/sale/sale-screen.tsx` (`onScan` at ~273, add a helper to add a variant line; wire a visual flash prop into `MenuPane`)
- Modify: `src/components/sale/menu-pane.tsx` (accept a `flash: 'hit' | 'miss' | null` prop and apply a border class to the scan input)
- Test: manual (register interaction); backend covered by Tasks 2-5.

**Interfaces:**
- Consumes: `api.menu.items.getByBarcode` (Task 4); `ItemForSale.variants[].barcode` (Task 5); `scanBeep` (Task 6); the cart `addLine` shape (`cart-reducer.ts`): a variant line is `{ menuItemId, nameSnapshot, variantId, variantName, qty: 1, unitPriceIDR: <variant price>, modifierOptionIds: [], modifierLabels: [] }`.
- Produces: an `onScan(code)` that (1) matches loaded item barcodes, (2) matches loaded variant barcodes, (3) falls back to `getByBarcode`, (4) adds a variant line directly unless the parent item has modifier groups (then opens the picker pre-selected), (5) beeps + flashes on every hit/miss.

- [ ] **Step 1: Import the beep + a Convex action client** at the top of `src/components/sale/sale-screen.tsx` (alongside existing imports):

```ts
import { useConvex } from 'convex/react';
import { scanBeep } from '~/lib/scan-feedback';
```

Add near the other `useState`/hooks in the component body:

```ts
  const convex = useConvex();
  const [scanFlash, setScanFlash] = useState<'hit' | 'miss' | null>(null);
```

- [ ] **Step 2: Add a variant-line helper + a feedback helper** inside the component (above `onScan`):

```ts
  // Add a specific variant straight to the cart, mirroring the picker's line
  // shape. If the parent item has modifier groups that need a choice, defer to
  // the picker (pre-selected variant) so required modifiers are never skipped.
  function addVariantLine(row: ItemForSale, variantId: Id<'menuItemVariants'>) {
    const variant = row.variants.find((vr) => vr._id === variantId);
    if (!variant) return;
    if (row.attachedGroups.length > 0) {
      setPickerRow(row);
      return;
    }
    dispatch({
      type: 'addLine',
      lineKey: genLineKey(),
      line: {
        menuItemId: row.item._id,
        nameSnapshot: row.item.name,
        variantId: variant._id,
        variantName: variant.name,
        qty: 1,
        unitPriceIDR: variant.priceIDR,
        modifierOptionIds: [],
        modifierLabels: [],
      },
    });
  }

  function flash(kind: 'hit' | 'miss') {
    scanBeep(kind);
    setScanFlash(kind);
    window.setTimeout(() => setScanFlash(null), 300);
  }
```

Note: `Id` is already imported in this file via `convex/_generated/dataModel`; if not, add `import type { Id } from 'convex/_generated/dataModel';`.

- [ ] **Step 3: Replace `onScan`** (currently `sale-screen.tsx:273-277`):

```ts
  async function onScan(code: string) {
    // 1) In-memory: item barcode.
    const itemRow = items?.find((r) => r.item.barcode === code);
    if (itemRow) {
      flash('hit');
      onItemTap(itemRow);
      return;
    }
    // 2) In-memory: variant barcode.
    for (const r of items ?? []) {
      const variant = r.variants.find((vr) => vr.barcode === code);
      if (variant) {
        flash('hit');
        addVariantLine(r, variant._id);
        return;
      }
    }
    // 3) Backend fallback for products not in the loaded set.
    const hit = await convex.query(api.menu.items.getByBarcode, { barcode: code });
    if (hit) {
      const row = items?.find((r) => r.item._id === hit.itemId);
      if (row) {
        flash('hit');
        if (hit.kind === 'variant') addVariantLine(row, hit.variantId);
        else onItemTap(row);
        return;
      }
    }
    // 4) Miss.
    flash('miss');
    toast.error(t`Barcode tidak ditemukan.`);
  }
```

Note: `onScan` is now `async`. Its only caller is `MenuPane`'s `onScan?.(code)` (fire-and-forget), so no `await` is required at the call site.

- [ ] **Step 4: Thread a `flash` prop into `MenuPane`.** In `sale-screen.tsx`, find the `<MenuPane ... onScan={onScan} />` render and add `scanFlash={scanFlash}`. In `src/components/sale/menu-pane.tsx`, add the prop and apply it to the scan `Input`:

```ts
export function MenuPane({
  categories,
  items,
  onItemTap,
  onScan,
  scanFlash,
}: {
  categories: Doc<'categories'>[];
  items: ItemForSale[];
  onItemTap: (item: ItemForSale) => void;
  onScan?: (code: string) => void;
  scanFlash?: 'hit' | 'miss' | null;
}) {
```

Apply a border color to the scan `Input` (line ~60) via `className`:

```tsx
        <Input
          ref={scanRef}
          value={scanValue}
          onChange={(e) => setScanValue(e.target.value)}
          placeholder={t`Scan / ketik barcode…`}
          inputMode="numeric"
          autoFocus
          className={`h-9 transition-colors ${
            scanFlash === 'hit'
              ? 'border-emerald-500 ring-1 ring-emerald-500'
              : scanFlash === 'miss'
                ? 'border-destructive ring-1 ring-destructive'
                : ''
          }`}
        />
```

- [ ] **Step 5: Typecheck** — Run: `pnpm typecheck` — Expected: clean.

- [ ] **Step 6: Manual smoke (dev server)** — with `pnpm dev` + `pnpm convex:dev`: in the register, type a known item barcode + Enter → line adds, green flash + beep. Type a variant barcode → correct variant line adds. Type an unknown code → red flash + error toast. (No automated test; register wiring is integration-level.)

- [ ] **Step 7: Commit**

```bash
git add src/components/sale/sale-screen.tsx src/components/sale/menu-pane.tsx
git commit -m "feat(scan): resolve variants + backend fallback + hit/miss feedback in register"
```

---

### Task 8: Per-variant barcode input in the item edit form

**Files:**
- Modify: `src/components/menu/item-edit-form.tsx` (`VariantEditRow` at :403-479, the `VariantRow` type, and the `updateVariant` call at :360)
- Test: `pnpm lingui:extract`/`compile` + typecheck; behavior covered by Task 3 backend tests.

**Interfaces:**
- Consumes: `api.menu.variants.update({ id, name, priceIDR, barcode })`, `api.menu.variants.assignBarcode({ id })` (Task 3); variant rows now carry `barcode?: string` (Task 5 exposes it in `listForSale`; the edit form uses `getById` — see Step 1).

- [ ] **Step 1: Expose `barcode` on the edit-form variant source.** The form's variants come from `api.menu.items.getById` (`variantDetail` validator, `convex/menu/items.ts:72-77`). Add `barcode` there:

```ts
const variantDetail = v.object({
  _id: v.id('menuItemVariants'),
  name: v.string(),
  priceIDR: v.number(),
  position: v.number(),
  barcode: v.optional(v.string()),
});
```

And include it in the `getById` variants map (`convex/menu/items.ts:573-578`):

```ts
    const variants = (await resolveActiveVariants(ctx, id)).map((vr) => ({
      _id: vr._id,
      name: vr.name,
      priceIDR: vr.priceIDR,
      position: vr.position,
      ...(vr.barcode ? { barcode: vr.barcode } : {}),
    }));
```

Run `./node_modules/.bin/convex codegen` after this edit. If a local `VariantRow` type in `item-edit-form.tsx` is hand-written, add `barcode?: string` to it.

- [ ] **Step 2: Pass `barcode` through the existing `onSave`.** In `item-edit-form.tsx`, update the `VariantEditRow` `onSave` wiring (line ~359) to include barcode:

```tsx
                <VariantEditRow
                  key={variant._id}
                  variant={variant}
                  onSave={async (name, priceIDR, barcode) => {
                    await updateVariant({ id: variant._id, name, priceIDR, barcode });
                  }}
                  onAssignBarcode={async () => {
                    await assignVariantBarcode({ id: variant._id });
                  }}
                  onRemove={async () => {
                    await archiveVariant({ id: variant._id });
                  }}
                />
```

Add the mutation hook near the other `useMutation` calls in the form:

```ts
  const assignVariantBarcode = useMutation(api.menu.variants.assignBarcode);
```

- [ ] **Step 3: Add the barcode field to `VariantEditRow`.** Update its props + local state + commit + render:

```tsx
function VariantEditRow(props: {
  variant: VariantRow;
  onSave: (name: string, priceIDR: number, barcode: string) => Promise<void>;
  onAssignBarcode: () => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const { t } = useLingui();
  const [name, setName] = useState(props.variant.name);
  const [price, setPrice] = useState<number>(props.variant.priceIDR);
  const [barcode, setBarcode] = useState(props.variant.barcode ?? '');

  useEffect(() => {
    setName(props.variant.name);
  }, [props.variant.name]);
  useEffect(() => {
    setPrice(props.variant.priceIDR);
  }, [props.variant.priceIDR]);
  useEffect(() => {
    setBarcode(props.variant.barcode ?? '');
  }, [props.variant.barcode]);

  async function commit() {
    const trimmed = name.trim();
    const bc = barcode.trim();
    if (
      trimmed === props.variant.name &&
      price === props.variant.priceIDR &&
      bc === (props.variant.barcode ?? '')
    )
      return;
    try {
      await props.onSave(trimmed, price, bc);
      toast.success(t`Varian diperbarui.`);
    } catch (err) {
      setName(props.variant.name);
      setPrice(props.variant.priceIDR);
      setBarcode(props.variant.barcode ?? '');
      toast.error(err instanceof Error ? err.message : t`Gagal menyimpan varian.`);
    }
  }

  async function assign() {
    try {
      await props.onAssignBarcode();
      toast.success(t`Barcode dibuat.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t`Gagal membuat barcode.`);
    }
  }
```

In the returned `<li>`, add a barcode input + generate button between the price input and the remove control:

```tsx
      <Input
        value={barcode}
        onChange={(e) => setBarcode(e.target.value)}
        onBlur={() => void commit()}
        inputMode="numeric"
        maxLength={64}
        placeholder={t`Barcode`}
        aria-label={t`Barcode varian`}
        className="w-40"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void assign()}
        disabled={barcode.trim().length > 0}
      >
        <Trans>Buat</Trans>
      </Button>
```

- [ ] **Step 4: Extract + fill translations + compile + typecheck** — Run: `pnpm lingui:extract && pnpm lingui:compile && pnpm typecheck`. Fill the `en` translations for the new strings (`Barcode`, `Barcode varian`, `Buat`, `Barcode dibuat.`, `Gagal membuat barcode.`) in `src/locales/en/messages.po`. No em-dash. Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add convex/menu/items.ts convex/_generated src/components/menu/item-edit-form.tsx src/locales/en/messages.po src/locales/id/messages.po
git commit -m "feat(scan): per-variant barcode field + generate in item edit form"
```

---

### Task 9: Full CI gate + verification

**Files:** none (verification).

- [ ] **Step 1: Run the full gate** — Run: `pnpm typecheck && pnpm lingui:compile && ./node_modules/.bin/vitest run` — Expected: all green (run vitest in isolation; it can flake under parallel load).

- [ ] **Step 2: Manual register verification** — `pnpm dev` + `pnpm convex:dev`. Give an item a variant with a barcode via the menu edit form (use the Buat button), then in the register: scan/type the variant barcode → the exact variant line adds with a green flash + beep; scan a plain item barcode → adds; scan a variant barcode whose item has a required modifier group → the picker opens pre-selected; scan an unknown code → red flash + "Barcode tidak ditemukan.".

- [ ] **Step 3: Open PR** — push `feat/register-scan-hardening`, open a PR to `main` summarizing the slice (variant barcodes, getByBarcode fallback, feedback), all CI green. Wait for review/OK before merge; merge with a merge commit; delete the branch.

---

## Deferred to a fast-follow (not in this plan)

- Variant barcodes in label printing (`menu/labels.tsx`) and CSV import (`csv-import-dialog.tsx`).
- Persistent per-user scan-sound setting (this slice ships in-session mute, default ON) + a mute toggle in the register UI.
- Slice 2: inventory/ingredient barcodes (scan-to-receive, stock-take, PO lines).

## Self-review notes

- Spec coverage: variant barcode field + index (T1); uniqueness across items+variants (T2); variant write paths + auto-generate (T3); `getByBarcode` + cross-tenant isolation (T4); register in-memory match now includes variants via `listForSale` (T5) with backend fallback + variant-vs-picker dispatch + feedback (T6/T7); management UI (T8); CI + manual acceptance (T9).
- Type consistency: `getByBarcode` returns `{kind:'item',itemId}` / `{kind:'variant',itemId,variantId}` / `null` — matched in T7's dispatch. `assertBarcodeUnique(ctx,cafeId,barcode,opts?)` with `{itemId?,variantId?}` — used identically in items `update` (T2) and variants `create`/`update` (T3). Variant line shape in T7 matches `CartLine` (`cart-reducer.ts`) and the picker's `onConfirm` line (`sale-screen.tsx:405-415`).
- Corrected assumption: `menuItemVariants` already has `cafeId` + `by_cafe_item`, so no backfill migration (spec updated).
- Task independence: T2's test seeds the variant via a raw `ctx.db.insert` so it passes without T3; every task ends green on its own.
