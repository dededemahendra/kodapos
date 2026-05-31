# Purchases (Sub-project 4) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/inventory/purchases` stub with a kit page to record multi-line ingredient deliveries — bumping stock and updating each ingredient's last cost — plus a purchases log with a detail view.

**Architecture:** New `purchases` table (lines on the doc) + a new `'purchase'` `inventoryMovements.reason`. `purchases.record` inserts the purchase, one stock-in `purchase` movement per line, and overwrites each ingredient's `lastCostPerUnitIDR`. The page is PageHeader + DataTable (log) + a multi-line `PurchaseForm` (reusing `IngredientPicker`) + a detail Sheet. The `'purchase'` reason surfaces as "Pembelian" in the movement-history sheet.

**Tech Stack:** React 19, TanStack Router, Convex + convex-test, Tailwind v4, Lingui (id source / en target), shadcn/ui kit, Vitest (edge-runtime), Playwright. Package manager: **pnpm**. Branch: `feat/purchases` (off `main`).

---

## Conventions for the implementing engineer (read once)

- **pnpm** for all commands. `~` = `src/`, `convex/...` for backend/generated. Convex functions CANNOT import from `~/` (src) — backend computes its own total inline (same `Σ qty×unitCostIDR` formula as the frontend helper).
- **Branch:** `feat/purchases` (already created off `main`, has the design-spec commit). Stay on it.
- **Convex codegen** after schema change: `./node_modules/.bin/convex codegen` (NOT npx); commit the tracked `convex/_generated/*`.
- **i18n:** author strings in **Indonesian**; `<Trans>` in JSX, `` t`…` `` for attributes. Don't hand-edit `.po`; Task 8 runs extract/compile.
- **Strict TS:** `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` — optional object fields via conditional spread (`...(x ? { k: x } : {})`).
- **Empty states use shadcn `Empty`** (project convention) for table/data empties.
- **Units are the ingredient's canonical unit** (g/ml/piece); qty + unitCostIDR are positive/non-negative **integers** (matching `adjustStock`/stock).
- **Run before any push:** `pnpm lingui:extract` → fill `en` → `pnpm typecheck && pnpm test && pnpm lingui:compile`.
- **Commit style:** small Conventional Commits, each ending with a blank line then:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File structure

**Modified**
- `convex/schema.ts` — `purchases` table + `'purchase'` reason.
- `convex/_generated/*` — codegen.
- `convex/ingredients.ts` — `listMovements`' `movementRow` reason union (+`'purchase'`).
- `src/lib/inventory-movement.ts` + `.test.ts` — `MovementReason` + `movementTypeVariant('purchase')`.
- `src/components/inventory/movement-history-sheet.tsx` — render "Pembelian".
- `src/routes/_pos/inventory/purchases.tsx` — replace stub.
- `tests/convex/*`, an e2e spec, Lingui catalogs.

**New**
- `convex/purchases.ts` — `record` / `recent` / `get`.
- `src/lib/purchase.ts` + `.test.ts` — `purchaseTotalIDR`.
- `src/components/inventory/purchase-form.tsx` — multi-line record form.

---

## Task 1: Schema + `'purchase'` movement reason (+ ripple)

**Files:** `convex/schema.ts`, `convex/_generated/*`, `convex/ingredients.ts`, `src/lib/inventory-movement.ts`, `src/lib/inventory-movement.test.ts`, `src/components/inventory/movement-history-sheet.tsx`

- [ ] **Step 1: Add the `purchases` table + `'purchase'` reason**

In `convex/schema.ts`, add `'purchase'` to the `inventoryMovements.reason` union:
```ts
    reason: v.union(
      v.literal('sale'),
      v.literal('adjustment'),
      // 'waste' is written by waste.record (dedicated Catat Limbah flow).
      v.literal('waste'),
      // 'purchase' is written by purchases.record (Pembelian flow).
      v.literal('purchase')
    ),
```
And add a new table (near `recipes`):
```ts
  purchases: defineTable({
    cafeId: v.id('cafes'),
    supplierName: v.optional(v.string()),
    at: v.number(),
    lines: v.array(
      v.object({
        ingredientId: v.id('ingredients'),
        qty: v.number(),
        unitCostIDR: v.number(),
      })
    ),
    totalIDR: v.number(),
    createdAt: v.number(),
  }).index('by_cafe_at', ['cafeId', 'at']),
```
Run: `./node_modules/.bin/convex codegen` — regenerates `convex/_generated/*`.

- [ ] **Step 2: Add `'purchase'` to the `listMovements` movementRow validator**

In `convex/ingredients.ts`, the `movementRow` validator's `reason` field is:
```ts
  reason: v.union(v.literal('sale'), v.literal('adjustment'), v.literal('waste')),
```
Change it to:
```ts
  reason: v.union(
    v.literal('sale'),
    v.literal('adjustment'),
    v.literal('waste'),
    v.literal('purchase')
  ),
```

