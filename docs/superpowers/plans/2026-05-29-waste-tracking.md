# Waste Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record ingredient waste as a first-class, separately-measurable inventory event (`reason: 'waste'`) with an immutable cost snapshot, surfaced on a dedicated owner-only `/inventory/waste` page with a log and period rupiah-lost total.

**Architecture:** Extend the event-sourced `inventoryMovements` table with two optional waste-only fields (`wasteReason`, `costPerUnitIDR`) and a `by_cafe_reason_at` index (Approach A from the spec). A new `convex/waste.ts` module owns the `record` mutation and `recent` query. The frontend replaces the `ComingSoon` stub with a real page plus a `waste-dialog` component modeled on the existing `stock-adjust-dialog`. The old mis-categorized "Limbah" reason is removed from the stock-adjust dialog.

**Tech Stack:** Convex (queries/mutations, validators), TanStack Router, React, Lingui i18n, vitest + convex-test.

**Spec:** `docs/superpowers/specs/2026-05-29-waste-tracking-design.md`

---

## File Structure

- `convex/schema.ts` — extend `inventoryMovements` (2 fields + 1 index). MODIFY.
- `convex/waste.ts` — `record` mutation + `recent` query. CREATE.
- `convex/_generated/*` — regenerated so `api.waste` exists (repo tracks these). MODIFY.
- `tests/convex/waste.test.ts` — backend tests. CREATE.
- `src/components/inventory/waste-dialog.tsx` — record-waste dialog. CREATE.
- `src/routes/_pos/inventory/waste.tsx` — real page (replaces stub). MODIFY.
- `src/components/inventory/stock-adjust-dialog.tsx` — drop 'Limbah' reason. MODIFY.
- `src/locales/{id,en}/messages.po` — extracted strings. MODIFY.

---

## Task 1: Schema — extend `inventoryMovements`

**Files:**
- Modify: `convex/schema.ts` (the `inventoryMovements` table, ~lines 169-196)
- Modify: `convex/_generated/*` (regenerated)

- [ ] **Step 1: Add the two optional fields and the index**

In `convex/schema.ts`, replace the `inventoryMovements` table definition with:

```ts
  inventoryMovements: defineTable({
    cafeId: v.id('cafes'),
    ingredientId: v.id('ingredients'),
    delta: v.number(),
    reason: v.union(
      v.literal('sale'),
      v.literal('adjustment'),
      // 'waste' is written by waste.record (dedicated Catat Limbah flow).
      v.literal('waste')
    ),
    refType: v.optional(v.string()),
    refId: v.optional(v.string()),
    note: v.optional(v.string()),
    // Waste-only fields (undefined for sale/adjustment rows). Set by waste.record.
    wasteReason: v.optional(
      v.union(
        v.literal('rusak'),
        v.literal('basi'),
        v.literal('tumpah'),
        v.literal('salah_masak'),
        v.literal('lainnya')
      )
    ),
    // Snapshot of ingredient.lastCostPerUnitIDR at waste time, for immutable COGS.
    costPerUnitIDR: v.optional(v.number()),
    at: v.number(),
  })
    .index('by_cafe_ingredient', ['cafeId', 'ingredientId'])
    .index('by_cafe_ingredient_at', ['cafeId', 'ingredientId', 'at'])
    .index('by_cafe_reason_at', ['cafeId', 'reason', 'at']),
```

- [ ] **Step 2: Regenerate Convex types**

