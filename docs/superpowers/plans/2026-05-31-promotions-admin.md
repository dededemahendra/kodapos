# Promotions admin (Sub-project 5a) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/promos` stub with a kit admin page + backend CRUD for order-level promotions (percent or fixed), manageable but not yet applied at checkout (that's slice 5b).

**Architecture:** A new `promotions` table + `convex/promotions.ts` CRUD (mirroring `menu/categories.ts`). The page is PageHeader + Toolbar (Aktif/Arsip) + DataTable (Nama/Tipe/Nilai/Status) + a `PromoFormDialog` (name + type Select + value). A pure `formatPromoValue` helper renders the Nilai column.

**Tech Stack:** React 19, TanStack Router, Convex + convex-test, Tailwind v4, Lingui (id source / en target), shadcn/ui kit, Vitest (edge-runtime), Playwright. Package manager: **pnpm**. Branch: `feat/promotions-admin` (off `main`).

---

## Conventions for the implementing engineer (read once)

- **pnpm**; `~` = `src/`, `convex/...` for backend/generated. Convex codegen: `./node_modules/.bin/convex codegen` (NOT npx); commit `convex/_generated/*` drift.
- **Branch:** `feat/promotions-admin` (already created off `main`, has the design-spec commit). Stay on it.
- **i18n:** author Indonesian; `<Trans>` in JSX, `` t`…` `` for attributes. Task 6 runs extract/compile.
- **Strict TS:** `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` — optional chip `count` via conditional spread `...(counts !== undefined ? { count: … } : {})`.
- **Empty states use shadcn `Empty`** (project convention).
- **`/promos` has no layout padding** (the `_pos` layout is sidebar+header+Outlet) → the page renders its own `<main className="p-6">`.
- **Run before any push:** `pnpm lingui:extract` → fill `en` → `pnpm typecheck && pnpm test && pnpm lingui:compile`.
- **Commit style:** small Conventional Commits, each ending with a blank line then:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File structure

**Modified:** `convex/schema.ts` (+ table), `convex/_generated/*`, `src/routes/_pos/promos.tsx` (replace stub), `tests/convex/*`, `tests/e2e/inventory.spec.ts`, Lingui catalogs.
**New:** `convex/promotions.ts`, `src/lib/promo.ts` + `.test.ts`, `src/components/promo/promo-form-dialog.tsx`.

---

## Task 1: `promotions` table + CRUD backend

**Files:** `convex/schema.ts`, `convex/_generated/*`, Create `convex/promotions.ts`, Test `tests/convex/promotions.test.ts`

- [ ] **Step 1: Add the schema table + codegen**

In `convex/schema.ts`, add (near `categories`):
```ts
  promotions: defineTable({
    cafeId: v.id('cafes'),
    name: v.string(),
    type: v.union(v.literal('percent'), v.literal('fixed')),
    value: v.number(),
    archived: v.boolean(),
    createdAt: v.number(),
  }).index('by_cafe_active', ['cafeId', 'archived']),
```
Run `./node_modules/.bin/convex codegen`.

- [ ] **Step 2: Write the failing tests**