- [ ] **Step 3: Update the movement type helper + its test**

Edit `src/lib/inventory-movement.ts`:
```ts
import type { StatusBadgeVariant } from '~/components/ui/status-badge-variant';

export type MovementReason = 'sale' | 'adjustment' | 'waste' | 'purchase';

// Semantic colour for a movement row's type badge. Pure → unit-testable.
export function movementTypeVariant(reason: MovementReason): StatusBadgeVariant {
  switch (reason) {
    case 'sale':
      return 'muted';
    case 'adjustment':
      return 'success';
    case 'waste':
      return 'danger';
    case 'purchase':
      return 'success';
  }
}
```
Append a case to `src/lib/inventory-movement.test.ts`'s existing `describe`/`it` (add an assertion):
```ts
    expect(movementTypeVariant('purchase')).toBe('success');
```

- [ ] **Step 4: Render the "Pembelian" type in the movement-history sheet**

In `src/components/inventory/movement-history-sheet.tsx`, the Tipe cell currently is:
```tsx
                        <StatusBadge variant={movementTypeVariant(r.reason)}>
                          {r.reason === 'sale' ? (
                            <Trans>Penjualan</Trans>
                          ) : r.reason === 'adjustment' ? (
                            <Trans>Penyesuaian</Trans>
                          ) : (
                            <Trans>Limbah</Trans>
                          )}
                        </StatusBadge>
```
Change the inner ternary to handle `'purchase'`:
```tsx
                        <StatusBadge variant={movementTypeVariant(r.reason)}>
                          {r.reason === 'sale' ? (
                            <Trans>Penjualan</Trans>
                          ) : r.reason === 'adjustment' ? (
                            <Trans>Penyesuaian</Trans>
                          ) : r.reason === 'purchase' ? (
                            <Trans>Pembelian</Trans>
                          ) : (
                            <Trans>Limbah</Trans>
                          )}
                        </StatusBadge>
```

- [ ] **Step 5: Verify + commit**

Run: `pnpm test src/lib/inventory-movement.test.ts` (PASS) then `pnpm typecheck` (PASS) then `pnpm test` (full suite PASS — the `movementTypeVariant` switch is now exhaustive over 4 reasons).
```bash
git add convex/schema.ts convex/_generated convex/ingredients.ts src/lib/inventory-movement.ts src/lib/inventory-movement.test.ts src/components/inventory/movement-history-sheet.tsx
git commit -m "feat(purchases): add purchases table + 'purchase' movement reason"
```

---

## Task 2: `purchaseTotalIDR` pure helper

**Files:** Create `src/lib/purchase.ts`, `src/lib/purchase.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { purchaseTotalIDR } from './purchase';

describe('purchaseTotalIDR', () => {
  it('sums qty × unitCostIDR across lines', () => {
    expect(
      purchaseTotalIDR([
        { qty: 5, unitCostIDR: 50000 },
        { qty: 10, unitCostIDR: 25000 },
      ])
    ).toBe(500000);
  });

  it('returns 0 for no lines', () => {
    expect(purchaseTotalIDR([])).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/lib/purchase.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// Purchase grand total: Σ qty × unitCostIDR. qty and unitCostIDR are integers
// (validated at entry + in the mutation), so the result is integer rupiah.
// Reused for the form's live total and matches the backend's stored totalIDR.
export function purchaseTotalIDR(
  lines: { qty: number; unitCostIDR: number }[]
): number {
  return lines.reduce((sum, l) => sum + l.qty * l.unitCostIDR, 0);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/lib/purchase.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/purchase.ts src/lib/purchase.test.ts
git commit -m "feat(purchases): add purchaseTotalIDR helper with tests"
```

---

## Task 3: `purchases.record` mutation

