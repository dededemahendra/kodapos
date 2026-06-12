# Loyalty Tiers Design Spec

**Date:** 2026-06-11
**Branch:** `feat/loyalty-tiers` (off `main`)

## Context

The loyalty program earns/redeems points at a flat rate. This slice adds **tiers** — a
customer reaches a tier by lifetime spend (`customer.totalSpentIDR`) and that tier grants a
**higher earn multiplier** (e.g. Gold = 1.5× points). Tiers are an optional, additive layer:
with no tiers configured, behavior is exactly as today (multiplier 1).

The only checkout-path change is multiplying the points a customer earns by their tier's
multiplier. Redemption, cash, and all totals are unchanged. Points are a liability (not
cash), so this is money-adjacent — built TDD-first with a focused test, but lighter than the
cash-path slices.

## Tier model

A tier = `{ name: string; minSpendIDR: number; earnMultiplier: number }`. A customer's tier
is the **highest** tier whose `minSpendIDR ≤ customer.totalSpentIDR`; below all thresholds (or
no tiers) → no tier, multiplier 1. The tier is evaluated on the customer's spend **before**
the current order (their standing when they buy).

## Shared logic — `convex/lib/loyalty.ts`
Extend `LoyaltyConfig` + add helpers:
```ts
export type LoyaltyTier = { name: string; minSpendIDR: number; earnMultiplier: number };
export type LoyaltyConfig = {
  enabled: boolean; earnRatePerIDR: number; redeemBlockPoints: number; redeemBlockIDR: number;
  tiers?: LoyaltyTier[];
};
// DEFAULT_LOYALTY: tiers omitted.

/** Highest tier whose minSpendIDR ≤ spend; null if none. */
export function tierFor(totalSpentIDR: number, tiers: LoyaltyTier[] | undefined): LoyaltyTier | null {
  if (!tiers || tiers.length === 0) return null;
  const eligible = tiers.filter((t) => totalSpentIDR >= t.minSpendIDR);
  if (eligible.length === 0) return null;
  return eligible.reduce((best, t) => (t.minSpendIDR > best.minSpendIDR ? t : best));
}
export function earnMultiplierFor(totalSpentIDR: number, tiers: LoyaltyTier[] | undefined): number {
  return tierFor(totalSpentIDR, tiers)?.earnMultiplier ?? 1;
}
/** The next tier up (lowest minSpend strictly above spend), for progress display; null if at top. */
export function nextTierFor(totalSpentIDR: number, tiers: LoyaltyTier[] | undefined): LoyaltyTier | null {
  if (!tiers) return null;
  const above = tiers.filter((t) => t.minSpendIDR > totalSpentIDR).sort((a, b) => a.minSpendIDR - b.minSpendIDR);
  return above[0] ?? null;
}
```

## Data model — `convex/schema.ts`
`cafeSettings.loyalty` gains:
```ts
tiers: v.optional(v.array(v.object({
  name: v.string(), minSpendIDR: v.number(), earnMultiplier: v.number(),
}))),
```

## Backend

### Earn multiplier at checkout — `convex/lib/sale.ts` `settleSale`
Currently `const earned = customer ? pointsEarned(earnBase, loyaltyCfg) : 0;`. Change to apply
the tier multiplier off the customer's **pre-order** spend:
```ts
const earned = customer
  ? Math.floor(pointsEarned(earnBase, loyaltyCfg) * earnMultiplierFor(customer.totalSpentIDR, loyaltyCfg.tiers))
  : 0;
```
(`loyaltyCfg` already merges `cafeSettings.loyalty` over `DEFAULT_LOYALTY` in `buildOrder`;
ensure the merged cfg carries `tiers`. Verify the spread `{ ...DEFAULT_LOYALTY, ...(settings?.loyalty ?? {}) }`
includes `tiers` — it does via the optional field.) The stored `order.pointsEarned` is the
final (multiplied) value, so `reverseSettledSale` (void) already reverses it correctly — no
void change.

