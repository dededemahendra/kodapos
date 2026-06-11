# Inventory Stock Take (Bulk Recount) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a bulk physical-count flow: one batched `ingredients.performStockTake` mutation + a `StockTakeDialog` listing all active ingredients with a counted-qty input, committing all changed rows as `Stok opname` adjustments.

**Architecture:** Reuse the event-sourced inventory model — the mutation diffs each submitted count against server-recomputed current stock and inserts one `adjustment` `inventoryMovement` (reasonLabel `'Stok opname'`) per changed ingredient. No schema change, no new table, no codegen, no route. The dialog consumes the active ingredients the stock page already fetched.

**Tech Stack:** Convex (mutation), React + shadcn Dialog/Input, Lingui, convex-test/Vitest.

---

## File Structure

- **Modify:** `convex/ingredients.ts` — add `performStockTake` mutation.
- **Create:** `src/components/inventory/stock-take-dialog.tsx` — the bulk-count dialog.
- **Modify:** `src/routes/_pos/inventory/index.tsx` — "Stok opname" header button + dialog wiring.
- **Modify (test):** `tests/convex/ingredients.test.ts` — `performStockTake` tests.
- **i18n:** `src/locales/{id,en}/messages.po`.

---

### Task 1: `performStockTake` mutation (TDD)

**Files:**
- Modify: `convex/ingredients.ts`
- Test: `tests/convex/ingredients.test.ts`

READ first: `convex/ingredients.ts` (the existing `adjustStock` mutation + `requireOwned`/
`requireOwnerCafe`/`currentStockQty` imports already present), and the existing
`adjustStock` tests in `tests/convex/ingredients.test.ts` (mirror their setup: `setupOwner`,
seeding stock via `api.ingredients.adjustStock` or a `t.run` movement insert).

- [ ] **Step 1: Write failing tests**

Add a `describe('ingredients.performStockTake', ...)` block. Use the file's existing
`setupOwner` helper and the same seeding approach the `adjustStock` tests use. Cover:

```ts
describe('ingredients.performStockTake', () => {
  it('adjusts only changed ingredients and sets stock to counted qty', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const mk = (name: string) =>
      asOwner.mutation(api.ingredients.upsert, {
        name, canonicalUnit: 'piece', reorderThreshold: 0, lastCostPerUnitIDR: 100,
      });
    const a = await mk('A');
    const b = await mk('B');
    const c = await mk('C');
    // Seed: A=10, B=5, C=0 (via single adjustments)
    await asOwner.mutation(api.ingredients.adjustStock, { ingredientId: a, newQty: 10, reasonLabel: 'Koreksi' });
    await asOwner.mutation(api.ingredients.adjustStock, { ingredientId: b, newQty: 5, reasonLabel: 'Koreksi' });

    // Count: A=10 (unchanged), B=8 (+3), C=2 (+2)
    const res = await asOwner.mutation(api.ingredients.performStockTake, {
      counts: [
        { ingredientId: a, countedQty: 10 },
        { ingredientId: b, countedQty: 8 },
        { ingredientId: c, countedQty: 2 },
      ],
    });
    expect(res.adjusted).toBe(2);

    const list = await asOwner.query(api.ingredients.list, {});
    const byName = Object.fromEntries(list.map((r) => [r.name, r.currentStockQty]));
    expect(byName.A).toBe(10);
    expect(byName.B).toBe(8);
    expect(byName.C).toBe(2);
  });

  it('tags every written movement as a Stok opname adjustment', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const a = await asOwner.mutation(api.ingredients.upsert, {
      name: 'A', canonicalUnit: 'piece', reorderThreshold: 0, lastCostPerUnitIDR: 100,
    });
    await asOwner.mutation(api.ingredients.performStockTake, {
      counts: [{ ingredientId: a, countedQty: 7 }],
      note: 'opname juni',
    });
    const adj = await asOwner.query(api.ingredients.recentAdjustments, {});
    expect(adj).toHaveLength(1);
    expect(adj[0]?.reasonLabel).toBe('Stok opname');
    expect(adj[0]?.delta).toBe(7);
    expect(adj[0]?.note).toBe('opname juni');
  });

  it('rejects a negative or non-integer count and writes nothing', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const a = await asOwner.mutation(api.ingredients.upsert, {
      name: 'A', canonicalUnit: 'piece', reorderThreshold: 0, lastCostPerUnitIDR: 100,
    });
    await asOwner.mutation(api.ingredients.adjustStock, { ingredientId: a, newQty: 4, reasonLabel: 'Koreksi' });
    await expect(
      asOwner.mutation(api.ingredients.performStockTake, {
        counts: [{ ingredientId: a, countedQty: -1 }],
      })
    ).rejects.toThrow();
    const got = await asOwner.query(api.ingredients.get, { id: a });
    expect(got?.currentStockQty).toBe(4); // unchanged
  });

  it('returns { adjusted: 0 } for empty counts', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const res = await asOwner.mutation(api.ingredients.performStockTake, { counts: [] });
    expect(res.adjusted).toBe(0);
  });

  it('rejects a foreign ingredient id (owner-scoped)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const { asOwner: asOther } = await setupOwner(t, 'other@x.com');
    const foreign = await asOther.mutation(api.ingredients.upsert, {
      name: 'X', canonicalUnit: 'piece', reorderThreshold: 0, lastCostPerUnitIDR: 100,
    });
    await expect(
      asOwner.mutation(api.ingredients.performStockTake, {
        counts: [{ ingredientId: foreign, countedQty: 3 }],
      })
    ).rejects.toThrow();
  });
});
```