**Files:** Create `convex/purchases.ts`; Test `tests/convex/purchases.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/convex/purchases.test.ts`:
```ts
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setup(t: ReturnType<typeof convexTest>, email = 'o@x.com') {
  const userId = await t.run(async (ctx) =>
    ctx.db.insert('users', { name: 'Owner', email })
  );
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  const biji = await asOwner.mutation(api.ingredients.upsert, {
    name: 'Biji', canonicalUnit: 'g', reorderThreshold: 0, lastCostPerUnitIDR: 40,
  });
  const susu = await asOwner.mutation(api.ingredients.upsert, {
    name: 'Susu', canonicalUnit: 'ml', reorderThreshold: 0, lastCostPerUnitIDR: 20,
  });
  return { asOwner, biji, susu };
}

describe('purchases.record', () => {
  it('records a multi-line purchase: stock rises, lastCost updated, total stored', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, biji, susu } = await setup(t);
    const purchaseId = await asOwner.mutation(api.purchases.record, {
      supplierName: 'Kopi Jaya',
      lines: [
        { ingredientId: biji, qty: 5000, unitCostIDR: 50 },
        { ingredientId: susu, qty: 10000, unitCostIDR: 25 },
      ],
    });
    expect(purchaseId).toBeTruthy();
    // Stock rose by each qty.
    const ings = await asOwner.query(api.ingredients.list, {});
    const bijiRow = ings.find((i) => i._id === biji);
    const susuRow = ings.find((i) => i._id === susu);
    expect(bijiRow?.currentStockQty).toBe(5000);
    expect(susuRow?.currentStockQty).toBe(10000);
    // lastCostPerUnitIDR overwritten with the purchase unit cost.
    expect(bijiRow?.lastCostPerUnitIDR).toBe(50);
    expect(susuRow?.lastCostPerUnitIDR).toBe(25);
    // Total stored = 5000×50 + 10000×25 = 250000 + 250000 = 500000.
    const recent = await asOwner.query(api.purchases.recent, {});
    expect(recent[0]?.totalIDR).toBe(500000);
    expect(recent[0]?.lineCount).toBe(2);
    expect(recent[0]?.supplierName).toBe('Kopi Jaya');
  });

  it('writes one purchase movement per line (visible in listMovements, not recentAdjustments)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, biji } = await setup(t);
    await asOwner.mutation(api.purchases.record, {
      lines: [{ ingredientId: biji, qty: 1000, unitCostIDR: 40 }],
    });
    const { rows } = await asOwner.query(api.ingredients.listMovements, { ingredientId: biji });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.reason).toBe('purchase');
    expect(rows[0]?.delta).toBe(1000);
    // Purchases are NOT adjustments.
    expect(await asOwner.query(api.ingredients.recentAdjustments, {})).toHaveLength(0);
  });

  it('rejects empty lines / bad qty / negative cost / foreign ingredient', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, biji } = await setup(t);
    await expect(
      asOwner.mutation(api.purchases.record, { lines: [] })
    ).rejects.toThrow(/minimal satu/i);
    await expect(
      asOwner.mutation(api.purchases.record, { lines: [{ ingredientId: biji, qty: 0, unitCostIDR: 10 }] })
    ).rejects.toThrow(/jumlah/i);
    await expect(
      asOwner.mutation(api.purchases.record, { lines: [{ ingredientId: biji, qty: 5, unitCostIDR: -1 }] })
    ).rejects.toThrow(/biaya/i);
    const { biji: otherBiji } = await setup(t, 'b@x.com');
    await expect(
      asOwner.mutation(api.purchases.record, { lines: [{ ingredientId: otherBiji, qty: 5, unitCostIDR: 10 }] })
    ).rejects.toThrow(/tidak ditemukan/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/convex/purchases.test.ts -t "purchases.record"`
Expected: FAIL — `api.purchases.record` does not exist.

- [ ] **Step 3: Implement `record`**

Create `convex/purchases.ts`:
```ts
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwnerCafe } from './lib/auth';

export const record = mutation({
  args: {
    supplierName: v.optional(v.string()),
    lines: v.array(
      v.object({
        ingredientId: v.id('ingredients'),
        qty: v.number(),
        unitCostIDR: v.number(),
      })
    ),
  },
  returns: v.id('purchases'),
  handler: async (ctx, args) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    if (args.lines.length === 0) {
      throw new Error('Pembelian harus punya minimal satu bahan.');
    }
    for (const line of args.lines) {
      if (!Number.isInteger(line.qty) || line.qty <= 0) {
        throw new Error('Jumlah harus bilangan bulat lebih dari nol.');
      }
      if (!Number.isInteger(line.unitCostIDR) || line.unitCostIDR < 0) {
        throw new Error('Biaya per satuan harus bilangan bulat ≥ 0.');
      }
      const ing = await ctx.db.get(line.ingredientId);
      if (!ing || ing.cafeId !== cafeId || ing.archived) {
        throw new Error('Bahan tidak ditemukan.');
      }
    }
    const totalIDR = args.lines.reduce((sum, l) => sum + l.qty * l.unitCostIDR, 0);
    const now = Date.now();
    const supplierName = args.supplierName?.trim();
    const purchaseId = await ctx.db.insert('purchases', {
      cafeId,
      ...(supplierName ? { supplierName } : {}),
      at: now,
      lines: args.lines,
      totalIDR,
      createdAt: now,
    });
    for (const line of args.lines) {
      await ctx.db.insert('inventoryMovements', {
        cafeId,
        ingredientId: line.ingredientId,
        delta: line.qty,
        reason: 'purchase',
        refType: 'purchase',
        refId: purchaseId as unknown as string,
        at: now,
      });
      await ctx.db.patch(line.ingredientId, { lastCostPerUnitIDR: line.unitCostIDR });
    }
    return purchaseId;
  },
});
```

- [ ] **Step 4: Run the record tests**

