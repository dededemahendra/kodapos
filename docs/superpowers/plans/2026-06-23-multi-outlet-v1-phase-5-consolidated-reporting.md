# Multi-outlet v1 — Phase 5: Consolidated reporting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give an owner an "All outlets" consolidated view: combined KPI totals plus a per-outlet comparison, reusing the existing overview metric computation across every accessible outlet.

**Architecture:** Extract the per-cafe overview computation out of `reports.overview` into a `computeOverview(ctx, cafeId, range)` helper (behavior-preserving), then add `reports.businessOverview({ range })` that resolves the user's accessible outlets (via `resolveOutletAccess`), runs the helper per outlet, and returns per-outlet rows + combined totals. A new `/all-outlets` route renders a KPI summary + a per-outlet table, and the sidebar outlet switcher gains an "All outlets" entry (shown only for multi-outlet users) that navigates there.

**Tech Stack:** Convex (queries + a shared helper), convex-test + Vitest, React + TanStack Router, shadcn, Lingui i18n.

## Global Constraints

- **Convex function syntax:** new-style `query({ args, returns, handler })` with full `v.*` validators. Read `convex/_generated/ai/guidelines.md` before writing Convex code.
- **Auth:** `businessOverview` resolves accessible outlets with `resolveOutletAccess(ctx, userId)` (Phase 3, `convex/lib/auth.ts`) — owner: all business cafes; manager: their subset. Query-path code MUST NOT write.
- **Behavior preservation:** the `reports.overview` refactor must keep its existing return shape and values identical (it has existing tests/consumers).
- **Codegen:** after adding `businessOverview`, run `./node_modules/.bin/convex codegen` (NOT `npx`) and commit `convex/_generated/**`.
- **Quality gate before every commit:** `pnpm typecheck` and `pnpm test` must pass (currently 941 tests).
- **i18n (UI task):** copy authored in **Indonesian** via `<Trans>`/`` t`...` ``; after adding strings run `pnpm lingui:extract`, fill NON-empty English `msgstr` in `src/locales/en/messages.po`, then `pnpm lingui:compile`. **No em-dash (—) or `--`** in user-facing copy.
- **Money/number formatting:** use `formatIDR` and `formatCount` from `~/lib/formater` (do not hand-roll). Reuse `DashboardCard` (`~/components/ui/dashboard-card`) and the shadcn `Table` (`~/components/ui/table`) — match `src/components/stats.tsx` and `src/components/dashboard.tsx`.
- **Route tree:** `src/routeTree.gen.ts` is generated + tracked — after adding the route, regenerate (`pnpm build` or a brief `pnpm dev`) and commit it (CI fails if stale).
- **Test harness:** `convexTest(schema, modules)`; `t.withIdentity({ subject: \`${userId}|test_session\` })`; seed owners via `api.cafes.createForOwner`. Seed paid orders with `ctx.db.insert('orders', {...})`. See `tests/convex/reports.test.ts` for the orders-seeding shape.
- **Frontend has no component-test harness:** the UI task is verified by `pnpm typecheck`, the lingui cycle, and a manual visual gate.

---

### Task 1: `computeOverview` helper + `reports.businessOverview`

**Files:**
- Modify: `convex/reports.ts` (extract `computeOverview`; refactor `overview` to use it; add `businessOverview`)
- Test: `tests/convex/business-overview.test.ts` (create)

**Interfaces:**
- Consumes: `resolveOutletAccess` (Phase 3); `tzFor`, `resolveRange`, the `rangeArg` validator and `RangeArgs` type (existing in `convex/reports.ts` / `convex/lib/time.ts`).
- Produces:
  - `computeOverview(ctx, cafeId: Id<'cafes'>, range: RangeArgs): Promise<{ revenueIDR, refundsIDR, orders, aovIDR, itemsSold, fromKey, toKey }>` (module-local helper).
  - `api.reports.businessOverview({ range }): { outlets: Array<{ cafeId, name, revenueIDR, refundsIDR, orders, aovIDR, itemsSold }>, totals: { revenueIDR, refundsIDR, orders, aovIDR, itemsSold }, fromKey, toKey }` — per-outlet rows (sorted by name) + combined totals; combined AOV = `totals.orders === 0 ? 0 : round(totals.revenueIDR / totals.orders)`. Throws `'not authenticated'` / `'no outlet access'`.

