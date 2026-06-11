# Stock Health Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two static stat tiles (low-stock count + total stock value) above the inventory stock table, derived client-side from the already-fetched `ingredients.list`.

**Architecture:** Frontend-only. A new presentational `StockSummary` component renders two `DashboardCard` tiles mirroring `src/components/stats.tsx`. The stock page's existing `counts` `useMemo` is extended to also compute `stockValueIDR`; the page renders `<StockSummary>` between the `Toolbar` and the `DataTable`. No Convex change, no schema change, no `convex codegen`, no route change.

**Tech Stack:** React, TanStack Router, shadcn `Card`/`DashboardCard`, Lingui (`@lingui/react/macro`), `formatIDR` from `~/lib/money`.

---

## File Structure

- **Create:** `src/components/inventory/stock-summary.tsx` — presentational two-tile summary (props in, no data fetching).
- **Modify:** `src/routes/_pos/inventory/index.tsx` — extend `counts` memo with `stockValueIDR`; render `<StockSummary>` above the table.
- **i18n:** `src/locales/id/messages.po` (source) + `src/locales/en/messages.po` (fill `en`), then compiled.

> Confirm the locale path during Task 3 — use whatever `pnpm lingui:extract` actually writes (the repo's `lingui.config` is the source of truth). The paths above are the expected location.

---

### Task 1: `StockSummary` presentational component

**Files:**
- Create: `src/components/inventory/stock-summary.tsx`

Reference pattern (read first): `src/components/stats.tsx` (tile markup) and
`src/components/dashboard-card.tsx` (the `DashboardCard` wrapper). This component is
the **static** variant — no query, no `Delta`, no `CardFooter`.

- [ ] **Step 1: Write the component**

```tsx
import { Trans } from '@lingui/react/macro';
import { DashboardCard } from '~/components/dashboard-card';
import { CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { formatIDR } from '~/lib/money';
import { cn } from '~/lib/utils';

export function StockSummary({
  lowCount,
  stockValueIDR,
}: {
  lowCount: number;
  stockValueIDR: number;
}) {
  const low = lowCount > 0;
  return (
    <div className="grid grid-cols-1 gap-px sm:grid-cols-2">
      <DashboardCard>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="font-normal text-xs tracking-wide">
            <Trans>Stok rendah</Trans>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-row items-center gap-2">
          <p
            className={cn(
              'font-semibold text-2xl tabular-nums',
              low && 'text-destructive'
            )}
          >
            {low ? (
              <span aria-hidden="true" className="mr-1">
                ⚠
              </span>
            ) : null}
            {lowCount} <Trans>bahan</Trans>
          </p>
        </CardContent>
      </DashboardCard>

      <DashboardCard>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="font-normal text-xs tracking-wide">
            <Trans>Nilai stok total</Trans>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-row items-center gap-2">
          <p className="font-semibold text-2xl tabular-nums">
            {formatIDR(stockValueIDR)}
          </p>
        </CardContent>
      </DashboardCard>
    </div>
  );
}
```

> Note: `src/components/stats.tsx` imports `formatIDR` from `~/lib/formater`, but the
> stock page (`src/routes/_pos/inventory/index.tsx`) imports it from `~/lib/money`.
> Use `~/lib/money` here to match the page that owns this feature. If typecheck shows
> `~/lib/money` has no `formatIDR` export, fall back to `~/lib/formater` (check the
> actual export before assuming).

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no errors referencing `stock-summary.tsx`).

- [ ] **Step 3: Commit**

```bash
git add src/components/inventory/stock-summary.tsx
git commit -m "feat(inventory): stock health summary tiles component"
```

---

### Task 2: Wire `StockSummary` into the stock page

**Files:**
- Modify: `src/routes/_pos/inventory/index.tsx`

- [ ] **Step 1: Import the component**

Add to the import block (near the other `~/components/inventory/*` imports, e.g. after
the `StockAdjustDialog` import):

```tsx
import { StockSummary } from '~/components/inventory/stock-summary';
```

- [ ] **Step 2: Extend the `counts` memo with `stockValueIDR`**

The current memo (around lines 54–62) returns `{ all, low, archived }`. Replace its
return object to also compute the value total over the **active** set:

```tsx
  const counts = useMemo(() => {
    if (!ingredients) return undefined;
    const active = ingredients.filter((r) => !r.archived);
    return {
      all: active.length,
      low: active.filter(isLow).length,
      archived: ingredients.filter((r) => r.archived).length,
      stockValueIDR: active.reduce(
        (sum, r) => sum + r.currentStockQty * r.lastCostPerUnitIDR,
        0
      ),
    };
  }, [ingredients]);
```

- [ ] **Step 3: Render `<StockSummary>` between the `Toolbar` and the `DataTable`**