Run: `pnpm test tests/convex/purchases.test.ts -t "purchases.record"`
Expected: the "rejects" + "movement per line" + (the multi-line) test all pass EXCEPT any that call `purchases.recent` (added in Task 4). If the first test fails only on the `recent` query (not on stock/lastCost), that's expected — it goes green after Task 4. Confirm at minimum the "writes one purchase movement per line" and "rejects" tests pass now.

> Note: the first test reads `purchases.recent`; it fully passes after Task 4. The movement + validation tests pass now.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck
git add convex/purchases.ts tests/convex/purchases.test.ts
git commit -m "feat(purchases): add purchases.record mutation"
```

---

## Task 4: `purchases.recent` + `purchases.get` queries

**Files:** Modify `convex/purchases.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/convex/purchases.test.ts`:
```ts
describe('purchases.recent / get', () => {
  it('lists purchases newest-first and resolves detail lines', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, biji, susu } = await setup(t);
    const id = await asOwner.mutation(api.purchases.record, {
      supplierName: 'Kopi Jaya',
      lines: [
        { ingredientId: biji, qty: 5000, unitCostIDR: 50 },
        { ingredientId: susu, qty: 10000, unitCostIDR: 25 },
      ],
    });
    const recent = await asOwner.query(api.purchases.recent, {});
    expect(recent).toHaveLength(1);
    expect(recent[0]?.id).toBe(id);
    expect(recent[0]?.lineCount).toBe(2);
    const detail = await asOwner.query(api.purchases.get, { id });
    expect(detail?.supplierName).toBe('Kopi Jaya');
    expect(detail?.totalIDR).toBe(500000);
    expect(detail?.lines).toHaveLength(2);
    const bijiLine = detail?.lines.find((l) => l.ingredientName === 'Biji');
    expect(bijiLine?.qty).toBe(5000);
    expect(bijiLine?.unit).toBe('g');
    expect(bijiLine?.unitCostIDR).toBe(50);
    expect(bijiLine?.subtotalIDR).toBe(250000);
  });

  it('get + recent are cafe-scoped', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, biji } = await setup(t);
    const id = await asOwner.mutation(api.purchases.record, {
      lines: [{ ingredientId: biji, qty: 100, unitCostIDR: 40 }],
    });
    const { asOwner: ownerB } = await setup(t, 'b@x.com');
    expect(await ownerB.query(api.purchases.recent, {})).toHaveLength(0);
    expect(await ownerB.query(api.purchases.get, { id })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/convex/purchases.test.ts -t "recent / get"`
Expected: FAIL — `purchases.recent`/`purchases.get` do not exist.

- [ ] **Step 3: Implement the queries**

Append to `convex/purchases.ts`:
```ts
const purchaseRow = v.object({
  id: v.id('purchases'),
  at: v.number(),
  supplierName: v.optional(v.string()),
  lineCount: v.number(),
  totalIDR: v.number(),
});

export const recent = query({
  args: { days: v.optional(v.number()) },
  returns: v.array(purchaseRow),
  handler: async (ctx, { days = 30 }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const cutoff = Date.now() - days * 86_400_000;
    const purchases = await ctx.db
      .query('purchases')
      .withIndex('by_cafe_at', (q) => q.eq('cafeId', cafeId).gt('at', cutoff))
      .order('desc')
      .collect();
    return purchases.map((p) => ({
      id: p._id,
      at: p.at,
      ...(p.supplierName ? { supplierName: p.supplierName } : {}),
      lineCount: p.lines.length,
      totalIDR: p.totalIDR,
    }));
  },
});

const purchaseDetail = v.object({
  id: v.id('purchases'),
  at: v.number(),
  supplierName: v.optional(v.string()),
  totalIDR: v.number(),
  lines: v.array(
    v.object({
      ingredientName: v.string(),
      unit: v.union(v.literal('g'), v.literal('ml'), v.literal('piece')),
      qty: v.number(),
      unitCostIDR: v.number(),
      subtotalIDR: v.number(),
    })
  ),
});

export const get = query({
  args: { id: v.id('purchases') },
  returns: v.union(purchaseDetail, v.null()),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const p = await ctx.db.get(id);
    if (!p || p.cafeId !== cafeId) return null;
    const lines = [];
    for (const line of p.lines) {
      const ing = await ctx.db.get(line.ingredientId);
      lines.push({
        ingredientName: ing?.name ?? '—',
        unit: ing?.canonicalUnit ?? ('piece' as const),
        qty: line.qty,
        unitCostIDR: line.unitCostIDR,
        subtotalIDR: line.qty * line.unitCostIDR,
      });
    }
    return {
      id: p._id,
      at: p.at,
      ...(p.supplierName ? { supplierName: p.supplierName } : {}),
      totalIDR: p.totalIDR,
      lines,
    };
  },
});
```

- [ ] **Step 4: Run the full purchases suite**

Run: `pnpm test tests/convex/purchases.test.ts`
Expected: PASS (all — record incl. the `recent` assertions, recent/get, tenant isolation).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck
git add convex/purchases.ts tests/convex/purchases.test.ts
git commit -m "feat(purchases): add purchases.recent + get queries"
```

