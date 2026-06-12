# QR Self-Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). First UNAUTHENTICATED surface → TDD + adversarial review of `convex/public.ts` (price re-validation, auth leakage, abuse guards).

**Goal:** A public per-table QR → no-login menu/cart → submit → staff queue → Accept loads into `/sale` (pay at counter). All money/stock/kitchen stay on the authenticated path.

---

## File Structure
- **Create:** `convex/public.ts`, `convex/selfOrders.ts`, `tests/convex/self-order-public.test.ts`, `tests/convex/self-order-staff.test.ts`, `src/routes/_public/order.$token.tsx`, `src/routes/_pos/self-orders.tsx`, `src/components/sale/qr-print-dialog.tsx`, `src/components/public/*` (menu/cart UI pieces).
- **Modify:** `convex/schema.ts` (`selfOrders` table + `tables.qrToken`), `convex/tables.ts` (`ensureQrToken`), `convex/_generated/api.d.ts`, `src/components/sale/sale-screen.tsx` (selfOrder load), `src/routes/_pos.tsx` (operational prefix), `src/components/app-shared.tsx` (nav), `src/routes/_pos/tables.tsx` (QR action), `src/routeTree.gen.ts`, `package.json` (`qrcode.react`).
- **i18n:** `src/locales/{id,en}/messages.po`.

---

### Task 1: Backend — schema + public intake (`convex/public.ts`) (TDD)
**Files:** create `convex/public.ts`, `tests/convex/self-order-public.test.ts`; modify `convex/schema.ts`, `convex/_generated/api.d.ts`.

READ: `convex/lib/sale.ts` `buildOrder` lines ~110–390 (the per-line validation: item active/in-cafe, variant, modifier min/max, `unitPriceIDR` computation — REUSE this logic for server-side pricing, but with NO auth/shift/cashier), `convex/menu/items.ts` `listForSale` (the for-sale assembly to mirror for `menuForTable`, MINUS owner bits), `convex/menu/categories.ts`, `convex/lib/heldOrder.ts` `heldLineValidator` (the denormalized line shape), `convex/lib/pricing.ts`, `convex/settings.ts` (the tax/service-charge shape), `convex/schema.ts` (`cafes`, `tables`, `cafeSettings`). NOTE: public functions must NOT call `requireOwnerCafe`.