Run: `npx convex codegen`
Expected: regenerates `convex/_generated/` with no errors. (If it asks to log in, an already-running `npx convex dev` session also regenerates on save.)

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no errors — the new optional fields don't break existing code).

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts convex/_generated
git commit -m "feat(waste): add wasteReason + costPerUnitIDR to inventoryMovements"
```

---

## Task 2: Backend — `waste.record` mutation (TDD)

**Files:**
- Create: `convex/waste.ts`
- Test: `tests/convex/waste.test.ts`
- Modify: `convex/_generated/*` (regenerated)

- [ ] **Step 1: Write the failing tests**

Create `tests/convex/waste.test.ts`:

```ts
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setupOwner(t: ReturnType<typeof convexTest>, email = 'o@x.com') {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email });
  });
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  return { asOwner };
}

/** Create an ingredient and stock it to `qty` via adjustStock. */
async function stockedIngredient(
  asOwner: ReturnType<ReturnType<typeof convexTest>['withIdentity']>,
  opts: { name?: string; cost?: number; qty?: number } = {}
): Promise<Id<'ingredients'>> {
  const id = await asOwner.mutation(api.ingredients.upsert, {
    name: opts.name ?? 'Susu',
    canonicalUnit: 'ml',
    reorderThreshold: 0,
    lastCostPerUnitIDR: opts.cost ?? 25,
  });
  if (opts.qty && opts.qty > 0) {
    await asOwner.mutation(api.ingredients.adjustStock, {
      ingredientId: id,
      newQty: opts.qty,
      reasonLabel: 'Pengiriman masuk',
    });
  }
  return id;
}

