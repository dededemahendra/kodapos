# Predictive Demand — Slice B (restock + suppliers + WhatsApp) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An owner manages suppliers and, on `/forecast`, sees a Daftar Belanja (restock list) derived from the 7-day forecast × recipes − stock, tweaks quantities, picks a supplier, and sends the list to WhatsApp.

**Architecture:** A `suppliers` table + CRUD + admin page (cloned from the Promotions pattern). Slice A's forecast computation is extracted into a shared `computeDemand(ctx, cafeId)` helper reused by both `forecast.demand` and a new `restock.suggestion` query, which layers recipes + stock + a pure `suggestRestock` formula. A restock panel on `/forecast` with a supplier picker + WhatsApp send (pure `normalizePhone`/`waUrl`/`formatRestockText`). Computed live; PDF + persistence deferred.

**Tech Stack:** React 19, TanStack Router, Convex + convex-test, Tailwind v4, Lingui (id source / en target), shadcn/ui kit, Vitest, Playwright. Package manager: **pnpm**. Branch: `feat/restock-suppliers` (off `main`, has the design-spec commit `a204fd0`).

---

## Conventions for the implementing engineer (read once)

- **pnpm**; `~` = `src/`, `convex/...` for backend/generated. Convex codegen: `./node_modules/.bin/convex codegen` (NOT npx); commit `convex/_generated/*` drift.
- **Branch:** `feat/restock-suppliers` (already created off `main`). Stay on it.
- **Pure convex-helper tests go under `tests/convex/`** (the vitest config covers `tests/` and `src/`, NOT `convex/lib/`). `src/lib/*.test.ts` is fine (covered).
- **i18n:** author Indonesian; `<Trans>` in JSX, `` t`…` `` for attributes. Task 11 runs extract/fill/compile. Server `throw new Error('…')` strings stay raw Indonesian.
- **Strict TS:** `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. Conditional-spread optional fields.
- **Empty states use shadcn `Empty`** (project convention).
- **Run before any push:** `pnpm lingui:extract` → fill `en` → `pnpm typecheck && pnpm test && pnpm lingui:compile`.
- **Commit style:** small Conventional Commits ending with a blank line then:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File structure

**New:** `convex/lib/phone.ts` (+ `tests/convex/phone.test.ts`); `convex/suppliers.ts` (+ `tests/convex/suppliers.test.ts`); `src/components/supplier/supplier-form-dialog.tsx`; `src/routes/_pos/suppliers.tsx`; `convex/lib/demand.ts` (extracted); `convex/lib/restock.ts` (+ `tests/convex/restock-math.test.ts`); `convex/restock.ts` (+ `tests/convex/restock.test.ts`); `src/lib/whatsapp.ts` (+ `src/lib/whatsapp.test.ts`).
**Modified:** `convex/schema.ts` (suppliers table), `convex/_generated/*`, `convex/forecast.ts` (use `computeDemand`), `src/routes/_pos/forecast.tsx` (restock panel), `src/components/app-shared.tsx` (nav), Lingui catalogs, `tests/e2e/sale.spec.ts`.

---

## Task 1: `normalizePhone` pure helper

**Files:** Create `convex/lib/phone.ts`, `tests/convex/phone.test.ts`.

- [ ] **Step 1: Write the failing tests** — create `tests/convex/phone.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { normalizePhone } from '../../convex/lib/phone';

describe('normalizePhone', () => {
  it('leading 0 → 62', () => {
    expect(normalizePhone('0812-3456-7890')).toBe('6281234567890');
  });
  it('+62 with spaces/dashes → digits', () => {
    expect(normalizePhone('+62 812 3456 7890')).toBe('6281234567890');
  });
  it('already 62 is kept', () => {
    expect(normalizePhone('6281234567890')).toBe('6281234567890');
  });
  it('bare local (no 0/62) keeps digits', () => {
    expect(normalizePhone('81234567890')).toBe('81234567890');
  });
  it('strips all non-digits', () => {
    expect(normalizePhone('(0812) 345.678')).toBe('62812345678');
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm test -- tests/convex/phone.test.ts` → FAIL (`../../convex/lib/phone` missing).

- [ ] **Step 3: Implement** — create `convex/lib/phone.ts`:
```ts
/** Normalize an Indonesian phone to a wa.me-friendly digit string.
 *  Leading 0 → 62; an existing 62 prefix is kept; otherwise digits as-is. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  return digits;
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm test -- tests/convex/phone.test.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add convex/lib/phone.ts tests/convex/phone.test.ts
git commit -m "feat(suppliers): add normalizePhone helper"
```

---

## Task 2: `suppliers` table + codegen

**Files:** Modify `convex/schema.ts`; `convex/_generated/*`.

- [ ] **Step 1: Add the table** — in `convex/schema.ts`, near `promotions`, add:
```ts
  suppliers: defineTable({
    cafeId: v.id('cafes'),
    name: v.string(),
    phone: v.string(),
    archived: v.boolean(),
    createdAt: v.number(),
  }).index('by_cafe_active', ['cafeId', 'archived']),
```

- [ ] **Step 2: Codegen** — `./node_modules/.bin/convex codegen`. `git status` shows `convex/_generated/*` + schema.ts.

- [ ] **Step 3: Typecheck** — `pnpm typecheck` → clean.

- [ ] **Step 4: Commit**
```bash
git add convex/schema.ts convex/_generated
git commit -m "feat(suppliers): add suppliers table"
```

---

## Task 3: `convex/suppliers.ts` CRUD

**Files:** Create `convex/suppliers.ts`, `tests/convex/suppliers.test.ts`.

- [ ] **Step 1: Write the failing tests** — create `tests/convex/suppliers.test.ts`:
```ts
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setupOwner(t: ReturnType<typeof convexTest>, email = 'o@x.com') {
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email }));
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  return { asOwner };
}

describe('suppliers CRUD', () => {
  it('creates + lists (sorted, non-archived by default)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await asOwner.mutation(api.suppliers.create, { name: 'Sumber Susu', phone: '0812-1' });
    await asOwner.mutation(api.suppliers.create, { name: 'Aneka Kopi', phone: '0813-2' });
    const list = await asOwner.query(api.suppliers.list, {});
    expect(list).toHaveLength(2);
    expect(list[0]?.name).toBe('Aneka Kopi'); // id-ID sort
  });

  it('update + archive hides from default list', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.suppliers.create, { name: 'X', phone: '0812000000' });
    await asOwner.mutation(api.suppliers.update, { id, name: 'X2', phone: '0813000000' });
    expect((await asOwner.query(api.suppliers.list, {}))[0]?.name).toBe('X2');
    await asOwner.mutation(api.suppliers.archive, { id });
    expect(await asOwner.query(api.suppliers.list, {})).toHaveLength(0);
    expect(await asOwner.query(api.suppliers.list, { includeArchived: true })).toHaveLength(1);
  });

  it('validates name + phone', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await expect(asOwner.mutation(api.suppliers.create, { name: '  ', phone: '0812000000' })).rejects.toThrow(/nama/i);
    await expect(asOwner.mutation(api.suppliers.create, { name: 'OK', phone: '12' })).rejects.toThrow(/telepon/i);
  });

  it('tenant isolation: cafe B cannot archive cafe A supplier', async () => {
    const t = convexTest(schema, modules);
    const a = await setupOwner(t, 'a@x.com');
    const aId = await a.asOwner.mutation(api.suppliers.create, { name: 'A', phone: '0812000000' });
    const b = await setupOwner(t, 'b@x.com');
    expect(await b.asOwner.query(api.suppliers.list, { includeArchived: true })).toHaveLength(0);
    await expect(b.asOwner.mutation(api.suppliers.archive, { id: aId })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm test -- tests/convex/suppliers.test.ts` → FAIL (`api.suppliers` missing).

- [ ] **Step 3: Implement** — create `convex/suppliers.ts`:
```ts
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwned, requireOwnerCafe } from './lib/auth';
import { normalizePhone } from './lib/phone';

const supplierDoc = v.object({
  _id: v.id('suppliers'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  name: v.string(),
  phone: v.string(),
  archived: v.boolean(),
  createdAt: v.number(),
});

function assertSupplier(name: string, phone: string): { name: string; phone: string } {
  const trimmedName = name.trim();
  if (trimmedName.length < 1) throw new Error('Nama pemasok wajib diisi.');
  if (trimmedName.length > 60) throw new Error('Nama pemasok maksimal 60 karakter.');
  const trimmedPhone = phone.trim();
  if (normalizePhone(trimmedPhone).length < 8) throw new Error('Nomor telepon tidak valid.');
  return { name: trimmedName, phone: trimmedPhone };
}

export const list = query({
  args: { includeArchived: v.optional(v.boolean()) },
  returns: v.array(supplierDoc),
  handler: async (ctx, { includeArchived = false }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const rows = await ctx.db
      .query('suppliers')
      .withIndex('by_cafe_active', (q) =>
        includeArchived ? q.eq('cafeId', cafeId) : q.eq('cafeId', cafeId).eq('archived', false)
      )
      .collect();
    return rows.sort((a, b) => a.name.localeCompare(b.name, 'id-ID'));
  },
});

export const create = mutation({
  args: { name: v.string(), phone: v.string() },
  returns: v.id('suppliers'),
  handler: async (ctx, { name, phone }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const clean = assertSupplier(name, phone);
    return await ctx.db.insert('suppliers', {
      cafeId,
      name: clean.name,
      phone: clean.phone,
      archived: false,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: { id: v.id('suppliers'), name: v.string(), phone: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, name, phone }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, id, 'Pemasok');
    const clean = assertSupplier(name, phone);
    await ctx.db.patch(id, { name: clean.name, phone: clean.phone });
    return null;
  },
});

export const archive = mutation({
  args: { id: v.id('suppliers') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, id, 'Pemasok');
    await ctx.db.patch(id, { archived: true });
    return null;
  },
});
```

- [ ] **Step 4: Run to verify pass + codegen + typecheck** — `./node_modules/.bin/convex codegen && pnpm test -- tests/convex/suppliers.test.ts && pnpm typecheck` → pass; commit drift.

- [ ] **Step 5: Commit**
```bash
git add convex/suppliers.ts tests/convex/suppliers.test.ts convex/_generated
git commit -m "feat(suppliers): add suppliers CRUD"
```

---

## Task 4: `SupplierFormDialog`

**Files:** Create `src/components/supplier/supplier-form-dialog.tsx`.

- [ ] **Step 1: Create the component**:
```tsx
import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Doc } from 'convex/_generated/dataModel';
import { useMutation } from 'convex/react';
import { type FormEvent, useEffect, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { toast } from '~/lib/toast';

export function SupplierFormDialog({
  open,
  supplier,
  onOpenChange,
}: {
  open: boolean;
  supplier: Doc<'suppliers'> | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const isEdit = supplier !== null;
  const create = useMutation(api.suppliers.create);
  const update = useMutation(api.suppliers.update);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(supplier?.name ?? '');
      setPhone(supplier?.phone ?? '');
      setError(null);
    }
  }, [open, supplier]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (isEdit && supplier) {
        await update({ id: supplier._id, name, phone });
        toast.success(t`Pemasok diperbarui.`);
      } else {
        await create({ name, phone });
        toast.success(t`Pemasok ditambahkan.`);
      }
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t`Gagal menyimpan pemasok.`;
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
          <DialogTitle>{isEdit ? <Trans>Ubah pemasok</Trans> : <Trans>Tambah pemasok</Trans>}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="supplier-name"><Trans>Nama pemasok</Trans></FieldLabel>
              <Input id="supplier-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoFocus />
            </Field>
            <Field>
              <FieldLabel htmlFor="supplier-phone"><Trans>Telepon</Trans></FieldLabel>
              <Input id="supplier-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </Field>
            {error && <FieldError>{error}</FieldError>}
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}><Trans>Batal</Trans></Button>
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

- [ ] **Step 2: Typecheck + commit** — `pnpm typecheck` (clean).
```bash
git add src/components/supplier/supplier-form-dialog.tsx
git commit -m "feat(suppliers): add SupplierFormDialog"
```

---

## Task 5: `/suppliers` admin page + nav

**Files:** Create `src/routes/_pos/suppliers.tsx`; Modify `src/components/app-shared.tsx`.

- [ ] **Step 1: Create the page**:
```tsx
import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from 'convex/_generated/api';
import type { Doc } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { Archive, Pencil, Plus, Truck } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { SupplierFormDialog } from '~/components/supplier/supplier-form-dialog';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { DataTable } from '~/components/ui/data-table';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '~/components/ui/empty';
import { PageHeader } from '~/components/ui/page-header';
import { RowActions } from '~/components/ui/row-actions';
import { StatusBadge } from '~/components/ui/status-badge';
import { Toolbar } from '~/components/ui/toolbar';
import { toast } from '~/lib/toast';

export const Route = createFileRoute('/_pos/suppliers')({ component: SuppliersPage });

type Supplier = Doc<'suppliers'>;
type Filter = 'active' | 'archived';

function SuppliersPage() {
  const { t } = useLingui();
  const [filter, setFilter] = useState<Filter>('active');
  const [formOpen, setFormOpen] = useState(false);
  const [formSupplier, setFormSupplier] = useState<Supplier | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Supplier | null>(null);

  const suppliers = useQuery(api.suppliers.list, { includeArchived: true });
  const archive = useMutation(api.suppliers.archive);

  const counts = useMemo(() => {
    if (!suppliers) return undefined;
    return {
      active: suppliers.filter((s) => !s.archived).length,
      archived: suppliers.filter((s) => s.archived).length,
    };
  }, [suppliers]);

  const visible = useMemo<Supplier[] | undefined>(() => {
    if (!suppliers) return undefined;
    return suppliers.filter((s) => (filter === 'archived' ? s.archived : !s.archived));
  }, [suppliers, filter]);

  function openCreate() {
    setFormSupplier(null);
    setFormOpen(true);
  }
  const openEdit = useCallback((s: Supplier) => {
    setFormSupplier(s);
    setFormOpen(true);
  }, []);

  const columns = useMemo<ColumnDef<Supplier, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: () => <Trans>Nama</Trans>,
        cell: ({ row }) =>
          row.original.archived ? (
            <span className="font-medium">{row.original.name}</span>
          ) : (
            <button type="button" className="text-left font-medium hover:underline" onClick={() => openEdit(row.original)}>
              {row.original.name}
            </button>
          ),
      },
      { accessorKey: 'phone', enableSorting: false, header: () => <Trans>Telepon</Trans>, cell: ({ row }) => <span className="tabular-nums">{row.original.phone}</span> },
      {
        id: 'status',
        enableSorting: false,
        header: () => <Trans>Status</Trans>,
        cell: ({ row }) =>
          row.original.archived ? <StatusBadge variant="muted"><Trans>Arsip</Trans></StatusBadge> : <StatusBadge variant="success"><Trans>Aktif</Trans></StatusBadge>,
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
                  { label: <Trans>Ubah</Trans>, icon: <Pencil />, onSelect: () => openEdit(row.original) },
                  { label: <Trans>Arsipkan</Trans>, icon: <Archive />, destructive: true, separatorBefore: true, onSelect: () => setArchiveTarget(row.original) },
                ]}
              />
            </div>
          ),
      },
    ],
    [t, openEdit]
  );

  const emptyState = (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon"><Truck /></EmptyMedia>
        <EmptyTitle>{filter === 'archived' ? <Trans>Tidak ada pemasok diarsipkan.</Trans> : <Trans>Belum ada pemasok.</Trans>}</EmptyTitle>
        {filter === 'active' ? <EmptyDescription><Trans>Tambah pemasok untuk mengirim daftar belanja.</Trans></EmptyDescription> : null}
      </EmptyHeader>
    </Empty>
  );

  return (
    <main className="p-6">
      <PageHeader
        title={<Trans>Pemasok</Trans>}
        meta={counts ? <Trans>{counts.active} pemasok aktif</Trans> : null}
        actions={<Button type="button" onClick={openCreate}><Plus /><Trans>Tambah Pemasok</Trans></Button>}
      />
      <Toolbar
        active={filter}
        onFilter={(v) => setFilter(v as Filter)}
        filters={[
          { label: <Trans>Aktif</Trans>, value: 'active', ...(counts !== undefined ? { count: counts.active } : {}) },
          { label: <Trans>Arsip</Trans>, value: 'archived', ...(counts !== undefined ? { count: counts.archived } : {}) },
        ]}
      />
      <DataTable columns={columns} data={visible} emptyState={emptyState} initialSort={[{ id: 'name', desc: false }]} />
      <SupplierFormDialog
        open={formOpen}
        supplier={formSupplier}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setFormSupplier(null);
        }}
      />
      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(o) => {
          if (!o) setArchiveTarget(null);
        }}
        title={<Trans>Arsipkan pemasok?</Trans>}
        description={archiveTarget ? <Trans>"{archiveTarget.name}" tidak akan muncul di pilihan pemasok.</Trans> : undefined}
        confirmLabel={<Trans>Arsipkan</Trans>}
        destructive
        onConfirm={async () => {
          if (!archiveTarget) return;
          try {
            await archive({ id: archiveTarget._id });
            toast.success(t`Pemasok diarsipkan.`);
          } catch (err) {
            const message = err instanceof Error ? err.message : t`Gagal mengarsipkan pemasok.`;
            toast.error(message);
            throw err;
          }
        }}
      />
    </main>
  );
}
```

- [ ] **Step 2: Add the nav entry** — in `src/components/app-shared.tsx`, add `Truck` to the `lucide-react` import (alphabetical), and add to the **Inventaris** group's `subItems` (after Pembelian):
```tsx
					{ title: msg`Pemasok`, path: "/suppliers" },
```

- [ ] **Step 3: Typecheck + commit** — `pnpm typecheck` (clean; route tree regenerates).
```bash
git add src/routes/_pos/suppliers.tsx src/components/app-shared.tsx src/routeTree.gen.ts
git commit -m "feat(suppliers): build /suppliers admin page + nav"
```
(If `src/routeTree.gen.ts` wasn't auto-regenerated, run `pnpm typecheck` once more or the dev/build step; include it in the commit.)

---

## Task 6: Extract `computeDemand` (shared forecast compute)

**Files:** Create `convex/lib/demand.ts`; Modify `convex/forecast.ts`.

- [ ] **Step 1: Create `convex/lib/demand.ts`** — move the body of `forecast.demand`'s handler here as a reusable function (behavior identical):
```ts
import type { QueryCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { DAY_MS, addDaysToKey, dayKeyFn, dowOfKey, startOfLocalDay, tzFor, utcOfDayKey } from './time';
import {
  type Confidence,
  type DaySample,
  type Driver,
  baseEstimate,
  coeffOfVariation,
  confidence,
  dayOfWeekMultiplier,
  driversFor,
  holidayMultiplier,
  predictedQty,
  weatherMultiplier,
} from './forecast';

export type DemandLine = {
  menuItemId: Id<'menuItems'>;
  name: string;
  tomorrowQty: number;
  sevenDayQty: number;
  confidence: Confidence;
  drivers: Driver[];
};

export type DemandResult =
  | { status: 'learning'; daysCollected: number; daysNeeded: number; etaDateKey: string }
  | { status: 'ready'; forDateKey: string; lines: DemandLine[] };

/** Live per-item 7-day forecast over the trailing 56 days of paid orders. */
export async function computeDemand(ctx: QueryCtx, cafeId: Id<'cafes'>): Promise<DemandResult> {
  const tz = await tzFor(ctx, cafeId);
  const now = Date.now();
  const windowStart = startOfLocalDay(tz, 55, now);
  const rows = await ctx.db
    .query('orders')
    .withIndex('by_cafe_created', (q) => q.eq('cafeId', cafeId).gte('createdAtClient', windowStart))
    .collect();
  const paid = rows.filter((o) => o.paymentStatus === 'paid');

  const keyOf = dayKeyFn(tz);
  const todayKey = keyOf(now);
  const todayUtc = utcOfDayKey(todayKey);
  const daysAgoOf = (dk: string) => Math.round((todayUtc - utcOfDayKey(dk)) / DAY_MS);

  const activeKeys = new Set<string>();
  type Item = { name: string; byDay: Map<string, number> };
  const items = new Map<string, Item>();
  for (const o of paid) {
    const dk = keyOf(o.createdAtClient);
    activeKeys.add(dk);
    for (const l of o.lines) {
      const id = l.menuItemId as string;
      let it = items.get(id);
      if (!it) {
        it = { name: l.nameSnapshot, byDay: new Map() };
        items.set(id, it);
      }
      it.name = l.nameSnapshot;
      it.byDay.set(dk, (it.byDay.get(dk) ?? 0) + l.qty);
    }
  }

  const daysCollected = activeKeys.size;
  if (daysCollected < 14) {
    const firstKey = [...activeKeys].sort()[0] ?? todayKey;
    return { status: 'learning', daysCollected, daysNeeded: 14, etaDateKey: addDaysToKey(firstKey, 14) };
  }

  const axis = [...activeKeys]
    .map((dk) => ({ dk, daysAgo: daysAgoOf(dk), dow: dowOfKey(dk) }))
    .sort((a, b) => a.daysAgo - b.daysAgo);
  const futureKeys = Array.from({ length: 7 }, (_, i) => keyOf(now + (i + 1) * DAY_MS));
  const tomorrowKey = futureKeys[0]!;

  const lines: DemandLine[] = [];
  for (const [id, it] of items) {
    const samples: DaySample[] = axis.map((a) => ({ daysAgo: a.daysAgo, dow: a.dow, qty: it.byDay.get(a.dk) ?? 0 }));
    const base = baseEstimate(samples);
    const soldDaysAgo = axis.filter((a) => (it.byDay.get(a.dk) ?? 0) > 0).map((a) => a.daysAgo);
    const firstSaleDaysAgo = soldDaysAgo.length ? Math.max(...soldDaysAgo) : 0;
    const spanQtys = samples.filter((s) => s.daysAgo <= firstSaleDaysAgo).map((s) => s.qty);
    const conf = confidence(spanQtys.length, coeffOfVariation(spanQtys));
    const dayQty = (dk: string) =>
      predictedQty(base, dayOfWeekMultiplier(samples, dowOfKey(dk)), weatherMultiplier(), holidayMultiplier(dk).mult);
    const tomorrowQty = dayQty(tomorrowKey);
    const sevenDayQty = futureKeys.reduce((s, dk) => s + dayQty(dk), 0);
    const tomorrowHoliday = holidayMultiplier(tomorrowKey).driver;
    const drivers: Driver[] = driversFor({
      dowMult: dayOfWeekMultiplier(samples, dowOfKey(tomorrowKey)),
      dow: dowOfKey(tomorrowKey),
      ...(tomorrowHoliday ? { holiday: tomorrowHoliday } : {}),
    });
    lines.push({ menuItemId: id as unknown as Id<'menuItems'>, name: it.name, tomorrowQty, sevenDayQty, confidence: conf, drivers });
  }
  lines.sort((a, b) => b.tomorrowQty - a.tomorrowQty || a.name.localeCompare(b.name, 'id-ID'));
  return { status: 'ready', forDateKey: tomorrowKey, lines };
}
```

- [ ] **Step 2: Refactor `convex/forecast.ts`** — replace the whole handler body + the now-unused engine/time imports. The file becomes:
```ts
import { v } from 'convex/values';
import { query } from './_generated/server';
import { requireOwnerCafe } from './lib/auth';
import { computeDemand } from './lib/demand';

