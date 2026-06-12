# Loyalty Tiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Spend-based loyalty tiers granting an earn multiplier. Optional/additive — no tiers → behavior unchanged.

**Architecture:** `LoyaltyConfig.tiers` + helpers (`tierFor`/`earnMultiplierFor`/`nextTierFor`) in `convex/lib/loyalty.ts`; `settleSale` multiplies earned points by the customer's (pre-order) tier multiplier; `loyalty.{getConfig,updateConfig}` carry+validate tiers; a tier editor on `/loyalty` + a tier badge on the customer detail.

---

## File Structure
- **Modify:** `convex/lib/loyalty.ts`, `convex/schema.ts`, `convex/loyalty.ts`, `convex/lib/sale.ts`, `src/routes/_pos/loyalty.tsx`, the customer-detail UI (find it — `src/routes/_pos/customers.tsx` or a customer-detail component), `tests/convex/loyalty.test.ts`.
- **i18n:** `src/locales/{id,en}/messages.po`.

---

### Task 1: Backend — tiers + earn multiplier (TDD)
**Files:** modify `convex/lib/loyalty.ts`, `convex/schema.ts`, `convex/loyalty.ts`, `convex/lib/sale.ts`; test `tests/convex/loyalty.test.ts`.

READ: `convex/lib/loyalty.ts` (LoyaltyConfig, DEFAULT_LOYALTY, pointsEarned), `convex/loyalty.ts` (configValidator, getConfig, updateConfig), `convex/lib/sale.ts` (the `const earned = customer ? pointsEarned(...) : 0;` line + how `loyaltyCfg` is built as `{ ...DEFAULT_LOYALTY, ...(settings?.loyalty ?? {}) }`), `tests/convex/loyalty.test.ts` + a sale test that attaches a customer + earns points (for the multiplier test seeding).

- [ ] **Step 1: lib/loyalty.ts** — add `LoyaltyTier` type; add `tiers?: LoyaltyTier[]` to `LoyaltyConfig`; add `tierFor`, `earnMultiplierFor`, `nextTierFor` (exact code in the spec).
- [ ] **Step 2: schema** — `cafeSettings.loyalty` object: add `tiers: v.optional(v.array(v.object({ name: v.string(), minSpendIDR: v.number(), earnMultiplier: v.number() })))`.
- [ ] **Step 3: FAILING tests** (`tests/convex/loyalty.test.ts`):
  - `updateConfig` with valid `tiers` persists them (via `getConfig`), stored sorted by minSpendIDR; rejects `earnMultiplier < 1`, `> 10`, negative `minSpendIDR`, and duplicate thresholds.
  - earn multiplier: configure tiers `[{ name:'Gold', minSpendIDR:100000, earnMultiplier:2 }]`; a customer with `totalSpentIDR >= 100000` (set it up — create customer + run a prior sale or directly patch via t.run) earns `2 × pointsEarned` on a sale (assert `order.pointsEarned` + customer `pointsBalance` delta); a customer below earns `1×`.
  - `tierFor`/`earnMultiplierFor`/`nextTierFor` unit cases (boundary at threshold; below; highest-eligible; next tier).
  - no tiers → earn unchanged.
  Run → confirm FAIL.
- [ ] **Step 4: implement** — `convex/loyalty.ts`: add `tiers` (optional) to `configValidator` (used by both getConfig + updateConfig); in `updateConfig` validate tiers (name 1–24, minSpendIDR int ≥0, earnMultiplier finite 1..10, no duplicate minSpendIDR → `'Ambang tier tidak boleh sama.'`) and store sorted by minSpendIDR asc. `convex/lib/sale.ts`: change the earned line to multiply by `earnMultiplierFor(customer.totalSpentIDR, loyaltyCfg.tiers)` (import the helper), wrapped in `Math.floor`. Confirm `loyaltyCfg` carries `tiers`.
- [ ] **Step 5: tests + typecheck + commit**
  `pnpm test tests/convex/loyalty.test.ts` + full `pnpm test` PASS (existing loyalty/void/sale tests green — no tiers ⇒ ×1). `pnpm typecheck` PASS. Commit:
  `git add convex/lib/loyalty.ts convex/schema.ts convex/loyalty.ts convex/lib/sale.ts tests/convex/loyalty.test.ts && git commit -m "feat(loyalty): spend-based tiers + earn multiplier"`

