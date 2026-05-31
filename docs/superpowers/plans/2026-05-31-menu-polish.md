# Menu Polish (Sub-project 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the three Menu pages (Items, Kategori, Modifier groups) onto the Catalog UI kit, add a drag-reorder table for categories, and surface recipe/low-stock status on the Items list.

**Architecture:** Items and Modifiers use the existing kit `DataTable` (view-sort). Categories use a new focused `ReorderableTable` (dnd-kit) with drag-only ordering persisted via a new `categories.setOrder` mutation. The Items list is enriched server-side (`hasRecipe` + low-stock) by extracting `listForSale`'s low-stock block into a shared `itemRecipeStatus` helper. Name-as-link + `⋯` RowActions + ConfirmDialog + toasts throughout, matching the Stock reference page.

**Tech Stack:** React 19, TanStack Router, Convex, Tailwind v4, Lingui (id source / en target), shadcn/ui, `@tanstack/react-table`, `@dnd-kit/*`, `sonner`, Vitest (edge-runtime) + convex-test, Playwright. Package manager: **pnpm**.

---

## Conventions for the implementing engineer (read once)

- **pnpm** for all commands. `~` = `src/` alias; `convex/...` for backend/generated.
- **Branch:** work continues on `feat/catalog-ui-kit` (the kit foundation is already committed there). Do not branch off main.
- **i18n:** author strings in **Indonesian** (source locale). `<Trans>…</Trans>` in JSX, `` t`…` `` (from `useLingui()`) for attributes/strings. Don't hand-edit `.po` files; Task 11 runs extract/compile.
- **Convex loading contract:** `useQuery(...)` returns `undefined` while loading → pass straight into `DataTable`/`ReorderableTable`.
- **The Menu layout (`src/routes/_pos/menu/route.tsx`) already wraps content in `p-6` and renders the Items/Kategori/Grup Modifier tab nav.** Page components must NOT add their own `p-6` wrapper or a duplicate tab nav — render `PageHeader` + toolbar + table directly.
- **Kit components** (already built): `~/components/ui/{page-header,toolbar,data-table,status-badge,row-actions,confirm-dialog}`, `~/lib/toast`. `RowActions` items: `{label, onSelect, icon?, destructive?, separatorBefore?}` + a `label` (aria) prop. `ConfirmDialog`: `{open,onOpenChange,title,description?,confirmLabel,destructive?,onConfirm:()=>Promise<void>}` — it catches errors (caller surfaces its own toast and should re-throw to keep the dialog open).
- **Convex handlers may use `Date.now()`** (existing code does); that restriction is only for workflow scripts, not server code.
- **Run before any push:** `pnpm lingui:extract` → fill `en` → `pnpm typecheck && pnpm test && pnpm lingui:compile`.
- **Commit style:** small Conventional Commits, each ending with a blank line then:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File structure

**New**
- `convex/menu/itemStock.ts` — shared `itemRecipeStatus(ctx, cafeId, menuItemId)` helper.
- `src/components/ui/reorder.ts` — pure `moveId` array-move helper.
- `src/components/ui/reorder.test.ts` — unit test for `moveId`.
- `src/components/ui/reorderable-table.tsx` — dnd-kit drag-reorder table.
- `src/components/menu/category-form-dialog.tsx` — create/rename category dialog.

**Modified**
- `convex/menu/items.ts` — extract low-stock block; enrich `list` with `hasRecipe`/`lowStockIngredientNames`.
- `convex/menu/categories.ts` — add `setOrder` mutation.
- `src/routes/_pos/menu/index.tsx` — Items page rewrite.
- `src/components/menu/category-table.tsx` — rewrite onto ReorderableTable (keep filename + `CategoryTable` export).
- `src/routes/_pos/menu/categories.tsx` — render `<CategoryTable />` (PageHeader moves into CategoryTable).
- `src/routes/_pos/menu/modifiers.tsx` — Modifiers page rewrite.
- `tests/convex/menu/items.test.ts`, `tests/convex/menu/categories.test.ts` — new backend tests.
- `tests/e2e/menu.spec.ts` — selector updates for the new UI.
- `package.json` / `pnpm-lock.yaml` — dnd-kit deps.
- Lingui catalogs.

---

## Task 1: Install dnd-kit

**Files:** `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1: Install**

Run:
```bash
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/modifiers @dnd-kit/utilities
```
(`@dnd-kit/utilities` is imported directly for `CSS.Transform`, so it must be a direct dependency, not just transitive.)

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build(menu): add @dnd-kit for category drag-reorder"
```

---

## Task 2: Shared `itemRecipeStatus` helper + refactor `listForSale`

**Files:**
- Create: `convex/menu/itemStock.ts`
- Modify: `convex/menu/items.ts` (`listForSale` uses the helper)

- [ ] **Step 1: Create the helper**

Create `convex/menu/itemStock.ts`:
```ts
import type { Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';

/**
 * Recipe + low-stock status for one menu item. Shared by items.list (catalog)
 * and items.listForSale (cashier). hasRecipe is true when a recipe row exists
 * (even if it has no lines). lowStockIngredientNames lists active recipe
 * ingredients whose summed inventory movements are below their reorder
 * threshold. Cafe-scale data is dozens of items; the per-item reads are fine.
 */
export async function itemRecipeStatus(
  ctx: QueryCtx,
  cafeId: Id<'cafes'>,
  menuItemId: Id<'menuItems'>
): Promise<{ hasRecipe: boolean; lowStockIngredientNames: string[] }> {
  const recipe = await ctx.db
    .query('recipes')
    .withIndex('by_cafe_item', (q) => q.eq('cafeId', cafeId).eq('menuItemId', menuItemId))
    .unique();
  if (!recipe) return { hasRecipe: false, lowStockIngredientNames: [] };

  const lowStockIngredientNames: string[] = [];
  for (const recipeLine of recipe.lines) {
    const ing = await ctx.db.get(recipeLine.ingredientId);
    if (!ing || ing.cafeId !== cafeId || ing.archived) continue;
    const movements = await ctx.db
      .query('inventoryMovements')
      .withIndex('by_cafe_ingredient', (q) =>
        q.eq('cafeId', cafeId).eq('ingredientId', ing._id)
      )
      .collect();
    const stock = movements.reduce((sum, m) => sum + m.delta, 0);
    if (stock < ing.reorderThreshold) lowStockIngredientNames.push(ing.name);
  }
  return { hasRecipe: true, lowStockIngredientNames };
}
```

- [ ] **Step 2: Refactor `listForSale` to use it**

In `convex/menu/items.ts`, add the import near the top (after the existing `requireOwned, requireOwnerCafe` import):
```ts
import { itemRecipeStatus } from './itemStock';
```
In the `listForSale` handler, replace the inline recipe/low-stock block (the `const recipe = await ctx.db.query('recipes')...` through the `result.push(...)` line) with:
```ts
      const attachedGroups = await resolveAttachedGroups(ctx, item._id);
      const { lowStockIngredientNames } = await itemRecipeStatus(ctx, cafeId, item._id);
      result.push({ item, attachedGroups, lowStockIngredientNames });
```
(Delete the now-unused inline recipe loading + movements loop in `listForSale`.)