Create `tests/convex/promotions.test.ts`:
```ts
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setupOwner(t: ReturnType<typeof convexTest>, email = 'o@x.com') {
  const userId = await t.run(async (ctx) =>
    ctx.db.insert('users', { name: 'Owner', email })
  );
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  return { asOwner };
}

describe('promotions CRUD', () => {
  it('creates + lists (non-archived by default)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await asOwner.mutation(api.promotions.create, { name: 'Diskon Kopi', type: 'percent', value: 20 });
    await asOwner.mutation(api.promotions.create, { name: 'Promo Lebaran', type: 'fixed', value: 10000 });
    const list = await asOwner.query(api.promotions.list, {});
    expect(list).toHaveLength(2);
    // Sorted by name (id-ID): "Diskon Kopi" before "Promo Lebaran".
    expect(list[0]?.name).toBe('Diskon Kopi');
    expect(list[0]?.type).toBe('percent');
    expect(list[0]?.value).toBe(20);
    expect(list[1]?.type).toBe('fixed');
    expect(list[1]?.value).toBe(10000);
  });

  it('update changes fields; archive hides from default list', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.promotions.create, { name: 'X', type: 'percent', value: 10 });
    await asOwner.mutation(api.promotions.update, { id, name: 'X2', type: 'fixed', value: 5000 });
    let list = await asOwner.query(api.promotions.list, {});
    expect(list[0]?.name).toBe('X2');
    expect(list[0]?.type).toBe('fixed');
    expect(list[0]?.value).toBe(5000);
    await asOwner.mutation(api.promotions.archive, { id });
    expect(await asOwner.query(api.promotions.list, {})).toHaveLength(0);
    expect(await asOwner.query(api.promotions.list, { includeArchived: true })).toHaveLength(1);
  });

  it('validates name + value', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await expect(
      asOwner.mutation(api.promotions.create, { name: '  ', type: 'percent', value: 10 })
    ).rejects.toThrow(/nama/i);
    await expect(
      asOwner.mutation(api.promotions.create, { name: 'P', type: 'percent', value: 0 })
    ).rejects.toThrow(/1.*100|persentase/i);
    await expect(
      asOwner.mutation(api.promotions.create, { name: 'P', type: 'percent', value: 150 })
    ).rejects.toThrow(/1.*100|persentase/i);
    await expect(
      asOwner.mutation(api.promotions.create, { name: 'P', type: 'fixed', value: 0 })
    ).rejects.toThrow(/nominal|≥ 1/i);
  });

  it('tenant isolation: cafe B cannot list or archive cafe A promos', async () => {
    const t = convexTest(schema, modules);
    const { asOwner: ownerA } = await setupOwner(t, 'a@x.com');
    const aId = await ownerA.mutation(api.promotions.create, { name: 'A', type: 'percent', value: 10 });
    const { asOwner: ownerB } = await setupOwner(t, 'b@x.com');
    expect(await ownerB.query(api.promotions.list, { includeArchived: true })).toHaveLength(0);
    await expect(ownerB.mutation(api.promotions.archive, { id: aId })).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm test tests/convex/promotions.test.ts`
Expected: FAIL — `api.promotions.*` does not exist.

- [ ] **Step 4: Implement the CRUD**

Create `convex/promotions.ts`:
```ts
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwned, requireOwnerCafe } from './lib/auth';

const promotionDoc = v.object({
  _id: v.id('promotions'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  name: v.string(),
  type: v.union(v.literal('percent'), v.literal('fixed')),
  value: v.number(),
  archived: v.boolean(),
  createdAt: v.number(),
});

const promoType = v.union(v.literal('percent'), v.literal('fixed'));

function assertPromo(name: string, type: 'percent' | 'fixed', value: number): string {
  const trimmed = name.trim();
  if (trimmed.length < 1) throw new Error('Nama promo wajib diisi.');
  if (trimmed.length > 60) throw new Error('Nama promo maksimal 60 karakter.');
  if (type === 'percent') {
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      throw new Error('Persentase promo harus 1–100.');
    }
  } else if (!Number.isInteger(value) || value < 1) {
    throw new Error('Nominal promo harus bilangan bulat ≥ 1.');
  }
  return trimmed;
}

export const list = query({
  args: { includeArchived: v.optional(v.boolean()) },
  returns: v.array(promotionDoc),
  handler: async (ctx, { includeArchived = false }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const rows = await ctx.db
      .query('promotions')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId))
      .collect();
    return rows
      .filter((p) => includeArchived || !p.archived)
      .sort((a, b) => a.name.localeCompare(b.name, 'id-ID'));
  },
});

export const create = mutation({
  args: { name: v.string(), type: promoType, value: v.number() },
  returns: v.id('promotions'),
  handler: async (ctx, { name, type, value }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const cleanName = assertPromo(name, type, value);
    return await ctx.db.insert('promotions', {
      cafeId,
      name: cleanName,
      type,
      value,
      archived: false,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: { id: v.id('promotions'), name: v.string(), type: promoType, value: v.number() },
  returns: v.null(),
  handler: async (ctx, { id, name, type, value }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, id, 'Promo');
    const cleanName = assertPromo(name, type, value);
    await ctx.db.patch(id, { name: cleanName, type, value });
    return null;
  },
});

export const archive = mutation({
  args: { id: v.id('promotions') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, id, 'Promo');
    await ctx.db.patch(id, { archived: true });
    return null;
  },
});
```

- [ ] **Step 5: Run to verify pass + typecheck + commit**

Run: `pnpm test tests/convex/promotions.test.ts` (PASS), then `pnpm typecheck` (PASS).
```bash
git add convex/schema.ts convex/_generated convex/promotions.ts tests/convex/promotions.test.ts
git commit -m "feat(promotions): add promotions table + CRUD"
```

---

## Task 2: `formatPromoValue` pure helper