> If `recentAdjustments` does not surface `note`/`reasonLabel` as asserted, fall back to a
> `t.run` query over `inventoryMovements` filtered to the ingredient and assert
> `reason==='adjustment'`, `reasonLabel==='Stok opname'`, `note`, `delta`. Check the
> `adjustmentRow` validator in `ingredients.ts` (it includes `reasonLabel` + `note`).

- [ ] **Step 2: Run tests — verify they FAIL**

Run: `pnpm test tests/convex/ingredients.test.ts`
Expected: FAIL (`api.ingredients.performStockTake` does not exist yet).

- [ ] **Step 3: Implement the mutation**

Add to `convex/ingredients.ts` (after `adjustStock`). The file already imports `v`,
`mutation`, `requireOwnerCafe`, `requireOwned`, `currentStockQty`:

```ts
export const performStockTake = mutation({
  args: {
    counts: v.array(
      v.object({ ingredientId: v.id('ingredients'), countedQty: v.number() })
    ),
    note: v.optional(v.string()),
  },
  returns: v.object({ adjusted: v.number() }),
  handler: async (ctx, { counts, note }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    for (const c of counts) {
      if (!Number.isInteger(c.countedQty) || c.countedQty < 0) {
        throw new Error('Stok harus berupa angka bulat ≥ 0.');
      }
    }
    const trimmedNote = note?.trim();
    let adjusted = 0;
    for (const c of counts) {
      await requireOwned(ctx, cafeId, c.ingredientId, 'Bahan');
      const current = await currentStockQty(ctx, cafeId, c.ingredientId);
      const delta = c.countedQty - current;
      if (delta === 0) continue;
      await ctx.db.insert('inventoryMovements', {
        cafeId,
        ingredientId: c.ingredientId,
        delta,
        reason: 'adjustment',
        reasonLabel: 'Stok opname',
        ...(trimmedNote ? { note: trimmedNote } : {}),
        at: Date.now(),
      });
      adjusted += 1;
    }
    return { adjusted };
  },
});
```

- [ ] **Step 4: Run tests — verify PASS**

Run: `pnpm test tests/convex/ingredients.test.ts`
Expected: PASS (all new cases + existing ones).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm typecheck` (expect PASS).
```bash
git add convex/ingredients.ts tests/convex/ingredients.test.ts
git commit -m "feat(inventory): performStockTake batched recount mutation"
```

---

### Task 2: `StockTakeDialog` component

**Files:**
- Create: `src/components/inventory/stock-take-dialog.tsx`

READ first: `src/components/inventory/stock-adjust-dialog.tsx` (mirror its Dialog
structure, mutation/submit/error/toast/Spinner patterns) and the top of
`src/routes/_pos/inventory/index.tsx` (the `Ingredient` row type:
`Doc<'ingredients'> & { currentStockQty: number }`).

- [ ] **Step 1: Write the component**

```tsx
import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Doc } from 'convex/_generated/dataModel';
import { useMutation } from 'convex/react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Field, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { toast } from '~/lib/toast';

type Ingredient = Doc<'ingredients'> & { currentStockQty: number };

