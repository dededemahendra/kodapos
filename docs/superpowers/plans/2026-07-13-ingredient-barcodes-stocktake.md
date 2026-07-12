# Ingredient barcodes + stock-take scanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give ingredients a barcode (usually the manufacturer EAN/UPC) and let staff scan an ingredient during a stock-take to jump to and count its row.

**Architecture:** Add `ingredients.barcode` + a `by_cafe_barcode` index (mirroring `menuItems`), a per-cafe uniqueness guard on the `upsert` write path, and an `api.ingredients.getByBarcode` resolver. Extract the register's inline scan bar into a reusable `ScanBar` component and reuse the existing `scan-feedback.ts` beep. The stock-take dialog gains the scan bar: a scanned code resolves (in-memory over loaded rows, then backend fallback), focuses that ingredient's count row, and tallies +1 for `piece`-unit ingredients.

**Tech Stack:** Convex (query/mutation new-function syntax with args/returns validators, indexed queries), convex-test + vitest, TanStack Router + React, shadcn UI, Lingui i18n, existing `src/lib/scan-feedback.ts` (Web Audio).

## Global Constraints

- Convex rules: read `convex/_generated/ai/guidelines.md` first; new function syntax with `args`/`returns` validators; never write explicit `undefined` (spread conditionally); prefer indexed queries over `.filter`.
- Codegen: after adding/removing Convex functions run `./node_modules/.bin/convex codegen` (NOT npx) and commit the tracked `convex/_generated` files.
- CI gates (run locally before push): `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`. Run `pnpm lingui:extract` after adding UI strings and fill the `en` translations.
- Copy rules for any user-facing string: Indonesian source + English translation, NO em-dash (—) or `--` (use commas/periods/parentheses), shadcn primitives.
- Tenancy: every Convex handler scopes via `requireActiveOutlet(ctx)` / `requireOwned(ctx, cafeId, id, 'Bahan')`. Error strings are Indonesian.
- Uniqueness invariant: ingredient barcode unique among **ingredients** within a cafe only (NO cross-namespace check against menu-item barcodes).
- Branch: `feat/ingredient-barcodes`, off `main` (which already has Slice 1 merged, so `src/lib/scan-feedback.ts` exists). Do NOT touch `src/routeTree.gen.ts`.
- Commits: small and conventional; end messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Git is proxied — use `rtk proxy git <args>` when bare git output looks off.

## File structure

- Modify `convex/schema.ts` — add `barcode` + `by_cafe_barcode` index to `ingredients`.
- Modify `convex/ingredients.ts` — add `barcode` to `ingredientDoc`; uniqueness guard; `barcode` arg on `upsert`; `getByBarcode` query.
- Modify `src/components/inventory/ingredient-form.tsx` — barcode input field.
- Create `src/components/scan/scan-bar.tsx` — reusable scan input.
- Modify `src/components/sale/menu-pane.tsx` — consume `ScanBar` (dedup refactor).
- Modify `src/components/inventory/stock-take-dialog.tsx` — scan bar + focus/tally.
- Test: `tests/convex/ingredients.test.ts` (extend).

---

### Task 1: `ingredients.barcode` field + index

**Files:**
- Modify: `convex/schema.ts:621-631`

**Interfaces:**
- Produces: `ingredients` gains `barcode?: string` and index `by_cafe_barcode` on `['cafeId','barcode']`.

- [ ] **Step 1: Edit the table** in `convex/schema.ts`, replacing the `ingredients` block:

```ts
  ingredients: defineTable({
    cafeId: v.id('cafes'),
    name: v.string(),
    canonicalUnit: v.union(v.literal('g'), v.literal('ml'), v.literal('piece')),
    reorderThreshold: v.number(),
    lastCostPerUnitIDR: v.number(),
    archived: v.boolean(),
    createdAt: v.number(),
    barcode: v.optional(v.string()),
  })
    .index('by_cafe_active', ['cafeId', 'archived'])
    .index('by_cafe_name', ['cafeId', 'name'])
    .index('by_cafe_barcode', ['cafeId', 'barcode']),
```