- [ ] **Step 1: schema** — add `selfOrders` (spec shape) with `by_cafe_clientId`/`by_cafe_status`/`by_cafe_created`; add `qrToken: v.optional(v.string())` + `by_qr_token` index to `tables`.
- [ ] **Step 2: FAILING tests** (`tests/convex/self-order-public.test.ts`): set up an owner + cafe + a table (assign a `qrToken` via `t.run` or the Task-2 helper) + a recipe-less sellable item with a variant + a modifier group. Call the PUBLIC functions WITHOUT auth (a plain `t` with no identity):
  - `menuForTable({qrToken})` → cafe/table/items/categories/pricing; an archived/inactive item is excluded; the result has NO `lowStockIngredientNames`/cost/recipe fields.
  - `submitSelfOrder({qrToken, clientId, lines})` → `status:'new'`; `unitPriceIDR`/`subtotalIDR` are SERVER-computed from the menu (assert exact values; if the client could pass a price, confirm it's ignored — the arg shape only accepts ids+qty); modifier adjustments included.
  - rejects: invalid `qrToken` (`/QR/i`), empty lines, `qty` 0/100/non-int, a `variantId`/`modifierOptionId` not on the item, an item from another cafe.
  - idempotent on `clientId` (second call → same id, one row).
  - pending cap: after 8 `new` orders on the table, the 9th throws (`/terlalu banyak/i`).
  - `selfOrderStatus({selfOrderId})` → `{status:'new'}`.
  Run → confirm FAIL.
- [ ] **Step 3: implement `convex/public.ts`** — `menuForTable` (resolve table by `by_qr_token`; null on miss; assemble sellable menu + categories + pricing, owner-data-free), `submitSelfOrder` (resolve token; idempotency `by_cafe_clientId`; pending-cap via `by_cafe_status`; per-line validate+price by reusing buildOrder's logic factored into a shared helper OR inline; insert `status:'new'` + `tableName` snapshot), `selfOrderStatus` (return only `{status}`). FULL return validators. A `MAX_PENDING_SELF_ORDERS = 8` const.
- [ ] **Step 4: register + tests + commit** — api.d.ts (`public`); `pnpm test tests/convex/self-order-public.test.ts` + full PASS; `pnpm typecheck` PASS. Commit:
  `git add convex/public.ts convex/schema.ts convex/_generated/api.d.ts tests/convex/self-order-public.test.ts && git commit -m "feat(self-order): public menu + order intake (server-priced, token-scoped)"`
  > Do NOT run codegen.

---

### Task 2: Backend — staff side (`convex/selfOrders.ts` + `tables.ensureQrToken`) (TDD)
**Files:** create `convex/selfOrders.ts`, `tests/convex/self-order-staff.test.ts`; modify `convex/tables.ts`, `convex/_generated/api.d.ts`.

READ: `convex/tables.ts` (owner-gating, the table CRUD), `convex/heldOrders.ts` (the recall payload shape `getForCart` must match — read how the sale-screen consumes a held order), `convex/lib/auth.ts`; `tests/convex/tables.test.ts` setup.

- [ ] **Step 1: FAILING tests** (`tests/convex/self-order-staff.test.ts`): seed a `new` self-order (via the public `submitSelfOrder` or `t.run`). `queue()` lists it (owner-scoped — another cafe's hidden); `accept({id})`/`reject({id})` set status; `getForCart({id})` returns the cart-load line shape + `tableId`; `tables.ensureQrToken({id})` returns a 32-hex token, idempotent (second call returns the same). Run → FAIL.
- [ ] **Step 2: implement** — `convex/selfOrders.ts`: `queue` (owner, `by_cafe_status` 'new', newest-first, preview shape), `getForCart` (owner+`requireOwned`, the recall payload), `accept`/`reject` (owner+`requireOwned`, patch status + `acceptedAt`). `convex/tables.ts`: `ensureQrToken` (owner+`requireOwned`; if `table.qrToken` return it; else generate 32-hex via `globalThis.crypto.getRandomValues(new Uint8Array(16))` → hex, patch, return). Validators.
- [ ] **Step 3: tests + typecheck + commit** — `pnpm test` + `pnpm typecheck` PASS. Commit:
  `git add convex/selfOrders.ts convex/tables.ts convex/_generated/api.d.ts tests/convex/self-order-staff.test.ts && git commit -m "feat(self-order): staff queue + accept/reject + table QR token"`

---

### Task 3: Public order page — `/order/$token`
**Files:** create `src/routes/_public/order.$token.tsx` + `src/components/public/*`; modify `package.json` (`qrcode.react` is for Task 4 — skip here), `src/routeTree.gen.ts`.

READ: `src/routes/_public.tsx` (the bare layout), `src/components/sale/menu-pane.tsx` + `cart-pane.tsx` (the staff menu/cart UI to LOOSELY mirror, simplified — but the public page builds its OWN lean cart state, NOT the staff cart reducer), `src/components/sale/item-options-sheet.tsx` (or wherever variant/modifier selection happens — mirror the picker), `convex/lib/pricing.ts` (`computeOrderTotals` for the live subtotal), `src/components/ui/{sheet,button,badge,input,radio-group,checkbox,empty,spinner}`, `~/lib/money`.

- [ ] **Step 1:** `order.$token.tsx` — `createFileRoute('/_public/order/$token')`. `const menu = useQuery(api.public.menuForTable, { qrToken: token })`. States: loading (Spinner), `null` → "QR tidak valid" Empty, ok → the menu UI. Local cart state: `Array<{ key, menuItemId, name, qty, unitPriceIDR, variantId?, modifierOptionIds, modifierLabels }>`. Category-grouped item list; tap → if `variants.length || modifierGroups.length` open a picker sheet (variant radio + modifier groups honoring min/max + required), else add qty 1. A sticky cart bar (count + subtotal via summing `qty×unitPriceIDR`) → opens a review sheet (qty steppers, remove, optional `Catatan` Input, "Kirim pesanan"). Submit → `useMutation(api.public.submitSelfOrder)` with `clientId: crypto.randomUUID()` (minted once per page-load via useState/useRef so a retry is idempotent), `lines` = cart mapped to `{menuItemId, qty, variantId?, modifierOptionIds}`; on success store the `selfOrderId` + show a confirmation screen.
- [ ] **Step 2:** confirmation screen — `useQuery(api.public.selfOrderStatus, selfOrderId ? {selfOrderId} : 'skip')`; show "Pesanan terkirim · Menunggu konfirmasi" → on `accepted` "Pesanan diterima" / `rejected` "Pesanan ditolak". A "Pesan lagi" button to reset.
- [ ] **Step 3: routeTree** — `pnpm build`; confirm `grep -c "order/\\$token\|OrderToken\|order.\\$token" src/routeTree.gen.ts` > 0; stage it.
- [ ] **Step 4:** typecheck + test PASS. Commit:
  `git add src/routes/_public/order.$token.tsx src/components/public src/routeTree.gen.ts && git commit -m "feat(self-order): public QR order page (menu, cart, submit, status)"`

---

### Task 4: Staff queue page + nav + sale-screen load + table QR print
**Files:** create `src/routes/_pos/self-orders.tsx`, `src/components/sale/qr-print-dialog.tsx`; modify `src/components/sale/sale-screen.tsx`, `src/routes/_pos.tsx`, `src/components/app-shared.tsx`, `src/routes/_pos/tables.tsx`, `package.json`, `src/routeTree.gen.ts`.

READ: `src/components/sale/sale-screen.tsx` (the `recall` search-param load flow — mirror it for `selfOrder`), `src/routes/_pos.tsx` (`OPERATIONAL_PREFIXES`), `src/components/app-shared.tsx` (nav + how a badge could show), `src/routes/_pos/tables.tsx` + `src/components/tables/table-manage-dialog.tsx` (add a QR action), the print-isolation pattern (`data-print-*` + global `@media print`).

- [ ] **Step 1: dep** — `pnpm add qrcode.react` (or confirm it installs; it renders `<QRCodeSVG>` client-side, SSR-safe). Commit `package.json`/lockfile with the rest.
- [ ] **Step 2: `self-orders.tsx`** — `createFileRoute('/_pos/self-orders')`. `api.selfOrders.queue` → a reactive list (table, items preview, note, time-ago) with **Terima** (`navigate({to:'/sale', search:{selfOrder:id}})`) + **Tolak** (`reject`, ConfirmDialog). `Empty` ("Belum ada pesanan masuk.") + Spinner.
- [ ] **Step 3: operational + nav** — `_pos.tsx`: add `/self-orders` to `OPERATIONAL_PREFIXES`. `app-shared.tsx`: a "Pesanan Masuk" nav entry (icon `ConciergeBell`/`BellRing`) with a count badge from `api.selfOrders.queue` length (or a light count query).
- [ ] **Step 4: sale-screen load** — `sale-screen.tsx`: handle a `selfOrder` search param like `recall` — `getForCart({id})` → dispatch the cart `load` action with the lines → `selfOrders.accept({id})` → set the table → strip the param.
- [ ] **Step 5: table QR print** — `qr-print-dialog.tsx`: props `{ tableId, tableName, open, onOpenChange }`; on open call `ensureQrToken({id})` → render `<QRCodeSVG value={\`${window.location.origin}/order/${token}\`} />` + the table name + a "Cetak QR" button (print-isolated). Wire a "QR" action into `/tables` (the manage dialog or a per-card action).
- [ ] **Step 6: routeTree** — `pnpm build`; confirm `/self-orders` present; stage it.
- [ ] **Step 7:** typecheck + test PASS. Commit:
  `git add src/routes/_pos/self-orders.tsx src/components/sale/qr-print-dialog.tsx src/components/sale/sale-screen.tsx src/routes/_pos.tsx src/components/app-shared.tsx src/routes/_pos/tables.tsx package.json pnpm-lock.yaml src/routeTree.gen.ts && git commit -m "feat(self-order): staff queue + accept-into-register + table QR print"`

---

### Task 5: i18n
New BI across both surfaces (see spec). Public page strings + staff queue strings.
- [ ] `pnpm lingui:extract`; fill `en` (`Table {0}`, `Send order`, `Cart`, `Order sent`, `Awaiting confirmation`, `Order accepted`, `Order rejected`, `Invalid QR`, `Incoming orders`, `Accept`, `Reject`, `No incoming orders yet.`, `Print QR`, `Note (optional)`, …) for every new empty; **watch collisions** (`Terima`/`Tolak`/`Meja`/`Cetak` — verify the existing en fits, else distinct source or `context=`); `pnpm lingui:compile` → en 0 missing. Commit `src/locales`.

---

### Task 6: Final verification + adversarial review (public surface)
- [ ] `pnpm typecheck` PASS; `pnpm test` PASS; `pnpm lingui:compile` en 0 missing; `git status` clean — **routeTree.gen.ts committed**.
- [ ] code-reviewer (feature-dev:code-reviewer) on `convex/public.ts` + the schema + `submitSelfOrder` path: (1) NO `requireOwnerCafe` bypass that leaks owner data; `menuForTable` exposes only sellable fields (no cost/stock/recipe/sales); (2) **all prices recomputed server-side** — a malicious client cannot set unitPriceIDR/subtotal (the arg shape forbids it; modifiers/variant validated against the item); (3) token resolution can't be used to enumerate cafes (invalid → null, no error oracle leaking existence); (4) abuse guards real (pending cap counts correctly, idempotency by clientId, qty bounds, lines bounded); (5) `selfOrderStatus` leaks only status; (6) a self-order can ONLY become a real order via the authenticated `accept`→register path (no public path to stock/payment/kitchen); (7) owner-scope on queue/accept/reject/getForCart. Address findings; re-verify.
- [ ] **Manual sanity:** print a table QR → open `/order/<token>` (signed out) → menu loads, add an item w/ a modifier → Kirim → appears in the staff "Pesanan Masuk" queue → Terima loads it into `/sale` with the right lines+table → ring & pay normally → kitchen ticket appears. Reject works. Invalid token shows the invalid state.

---

## Self-Review
**Spec coverage:** selfOrders table + tables.qrToken (T1); public menuForTable/submitSelfOrder/selfOrderStatus, server-priced + guarded (T1); staff queue/getForCart/accept/reject + ensureQrToken (T2); public page (T3); staff queue + sale-screen load + nav + QR print + dep (T4); i18n (T5); adversarial review (T6); tests public price-integrity/guards/scope + staff transitions (T1–T2). ✓
**Placeholder scan:** "reuse buildOrder line logic", "mirror recall flow / menu-pane UI", "print-isolation pattern". Else spec code.
**Type consistency:** `submitSelfOrder({qrToken,clientId,lines:[{menuItemId,qty,variantId?,modifierOptionIds}]})` ↔ public cart; `menuForTable` shape ↔ public menu UI; `getForCart` payload ↔ the sale-screen cart `load` action (same fields as held-order recall); `queue` preview ↔ staff list; `ensureQrToken→token` ↔ `<QRCodeSVG>`; `selfOrderStatus→{status}` ↔ confirmation. Public funcs never call requireOwnerCafe; staff funcs always do. ✓