- [ ] **Step 3: Run the existing listForSale tests (regression)**

Run: `pnpm test tests/convex/menu/items.test.ts`
Expected: PASS — including the `listForSale — low-stock ingredients` describe block (proves the refactor preserved behavior).

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm typecheck
git add convex/menu/itemStock.ts convex/menu/items.ts
git commit -m "refactor(menu): extract itemRecipeStatus shared by listForSale"
```

---

## Task 3: Enrich `menu.items.list` with `hasRecipe` + low-stock

**Files:**
- Modify: `convex/menu/items.ts` (`list` query + new validator)
- Test: `tests/convex/menu/items.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/convex/menu/items.test.ts` (the `setupOwnerAndCategory` helper already exists at the top of the file; reuse it):
```ts
describe('menu.items.list — recipe/stock enrichment', () => {
  it('reports hasRecipe=false and empty low-stock for an item with no recipe', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, categoryId } = await setupOwnerAndCategory(t);
    await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Plain',
      priceIDR: 10000,
    });
    const rows = await asOwner.query(api.menu.items.list, {});
    expect(rows[0]?.hasRecipe).toBe(false);
    expect(rows[0]?.lowStockIngredientNames).toEqual([]);
  });

  it('reports hasRecipe=true and flags a low-stock ingredient', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, categoryId } = await setupOwnerAndCategory(t);
    const itemId = await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Espresso',
      priceIDR: 18000,
    });
    const susuId = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 25,
    });
    await asOwner.mutation(api.recipes.upsert, {
      menuItemId: itemId,
      lines: [{ ingredientId: susuId, qty: 200, wastageFactor: 1.0 }],
    });
    // Stock 100 < threshold 500.
    await asOwner.mutation(api.ingredients.adjustStock, {
      ingredientId: susuId,
      newQty: 100,
      reasonLabel: 'Stok opname',
    });
    const rows = await asOwner.query(api.menu.items.list, {});
    expect(rows[0]?.hasRecipe).toBe(true);
    expect(rows[0]?.lowStockIngredientNames).toEqual(['Susu']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/convex/menu/items.test.ts -t "recipe/stock enrichment"`
Expected: FAIL — `hasRecipe` is `undefined` (not yet returned).

- [ ] **Step 3: Add the enriched validator + enrich the `list` handler**

In `convex/menu/items.ts`, add this validator right after the existing `menuItemDoc` definition:
```ts
const menuItemWithStatus = v.object({
  _id: v.id('menuItems'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  categoryId: v.id('categories'),
  name: v.string(),
  priceIDR: v.number(),
  isActive: v.boolean(),
  archived: v.boolean(),
  position: v.number(),
  createdAt: v.number(),
  hasRecipe: v.boolean(),
  lowStockIngredientNames: v.array(v.string()),
});
```
Then change the `list` query's `returns` and `handler` return. Replace `returns: v.array(menuItemDoc),` with `returns: v.array(menuItemWithStatus),` and replace the handler's final `return rows.filter(...).filter(...).sort(...);` with:
```ts
    const visible = rows
      .filter((r) => (args.includeArchived ? true : !r.archived))
      .filter((r) => (args.includeInactive ? true : r.isActive))
      .sort((a, b) => a.position - b.position);
    return await Promise.all(
      visible.map(async (r) => ({
        ...r,
        ...(await itemRecipeStatus(ctx, cafeId, r._id)),
      }))
    );
```
(The `itemRecipeStatus` import was added in Task 2.)

- [ ] **Step 4: Run to verify pass + full menu items suite**

Run: `pnpm test tests/convex/menu/items.test.ts`
Expected: PASS (all, including the new enrichment block and the unchanged create/list/reorder/etc. tests — those read `.name`/`.priceIDR` which still exist).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck
git add convex/menu/items.ts tests/convex/menu/items.test.ts
git commit -m "feat(menu): enrich items.list with hasRecipe + low-stock"
```

---

## Task 4: `menu.categories.setOrder` mutation

**Files:**
- Modify: `convex/menu/categories.ts`
- Test: `tests/convex/menu/categories.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/convex/menu/categories.test.ts` (its `setupOwner` helper returns an `asOwner` test client):
```ts
describe('menu.categories.setOrder', () => {
  it('reassigns positions to match the given order', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const a = await asOwner.mutation(api.menu.categories.create, { name: 'A' });
    const b = await asOwner.mutation(api.menu.categories.create, { name: 'B' });
    const c = await asOwner.mutation(api.menu.categories.create, { name: 'C' });
    // Initial order is A, B, C. Reorder to C, A, B.
    await asOwner.mutation(api.menu.categories.setOrder, { orderedIds: [c, a, b] });
    const list = await asOwner.query(api.menu.categories.list, {});
    expect(list.map((cat) => cat._id)).toEqual([c, a, b]);
  });

  it('rejects an order that does not match the cafe category set', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const a = await asOwner.mutation(api.menu.categories.create, { name: 'A' });
    await asOwner.mutation(api.menu.categories.create, { name: 'B' });
    // Missing one id → reject.
    await expect(
      asOwner.mutation(api.menu.categories.setOrder, { orderedIds: [a] })
    ).rejects.toThrow(/urutan/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/convex/menu/categories.test.ts -t setOrder`
Expected: FAIL — `api.menu.categories.setOrder` does not exist.

- [ ] **Step 3: Implement `setOrder`**

In `convex/menu/categories.ts`, add after the existing `reorder` mutation:
```ts
export const setOrder = mutation({
  args: { orderedIds: v.array(v.id('categories')) },
  returns: v.null(),
  handler: async (ctx, { orderedIds }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const current = await ctx.db
      .query('categories')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId).eq('archived', false))
      .collect();
    const currentIds = new Set(current.map((c) => c._id));
    // The provided order must be a permutation of the cafe's active categories.
    const unique = new Set(orderedIds);
    if (unique.size !== orderedIds.length || orderedIds.length !== currentIds.size) {
      throw new Error('Urutan kategori tidak lengkap.');
    }
    for (const id of orderedIds) {
      if (!currentIds.has(id)) throw new Error('Urutan kategori tidak dikenal.');
    }
    for (let i = 0; i < orderedIds.length; i++) {
      await ctx.db.patch(orderedIds[i], { position: (i + 1) * 100 });
    }
    return null;
  },
});
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test tests/convex/menu/categories.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck
git add convex/menu/categories.ts tests/convex/menu/categories.test.ts
git commit -m "feat(menu): add categories.setOrder for drag reorder"
```

---

## Task 5: `moveId` pure helper + test

**Files:**
- Create: `src/components/ui/reorder.ts`
- Test: `src/components/ui/reorder.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/reorder.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { moveId } from './reorder';

describe('moveId', () => {
  it('moves an id to the position of another id', () => {
    expect(moveId(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
    expect(moveId(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a']);
  });

  it('returns the same array reference when active === over', () => {
    const ids = ['a', 'b', 'c'];
    expect(moveId(ids, 'b', 'b')).toBe(ids);
  });

  it('returns the same array reference when an id is missing', () => {
    const ids = ['a', 'b', 'c'];
    expect(moveId(ids, 'x', 'a')).toBe(ids);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/components/ui/reorder.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/components/ui/reorder.ts`:
```ts
// Pure array-move used by ReorderableTable's drag-end handler. Returns the
// SAME reference on a no-op so callers can skip a persist round-trip.
export function moveId<T>(ids: T[], activeId: T, overId: T): T[] {
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from === -1 || to === -1 || from === to) return ids;
  const next = ids.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/components/ui/reorder.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/reorder.ts src/components/ui/reorder.test.ts
git commit -m "feat(ui): add moveId reorder helper with tests"
```

---

## Task 6: `ReorderableTable` component

**Files:**
- Create: `src/components/ui/reorderable-table.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/ui/reorderable-table.tsx`:
```tsx
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { cn } from '~/lib/utils';
import { Skeleton } from '~/components/ui/skeleton';
import { tableViewState } from './data-table-state';
import { moveId } from './reorder';

export interface ReorderableColumn<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
}

export interface ReorderableTableProps<T> {
  columns: ReorderableColumn<T>[];
  /** undefined === loading (Convex useQuery contract). */
  data: T[] | undefined;
  getRowId: (row: T) => string;
  emptyState: ReactNode;
  onReorder: (orderedIds: string[]) => void | Promise<void>;
  /** Accessible label for the drag handle, e.g. t`Seret untuk menata ulang`. */
  reorderLabel: string;
  getRowClassName?: (row: T) => string;
  skeletonRows?: number;
}

export function ReorderableTable<T>({
  columns,
  data,
  getRowId,
  emptyState,
  onReorder,
  reorderLabel,
  getRowClassName,
  skeletonRows = 6,
}: ReorderableTableProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const view = tableViewState(data);
  const rows = data ?? [];
  const ids = rows.map(getRowId);
  const colCount = columns.length + 1; // + drag handle

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const next = moveId(ids, String(active.id), String(over.id));
    if (next !== ids) void onReorder(next);
  }

  return (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            {columns.map((c) => (
              <TableHead key={c.id}>{c.header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {view === 'loading' ? (
            Array.from({ length: skeletonRows }).map((_, r) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows are positional and never reorder
              <TableRow key={`skeleton-${r}`}>
                {Array.from({ length: colCount }).map((_c, c) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: skeleton cells are positional and never reorder
                  <TableCell key={`skeleton-${r}-${c}`}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : view === 'empty' ? (
            <TableRow>
              <TableCell colSpan={colCount} className="p-0">
                {emptyState}
              </TableCell>
            </TableRow>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                {rows.map((row) => (
                  <SortableRow
                    key={getRowId(row)}
                    id={getRowId(row)}
                    reorderLabel={reorderLabel}
                    className={cn(getRowClassName?.(row))}
                  >
                    {columns.map((c) => (
                      <TableCell key={c.id}>{c.cell(row)}</TableCell>
                    ))}
                  </SortableRow>
                ))}
              </SortableContext>
            </DndContext>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function SortableRow({
  id,
  reorderLabel,
  className,
  children,
}: {
  id: string;
  reorderLabel: string;
  className?: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  return (
    <TableRow
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && 'opacity-60', className)}
    >
      <TableCell className="w-8">
        <button
          type="button"
          className="cursor-grab text-muted-foreground hover:text-foreground"
          aria-label={reorderLabel}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      </TableCell>
      {children}
    </TableRow>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. (If `@dnd-kit/utilities` is unresolved, confirm Task 1 installed it as a direct dep.)

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/reorderable-table.tsx
git commit -m "feat(ui): add ReorderableTable (dnd-kit drag reorder)"
```

---

## Task 7: `CategoryFormDialog` component

**Files:**
- Create: `src/components/menu/category-form-dialog.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/menu/category-form-dialog.tsx`:
```tsx
import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation } from 'convex/react';
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
import { Spinner } from '~/components/ui/spinner';
import { toast } from '~/lib/toast';

export function CategoryFormDialog({
  open,
  category,
  onOpenChange,
}: {
  open: boolean;
  /** null = create mode; otherwise rename the given category. */
  category: { _id: Id<'categories'>; name: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const isEdit = category !== null;
  const create = useMutation(api.menu.categories.create);
  const update = useMutation(api.menu.categories.update);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(category?.name ?? '');
      setError(null);
    }
  }, [open, category]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (isEdit && category) {
        await update({ id: category._id, name });
        toast.success(t`Kategori diperbarui.`);
      } else {
        await create({ name });
        toast.success(t`Kategori ditambahkan.`);
      }
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t`Gagal menyimpan kategori.`;
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? <Trans>Ubah kategori</Trans> : <Trans>Tambah kategori</Trans>}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="cat-name"><Trans>Nama kategori</Trans></FieldLabel>
              <Input
                id="cat-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={60}
                autoFocus
              />
            </Field>
            {error && <FieldError>{error}</FieldError>}
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              <Trans>Batal</Trans>
            </Button>
            <Button type="submit" disabled={submitting}>
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

```bash
pnpm typecheck
git add src/components/menu/category-form-dialog.tsx
git commit -m "feat(menu): add CategoryFormDialog (create + rename)"
```

---

## Task 8: Categories page rewrite

**Files:**
- Modify (rewrite): `src/components/menu/category-table.tsx`
- Modify: `src/routes/_pos/menu/categories.tsx`

- [ ] **Step 1: Rewrite `category-table.tsx`**

Replace the entire contents of `src/components/menu/category-table.tsx` with:
```tsx
import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Doc, Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { Archive, Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CategoryFormDialog } from '~/components/menu/category-form-dialog';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { Empty, EmptyHeader, EmptyTitle } from '~/components/ui/empty';
import { PageHeader } from '~/components/ui/page-header';
import {
  ReorderableTable,
  type ReorderableColumn,
} from '~/components/ui/reorderable-table';
import { RowActions } from '~/components/ui/row-actions';
import { StatusBadge } from '~/components/ui/status-badge';
import { Toolbar } from '~/components/ui/toolbar';
import { toast } from '~/lib/toast';

type Category = Doc<'categories'>;
type Filter = 'active' | 'archived';

export function CategoryTable() {
  const { t } = useLingui();
  const [filter, setFilter] = useState<Filter>('active');
  const [formCategory, setFormCategory] = useState<Category | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Category | null>(null);

  const categories = useQuery(api.menu.categories.list, { includeArchived: true });
  const items = useQuery(api.menu.items.list, {});
  const archiveCategory = useMutation(api.menu.categories.archive);
  const setOrder = useMutation(api.menu.categories.setOrder);

  const itemCounts = useMemo(() => {
    const map = new Map<Id<'categories'>, number>();
    for (const it of items ?? []) {
      map.set(it.categoryId, (map.get(it.categoryId) ?? 0) + 1);
    }
    return map;
  }, [items]);

  const counts = useMemo(() => {
    if (!categories) return undefined;
    return {
      active: categories.filter((c) => !c.archived).length,
      archived: categories.filter((c) => c.archived).length,
    };
  }, [categories]);

  // Active view is drag-orderable; archived view is read-only.
  const activeRows = useMemo<Category[] | undefined>(
    () => (categories ? categories.filter((c) => !c.archived) : undefined),
    [categories]
  );
  const archivedRows = useMemo<Category[] | undefined>(
    () => (categories ? categories.filter((c) => c.archived) : undefined),
    [categories]
  );

  function openCreate() {
    setFormCategory(null);
    setFormOpen(true);
  }
  function openRename(c: Category) {
    setFormCategory(c);
    setFormOpen(true);
  }

  const columns: ReorderableColumn<Category>[] = [
    {
      id: 'name',
      header: <Trans>Nama</Trans>,
      cell: (c) => <span className="font-medium">{c.name}</span>,
    },
    {
      id: 'items',
      header: <Trans>Item</Trans>,
      cell: (c) => <span className="tabular-nums">{itemCounts.get(c._id) ?? 0}</span>,
    },
    {
      id: 'status',
      header: <Trans>Status</Trans>,
      cell: () => (
        <StatusBadge variant="success">
          <Trans>Aktif</Trans>
        </StatusBadge>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: (c) => (
        <div className="text-right">
          <RowActions
            label={t`Aksi baris`}
            items={[
              {
                label: <Trans>Ubah nama</Trans>,
                icon: <Pencil />,
                onSelect: () => openRename(c),
              },
              {
                label: <Trans>Arsipkan</Trans>,
                icon: <Archive />,
                destructive: true,
                separatorBefore: true,
                onSelect: () => setArchiveTarget(c),
              },
            ]}
          />
        </div>
      ),
    },
  ];

  const emptyState = (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>
          {filter === 'archived' ? (
            <Trans>Tidak ada kategori diarsipkan.</Trans>
          ) : (
            <Trans>Belum ada kategori.</Trans>
          )}
        </EmptyTitle>
      </EmptyHeader>
    </Empty>
  );

  return (
    <div>
      <PageHeader
        title={<Trans>Kategori</Trans>}
        description={
          <Trans>Kategori muncul sebagai filter di daftar Items dan di layar kasir.</Trans>
        }
        actions={
          <Button type="button" onClick={openCreate}>
            <Plus />
            <Trans>Tambah Kategori</Trans>
          </Button>
        }
      />

      <Toolbar
        search=""
        onSearch={() => {}}
        active={filter}
        onFilter={(v) => setFilter(v as Filter)}
        filters={[
          { label: <Trans>Aktif</Trans>, value: 'active', count: counts?.active },
          { label: <Trans>Arsip</Trans>, value: 'archived', count: counts?.archived },
        ]}
      />

      {filter === 'active' ? (
        <ReorderableTable
          columns={columns}
          data={activeRows}
          getRowId={(c) => c._id}
          reorderLabel={t`Seret untuk menata ulang`}
          emptyState={emptyState}
          onReorder={async (orderedIds) => {
            try {
              await setOrder({ orderedIds: orderedIds as Id<'categories'>[] });
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : t`Gagal menyimpan urutan.`
              );
            }
          }}
        />
      ) : (
        <ArchivedCategoryList rows={archivedRows} itemCounts={itemCounts} empty={emptyState} />
      )}

      <CategoryFormDialog
        open={formOpen}
        category={formCategory}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setFormCategory(null);
        }}
      />
      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
        title={<Trans>Arsipkan kategori?</Trans>}
        description={
          archiveTarget ? (
            <Trans>
              "{archiveTarget.name}" akan disembunyikan dari daftar aktif dan layar kasir.
            </Trans>
          ) : undefined
        }
        confirmLabel={<Trans>Arsipkan</Trans>}
        destructive
        onConfirm={async () => {
          if (!archiveTarget) return;
          try {
            await archiveCategory({ id: archiveTarget._id });
            toast.success(t`Kategori diarsipkan.`);
          } catch (err) {
            const message =
              err instanceof Error ? err.message : t`Gagal mengarsipkan kategori.`;
            toast.error(message);
            throw err;
          }
        }}
      />
    </div>
  );
}