describe('waste.record', () => {
  it('writes a waste movement with negative delta, category, and cost snapshot', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await stockedIngredient(asOwner, { cost: 25, qty: 1000 });

    const movementId = await asOwner.mutation(api.waste.record, {
      ingredientId: id,
      qtyWasted: 200,
      wasteReason: 'basi',
      note: 'kulkas mati semalam',
    });

    const m = await t.run(async (ctx) => await ctx.db.get(movementId));
    expect(m?.reason).toBe('waste');
    expect(m?.delta).toBe(-200);
    expect(m?.wasteReason).toBe('basi');
    expect(m?.costPerUnitIDR).toBe(25);
    expect(m?.note).toBe('kulkas mati semalam');
  });

  it('lowers currentStockQty by the wasted amount', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await stockedIngredient(asOwner, { qty: 1000 });

    await asOwner.mutation(api.waste.record, {
      ingredientId: id,
      qtyWasted: 200,
      wasteReason: 'rusak',
    });

    const list = await asOwner.query(api.ingredients.list, {});
    expect(list[0]?.currentStockQty).toBe(800);
  });

  it('rejects qtyWasted that is not a positive integer', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await stockedIngredient(asOwner, { qty: 1000 });
    await expect(
      asOwner.mutation(api.waste.record, {
        ingredientId: id,
        qtyWasted: 0,
        wasteReason: 'rusak',
      })
    ).rejects.toThrow(/bulat/i);
    await expect(
      asOwner.mutation(api.waste.record, {
        ingredientId: id,
        qtyWasted: 10.5,
        wasteReason: 'rusak',
      })
    ).rejects.toThrow(/bulat/i);
  });

  it('rejects waste greater than current stock', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await stockedIngredient(asOwner, { qty: 100 });
    await expect(
      asOwner.mutation(api.waste.record, {
        ingredientId: id,
        qtyWasted: 101,
        wasteReason: 'tumpah',
      })
    ).rejects.toThrow(/melebihi stok/i);
  });

  it('rejects an ingredient from another cafe', async () => {
    const t = convexTest(schema, modules);
    const { asOwner: ownerA } = await setupOwner(t, 'a@x.com');
    const { asOwner: ownerB } = await setupOwner(t, 'b@x.com');
    const idB = await stockedIngredient(ownerB, { qty: 1000 });
    await expect(
      ownerA.mutation(api.waste.record, {
        ingredientId: idB,
        qtyWasted: 10,
        wasteReason: 'rusak',
      })
    ).rejects.toThrow(/tidak ditemukan/i);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run tests/convex/waste.test.ts`
Expected: FAIL — `api.waste` is undefined (module + codegen don't exist yet).

- [ ] **Step 3: Create the `waste.ts` module with `record`**

Create `convex/waste.ts`:

```ts
import { v } from 'convex/values';
import { mutation } from './_generated/server';
import { requireOwned, requireOwnerCafe } from './lib/auth';
import { currentStockQty } from './lib/inventory';

const wasteReason = v.union(
  v.literal('rusak'),
  v.literal('basi'),
  v.literal('tumpah'),
  v.literal('salah_masak'),
  v.literal('lainnya')
);

export const record = mutation({
  args: {
    ingredientId: v.id('ingredients'),
    qtyWasted: v.number(),
    wasteReason,
    note: v.optional(v.string()),
  },
  returns: v.id('inventoryMovements'),
  handler: async (ctx, args) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const ing = await requireOwned(ctx, cafeId, args.ingredientId, 'Bahan');
    if (!Number.isInteger(args.qtyWasted) || args.qtyWasted < 1) {
      throw new Error('Jumlah limbah harus bilangan bulat ≥ 1.');
    }
    const current = await currentStockQty(ctx, cafeId, args.ingredientId);
    if (args.qtyWasted > current) {
      throw new Error('Jumlah limbah melebihi stok saat ini.');
    }
    const note = args.note?.trim();
    return await ctx.db.insert('inventoryMovements', {
      cafeId,
      ingredientId: args.ingredientId,
      delta: -args.qtyWasted,
      reason: 'waste',
      wasteReason: args.wasteReason,
      costPerUnitIDR: ing.lastCostPerUnitIDR,
      ...(note ? { note } : {}),
      at: Date.now(),
    });
  },
});
```

- [ ] **Step 4: Regenerate types**

Run: `npx convex codegen`
Expected: `api.waste.record` now exists in `convex/_generated/api.d.ts`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run tests/convex/waste.test.ts`
Expected: PASS (5 tests in the `waste.record` describe).

- [ ] **Step 6: Commit**

```bash
git add convex/waste.ts convex/_generated tests/convex/waste.test.ts
git commit -m "feat(waste): add waste.record mutation with cost snapshot + validation"
```

---

## Task 3: Backend — `waste.recent` query (TDD)

**Files:**
- Modify: `convex/waste.ts`
- Modify: `tests/convex/waste.test.ts`
- Modify: `convex/_generated/*` (regenerated)

- [ ] **Step 1: Add the failing tests**

Append to `tests/convex/waste.test.ts` (after the `waste.record` describe block):

```ts
describe('waste.recent', () => {
  it('returns waste rows newest-first with correct totalCostIDR', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const milk = await stockedIngredient(asOwner, { name: 'Susu', cost: 25, qty: 1000 });
    const bean = await stockedIngredient(asOwner, { name: 'Biji Kopi', cost: 200, qty: 1000 });

    await asOwner.mutation(api.waste.record, {
      ingredientId: milk,
      qtyWasted: 100,
      wasteReason: 'basi',
    });
    await asOwner.mutation(api.waste.record, {
      ingredientId: bean,
      qtyWasted: 50,
      wasteReason: 'rusak',
    });

    const rows = await asOwner.query(api.waste.recent, {});
    expect(rows).toHaveLength(2);
    // newest-first: bean was recorded last
    expect(rows[0]?.ingredientName).toBe('Biji Kopi');
    expect(rows[0]?.qtyWasted).toBe(50);
    expect(rows[0]?.totalCostIDR).toBe(50 * 200);
    expect(rows[1]?.ingredientName).toBe('Susu');
    expect(rows[1]?.totalCostIDR).toBe(100 * 25);
  });

  it('snapshots cost so later cost edits do not change historical totals', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await stockedIngredient(asOwner, { name: 'Susu', cost: 25, qty: 1000 });

    await asOwner.mutation(api.waste.record, {
      ingredientId: id,
      qtyWasted: 100,
      wasteReason: 'basi',
    });

    // Raise the ingredient cost after the waste was recorded.
    await asOwner.mutation(api.ingredients.upsert, {
      id,
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 0,
      lastCostPerUnitIDR: 999,
    });

    const rows = await asOwner.query(api.waste.recent, {});
    expect(rows[0]?.costPerUnitIDR).toBe(25);
    expect(rows[0]?.totalCostIDR).toBe(100 * 25);
  });

  it('excludes rows outside the days window and is scoped to the cafe', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await stockedIngredient(asOwner, { qty: 1000 });
    await asOwner.mutation(api.waste.record, {
      ingredientId: id,
      qtyWasted: 10,
      wasteReason: 'rusak',
    });

    // A window of 0 days has a cutoff of "now", excluding the just-recorded row.
    const none = await asOwner.query(api.waste.recent, { days: 0 });
    expect(none).toHaveLength(0);

    const some = await asOwner.query(api.waste.recent, { days: 30 });
    expect(some).toHaveLength(1);
  });

  it('does not leak another cafe\'s waste', async () => {
    const t = convexTest(schema, modules);
    const { asOwner: ownerA } = await setupOwner(t, 'a@x.com');
    const { asOwner: ownerB } = await setupOwner(t, 'b@x.com');
    const idB = await stockedIngredient(ownerB, { qty: 1000 });
    await ownerB.mutation(api.waste.record, {
      ingredientId: idB,
      qtyWasted: 10,
      wasteReason: 'rusak',
    });
    const rowsA = await ownerA.query(api.waste.recent, {});
    expect(rowsA).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `pnpm vitest run tests/convex/waste.test.ts -t recent`
Expected: FAIL — `api.waste.recent` is undefined.

- [ ] **Step 3: Add the `recent` query to `convex/waste.ts`**

Add these imports/additions to `convex/waste.ts` — change the import line and append the query:

```ts
// change the server import to include `query`:
import { mutation, query } from './_generated/server';
```

Append at the end of the file:

```ts
const wasteRow = v.object({
  id: v.id('inventoryMovements'),
  at: v.number(),
  ingredientName: v.string(),
  unit: v.union(v.literal('g'), v.literal('ml'), v.literal('piece')),
  qtyWasted: v.number(),
  wasteReason,
  note: v.optional(v.string()),
  costPerUnitIDR: v.number(),
  totalCostIDR: v.number(),
});

const DAY_MS = 86_400_000;

export const recent = query({
  args: { days: v.optional(v.number()) },
  returns: v.array(wasteRow),
  handler: async (ctx, { days = 30 }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const cutoff = Date.now() - days * DAY_MS;
    const movements = await ctx.db
      .query('inventoryMovements')
      .withIndex('by_cafe_reason_at', (q) =>
        q.eq('cafeId', cafeId).eq('reason', 'waste').gte('at', cutoff)
      )
      .order('desc')
      .collect();

    const info = new Map<string, { name: string; unit: 'g' | 'ml' | 'piece' }>();
    const out = [];
    for (const m of movements) {
      let ing = info.get(m.ingredientId);
      if (!ing) {
        const doc = await ctx.db.get(m.ingredientId);
        ing = { name: doc?.name ?? '—', unit: doc?.canonicalUnit ?? 'piece' };
        info.set(m.ingredientId, ing);
      }
      const qtyWasted = -m.delta;
      const costPerUnitIDR = m.costPerUnitIDR ?? 0;
      out.push({
        id: m._id,
        at: m.at,
        ingredientName: ing.name,
        unit: ing.unit,
        qtyWasted,
        wasteReason: m.wasteReason ?? 'lainnya',
        ...(m.note ? { note: m.note } : {}),
        costPerUnitIDR,
        totalCostIDR: qtyWasted * costPerUnitIDR,
      });
    }
    return out;
  },
});
```

- [ ] **Step 4: Regenerate types**

Run: `npx convex codegen`
Expected: `api.waste.recent` now exists.

- [ ] **Step 5: Run the full waste test file to verify it passes**

Run: `pnpm vitest run tests/convex/waste.test.ts`
Expected: PASS (all 9 tests).

- [ ] **Step 6: Commit**

```bash
git add convex/waste.ts convex/_generated tests/convex/waste.test.ts
git commit -m "feat(waste): add waste.recent query with period total + cafe scoping"
```

---

## Task 4: Cleanup — remove 'Limbah' from stock-adjust dialog

**Files:**
- Modify: `src/components/inventory/stock-adjust-dialog.tsx:25,44-49`

- [ ] **Step 1: Remove the 'Limbah' reason and its label**

In `src/components/inventory/stock-adjust-dialog.tsx`, change the `REASONS` constant (line 25) from:

```ts
const REASONS = ['Pengiriman masuk', 'Stok opname', 'Limbah', 'Koreksi'] as const;
```

to:

```ts
const REASONS = ['Pengiriman masuk', 'Stok opname', 'Koreksi'] as const;
```

And remove the `'Limbah'` entry from the `reasonLabels` map (the block at lines 44-49) so it reads:

```ts
  const reasonLabels: Record<typeof REASONS[number], string> = {
    'Pengiriman masuk': t`Pengiriman masuk`,
    'Stok opname': t`Stok opname`,
    'Koreksi': t`Koreksi`,
  };
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/inventory/stock-adjust-dialog.tsx
git commit -m "refactor(inventory): drop 'Limbah' reason from stock-adjust (now in waste flow)"
```

---

## Task 5: Frontend — waste dialog component

**Files:**
- Create: `src/components/inventory/waste-dialog.tsx`

- [ ] **Step 1: Create the dialog**

Create `src/components/inventory/waste-dialog.tsx`:

```tsx
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { type FormEvent, useEffect, useState } from 'react';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Spinner } from '~/components/ui/spinner';
import { formatIDR } from '~/lib/money';

