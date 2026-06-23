# All-outlets dashboard enhancement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich `/all-outlets` with a URL-synced custom date range, a by-outlet revenue bar chart, loading + empty states, outlet drill-in, and top-outlet highlighting — entirely client-side.

**Architecture:** `reports.businessOverview({ range })` already returns per-outlet rows + combined totals and accepts a custom `{from,to}` range, so there are **no Convex changes**. The shared `RangePicker`/`useReportRange` are bound to the `/_pos/reports` route, so Task 1 makes `RangePicker` presentational and the range hook per-route; the rest composes existing primitives (shadcn chart, `Empty`, `StatCardsSkeleton`) on the route.

**Tech Stack:** React + TanStack Router (file routes, URL search), Convex (`useQuery`/`useMutation`), shadcn/ui (chart wrapper over Recharts, Empty, Table, Badge), Lingui i18n.

## Global Constraints

- **Client-only — no Convex changes.** Do NOT modify `convex/reports.ts` or any backend function. `businessOverview` is already covered by `tests/convex/business-overview.test.ts`.
- **No React test harness** in this project: client behavior is gated by `pnpm typecheck` (must be clean) plus a manual visual check. There are no client unit tests to write.
- **i18n:** new user-facing copy is authored in Indonesian via `<Trans>` / `` t`...` ``. After strings are added: `pnpm lingui:extract` → fill English `msgstr` in `src/locales/en/messages.po` → `pnpm lingui:compile`. **No em-dash (—) or `--`** in copy.
- **Route tree is generated + tracked:** if `src/routeTree.gen.ts` changes, commit it (CI fails if uncommitted).
- **Range shape:** `RangeArgs = { preset: 'today'|'yesterday'|'last7'|'last30' } | { from: string; to: string }` (`convex/lib/time.ts:81`). `businessOverview` takes `{ range: RangeArgs }`.
- **`businessOverview` return:** `{ outlets: { cafeId, name, revenueIDR, refundsIDR, orders, aovIDR, itemsSold }[], totals: { revenueIDR, refundsIDR, orders, aovIDR, itemsSold }, fromKey, toKey }`.
- **Quality gate before every commit:** `pnpm typecheck` clean; existing tests stay green (`pnpm test`, currently 952).

---

### Task 1: Make `RangePicker` presentational; share range derivation

Makes the range control reusable on any route that exposes a report range via URL search, without changing the reports page's behavior.

**Files:**
- Modify: `src/components/reports/use-report-range.ts`
- Modify: `src/components/reports/range-picker.tsx`
- Modify: `src/routes/_pos/reports/route.tsx:32`

**Interfaces:**
- Consumes: `getRouteApi`, `parseReportSearch`, `RangeArgs`.
- Produces:
  - `type RangeControls = { search: ReportSearch; range: RangeArgs; setPreset: (p: ReportPreset) => void; setCustom: (from: string, to: string) => void }`
  - `useReportRange(): RangeControls` (unchanged behavior, now typed)
  - `toRange(search: ReportSearch): RangeArgs` (exported helper)
  - `RangePicker` now takes props `{ search: ReportSearch; setPreset: (p: ReportPreset) => void; setCustom: (from: string, to: string) => void }` instead of calling the hook internally.

- [ ] **Step 1: Add `RangeControls` + `toRange` and keep `useReportRange` returning them**

In `src/components/reports/use-report-range.ts`, keep `parseReportSearch` as-is. Replace the `useReportRange` block (lines ~30-43) with:

```ts
const routeApi = getRouteApi('/_pos/reports');

export type RangeControls = {
  search: ReportSearch;
  range: RangeArgs;
  setPreset: (preset: ReportPreset) => void;
  setCustom: (from: string, to: string) => void;
};

/** Derive the Convex range args from a validated report search. Shared by every
 * route that exposes a report range (reports, all-outlets). */
export function toRange(search: ReportSearch): RangeArgs {
  return 'from' in search ? { from: search.from, to: search.to } : { preset: search.preset };
}

/** Reads/writes the report range from URL search on the /_pos/reports route. */
export function useReportRange(): RangeControls {
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  return {
    search,
    range: toRange(search),
    setPreset: (preset) => navigate({ search: { preset } }),
    setCustom: (from, to) => navigate({ search: { from, to } }),
  };
}
```