**Files:** Create `src/lib/promo.ts`, `src/lib/promo.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/promo.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { formatPromoValue } from './promo';

describe('formatPromoValue', () => {
  it('renders percent with a % suffix', () => {
    expect(formatPromoValue('percent', 20)).toBe('20%');
  });
  it('renders fixed as IDR', () => {
    expect(formatPromoValue('fixed', 10000)).toBe('Rp 10.000');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/lib/promo.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/promo.ts`:
```ts
import { formatIDR } from '~/lib/money';

export type PromoType = 'percent' | 'fixed';

// Display string for a promo's value: "20%" for percent, "Rp 10.000" for fixed.
export function formatPromoValue(type: PromoType, value: number): string {
  return type === 'percent' ? `${value}%` : formatIDR(value);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/lib/promo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/promo.ts src/lib/promo.test.ts
git commit -m "feat(promotions): add formatPromoValue helper with tests"
```

---

## Task 3: `PromoFormDialog` component

**Files:** Create `src/components/promo/promo-form-dialog.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Doc } from 'convex/_generated/dataModel';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Spinner } from '~/components/ui/spinner';
import { toast } from '~/lib/toast';

type PromoType = 'percent' | 'fixed';

export function PromoFormDialog({
  open,
  promo,
  onOpenChange,
}: {
  open: boolean;
  promo: Doc<'promotions'> | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const isEdit = promo !== null;
  const create = useMutation(api.promotions.create);
  const update = useMutation(api.promotions.update);
  const [name, setName] = useState('');
  const [type, setType] = useState<PromoType>('percent');
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(promo?.name ?? '');
      setType(promo?.type ?? 'percent');
      setValue(promo ? String(promo.value) : '');
      setError(null);
    }
  }, [open, promo]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const parsedValue = Number.parseInt(value, 10);
    try {
      if (isEdit && promo) {
        await update({ id: promo._id, name, type, value: parsedValue });
        toast.success(t`Promo diperbarui.`);
      } else {
        await create({ name, type, value: parsedValue });
        toast.success(t`Promo ditambahkan.`);
      }
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t`Gagal menyimpan promo.`;
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
            {isEdit ? <Trans>Ubah promo</Trans> : <Trans>Tambah promo</Trans>}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="promo-name"><Trans>Nama promo</Trans></FieldLabel>
              <Input
                id="promo-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={60}
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="promo-type"><Trans>Tipe</Trans></FieldLabel>
              <Select value={type} onValueChange={(v) => setType(v as PromoType)}>
                <SelectTrigger id="promo-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">{t`Persen`}</SelectItem>
                  <SelectItem value="fixed">{t`Nominal`}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="promo-value">
                {type === 'percent' ? <Trans>Nilai (%)</Trans> : <Trans>Nilai (Rp)</Trans>}
              </FieldLabel>
              <Input
                id="promo-value"
                type="number"
                min="1"
                {...(type === 'percent' ? { max: '100' } : {})}
                step="1"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
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

Run: `pnpm typecheck` (PASS — the `{...(type === 'percent' ? { max: '100' } : {})}` spread keeps `max` absent for fixed, satisfying `exactOptionalPropertyTypes`).
```bash
git add src/components/promo/promo-form-dialog.tsx
git commit -m "feat(promotions): add PromoFormDialog (create + edit)"
```

---

## Task 4: Promos page (replace stub)

**Files:** Modify `src/routes/_pos/promos.tsx`

- [ ] **Step 1: Replace the whole file**

```tsx
import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from 'convex/_generated/api';
import type { Doc } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { Archive, BadgePercent, Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PromoFormDialog } from '~/components/promo/promo-form-dialog';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { DataTable } from '~/components/ui/data-table';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { PageHeader } from '~/components/ui/page-header';
import { RowActions } from '~/components/ui/row-actions';
import { StatusBadge } from '~/components/ui/status-badge';
import { Toolbar } from '~/components/ui/toolbar';
import { formatPromoValue } from '~/lib/promo';
import { toast } from '~/lib/toast';

export const Route = createFileRoute('/_pos/promos')({
  component: PromosPage,
});

type Promo = Doc<'promotions'>;
type Filter = 'active' | 'archived';

