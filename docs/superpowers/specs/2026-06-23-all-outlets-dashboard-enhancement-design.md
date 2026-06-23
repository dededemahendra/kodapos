# All-outlets dashboard enhancement — Design

**Date:** 2026-06-23
**Status:** Approved design, pending implementation plan
**Scope:** Enrich the existing `/all-outlets` consolidated dashboard with a custom
date range, a by-outlet revenue chart, loading + empty states, outlet drill-in,
and top-outlet highlighting. **Client-only — no Convex changes.**

---

## 1. Summary

`/all-outlets` (`src/routes/_pos/all-outlets.tsx`, shipped in multi-outlet v1
Phase 5) already renders combined KPI tiles + a per-outlet breakdown table from
`reports.businessOverview({ range })`, gated behind `canViewReports`. Today it
only offers three fixed range presets and a plain table — no chart, no
loading/empty states, no drill-in.

This enhancement reuses existing app primitives to make it a proper dashboard.
Crucially, **`businessOverview` already accepts a custom `{ from, to }` range**
and returns everything the new UI needs (per-outlet rows + totals), so **no
backend work is required.**

### Decisions locked in

- **Charts: by-outlet bar only.** A revenue-by-outlet comparison bar chart from
  the per-outlet rows already returned. (Rejected for v1: a day-by-day trend line
  and per-outlet daily series — both need a new server time-series, deferred.)
- **No prior-period deltas.** Computing a previous equal-length window per outlet
  is server work; deferred. Top-outlet highlighting (free, client-side) is in.
- **Drill-in switches the active outlet.** Clicking an outlet row sets it active
  and navigates to the normal single-outlet `/dashboard`, reusing all existing
  dashboard UI. (Rejected: a separate read-only per-outlet view — more to build.)

---

## 2. Goals / Non-goals

### Goals
1. Custom date range (presets + arbitrary `{from,to}`), URL-synced.
2. A by-outlet revenue comparison bar chart.
3. Loading skeletons and an empty state matching app conventions.
4. Drill into a single outlet's dashboard from the table.
5. Highlight the top-revenue outlet; make the table client-sortable.

### Non-goals (deferred)
- Day-by-day revenue trend line (needs a server time-series query).
- Per-outlet daily series / overlaid lines.
- Prior-period comparison deltas (needs a second computed window per outlet).
- Any change to `reports.businessOverview` or other Convex functions.

---

## 3. Reused primitives (no new server code)

| Need | Reuse | Path |
| --- | --- | --- |
| Range control + URL state | `RangePicker` + `useReportRange()` | `src/components/reports/range-picker.tsx`, `src/components/reports/use-report-range.ts` |
| Consolidated data | `reports.businessOverview({ range })` (accepts `preset` or `{from,to}`) | `convex/reports.ts` |
| Chart | shadcn `ChartContainer` + Recharts `BarChart` (pattern from `net-revenue-chart.tsx`) | `src/components/ui/chart.tsx` |
| KPI tiles | existing tile markup + `DashboardCard` | `src/components/dashboard-card.tsx` |
| Loading | `StatCardsSkeleton` | `src/components/ui/loading-skeletons.tsx` |
| Empty | shadcn `Empty` (icon + heading + description), per `profit-loss.tsx` | `src/components/ui/empty.tsx` |
| Drill-in | `outlets.setActiveOutlet({ cafeId })` mutation | `convex/outlets.ts` |
| Formatting | `formatIDR`, `formatCount` | `src/lib/formater.ts` |

`businessOverview` return shape (already available): `{ outlets: [{ cafeId, name,
revenueIDR, refundsIDR, orders, aovIDR, itemsSold }], totals: { revenueIDR,
refundsIDR, orders, aovIDR, itemsSold }, fromKey, toKey }`.

---

## 4. Architecture & components

The route becomes a thin composition. New work is one chart component plus
restructuring the route; everything else is wiring existing components.

```
/_pos/all-outlets (route component)
├─ RequirePermission perm="canViewReports"   (unchanged gate)
├─ Header: <h1>Semua outlet</h1> + <RangePicker> (from useReportRange)
├─ data === undefined → <StatCardsSkeleton count={4}/> + chart/table skeleton
├─ totals.orders === 0 → <Empty> (icon + heading + description)   ← header/range stay
└─ else:
   ├─ KPI tiles (4): revenue, transactions, AOV, items (combined totals)
   ├─ <OutletsRevenueChart outlets={data.outlets}/>            ← NEW component
   └─ Outlet table: sortable, top-revenue row highlighted + "Teratas" badge,
      row click → drill-in
```