// Raw enum values match convex/waste.ts; labels are translated at render time.
const REASONS = ['rusak', 'basi', 'tumpah', 'salah_masak', 'lainnya'] as const;
type WasteReason = (typeof REASONS)[number];

export function WasteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const ingredients = useQuery(api.ingredients.list, {});
  const record = useMutation(api.waste.record);

  const reasonLabels: Record<WasteReason, string> = {
    rusak: t`Rusak`,
    basi: t`Basi/Kedaluwarsa`,
    tumpah: t`Tumpah`,
    salah_masak: t`Salah masak`,
    lainnya: t`Lainnya`,
  };

  const [ingredientId, setIngredientId] = useState<string>('');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState<WasteReason>(REASONS[0]);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setIngredientId('');
      setQty('');
      setReason(REASONS[0]);
      setNote('');
      setError(null);
    }
  }, [open]);

  const selected = ingredients?.find((i) => i._id === ingredientId);
  const qtyNum = Number.parseInt(qty, 10) || 0;
  const estLoss = selected ? qtyNum * selected.lastCostPerUnitIDR : 0;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ingredientId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await record({
        ingredientId: ingredientId as Id<'ingredients'>,
        qtyWasted: qtyNum,
        wasteReason: reason,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Gagal mencatat limbah.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Catat limbah</Trans>
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="waste-ingredient">
                <Trans>Bahan</Trans>
              </FieldLabel>
              <Select value={ingredientId} onValueChange={setIngredientId}>
                <SelectTrigger id="waste-ingredient">
                  <SelectValue placeholder={t`Pilih bahan`} />
                </SelectTrigger>
                <SelectContent>
                  {ingredients?.map((i) => (
                    <SelectItem key={i._id} value={i._id}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {selected && (
              <div className="rounded-md bg-muted px-3 py-2 text-sm">
                <Trans>Stok saat ini:</Trans>{' '}
                <span className="font-semibold tabular-nums">
                  {selected.currentStockQty} {selected.canonicalUnit}
                </span>
              </div>
            )}
            <Field>
              <FieldLabel htmlFor="waste-qty">
                <Trans>Jumlah dibuang</Trans>
                {selected ? ` (${selected.canonicalUnit})` : ''}
              </FieldLabel>
              <Input
                id="waste-qty"
                type="number"
                min="1"
                step="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="waste-reason">
                <Trans>Alasan</Trans>
              </FieldLabel>
              <Select value={reason} onValueChange={(v) => setReason(v as WasteReason)}>
                <SelectTrigger id="waste-reason">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {reasonLabels[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="waste-note">
                <Trans>Catatan (opsional)</Trans>
              </FieldLabel>
              <Input
                id="waste-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
              />
            </Field>
            {selected && qtyNum > 0 && (
              <div className="text-sm text-muted-foreground">
                <Trans>Perkiraan kerugian:</Trans>{' '}
                <span className="font-semibold tabular-nums">{formatIDR(estLoss)}</span>
              </div>
            )}
            {error && <FieldError>{error}</FieldError>}
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              <Trans>Batal</Trans>
            </Button>
            <Button type="submit" disabled={submitting || !ingredientId}>
              {submitting && <Spinner data-icon="inline-start" />}
              {submitting ? <Trans>Menyimpan…</Trans> : <Trans>Simpan</Trans>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/inventory/waste-dialog.tsx
git commit -m "feat(waste): add WasteDialog component"
```

---

## Task 6: Frontend — waste page (replace stub)

**Files:**
- Modify: `src/routes/_pos/inventory/waste.tsx`

- [ ] **Step 1: Replace the stub with the real page**

Replace the entire contents of `src/routes/_pos/inventory/waste.tsx` with:

```tsx
import { Trans } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { useState } from 'react';
import { WasteDialog } from '~/components/inventory/waste-dialog';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import { formatDate } from '~/lib/formater';
import { formatIDR } from '~/lib/money';

export const Route = createFileRoute('/_pos/inventory/waste')({
  component: WastePage,
});

// Raw → translated labels, mirroring the dialog so the table reads in the UI locale.
const REASON_LABELS: Record<string, React.ReactNode> = {
  rusak: <Trans>Rusak</Trans>,
  basi: <Trans>Basi/Kedaluwarsa</Trans>,
  tumpah: <Trans>Tumpah</Trans>,
  salah_masak: <Trans>Salah masak</Trans>,
  lainnya: <Trans>Lainnya</Trans>,
};

function WastePage() {
  const [open, setOpen] = useState(false);
  const rows = useQuery(api.waste.recent, {});
  const isLoading = rows === undefined;
  const totalLoss = (rows ?? []).reduce((sum, r) => sum + r.totalCostIDR, 0);

  return (
    <main className="p-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          <Trans>Catat Limbah</Trans>
        </h1>
        <Button type="button" onClick={() => setOpen(true)}>
          <Trans>+ Catat Limbah</Trans>
        </Button>
      </header>

      <div className="mb-4 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm">
        <Trans>Kerugian limbah (30 hari):</Trans>{' '}
        <span className="font-semibold tabular-nums">{formatIDR(totalLoss)}</span>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Spinner />
          <span>
            <Trans>Memuat…</Trans>
          </span>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground">
          <Trans>Belum ada limbah tercatat dalam 30 hari terakhir.</Trans>
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="px-2 py-2">
                <Trans>Tanggal</Trans>
              </th>
              <th className="px-2 py-2">
                <Trans>Bahan</Trans>
              </th>
              <th className="w-24 px-2 py-2 text-right">
                <Trans>Jumlah</Trans>
              </th>
              <th className="w-40 px-2 py-2">
                <Trans>Alasan</Trans>
              </th>
              <th className="w-32 px-2 py-2 text-right">
                <Trans>Kerugian</Trans>
              </th>
              <th className="px-2 py-2">
                <Trans>Catatan</Trans>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/50 hover:bg-muted">
                <td className="px-2 py-2 tabular-nums">
                  {formatDate(new Date(r.at).toISOString(), 'day-month')}
                </td>
                <td className="px-2 py-2">{r.ingredientName}</td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {r.qtyWasted} {r.unit}
                </td>
                <td className="px-2 py-2">{REASON_LABELS[r.wasteReason] ?? r.wasteReason}</td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatIDR(r.totalCostIDR)}
                </td>
                <td className="px-2 py-2 text-muted-foreground">{r.note ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <WasteDialog open={open} onOpenChange={setOpen} />
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_pos/inventory/waste.tsx
git commit -m "feat(waste): real /inventory/waste page with log + period total"
```

---

## Task 7: i18n — extract and translate

**Files:**
- Modify: `src/locales/id/messages.po`, `src/locales/en/messages.po`

- [ ] **Step 1: Extract new messages**

Run: `pnpm lingui:extract`
Expected: reports new messages added; `en` shows some "missing".

- [ ] **Step 2: Fill in the English translations**

In `src/locales/en/messages.po`, set `msgstr` for each new waste msgid. Use these mappings (find each `msgid` and fill its empty `msgstr`):

| msgid (id source) | en msgstr |
| --- | --- |
| `Catat Limbah` | `Record Waste` |
| `+ Catat Limbah` | `+ Record Waste` |
| `Catat limbah` | `Record waste` |
| `Bahan` | `Ingredient` |
| `Pilih bahan` | `Select ingredient` |
| `Jumlah dibuang` | `Quantity wasted` |
| `Alasan` | `Reason` |
| `Rusak` | `Damaged` |
| `Basi/Kedaluwarsa` | `Spoiled/Expired` |
| `Tumpah` | `Spilled` |
| `Salah masak` | `Mis-cooked` |
| `Lainnya` | `Other` |
| `Perkiraan kerugian:` | `Estimated loss:` |
| `Gagal mencatat limbah.` | `Failed to record waste.` |
| `Kerugian limbah (30 hari):` | `Waste loss (30 days):` |
| `Belum ada limbah tercatat dalam 30 hari terakhir.` | `No waste recorded in the last 30 days.` |
| `Tanggal` | `Date` |
| `Jumlah` | `Quantity` |
| `Kerugian` | `Loss` |
| `Catatan` | `Notes` |

Note: some msgids (`Bahan`, `Alasan`, `Catatan`, `Jumlah`, `Tanggal`, `Stok saat ini:`, `Catatan (opsional)`, `Batal`, `Simpan`, `Menyimpan…`, `Memuat…`) may already exist from other screens — if a msgid is already present with a non-empty `msgstr`, leave it. Only fill empty ones.

- [ ] **Step 3: Compile catalogs**

Run: `pnpm lingui:compile`
Expected: "Done" with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/locales
git commit -m "i18n(waste): extract and translate waste-tracking strings"
```

---

## Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full local CI suite**

Run: `pnpm typecheck && pnpm test && pnpm lingui:compile`
Expected: typecheck clean; all tests pass (existing + 9 new waste tests); catalogs compile.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: 0 errors (pre-existing warnings are acceptable; no NEW errors from the added files).

- [ ] **Step 3: Manual smoke (optional but recommended)**

Start the app, sign in as owner, go to Inventaris → Catat Limbah. Add an ingredient with stock first if none. Record a waste entry; confirm: stock drops, the row appears newest-first, the period total increases by qty×cost, and the English locale shows "Record Waste" / "Spoiled/Expired".

- [ ] **Step 4: Push and open PR**

```bash
git push -u origin feat/waste-tracking
gh pr create --base main --title "feat(waste): ingredient waste tracking with COGS snapshot" --body "Implements docs/superpowers/specs/2026-05-29-waste-tracking-design.md"
```

---

## Notes for the implementer

- **Codegen:** `npx convex codegen` must run after creating/changing `convex/waste.ts` so `api.waste.*` and the new schema fields appear in `convex/_generated/`. The repo tracks `_generated` (CI typechecks without a deploy key), so commit it alongside the code.
- **Convention:** mutations throw Bahasa Indonesia `Error` messages; the UI renders `err.message` directly via `<FieldError>`.
- **Stock is event-sourced** (`currentStockQty` = sum of `inventoryMovements.delta`); a waste row is one negative movement, nothing else updates stock.
- **`formatIDR` lives in `~/lib/money`** (used by inventory screens), distinct from the dashboard's `~/lib/formater`. Use `~/lib/money` here to match the inventory components.