- [ ] **Step 2: Make `RangePicker` take props instead of calling the hook**

In `src/components/reports/range-picker.tsx`, change the import on line 8 and the component signature. Replace line 8:

```ts
import type { ReportPreset, ReportSearch } from './use-report-range';
```

Replace the `export function RangePicker() {` line and its first hook line (lines 32-33) with:

```tsx
export function RangePicker({
  search,
  setPreset,
  setCustom,
}: {
  search: ReportSearch;
  setPreset: (preset: ReportPreset) => void;
  setCustom: (from: string, to: string) => void;
}) {
```

(Delete the old `const { search, setPreset, setCustom } = useReportRange();` line. The rest of the component body is unchanged — it already reads `search`, `setPreset`, `setCustom`.)

- [ ] **Step 3: Update the reports route to pass props**

In `src/routes/_pos/reports/route.tsx`, add the hook import and use it. Change line 6 to also import the hook:

```ts
import { type ReportSearch, parseReportSearch, useReportRange } from '~/components/reports/use-report-range';
```

Change `function ReportsLayout() {` to call the hook and pass props (replace the `<RangePicker />` on line 32):

```tsx
function ReportsLayout() {
  const { search, setPreset, setCustom } = useReportRange();
  return (
    <RequirePermission perm="canViewReports">
    <main className="p-6">
      <PageHeader title={<Trans>Laporan</Trans>} />
      <div className="mt-2">
        <RangePicker search={search} setPreset={setPreset} setCustom={setCustom} />
      </div>
```

(Leave the rest of the file unchanged.)

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: clean. (Catches any missed prop wiring.)

- [ ] **Step 5: Commit**

```bash
git add src/components/reports/use-report-range.ts src/components/reports/range-picker.tsx src/routes/_pos/reports/route.tsx
git commit -m "refactor(reports): make RangePicker presentational; share toRange"
```

---

### Task 2: URL-synced range on `/all-outlets`

Replaces the local 3-preset state with the shared `RangePicker` backed by URL search, so the range persists across refresh and gains a custom date range + the `yesterday` preset.

**Files:**
- Modify: `src/components/reports/use-report-range.ts` (add `useAllOutletsRange`)
- Modify: `src/routes/_pos/all-outlets.tsx`

**Interfaces:**
- Consumes: `RangeControls`, `toRange`, `parseReportSearch`, `RangePicker`, `api.reports.businessOverview`.
- Produces: `useAllOutletsRange(): RangeControls` bound to `/_pos/all-outlets`; the route now declares `validateSearch: parseReportSearch`.

- [ ] **Step 1: Add the all-outlets range hook**

In `src/components/reports/use-report-range.ts`, after `useReportRange`, add a second route-bound hook:

```ts
const allOutletsRouteApi = getRouteApi('/_pos/all-outlets');

/** Reads/writes the range from URL search on the /_pos/all-outlets route. */
export function useAllOutletsRange(): RangeControls {
  const search = allOutletsRouteApi.useSearch();
  const navigate = allOutletsRouteApi.useNavigate();
  return {
    search,
    range: toRange(search),
    setPreset: (preset) => navigate({ search: { preset } }),
    setCustom: (from, to) => navigate({ search: { from, to } }),
  };
}
```

- [ ] **Step 2: Rewrite the route to use URL range + RangePicker**

Replace the whole contents of `src/routes/_pos/all-outlets.tsx` with the skeleton below. (KPI tiles preserved; chart/loading/empty/table interactions are added in Tasks 3-5. The table here is the existing read-only table, kept temporarily.)

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from 'convex/react';
import { api } from 'convex/_generated/api';
import { Trans } from '@lingui/react/macro';
import { RequirePermission } from '~/components/permission/require-permission';
import { RangePicker } from '~/components/reports/range-picker';
import { parseReportSearch, useAllOutletsRange } from '~/components/reports/use-report-range';
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
  validateSearch: parseReportSearch,
  component: AllOutletsPage,
});