### 4.1 `OutletsRevenueChart` (new) — `src/components/all-outlets/outlets-revenue-chart.tsx`
- Props: `outlets: { cafeId, name, revenueIDR }[]` (subset of the row type).
- shadcn `ChartContainer` with a `ChartConfig`; Recharts `BarChart` (x = outlet
  `name`, y = `revenueIDR`), `ChartTooltip` → `ChartTooltipContent` formatted with
  `formatIDR`. One purpose, pure function of its props, independently testable by
  eye. Follows `net-revenue-chart.tsx`.
- Degenerate input (one outlet / all-zero) still renders a valid (small) chart;
  the page-level empty gate already covers the no-sales case.

### 4.2 Range wiring
- Replace the local `useState<Preset>` with `useReportRange()`; pass its `range`
  straight to `businessOverview`. Render `<RangePicker>` in the header. Range now
  persists in the URL and supports arbitrary `{from,to}`.

### 4.3 Outlet table
- **Drill-in:** `const setActive = useMutation(api.outlets.setActiveOutlet)`; row
  `onClick` → `await setActive({ cafeId })` → `navigate({ to: '/dashboard' })`.
  Rows get `cursor-pointer`, hover styling, `role="button"`, `tabIndex={0}`, and
  Enter/Space key handling for a11y.
- **Top highlight:** compute `maxRevenue` over rows; the matching row gets an
  emphasized background + a small `Badge` "Teratas". Skip the badge if all
  revenue is zero (guarded by the empty gate anyway).
- **Sorting:** local `sort` state `{ key, dir }`, default `{ key: 'revenueIDR',
  dir: 'desc' }`. Clickable column headers toggle direction. Pure client sort of
  `data.outlets`.

### 4.4 Loading & empty
- `data === undefined` → skeletons (`StatCardsSkeleton count={4}` + a simple chart
  + table-rows skeleton block). Keep the header + range picker visible.
- `data.totals.orders === 0` → `<Empty>` with an icon (e.g. `Store`/`BarChart3`
  from lucide), an Indonesian heading and description telling the user there were
  no sales in this range. Header + range picker stay so they can widen the range.

---

## 5. Side effects & edge cases

- **Drill-in changes the active outlet** (a deliberate side effect): after
  `setActiveOutlet`, the whole app re-scopes to that outlet and `/dashboard`
  shows its data. Per the active-cashier behavior, switching the active outlet
  also drops any stale register cashier, so the operator re-PINs when they next
  open the register for that outlet. Acceptable for an owner reviewing reports.
- **Single-outlet businesses:** `/all-outlets` is only reachable via the "All
  outlets" switcher entry, which appears only for multi-outlet businesses, so the
  chart/table always has ≥2 rows in practice. The component still renders
  correctly with one row.
- **Manager scope:** `businessOverview` already returns only the outlets the
  member can access, so a manager sees only their granted outlets here (unchanged).

---

## 6. i18n

New user-facing strings are authored in Indonesian via `<Trans>` (chart title,
"Teratas", empty-state heading/description, any new column labels). After
implementation: `pnpm lingui:extract` → fill English `msgstr` in
`src/locales/en/messages.po` → `pnpm lingui:compile`. No em-dash / `--` in copy.

---

## 7. Testing & verification

- **No Convex changes → no new backend tests.** `businessOverview` is already
  covered by `tests/convex/business-overview.test.ts`.
- The project has **no React test harness**, so client behavior is verified by
  `pnpm typecheck` (clean) plus a **manual visual gate** in a running dev env:
  - Range presets + a custom `{from,to}` range update KPIs, chart, and table; the
    range persists in the URL across refresh.
  - Loading shows skeletons; a range with no sales shows the `Empty` state.
  - The by-outlet bar chart renders correctly (light + dark), tooltip shows
    `formatIDR` values.
  - Top-revenue outlet is highlighted with the "Teratas" badge; column sort works.
  - Clicking an outlet row switches the active outlet and lands on `/dashboard`
    scoped to it.

---

## 8. Out of scope (explicit)

Trend-over-time line chart, per-outlet daily series, prior-period deltas, and any
`reports.businessOverview` / server change. These require a new server-side
time-series and are deferred to a later slice if wanted.