---

## Task 5: `PurchaseForm` component

**Files:** Create `src/components/inventory/purchase-form.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { Trash2 } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { IngredientPicker } from '~/components/inventory/ingredient-picker';
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
import { Spinner } from '~/components/ui/spinner';
import { formatIDR } from '~/lib/money';
import { purchaseTotalIDR } from '~/lib/purchase';
import { toast } from '~/lib/toast';

type DraftLine = {
  key: string;
  ingredientId: Id<'ingredients'> | null;
  qty: string;
  unitCostIDR: string;
};

function makeKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyLine(): DraftLine {
  return { key: makeKey(), ingredientId: null, qty: '', unitCostIDR: '' };
}

export function PurchaseForm({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const ingredients = useQuery(api.ingredients.list, {});
  const record = useMutation(api.purchases.record);
  const [supplier, setSupplier] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unitById = useMemo(() => {
    const m = new Map<Id<'ingredients'>, 'g' | 'ml' | 'piece'>();
    for (const ing of ingredients ?? []) m.set(ing._id, ing.canonicalUnit);
    return m;
  }, [ingredients]);

  // Complete, parsed lines for the live total + submit.
  const parsed = lines
    .map((l) => ({
      ingredientId: l.ingredientId,
      qty: Number.parseInt(l.qty, 10),
      unitCostIDR: Number.parseInt(l.unitCostIDR, 10),
    }))
    .filter(
      (l): l is { ingredientId: Id<'ingredients'>; qty: number; unitCostIDR: number } =>
        l.ingredientId !== null &&
        Number.isInteger(l.qty) &&
        l.qty > 0 &&
        Number.isInteger(l.unitCostIDR) &&
        l.unitCostIDR >= 0
    );
  const total = purchaseTotalIDR(parsed);

  function reset() {
    setSupplier('');
    setLines([emptyLine()]);
    setError(null);
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    if (parsed.length === 0) {
      setError(t`Tambahkan minimal satu bahan dengan jumlah dan biaya.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await record({
        ...(supplier.trim() ? { supplierName: supplier.trim() } : {}),
        lines: parsed,
      });
      toast.success(t`Pembelian dicatat.`);
      reset();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t`Gagal mencatat pembelian.`;
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <Trans>Catat Pembelian</Trans>
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="supplier">
                <Trans>Pemasok (opsional)</Trans>
              </FieldLabel>
              <Input
                id="supplier"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                maxLength={80}
              />
            </Field>
            <div className="space-y-3">
              {lines.map((line) => {
                const unit = line.ingredientId ? unitById.get(line.ingredientId) : null;
                return (
                  <div key={line.key} className="flex items-end gap-2">
                    <div className="flex-1">
                      <IngredientPicker
                        value={line.ingredientId}
                        onChange={(id) => updateLine(line.key, { ingredientId: id })}
                      />
                    </div>
                    <div className="w-20">
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        placeholder={unit ? t`Qty (${unit})` : t`Qty`}
                        value={line.qty}
                        onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                      />
                    </div>
                    <div className="w-28">
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        placeholder={t`Biaya/satuan`}
                        value={line.unitCostIDR}
                        onChange={(e) => updateLine(line.key, { unitCostIDR: e.target.value })}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t`Hapus baris`}
                      onClick={() =>
                        setLines((prev) =>
                          prev.length > 1 ? prev.filter((l) => l.key !== line.key) : prev
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                );
              })}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setLines((prev) => [...prev, emptyLine()])}
              >
                <Trans>+ Tambah bahan</Trans>
              </Button>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-sm">
              <span className="text-muted-foreground">
                <Trans>Total</Trans>
              </span>
              <span className="font-semibold tabular-nums">{formatIDR(total)}</span>
            </div>
            {error && <FieldError>{error}</FieldError>}
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                onOpenChange(false);
                reset();
              }}
            >
              <Trans>Batal</Trans>
            </Button>
            <Button type="submit" disabled={submitting || parsed.length === 0}>
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

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm typecheck` (PASS — `Button` supports `size="icon-sm"`; `IngredientPicker` props are `{ value, onChange, onRequestCreate? }`).
```bash
git add src/components/inventory/purchase-form.tsx
git commit -m "feat(purchases): add multi-line PurchaseForm"
```

---

## Task 6: Purchases page (replace stub)

**Files:** Modify `src/routes/_pos/inventory/purchases.tsx`

- [ ] **Step 1: Replace the whole file**

```tsx
import { Trans } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { Truck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PurchaseForm } from '~/components/inventory/purchase-form';
import { Button } from '~/components/ui/button';
import { DataTable } from '~/components/ui/data-table';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { PageHeader } from '~/components/ui/page-header';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { formatDate } from '~/lib/formater';
import { formatIDR } from '~/lib/money';