function PromosPage() {
  const { t } = useLingui();
  const [filter, setFilter] = useState<Filter>('active');
  const [formOpen, setFormOpen] = useState(false);
  const [formPromo, setFormPromo] = useState<Promo | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Promo | null>(null);

  const promos = useQuery(api.promotions.list, { includeArchived: true });
  const archive = useMutation(api.promotions.archive);

  const counts = useMemo(() => {
    if (!promos) return undefined;
    return {
      active: promos.filter((p) => !p.archived).length,
      archived: promos.filter((p) => p.archived).length,
    };
  }, [promos]);

  const visible = useMemo<Promo[] | undefined>(() => {
    if (!promos) return undefined;
    return promos.filter((p) => (filter === 'archived' ? p.archived : !p.archived));
  }, [promos, filter]);

  function openCreate() {
    setFormPromo(null);
    setFormOpen(true);
  }
  function openEdit(p: Promo) {
    setFormPromo(p);
    setFormOpen(true);
  }

  const columns = useMemo<ColumnDef<Promo, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: () => <Trans>Nama</Trans>,
        cell: ({ row }) =>
          row.original.archived ? (
            <span className="font-medium">{row.original.name}</span>
          ) : (
            <button
              type="button"
              className="text-left font-medium hover:underline"
              onClick={() => openEdit(row.original)}
            >
              {row.original.name}
            </button>
          ),
      },
      {
        id: 'type',
        enableSorting: false,
        header: () => <Trans>Tipe</Trans>,
        cell: ({ row }) =>
          row.original.type === 'percent' ? (
            <StatusBadge variant="success"><Trans>Persen</Trans></StatusBadge>
          ) : (
            <StatusBadge variant="muted"><Trans>Nominal</Trans></StatusBadge>
          ),
      },
      {
        accessorKey: 'value',
        header: () => <Trans>Nilai</Trans>,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatPromoValue(row.original.type, row.original.value)}
          </span>
        ),
      },
      {
        id: 'status',
        enableSorting: false,
        header: () => <Trans>Status</Trans>,
        cell: ({ row }) =>
          row.original.archived ? (
            <StatusBadge variant="muted"><Trans>Arsip</Trans></StatusBadge>
          ) : (
            <StatusBadge variant="success"><Trans>Aktif</Trans></StatusBadge>
          ),
      },
      {
        id: 'actions',
        enableSorting: false,
        header: () => null,
        cell: ({ row }) =>
          row.original.archived ? null : (
            <div className="text-right">
              <RowActions
                label={t`Aksi baris`}
                items={[
                  {
                    label: <Trans>Ubah</Trans>,
                    icon: <Pencil />,
                    onSelect: () => openEdit(row.original),
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
    [t]
  );

  const emptyState = (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <BadgePercent />
        </EmptyMedia>
        <EmptyTitle>
          {filter === 'archived' ? (
            <Trans>Tidak ada promo diarsipkan.</Trans>
          ) : (
            <Trans>Belum ada promo.</Trans>
          )}
        </EmptyTitle>
        {filter === 'active' ? (
          <EmptyDescription>
            <Trans>Buat promo untuk memberi diskon di kasir.</Trans>
          </EmptyDescription>
        ) : null}
      </EmptyHeader>
    </Empty>
  );

  return (
    <main className="p-6">
      <PageHeader
        title={<Trans>Promo & Diskon</Trans>}
        meta={counts ? <Trans>{counts.active} promo aktif</Trans> : null}
        actions={
          <Button type="button" onClick={openCreate}>
            <Plus />
            <Trans>Tambah Promo</Trans>
          </Button>
        }
      />

      <Toolbar
        active={filter}
        onFilter={(v) => setFilter(v as Filter)}
        filters={[
          { label: <Trans>Aktif</Trans>, value: 'active', ...(counts !== undefined ? { count: counts.active } : {}) },
          { label: <Trans>Arsip</Trans>, value: 'archived', ...(counts !== undefined ? { count: counts.archived } : {}) },
        ]}
      />

      <DataTable
        columns={columns}
        data={visible}
        emptyState={emptyState}
        initialSort={[{ id: 'name', desc: false }]}
      />

      <PromoFormDialog
        open={formOpen}
        promo={formPromo}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setFormPromo(null);
        }}
      />
      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(o) => {
          if (!o) setArchiveTarget(null);
        }}
        title={<Trans>Arsipkan promo?</Trans>}
        description={
          archiveTarget ? (
            <Trans>"{archiveTarget.name}" tidak akan bisa dipakai di kasir.</Trans>
          ) : undefined
        }
        confirmLabel={<Trans>Arsipkan</Trans>}
        destructive
        onConfirm={async () => {
          if (!archiveTarget) return;
          try {
            await archive({ id: archiveTarget._id });
            toast.success(t`Promo diarsipkan.`);
          } catch (err) {
            const message = err instanceof Error ? err.message : t`Gagal mengarsipkan promo.`;
            toast.error(message);
            throw err;
          }
        }}
      />
    </main>
  );
}
```

> Notes: `Toolbar` search omitted (optional). `columns` memo dep `[t]` (cell closures use only stable setters + module fns). `as`-cast not needed (`promotions.list` returns `Doc<'promotions'>[]`, matching `Promo`). `<main className="p-6">` since `/promos` has no padded layout. Archived rows render plain name + no `⋯` (read-only).

- [ ] **Step 2: Typecheck + full suite**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_pos/promos.tsx
git commit -m "feat(promotions): build Promo & Diskon admin page"
```

