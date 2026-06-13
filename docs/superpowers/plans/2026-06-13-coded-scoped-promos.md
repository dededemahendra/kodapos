# Coded + Scoped Promotions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). Money path (discount math) → TDD + adversarial review of the scoped-discount computation.

**Goal:** Promotions gain (a) optional coupon **codes** and (b) **scoping** to specific items or categories (today: global percent/fixed on the whole order). A cashier can enter a code at checkout; a scoped promo discounts only its matching lines.

**Locked decisions:** codes are case-insensitive (stored UPPERCASE, unique per cafe); a code is resolved to a `promoId` on the **frontend** (via `resolveByCode`), so `buildOrder`'s arg shape is unchanged; a scoped discount applies to the **matching lines' subtotal** (a shared pure helper used by server + live preview); a scoped promo with no matching lines yields a 0 discount (still applicable). No expiry/usage-limit/QR this slice.

**Copy rules (project):** UI strings Bahasa via the catalog; **no em-dash `—`/`--`**; empty states use shadcn `Empty` (icon + heading + description). Receipt content English/off-catalog.

---

## File Structure
- **Modify:** `convex/schema.ts` (promotions fields + index; `orders.appliedPromo.scope`), `convex/promotions.ts` (code/scope validators + `create`/`update`/`list` + `resolveByCode`), `convex/lib/pricing.ts` (`scopedSubtotalIDR` helper), `convex/lib/sale.ts` (scoped discount + snapshot), `tests/convex/promotions.test.ts` + `tests/convex/pricing.test.ts` (or a new `promo-scope.test.ts`), `src/components/promo/promo-form-dialog.tsx`, `src/routes/_pos/promos.tsx`, `src/components/sale/cart-reducer.ts`, `src/components/sale/sale-screen.tsx`, `src/components/sale/promo-picker-dialog.tsx`, `src/components/sale/cart-pane.tsx`.
- **i18n:** `src/locales/{id,en}/messages.po`.

---

### Task 1: Backend — code + scope + scoped discount (TDD)
**Files:** modify `convex/schema.ts`, `convex/promotions.ts`, `convex/lib/pricing.ts`, `convex/lib/sale.ts`; test `tests/convex/promotions.test.ts` + a `tests/convex/promo-scope.test.ts`.

READ: `convex/promotions.ts` (`promotionDoc`, `assertPromo`, `create`/`update`/`list`/`archive`), `convex/lib/pricing.ts` `promoDiscountIDR`, `convex/lib/sale.ts` the promo block (~lines 212–225: fetch promo by `promoId`, `promoDiscountIDR(type,value,subtotalIDR)`, write `appliedPromo`) + how each line's item (and its `categoryId`) is available during line build, `convex/menu/items.ts`/`categories.ts` list (for target validation), `tests/convex/promotions.test.ts` + the sale tests setup.

- [ ] **Step 1: schema** — `promotions`: add `code: v.optional(v.string())`, `scope: v.optional(v.union(v.literal('order'), v.literal('item'), v.literal('category')))` (absent = 'order'), `targetItemIds: v.optional(v.array(v.id('menuItems')))`, `targetCategoryIds: v.optional(v.array(v.id('categories')))`; add index `by_cafe_code` (`['cafeId','code']`). `orders.appliedPromo`: add `scope: v.optional(v.union('order'|'item'|'category'))`.
- [ ] **Step 2: pure helper** `convex/lib/pricing.ts` — `scopedSubtotalIDR(lines: Array<{ menuItemId; categoryId; lineTotalIDR }>, scope: 'order'|'item'|'category'|undefined, targetItemIds?: string[], targetCategoryIds?: string[]): number` → for `order`/undefined: sum all `lineTotalIDR`; `item`: sum where `menuItemId ∈ targetItemIds`; `category`: sum where `categoryId ∈ targetCategoryIds`. Pure, exported.
- [ ] **Step 3: FAILING tests** (`tests/convex/promo-scope.test.ts` for the helper + `promotions.test.ts` for the mutations):
  - `scopedSubtotalIDR`: order → full sum; item → only matching lines; category → only matching lines; no match → 0.
  - `promotions.create` with `code: 'summer20'` stores it UPPERCASE (`SUMMER20`); a second promo with the same code (any case) in the cafe → rejects (`/kode/i`); a different cafe with the same code is allowed.
  - `create`/`update` with `scope:'item'` + empty `targetItemIds` → rejects (`/pilih item|target/i`); with a foreign item id → rejects; valid targets stored.
  - `resolveByCode({ code })` → returns the active promo (case-insensitive) with its scope/targets; archived/unknown → null; cafe-scoped.
  - **Scoped discount end-to-end** (sale test): a cafe with item A (cat X) + item B (cat Y); a `scope:'item'` 10% promo targeting A; ring an order with A and B → `discountIDR` = 10% of A's line total only (NOT the whole subtotal); `appliedPromo.scope === 'item'`. A `category` promo targeting X behaves the same. An `order` promo unchanged. A scoped promo whose targets aren't in the cart → discount 0, order still completes.
  Run → confirm FAIL.