const confidenceV = v.union(v.literal('low'), v.literal('med'), v.literal('high'));
const driverV = v.union(
  v.object({ code: v.union(v.literal('dow_busy'), v.literal('dow_quiet')), pct: v.number(), dow: v.number() }),
  v.object({ code: v.literal('holiday'), pct: v.number(), key: v.string() })
);

export const demand = query({
  args: {},
  returns: v.union(
    v.object({ status: v.literal('learning'), daysCollected: v.number(), daysNeeded: v.number(), etaDateKey: v.string() }),
    v.object({
      status: v.literal('ready'),
      forDateKey: v.string(),
      lines: v.array(
        v.object({
          menuItemId: v.id('menuItems'),
          name: v.string(),
          tomorrowQty: v.number(),
          sevenDayQty: v.number(),
          confidence: confidenceV,
          drivers: v.array(driverV),
        })
      ),
    })
  ),
  handler: async (ctx, _args) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    return await computeDemand(ctx, cafeId);
  },
});
```

- [ ] **Step 3: Run to verify pass + codegen + typecheck** — `./node_modules/.bin/convex codegen && pnpm test -- tests/convex/forecast.test.ts && pnpm typecheck`. The existing forecast tests must stay green (behavior unchanged). Commit drift if any.

- [ ] **Step 4: Commit**
```bash
git add convex/lib/demand.ts convex/forecast.ts convex/_generated
git commit -m "refactor(forecast): extract computeDemand for reuse by restock"
```

---

## Task 7: `suggestRestock` pure helper

**Files:** Create `convex/lib/restock.ts`, `tests/convex/restock-math.test.ts`.

- [ ] **Step 1: Write the failing tests** — create `tests/convex/restock-math.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { suggestRestock } from '../../convex/lib/restock';