---

## Task 5: Playwright smoke — promo CRUD

**Files:** Modify `tests/e2e/inventory.spec.ts`

Reuses the `signupAndAddSusu(page)` helper (top of file) only to get a signed-in, onboarded, PIN'd session; the test then does promo CRUD on `/promos`.

- [ ] **Step 1: Add the test inside the describe block**

In `tests/e2e/inventory.spec.ts`, inside `test.describe('inventory + recipes (auth-gated)', ...)`, after the existing tests:
```ts
  test('Promos page: create percent + fixed, edit, archive', async ({ page }) => {
    await signupAndAddSusu(page);

    await page.goto('/promos');
    await waitForUrlHydrated(page, /\/promos$/);

    // Create a percent promo (Persen is the default type).
    await page.getByRole('button', { name: /Tambah Promo/ }).click();
    await page.getByLabel('Nama promo').fill('Diskon Kopi');
    await page.getByLabel(/Nilai/).fill('20');
    await page.getByRole('button', { name: /^Simpan$/ }).click();
    await expect(page.getByText(/Promo ditambahkan/)).toBeVisible();
    await expect(page.getByRole('cell', { name: /20%/ })).toBeVisible();

    // Create a fixed promo.
    await page.getByRole('button', { name: /Tambah Promo/ }).click();
    await page.getByLabel('Nama promo').fill('Promo Lebaran');
    await page.getByLabel('Tipe').click();
    await page.getByRole('option', { name: /Nominal/ }).click();
    await page.getByLabel(/Nilai/).fill('10000');
    await page.getByRole('button', { name: /^Simpan$/ }).click();
    await expect(page.getByText(/Promo ditambahkan/)).toBeVisible();
    await expect(page.getByRole('cell', { name: /Rp 10\.000/ })).toBeVisible();

    // Archive "Diskon Kopi" via the ⋯ menu, then see it under Arsip.
    await page
      .getByRole('row', { name: /Diskon Kopi/ })
      .getByRole('button', { name: /Aksi baris/ })
      .click();
    await page.getByRole('menuitem', { name: /Arsipkan/ }).click();
    await page.getByRole('button', { name: /^Arsipkan$/ }).click();
    await expect(page.getByText(/Promo diarsipkan/)).toBeVisible();
    await page.getByRole('button', { name: /^Arsip/ }).click();
    await expect(page.getByRole('cell', { name: /Diskon Kopi/ })).toBeVisible();
  });
```
> Note: the Tipe `Select` is a shadcn/Radix Select — its trigger is labelled "Tipe" (via `htmlFor`/`id`), opened by click, options chosen by role. If a selector fails on a real run (e.g. the Select option, or the `Arsipkan` confirm vs menu item ambiguity), fix it (scope to the dialog/`alertdialog`/row, prefer role-scoped) and report.

- [ ] **Step 2: Typecheck the spec**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Attempt to run (auth-gated)**

