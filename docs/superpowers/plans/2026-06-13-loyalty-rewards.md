# Loyalty Rewards Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). Money + loyalty-points path → TDD + adversarial review.

**Goal:** A catalog of named loyalty **rewards** (a points cost → a fixed discount, e.g. "Free Latte" = 120 pts for Rp 25.000 off) that a cashier redeems for a selected customer at checkout, instead of (mutually exclusive with) free-form points-as-cash. Reuses the existing redemption plumbing: a reward resolves to `pointsRedeemed`/`pointsRedeemedIDR`.

**Locked decisions:** a reward = `{ name, pointsCost, discountIDR }` (a "free item" is modelled as the discount equal to that item's price; no line-level mechanics). Reward redemption is mutually exclusive with free-form `redeemPoints` in one sale. A reward whose `discountIDR > afterPromo` is rejected (not silently clamped). Requires a selected customer with enough points.

**Copy rules (project):** UI Bahasa via the catalog; **no em-dash `—`/`--`**; empty states use shadcn `Empty` (icon + heading + description).

---

## File Structure
- **Create:** `convex/loyaltyRewards.ts` (CRUD), `src/components/loyalty/reward-form-dialog.tsx`, `tests/convex/loyalty-rewards.test.ts`.
- **Modify:** `convex/schema.ts` (`loyaltyRewards` table), `convex/lib/sale.ts` (`redeemRewardId`), `convex/orders.ts` + the payment mutation arg passthrough if needed, `convex/_generated/api.d.ts`, `src/routes/_pos/loyalty.tsx` (rewards section), `src/components/sale/customer-section.tsx` (reward picker), the `CustomerSelection` type + the 3 payment dialogs (`cash-payment-dialog.tsx`, `qris-static-payment-dialog.tsx`, `split-payment-dialog.tsx`) passthrough, `src/components/sale/use-payment-totals.ts` (reward redeem preview).
- **i18n:** `src/locales/{id,en}/messages.po`.

---

### Task 1: Backend — loyaltyRewards table + CRUD + redeemRewardId in buildOrder (TDD)
**Files:** create `convex/loyaltyRewards.ts`, `tests/convex/loyalty-rewards.test.ts`; modify `convex/schema.ts`, `convex/lib/sale.ts`, the `saleArgs` validator, `convex/_generated/api.d.ts`.

READ: `convex/lib/sale.ts` the loyalty redemption block (~lines 303-323: `redeemPoints` → validates blocks + `pointsBalance` → `pointsRedeemed`/`pointsRedeemedIDR`; how those flow into `discountIDR` + `settleSale` balance deduction + the redeem txn), the `saleArgs` validator (~19-32), `convex/loyalty.ts` (`getConfig`/`updateConfig`/`list` patterns), `convex/lib/loyalty.ts`, `convex/lib/auth.ts`, `tests/convex/loyalty.test.ts` / `orders.test.ts` (setup: a customer with a points balance + a paid order).

- [ ] **Step 1: schema** — `loyaltyRewards: defineTable({ cafeId, name: v.string(), pointsCost: v.number(), discountIDR: v.number(), archived: v.boolean(), createdAt: v.number() }).index('by_cafe_active', ['cafeId','archived'])`.
- [ ] **Step 2: `convex/loyaltyRewards.ts`** (owner-gated) — `list({ includeArchived? })`, `create({ name, pointsCost, discountIDR })` (assert name 1-60, pointsCost int>0, discountIDR int>0), `update({ id, name, pointsCost, discountIDR })`, `archive({ id })`. Plus `listForCustomer({ customerId })` → active rewards the customer can afford (`pointsCost <= customer.pointsBalance`), for the checkout picker.
- [ ] **Step 3: buildOrder** — add `redeemRewardId: v.optional(v.id('loyaltyRewards'))` to `saleArgs`. In the loyalty block: if `args.redeemRewardId`:
  - require `!args.redeemPoints` (mutually exclusive, else `'Pilih reward atau tukar poin, tidak keduanya.'`).
  - require `args.customerId` (else `'Pilih pelanggan untuk menukar reward.'`).
  - resolve the reward via `requireOwned`; reject archived.
  - require `reward.pointsCost <= customer.pointsBalance` (`'Poin tidak mencukupi.'`).
  - require `reward.discountIDR <= afterPromo` (`'Reward melebihi total.'`).
  - set `pointsRedeemed = reward.pointsCost`, `pointsRedeemedIDR = reward.discountIDR`. (The rest of the existing redemption flow applies the discount + deducts the balance + records the redeem txn.)
- [ ] **Step 4: FAILING tests** (`tests/convex/loyalty-rewards.test.ts`):
  - CRUD: `create`/`list`/`update`/`archive`; validation (name, pointsCost>0, discountIDR>0); owner-scope.
  - `listForCustomer`: returns only affordable active rewards for the customer's balance.
  - redemption e2e (cash sale): a customer with 200 pts; a reward (120 pts → Rp 25.000 off); ring an order (afterPromo ≥ 25.000) with `redeemRewardId` → order `pointsRedeemedIDR === 25000`, `discountIDR` includes it, `totalIDR` reduced; after `settleSale` the customer balance dropped by 120 and a redeem `loyaltyTransactions` row exists.
  - reject: reward with insufficient points (balance 100, cost 120) → throws `/poin/i`; `discountIDR > afterPromo` → throws `/melebihi/i`; `redeemRewardId` + `redeemPoints` together → throws; `redeemRewardId` without a customer → throws.
  Run → confirm FAIL.
- [ ] **Step 5: implement + register + commit** — confirm api.d.ts gained `loyaltyRewards`; `pnpm test` + `pnpm typecheck` PASS. Commit:
  `git add convex/schema.ts convex/loyaltyRewards.ts convex/lib/sale.ts convex/_generated/api.d.ts tests/convex/loyalty-rewards.test.ts && git commit -m "feat(loyalty): rewards catalog + reward redemption at checkout"`
  > Do NOT run codegen.

---

### Task 2: Admin — rewards section on the loyalty page
**Files:** create `src/components/loyalty/reward-form-dialog.tsx`; modify `src/routes/_pos/loyalty.tsx`.

READ: `src/routes/_pos/loyalty.tsx` (the page layout, config section, `RequirePermission`/perm gate), `src/components/promo/promo-form-dialog.tsx` (a create/edit dialog to mirror), `src/components/ui/{data-table,dialog,input,button,empty}`.

- [ ] **Step 1: `reward-form-dialog.tsx`** — create/edit: `name` Input, `pointsCost` numeric Input, `discountIDR` numeric Input; validate; submit → `api.loyaltyRewards.create`/`update`; toast; reset+close.
- [ ] **Step 2: loyalty page** — add a "Reward" section: `api.loyaltyRewards.list` → a DataTable (name, points, discount) + a "Tambah reward" button + row actions (Ubah/Arsipkan via ConfirmDialog). `Empty` (icon `Gift`, title + desc) when none. Reuse the page's existing gating.
- [ ] **Step 3:** typecheck + test PASS. Commit:
  `git add src/components/loyalty/reward-form-dialog.tsx src/routes/_pos/loyalty.tsx && git commit -m "feat(loyalty): rewards admin section"`

---

### Task 3: Checkout — reward picker in the customer section
**Files:** modify `src/components/sale/customer-section.tsx`, the `CustomerSelection` type, `src/components/sale/cash-payment-dialog.tsx`, `src/components/sale/qris-static-payment-dialog.tsx`, `src/components/sale/split-payment-dialog.tsx`, `src/components/sale/use-payment-totals.ts`.

READ: `customer-section.tsx` (how a customer is selected + the free-form `redeemPoints` control + the `CustomerSelection` shape it emits), each payment dialog (how `redeemPoints` is spread into the create-sale args ~the `...(customer.redeemPoints>0 ? {redeemPoints}:{})` line), `use-payment-totals.ts` (the `redeemIDR` preview from `redeemPoints`).

- [ ] **Step 1: `CustomerSelection`** — add `redeemRewardId?: Id<'loyaltyRewards'>` and `redeemRewardIDR?: number` (the discount, for the preview). 
- [ ] **Step 2: customer-section** — when a customer is selected, fetch `api.loyaltyRewards.listForCustomer({ customerId })`; render a "Tukar reward" picker (a Select/list of affordable rewards showing name + points + discount). Selecting a reward sets `{ redeemRewardId, redeemRewardIDR: reward.discountIDR, redeemPoints: 0 }` (and disables/clears the free-form redeemPoints control — mutually exclusive); choosing "Tanpa reward" clears it. 
- [ ] **Step 3: payment dialogs** — each: spread `...(customer.redeemRewardId ? { redeemRewardId: customer.redeemRewardId } : {})` into the create-sale args (alongside the existing redeemPoints spread, which is now mutually exclusive).
- [ ] **Step 4: preview** — `use-payment-totals.ts`: when `redeemRewardIDR` is set, use it as the `redeemIDR` (instead of the free-form `redemptionIDR(redeemPoints)`), so the on-screen total reflects the reward.
- [ ] **Step 5:** typecheck + test PASS. Commit:
  `git add src/components/sale/customer-section.tsx src/components/sale/cash-payment-dialog.tsx src/components/sale/qris-static-payment-dialog.tsx src/components/sale/split-payment-dialog.tsx src/components/sale/use-payment-totals.ts && git commit -m "feat(sale): reward picker at checkout"`

UI Bahasa via `<Trans>`/`t\`...\``, no em-dash/`--`.

---

### Task 4: i18n
New BI: `Reward`, `Tambah reward`, `Tukar reward`, `Tanpa reward`, `Poin`, `Diskon reward`, `Belum ada reward.`, `{0} poin`. Server-thrown redemption messages off-catalog.
- [ ] `pnpm lingui:extract`; fill `en` (`Reward`, `Add reward`, `Redeem reward`, `No reward`, `Points`, `Reward discount`, `No rewards yet.`, `{0} points`) for every new empty (no em-dash); watch collisions; `pnpm lingui:compile` → en 0 missing. Commit `src/locales`.

---

### Task 5: Final verification + adversarial review
- [ ] `pnpm typecheck` PASS; `pnpm test` PASS; `pnpm lingui:compile` en 0 missing; clean tree.
- [ ] code-reviewer on the redemption path (`convex/lib/sale.ts` reward block + `loyaltyRewards` + the checkout wiring): a reward deducts EXACTLY `pointsCost` from the balance (once, in settleSale) and discounts EXACTLY `discountIDR`; mutual exclusivity with `redeemPoints` enforced server-side (a client sending both is rejected); insufficient points / over-total / no-customer / archived-reward / foreign-reward all rejected; the discount can't drive the total negative; the reward is server-authoritative (resolved by id, never trusts a client discount amount); the preview matches the server. Address findings; re-verify.
- [ ] **Manual sanity:** define a reward; at checkout pick a customer with enough points + the reward → the total drops by the reward discount, the order completes, the customer's points drop by the cost; a customer without enough points can't pick it; you can't combine a reward with free-form points.

---

## Self-Review
**Spec coverage:** loyaltyRewards table + CRUD + listForCustomer (T1); redeemRewardId in buildOrder reusing pointsRedeemed/IDR + guards (T1); admin section (T2); checkout picker + CustomerSelection + dialogs + preview (T3); tests CRUD + redemption-e2e + rejects (T1); i18n (T4); adversarial review (T5). ✓
**Placeholder scan:** "mirror promo form / loyalty mutations / redeemPoints wiring". Else spec code.
**Type consistency:** `loyaltyRewards.create/update({name,pointsCost,discountIDR})`; `listForCustomer({customerId})→ affordable`; `redeemRewardId` in saleArgs → resolves to `pointsRedeemed`/`pointsRedeemedIDR`; `CustomerSelection.redeemRewardId/redeemRewardIDR` → dialogs + preview. Mutually exclusive with redeemPoints. ✓