### Config — `convex/loyalty.ts`
- `configValidator` + `getConfig` return: add `tiers: v.optional(v.array(...))` (same shape).
- `updateConfig`: accept `tiers`; **validate** each tier (name 1–24 chars; `minSpendIDR` a
  non-negative integer; `earnMultiplier` a finite number `≥ 1` and `≤ 10`); reject duplicate
  `minSpendIDR` thresholds (`'Ambang tier tidak boleh sama.'`); store sorted by `minSpendIDR`
  asc. Persist into `loyalty` alongside the existing fields.

## Frontend

### Tiers editor — `src/routes/_pos/loyalty.tsx`
Below the existing earn/redeem config, add a **Tier** section: a list of tier rows (name,
`minSpendIDR` input, `earnMultiplier` input e.g. `1.5`), an "+ Tambah tier" button, and a
remove ✕ per row. Seed from `getConfig().tiers ?? []`. On save (the existing save flow), pass
`tiers` to `updateConfig` (parse multiplier as a float, minSpend as int). Validate client-side
(multiplier ≥ 1; ascending thresholds) and surface server errors via the existing error path.
Keep it within the existing config form's save button.

### Customer tier display — the customer detail view
Wherever `customers.getDetail` is rendered (the `/customers` detail), show the customer's tier:
- `const cfg = useQuery(api.loyalty.getConfig, {})`; compute
  `const tier = tierFor(customer.totalSpentIDR, cfg?.tiers)` and
  `nextTierFor(...)` (import from `convex/lib/loyalty`).
- Render a tier `Badge` (the tier name + `{multiplier}× poin`) when a tier exists, and a small
  "Rp X lagi ke {nextTier.name}" progress hint (`nextTier.minSpendIDR − totalSpentIDR`) when a
  next tier exists. Nothing when no tiers configured.

> Checkout-time tier badge on the attached customer is **out of scope** (the earn multiplier
> still applies server-side; only the detail view surfaces the tier this slice).

## Testing
**`tests/convex/loyalty.test.ts` (or sale/orders test):**
- `updateConfig` persists tiers; rejects an invalid multiplier (`< 1` / `> 10`), a negative
  `minSpendIDR`, and duplicate thresholds; stores sorted.
- **Earn multiplier:** with tiers `[{Gold, minSpend: 100000, ×2}]`, a customer whose
  `totalSpentIDR ≥ 100000` earns `2× pointsEarned` on a sale (assert `order.pointsEarned` and
  the customer's `pointsBalance` increment); a customer below the threshold earns `1×`.
- `tierFor`/`earnMultiplierFor`/`nextTierFor` unit cases (boundaries: exactly at threshold →
  in tier; below → not; multiple tiers → highest eligible).
- Back-compat: no tiers configured → earn unchanged (existing loyalty tests stay green).
- A voided tiered sale reverses the multiplied `pointsEarned` exactly (customer back to prior).

Frontend (tier editor, customer badge) by typecheck + e2e smoke.

## i18n
New BI: `Tier`, `Tambah tier`, `Nama tier`, `Belanja minimum`, `Pengali poin`,
`{0}× poin`, `Rp {0} lagi ke {1}`, `Ambang tier tidak boleh sama.` (server msg, not catalog),
`Pengali poin minimal 1.`. Extract + fill `en` (`Tier`, `Add tier`, `Tier name`,
`Minimum spend`, `Point multiplier`, `{0}× points`, `Rp {0} to {1}`, …), compile.

## Conventions
- Run CI locally: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`; clean tree.
- Do NOT run codegen — schema derives; `updateConfig`/`getConfig` are existing exports; the
  tier helpers live in the already-imported `convex/lib/loyalty`.
- No new route → no `routeTree.gen.ts` change.
- `settleSale` is the earn path — keep the change to the single `earned` line; existing
  loyalty/void tests must stay green.
- Small conventional commits; PR → review → merge commit.

## Out of scope
- Tier perks beyond the earn multiplier (free items, birthday bonus, redemption discounts).
- Tier by lifetime *points* or visit count (uses lifetime spend).
- Tier downgrade windows / rolling 12-month qualification (uses cumulative `totalSpentIDR`).
- A tier-distribution report; checkout-screen tier badge; manual tier override per customer.