The `Toolbar` JSX ends around line 241 (`/>`); the `<DataTable` opens around line 243.
Insert between them:

```tsx
      {counts ? (
        <StockSummary
          lowCount={counts.low}
          stockValueIDR={counts.stockValueIDR}
        />
      ) : null}
```

Do not change the `Toolbar`, the `DataTable`, the `PageHeader` meta line, the columns,
or any dialog wiring.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. (`counts.stockValueIDR` is now defined; `StockSummary` props match.)

- [ ] **Step 5: Run the test suite**

Run: `pnpm test`
Expected: PASS (no inventory tests broken; this is additive UI).

- [ ] **Step 6: Commit**

```bash
git add src/routes/_pos/inventory/index.tsx
git commit -m "feat(inventory): show stock health summary above stock table"
```

---

### Task 3: i18n — extract, fill `en`, compile

**Files:**
- Modify: `src/locales/id/messages.po` (source — auto-updated by extract)
- Modify: `src/locales/en/messages.po` (fill the `en` msgstr for new strings)
- Modify: compiled catalog output (auto-generated by compile)

New strings introduced in Task 1: `Stok rendah`, `bahan`, `Nilai stok total`.
(`Stok rendah` likely already exists from the stock-page filter chip — extract will
report only what's genuinely new.)

- [ ] **Step 1: Extract**

Run: `pnpm lingui:extract`
Expected: reports added strings (the new ones not already in the catalog). Note the
exact `.po` paths it writes — use those for Step 2 if they differ from the assumed
`src/locales/*/messages.po`.

- [ ] **Step 2: Fill the `en` catalog**

In the `en` messages `.po`, set the English `msgstr` for any new/empty entries:

| msgid | en msgstr |
|---|---|
| `Stok rendah` | `Low stock` |
| `bahan` | `items` |
| `Nilai stok total` | `Total stock value` |

For entries already present with a filled `en` value (e.g. `Stok rendah` if the filter
chip already added it), leave them as-is. Only fill empty `msgstr ""` for the new ones.

Example (only if the entry is newly added and empty):

```bash
perl -0777 -i -pe 's/(msgid "Nilai stok total"\nmsgstr )""/$1"Total stock value"/' src/locales/en/messages.po
perl -0777 -i -pe 's/(msgid "bahan"\nmsgstr )""/$1"items"/' src/locales/en/messages.po
```

(Adjust the path to whatever Step 1 reported. Verify by re-reading the changed lines.)

- [ ] **Step 3: Compile**

Run: `pnpm lingui:compile`
Expected: PASS, compiled catalogs regenerated.

- [ ] **Step 4: Commit**

```bash
git add src/locales
git commit -m "i18n(inventory): stock health summary strings + en fill"
```

---

### Task 4: Final verification + clean tree

**Files:** none (verification only)

- [ ] **Step 1: Full local CI gate**

Run, in order:

```bash
pnpm typecheck
pnpm test
pnpm lingui:compile
```

Expected: all PASS.

- [ ] **Step 2: Confirm the working tree is clean**

Run: `git status`
Expected: `nothing to commit, working tree clean`. If `lingui:compile` produced an
uncommitted diff, commit it (`git add src/locales && git commit -m "i18n(inventory): recompile catalog"`).

- [ ] **Step 3: Manual sanity (described, not automated)**

On `/inventory`: two tiles render above the table — "Stok rendah" shows the same count
as the meta line / filter chip (with a ⚠ + destructive color when > 0, neutral when 0),
and "Nilai stok total" equals Σ(stock × cost) over active ingredients. Archived items
are excluded from both. No existing control changed.

---

## Self-Review

**Spec coverage:**
- Two tiles (low-stock count + total value) → Task 1. ✓
- Frontend-only, derived from `ingredients.list` → Task 2 (memo extension). ✓
- Active-set scope (exclude archived) → Task 2 memo filters `!r.archived`. ✓
- Mirror `DashboardCard`/stat-tile, static (no `Delta`/footer) → Task 1. ✓
- Warning treatment when low > 0 → Task 1 (`text-destructive` + ⚠). ✓
- i18n new strings + `en` fill + compile → Task 3. ✓
- No backend / codegen / route change → respected (no Convex or route files touched). ✓

**Placeholder scan:** No TBD/TODO; all code shown in full. The only deferred detail is
the exact `.po` path, which is intentionally resolved at runtime from `lingui:extract`
output (Task 3 Step 1) rather than guessed — flagged explicitly, not a placeholder.

**Type consistency:** `StockSummary` props `{ lowCount: number; stockValueIDR: number }`
defined in Task 1 and called with exactly those in Task 2. `counts.stockValueIDR` added
in Task 2 Step 2 and read in Task 2 Step 3. `formatIDR` import source flagged with a
verify-before-assume note (Task 1). Consistent.