// Read-only list for archived categories (no reorder, no actions — there is
// no unarchive flow, consistent with the Stock page's archived view).
function ArchivedCategoryList({
  rows,
  itemCounts,
  empty,
}: {
  rows: Category[] | undefined;
  itemCounts: Map<Id<'categories'>, number>;
  empty: React.ReactNode;
}) {
  if (rows === undefined) return null;
  if (rows.length === 0) return <div className="rounded-md border bg-card">{empty}</div>;
  return (
    <div className="rounded-md border bg-card divide-y divide-border">
      {rows.map((c) => (
        <div key={c._id} className="flex items-center justify-between px-4 py-2 text-sm">
          <span className="font-medium">{c.name}</span>
          <span className="flex items-center gap-4">
            <span className="tabular-nums text-muted-foreground">
              {itemCounts.get(c._id) ?? 0}
            </span>
            <StatusBadge variant="muted">
              <Trans>Arsip</Trans>
            </StatusBadge>
          </span>
        </div>
      ))}
    </div>
  );
}
```

> Note: `Toolbar` requires `search`/`onSearch`; categories have no search, so pass `""` and a no-op. (Categories are few; search adds no value here.)

- [ ] **Step 2: Simplify `categories.tsx` to render the table**

Replace the entire contents of `src/routes/_pos/menu/categories.tsx` with:
```tsx
import { createFileRoute } from '@tanstack/react-router';
import { CategoryTable } from '~/components/menu/category-table';