- [ ] **Step 2: Codegen + typecheck** — Run: `./node_modules/.bin/convex codegen && pnpm typecheck` — Expected: clean (no function uses it yet).

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts convex/_generated
git commit -m "feat(inv): add barcode field + index to ingredients"
```

---

### Task 2: Barcode uniqueness + `barcode` on `upsert`

**Files:**
- Modify: `convex/ingredients.ts` (`ingredientDoc` :6-16, `upsert` :129-178)
- Test: `tests/convex/ingredients.test.ts`

**Interfaces:**
- Produces: `ingredientDoc` gains `barcode: v.optional(v.string())` (so `list`/`get` return it). `assertIngredientBarcodeUnique(ctx, cafeId, barcode, currentId?)`. `api.ingredients.upsert` accepts optional `barcode`.

- [ ] **Step 1: Write failing tests** — append to `tests/convex/ingredients.test.ts`:

```ts
describe('ingredients.upsert barcode', () => {
  it('stores a barcode and rejects a duplicate among ingredients', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu', canonicalUnit: 'ml', reorderThreshold: 0, lastCostPerUnitIDR: 0,
      barcode: '8991234567890',
    });
    const list = await asOwner.query(api.ingredients.list, {});
    expect(list[0]?.barcode).toBe('8991234567890');
    await expect(
      asOwner.mutation(api.ingredients.upsert, {
        name: 'Susu Lain', canonicalUnit: 'ml', reorderThreshold: 0, lastCostPerUnitIDR: 0,
        barcode: '8991234567890',
      })
    ).rejects.toThrow('Barcode sudah dipakai');
  });

  it('lets an ingredient keep its own barcode on edit', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Gula', canonicalUnit: 'g', reorderThreshold: 0, lastCostPerUnitIDR: 0,
      barcode: '111',
    });
    await asOwner.mutation(api.ingredients.upsert, {
      id, name: 'Gula Pasir', canonicalUnit: 'g', reorderThreshold: 0, lastCostPerUnitIDR: 0,
      barcode: '111',
    });
    const list = await asOwner.query(api.ingredients.list, {});
    expect(list[0]?.name).toBe('Gula Pasir');
    expect(list[0]?.barcode).toBe('111');
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — Run: `./node_modules/.bin/vitest run tests/convex/ingredients.test.ts` — Expected: FAIL (`barcode` arg rejected by validator).

- [ ] **Step 3: Add `barcode` to `ingredientDoc`** (`convex/ingredients.ts:6-16`), after `createdAt`:

```ts
  createdAt: v.number(),
  barcode: v.optional(v.string()),
});
```

- [ ] **Step 4: Add the uniqueness guard** in `convex/ingredients.ts` (after `assertIngredient`, ~line 61):

```ts
// A barcode is unique among a cafe's ingredients (separate namespace from menu
// items). Query the by_cafe_barcode index, ignore archived and the row being
// edited, reject if any other ingredient owns the code.
async function assertIngredientBarcodeUnique(
  ctx: MutationCtx,
  cafeId: Id<'cafes'>,
  barcode: string,
  currentId?: Id<'ingredients'>
): Promise<void> {
  const matches = await ctx.db
    .query('ingredients')
    .withIndex('by_cafe_barcode', (q) => q.eq('cafeId', cafeId).eq('barcode', barcode))
    .collect();
  if (matches.some((m) => !m.archived && m._id !== currentId))
    throw new Error('Barcode sudah dipakai bahan lain.');
}
```

Add the needed imports to the top of the file: `MutationCtx` and `Id`:

```ts
import { mutation, type MutationCtx, query } from './_generated/server';
import type { Id } from './_generated/dataModel';
```

(Adjust the existing `import { mutation, query } from './_generated/server';` line accordingly.)

- [ ] **Step 5: Add `barcode` to `upsert`** (`convex/ingredients.ts:129-178`). Add to `args`:

```ts
    lastCostPerUnitIDR: v.number(),
    barcode: v.optional(v.string()),
  },
```

In the handler, after the duplicate-name guard and before the `if (args.id)` branch, resolve + validate the barcode:

```ts
    const bc = args.barcode?.trim();
    if (bc) await assertIngredientBarcodeUnique(ctx, cafeId, bc, args.id);
```