describe('suggestRestock', () => {
  it('orders the shortfall plus safety stock, rounded up', () => {
    // required 700, stock 100, reorder 0 → safety = max(0, 100) = 100; 700-100+100=700
    expect(suggestRestock(700, 100, 0)).toBe(700);
  });
  it('reorderThreshold dominates safety stock when larger', () => {
    // required 70, stock 0, reorder 50 → safety = max(50, 10) = 50; 70-0+50=120
    expect(suggestRestock(70, 0, 50)).toBe(120);
  });
  it('per-day demand dominates when larger than reorder', () => {
    // required 700, stock 0, reorder 10 → safety = max(10, 100) = 100; 700+100=800
    expect(suggestRestock(700, 0, 10)).toBe(800);
  });
  it('fully stocked → 0', () => {
    // required 70, stock 1000, reorder 0 → safety 10; 70-1000+10 <0 → 0
    expect(suggestRestock(70, 1000, 0)).toBe(0);
  });
  it('rounds up to a whole unit', () => {
    expect(suggestRestock(10.2, 0, 0)).toBe(Math.ceil(10.2 + 10.2 / 7));
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm test -- tests/convex/restock-math.test.ts` → FAIL.

- [ ] **Step 3: Implement** — create `convex/lib/restock.ts`:
```ts
/** Units to buy for one ingredient: shortfall vs stock plus safety stock, rounded up.
 *  safetyStock = max(reorderThreshold, ~1 day of demand = required/7). */
export function suggestRestock(required: number, currentStock: number, reorderThreshold: number): number {
  const safetyStock = Math.max(reorderThreshold, required / 7);
  return Math.ceil(Math.max(0, required - currentStock + safetyStock));
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm test -- tests/convex/restock-math.test.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add convex/lib/restock.ts tests/convex/restock-math.test.ts
git commit -m "feat(restock): add suggestRestock pure helper"
```

---

## Task 8: `restock.suggestion` query

**Files:** Create `convex/restock.ts`, `tests/convex/restock.test.ts`.

- [ ] **Step 1: Write the failing tests** — create `tests/convex/restock.test.ts`:
```ts
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');
const TZ = 'Asia/Jakarta';
const DAY = 86_400_000;

type Refs = {
  asOwner: ReturnType<ReturnType<typeof convexTest>['withIdentity']>;
  cafeId: Id<'cafes'>;
  cashierId: Id<'cafeStaff'>;
  shiftId: Id<'shifts'>;
  itemKopi: Id<'menuItems'>;
  ingSusu: Id<'ingredients'>;
};

async function setup(t: ReturnType<typeof convexTest>, email = 'o@x.com'): Promise<Refs> {
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email }));
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  await asOwner.mutation(api.cafes.updateProfile, { name: 'Kopi Senja', timezone: TZ, taxRatePct: 0, taxEnabled: false });
  const cafe = await asOwner.query(api.cafes.myCafe, {});
  const cafeId = cafe!._id as Id<'cafes'>;
  const cashierId = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
  const shiftId = await asOwner.mutation(api.shifts.open, { cashierId, openingFloatIDR: 100000 });
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Minuman' });
  const itemKopi = await asOwner.mutation(api.menu.items.create, { categoryId, name: 'Kopi', priceIDR: 15000 });
  const ingSusu = await asOwner.mutation(api.ingredients.create, { name: 'Susu', canonicalUnit: 'ml', reorderThreshold: 0, lastCostPerUnitIDR: 100 });
  await asOwner.mutation(api.recipes.upsert, { menuItemId: itemKopi, lines: [{ ingredientId: ingSusu, qty: 50, wastageFactor: 1 }] });
  return { asOwner, cafeId, cashierId, shiftId, itemKopi, ingSusu };
}

async function seedSales(t: ReturnType<typeof convexTest>, refs: Refs, days: number, nowMs: number) {
  for (let d = 1; d <= days; d++) {
    const at = nowMs - d * DAY;
    await t.run((ctx) =>
      ctx.db.insert('orders', {
        cafeId: refs.cafeId, shiftId: refs.shiftId, cashierId: refs.cashierId,
        clientId: `c-${d}`,
        lines: [{ menuItemId: refs.itemKopi, nameSnapshot: 'Kopi', qty: 10, unitPriceIDR: 15000, modifiersSnapshot: [], lineTotalIDR: 150000 }],
        subtotalIDR: 150000, taxRatePct: 0, taxIDR: 0, discountIDR: 0, totalIDR: 150000,
        paymentMethod: 'cash', paymentStatus: 'paid', createdAtClient: at, syncedAt: at,
      })
    );
  }
}

describe('restock.suggestion', () => {
  it('cold-start (<14 active days) → learning', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await seedSales(t, refs, 5, Date.now());
    const r = await refs.asOwner.query(api.restock.suggestion, {});
    expect(r.status).toBe('learning');
  });

  it('ready → suggests the recipe ingredient with qty > 0', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await seedSales(t, refs, 20, Date.now());
    const r = await refs.asOwner.query(api.restock.suggestion, {});
    expect(r.status).toBe('ready');
    if (r.status === 'ready') {
      const susu = r.lines.find((l) => l.name === 'Susu');
      expect(susu).toBeDefined();
      expect(susu!.unit).toBe('ml');
      expect(susu!.suggestedQty).toBeGreaterThan(0);
      expect(susu!.currentStockQty).toBe(0);
    }
  });

  it('omits a fully-stocked ingredient', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await seedSales(t, refs, 20, Date.now());
    // huge stock movement → suggestedQty clamps to 0 → omitted
    const now = Date.now();
    await t.run((ctx) =>
      ctx.db.insert('inventoryMovements', {
        cafeId: refs.cafeId, ingredientId: refs.ingSusu, delta: 1_000_000, reason: 'adjustment', at: now,
      })
    );
    const r = await refs.asOwner.query(api.restock.suggestion, {});
    expect(r.status).toBe('ready');
    if (r.status === 'ready') {
      expect(r.lines.find((l) => l.name === 'Susu')).toBeUndefined();
    }
  });

  it('tenant isolation: cafe B sees learning (no data)', async () => {
    const t = convexTest(schema, modules);
    const a = await setup(t, 'a@x.com');
    await seedSales(t, a, 20, Date.now());
    const b = await setup(t, 'b@x.com');
    const rb = await b.asOwner.query(api.restock.suggestion, {});
    expect(rb.status).toBe('learning');
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm test -- tests/convex/restock.test.ts` → FAIL (`api.restock` missing).

- [ ] **Step 3: Implement** — create `convex/restock.ts`:
```ts
import { v } from 'convex/values';
import { query } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { requireOwnerCafe } from './lib/auth';
import { computeDemand } from './lib/demand';
import { currentStockQty } from './lib/inventory';
import { suggestRestock } from './lib/restock';

export const suggestion = query({
  args: {},
  returns: v.union(
    v.object({ status: v.literal('learning'), daysCollected: v.number(), daysNeeded: v.number(), etaDateKey: v.string() }),
    v.object({
      status: v.literal('ready'),
      lines: v.array(
        v.object({
          ingredientId: v.id('ingredients'),
          name: v.string(),
          unit: v.union(v.literal('g'), v.literal('ml'), v.literal('piece')),
          suggestedQty: v.number(),
          currentStockQty: v.number(),
        })
      ),
    })
  ),
  handler: async (ctx, _args) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const demand = await computeDemand(ctx, cafeId);
    if (demand.status === 'learning') return demand;

    const required = new Map<string, number>();
    for (const line of demand.lines) {
      const recipe = await ctx.db
        .query('recipes')
        .withIndex('by_cafe_item', (q) => q.eq('cafeId', cafeId).eq('menuItemId', line.menuItemId))
        .unique();
      if (!recipe) continue;
      for (const rl of recipe.lines) {
        const id = rl.ingredientId as string;
        required.set(id, (required.get(id) ?? 0) + line.sevenDayQty * rl.qty * rl.wastageFactor);
      }
    }

    const lines = [];
    for (const [idStr, req] of required) {
      const ing = await ctx.db.get(idStr as unknown as Id<'ingredients'>);
      if (!ing || ing.cafeId !== cafeId || ing.archived) continue;
      const stock = await currentStockQty(ctx, cafeId, ing._id);
      const suggestedQty = suggestRestock(req, stock, ing.reorderThreshold);
      if (suggestedQty > 0) {
        lines.push({ ingredientId: ing._id, name: ing.name, unit: ing.canonicalUnit, suggestedQty, currentStockQty: stock });
      }
    }
    lines.sort((a, b) => a.name.localeCompare(b.name, 'id-ID'));
    return { status: 'ready' as const, lines };
  },
});
```

- [ ] **Step 4: Run to verify pass + codegen + typecheck** — `./node_modules/.bin/convex codegen && pnpm test -- tests/convex/restock.test.ts && pnpm typecheck` → pass; commit drift.

- [ ] **Step 5: Commit**
```bash
git add convex/restock.ts tests/convex/restock.test.ts convex/_generated
git commit -m "feat(restock): add restock.suggestion query"
```

---

## Task 9: WhatsApp helpers

**Files:** Create `src/lib/whatsapp.ts`, `src/lib/whatsapp.test.ts`.

- [ ] **Step 1: Write the failing tests** — create `src/lib/whatsapp.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { formatRestockText, waUrl } from './whatsapp';

describe('formatRestockText', () => {
  it('formats a Bahasa shopping list', () => {
    const text = formatRestockText('Kopi Senja', [
      { name: 'Susu', qty: 4, unit: 'ml' },
      { name: 'Biji kopi', qty: 3, unit: 'g' },
    ]);
    expect(text).toBe('Daftar Belanja — Kopi Senja\n- Susu: 4 ml\n- Biji kopi: 3 g');
  });
});

describe('waUrl', () => {
  it('normalizes the phone and encodes the text', () => {
    expect(waUrl('0812-345', 'Halo dunia')).toBe('https://wa.me/62812345?text=Halo%20dunia');
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm test -- src/lib/whatsapp.test.ts` → FAIL.

- [ ] **Step 3: Implement** — create `src/lib/whatsapp.ts`:
```ts
import { normalizePhone } from 'convex/lib/phone';

/** Plain-text Bahasa shopping list for a WhatsApp message. */
export function formatRestockText(
  cafeName: string,
  lines: Array<{ name: string; qty: number; unit: string }>
): string {
  const header = `Daftar Belanja — ${cafeName}`;
  const body = lines.map((l) => `- ${l.name}: ${l.qty} ${l.unit}`).join('\n');
  return body ? `${header}\n${body}` : header;
}

/** wa.me deep link with a normalized phone + url-encoded text. */
export function waUrl(phone: string, text: string): string {
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(text)}`;
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm test -- src/lib/whatsapp.test.ts && pnpm typecheck` → PASS; clean.

- [ ] **Step 5: Commit**
```bash
git add src/lib/whatsapp.ts src/lib/whatsapp.test.ts
git commit -m "feat(restock): add WhatsApp url + list formatting helpers"
```

---

## Task 10: Daftar Belanja panel on `/forecast`

**Files:** Modify `src/routes/_pos/forecast.tsx`.

- [ ] **Step 1: Add the restock panel** — in `src/routes/_pos/forecast.tsx`:

a. Add imports:
```tsx
import { useMemo, useState } from 'react'; // ensure useMemo + useState imported
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '~/components/ui/select';
import { Input } from '~/components/ui/input';
import { DataTable } from '~/components/ui/data-table';
import type { ColumnDef } from '@tanstack/react-table';
import { waUrl, formatRestockText } from '~/lib/whatsapp';
```
(Merge with existing imports; the page already imports `Trans`, `Button`, `Empty*`, `Spinner`, `useQuery`, `api`.)

b. Add a `RestockPanel` component in the same file and render it inside `ForecastPage`'s `<main>` after the demand section:
```tsx
type RestockLine = { ingredientId: string; name: string; unit: string; suggestedQty: number; currentStockQty: number };

function RestockPanel() {
  const { t } = useLingui();
  const data = useQuery(api.restock.suggestion, {});
  const cafe = useQuery(api.cafes.myCafe, {});
  const suppliers = useQuery(api.suppliers.list, {});
  const [supplierId, setSupplierId] = useState<string>('');
  const [edits, setEdits] = useState<Map<string, number>>(new Map());

  const lines = data?.status === 'ready' ? data.lines : [];
  const qtyOf = (l: RestockLine) => edits.get(l.ingredientId) ?? l.suggestedQty;

  const columns = useMemo<ColumnDef<RestockLine, unknown>[]>(
    () => [
      { accessorKey: 'name', header: () => <Trans>Bahan</Trans> },
      {
        id: 'suggested',
        header: () => <Trans>Saran</Trans>,
        cell: ({ row }) => (
          <Input
            type="number"
            min="0"
            className="h-8 w-20 text-right tabular-nums"
            value={qtyOf(row.original)}
            onChange={(e) => {
              const n = Math.max(0, Number(e.target.value));
              setEdits((m) => new Map(m).set(row.original.ingredientId, n));
            }}
          />
        ),
      },
      { id: 'unit', header: () => <Trans>Satuan</Trans>, cell: ({ row }) => <span>{row.original.unit}</span> },
      {
        accessorKey: 'currentStockQty',
        header: () => <Trans>Stok kini</Trans>,
        cell: ({ row }) => <span className="tabular-nums">{row.original.currentStockQty}</span>,
      },
    ],
    [edits]
  );

  function onSend() {
    const supplier = suppliers?.find((s) => s._id === supplierId);
    if (!supplier) return;
    const text = formatRestockText(
      cafe?.name ?? '',
      lines.map((l) => ({ name: l.name, qty: qtyOf(l), unit: l.unit }))
    );
    window.open(waUrl(supplier.phone, text), '_blank', 'noopener');
  }

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold"><Trans>Daftar Belanja</Trans></h2>
      {data === undefined ? (
        <div className="mt-4 flex items-center justify-center py-8 text-muted-foreground"><Spinner /></div>
      ) : data.status === 'learning' ? (
        <p className="mt-2 text-sm text-muted-foreground"><Trans>Daftar belanja akan muncul setelah perkiraan aktif.</Trans></p>
      ) : lines.length === 0 ? (
        <Empty className="mt-4">
          <EmptyHeader>
            <EmptyMedia variant="icon"><TrendingUp /></EmptyMedia>
            <EmptyTitle><Trans>Stok cukup untuk minggu ini.</Trans></EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="mt-4 space-y-4">
          <DataTable columns={columns} data={lines as RestockLine[]} emptyState={null} initialSort={[{ id: 'name', desc: false }]} />
          <div className="flex flex-wrap items-center gap-2">
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger className="w-56"><SelectValue placeholder={t`Pilih pemasok`} /></SelectTrigger>
              <SelectContent>
                {(suppliers ?? []).map((s) => (
                  <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" disabled={!supplierId} onClick={onSend}><Trans>Kirim ke WhatsApp</Trans></Button>
          </div>
        </div>
      )}
    </section>
  );
}
```
c. Render `<RestockPanel />` inside `ForecastPage`'s returned `<main>`, after the demand block (it manages its own query/states, so it can sit at the bottom regardless of the demand status).

- [ ] **Step 2: Typecheck + commit** — `pnpm typecheck` (clean). Confirm `~/components/ui/select` exports `Select`/`SelectContent`/`SelectItem`/`SelectTrigger`/`SelectValue` (the PromoFormDialog uses them) and `api.cafes.myCafe` returns `{ name }`.
```bash
git add src/routes/_pos/forecast.tsx
git commit -m "feat(restock): add Daftar Belanja panel with supplier WhatsApp send"
```

---

## Task 11: i18n — extract, fill English, compile

**Files:** `src/locales/id/messages.po`, `src/locales/en/messages.po`

- [ ] **Step 1: Extract** — `pnpm lingui:extract`.

- [ ] **Step 2: Fill English** — in `src/locales/en/messages.po`, fill each NEW empty `msgstr ""`. Mapping (leave any already filled from other modules):
- `Pemasok` → `Suppliers`
- `Tambah Pemasok` → `Add Supplier`
- `Tambah pemasok` → `Add supplier`
- `Ubah pemasok` → `Edit supplier`
- `Nama pemasok` → `Supplier name`
- `Telepon` → `Phone`
- `{0} pemasok aktif` → `{0} active suppliers`
- `Pemasok ditambahkan.` → `Supplier added.`
- `Pemasok diperbarui.` → `Supplier updated.`
- `Pemasok diarsipkan.` → `Supplier archived.`
- `Gagal menyimpan pemasok.` → `Failed to save supplier.`
- `Gagal mengarsipkan pemasok.` → `Failed to archive supplier.`
- `Arsipkan pemasok?` → `Archive supplier?`
- `"{0}" tidak akan muncul di pilihan pemasok.` → `"{0}" will no longer appear in the supplier picker.`
- `Belum ada pemasok.` → `No suppliers yet.`
- `Tidak ada pemasok diarsipkan.` → `No archived suppliers.`
- `Tambah pemasok untuk mengirim daftar belanja.` → `Add a supplier to send shopping lists.`
- `Daftar Belanja` → `Shopping List`
- `Bahan` → `Ingredient`
- `Saran` → `Suggested`
- `Satuan` → `Unit`
- `Stok kini` → `Current stock`
- `Pilih pemasok` → `Choose a supplier`
- `Kirim ke WhatsApp` → `Send to WhatsApp`
- `Stok cukup untuk minggu ini.` → `Stock is sufficient for this week.`
- `Daftar belanja akan muncul setelah perkiraan aktif.` → `The shopping list appears once the forecast is active.`

For any other new empty `en` msgstr, translate sensibly and report it.

- [ ] **Step 3: Compile + typecheck** — `pnpm lingui:compile && pnpm typecheck` → succeed; `en` 0 missing.

- [ ] **Step 4: Commit**
```bash
git add src/locales/id/messages.po src/locales/en/messages.po
git commit -m "i18n(restock): extract + fill en for suppliers + restock"
```

---

## Task 12: Playwright smoke — create a supplier

**Files:** Modify `tests/e2e/sale.spec.ts`.

- [ ] **Step 1: Add the test** — append inside the `test.describe('sale (auth-gated)', …)` block:
```ts
  test('suppliers: create a supplier and see it listed', async ({ page }) => {
    const email = `e2e+supplier+${Date.now()}@kodapos.test`;
    const password = 'Sa{ngat-Aman-123';

    await gotoHydrated(page, '/signup');
    await page.getByLabel('Nama Anda').fill('E2E Supplier');
    await page.getByLabel('Nama kafe').fill('Kopi Supplier');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('textbox', { name: 'Password' }).fill(password);
    await page.getByRole('button', { name: /Daftar/ }).click();

    await waitForUrlHydrated(page, /\/onboarding\/profile$/, { timeout: 15_000 });
    await page.getByRole('button', { name: /Lanjut/ }).click();
    await waitForUrlHydrated(page, /\/onboarding\/menu$/);

    await page.goto('/suppliers');
    await waitForUrlHydrated(page, /\/suppliers$/);
    await page.getByRole('button', { name: /Tambah Pemasok/ }).click();
    await page.getByLabel('Nama pemasok').fill('Sumber Susu');
    await page.getByLabel('Telepon').fill('0812-3456-7890');
    await page.getByRole('button', { name: /^Simpan$/ }).click();
    await expect(page.getByText('Sumber Susu')).toBeVisible();
  });
```

- [ ] **Step 2: Typecheck the spec** — `pnpm typecheck` → clean.

- [ ] **Step 3: Attempt to run (auth-gated)** — `RUN_AUTH_E2E=1 pnpm exec playwright test tests/e2e/sale.spec.ts -g "suppliers:"`. If unavailable (no dev server), ACCEPTABLE — gated + skipped. Note whether it ran.

- [ ] **Step 4: Commit**
```bash
git add tests/e2e/sale.spec.ts
git commit -m "test(e2e): create a supplier on the /suppliers page"
```

---

## Task 13: Full local verification + integrate

**Files:** none

- [ ] **Step 1: Full gate** — `pnpm typecheck && pnpm test && pnpm lingui:compile`. Expected: typecheck clean; all tests pass (existing + phone + suppliers + restock-math + restock + whatsapp; forecast tests still green after the computeDemand extraction); compile clean.

- [ ] **Step 2: Lint** — `pnpm lint`. Expected: 0 errors (pre-existing warnings only).

- [ ] **Step 3: Confirm clean tree + no codegen drift** — `git status` → `./node_modules/.bin/convex codegen` → `git status`. Clean both times.

- [ ] **Step 4: Integrate (after user OK)** — per the trunk-based workflow, wait for go-ahead, then push `feat/restock-suppliers` and open a PR to `main`. Do not merge without approval; surface the squash-vs-merge tradeoff at merge time.

---

## Self-Review (performed against the spec)

**Spec coverage:**
- Suppliers table → Task 2; CRUD + `assertSupplier` (name + normalized-phone validation) → Task 3 (+tests); `SupplierFormDialog` → Task 4; `/suppliers` admin page + nav → Task 5; `normalizePhone` → Task 1.
- Shared `computeDemand` extraction (forecast + restock reuse one scan; forecast tests stay green) → Task 6; pure `suggestRestock` (safety = max(reorder, req/7), ceil, clamp) → Task 7 (+tests); `restock.suggestion` query (recipe × 7-day demand − stock, omit fully-stocked, learning passthrough, tenancy) → Task 8 (+tests).
- WhatsApp `waUrl`/`formatRestockText` → Task 9 (+tests); Daftar Belanja panel on /forecast (editable qty, supplier picker, send) → Task 10; i18n → Task 11; Playwright → Task 12; verification/integrate → Task 13.
- Out-of-scope respected: no PDF (B-PDF), no `restockSuggestions` persistence/status/history (Slice C), no per-ingredient suppliers.

**Placeholder scan:** none — full code in every step; commands state expected output.

**Type consistency:** `normalizePhone(raw): string` is used identically by `assertSupplier` (Task 3) and `waUrl` (Task 9). `DemandResult`/`DemandLine` (Task 6) match the forecast query's validator (unchanged) and are consumed by `restock.suggestion` via `line.sevenDayQty`/`line.menuItemId` (Task 8). `suggestRestock(required, currentStock, reorderThreshold)` signature matches its call in the restock query. The restock query's returned line shape `{ ingredientId, name, unit, suggestedQty, currentStockQty }` matches the `returns` validator and the panel's `RestockLine` type (Task 10). `currentStockQty(ctx, cafeId, ingredientId)` matches the helper. Suppliers CRUD args (`{name,phone}` / `{id,name,phone}`) match `SupplierFormDialog`'s mutation calls and the page.