function AllOutletsPage() {
  return (
    <RequirePermission perm="canViewReports">
      <AllOutlets />
    </RequirePermission>
  );
}

function AllOutlets() {
  const { search, range, setPreset, setCustom } = useAllOutletsRange();
  const data = useQuery(api.reports.businessOverview, { range });

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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-semibold text-lg">
          <Trans>Semua outlet</Trans>
        </h1>
        <RangePicker search={search} setPreset={setPreset} setCustom={setCustom} />
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

- [ ] **Step 3: Typecheck + route tree**

Run: `pnpm typecheck`
Expected: clean. Then check whether the generated route tree changed:

Run: `git status --short src/routeTree.gen.ts`
If it shows as modified (validateSearch added a search schema), stage it in the commit below. If unchanged, ignore.

- [ ] **Step 4: Commit**

```bash
git add src/components/reports/use-report-range.ts src/routes/_pos/all-outlets.tsx src/routeTree.gen.ts
git commit -m "feat(all-outlets): URL-synced range via shared RangePicker"
```

(`git add` of an unchanged `routeTree.gen.ts` is a no-op; safe to include.)

---

### Task 3: By-outlet revenue bar chart

Adds a revenue-by-outlet comparison bar chart, computed purely from the per-outlet rows already fetched.

**Files:**
- Create: `src/components/all-outlets/outlets-revenue-chart.tsx`
- Modify: `src/routes/_pos/all-outlets.tsx`

**Interfaces:**
- Consumes: `ChartConfig`, `ChartContainer`, `ChartTooltip`, `ChartTooltipContent` (`~/components/ui/chart`); `BarChart`, `Bar`, `XAxis` (recharts); `formatIDR`.
- Produces: `OutletsRevenueChart({ outlets }: { outlets: { cafeId: string; name: string; revenueIDR: number }[] })`.

- [ ] **Step 1: Create the chart component**

Create `src/components/all-outlets/outlets-revenue-chart.tsx`:

```tsx
import { Bar, BarChart, XAxis } from 'recharts';
import { useLingui } from '@lingui/react/macro';
import { Trans } from '@lingui/react/macro';
import { CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '~/components/ui/chart';
import { DashboardCard } from '~/components/dashboard-card';
import { formatIDR } from '~/lib/formater';

export function OutletsRevenueChart({
  outlets,
}: {
  outlets: { cafeId: string; name: string; revenueIDR: number }[];
}) {
  const { t } = useLingui();
  const chartConfig = {
    revenue: { label: t`Pendapatan`, color: 'var(--chart-2)' },
  } satisfies ChartConfig;

  const rows = outlets.map((o) => ({ label: o.name, revenue: o.revenueIDR }));

  return (
    <DashboardCard className="mb-6 gap-0">
      <CardHeader className="gap-2">
        <CardTitle>
          <Trans>Pendapatan per outlet</Trans>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer className="aspect-auto h-60 w-full" config={chartConfig}>
          <BarChart accessibilityLayer data={rows}>
            <XAxis
              axisLine={false}
              dataKey="label"
              interval={0}
              tickFormatter={(value) => String(value)}
              tickLine={false}
              tickMargin={10}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(value) => formatIDR(Math.round(Number(value)))}
                />
              }
              cursor={false}
            />
            <Bar dataKey="revenue" fill="var(--color-revenue)" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </DashboardCard>
  );
}
```

- [ ] **Step 2: Render it between the KPI tiles and the table**

In `src/routes/_pos/all-outlets.tsx`, add the import:

```tsx
import { OutletsRevenueChart } from '~/components/all-outlets/outlets-revenue-chart';
```

Then between the KPI tiles `</div>` and the `<Table>`, insert:

```tsx
      {data ? <OutletsRevenueChart outlets={data.outlets} /> : null}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/all-outlets/outlets-revenue-chart.tsx src/routes/_pos/all-outlets.tsx
git commit -m "feat(all-outlets): by-outlet revenue bar chart"
```

---

### Task 4: Loading skeletons + empty state

Shows skeletons while `businessOverview` resolves and a shadcn `Empty` when there were no sales in the range.

**Files:**
- Modify: `src/routes/_pos/all-outlets.tsx`

**Interfaces:**
- Consumes: `StatCardsSkeleton` (`~/components/ui/loading-skeletons`), `Skeleton` (`~/components/ui/skeleton`), `Empty`, `EmptyHeader`, `EmptyMedia`, `EmptyTitle`, `EmptyDescription` (`~/components/ui/empty`), `Store` (lucide-react).

- [ ] **Step 1: Add imports**

In `src/routes/_pos/all-outlets.tsx`:

```tsx
import { Store } from 'lucide-react';
import { StatCardsSkeleton } from '~/components/ui/loading-skeletons';
import { Skeleton } from '~/components/ui/skeleton';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
```

- [ ] **Step 2: Branch on loading and empty inside `AllOutlets`**

Replace the body `return (...)` of `AllOutlets` so the header + range always render, then branch. Replace everything from `return (` to the closing of the component with:

```tsx
  const header = (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h1 className="font-semibold text-lg">
        <Trans>Semua outlet</Trans>
      </h1>
      <RangePicker search={search} setPreset={setPreset} setCustom={setCustom} />
    </div>
  );

  if (data === undefined) {
    return (
      <div className="p-4">
        {header}
        <StatCardsSkeleton count={4} className="mb-6" />
        <Skeleton className="mb-6 h-60 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (data.totals.orders === 0) {
    return (
      <div className="p-4">
        {header}
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Store />
            </EmptyMedia>
            <EmptyTitle>
              <Trans>Belum ada penjualan pada rentang ini.</Trans>
            </EmptyTitle>
            <EmptyDescription>
              <Trans>Coba ubah rentang tanggal di atas.</Trans>
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="p-4">
      {header}

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

      <OutletsRevenueChart outlets={data.outlets} />

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
          {data.outlets.map((o) => (
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
```

(`tiles` no longer needs the `data === undefined ? [] :` guard since this branch only runs when `data` is defined, but leaving it is harmless. The earlier inline `{data ? <OutletsRevenueChart .../> : null}` is removed — the chart now renders unconditionally in the data branch.)

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/routes/_pos/all-outlets.tsx
git commit -m "feat(all-outlets): loading skeletons and empty state"
```

---

### Task 5: Outlet table — drill-in, top highlight, sorting

Extracts the table into a focused component that sorts client-side, highlights the top-revenue outlet, and drills into a single outlet's dashboard on row click.

**Files:**
- Create: `src/components/all-outlets/outlets-table.tsx`
- Modify: `src/routes/_pos/all-outlets.tsx`

**Interfaces:**
- Consumes: `api.outlets.setActiveOutlet`, `useMutation`, `useNavigate`, `Table*`, `Badge`, `formatIDR`, `formatCount`, `Id<'cafes'>`.
- Produces: `OutletsTable({ outlets }: { outlets: OutletRow[] })` where `OutletRow = { cafeId: Id<'cafes'>; name: string; revenueIDR: number; orders: number; aovIDR: number; itemsSold: number }`.

- [ ] **Step 1: Create the table component**

Create `src/components/all-outlets/outlets-table.tsx`:

```tsx
import { useNavigate } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation } from 'convex/react';
import { Trans } from '@lingui/react/macro';
import { useState } from 'react';
import { Badge } from '~/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { formatCount, formatIDR } from '~/lib/formater';
import { cn } from '~/lib/utils';