- [ ] **Step 1: Write the failing tests**

**Critical seeding fact:** an `orders` row requires valid FK ids — `shiftId: Id<'shifts'>`, `cashierId: Id<'cafeStaff'>`, `menuItemId: Id<'menuItems'>` per line — which only exist after creating them via mutations. `tests/convex/reports.test.ts` already has the proven helpers `setup(t, email)` (creates owner + cafe + cashier + shift + menu item, returns `{ asOwner, cafeId, cashierId, shiftId, itemId }`) and `seedOrder(t, refs, { at, total, lines })` (inserts a valid PAID order). **Open `tests/convex/reports.test.ts` and copy its `wib`, `setup`, and `seedOrder` helpers verbatim into the new test file** — do not hand-write the orders shape (it has ~14 required fields). Those helpers seed against the active outlet, so:
- For a SECOND outlet of the same owner: create it with `await asOwner.mutation(api.outlets.createOutlet, { name })` — this switches the active outlet to the new cafe, so a subsequent `api.staff.create` / `api.shifts.open` / `api.menu.categories.create` / `api.menu.items.create` all target that new outlet. Build a fresh `Refs` for it (cafeId from `myCafe`, the new cashier/shift/item ids), then `seedOrder` for it. Use `api.outlets.setActiveOutlet({ cafeId })` to switch back when you need to seed the first outlet again. `businessOverview` (called as owner) resolves ALL outlets regardless of which is active, so active-outlet state at query time does not affect the result.
- Seed orders with `at` inside the queried window. Use a fixed `range: { from, to }` (e.g. `{ from: '2026-05-10', to: '2026-05-11' }`) and `at: wib(2026, 5, 10)` (matching the reports.test.ts pattern) rather than `preset: 'today'`, so the test is deterministic regardless of the run date.

Create `tests/convex/business-overview.test.ts` with the copied `wib`/`setup`/`seedOrder` helpers plus these test cases (assertions are the contract; adapt the seeding to the helper signatures):