Run:
```bash
RUN_AUTH_E2E=1 pnpm test:e2e tests/e2e/inventory.spec.ts
```
Expected: all pass (Playwright auto-starts `pnpm dev:all`; several auth-gated tests now — allow time). If the backend can't start here, do NOT fake a pass — report "could not run: no backend" and confirm the spec typechecks + skips cleanly without the env var. Fix any selector that fails on a real run and report it.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/inventory.spec.ts
git commit -m "test(e2e): promo create/edit/archive on the Promos page"
```

---

## Task 6: i18n — extract, fill English, compile

**Files:** `src/locales/id/messages.po`, `src/locales/en/messages.po`

- [ ] **Step 1: Extract**

Run: `pnpm lingui:extract`

- [ ] **Step 2: Fill English**

In `src/locales/en/messages.po`, fill each NEW empty `msgstr ""`. Mapping:
- `Promo & Diskon` → `Promos & Discounts`
- `{0} promo aktif` → `{0} active promos`  (match the exact placeholder)
- `Tambah Promo` → `Add Promo`
- `Nama promo` → `Promo name`
- `Tipe` → `Type`  (leave if already translated)
- `Nilai` → `Value`
- `Nilai (%)` → `Value (%)`
- `Nilai (Rp)` → `Value (Rp)`
- `Persen` → `Percent`
- `Nominal` → `Fixed`
- `Ubah promo` → `Edit promo`
- `Tambah promo` → `Add promo`
- `Promo ditambahkan.` → `Promo added.`
- `Promo diperbarui.` → `Promo updated.`
- `Promo diarsipkan.` → `Promo archived.`
- `Gagal menyimpan promo.` → `Failed to save promo.`
- `Gagal mengarsipkan promo.` → `Failed to archive promo.`
- `Arsipkan promo?` → `Archive promo?`
- `"{0}" tidak akan bisa dipakai di kasir.` → `"{0}" will no longer be usable at the cashier.`
- `Belum ada promo.` → `No promos yet.`
- `Tidak ada promo diarsipkan.` → `No archived promos.`
- `Buat promo untuk memberi diskon di kasir.` → `Create a promo to give discounts at the cashier.`
- Already translated — leave untouched: `Nama`, `Status`, `Aktif`, `Arsip`, `Arsipkan`, `Ubah`, `Aksi baris`, `Batal`, `Simpan`, `Menyimpan…`.

For any new empty `en` msgstr not listed, translate sensibly and note it.

- [ ] **Step 3: Compile + typecheck**

Run: `pnpm lingui:compile && pnpm typecheck`
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add src/locales/id/messages.po src/locales/en/messages.po
git commit -m "i18n(promotions): extract + fill en for Promos admin"
```

---

## Task 7: Full local verification

**Files:** none

- [ ] **Step 1: Full gate**

Run:
```bash
pnpm typecheck && pnpm test && pnpm lingui:compile
```
Expected: typecheck clean; all unit/convex tests PASS (existing + promotions CRUD + formatPromoValue); compile clean.

- [ ] **Step 2: Lint (Biome, if it runs here)**

Run: `pnpm lint`
Expected: PASS or only pre-existing unrelated findings.

- [ ] **Step 3: Confirm clean tree + no further codegen drift**

Run: `git status` then `./node_modules/.bin/convex codegen` then `git status`
Expected: clean after Task 1 committed any drift.

- [ ] **Step 4: Integrate (after user OK)**

Per the trunk-based workflow, wait for the user's go-ahead, then push `feat/promotions-admin` and open a PR to `main`. Do not merge without approval. (Slice 5b — cashier application — follows as its own spec/plan.)

---

## Self-Review (performed against the spec)

**Spec coverage:**
- `promotions` table (percent/fixed, value, archived; `by_cafe_active`) + CRUD (list/create/update/archive + `assertPromo` validation) + tenant isolation → Task 1 (+ 4 tests).
- `formatPromoValue` pure helper → Task 2. (`promoDiscountIDR` correctly NOT here — deferred to 5b per spec.)
- `PromoFormDialog` (name + type Select + value with %/Rp label) → Task 3.
- Page: PageHeader (title/meta "{n} promo aktif"/+ Tambah Promo), Aktif/Arsip chips, DataTable (Nama button→edit / Tipe badge / Nilai / Status), `⋯` (Ubah · Arsipkan→ConfirmDialog) active-only, Empty, archived read-only → Task 4.
- Playwright create-percent/create-fixed/edit/archive → Task 5. i18n → Task 6. Verification → Task 7.
- Out-of-scope respected: no checkout/discount application, no scope/conditions/auto-apply, no max cap.

**Placeholder scan:** none. The `{...(type === 'percent' ? { max: '100' } : {})}` spread is the `exactOptionalPropertyTypes`-safe way to make `max` conditional.

**Type consistency:** `promotionDoc`/`Doc<'promotions'>` fields (`name/type/value/archived`) match `Promo` and all column/dialog usages. `promoType` (`'percent'|'fixed'`) matches `PromoType` in `promo.ts` and the dialog. `formatPromoValue(type, value)` signature matches the page's Nilai cell. `create`/`update` args (`{name,type,value}` / `{id,name,type,value}`) match `PromoFormDialog`'s mutation calls. `assertPromo` is the single validation source for create + update.