In the edit `patch` object add `barcode: bc || undefined` (clears when empty):

```ts
      await ctx.db.patch(args.id, {
        name: cleanName,
        canonicalUnit: args.canonicalUnit,
        reorderThreshold: args.reorderThreshold,
        lastCostPerUnitIDR: args.lastCostPerUnitIDR,
        barcode: bc || undefined,
      });
```

In the insert object add a conditional spread:

```ts
    return await ctx.db.insert('ingredients', {
      cafeId,
      name: cleanName,
      canonicalUnit: args.canonicalUnit,
      reorderThreshold: args.reorderThreshold,
      lastCostPerUnitIDR: args.lastCostPerUnitIDR,
      archived: false,
      createdAt: Date.now(),
      ...(bc ? { barcode: bc } : {}),
    });
```

- [ ] **Step 6: Codegen + run test, expect PASS** — Run: `./node_modules/.bin/convex codegen && ./node_modules/.bin/vitest run tests/convex/ingredients.test.ts` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add convex/ingredients.ts convex/_generated tests/convex/ingredients.test.ts
git commit -m "feat(inv): ingredient barcode uniqueness + upsert arg"
```

---

### Task 3: `getByBarcode` resolver

**Files:**
- Modify: `convex/ingredients.ts` (add query near `get`)
- Test: `tests/convex/ingredients.test.ts`

**Interfaces:**
- Produces: `api.ingredients.getByBarcode({ barcode }) -> { ingredientId } | null`. Active/non-archived only, tenant-scoped.

- [ ] **Step 1: Write failing tests** — append to `tests/convex/ingredients.test.ts`:

```ts
describe('ingredients.getByBarcode', () => {
  it('resolves an active ingredient, null for unknown/archived', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu', canonicalUnit: 'ml', reorderThreshold: 0, lastCostPerUnitIDR: 0,
      barcode: '900111',
    });
    expect(await asOwner.query(api.ingredients.getByBarcode, { barcode: '900111' }))
      .toEqual({ ingredientId: id });
    expect(await asOwner.query(api.ingredients.getByBarcode, { barcode: 'nope' })).toBeNull();
    await asOwner.mutation(api.ingredients.archive, { id });
    expect(await asOwner.query(api.ingredients.getByBarcode, { barcode: '900111' })).toBeNull();
  });

  it('is tenant-isolated', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t, 'a@x.com');
    await asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu', canonicalUnit: 'ml', reorderThreshold: 0, lastCostPerUnitIDR: 0,
      barcode: '900222',
    });
    const { asOwner: asOther } = await setupOwner(t, 'b@x.com');
    expect(await asOther.query(api.ingredients.getByBarcode, { barcode: '900222' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — Run: `./node_modules/.bin/vitest run tests/convex/ingredients.test.ts` — Expected: FAIL (`getByBarcode` undefined).

- [ ] **Step 3: Implement the query** in `convex/ingredients.ts` (after `get`):

```ts
export const getByBarcode = query({
  args: { barcode: v.string() },
  returns: v.union(v.object({ ingredientId: v.id('ingredients') }), v.null()),
  handler: async (ctx, { barcode }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const code = barcode.trim();
    if (!code) return null;
    const matches = await ctx.db
      .query('ingredients')
      .withIndex('by_cafe_barcode', (q) => q.eq('cafeId', cafeId).eq('barcode', code))
      .collect();
    const row = matches.find((m) => !m.archived);
    return row ? { ingredientId: row._id } : null;
  },
});
```

- [ ] **Step 4: Codegen + run test, expect PASS** — Run: `./node_modules/.bin/convex codegen && ./node_modules/.bin/vitest run tests/convex/ingredients.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/ingredients.ts convex/_generated tests/convex/ingredients.test.ts
git commit -m "feat(inv): getByBarcode ingredient resolver"
```

---

### Task 4: Barcode field in the ingredient form

**Files:**
- Modify: `src/components/inventory/ingredient-form.tsx`
- Test: extract/compile + typecheck (behavior covered by Task 2).

**Interfaces:**
- Consumes: `api.ingredients.upsert` with `barcode` (Task 2); `api.ingredients.get` returns `barcode` (Task 2).

- [ ] **Step 1: Add barcode state + seed** in `IngredientForm`. Add the state (near the other `useState`s, ~line 50):

```ts
  const [barcode, setBarcode] = useState('');
```

In the `useEffect` seeding block (~line 60-73), set it on edit and clear on create:

```ts
    if (open && existing) {
      setName(existing.name);
      setUnit(existing.canonicalUnit);
      setReorderThreshold(String(existing.reorderThreshold));
      setLastCostPerUnitIDR(String(existing.lastCostPerUnitIDR));
      setBarcode(existing.barcode ?? '');
    } else if (open && !isEdit) {
      setName('');
      setUnit('ml');
      setReorderThreshold('0');
      setLastCostPerUnitIDR('0');
      setBarcode('');
    }
```

- [ ] **Step 2: Pass barcode to `upsert`** in `onSubmit` (~line 81):

```ts
      await upsert({
        ...(ingredientId ? { id: ingredientId } : {}),
        name,
        canonicalUnit: unit,
        reorderThreshold: Number.parseInt(reorderThreshold, 10) || 0,
        lastCostPerUnitIDR: Number.parseInt(lastCostPerUnitIDR, 10) || 0,
        barcode: barcode.trim(),
      });
```

- [ ] **Step 3: Add the field** to the `FieldGroup` (after the cost `Field`, before `{error && ...}`):

```tsx
            <Field>
              <FieldLabel htmlFor="ing-barcode"><Trans>Barcode</Trans></FieldLabel>
              <Input
                id="ing-barcode"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                inputMode="numeric"
                maxLength={64}
                placeholder={t`Pindai atau ketik barcode bahan`}
              />
            </Field>
```

- [ ] **Step 4: Extract + compile + typecheck** — Run: `pnpm lingui:extract && pnpm lingui:compile && pnpm typecheck`. Fill the `en` translations for new strings (`Barcode` may already exist; `Pindai atau ketik barcode bahan` → e.g. "Scan or type the ingredient barcode"). No em-dash. Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/inventory/ingredient-form.tsx src/locales/en/messages.po src/locales/id/messages.po
git commit -m "feat(inv): barcode field in ingredient form"
```

---

### Task 5: Extract reusable `ScanBar` + refactor `menu-pane`

Extract the register's inline scan input into a shared component and make `menu-pane.tsx` consume it. Behavior must be identical (the register's existing tests + typecheck stay green).

**Files:**
- Create: `src/components/scan/scan-bar.tsx`
- Modify: `src/components/sale/menu-pane.tsx:58-77`

**Interfaces:**
- Produces: `ScanBar` — props `{ onScan: (code: string) => void; flash?: 'hit' | 'miss' | null; placeholder?: string; autoFocus?: boolean; className?: string }`. Presentation-only: trims + submits + clears + refocuses; shows green/miss border flash. Does NOT own beep or resolution.

- [ ] **Step 1: Create `src/components/scan/scan-bar.tsx`:**

```tsx
import { useLingui } from '@lingui/react/macro';
import { ScanLine } from 'lucide-react';
import { type FormEvent, useRef, useState } from 'react';
import { Input } from '~/components/ui/input';

// Presentation-only scan input: a numeric field that submits a trimmed code,
// clears, and refocuses after each scan, with a green/red border flash driven
// by the `flash` prop. The caller owns resolution and the beep (scan-feedback).
export function ScanBar({
  onScan,
  flash,
  placeholder,
  autoFocus = true,
  className,
}: {
  onScan: (code: string) => void;
  flash?: 'hit' | 'miss' | null;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const { t } = useLingui();
  const [value, setValue] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = value.trim();
    if (code) onScan(code);
    setValue('');
    ref.current?.focus();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex items-center gap-2 ${className ?? ''}`}
    >
      <ScanLine className="size-4 shrink-0 text-muted-foreground" />
      <Input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder ?? t`Scan / ketik barcode…`}
        inputMode="numeric"
        autoFocus={autoFocus}
        className={`h-9 transition-colors ${
          flash === 'hit'
            ? 'border-emerald-500 ring-1 ring-emerald-500'
            : flash === 'miss'
              ? 'border-destructive ring-1 ring-destructive'
              : ''
        }`}
      />
    </form>
  );
}
```

- [ ] **Step 2: Refactor `menu-pane.tsx`** to use it. Replace the inline `<form onSubmit={handleScan} ...>...</form>` block (`menu-pane.tsx:60-77`) with:

```tsx
      <ScanBar
        onScan={(code) => onScan?.(code)}
        flash={scanFlash}
        className="px-3 py-2 border-b border-border"
      />
```

Remove the now-unused `handleScan`, `scanValue`/`setScanValue`, `scanRef`, and the `ScanLine`/`Input`/`FormEvent`/`useRef` imports if nothing else in the file uses them (verify: `Input` and `useRef` may be unused after this; `useState`/`useMemo` remain for category state). Add `import { ScanBar } from '~/components/scan/scan-bar';`.

- [ ] **Step 3: Typecheck + run the register's tests** — Run: `pnpm typecheck && ./node_modules/.bin/vitest run tests/convex/menu` — Expected: clean + green (behavior unchanged; there is no unit test for the scan input itself, so typecheck + the menu query tests are the gate).

- [ ] **Step 4: Commit**

```bash
git add src/components/scan/scan-bar.tsx src/components/sale/menu-pane.tsx
git commit -m "refactor(scan): extract reusable ScanBar from menu-pane"
```

---

### Task 6: Stock-take scan wiring (focus + piece-tally)

**Files:**
- Modify: `src/components/inventory/stock-take-dialog.tsx`
- Test: manual (integration UI); backend covered by Tasks 2-3.

**Interfaces:**
- Consumes: `ScanBar` (Task 5); `api.ingredients.getByBarcode` (Task 3); `scanBeep` from `src/lib/scan-feedback.ts` (`scanBeep('hit'|'miss')`); the `ingredients` prop rows now carry `barcode?` (Task 2 added it to `ingredientDoc`).

- [ ] **Step 1: Add imports + hooks** to `stock-take-dialog.tsx`. Add imports:

```ts
import { useConvex } from 'convex/react';
import { useRef } from 'react';
import { ScanBar } from '~/components/scan/scan-bar';
import { scanBeep } from '~/lib/scan-feedback';
```

(Merge `useRef` into the existing `react` import.) In the component body (near the other hooks):

```ts
  const convex = useConvex();
  const [scanFlash, setScanFlash] = useState<'hit' | 'miss' | null>(null);
  const rowRefs = useRef<Record<string, HTMLInputElement | null>>({});
```

- [ ] **Step 2: Add the scan handler** (above `onSubmit`):

```ts
  function flash(kind: 'hit' | 'miss') {
    scanBeep(kind);
    setScanFlash(kind);
    window.setTimeout(() => setScanFlash(null), 300);
  }

  // Focus (and, for piece units, +1) the scanned ingredient's count row.
  function applyScanHit(ingredientId: string) {
    const row = ingredients?.find((r) => r._id === ingredientId);
    if (!row) return;
    if (row.canonicalUnit === 'piece') {
      setCounts((prev) => {
        const parsed = Number.parseInt(prev[ingredientId] ?? '', 10);
        const next = (Number.isNaN(parsed) ? 0 : parsed) + 1;
        return { ...prev, [ingredientId]: String(next) };
      });
    }
    const input = rowRefs.current[ingredientId];
    input?.scrollIntoView({ block: 'center' });
    input?.focus();
    input?.select();
  }

  async function onScan(code: string) {
    // In-memory first over the loaded rows, then backend fallback.
    const local = ingredients?.find((r) => r.barcode === code);
    if (local) {
      flash('hit');
      applyScanHit(local._id);
      return;
    }
    try {
      const hit = await convex.query(api.ingredients.getByBarcode, { barcode: code });
      if (hit && ingredients?.some((r) => r._id === hit.ingredientId)) {
        flash('hit');
        applyScanHit(hit.ingredientId);
        return;
      }
    } catch {
      // Query failed: fall through to the miss path so the operator gets a signal.
    }
    flash('miss');
    toast.error(t`Barcode tidak ditemukan.`);
  }
```

- [ ] **Step 3: Render the `ScanBar`** inside the `form`, above the rows list (before the `<div className="max-h-[55vh] ...">`):

```tsx
          <form onSubmit={onSubmit}>
            <ScanBar
              onScan={(code) => {
                void onScan(code);
              }}
              flash={scanFlash}
              className="mb-2 border-b border-border pb-2"
            />
            <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
```

- [ ] **Step 4: Attach the row ref** to each count `Input` (`stock-take-dialog.tsx:133`), add a `ref`:

```tsx
                  <Input
                    ref={(el) => {
                      rowRefs.current[r._id] = el;
                    }}
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    aria-label={t`Hitung fisik ${r.name}`}
                    value={counts[r._id] ?? ''}
                    onChange={(e) =>
                      setCounts((prev) => ({ ...prev, [r._id]: e.target.value }))
                    }
                    className="text-right tabular-nums"
                  />
```

- [ ] **Step 5: Extract + compile + typecheck** — Run: `pnpm lingui:extract && pnpm lingui:compile && pnpm typecheck`. The only potentially-new string is `Barcode tidak ditemukan.` (already exists from Slice 1) — fill any new `en` entries, no em-dash. Expected: clean.

- [ ] **Step 6: Manual smoke** — `pnpm dev` + `pnpm convex:dev`: set a barcode on a `piece` ingredient and a `ml` ingredient via the ingredient form. Open stock-take, scan the piece barcode → its row focuses + count increments by 1, green flash + beep. Scan the ml barcode → its row focuses (no increment). Scan an unknown code → red flash + toast.

- [ ] **Step 7: Commit**

```bash
git add src/components/inventory/stock-take-dialog.tsx src/locales/en/messages.po src/locales/id/messages.po
git commit -m "feat(inv): scan-to-count in stock-take (focus + piece tally)"
```

---

### Task 7: Full CI gate + PR

**Files:** none (verification).

- [ ] **Step 1: Run the full gate** — Run: `pnpm typecheck && pnpm lingui:compile && ./node_modules/.bin/vitest run` — Expected: all green (run vitest in isolation; it can flake under parallel load).

- [ ] **Step 2: Manual acceptance** — the Task 6 Step 6 smoke, plus: confirm the register scanning still works unchanged after the `ScanBar` refactor (scan a menu item + a variant barcode at the register).

- [ ] **Step 3: Open PR** — push `feat/ingredient-barcodes`, open a PR to `main` summarizing the slice (ingredient barcodes, `getByBarcode`, `ScanBar` extraction, stock-take scan-to-count). All CI green. Wait for review/OK before merge; merge with a merge commit; delete the branch.

---

## Deferred to a fast-follow (not in this plan)

- Generate + label printing for ingredient barcodes.
- Scanning in receiving (PO receive sheet, direct purchases), the shared `IngredientPicker`, and PO-line building — each reuses `ScanBar` + `getByBarcode`.
- Optional cross-namespace uniqueness with menu-item barcodes.

## Self-review notes

- Spec coverage: field+index (T1); uniqueness + upsert arg (T2); resolver + cross-tenant isolation (T3); form field / capture (T4); shared ScanBar + menu-pane dedup (T5); stock-take focus + piece-tally + feedback with backend fallback (T6); CI + manual acceptance + register-regression check (T7).
- Type consistency: `getByBarcode` returns `{ ingredientId }` | null — used in T6's `onScan`. `assertIngredientBarcodeUnique(ctx, cafeId, barcode, currentId?)` used only in `upsert` (T2). `ScanBar` prop shape in T5 matches its use in T5 (menu-pane) and T6 (stock-take). `ingredientDoc` barcode (T2) is what makes `ingredients` prop rows carry `barcode` for T6's in-memory match.
- YAGNI: capture-only (no generate/labels); one flow (stock-take) wired; other inventory surfaces deferred.
- Tenancy: every new query/mutation path scopes via `requireActiveOutlet`; `getByBarcode` reads only within the resolved cafeId.