```typescript
// (after copying wib, setup, seedOrder, modules, imports from reports.test.ts)
const RANGE = { from: '2026-05-10', to: '2026-05-11' } as const;

describe('businessOverview', () => {
  it('single-outlet owner: one row whose totals equal that row', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await seedOrder(t, refs, { at: wib(2026, 5, 10), total: 10000, lines: [{ name: 'Kopi', qty: 2, lineTotal: 10000 }] });
    const res = await refs.asOwner.query(api.reports.businessOverview, { range: RANGE });
    expect(res.outlets).toHaveLength(1);
    expect(res.outlets[0].cafeId).toBe(refs.cafeId);
    expect(res.outlets[0].revenueIDR).toBe(10000);
    expect(res.outlets[0].itemsSold).toBe(2);
    expect(res.totals.revenueIDR).toBe(10000);
    expect(res.totals.orders).toBe(1);
  });

  it('sums totals across two outlets and sorts rows by name', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t); // outlet "Kopi Senja" (active)
    await seedOrder(t, refs, { at: wib(2026, 5, 10), total: 30000, lines: [{ name: 'Kopi', qty: 3, lineTotal: 30000 }] });
    // Second outlet (named to sort BEFORE "Kopi Senja"): createOutlet switches active to it.
    await refs.asOwner.mutation(api.outlets.createOutlet, { name: 'Alpha' });
    const alpha = (await refs.asOwner.query(api.cafes.myCafe, {}))!._id;
    const aCashier = await refs.asOwner.mutation(api.staff.create, { name: 'B', pin: '5678' });
    const aShift = await refs.asOwner.mutation(api.shifts.open, { cashierId: aCashier, openingFloatIDR: 0 });
    const aCat = await refs.asOwner.mutation(api.menu.categories.create, { name: 'Teh' });
    const aItem = await refs.asOwner.mutation(api.menu.items.create, { categoryId: aCat, name: 'Teh', priceIDR: 20000 });
    await seedOrder(t, { ...refs, cafeId: alpha, cashierId: aCashier, shiftId: aShift, itemId: aItem },
      { at: wib(2026, 5, 10), total: 20000, lines: [{ name: 'Teh', qty: 1, lineTotal: 20000 }] });

    const res = await refs.asOwner.query(api.reports.businessOverview, { range: RANGE });
    expect(res.outlets.map((o) => o.name)).toEqual(['Alpha', 'Kopi Senja']); // sorted by name
    expect(res.totals.revenueIDR).toBe(50000);
    expect(res.totals.orders).toBe(2);
    expect(res.totals.itemsSold).toBe(4);
    expect(res.totals.aovIDR).toBe(25000); // 50000 / 2
  });

  it('returns only the manager accessible outlets', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t); // owner outlet, active
    await seedOrder(t, refs, { at: wib(2026, 5, 10), total: 99000, lines: [{ name: 'Kopi', qty: 1, lineTotal: 99000 }] });
    await refs.asOwner.mutation(api.outlets.createOutlet, { name: 'Cabang' });
    const granted = (await refs.asOwner.query(api.cafes.myCafe, {}))!._id;
    const gCashier = await refs.asOwner.mutation(api.staff.create, { name: 'C', pin: '4321' });
    const gShift = await refs.asOwner.mutation(api.shifts.open, { cashierId: gCashier, openingFloatIDR: 0 });
    const gCat = await refs.asOwner.mutation(api.menu.categories.create, { name: 'X' });
    const gItem = await refs.asOwner.mutation(api.menu.items.create, { categoryId: gCat, name: 'X', priceIDR: 15000 });
    await seedOrder(t, { ...refs, cafeId: granted, cashierId: gCashier, shiftId: gShift, itemId: gItem },
      { at: wib(2026, 5, 10), total: 15000, lines: [{ name: 'X', qty: 1, lineTotal: 15000 }] });

    const businessId = (await t.run((ctx) => ctx.db.get(granted)))!.businessId as Id<'businesses'>;
    const mgrUserId = await t.run((ctx) => ctx.db.insert('users', { name: 'Mgr', email: 'm@x.com' }));
    const mgrMemberId = await t.run((ctx) =>
      ctx.db.insert('businessMembers', { businessId, userId: mgrUserId, role: 'manager', createdAt: 5 })
    );
    await t.run((ctx) =>
      ctx.db.insert('memberOutletAccess', { businessMemberId: mgrMemberId, cafeId: granted, createdAt: 5 })
    );
    const asMgr = t.withIdentity({ subject: `${mgrUserId}|test_session` });

    const res = await asMgr.query(api.reports.businessOverview, { range: RANGE });
    expect(res.outlets.map((o) => o.cafeId)).toEqual([granted]);
    expect(res.totals.revenueIDR).toBe(15000); // owner-only outlet excluded
  });

  it('throws when unauthenticated', async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.reports.businessOverview, { range: RANGE })).rejects.toThrow();
  });
});

describe('overview is unchanged after the refactor', () => {
  it('still returns the active outlet metrics', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await seedOrder(t, refs, { at: wib(2026, 5, 10), total: 12000, lines: [{ name: 'Kopi', qty: 4, lineTotal: 12000 }] });
    const res = await refs.asOwner.query(api.reports.overview, { range: RANGE });
    expect(res.revenueIDR).toBe(12000);
    expect(res.orders).toBe(1);
    expect(res.itemsSold).toBe(4);
  });
});
```