- [ ] **Step 4: implement**
  - `convex/promotions.ts`: `assertPromoCode(code)` (trim, UPPERCASE, 3–20 chars `[A-Z0-9_-]`, throw `'Kode promo tidak valid.'`); a uniqueness check via `by_cafe_code` excluding the current id (throw `'Kode promo sudah dipakai.'`); `assertPromoScope(ctx, cafeId, scope, targetItemIds, targetCategoryIds)` (when `item`/`category`, require non-empty targets `'Pilih target promo.'` + `requireOwned` each target). `create`/`update` accept + validate + store `code`/`scope`/targets (omit code when blank). `list` returns the new fields (extend `promotionDoc`). `resolveByCode` query → the active promo doc or null (UPPERCASE the input, query `by_cafe_code`, exclude archived). 
  - `convex/lib/sale.ts`: in the promo block, build `scopeLines` (each `{ menuItemId, categoryId, lineTotalIDR }` — capture `categoryId` from the item already fetched per line); `const scoped = scopedSubtotalIDR(scopeLines, promo.scope, promo.targetItemIds, promo.targetCategoryIds); discountIDR = promoDiscountIDR(promo.type, promo.value, scoped);` write `appliedPromo` incl. `scope: promo.scope ?? 'order'`. (Manual discount + loyalty stay post-promo, unchanged.)
- [ ] **Step 5: register-free + tests + commit** — additions to registered modules (no api.d.ts change beyond the dev watcher); `pnpm test` + `pnpm typecheck` PASS. Commit:
  `git add convex/schema.ts convex/promotions.ts convex/lib/pricing.ts convex/lib/sale.ts tests/convex/promo-scope.test.ts tests/convex/promotions.test.ts && git commit -m "feat(promos): coupon codes + item/category scoping + scoped discount"`
  > Do NOT run codegen.

---

### Task 2: Admin form — code + scope + target multi-select
**Files:** modify `src/components/promo/promo-form-dialog.tsx`, `src/routes/_pos/promos.tsx`.

READ: `promo-form-dialog.tsx` (the name/type/value fields + create/update calls + seed-on-edit), `promos.tsx` (the DataTable + a column for code/scope), `convex/menu/items.ts` `list` + `categories.ts` `list` (target options), `src/components/ui/{checkbox,popover,select,input,badge}`.

- [ ] **Step 1: form** — add: a `code` `Input` (optional, uppercases on change, maxLength 20, hint "Opsional"); a `scope` `Select` (Seluruh order / Item tertentu / Kategori tertentu); when `scope==='item'` a target multi-select (a `Popover` with a `Checkbox` list of `api.menu.items.list` active items); when `scope==='category'` the same from `api.menu.categories.list`. Validate before submit: scoped → ≥1 target. Thread `code`/`scope`/`targetItemIds`/`targetCategoryIds` into the `create`/`update` args; seed all from the promo on edit.
- [ ] **Step 2: list** — `promos.tsx`: add a column showing the `code` (a `Badge` if set) and the scope label (Order / Item / Kategori). 
- [ ] **Step 3:** typecheck + test PASS. Commit:
  `git add src/components/promo/promo-form-dialog.tsx src/routes/_pos/promos.tsx && git commit -m "feat(promos): admin code + scope + target picker"`

---

### Task 3: Checkout — coupon entry + scoped preview
**Files:** modify `src/components/sale/cart-reducer.ts`, `src/components/sale/sale-screen.tsx`, `src/components/sale/promo-picker-dialog.tsx`, `src/components/sale/cart-pane.tsx`.

READ: `cart-reducer.ts` (`CartPromo` type ~23–28 + `setPromo`), `sale-screen.tsx` (the promo preview ~167–171 using `promoDiscountIDR(promo.type,promo.value,subtotal)` + `items` from `listForSale` which carry `categoryId`), `promo-picker-dialog.tsx` (the list + onSelect), `cart-pane.tsx` (the applied-promo display + Tambah/Hapus promo).