---

### Task 2: Frontend — tier editor + customer badge
**Files:** modify `src/routes/_pos/loyalty.tsx`; the customer-detail UI.

READ: `src/routes/_pos/loyalty.tsx` (the `ConfigDraft` state + the save flow calling `api.loyalty.updateConfig`); the customer detail view (grep for `api.customers.getDetail` — likely `src/routes/_pos/customers.tsx` or a `customer-detail` component) for where to add the badge; `convex/lib/loyalty.ts` (`tierFor`/`nextTierFor` to import client-side); `~/lib/money` (`formatIDR`).

- [ ] **Step 1: tier editor (`loyalty.tsx`)** — extend `ConfigDraft` with `tiers: LoyaltyTier[]` (seed from `getConfig().tiers ?? []`). Add a "Tier" section: rows of (name `Input`, minSpend `Input` numeric, multiplier `Input` numeric step 0.1), "+ Tambah tier" + per-row remove. On save, include `tiers` in the `updateConfig` call (parse minSpend→int, multiplier→float; drop empty-name rows). Client-validate multiplier ≥ 1; show server errors via the existing error path.
- [ ] **Step 2: customer tier badge** — in the customer detail view: `const cfg = useQuery(api.loyalty.getConfig, {})`; `const tier = tierFor(customer.totalSpentIDR, cfg?.tiers)`; render a `Badge` with `{tier.name} · {tier.earnMultiplier}× poin` when `tier`; and a `nextTierFor(...)` progress hint `Rp {formatIDR(next.minSpendIDR - customer.totalSpentIDR)} lagi ke {next.name}` when a next tier exists. Nothing when no tiers.
- [ ] **Step 3: typecheck + test + commit**
  `pnpm typecheck` PASS; `pnpm test` PASS. Commit:
  `git add src/routes/_pos/loyalty.tsx <customer-detail file> && git commit -m "feat(loyalty): tier editor + customer tier badge"`

---

### Task 3: i18n
New: `Tier`, `Tambah tier`, `Nama tier`, `Belanja minimum`, `Pengali poin`, `{0}× poin`,
`Rp {0} lagi ke {1}` (match emitted placeholders), `Pengali poin minimal 1.` (+ reuse existing).
- [ ] `pnpm lingui:extract`; fill `en` (`Tier`, `Add tier`, `Tier name`, `Minimum spend`, `Point multiplier`, `{0}× points`, `Rp {0} to {1}`, `Point multiplier must be at least 1.`) + any other new empties; `pnpm lingui:compile` → en 0 missing. Commit `src/locales`. (Watch the `Jumlah`/shared collisions — don't refill.)

---

### Task 4: Final verification
- [ ] `pnpm typecheck` → PASS; `pnpm test` → PASS; `pnpm lingui:compile` → en 0 missing; `git status` clean (no route change → routeTree unaffected).
- [ ] **Manual sanity:** on `/loyalty` add a Gold tier (min Rp 100.000, ×2); a customer who's spent ≥ Rp 100.000 shows a "Gold · 2× poin" badge on their detail and earns double points on the next sale; a new customer earns the base rate; removing all tiers restores the base behavior.

---

## Self-Review
**Spec coverage:** tier type + helpers (T1); schema tiers (T1); config validate+persist sorted (T1); settleSale multiplier off pre-order spend (T1); editor + customer badge (T2); tests for persist/validate/multiplier/unit/back-compat/void (T1); i18n (T3). ✓
**Placeholder scan:** test seeding "set totalSpentIDR via prior sale or t.run"; customer-detail file "grep getDetail". Else concrete code in the spec.
**Type consistency:** `LoyaltyTier {name,minSpendIDR,earnMultiplier}` identical in lib + schema + configValidator + the editor. `earnMultiplierFor(totalSpentIDR, tiers)` consumed in settleSale (T1) + `tierFor`/`nextTierFor` in the customer badge (T2). `getConfig` now returns `tiers?` consumed by both UIs. void reverses stored `pointsEarned` (no change). ✓