export const Route = createFileRoute('/_pos/menu/categories')({
  component: CategoriesPage,
});

function CategoriesPage() {
  return <CategoryTable />;
}
```

- [ ] **Step 3: Typecheck + full unit suite**

Run: `pnpm typecheck && pnpm test`
Expected: PASS (all tests; no page tests run, but typecheck validates the rewrite).

- [ ] **Step 4: Commit**

```bash
git add src/components/menu/category-table.tsx src/routes/_pos/menu/categories.tsx
git commit -m "feat(menu): migrate Categories onto kit + drag reorder"
```

---

## Task 9: Items page rewrite

**Files:**
- Modify (rewrite): `src/routes/_pos/menu/index.tsx`

- [ ] **Step 1: Rewrite the file**

Replace the entire contents of `src/routes/_pos/menu/index.tsx` with:
```tsx
import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from 'convex/_generated/api';
import type { Doc, Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { Archive, Plus, Power } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { DataTable } from '~/components/ui/data-table';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '~/components/ui/empty';
import { PageHeader } from '~/components/ui/page-header';
import { RowActions } from '~/components/ui/row-actions';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { StatusBadge } from '~/components/ui/status-badge';
import { Toolbar } from '~/components/ui/toolbar';
import { formatIDR } from '~/lib/money';
import { toast } from '~/lib/toast';

export const Route = createFileRoute('/_pos/menu/')({
  component: ItemsListPage,
});

type ItemRow = Doc<'menuItems'> & {
  hasRecipe: boolean;
  lowStockIngredientNames: string[];
};
type Filter = 'active' | 'archived';

function isLow(row: ItemRow): boolean {
  return !row.archived && row.lowStockIngredientNames.length > 0;
}

function ItemsListPage() {
  const { t } = useLingui();
  const [filter, setFilter] = useState<Filter>('active');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string>('all');
  const [archiveTarget, setArchiveTarget] = useState<ItemRow | null>(null);

  const categories = useQuery(api.menu.categories.list, {});
  const allItems = useQuery(api.menu.items.list, {
    includeArchived: true,
    includeInactive: true,
  }) as ItemRow[] | undefined;
  const setActive = useMutation(api.menu.items.setActive);
  const archive = useMutation(api.menu.items.archive);

  const categoryName = useMemo(() => {
    const map = new Map<Id<'categories'>, string>();
    for (const c of categories ?? []) map.set(c._id, c.name);
    return map;
  }, [categories]);

  const categoryCounts = useMemo(() => {
    const map = new Map<Id<'categories'>, number>();
    for (const it of allItems ?? []) {
      if (it.archived) continue;
      map.set(it.categoryId, (map.get(it.categoryId) ?? 0) + 1);
    }
    return map;
  }, [allItems]);

  const counts = useMemo(() => {
    if (!allItems) return undefined;
    const active = allItems.filter((r) => !r.archived);
    return {
      active: active.length,
      archived: allItems.filter((r) => r.archived).length,
      low: active.filter(isLow).length,
    };
  }, [allItems]);

  const visible = useMemo<ItemRow[] | undefined>(() => {
    if (!allItems) return undefined;
    let rows = allItems.filter((r) => (filter === 'archived' ? r.archived : !r.archived));
    if (categoryId !== 'all') {
      rows = rows.filter((r) => r.categoryId === (categoryId as Id<'categories'>));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => r.name.toLowerCase().includes(q));
    }
    return rows;
  }, [allItems, filter, categoryId, search]);

  const columns = useMemo<ColumnDef<ItemRow, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: () => <Trans>Nama</Trans>,
        cell: ({ row }) => (
          <Link
            to="/menu/items/$itemId"
            params={{ itemId: row.original._id }}
            className="font-medium hover:underline"
          >
            {isLow(row.original) ? <span aria-hidden="true" className="mr-1">⚠</span> : null}
            {row.original.name}
          </Link>
        ),
      },
      {
        id: 'category',
        enableSorting: false,
        header: () => <Trans>Kategori</Trans>,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {categoryName.get(row.original.categoryId) ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'priceIDR',
        header: () => <Trans>Harga</Trans>,
        cell: ({ row }) => (
          <span className="tabular-nums">{formatIDR(row.original.priceIDR)}</span>
        ),
      },
      {
        id: 'recipe',
        enableSorting: false,
        header: () => <Trans>Resep</Trans>,
        cell: ({ row }) =>
          row.original.hasRecipe ? (
            <StatusBadge variant="success">
              <Trans>Ada</Trans>
            </StatusBadge>
          ) : (
            <StatusBadge variant="muted">
              <Trans>Belum</Trans>
            </StatusBadge>
          ),
      },
      {
        id: 'status',
        enableSorting: false,
        header: () => <Trans>Status</Trans>,
        cell: ({ row }) => {
          const r = row.original;
          if (r.archived)
            return (
              <StatusBadge variant="muted">
                <Trans>Arsip</Trans>
              </StatusBadge>
            );
          if (r.isActive)
            return (
              <StatusBadge variant="success">
                <Trans>Aktif</Trans>
              </StatusBadge>
            );
          return (
            <StatusBadge variant="muted">
              <Trans>Nonaktif</Trans>
            </StatusBadge>
          );
        },
      },
      {
        id: 'actions',
        enableSorting: false,
        header: () => null,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="text-right">
              <RowActions
                label={t`Aksi baris`}
                items={[
                  {
                    label: r.isActive ? <Trans>Nonaktifkan</Trans> : <Trans>Aktifkan</Trans>,
                    icon: <Power />,
                    onSelect: async () => {
                      try {
                        await setActive({ id: r._id, isActive: !r.isActive });
                        toast.success(
                          r.isActive ? t`Item dinonaktifkan.` : t`Item diaktifkan.`
                        );
                      } catch (err) {
                        toast.error(
                          err instanceof Error ? err.message : t`Gagal memperbarui item.`
                        );
                      }
                    },
                  },
                  {
                    label: <Trans>Arsipkan</Trans>,
                    icon: <Archive />,
                    destructive: true,
                    separatorBefore: true,
                    onSelect: () => setArchiveTarget(r),
                  },
                ]}
              />
            </div>
          );
        },
      },
    ],
    [t, categoryName, setActive]
  );

  const emptyState = (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>
          {filter === 'archived' ? (
            <Trans>Tidak ada item diarsipkan.</Trans>
          ) : (
            <Trans>Belum ada item.</Trans>
          )}
        </EmptyTitle>
        {filter === 'active' ? (
          <EmptyDescription>
            <Trans>Tambah item pertama untuk mulai berjualan.</Trans>
          </EmptyDescription>
        ) : null}
      </EmptyHeader>
    </Empty>
  );

  return (
    <div>
      <PageHeader
        title={<Trans>Item Menu</Trans>}
        meta={
          counts ? (
            <Trans>
              {counts.active} item · {counts.low} stok rendah
            </Trans>
          ) : null
        }
        actions={
          <Button asChild>
            <Link to="/menu/items/$itemId" params={{ itemId: 'new' }}>
              <Plus />
              <Trans>Tambah Item</Trans>
            </Link>
          </Button>
        }
      />

      <Toolbar
        search={search}
        onSearch={setSearch}
        searchPlaceholder={t`Cari item…`}
        active={filter}
        onFilter={(v) => setFilter(v as Filter)}
        filters={[
          { label: <Trans>Aktif</Trans>, value: 'active', count: counts?.active },
          { label: <Trans>Arsip</Trans>, value: 'archived', count: counts?.archived },
        ]}
      >
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t`Semua kategori`}</SelectItem>
            {(categories ?? []).map((c) => (
              <SelectItem key={c._id} value={c._id}>
                {c.name} ({categoryCounts.get(c._id) ?? 0})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Toolbar>

      <DataTable
        columns={columns}
        data={visible}
        emptyState={emptyState}
        getRowClassName={(row) => (isLow(row) ? 'bg-destructive/10' : '')}
        initialSort={[{ id: 'name', desc: false }]}
      />

      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
        title={<Trans>Arsipkan item?</Trans>}
        description={
          archiveTarget ? (
            <Trans>"{archiveTarget.name}" akan disembunyikan dari menu dan layar kasir.</Trans>
          ) : undefined
        }
        confirmLabel={<Trans>Arsipkan</Trans>}
        destructive
        onConfirm={async () => {
          if (!archiveTarget) return;
          try {
            await archive({ id: archiveTarget._id });
            toast.success(t`Item diarsipkan.`);
          } catch (err) {
            const message = err instanceof Error ? err.message : t`Gagal mengarsipkan item.`;
            toast.error(message);
            throw err;
          }
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. (The `as ItemRow[] | undefined` cast bridges the generated query type to the enriched row type; the backend returns exactly these fields per Task 3.)

- [ ] **Step 3: Commit**

```bash
git add src/routes/_pos/menu/index.tsx
git commit -m "feat(menu): migrate Items list onto kit + recipe/stock column"
```

---

## Task 10: Modifier groups page rewrite

**Files:**
- Modify (rewrite): `src/routes/_pos/menu/modifiers.tsx`

- [ ] **Step 1: Rewrite the file**

Replace the entire contents of `src/routes/_pos/menu/modifiers.tsx` with:
```tsx
import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from 'convex/_generated/api';
import type { Doc, Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { Archive, Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { DataTable } from '~/components/ui/data-table';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '~/components/ui/empty';
import { PageHeader } from '~/components/ui/page-header';
import { RowActions } from '~/components/ui/row-actions';
import { StatusBadge } from '~/components/ui/status-badge';
import { Toolbar } from '~/components/ui/toolbar';
import { toast } from '~/lib/toast';

export const Route = createFileRoute('/_pos/menu/modifiers')({
  component: ModifierGroupsPage,
});

type Group = Doc<'modifierGroups'> & { options: Doc<'modifierOptions'>[] };
type Filter = 'active' | 'archived';

function ModifierGroupsPage() {
  const { t } = useLingui();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('active');
  const [search, setSearch] = useState('');
  const [archiveTarget, setArchiveTarget] = useState<Group | null>(null);

  const groups = useQuery(api.menu.modifierGroups.list, { includeArchived: true }) as
    | Group[]
    | undefined;
  const archive = useMutation(api.menu.modifierGroups.archive);

  const counts = useMemo(() => {
    if (!groups) return undefined;
    return {
      active: groups.filter((g) => !g.archived).length,
      archived: groups.filter((g) => g.archived).length,
    };
  }, [groups]);

  const visible = useMemo<Group[] | undefined>(() => {
    if (!groups) return undefined;
    let rows = groups.filter((g) => (filter === 'archived' ? g.archived : !g.archived));
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((g) => g.name.toLowerCase().includes(q));
    }
    return rows;
  }, [groups, filter, search]);

  const columns = useMemo<ColumnDef<Group, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: () => <Trans>Nama</Trans>,
        cell: ({ row }) => (
          <Link
            to="/menu/modifiers/$groupId"
            params={{ groupId: row.original._id }}
            className="font-medium hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        id: 'type',
        enableSorting: false,
        header: () => <Trans>Tipe</Trans>,
        cell: ({ row }) =>
          row.original.required ? (
            <StatusBadge variant="success">
              <Trans>Wajib</Trans>
            </StatusBadge>
          ) : (
            <StatusBadge variant="muted">
              <Trans>Opsional</Trans>
            </StatusBadge>
          ),
      },
      {
        id: 'rule',
        enableSorting: false,
        header: () => <Trans>Aturan</Trans>,
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {row.original.minSelect}–{row.original.maxSelect}
          </span>
        ),
      },
      {
        id: 'options',
        accessorFn: (g) => g.options.length,
        header: () => <Trans>Opsi</Trans>,
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.options.length}</span>
        ),
      },
      {
        id: 'status',
        enableSorting: false,
        header: () => <Trans>Status</Trans>,
        cell: ({ row }) =>
          row.original.archived ? (
            <StatusBadge variant="muted">
              <Trans>Arsip</Trans>
            </StatusBadge>
          ) : (
            <StatusBadge variant="success">
              <Trans>Aktif</Trans>
            </StatusBadge>
          ),
      },
      {
        id: 'actions',
        enableSorting: false,
        header: () => null,
        cell: ({ row }) => (
          <div className="text-right">
            <RowActions
              label={t`Aksi baris`}
              items={[
                {
                  label: <Trans>Ubah grup</Trans>,
                  icon: <Pencil />,
                  onSelect: () =>
                    navigate({
                      to: '/menu/modifiers/$groupId',
                      params: { groupId: row.original._id },
                    }),
                },
                {
                  label: <Trans>Arsipkan</Trans>,
                  icon: <Archive />,
                  destructive: true,
                  separatorBefore: true,
                  onSelect: () => setArchiveTarget(row.original),
                },
              ]}
            />
          </div>
        ),
      },
    ],
    [t, navigate]
  );

  const emptyState = (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>
          {filter === 'archived' ? (
            <Trans>Tidak ada grup diarsipkan.</Trans>
          ) : (
            <Trans>Belum ada grup modifier.</Trans>
          )}
        </EmptyTitle>
        {filter === 'active' ? (
          <EmptyDescription>
            <Trans>Buat satu grup untuk dipakai ulang di banyak item.</Trans>
          </EmptyDescription>
        ) : null}
      </EmptyHeader>
    </Empty>
  );

  return (
    <div>
      <PageHeader
        title={<Trans>Grup Modifier</Trans>}
        description={<Trans>Dipakai ulang di banyak item, ubah di satu tempat.</Trans>}
        actions={
          <Button asChild>
            <Link to="/menu/modifiers/$groupId" params={{ groupId: 'new' }}>
              <Plus />
              <Trans>Grup baru</Trans>
            </Link>
          </Button>
        }
      />

      <Toolbar
        search={search}
        onSearch={setSearch}
        searchPlaceholder={t`Cari grup…`}
        active={filter}
        onFilter={(v) => setFilter(v as Filter)}
        filters={[
          { label: <Trans>Aktif</Trans>, value: 'active', count: counts?.active },
          { label: <Trans>Arsip</Trans>, value: 'archived', count: counts?.archived },
        ]}
      />

      <DataTable
        columns={columns}
        data={visible}
        emptyState={emptyState}
        initialSort={[{ id: 'name', desc: false }]}
      />

      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
        title={<Trans>Arsipkan grup?</Trans>}
        description={
          archiveTarget ? (
            <Trans>"{archiveTarget.name}" akan dilepas dari item dan disembunyikan.</Trans>
          ) : undefined
        }
        confirmLabel={<Trans>Arsipkan</Trans>}
        destructive
        onConfirm={async () => {
          if (!archiveTarget) return;
          try {
            await archive({ id: archiveTarget._id });
            toast.success(t`Grup diarsipkan.`);
          } catch (err) {
            const message = err instanceof Error ? err.message : t`Gagal mengarsipkan grup.`;
            toast.error(message);
            throw err;
          }
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + full unit suite**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_pos/menu/modifiers.tsx
git commit -m "feat(menu): migrate Modifier groups onto kit DataTable"
```

---

## Task 11: Update Playwright menu spec for the new UI

**Files:**
- Modify: `tests/e2e/menu.spec.ts`

The rewrites change selectors the existing spec relies on: the Categories inline create (`Nama kategori baru` + `+ Tambah`) is now a `+ Tambah Kategori` button → `CategoryFormDialog`, and the Items action label is now `Tambah Item` (was `+ Item`). Update both existing tests and add a smoke for the new behaviors.

- [ ] **Step 1: Update the category-create steps in both existing tests**

In `tests/e2e/menu.spec.ts`, both tests create a category via:
```ts
    await page.getByLabel('Nama kategori baru').fill('Kopi');
    await page.getByRole('button', { name: /\+ Tambah/ }).click();
```
Replace **both occurrences** with (opens the dialog, fills it, saves):
```ts
    await page.getByRole('button', { name: /Tambah Kategori/ }).click();
    await page.getByLabel('Nama kategori').fill('Kopi');
    await page.getByRole('button', { name: /^Simpan$/ }).click();
    await expect(page.getByText(/Kategori ditambahkan/)).toBeVisible();
```

- [ ] **Step 2: Update the Items "+ Item" action label in both tests**

Both tests click the create-item action via `getByRole('link', { name: /\+ Item/ })`. Replace **both occurrences** with:
```ts
    await page.getByRole('link', { name: /Tambah Item/ }).click();
```
(The Items sub-nav tab link is still named `Items` and is unchanged — only the create action label changed.)

- [ ] **Step 3: Add a Menu-kit smoke test**

Add this test inside the `test.describe('menu (auth-gated)', ...)` block, after the existing tests. It builds on the first test's pattern (signup → category → item) and then exercises the kit:
```ts
  test('kit: items recipe column, ⋯ toggle active, modifiers Arsip filter', async ({ page }) => {
    const email = `e2e+${Date.now()}@kodapos.test`;
    const password = 'Sa{ngat-Aman-123';
    await gotoHydrated(page, '/signup');
    await page.getByLabel('Nama Anda').fill('E2E Owner');
    await page.getByLabel('Nama kafe').fill('Kopi E2E Kit');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /Daftar/ }).click();
    await waitForUrlHydrated(page, /\/onboarding\/profile$/, { timeout: 15_000 });
    await page.getByRole('button', { name: /Lanjut/ }).click();
    await waitForUrlHydrated(page, /\/onboarding\/menu$/);
    await page.getByRole('button', { name: /Mulai dengan kategori/ }).click();
    await waitForUrlHydrated(page, /\/menu\/categories$/);
    await page.getByRole('button', { name: /Tambah Kategori/ }).click();
    await page.getByLabel('Nama kategori').fill('Kopi');
    await page.getByRole('button', { name: /^Simpan$/ }).click();
    await expect(page.getByText(/Kategori ditambahkan/)).toBeVisible();

    // Create an item.
    await page.getByRole('link', { name: 'Items' }).click();
    await waitForUrlHydrated(page, /\/menu$/);
    await page.getByRole('link', { name: /Tambah Item/ }).click();
    await waitForUrlHydrated(page, /\/menu\/items\/new$/);
    await page.getByLabel('Nama').fill('Espresso');
    await page.getByLabel('Kategori').selectOption({ label: 'Kopi' });
    await page.getByLabel('Harga (Rp)').fill('18000');
    await page.getByRole('button', { name: /Simpan/ }).click();
    await waitForUrlHydrated(page, /\/menu$/);

    // Items list shows the Resep column header and a Belum badge (no recipe yet).
    await expect(page.getByRole('columnheader', { name: /Resep/ })).toBeVisible();
    await expect(page.getByText(/Belum/).first()).toBeVisible();

    // Toggle active via the ⋯ menu → toast.
    await page.getByRole('button', { name: /Aksi baris/ }).first().click();
    await page.getByRole('menuitem', { name: /Nonaktifkan/ }).click();
    await expect(page.getByText(/Item dinonaktifkan/)).toBeVisible();

    // Modifiers page: Arsip filter chip exists and the list renders.
    await page.getByRole('link', { name: /Grup Modifier/ }).click();
    await waitForUrlHydrated(page, /\/menu\/modifiers$/);
    await expect(page.getByRole('button', { name: /Arsip/ })).toBeVisible();
  });
```

- [ ] **Step 2.5: Typecheck the spec**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Attempt to run the menu e2e (auth-gated)**

Run:
```bash
RUN_AUTH_E2E=1 pnpm test:e2e tests/e2e/menu.spec.ts
```
Expected: all tests pass. If the dev server / Convex backend is unavailable in this environment, do NOT fake a pass — report "could not run: no backend" and that the spec at least typechecks and skips cleanly without the env var (`pnpm test:e2e tests/e2e/menu.spec.ts` → skipped). If a selector fails on a real run, fix it to match the rendered UI (prefer role-scoped locators) and note the fix.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/menu.spec.ts
git commit -m "test(e2e): update menu spec for kit migration + kit smoke"
```

---

## Task 12: i18n — extract, fill English, compile

**Files:** `src/locales/id/messages.po`, `src/locales/en/messages.po`

- [ ] **Step 1: Extract**

Run: `pnpm lingui:extract`
Expected: new ids appear in both catalogs.

- [ ] **Step 2: Fill English**

Edit `src/locales/en/messages.po` and provide `msgstr` for each new empty entry. Fill these (match the actual extracted msgid, preserving any `{0}`/`{1}` placeholders exactly):
- `Item Menu` → `Menu Items`
- `Tambah Item` → `Add Item`
- `Cari item…` → `Search items…`
- `Semua kategori` → `All categories`
- `{0} item · {1} stok rendah` → `{0} items · {1} low stock`
- `Resep` → `Resep` is NEW → `Recipe`
- `Ada` → `Set`
- `Belum` → `Not set`
- `Nonaktif` → `Inactive`
- `Aktifkan` → `Activate`
- `Nonaktifkan` → `Deactivate`
- `Item diaktifkan.` → `Item activated.`
- `Item dinonaktifkan.` → `Item deactivated.`
- `Gagal memperbarui item.` → `Failed to update item.`
- `Arsipkan item?` → `Archive item?`
- `"{0}" akan disembunyikan dari menu dan layar kasir.` → `"{0}" will be hidden from the menu and cashier screen.`
- `Item diarsipkan.` → `Item archived.`
- `Gagal mengarsipkan item.` → `Failed to archive item.`
- `Belum ada item.` → `No items yet.`
- `Tambah item pertama untuk mulai berjualan.` → `Add your first item to start selling.`
- `Tidak ada item diarsipkan.` → `No archived items.`
- `Tambah Kategori` → `Add Category`
- `Nama kategori` → `Category name`
- `Ubah kategori` → `Edit category`
- `Tambah kategori` → `Add category`
- `Kategori ditambahkan.` → `Category added.`
- `Kategori diperbarui.` → `Category updated.`
- `Gagal menyimpan kategori.` → `Failed to save category.`
- `Ubah nama` → `Rename`
- `Seret untuk menata ulang` → `Drag to reorder`
- `Gagal menyimpan urutan.` → `Failed to save order.`
- `Arsipkan kategori?` → `Archive category?`
- `"{0}" akan disembunyikan dari daftar aktif dan layar kasir.` → `"{0}" will be hidden from the active list and cashier screen.`
- `Kategori diarsipkan.` → `Category archived.`
- `Gagal mengarsipkan kategori.` → `Failed to archive category.`
- `Belum ada kategori.` → `No categories yet.`
- `Tidak ada kategori diarsipkan.` → `No archived categories.`
- `Item` → `Items` (the category table column header; if `Item` already exists translated, leave it)
- `Grup baru` → `New group`
- `Cari grup…` → `Search groups…`
- `Tipe` → `Type`
- `Wajib` → `Required`
- `Opsional` → `Optional`
- `Aturan` → `Rule`
- `Opsi` → `Options` (if `Opsi` already exists translated, leave it)
- `Ubah grup` → `Edit group`
- `Arsipkan grup?` → `Archive group?`
- `"{0}" akan dilepas dari item dan disembunyikan.` → `"{0}" will be detached from items and hidden.`
- `Grup diarsipkan.` → `Group archived.`
- `Gagal mengarsipkan grup.` → `Failed to archive group.`
- `Belum ada grup modifier.` → `No modifier groups yet.`
- `Tidak ada grup diarsipkan.` → `No archived groups.`
- `Buat satu grup untuk dipakai ulang di banyak item.` → `Create a group to reuse across many items.`

For any NEW empty `en` msgstr not in this list, translate it sensibly and note it in the report. Do not touch entries that already have a translation (e.g. `Aktif`, `Arsip`, `Arsipkan`, `Batal`, `Simpan`, `Nama`, `Status`, `Harga`, `Kategori`, `Aksi baris`, `Menyimpan…`, `Kategori muncul…` — these came from earlier work).

- [ ] **Step 3: Compile**

Run: `pnpm lingui:compile`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/locales/id/messages.po src/locales/en/messages.po
git commit -m "i18n(menu): extract + fill en for Menu polish"
```

---

## Task 13: Full local verification

**Files:** none

- [ ] **Step 1: Full gate**

Run:
```bash
pnpm typecheck && pnpm test && pnpm lingui:compile
```
Expected: typecheck clean; all unit/Convex tests PASS (existing 220 + the new items.list enrichment, categories.setOrder, and reorder.test.ts cases); compile clean.

- [ ] **Step 2: Lint the changed files (Biome)**

Run (if Biome runs in your environment): `pnpm lint`
Expected: PASS, or only pre-existing unrelated findings. Fix anything this work introduced. Use `// biome-ignore lint/suspicious/noArrayIndexKey: …` (not eslint-disable) for any intentional index keys — `ReorderableTable` already does this for skeletons.

- [ ] **Step 3: Confirm clean tree + no generated drift**

Run: `git status`
Expected: clean. No schema change in this sub-project → no Convex `_generated` drift expected. If `_generated` changed, run `./node_modules/.bin/convex codegen` and commit the tracked files.

- [ ] **Step 4: Integrate (after user OK)**

Per the trunk-based workflow, wait for the user's go-ahead. The kit foundation + Menu polish ship together on `feat/catalog-ui-kit`; finishing options (merge / PR) are handled via the finishing-a-development-branch skill. Do not merge without approval.

---

## Self-Review (performed against the spec)

**Spec coverage:**
- Branch stacked on `feat/catalog-ui-kit` → conventions + Task 13.4.
- New deps `@dnd-kit/*` → Task 1.
- `ReorderableTable` (separate from `DataTable`) → Tasks 5 (helper) + 6.
- Backend: `items.list` recipe/low-stock enrichment via shared `itemRecipeStatus` → Tasks 2–3; `categories.setOrder` → Task 4.
- Items page: PageHeader + Toolbar(search + category `<Select>` in children slot + Aktif/Arsip chips) + DataTable(Nama link, Kategori, Harga, Resep, Status, actions) + low-stock tint + `⋯`(Aktif toggle, Arsipkan) + ConfirmDialog + toasts → Task 9.
- Kategori page: PageHeader + `+ Tambah Kategori` → `CategoryFormDialog`; Aktif/Arsip chips; drag-only `ReorderableTable` (Nama, Item, Status) persisting via `setOrder`; archived read-only list; `⋯`(Ubah nama, Arsipkan) → Tasks 7–8.
- Modifier page: PageHeader + `+ Grup baru`; Aktif/Arsip chips; DataTable(Nama link, Tipe, Aturan, Opsi, Status, actions); `⋯`(Ubah grup, Arsipkan) → Task 10.
- Name-as-link + `⋯` interaction → Tasks 9–10. Archived views read-only → Tasks 8 (ArchivedCategoryList), 9, 10.
- Testing: Convex (`items.list` enrichment, `categories.setOrder`), pure (`moveId`), Playwright menu smoke → Tasks 3, 4, 5, 11. i18n → Task 12.
- Menu layout already provides `p-6` + tab nav → noted in conventions; pages render no `p-6`/nav.

**Placeholder scan:** No TBD/TODO. The only intentional no-op is the categories `Toolbar` `onSearch={() => {}}` with empty search (categories have no search), explained inline.

**Type consistency:** `ItemRow = Doc<'menuItems'> & { hasRecipe; lowStockIngredientNames }` matches the `menuItemWithStatus` validator (Task 3). `Group = Doc<'modifierGroups'> & { options }` matches `modifierGroups.list`'s `groupWithOptions` return. `moveId` (Task 5) is consumed by `ReorderableTable` (Task 6) and `ReorderableColumn`/`ReorderableTableProps` names are used consistently in Task 8. `setOrder({ orderedIds })` arg name matches between Task 4 (definition) and Task 8 (call). `itemRecipeStatus` signature matches between Task 2 (definition), `listForSale` (Task 2), and `list` (Task 3).