- [ ] **Step 1: CartPromo** — extend the `CartPromo` type with `scope?: 'order'|'item'|'category'`, `targetItemIds?: string[]`, `targetCategoryIds?: string[]`; `promo-picker-dialog` `onSelect` passes them through (the `list` now returns them).
- [ ] **Step 2: scoped preview** — `sale-screen.tsx`: replace the flat `promoDiscountIDR(type,value,subtotal)` preview with `promoDiscountIDR(type, value, scopedSubtotalIDR(cartScopeLines, promo.scope, promo.targetItemIds, promo.targetCategoryIds))` where `cartScopeLines` maps each cart line to `{ menuItemId, categoryId (looked up from the loaded `items`), lineTotalIDR }`. (Import `scopedSubtotalIDR` from `convex/lib/pricing`.) This keeps the on-screen discount accurate for scoped promos; the server recomputes authoritatively.
- [ ] **Step 3: coupon entry** — `promo-picker-dialog.tsx`: add a "Masukkan kode" `Input` + "Pakai" button at the top; on submit call `useQuery`/a fetch of `api.promotions.resolveByCode` (use `useConvex().query` for an imperative lookup) → if a promo returns, `onSelect(promo)` + close; else show "Kode tidak valid." inline. Keep the existing active-promo list below.
- [ ] **Step 4:** typecheck + test PASS. Commit:
  `git add src/components/sale/cart-reducer.ts src/components/sale/sale-screen.tsx src/components/sale/promo-picker-dialog.tsx src/components/sale/cart-pane.tsx && git commit -m "feat(sale): coupon-code entry + scoped promo preview"`

UI strings Bahasa via `<Trans>`/`t\`...\``, no em-dash/`--`.

---

### Task 4: i18n
New BI: `Kode promo`, `Masukkan kode`, `Pakai`, `Kode tidak valid.`, `Seluruh order`, `Item tertentu`, `Kategori tertentu`, `Pilih target`, `Opsional`, scope/badge labels. Server-thrown (`'Kode promo tidak valid.'`/`'Kode promo sudah dipakai.'`/`'Pilih target promo.'`) off-catalog.
- [ ] `pnpm lingui:extract`; fill `en` (`Promo code`, `Enter code`, `Apply`, `Invalid code.`, `Whole order`, `Specific items`, `Specific categories`, `Choose targets`, `Optional`, …) for every new empty (no em-dash); watch collisions; `pnpm lingui:compile` → en 0 missing. Commit `src/locales`.

---

### Task 5: Final verification + adversarial review
- [ ] `pnpm typecheck` PASS; `pnpm test` PASS; `pnpm lingui:compile` en 0 missing; clean tree.
- [ ] code-reviewer on the discount path (`convex/lib/sale.ts` promo block + `scopedSubtotalIDR` + `resolveByCode` + the form/checkout): scoped discount sums ONLY matching lines (item by menuItemId, category by the item's categoryId), clamped [0, scopedSubtotal]; an order-scope promo is unchanged; the server recomputes (never trusts the client preview/scope — it reads the promo doc by id); code uniqueness is per-cafe + case-insensitive and excludes self on update; a scoped promo with no cart match yields 0 (no negative/oversized discount); foreign target ids rejected at create; `appliedPromo.scope` snapshot correct; manual discount + loyalty still apply post-promo without double-counting; the preview matches the server result. Address findings; re-verify.
- [ ] **Manual sanity:** make a 10% "item" promo on Espresso; ring Espresso + Croissant → only Espresso is discounted, on-screen and on the receipt; a coupon code applies the same promo via the code input; a wrong code shows "Kode tidak valid"; a duplicate code is rejected in the admin form.

---

## Self-Review
**Spec coverage:** schema code/scope/targets + index + appliedPromo.scope (T1); validators + resolveByCode + scoped discount in buildOrder + pure helper (T1); admin form code/scope/targets + list column (T2); CartPromo scope + scoped preview + coupon entry (T3); tests helper + code-uniqueness + scope-validation + scoped-discount-e2e (T1); i18n (T4); adversarial review (T5). ✓
**Placeholder scan:** "mirror promo form / promoDiscountIDR / sale tests". Else spec code.
**Type consistency:** `scopedSubtotalIDR(lines, scope, targetItemIds?, targetCategoryIds?)` shared by server (buildOrder) + client (sale-screen); `resolveByCode({code}) → promo doc incl scope/targets`; `CartPromo` carries scope/targets; `create`/`update` accept code/scope/targets; `appliedPromo.scope` snapshot. Code UPPERCASE + per-cafe unique. ✓