type OutletRow = {
  cafeId: Id<'cafes'>;
  name: string;
  revenueIDR: number;
  orders: number;
  aovIDR: number;
  itemsSold: number;
};

type SortKey = 'name' | 'revenueIDR' | 'orders' | 'aovIDR' | 'itemsSold';

export function OutletsTable({ outlets }: { outlets: OutletRow[] }) {
  const navigate = useNavigate();
  const setActiveOutlet = useMutation(api.outlets.setActiveOutlet);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'revenueIDR',
    dir: 'desc',
  });

  const topCafeId = outlets.reduce<OutletRow | null>(
    (best, o) => (best === null || o.revenueIDR > best.revenueIDR ? o : best),
    null
  )?.cafeId;

  const sorted = [...outlets].sort((a, b) => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    if (sort.key === 'name') return a.name.localeCompare(b.name, 'id-ID') * dir;
    return (a[sort.key] - b[sort.key]) * dir;
  });

  function toggleSort(key: SortKey): void {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'name' ? 'asc' : 'desc' }
    );
  }

  async function openOutlet(cafeId: Id<'cafes'>): Promise<void> {
    await setActiveOutlet({ cafeId });
    navigate({ to: '/dashboard' });
  }

  const numericCols: { key: SortKey; label: React.ReactNode }[] = [
    { key: 'revenueIDR', label: <Trans>Pendapatan</Trans> },
    { key: 'orders', label: <Trans>Transaksi</Trans> },
    { key: 'aovIDR', label: <Trans>Rata-rata</Trans> },
    { key: 'itemsSold', label: <Trans>Item</Trans> },
  ];

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>
            <button type="button" className="hover:underline" onClick={() => toggleSort('name')}>
              <Trans>Outlet</Trans>
            </button>
          </TableHead>
          {numericCols.map((c) => (
            <TableHead key={c.key} className="text-right">
              <button type="button" className="hover:underline" onClick={() => toggleSort(c.key)}>
                {c.label}
              </button>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((o) => (
          <TableRow
            key={o.cafeId}
            role="button"
            tabIndex={0}
            onClick={() => void openOutlet(o.cafeId)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                void openOutlet(o.cafeId);
              }
            }}
            className={cn('cursor-pointer', o.cafeId === topCafeId && 'bg-muted/50')}
          >
            <TableCell className="font-medium">
              <span className="inline-flex items-center gap-2">
                {o.name}
                {o.cafeId === topCafeId ? (
                  <Badge variant="secondary">
                    <Trans>Teratas</Trans>
                  </Badge>
                ) : null}
              </span>
            </TableCell>
            <TableCell className="text-right">{formatIDR(o.revenueIDR)}</TableCell>
            <TableCell className="text-right">{formatCount(o.orders)}</TableCell>
            <TableCell className="text-right">{formatIDR(o.aovIDR)}</TableCell>
            <TableCell className="text-right">{formatCount(o.itemsSold)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 2: Use it in the route**

In `src/routes/_pos/all-outlets.tsx`:
1. Add `import { OutletsTable } from '~/components/all-outlets/outlets-table';`
2. Remove the now-unused `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow` import and the `formatCount`/`formatIDR` imports **only if** no longer referenced (the KPI tiles still use `formatIDR`/`formatCount`, so keep those; remove the `Table*` import).
3. Replace the entire `<Table>...</Table>` block in the data branch with:

```tsx
      <OutletsTable outlets={data.outlets} />
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: clean. (Will flag any leftover unused `Table*` import — remove it.)

- [ ] **Step 4: Commit**

```bash
git add src/components/all-outlets/outlets-table.tsx src/routes/_pos/all-outlets.tsx
git commit -m "feat(all-outlets): drill-in, top-outlet highlight, sortable table"
```

---

### Task 6: i18n + final verification

Extract and translate the new strings, then run the full quality gate and a manual visual check.

**Files:**
- Modify: `src/locales/en/messages.po`, `src/locales/id/messages.po`, `src/locales/*/messages.mjs` (generated by compile)

- [ ] **Step 1: Extract new strings**

Run: `pnpm lingui:extract`
Expected: new ids for `Pendapatan per outlet`, `Teratas`, `Belum ada penjualan pada rentang ini.`, `Coba ubah rentang tanggal di atas.` (and any others added) appear in `src/locales/id/messages.po` and `src/locales/en/messages.po`.

- [ ] **Step 2: Fill English translations**

In `src/locales/en/messages.po`, set the English `msgstr` for the new ids (no em-dash / `--`):
- `Pendapatan per outlet` → `Revenue by outlet`
- `Teratas` → `Top`
- `Semua outlet` → `All outlets` (if not already translated)
- `Belum ada penjualan pada rentang ini.` → `No sales in this range yet.`
- `Coba ubah rentang tanggal di atas.` → `Try changing the date range above.`
- Confirm any reused strings (`Pendapatan`, `Transaksi`, `Rata-rata transaksi`, `Item terjual`, `Rata-rata`, `Item`, range presets) already have English; fill if blank.

- [ ] **Step 3: Compile**

Run: `pnpm lingui:compile`
Expected: success; `messages.mjs` files regenerated.

- [ ] **Step 4: Full quality gate**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck clean; tests green (952 — no backend change).

- [ ] **Step 5: Manual visual gate** (OTP-gated login, not automatable)

In a running dev env, signed in as an owner of a **multi-outlet** business, open the "All outlets" switcher entry:
- Preset toggles (Hari ini / Kemarin / 7 hari / 30 hari) and a **custom range** via the calendar update the KPIs, chart, and table; the chosen range persists in the URL across refresh.
- While loading, skeletons show; a range with no sales shows the `Empty` state (header + range still visible).
- The revenue-by-outlet bar chart renders in **light and dark**; tooltip shows `Rp` values.
- The top-revenue outlet row is highlighted with a "Teratas" / "Top" badge; clicking column headers re-sorts.
- Clicking an outlet row switches the active outlet and lands on `/dashboard` scoped to that outlet (and, per active-cashier behavior, the register will ask for a PIN next time it's opened).

- [ ] **Step 6: Commit**

```bash
git add src/locales
git commit -m "i18n(all-outlets): extract and translate new strings"
```

---

## Self-Review

**Spec coverage:**
- Custom date range (URL-synced) → Tasks 1-2 (presentational RangePicker + `useAllOutletsRange` + `validateSearch`). ✓
- By-outlet revenue bar chart → Task 3 (`OutletsRevenueChart`). ✓
- Loading skeletons + empty state → Task 4 (`StatCardsSkeleton`/`Skeleton` + `Empty`). ✓
- Drill-in (switch active outlet → /dashboard) → Task 5 (`setActiveOutlet` + navigate). ✓
- Top-outlet highlight + sortable table → Task 5. ✓
- i18n → Task 6. ✓
- No Convex changes → confirmed; only client files + locales touched. ✓
- Deferred (trend line, per-outlet daily series, prior-period deltas) → not in any task, matching the spec. ✓

**Placeholder scan:** every code step shows complete code; no TBD/TODO. The only conditional instruction is the unused-import cleanup in Task 5 Step 2, which typecheck enforces.

**Type consistency:** `RangeControls`/`toRange` (Task 1) are reused verbatim by `useAllOutletsRange` (Task 2). `OutletsRevenueChart` props are a structural subset of `businessOverview.outlets` rows (`cafeId`/`name`/`revenueIDR`). `OutletsTable`'s `OutletRow` matches the full `businessOverview.outlets` row type (`cafeId: Id<'cafes'>`). `businessOverview` is called as `{ range }` with `range: RangeArgs` from the hook — matches `convex/reports.ts:438` (`{ range: rangeArg }`).

**Risk watch:** Task 1 changes the shared `RangePicker` API; the only other consumer is `reports/route.tsx`, updated in the same task — typecheck is the safety net. `validateSearch` on `/all-outlets` may regenerate `routeTree.gen.ts`; Task 2 Step 3 checks and commits it.

---

## Done

`/all-outlets` becomes a real consolidated dashboard — custom URL-synced range, a by-outlet revenue chart, proper loading/empty states, top-outlet highlighting, and one-click drill-in — with zero backend change. Trend-over-time and prior-period comparison remain available as a future server-backed slice.