> Verify the exact arg shapes of `api.staff.create`, `api.shifts.open`, `api.menu.categories.create`, `api.menu.items.create` against `reports.test.ts`'s `setup` (copied verbatim) — they are the source of truth for those signatures.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/convex/business-overview.test.ts`
Expected: FAIL — `api.reports.businessOverview` does not exist (the `overview` test should already pass).

- [ ] **Step 3: Extract `computeOverview` and refactor `overview`**

In `convex/reports.ts`, add `getAuthUserId` and `resolveOutletAccess` to the imports:

```typescript
import { getAuthUserId } from '@convex-dev/auth/server';
import { requireActiveOutlet, resolveOutletAccess } from './lib/auth';
```

(the existing line imports only `requireActiveOutlet` — extend it; add the `getAuthUserId` import.)

Add the helper (place it just below `paidInRange`). It is the body of `overview` parameterized by `cafeId`:

```typescript
/**
 * Per-cafe overview metrics for a window. Pulled out of `overview` so the
 * consolidated `businessOverview` can run the identical computation for each
 * accessible outlet. Net revenue = paid order totals minus refunds dated in
 * the window; AOV is off net revenue.
 */
async function computeOverview(
  ctx: QueryCtx,
  cafeId: Id<'cafes'>,
  range: RangeArgs
): Promise<{
  revenueIDR: number;
  refundsIDR: number;
  orders: number;
  aovIDR: number;
  itemsSold: number;
  fromKey: string;
  toKey: string;
}> {
  const tz = await tzFor(ctx, cafeId);
  const { startMs, endMs, fromKey, toKey } = resolveRange(tz, range, Date.now());
  const rows = await ctx.db
    .query('orders')
    .withIndex('by_cafe_created', (q) =>
      q.eq('cafeId', cafeId).gte('createdAtClient', startMs).lte('createdAtClient', endMs)
    )
    .collect();
  const paid = rows.filter((o) => o.paymentStatus === 'paid');
  const grossRevenueIDR = paid.reduce((s, o) => s + o.totalIDR, 0);
  const refunds = await ctx.db
    .query('refunds')
    .withIndex('by_cafe_at', (q) => q.eq('cafeId', cafeId).gte('at', startMs).lte('at', endMs))
    .collect();
  const refundsIDR = refunds.reduce((s, r) => s + r.amountIDR, 0);
  const revenueIDR = grossRevenueIDR - refundsIDR;
  const orders = paid.length;
  const itemsSold = paid.reduce((s, o) => s + o.lines.reduce((n, l) => n + l.qty, 0), 0);
  const aovIDR = orders === 0 ? 0 : Math.round(revenueIDR / orders);
  return { revenueIDR, refundsIDR, orders, aovIDR, itemsSold, fromKey, toKey };
}
```

You will need the `Id` type — add `import type { Id } from './_generated/dataModel';` if not present. Then replace the `overview` handler body to delegate:

```typescript
  handler: async (ctx, { range }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    return computeOverview(ctx, cafeId, range);
  },
```

(Leave `overview`'s `args`/`returns` validators unchanged — `computeOverview`'s return matches them exactly. Leave `paidInRange` and the other report queries that use it untouched.)

- [ ] **Step 4: Add `businessOverview`**

Append to `convex/reports.ts`:

```typescript
export const businessOverview = query({
  args: { range: rangeArg },
  returns: v.object({
    outlets: v.array(
      v.object({
        cafeId: v.id('cafes'),
        name: v.string(),
        revenueIDR: v.number(),
        refundsIDR: v.number(),
        orders: v.number(),
        aovIDR: v.number(),
        itemsSold: v.number(),
      })
    ),
    totals: v.object({
      revenueIDR: v.number(),
      refundsIDR: v.number(),
      orders: v.number(),
      aovIDR: v.number(),
      itemsSold: v.number(),
    }),
    fromKey: v.string(),
    toKey: v.string(),
  }),
  handler: async (ctx, { range }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('not authenticated');
    const access = await resolveOutletAccess(ctx, userId);
    if (!access || access.accessibleCafeIds.length === 0) {
      throw new Error('no outlet access');
    }
    const outlets = [];
    let fromKey = '';
    let toKey = '';
    for (const cafeId of access.accessibleCafeIds) {
      const cafe = await ctx.db.get(cafeId);
      if (!cafe) continue; // tolerate a dangling id defensively
      const ov = await computeOverview(ctx, cafeId, range);
      // Outlets in one business share a timezone in practice; use each
      // computed window (last wins) for the range label.
      fromKey = ov.fromKey;
      toKey = ov.toKey;
      outlets.push({
        cafeId,
        name: cafe.name,
        revenueIDR: ov.revenueIDR,
        refundsIDR: ov.refundsIDR,
        orders: ov.orders,
        aovIDR: ov.aovIDR,
        itemsSold: ov.itemsSold,
      });
    }
    outlets.sort((a, b) => a.name.localeCompare(b.name));
    const totals = outlets.reduce(
      (t, o) => ({
        revenueIDR: t.revenueIDR + o.revenueIDR,
        refundsIDR: t.refundsIDR + o.refundsIDR,
        orders: t.orders + o.orders,
        itemsSold: t.itemsSold + o.itemsSold,
      }),
      { revenueIDR: 0, refundsIDR: 0, orders: 0, itemsSold: 0 }
    );
    const aovIDR = totals.orders === 0 ? 0 : Math.round(totals.revenueIDR / totals.orders);
    return { outlets, totals: { ...totals, aovIDR }, fromKey, toKey };
  },
});
```

- [ ] **Step 5: Regenerate types**

Run: `./node_modules/.bin/convex codegen`
Expected: `api.reports.businessOverview` exposed, exit 0.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm exec vitest run tests/convex/business-overview.test.ts`
Expected: PASS.

- [ ] **Step 7: Full suite + typecheck (regression on `overview`)**

Run: `pnpm typecheck && pnpm test`
Expected: all green — the `overview` refactor is behavior-preserving, so its existing tests in `tests/convex/reports.test.ts` stay green.

- [ ] **Step 8: Commit**

```bash
git add convex/reports.ts convex/_generated tests/convex/business-overview.test.ts
git commit -m "feat(multi-outlet): reports.businessOverview consolidates per-outlet metrics"
```

---

### Task 2: "All outlets" dashboard route + switcher entry

**Files:**
- Create: `src/routes/_pos/all-outlets.tsx`
- Modify: `src/components/outlet-switcher.tsx` (add the "All outlets" entry, multi-outlet only)
- Modify: `src/routeTree.gen.ts` (regenerated — commit)
- i18n: `src/locales/{id,en}/messages.po`

**Interfaces:**
- Consumes: `api.reports.businessOverview` (Task 1); `api.outlets.myOutlets` (already used by the switcher); `formatIDR`/`formatCount` (`~/lib/formater`); `DashboardCard`, shadcn `Table`, `Button`.
- Produces: a `/all-outlets` route (gated `RequirePermission perm="canViewReports"`, like `/dashboard`) showing a range preset toggle, a combined-KPI row, and a per-outlet comparison table. The switcher gains an "All outlets" item (shown only when the user has 2+ outlets) that navigates to `/all-outlets`.

This is a UI task — no unit tests (typecheck + lingui + a manual visual gate). Mirror `src/components/stats.tsx` (KPI tiles via `DashboardCard`) and the page-header/layout idiom of an existing settings/report page.

- [ ] **Step 1: Build the route + page**

Create `src/routes/_pos/all-outlets.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from 'convex/react';
import { api } from 'convex/_generated/api';
import { useState } from 'react';
import { Trans } from '@lingui/react/macro';
import { RequirePermission } from '~/components/permission/require-permission';
import { Button } from '~/components/ui/button';
import { DashboardCard } from '~/components/dashboard-card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { formatCount, formatIDR } from '~/lib/formater';

export const Route = createFileRoute('/_pos/all-outlets')({
  component: AllOutletsPage,
});

