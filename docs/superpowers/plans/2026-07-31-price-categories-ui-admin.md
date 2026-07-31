# Price Categories UI (Slice A: admin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an owner create price categories and set per-category prices for every item, variant and add-on.

**Architecture:** A fifth tab under Menu with two routes, mirroring the existing modifier-group pattern: a manager listing categories, and a price grid for one category. The grid is fed by one new backend query that returns every priceable target with its standard price and current override, so the client never assembles that itself.

**Tech Stack:** TanStack Router file routes, Convex queries/mutations, shadcn (Dialog, Field, Input, Empty, Spinner), lingui.

## Scope

**Slice A only: the admin side.** It creates categories and stores overrides. Nothing consumes them yet, because no cashier can select a tier until Slice B adds the register picker and the resolved `listForSale`. Slice A is safe to ship alone and invisible to cashiers.

## Global Constraints

- **All new interface strings go through lingui, in both locales.** Run `pnpm lingui:extract` and fill the English translations, not only `lingui:compile`, or new strings ship as Indonesian in the English locale.
- **No em-dash (—) or `--` in any user-facing string.** Use commas, periods or parentheses.
- **Empty data states use shadcn `Empty`** with icon, heading and description, never bare text. See `src/components/sale/held-orders-dialog.tsx:116-129` for the exact composition.
- **`src/routeTree.gen.ts` is generated AND tracked.** Adding a route means committing the regenerated file, or CI typecheck fails even though local typecheck passes.
- Convex codegen is `./node_modules/.bin/convex codegen`, NOT `npx`. Generated files under `convex/_generated` are tracked.
- **Components are not unit tested in this repo.** Vitest runs in `edge-runtime` and only collects `*.test.ts`, so `.tsx` cannot be mounted. Backend queries ARE tested, via `convex-test`. Each UI task therefore ends with a manual acceptance checklist instead of assertions, and that is deliberate rather than an omission.
- Verify with `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile` locally before pushing.

## File Structure

| File | Responsibility |
|---|---|
| `src/routes/_pos/menu/route.tsx` (modify) | Add the fifth tab link. |
| `src/routes/_pos/menu/price-categories.tsx` (create) | Thin route, renders the manager. |
| `src/components/menu/price-category-table.tsx` (create) | List, create, rename, archive. Empty state. |
| `src/components/menu/price-category-form-dialog.tsx` (create) | Create/rename dialog. |
| `convex/menu/priceOverrides.ts` (modify) | New `grid` query feeding the price grid. |
| `tests/convex/price-grid.test.ts` (create) | Tests for that query. |
| `src/routes/_pos/menu/price-categories.$categoryId.tsx` (create) | Thin route, renders the grid. |
| `src/components/menu/price-grid.tsx` (create) | The editable grid. |
| `src/routeTree.gen.ts` (modify, generated) | Regenerated for both new routes. |

---

### Task 1: The tab and the category manager

**Files:**
- Modify: `src/routes/_pos/menu/route.tsx`
- Create: `src/routes/_pos/menu/price-categories.tsx`
- Create: `src/components/menu/price-category-table.tsx`
- Create: `src/components/menu/price-category-form-dialog.tsx`
- Modify: `src/routeTree.gen.ts` (generated)

**Interfaces:**
- Consumes: `api.menu.priceCategories.list / create / update / archive`, already built and merged.
- Produces: the route `/menu/price-categories`. Task 3's grid route nests under the same path.

- [ ] **Step 1: Add the tab**

In `src/routes/_pos/menu/route.tsx`, after the `/menu/modifiers` Link and before `/menu/labels`, add:

```tsx
        <Link
          to="/menu/price-categories"
          className="py-2 px-1 -mb-px border-b-2 border-transparent hover:border-ring"
          activeProps={{ className: 'border-ring font-semibold' }}
        >
          <Trans>Kategori Harga</Trans>
        </Link>
```

The whole section is already wrapped in `RequirePermission perm="canEditMenu"`, so this tab inherits that gate. Do not add another.

- [ ] **Step 2: Create the dialog**

Create `src/components/menu/price-category-form-dialog.tsx`, following `category-form-dialog.tsx`:

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