export const Route = createFileRoute('/_pos/inventory/purchases')({
  component: PurchasesPage,
});

type PurchaseRow = {
  id: Id<'purchases'>;
  at: number;
  supplierName?: string;
  lineCount: number;
  totalIDR: number;
};

function PurchasesPage() {
  const [formOpen, setFormOpen] = useState(false);
  const [viewId, setViewId] = useState<Id<'purchases'> | null>(null);
  const rows = useQuery(api.purchases.recent, {}) as PurchaseRow[] | undefined;

  const columns = useMemo<ColumnDef<PurchaseRow, unknown>[]>(
    () => [
      {
        accessorKey: 'at',
        header: () => <Trans>Tanggal</Trans>,
        cell: ({ row }) => (
          <button
            type="button"
            className="font-medium hover:underline"
            onClick={() => setViewId(row.original.id)}
          >
            {formatDate(new Date(row.original.at).toISOString(), 'day-month')}
          </button>
        ),
      },
      {
        accessorKey: 'supplierName',
        enableSorting: false,
        header: () => <Trans>Pemasok</Trans>,
        cell: ({ row }) => (
          <span>{row.original.supplierName ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'lineCount',
        enableSorting: false,
        header: () => <Trans>Item</Trans>,
        cell: ({ row }) => <span className="tabular-nums">{row.original.lineCount}</span>,
      },
      {
        accessorKey: 'totalIDR',
        header: () => <Trans>Total</Trans>,
        cell: ({ row }) => (
          <span className="tabular-nums">{formatIDR(row.original.totalIDR)}</span>
        ),
      },
    ],
    []
  );

  const emptyState = (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Truck />
        </EmptyMedia>
        <EmptyTitle>
          <Trans>Belum ada pembelian.</Trans>
        </EmptyTitle>
        <EmptyDescription>
          <Trans>Catat pembelian untuk menambah stok dan memperbarui biaya bahan.</Trans>
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  return (
    <main className="p-6">
      <PageHeader
        title={<Trans>Pembelian</Trans>}
        meta={rows ? <Trans>{rows.length} pembelian · 30 hari</Trans> : null}
        actions={
          <Button type="button" onClick={() => setFormOpen(true)}>
            <Truck />
            <Trans>Catat Pembelian</Trans>
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={rows}
        emptyState={emptyState}
        initialSort={[{ id: 'at', desc: true }]}
      />

      <PurchaseForm open={formOpen} onOpenChange={setFormOpen} />
      <PurchaseDetailSheet
        viewId={viewId}
        onOpenChange={(o) => {
          if (!o) setViewId(null);
        }}
      />
    </main>
  );
}

function PurchaseDetailSheet({
  viewId,
  onOpenChange,
}: {
  viewId: Id<'purchases'> | null;
  onOpenChange: (open: boolean) => void;
}) {
  const detail = useQuery(api.purchases.get, viewId ? { id: viewId } : 'skip');
  return (
    <Sheet open={viewId !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            <Trans>Pembelian</Trans>
            {detail?.supplierName ? ` — ${detail.supplierName}` : ''}
          </SheetTitle>
          <SheetDescription className="sr-only">
            <Trans>Rincian baris pembelian.</Trans>
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 text-sm">
          {detail === undefined ? (
            <p className="text-muted-foreground">
              <Trans>Memuat…</Trans>
            </p>
          ) : detail === null ? (
            <p className="text-muted-foreground">
              <Trans>Pembelian tidak ditemukan.</Trans>
            </p>
          ) : (
            <>
              <p className="mb-2 text-xs tabular-nums text-muted-foreground">
                {formatDate(new Date(detail.at).toISOString(), 'day-month')}
              </p>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2"><Trans>Bahan</Trans></th>
                    <th className="py-2 text-right"><Trans>Qty</Trans></th>
                    <th className="py-2 text-right"><Trans>Biaya/satuan</Trans></th>
                    <th className="py-2 text-right"><Trans>Subtotal</Trans></th>
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.map((l, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: purchase lines are an immutable snapshot in stored order
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-2">{l.ingredientName}</td>
                      <td className="py-2 text-right tabular-nums">
                        {l.qty} {l.unit}
                      </td>
                      <td className="py-2 text-right tabular-nums">{formatIDR(l.unitCostIDR)}</td>
                      <td className="py-2 text-right tabular-nums">{formatIDR(l.subtotalIDR)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2 flex justify-between border-t border-border pt-2">
                <span className="text-muted-foreground">
                  <Trans>Total</Trans>
                </span>
                <span className="font-semibold tabular-nums">{formatIDR(detail.totalIDR)}</span>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Typecheck + full suite**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_pos/inventory/purchases.tsx
git commit -m "feat(purchases): build Pembelian page (log + record + detail)"
```

---

## Task 7: Playwright smoke — record a purchase

**Files:** Modify `tests/e2e/inventory.spec.ts`

Reuses the `signupAndAddSusu` helper at the top of the file (signs up, onboards, PINs in, adds ingredient "Susu"). This test adds a second ingredient, records a 2-line purchase, and verifies the log + stock.

- [ ] **Step 1: Add the test inside the describe block**

In `tests/e2e/inventory.spec.ts`, inside `test.describe('inventory + recipes (auth-gated)', ...)`, after the existing tests:
```ts
  test('Purchases page: record a delivery raises stock and shows in the log', async ({ page }) => {
    await signupAndAddSusu(page);

    // Add a second ingredient "Biji" so the purchase has two lines.
    await page.getByRole('button', { name: /Tambah Bahan/ }).click();
    await page.getByLabel('Nama').fill('Biji');
    await page.getByLabel('Satuan', { exact: true }).click();
    await page.getByRole('option', { name: /Gram/ }).click();
    await page.getByLabel('Ambang isi ulang').fill('0');
    await page.getByLabel('Biaya per satuan (Rp)').fill('40');
    await page.getByRole('button', { name: /^Simpan$/ }).click();
    await expect(page.getByText(/Bahan ditambahkan/)).toBeVisible();

    // Record a 2-line purchase.
    await page.goto('/inventory/purchases');
    await waitForUrlHydrated(page, /\/inventory\/purchases$/);
    await page.getByRole('button', { name: /Catat Pembelian/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/Pemasok/).fill('Kopi Jaya');
    // Line 1: Susu, qty 1000, cost 25.
    const pickers = dialog.getByPlaceholder('Pilih bahan…');
    await pickers.first().click();
    await page.getByRole('button', { name: /^Susu/ }).click();
    await dialog.getByPlaceholder(/Qty/).first().fill('1000');
    await dialog.getByPlaceholder('Biaya/satuan').first().fill('25');
    // Add line 2: Biji, qty 5000, cost 50.
    await dialog.getByRole('button', { name: /Tambah bahan/ }).click();
    await dialog.getByPlaceholder('Pilih bahan…').last().click();
    await page.getByRole('button', { name: /^Biji/ }).click();
    await dialog.getByPlaceholder(/Qty/).last().fill('5000');
    await dialog.getByPlaceholder('Biaya/satuan').last().fill('50');
    await dialog.getByRole('button', { name: /^Simpan$/ }).click();
    await expect(page.getByText(/Pembelian dicatat/)).toBeVisible();

    // Appears in the log with the right total (1000×25 + 5000×50 = 275.000).
    await expect(page.getByRole('cell', { name: /Kopi Jaya/ })).toBeVisible();
    await expect(page.getByRole('cell', { name: /Rp 275\.000/ })).toBeVisible();

    // Stock on the Stock page reflects the added Biji qty.
    await page.goto('/inventory');
    await waitForUrlHydrated(page, /\/inventory$/);
    await expect(page.getByRole('cell', { name: /5000 g/ })).toBeVisible();
  });
```
> Note: selectors for the form (`Pilih bahan…`, `Qty`, `Biaya/satuan`, `+ Tambah bahan`) match `PurchaseForm`; the picker option list is page-scoped (renders outside the dialog subtree). If a selector mismatches on a real run, fix it against the rendered UI and report.

- [ ] **Step 2: Typecheck the spec**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Attempt to run (auth-gated)**

Run:
```bash
RUN_AUTH_E2E=1 pnpm test:e2e tests/e2e/inventory.spec.ts
```
Expected: all pass (Playwright auto-starts `pnpm dev:all`; there are several auth-gated tests now — allow time). If the backend can't start here, do NOT fake a pass — report "could not run: no backend" and confirm the spec typechecks + skips cleanly without the env var. Fix any selector that fails on a real run (prefer role-scoped / `.first()`/`.last()`; the multi-line picker/qty/cost fields and the totals formatting are the likely spots) and report the fix.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/inventory.spec.ts
git commit -m "test(e2e): record a multi-line purchase and verify stock + log"
```

---

## Task 8: i18n — extract, fill English, compile

**Files:** `src/locales/id/messages.po`, `src/locales/en/messages.po`

- [ ] **Step 1: Extract**

Run: `pnpm lingui:extract`

- [ ] **Step 2: Fill English**

In `src/locales/en/messages.po`, fill each NEW empty `msgstr ""`. Preserve placeholders exactly. Mapping:
- `Pembelian` → `Purchases`
- `Catat Pembelian` → `Record Purchase`
- `{0} pembelian · 30 hari` → `{0} purchases · 30 days`  (match the exact placeholder)
- `Pemasok` → `Supplier`
- `Pemasok (opsional)` → `Supplier (optional)`
- `Total` → `Total`  (if already translated, leave)
- `Subtotal` → `Subtotal`
- `Biaya/satuan` → `Cost/unit`
- `Qty` → `Qty`
- `Qty ({0})` → `Qty ({0})`  (the unit-suffixed placeholder variant; keep the placeholder)
- `Hapus baris` → `Remove line`
- `+ Tambah bahan` → `+ Add ingredient`  (if already translated from recipe editor, leave)
- `Pembelian dicatat.` → `Purchase recorded.`
- `Gagal mencatat pembelian.` → `Failed to record purchase.`
- `Tambahkan minimal satu bahan dengan jumlah dan biaya.` → `Add at least one ingredient with quantity and cost.`
- `Belum ada pembelian.` → `No purchases yet.`
- `Catat pembelian untuk menambah stok dan memperbarui biaya bahan.` → `Record purchases to add stock and update ingredient costs.`
- `Rincian baris pembelian.` → `Purchase line details.`
- `Pembelian tidak ditemukan.` → `Purchase not found.`
- Already translated — leave untouched: `Item`, `Tanggal`, `Bahan`, `Batal`, `Simpan`, `Menyimpan…`, `Memuat…`, `Pembelian` movement label (history sheet) shares the `Pembelian` entry.

For any new empty `en` msgstr not listed, translate sensibly and note it.

- [ ] **Step 3: Compile + typecheck**

Run: `pnpm lingui:compile && pnpm typecheck`
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add src/locales/id/messages.po src/locales/en/messages.po
git commit -m "i18n(purchases): extract + fill en for Purchases"
```

---

## Task 9: Full local verification

**Files:** none

- [ ] **Step 1: Full gate**

Run:
```bash
pnpm typecheck && pnpm test && pnpm lingui:compile
```
Expected: typecheck clean; all unit/convex tests PASS (existing + `purchases.record`/`recent`/`get` + `purchaseTotalIDR` + the `movementTypeVariant('purchase')` assertion); compile clean.

- [ ] **Step 2: Lint changed files (Biome, if it runs here)**

Run: `pnpm lint`
Expected: PASS or only pre-existing unrelated findings. The detail-sheet line uses `// biome-ignore lint/suspicious/noArrayIndexKey` (already in the Task 6 code).

- [ ] **Step 3: Confirm clean tree + no further codegen drift**

Run: `git status` then `./node_modules/.bin/convex codegen` then `git status`
Expected: clean after Task 1 committed the `_generated` drift; running codegen again produces nothing new.

- [ ] **Step 4: Integrate (after user OK)**

Per the trunk-based workflow, wait for the user's go-ahead, then push `feat/purchases` and open a PR to `main` (or merge per their choice). Do not merge without approval.

---

## Self-Review (performed against the spec)

**Spec coverage:**
- `purchases` table + `'purchase'` reason (+ codegen, + listMovements validator, + movementTypeVariant, + history sheet "Pembelian") → Task 1.
- `purchaseTotalIDR` pure helper → Task 2.
- `purchases.record` (validate; insert purchase; per-line `purchase` movement with refType/refId; overwrite `lastCostPerUnitIDR`; total) → Task 3 (+ tests for stock/lastCost/total/movement/validation).
- `purchases.recent` + `get` (newest-first; line resolution; tenant isolation) → Task 4.
- `PurchaseForm` (supplier + multi-line editor + live total + canonical-unit qty + toast) → Task 5.
- Pembelian page (PageHeader, DataTable Tanggal→detail/Pemasok/Item/Total, Empty, record form mount, detail Sheet) → Task 6.
- Canonical units + integer qty/cost; cost overwrite; append-only (no `⋯`/edit) → Tasks 3, 5, 6.
- Playwright record + stock + log → Task 7. i18n → Task 8. Verification → Task 9.
- Out-of-scope respected: no edit/void/delete, no suppliers entity, no unit conversion, no AP tracking.

**Placeholder scan:** none. The Task 3 Step 4 note ("first test fully green after Task 4") is a sequencing explanation, not a placeholder — the code is complete. The detail-sheet index key is justified with a `biome-ignore`.

**Type consistency:** `purchases.record` arg `lines: { ingredientId, qty, unitCostIDR }[]` matches `PurchaseForm`'s `parsed` shape and the `purchaseRow`/`purchaseDetail` validators. `purchaseTotalIDR(lines: { qty; unitCostIDR }[])` matches both the form's `parsed` and the backend's inline `reduce`. `MovementReason` now includes `'purchase'` and `movementTypeVariant` is exhaustive over all four; the sheet's `r.reason` (from the extended `movementRow` union) is accepted by `movementTypeVariant`. `PurchaseRow`/`recent` and the detail `get` shape match the page + sheet usage. `refType: 'purchase'` mirrors orders' `refType: 'order'` string convention.