type Preset = 'today' | 'last7' | 'last30';

function AllOutletsPage() {
  return (
    <RequirePermission perm="canViewReports">
      <AllOutlets />
    </RequirePermission>
  );
}

function AllOutlets() {
  const [preset, setPreset] = useState<Preset>('last7');
  const data = useQuery(api.reports.businessOverview, { range: { preset } });

  const presets: { key: Preset; label: React.ReactNode }[] = [
    { key: 'today', label: <Trans>Hari ini</Trans> },
    { key: 'last7', label: <Trans>7 hari</Trans> },
    { key: 'last30', label: <Trans>30 hari</Trans> },
  ];

  const tiles =
    data === undefined
      ? []
      : [
          { label: <Trans>Pendapatan</Trans>, value: formatIDR(data.totals.revenueIDR) },
          { label: <Trans>Transaksi</Trans>, value: formatCount(data.totals.orders) },
          { label: <Trans>Rata-rata transaksi</Trans>, value: formatIDR(data.totals.aovIDR) },
          { label: <Trans>Item terjual</Trans>, value: formatCount(data.totals.itemsSold) },
        ];

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-semibold text-lg">
          <Trans>Semua outlet</Trans>
        </h1>
        <div className="flex gap-1">
          {presets.map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant={preset === p.key ? 'default' : 'outline'}
              onClick={() => setPreset(p.key)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-px bg-border lg:grid-cols-4">
        {tiles.map((tile, i) => (
          <DashboardCard key={i}>
            <div className="p-4">
              <p className="text-muted-foreground text-xs">{tile.label}</p>
              <p className="mt-1 font-semibold text-xl">{tile.value}</p>
            </div>
          </DashboardCard>
        ))}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead><Trans>Outlet</Trans></TableHead>
            <TableHead className="text-right"><Trans>Pendapatan</Trans></TableHead>
            <TableHead className="text-right"><Trans>Transaksi</Trans></TableHead>
            <TableHead className="text-right"><Trans>Rata-rata</Trans></TableHead>
            <TableHead className="text-right"><Trans>Item</Trans></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.outlets.map((o) => (
            <TableRow key={o.cafeId}>
              <TableCell className="font-medium">{o.name}</TableCell>
              <TableCell className="text-right">{formatIDR(o.revenueIDR)}</TableCell>
              <TableCell className="text-right">{formatCount(o.orders)}</TableCell>
              <TableCell className="text-right">{formatIDR(o.aovIDR)}</TableCell>
              <TableCell className="text-right">{formatCount(o.itemsSold)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

> `DashboardCard` (`~/components/dashboard-card`) is a thin shadcn `Card` wrapper that takes `Card` props + children (no built-in padding), so the inner `<div className="p-4">` above is appropriate — matches how `src/components/stats.tsx` wraps its content. `RequirePermission` accepts `{ perm?: Permission; owner?: boolean; children }` (confirmed). Confirm `~/components/ui/table`'s exact exports (`Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell`) before finalizing.

- [ ] **Step 2: Add the "All outlets" entry to the switcher**

In `src/components/outlet-switcher.tsx`, add `useNavigate` (`import { useNavigate } from '@tanstack/react-router';`), a `LayoutGrid` icon (lucide), and — shown only when `outlets && outlets.length > 1` — a dropdown item (above the owner-only "Add outlet" block) that navigates to `/all-outlets`:

```tsx
{outlets && outlets.length > 1 ? (
  <>
    <DropdownMenuSeparator />
    <DropdownMenuItem className="gap-2" onSelect={() => navigate({ to: '/all-outlets' })}>
      <LayoutGrid className="size-4 text-muted-foreground" />
      <Trans>Semua outlet</Trans>
    </DropdownMenuItem>
  </>
) : null}
```

Place it so the dropdown reads: outlet list → (All outlets, if 2+) → (Add outlet, owner only) → version label. Keep the existing loading-separator conditional intact.

- [ ] **Step 3: Regenerate the route tree**

Run: `pnpm build` (or start `pnpm dev` briefly) to regenerate `src/routeTree.gen.ts` with `/all-outlets`, then confirm it contains the route and is committed.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Extract + translate i18n**

Run: `pnpm lingui:extract`
Fill NON-empty English `msgstr` in `src/locales/en/messages.po` for the new ids: `Semua outlet`→`All outlets`, `Hari ini`→`Today` (reuse if present), `7 hari`→`7 days`, `30 hari`→`30 days`, `Pendapatan`→`Revenue` (reuse if present), `Transaksi`→`Transactions` (reuse), `Rata-rata transaksi`→`Average transaction` (reuse), `Item terjual`→`Items sold` (reuse), `Outlet`→`Outlet` (reuse), `Rata-rata`→`Average`, `Item`→`Items`. Reuse existing entries wherever the Indonesian string already exists. Then:

Run: `pnpm lingui:compile`
Expected: exit 0; no new English `msgstr` left empty.

- [ ] **Step 6: Visual verification (manual gate)**

As an owner with 2+ outlets: the switcher shows "Semua outlet" → navigates to `/all-outlets`; the page shows combined KPI tiles + a per-outlet table; the range toggle (Hari ini / 7 hari / 30 hari) updates the figures; single-outlet owners do NOT see the "Semua outlet" entry. Check light + dark.

- [ ] **Step 7: Commit**

```bash
git add src/routes/_pos/all-outlets.tsx src/components/outlet-switcher.tsx src/routeTree.gen.ts src/locales
git commit -m "feat(multi-outlet): All outlets consolidated dashboard + switcher entry"
```

---

## Self-Review

**Spec coverage (Phase 5 = §8):**
- Business-level query running the existing per-cafe computation for each accessible outlet, returning per-outlet rows + combined totals (revenue, orders, AOV, items sold) → Task 1 (`businessOverview` + `computeOverview`). ✓
- Owner: all outlets; manager: subset → `resolveOutletAccess` (Task 1). ✓
- "All outlets" dashboard: combined KPI summary + per-outlet comparison table, reusing existing stat/table components → Task 2. ✓
- Existing per-outlet reports unchanged (run against the active outlet) → `overview` refactor is behavior-preserving; only `businessOverview` is new (Task 1). ✓
- The switcher's "All outlets" entry (deferred from Phase 3) → Task 2. ✓

**Deviations / notes:**
- **`fromKey`/`toKey`**: outlets in one business share a timezone in practice, so the consolidated window label uses each outlet's computed window (last wins). A genuine multi-timezone business is an unhandled edge (acceptable for v1; the per-outlet figures are each computed in their own tz, only the displayed range label could differ).
- **Manager reach of the dashboard**: `businessOverview` resolves a manager's subset server-side, so it is forward-compatible, but the `/all-outlets` route is gated `canViewReports` like the rest of the back office. Per the Phase-4 follow-up note, broad manager back-office access is a separate slice; this route ships owner-reachable today.
- **Charts**: the spec mentions reusing chart components; v1 ships the KPI summary + comparison table (the spec's required metrics). A per-outlet revenue chart is a deferred nicety, not required.

**Placeholder scan:** Task 1 has complete code. Task 2 is complete component code with two explicit "verify the real component API before finalizing" notes (DashboardCard/Table/RequirePermission props, and the orders-insert shape in the test) — these are verification instructions, not placeholders.

**Type consistency:** `businessOverview`'s return shape (`outlets[]` with `{cafeId,name,revenueIDR,refundsIDR,orders,aovIDR,itemsSold}` + `totals` + `fromKey`/`toKey`) is used identically in Task 2's page. `computeOverview`'s return matches `overview`'s existing `returns` validator. `range: { preset }` matches the existing `rangeArg` union.

---

## Done

Phase 5 completes the multi-outlet v1 build sequence (schema → active-outlet resolution → switcher → manager invites → consolidated reporting). No further phases.