export function PriceCategoryFormDialog({
  open,
  category,
  onOpenChange,
}: {
  open: boolean;
  /** null = create mode; otherwise rename the given category. */
  category: { _id: Id<'priceCategories'>; name: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const isEdit = category !== null;
  const create = useMutation(api.menu.priceCategories.create);
  const update = useMutation(api.menu.priceCategories.update);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(category?.name ?? '');
      setError(null);
    }
  }, [open, category]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t`Nama wajib diisi.`);
      return;
    }
    setSubmitting(true);
    try {
      if (category) await update({ id: category._id, name: trimmed });
      else await create({ name: trimmed });
      onOpenChange(false);
    } catch {
      toast.error(t`Gagal menyimpan kategori harga.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEdit ? <Trans>Ubah kategori harga</Trans> : <Trans>Kategori harga baru</Trans>}
            </DialogTitle>
          </DialogHeader>
          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="pc-name">
                <Trans>Nama</Trans>
              </FieldLabel>
              <Input
                id="pc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t`Turis`}
                autoFocus
              />
              {error ? <FieldError>{error}</FieldError> : null}
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Spinner /> : <Trans>Simpan</Trans>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Create the manager table**

Create `src/components/menu/price-category-table.tsx`:

```tsx
import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { Tags } from 'lucide-react';
import { useState } from 'react';
import { ConfirmArchive } from '~/components/menu/confirm-archive';
import { PriceCategoryFormDialog } from '~/components/menu/price-category-form-dialog';
import { Button } from '~/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { Spinner } from '~/components/ui/spinner';
import { toast } from '~/lib/toast';

type Row = { _id: Id<'priceCategories'>; name: string };

export function PriceCategoryTable() {
  const { t } = useLingui();
  const categories = useQuery(api.menu.priceCategories.list, {});
  const archive = useMutation(api.menu.priceCategories.archive);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [archiving, setArchiving] = useState<Row | null>(null);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  async function onArchive(row: Row) {
    try {
      await archive({ id: row._id });
    } catch {
      toast.error(t`Gagal mengarsipkan kategori harga.`);
    } finally {
      setArchiving(null);
    }
  }

  if (categories === undefined) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Trans>Kategori harga baru</Trans>
        </Button>
      </div>

      {categories.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Tags />
            </EmptyMedia>
            <EmptyTitle>
              <Trans>Belum ada kategori harga.</Trans>
            </EmptyTitle>
            <EmptyDescription>
              <Trans>
                Buat kategori seperti Turis atau Member untuk memakai harga berbeda pada menu yang
                sama. Harga menu Anda sekarang tetap menjadi harga standar.
              </Trans>
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {categories.map((c) => (
            <li key={c._id} className="flex items-center justify-between px-4 py-3">
              <Link
                to="/menu/price-categories/$categoryId"
                params={{ categoryId: c._id }}
                className="font-medium hover:underline"
              >
                {c.name}
              </Link>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditing({ _id: c._id, name: c.name });
                    setDialogOpen(true);
                  }}
                >
                  <Trans>Ubah</Trans>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setArchiving({ _id: c._id, name: c.name })}
                >
                  <Trans>Arsipkan</Trans>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <PriceCategoryFormDialog
        open={dialogOpen}
        category={editing}
        onOpenChange={setDialogOpen}
      />
      {archiving ? (
        <ConfirmArchive
          open
          name={archiving.name}
          onCancel={() => setArchiving(null)}
          onConfirm={() => onArchive(archiving)}
        />
      ) : null}
    </div>
  );
}
```

**Before writing this, read `src/components/menu/confirm-archive.tsx` and match its actual prop names.** The props above (`open`, `name`, `onCancel`, `onConfirm`) are the expected shape; if they differ, use the real ones rather than changing that component.

- [ ] **Step 4: Create the route**

Create `src/routes/_pos/menu/price-categories.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { PriceCategoryTable } from '~/components/menu/price-category-table';

export const Route = createFileRoute('/_pos/menu/price-categories')({
  component: PriceCategoriesPage,
});

function PriceCategoriesPage() {
  return <PriceCategoryTable />;
}
```

Note: the `Link` in Step 3 points at `/menu/price-categories/$categoryId`, which does not exist until Task 3. Typecheck will fail on that route id until then. Comment the `Link` down to plain text for this task if it blocks, and restore it in Task 3, noting it in your report.

- [ ] **Step 5: Regenerate the route tree and extract strings**

Run: `pnpm build`, then `pnpm lingui:extract`.

Fill the English translations for every new string in `src/locales/en/messages.po`. Leaving them empty ships Indonesian to English users.

Then `pnpm lingui:compile`.

- [ ] **Step 6: Verify**

Run: `pnpm typecheck && pnpm test && pnpm lingui:compile`
Expected: clean, full suite passes, `git status` shows no unexpected drift.

- [ ] **Step 7: Manual acceptance**

Run `pnpm dev` and visit `/menu/price-categories`:
- With no categories, the Empty state renders with icon, title and description.
- Create "Turis". It appears in the list.
- Rename it. The change persists on reload.
- Archive it. It disappears and the Empty state returns.

Record what you actually saw in your report. Do not claim any step you did not run.

- [ ] **Step 8: Commit**

```bash
git add src/routes/_pos/menu src/components/menu src/routeTree.gen.ts src/locales
git commit -m "feat(menu): add a price categories manager

The pricing engine shipped with no way to create a category, so nothing could
reach it. This adds the fifth menu tab and the manager behind it.

The empty state carries a description rather than bare text, because an owner
landing here with no categories has no other clue what one is for, and it is
also where we say plainly that today's menu prices remain the standard price.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The grid query

**Files:**
- Modify: `convex/menu/priceOverrides.ts`
- Test: `tests/convex/price-grid.test.ts`

**Interfaces:**
- Consumes: tables `priceCategories`, `priceOverrides`, `menuItems`, `menuItemVariants`, `modifierGroups`, `modifierOptions`.
- Produces: `api.menu.priceOverrides.grid({ priceCategoryId }) -> Array<{ targetKind, targetId, label, groupLabel, standardPriceIDR, overrideIDR }>` where `overrideIDR` is `null` when the category does not reprice that target. Task 3 renders exactly this.

Assembling this server-side keeps the client from issuing one query per item for variants, and keeps "what is priceable" in one place.

- [ ] **Step 1: Write the failing test**

Create `tests/convex/price-grid.test.ts`:

```ts
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setup(t: ReturnType<typeof convexTest>) {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' });
  });
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
  const itemId = await asOwner.mutation(api.menu.items.create, {
    categoryId,
    name: 'Espresso',
    priceIDR: 18000,
  });
  const variantId = await asOwner.mutation(api.menu.variants.create, {
    menuItemId: itemId,
    name: 'L',
    priceIDR: 25000,
  });
  const groupId = await asOwner.mutation(api.menu.modifierGroups.upsert, {
    name: 'Susu',
    required: false,
    minSelect: 0,
    maxSelect: 1,
    options: [{ name: 'Oat', priceAdjustmentIDR: 5000, position: 0 }],
  });
  await asOwner.mutation(api.menu.itemGroups.attach, {
    menuItemId: itemId,
    modifierGroupId: groupId,
  });
  const tierId = await asOwner.mutation(api.menu.priceCategories.create, { name: 'Turis' });
  return { asOwner, itemId, variantId, groupId, tierId };
}

describe('price grid', () => {
  it('lists every priceable target with its standard price', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const rows = await s.asOwner.query(api.menu.priceOverrides.grid, {
      priceCategoryId: s.tierId,
    });
    const kinds = rows.map((r) => r.targetKind).sort();
    expect(kinds).toEqual(['item', 'modifier', 'variant']);
    const item = rows.find((r) => r.targetKind === 'item')!;
    expect(item.label).toBe('Espresso');
    expect(item.standardPriceIDR).toBe(18000);
    const variant = rows.find((r) => r.targetKind === 'variant')!;
    expect(variant.standardPriceIDR).toBe(25000);
    const modifier = rows.find((r) => r.targetKind === 'modifier')!;
    expect(modifier.standardPriceIDR).toBe(5000);
  });

  // A blank cell in the grid means inherit, so an unpriced target must come back
  // as null rather than as its standard price, or the UI cannot tell the two apart.
  it('returns a null override for a target the category does not reprice', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const rows = await s.asOwner.query(api.menu.priceOverrides.grid, {
      priceCategoryId: s.tierId,
    });
    expect(rows.every((r) => r.overrideIDR === null)).toBe(true);
  });

  it('returns the override where one exists', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await s.asOwner.mutation(api.menu.priceOverrides.set, {
      priceCategoryId: s.tierId,
      targetKind: 'item',
      targetId: s.itemId,
      priceIDR: 30000,
    });
    const rows = await s.asOwner.query(api.menu.priceOverrides.grid, {
      priceCategoryId: s.tierId,
    });
    const item = rows.find((r) => r.targetKind === 'item')!;
    expect(item.overrideIDR).toBe(30000);
    expect(item.standardPriceIDR).toBe(18000);
    const variant = rows.find((r) => r.targetKind === 'variant')!;
    expect(variant.overrideIDR).toBeNull();
  });

  it('rejects a category from another cafe', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const otherUser = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Other', email: 'b@x.com' });
    });
    const asOther = t.withIdentity({ subject: `${otherUser}|test_session` });
    await asOther.mutation(api.cafes.createForOwner, { name: 'Warung B' });
    await expect(
      asOther.query(api.menu.priceOverrides.grid, { priceCategoryId: s.tierId })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/convex/price-grid.test.ts`
Expected: FAIL, `grid` is not a function.

- [ ] **Step 3: Implement the query**

Add to `convex/menu/priceOverrides.ts`. It needs `import type { Id } from '../_generated/dataModel';` if that import is not already present.

```ts
const gridRow = v.object({
  targetKind: targetKindValidator,
  targetId: targetIdValidator,
  label: v.string(),
  /** The item a variant belongs to, or the modifier group an option belongs to. */
  groupLabel: v.optional(v.string()),
  standardPriceIDR: v.number(),
  /** null means this category does not reprice the target, so it inherits. */
  overrideIDR: v.union(v.number(), v.null()),
});

/**
 * Every priceable target for one category, with its standard price and current
 * override. Assembled here rather than in the client so the grid does not issue
 * a query per item for variants, and so "what is priceable" has one definition.
 */
export const grid = query({
  args: { priceCategoryId: v.id('priceCategories') },
  returns: v.array(gridRow),
  handler: async (ctx, args) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    await requireOwned(ctx, cafeId, args.priceCategoryId, 'Kategori harga');

    const overrides = new Map<string, number>();
    const rows = await ctx.db
      .query('priceOverrides')
      .withIndex('by_cafe_and_category', (q) =>
        q.eq('cafeId', cafeId).eq('priceCategoryId', args.priceCategoryId)
      )
      .collect();
    for (const row of rows) overrides.set(row.targetId as string, row.priceIDR);

    // targetId keeps its union id type rather than widening to string, so the
    // returns validator and the client both see real ids and no cast is needed
    // at either end.
    const out: Array<{
      targetKind: 'item' | 'variant' | 'modifier';
      targetId: Id<'menuItems'> | Id<'menuItemVariants'> | Id<'modifierOptions'>;
      label: string;
      groupLabel?: string;
      standardPriceIDR: number;
      overrideIDR: number | null;
    }> = [];

    const items = await ctx.db
      .query('menuItems')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId).eq('archived', false))
      .collect();

    for (const item of items) {
      out.push({
        targetKind: 'item',
        targetId: item._id,
        label: item.name,
        standardPriceIDR: item.priceIDR,
        overrideIDR: overrides.get(item._id) ?? null,
      });
      const variants = await ctx.db
        .query('menuItemVariants')
        .withIndex('by_item_active', (q) => q.eq('menuItemId', item._id).eq('archived', false))
        .collect();
      for (const variant of variants) {
        out.push({
          targetKind: 'variant',
          targetId: variant._id,
          label: variant.name,
          groupLabel: item.name,
          standardPriceIDR: variant.priceIDR,
          overrideIDR: overrides.get(variant._id) ?? null,
        });
      }
    }

    const groups = await ctx.db
      .query('modifierGroups')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId).eq('archived', false))
      .collect();
    for (const group of groups) {
      const options = await ctx.db
        .query('modifierOptions')
        .withIndex('by_group_active', (q) => q.eq('groupId', group._id).eq('archived', false))
        .collect();
      for (const option of options) {
        out.push({
          targetKind: 'modifier',
          targetId: option._id,
          label: option.name,
          groupLabel: group.name,
          standardPriceIDR: option.priceAdjustmentIDR,
          overrideIDR: overrides.get(option._id) ?? null,
        });
      }
    }

    return out;
  },
});
```

**Confirm the index names against `convex/schema.ts` before running.** `by_cafe_active`, `by_item_active` and `by_group_active` are what the existing modules use; if any differs, use the real one rather than adding an index.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run tests/convex/price-grid.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Verify and commit**

Run: `./node_modules/.bin/convex codegen && pnpm typecheck && pnpm test`

```bash
git add convex/menu/priceOverrides.ts convex/_generated tests/convex/price-grid.test.ts
git commit -m "feat(menu): return every priceable target for a price category

The grid needs items, their variants and every modifier option in one shape,
with the standard price beside the current override. Assembling it server-side
keeps the client from issuing a query per item for variants, and keeps 'what is
priceable' defined in one place rather than reconstructed in a component.

overrideIDR is null rather than absent when a category does not reprice a
target: the grid shows a blank cell for inherit, and null is what lets it tell
'inherits 18000' apart from 'overridden to 18000'.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The price grid screen

**Files:**
- Create: `src/routes/_pos/menu/price-categories.$categoryId.tsx`
- Create: `src/components/menu/price-grid.tsx`
- Modify: `src/components/menu/price-category-table.tsx` (restore the `Link` if Task 1 stubbed it)
- Modify: `src/routeTree.gen.ts` (generated)

**Interfaces:**
- Consumes: `api.menu.priceOverrides.grid` from Task 2, plus `.set` and `.clear`.
- Produces: the route `/menu/price-categories/$categoryId`.

- [ ] **Step 1: Create the grid component**

Create `src/components/menu/price-grid.tsx`:

```tsx
import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { toast } from '~/lib/toast';

/**
 * The row shape `api.menu.priceOverrides.grid` returns. Derived from the query so
 * targetId keeps its union id type and no cast is needed when passing it back to
 * set/clear.
 */
type GridRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.menu.priceOverrides.grid>>
>[number];

export function PriceGrid({ categoryId }: { categoryId: Id<'priceCategories'> }) {
  const { t } = useLingui();
  const rows = useQuery(api.menu.priceOverrides.grid, { priceCategoryId: categoryId });
  const setOverride = useMutation(api.menu.priceOverrides.set);
  const clearOverride = useMutation(api.menu.priceOverrides.clear);
  const [search, setSearch] = useState('');

  /**
   * Writes fire on blur, never per keystroke. Typing "45000" would otherwise
   * send five mutations, four of them for prices nobody meant.
   */
  async function commit(row: GridRow, raw: string) {
    const trimmed = raw.trim();
    if (trimmed === '') {
      if (row.overrideIDR === null) return;
      try {
        await clearOverride({
          priceCategoryId: categoryId,
          targetKind: row.targetKind,
          targetId: row.targetId,
        });
      } catch {
        toast.error(t`Gagal menghapus harga.`);
      }
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 0) {
      toast.error(t`Harga harus bilangan bulat dan tidak boleh negatif.`);
      return;
    }
    if (parsed === row.overrideIDR) return;
    try {
      await setOverride({
        priceCategoryId: categoryId,
        targetKind: row.targetKind,
        targetId: row.targetId,
        priceIDR: parsed,
      });
    } catch {
      toast.error(t`Gagal menyimpan harga.`);
    }
  }

  if (rows === undefined) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  const term = search.trim().toLowerCase();
  const visible = term
    ? rows.filter(
        (r) =>
          r.label.toLowerCase().includes(term) ||
          (r.groupLabel ?? '').toLowerCase().includes(term)
      )
    : rows;

  return (
    <div className="space-y-4">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t`Cari menu, varian atau tambahan`}
        className="max-w-sm"
      />
      <p className="text-sm text-muted-foreground">
        <Trans>Kosongkan kolom harga untuk memakai harga standar.</Trans>
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-2 font-medium">
              <Trans>Nama</Trans>
            </th>
            <th className="py-2 font-medium">
              <Trans>Harga standar</Trans>
            </th>
            <th className="py-2 font-medium">
              <Trans>Harga kategori</Trans>
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <tr key={r.targetId} className="border-b border-border">
              <td className="py-2">
                {r.groupLabel ? (
                  <span className="text-muted-foreground">{r.groupLabel} / </span>
                ) : null}
                {r.label}
              </td>
              <td className="py-2 text-muted-foreground">{r.standardPriceIDR}</td>
              <td className="py-2">
                <PriceCell
                  key={`${r.targetId}:${r.overrideIDR ?? 'null'}`}
                  initial={r.overrideIDR}
                  placeholder={String(r.standardPriceIDR)}
                  onCommit={(raw) => commit(r, raw)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PriceCell({
  initial,
  placeholder,
  onCommit,
}: {
  initial: number | null;
  placeholder: string;
  onCommit: (raw: string) => void;
}) {
  const [value, setValue] = useState(initial === null ? '' : String(initial));
  return (
    <Input
      value={value}
      inputMode="numeric"
      placeholder={placeholder}
      className="max-w-32"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        // Escape reverts the cell to its stored value without writing.
        if (e.key === 'Escape') {
          setValue(initial === null ? '' : String(initial));
          e.currentTarget.blur();
        }
      }}
    />
  );
}
```

The `key` on `PriceCell` includes the current override so a server-side change re-seeds the local input state; without it a cell edited elsewhere would keep showing the stale local value.

- [ ] **Step 2: Create the route**

Create `src/routes/_pos/menu/price-categories.$categoryId.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router';
import type { Id } from 'convex/_generated/dataModel';
import { PriceGrid } from '~/components/menu/price-grid';

export const Route = createFileRoute('/_pos/menu/price-categories/$categoryId')({
  component: PriceGridPage,
});

function PriceGridPage() {
  const { categoryId } = Route.useParams();
  return <PriceGrid categoryId={categoryId as Id<'priceCategories'>} />;
}
```

If Task 1 stubbed the `Link` in `price-category-table.tsx`, restore it now.

- [ ] **Step 3: Regenerate, extract, verify**

Run: `pnpm build`, then `pnpm lingui:extract`, fill the English translations, then
`pnpm lingui:compile && pnpm typecheck && pnpm test`
Expected: clean, full suite passes.

- [ ] **Step 4: Manual acceptance**

Run `pnpm dev`, create a category, open it:
- Every item, variant and add-on appears, with variants and options showing their parent as a prefix.
- The category price column is blank, with the standard price as placeholder.
- Type a price, click away. It persists on reload.
- Clear the cell, click away. It reverts to blank and the placeholder returns.
- Press Escape mid-edit. The cell reverts and nothing is written.
- Search filters by item, variant and add-on name.

Record what you actually saw. Do not claim a step you did not run.

- [ ] **Step 5: Commit**

```bash
git add src/routes/_pos/menu src/components/menu src/routeTree.gen.ts src/locales
git commit -m "feat(menu): add the per-category price grid

One table over the whole menu for a single category. A blank cell means inherit,
with the standard price as the placeholder, which is what makes the sparse model
legible: most rows stay untouched and you can see that at a glance.

Writes fire on blur rather than per keystroke, because typing a five digit price
would otherwise send five mutations, four of them for prices nobody meant. Enter
commits, Escape reverts the cell without writing.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## After this plan

Slice B makes it live: `listForSale` gains an optional `priceCategoryId` and resolves prices server-side, the register gets the picker, `cart-reducer` gains a reprice action so switching tier does not leave stale prices on screen, and the receipt prints the category name. Until Slice B ships, categories and overrides exist but no order can use them.