export function StockTakeDialog({
  open,
  ingredients,
  onOpenChange,
}: {
  open: boolean;
  ingredients: Ingredient[] | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const performStockTake = useMutation(api.ingredients.performStockTake);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && ingredients) {
      const seed: Record<string, string> = {};
      for (const r of ingredients) seed[r._id] = String(r.currentStockQty);
      setCounts(seed);
      setNote('');
    }
  }, [open, ingredients]);

  const changedCount = useMemo(() => {
    if (!ingredients) return 0;
    let n = 0;
    for (const r of ingredients) {
      const parsed = Number.parseInt(counts[r._id] ?? '', 10);
      const counted = Number.isNaN(parsed) ? 0 : parsed;
      if (counted !== r.currentStockQty) n += 1;
    }
    return n;
  }, [ingredients, counts]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ingredients || submitting || changedCount === 0) return;
    setSubmitting(true);
    try {
      const payload = ingredients.map((r) => {
        const parsed = Number.parseInt(counts[r._id] ?? '', 10);
        return {
          ingredientId: r._id,
          countedQty: Number.isNaN(parsed) ? 0 : parsed,
        };
      });
      const res = await performStockTake({
        counts: payload,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      toast.success(
        t`Stok opname selesai · ${res.adjusted} bahan disesuaikan.`
      );
      onOpenChange(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t`Gagal menyimpan stok opname.`;
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  const empty = ingredients !== undefined && ingredients.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            <Trans>Stok opname</Trans>
          </DialogTitle>
        </DialogHeader>

        {empty ? (
          <p className="text-muted-foreground text-sm">
            <Trans>Belum ada bahan untuk dihitung.</Trans>
          </p>
        ) : (
          <form onSubmit={onSubmit}>
            <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
              <div className="grid grid-cols-[1fr_auto_6rem] items-center gap-2 px-1 text-muted-foreground text-xs">
                <span><Trans>Bahan</Trans></span>
                <span className="text-right"><Trans>Sistem</Trans></span>
                <span className="text-right"><Trans>Hitung fisik</Trans></span>
              </div>
              {ingredients?.map((r) => (
                <div
                  key={r._id}
                  className="grid grid-cols-[1fr_auto_6rem] items-center gap-2"
                >
                  <span className="truncate text-sm">{r.name}</span>
                  <span className="text-right text-muted-foreground text-sm tabular-nums">
                    {r.currentStockQty} {r.canonicalUnit}
                  </span>
                  <Input
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
                </div>
              ))}
            </div>

            <Field className="mt-3">
              <FieldLabel htmlFor="take-note">
                <Trans>Catatan (opsional)</Trans>
              </FieldLabel>
              <Input
                id="take-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
              />
            </Field>

            <DialogFooter className="mt-4 sm:items-center sm:justify-between">
              <span className="text-muted-foreground text-sm">
                <Trans>{changedCount} bahan akan disesuaikan</Trans>
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                >
                  <Trans>Batal</Trans>
                </Button>
                <Button type="submit" disabled={submitting || changedCount === 0}>
                  {submitting && <Spinner data-icon="inline-start" />}
                  {submitting ? <Trans>Menyimpan…</Trans> : <Trans>Simpan</Trans>}
                </Button>
              </div>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

Before finalizing, verify the imports exist and match usage elsewhere: `Field`/`FieldLabel`
from `~/components/ui/field` (used in `stock-adjust-dialog.tsx`), `Dialog*` from
`~/components/ui/dialog`, `Spinner` from `~/components/ui/spinner`, `toast` from `~/lib/toast`.
If `DialogContent` does not accept a `className`, drop it (check the other dialog usages).

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no errors in `stock-take-dialog.tsx`).

- [ ] **Step 3: Commit**

```bash
git add src/components/inventory/stock-take-dialog.tsx
git commit -m "feat(inventory): stock take dialog (bulk recount form)"
```

---

### Task 3: Wire the dialog into the stock page

**Files:**
- Modify: `src/routes/_pos/inventory/index.tsx`

READ the file (it's ~305 lines; the imports, the `counts` memo, the `PageHeader` `actions`
slot, and where dialogs are rendered near the bottom).

- [ ] **Step 1: Imports**

Add near the other `~/components/inventory/*` imports:
```tsx
import { StockTakeDialog } from '~/components/inventory/stock-take-dialog';
```
Add `ClipboardList` to the existing `lucide-react` import (the file already imports icons
like `Archive, History, PackagePlus, Pencil, Plus`):
```tsx
import { Archive, ClipboardList, History, PackagePlus, Pencil, Plus } from 'lucide-react';
```

- [ ] **Step 2: State + active-ingredients memo**

Add alongside the other `useState` hooks:
```tsx
  const [takeOpen, setTakeOpen] = useState(false);
```
Add an active-ingredients memo (non-archived) near the `counts` memo:
```tsx
  const activeIngredients = useMemo(
    () => ingredients?.filter((r) => !r.archived),
    [ingredients]
  );
```

- [ ] **Step 3: Header action button**

In the `PageHeader` `actions` prop, wrap the existing "Tambah Bahan" button and a new
"Stok opname" button together:
```tsx
        actions={
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setTakeOpen(true)}
            >
              <ClipboardList />
              <Trans>Stok opname</Trans>
            </Button>
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus />
              <Trans>Tambah Bahan</Trans>
            </Button>
          </div>
        }
```

- [ ] **Step 4: Render the dialog**

Next to the other dialogs near the bottom (e.g. after `<StockAdjustDialog ... />`):
```tsx
      <StockTakeDialog
        open={takeOpen}
        ingredients={activeIngredients}
        onOpenChange={setTakeOpen}
      />
```

Do not change columns, filters, `StockSummary`, the existing dialogs, or the meta line.

- [ ] **Step 5: Typecheck + test + commit**

Run: `pnpm typecheck` (PASS), `pnpm test` (PASS — full suite green).
```bash
git add src/routes/_pos/inventory/index.tsx
git commit -m "feat(inventory): stok opname button + dialog on stock page"
```

---

### Task 4: i18n — extract, fill `en`, compile

**Files:**
- Modify: `src/locales/id/messages.po`, `src/locales/en/messages.po` (+ compiled output).

New strings (from Tasks 2–3): `Stok opname`, `Sistem`, `Hitung fisik`,
`Hitung fisik {name}`, `{changedCount} bahan akan disesuaikan`,
`Stok opname selesai · {adjusted} bahan disesuaikan.`, `Belum ada bahan untuk dihitung.`,
`Gagal menyimpan stok opname.`, and possibly reused: `Catatan (opsional)`, `Bahan`, `Batal`,
`Simpan`, `Menyimpan…`. (`Stok opname` already exists from the adjust reason → already has `en`.)

- [ ] **Step 1: Extract**

Run: `pnpm lingui:extract`
Note the exact `.po` paths and which strings are newly added.

- [ ] **Step 2: Fill `en` for the new/empty entries**

Set the English `msgstr` for each NEW empty entry (leave already-filled ones, e.g.
`Stok opname` → "Stock take", `Bahan`, `Batal`, `Simpan`, untouched):

| msgid | en msgstr |
|---|---|
| `Sistem` | `System` |
| `Hitung fisik` | `Counted` |
| `Hitung fisik {name}` | `Counted {name}` |
| `{changedCount} bahan akan disesuaikan` | `{changedCount} items will be adjusted` |
| `Stok opname selesai · {adjusted} bahan disesuaikan.` | `Stock take done · {adjusted} items adjusted.` |
| `Belum ada bahan untuk dihitung.` | `No ingredients to count yet.` |
| `Gagal menyimpan stok opname.` | `Could not save the stock take.` |

(Use the actual placeholder syntax lingui emits — it may render as `{changedCount}` or
`{0}`; match whatever appears in the `.po`. Edit only empty `msgstr ""` entries.)

- [ ] **Step 3: Compile**

Run: `pnpm lingui:compile`
Expected: PASS, `en` 0 missing.

- [ ] **Step 4: Commit**

```bash
git add src/locales
git commit -m "i18n(inventory): stock take strings + en fill"
```

---

### Task 5: Final verification + clean tree

- [ ] **Step 1:** `pnpm typecheck` → PASS
- [ ] **Step 2:** `pnpm test` → PASS (all suites)
- [ ] **Step 3:** `pnpm lingui:compile` → PASS (`en` 0 missing)
- [ ] **Step 4:** `git status` → clean (commit any compile output if produced)
- [ ] **Step 5 (manual sanity, described):** On `/inventory`, "Stok opname" opens a dialog
  listing active ingredients with system qty + counted input; editing some counts updates
  the "{n} bahan akan disesuaikan" footer; submit writes only changed rows, toasts the
  adjusted count, closes, and the table + `StockSummary` reflect the new stock. Each change
  appears in `/inventory/adjustments` tagged "Stok opname".

---

## Self-Review

**Spec coverage:** batched mutation skipping unchanged rows + server-recompute diff (Task 1);
`Stok opname` reasonLabel + optional note (Task 1); dialog over active ingredients with live
diff count + empty state (Task 2); header button + active-set memo + reactive refresh (Task 3);
owner-scope + validation + atomicity tests (Task 1); i18n (Task 4). ✓

**Placeholder scan:** none — all code shown in full; the only runtime-resolved detail is the
lingui placeholder syntax, flagged explicitly in Task 4.

**Type consistency:** `performStockTake({ counts: {ingredientId, countedQty}[], note? }) →
{ adjusted }` defined in Task 1, consumed with that exact shape in Task 2. `StockTakeDialog`
props `{ open, ingredients: Ingredient[]|undefined, onOpenChange }` defined in Task 2 and
called with those in Task 3. `activeIngredients` (Task 3) is `Ingredient[] | undefined`,
matching the prop. `Ingredient = Doc<'ingredients'> & { currentStockQty: number }` consistent
across Task 2/3. ✓
