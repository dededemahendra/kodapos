# Changelog

All notable changes to kodapos. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); dates are Asia/Jakarta.

## [Unreleased]

QRIS payments (static, dynamic, Xendit BYO + reconciliation), loyalty + tiers, gift cards, the Pro-POS suite (stock-take, order types, held orders, void, expenses, margin + P&L reports, manual discount, split tender, tables, KDS, product variants), the full-screen register shell, employee time clock, barcode scan-to-cart, and purchase orders are now shipped (see Phase 2 below). Deferred observability: Sentry (16), PostHog (17). Deferred feature backlog: per-category weather sensitivity (C2c), restock suggestion history/dismiss + nightly persistence with draft/sent status, PDF purchase orders & PDF report export, item/category-scoped + coded promotions, and the bigger infra bets pending product direction (offline mode, multi-outlet, delivery, customer display). Production Convex cutover is still pending (deploy currently targets the DEV deployment).

---

## Phase 2 · Operations — Time Clock, Barcode & Purchase Orders · 2026-06-12

Three independent owner-side operations tools. Employee **time clock** lets owners clock cashiers in and out and read an hours report off a new `timeClock` table — `clockOutAt` is left unset while a cashier is on the clock, so `currentlyIn` derives the live roster and `report` sums worked minutes per cashier over a range. **Barcode** adds a per-item `barcode` field with a unique-per-cafe guard, surfaces a scan input at the top of the cashier menu pane, and resolves a scan to a cart add client-side against the loaded sale items. **Purchase orders** introduce a create → receive → cancel lifecycle: a PO snapshots supplier + per-ingredient ordered quantities and unit costs, receiving applies an `inventoryMovements` stock entry (`reason: 'purchase'`) plus an ingredient `lastCostPerUnitIDR` update per received line and re-derives `open`/`partial`/`received` status, and cancel only stops future receipts (already-received goods stay — movements are never reversed).

### Added
- `timeClock` table (`convex/schema.ts`: `cafeId`, `cashierId`, `clockInAt`, optional `clockOutAt`; `by_cafe_clockin` + `by_cafe_cashier` indexes) and `convex/timeClock.ts` — `clockIn` / `clockOut` mutations, `currentlyIn` query (live roster), and `report` query (per-cashier worked-minutes over a range), all `requireOwnerCafe` + `requireOwned`-gated.
- `/time-clock` owner page (`src/routes/_pos/time-clock.tsx`) — clock in/out controls and an hours report; "Absensi" nav entry (`src/components/app-shared.tsx`). Tests in `tests/convex/time-clock.test.ts`.
- `menuItems.barcode` field + `by_cafe_barcode` index (`convex/schema.ts`); barcode threaded through `menu/items.ts` `create`/`update` with a duplicate-barcode guard mirroring the duplicate-name check, plus a barcode field on the item edit form (`src/components/menu/item-edit-form.tsx`).
- Scan-to-cart: a `ScanLine` scan input at the top of `MenuPane` (`src/components/sale/menu-pane.tsx`) with an `onScan` callback wired in `sale-screen.tsx` to match a scanned code against the loaded sale items and add to cart. Tests extended in `tests/convex/menu-items.test.ts`.
- `purchaseOrders` table (`convex/schema.ts`: `supplierId`/`supplierName` snapshot, `status` open/partial/received/cancelled, `lines[]` of `{ ingredientId, orderedQty, receivedQty, unitCostIDR }`, `note`; `by_cafe_status` + `by_cafe_created` indexes) and `convex/purchaseOrders.ts` — `create`, `receive` (stock movement + cost update per line, `deriveStatus`), `cancel`, `list`, `get`.
- `/inventory/purchase-orders` page (`src/routes/_pos/inventory/purchase-orders.tsx`) with `PurchaseOrderFormDialog` and `PurchaseOrderDetail` (`src/components/inventory/`) for create + receive; "Pesanan Beli" nav entry. Tests in `tests/convex/purchase-orders.test.ts`.

### Fixed
- Purchase orders reject duplicate-ingredient lines on both create and receipt, and the `list` query is bounded rather than collecting unboundedly.

### Docs
- `docs/superpowers/specs/2026-06-11-time-clock-design.md`, `docs/superpowers/plans/2026-06-11-time-clock.md`
- `docs/superpowers/specs/2026-06-11-barcode-design.md`, `docs/superpowers/plans/2026-06-11-barcode.md`
- `docs/superpowers/specs/2026-06-11-purchase-orders-design.md`, `docs/superpowers/plans/2026-06-11-purchase-orders.md`

---

## Phase 2 · Profit & Loss Report · 2026-06-12

Adds a Profit & Loss tab to the reports module that nets recorded expenses against gross profit. The reactive `reports.profitLoss` query computes revenue (paid orders), COGS (per-line recipe cost, reusing the margin report's COGS basis), gross profit, operating expenses (from the expenses table), net profit, and gross/net margin percentages over the shared report range.

### Added
- `reports.profitLoss` query (`convex/reports.ts`) returning `revenueIDR`, `cogsIDR`, `grossProfitIDR`, `expensesIDR`, `netProfitIDR`, `grossMarginPct`, `netMarginPct`.
- `/reports/profit-loss` page (`src/routes/_pos/reports/profit-loss.tsx`) added to the reports sub-nav (`reports/route.tsx`).

### Docs
- `docs/superpowers/plans/2026-06-11-profit-loss.md`

---

## Phase 2 · UX — Rounded, Empty States & Register Shell · 2026-06-12

Three presentation passes. The theme switches from square to rounded corners (`--radius` `0rem → 0.5rem` in `src/styles/globals.css`). Every data/page empty state is migrated to the shadcn `Empty` primitive with an icon + description (not plain text) across routes and components. The cashier-facing register gets a full-screen shell: a shared `RegisterTopBar` wraps `/sale`, `/tables`, and `/kitchen` outside the admin sidebar chrome, and owners now land on the dashboard while cashiers land on the register.

### Changed
- Base `--radius` set to `0.5rem` so all components round (`src/styles/globals.css`).
- Data/page empty states across the app use shadcn `Empty` (icon + description) — customer detail, dashboard activity/invoices, inventory movement history + stock-take, menu category table, permission guard, held-orders, menu pane, shift order list, table-manage dialog, gift cards, inventory, kitchen, and more.
- Full-screen register: `RegisterTopBar` (`src/components/sale/register-top-bar.tsx`) shared across `/sale`, `/tables`, `/kitchen`; `_pos.tsx` routes those screens outside the sidebar shell; post-login landing is role-aware (owner → dashboard, cashier → register).

### Fixed
- Cart-header actions wrapped so they don't clip in a narrow cart (`src/components/sale/cart-pane.tsx`).

### Docs
- `docs/superpowers/specs/2026-06-11-register-shell-design.md`

---

## Phase 2 · Pro-POS Expansion · 2026-06-11 → 2026-06-12

A wide professional-POS slice landed back-to-back: inventory stock-take, order types, held orders, void, expense tracking, a margin report, manual discounts, split/multi-tender, table management, a kitchen display, loyalty tiers, product variants, and gift cards. Most of these thread through the shared sale core (`convex/lib/sale.ts`) — `buildOrder` / `settleSale` — so receipts, history, shift cash reconciliation, and dashboard/report aggregations stay consistent across every payment path. Each feature ships with its own admin page or sale-screen entry point, Convex tests, and i18n.

### Added
- **Stock-take** (#43): `ingredients.performStockTake` batched-recount mutation and a `StockTakeDialog` (`src/components/inventory/stock-take-dialog.tsx`) launched from the stock page (`/inventory`).
- **Order types** (#44): `orderTypeValidator` (`dine_in` / `takeaway` / `pickup`, `convex/lib/orderType.ts`) on the order + cart, an order-type toggle in `cart-pane.tsx`, the type on the receipt, and an order-type filter/label in `/reports/orders`.
- **Held orders** (#45): `heldOrders` table (`by_shift` / `by_cafe`) holding label + order type + cart lines + promo snapshot off the money path; `convex/heldOrders.ts` hold/list/remove; `HoldOrderDialog` + `HeldOrdersDialog` and a cart `load` action to recall.
- **Void** (#46): `orders.void` reverses inventory + loyalty and flips status; canVoid-gated void action with a "voided" banner in the receipt preview.
- **Expenses** (#47): `expenses` table + `convex/expenses.ts` (range-aware record/list/remove/total) and a `Pengeluaran` tab (`/reports/expenses`) with categories, an expense dialog, and CSV.
- **Margin report** (#48): `reports.margin` query (per-item revenue vs recipe COGS) and the `/reports/margin` tab with CSV.
- **Manual discount** (#49): ad-hoc post-promo order discount (`convex/lib/discount.ts`), cart state + `ManualDiscountDialog`, applied at checkout across all methods and shown on the receipt.
- **Split / multi-tender** (#50): N-payment split create + settle/void with a stored tender breakdown (`convex/lib/payment.ts`); `getById` returns the tender array, the receipt renders splits, and shift cash reconciliation + reports + dashboard account for split orders (`SplitPaymentDialog`).
- **Table management** (#51): `tables` table + `convex/tables.ts` CRUD, a floor view (`/tables`), hold-to-table (one held order per table via `heldOrders.tableId`) and resume-from-floor.
- **Kitchen display (KDS)** (#52): order `kitchenStatus` + `tableId` (`by_cafe_kitchen` index), `convex/kitchen.ts` tickets/advance (`'ready' → 'done'`), and a kitchen board (`/kitchen`).
- **Loyalty tiers** (#53): spend-based `tiers` config (`cafeSettings.loyalty.tiers`) with an earn multiplier (`convex/lib/loyalty.ts`), a tier editor on `/loyalty`, and a tier badge on the customer detail sheet.
- **Product variants** (#54): `menuItemVariants` table (absolute price that replaces the item base price; recipe shared with the parent), variant CRUD (`convex/menu/variants.ts`), a variants editor on the item form, variant pick in the item picker, and `variantId`/`variantName` threaded through the cart, checkout, receipt, and held orders.
- **Gift cards** (#55): `giftCards` (unique uppercased `code` per cafe, mutable `balanceIDR`) + `giftCardTransactions` audit ledger (issue/topup/redeem/refund), `convex/giftCards.ts` management, a management page (`/gift-cards`), and gift-card redemption as a tender (full + split) with void refund.

### Changed
- Sale core split into `buildOrder` + `settleSale` (`convex/lib/sale.ts`) and generalized to N tenders so split payments, gift-card tenders, manual discounts, order types, KDS status, and variants all flow through one path; `usePaymentTotals` documented as taking the combined promo + manual discount.
- Shift cash reconciliation, `reports`, and `dashboard` updated to recognize split orders and to exclude gift-card tenders from the shift QRIS-sales figure.
- Stock health summary added above the stock table; the colliding `bahan` unit dropped and a bare low-stock count shown (#42 polish carried in).

### Fixed
- Void keeps the loyalty ledger reconciled with a floored points balance.
- Variant cart lines with different variants stay separate; gift-card list is stable newest-first (tie-break on `_creationTime`).
- Split / expense / gift-card amount fields use the `Jumlah (Rp)` label to avoid the Quantity/Fixed copy collision.

### Docs
- Design specs + plans under `docs/superpowers/` (all 2026-06-11) for inventory-stock-take, order-types, held-orders, void-sale, expense-tracking, margin-report, manager-discount, split-tender, table-management, kds, loyalty-tiers, product-variants, and gift-cards.

---

## Phase 2 · Permissions & Menu Media · 2026-06-11

Role-aware access control plus item imagery. Permissions resolve from a cashier's role + per-flag grants (`staff.permissionsFor`) into a client `usePermissions` hook and a `RequirePermission` route guard, gating reports, menu editing, shift management, void, and checkout discount — and hiding the nav entries a cashier can't reach. Menu items gain an uploadable image (`imageStorageId` → resolved `imageUrl`) surfaced as thumbnails in the admin list and the cashier grid. A stock health summary sits above the stock table.

### Added
- `staff.permissionsFor` query (resolved role + flags) and `src/lib/permissions.ts` `usePermissions` hook (`Permission` = `canVoid` / `canDiscount` / `canManageShift` / `canViewReports` / `canEditMenu`); `RequirePermission` guard (`src/components/permission/require-permission.tsx`) on dashboard, forecast, inventory, menu, promos, recipes, reports, settings, shift, and shifts routes; nav entries hidden by permission (`app-shared.tsx`, `app-sidebar.tsx`).
- Menu item `imageStorageId` field with resolved `imageUrl` in list/sale/detail (`convex/menu/items.ts`); upload/replace/remove in the item edit form; thumbnails in the admin list (`menu/index.tsx`) and cashier `item-card.tsx`.
- Stock health summary tiles (`src/components/inventory/stock-summary.tsx`) above the stock table (`/inventory`).

### Docs
- Design specs + plans under `docs/superpowers/` for permission-gates, menu-item-images, and stock-health-overview (2026-06-11).

---

## Phase 2 · Shifts, Handoff & Order History · 2026-06-10 → 2026-06-11

Closes the loop on shift accounting and cashier accountability. Shift history lists closed shifts with read-time totals and cash variance and drills into per-shift orders. Close-out gains a `cashMovements` ledger (cash in/out, recorded from the sale screen), a full breakdown with a live variance preview, and stores expected/variance on close. Order history moves to a searchable `/reports/orders` browse (date range + cashier/method/status filters, pagination, reprint). A `cashierSessions` ledger records login/switch/logout, drives a cashier-switch button, and renders a cashier timeline in the shift-history detail.

### Added
- `shifts.listClosed` (read-time totals + variance) and a shift-history list (`/shifts`) with drill-in; shared `ShiftOrderList` (`src/components/shift/shift-order-list.tsx`) reused by `/history`.
- `cashMovements` table (`by_shift`; direction in/out, amount, note) + `convex/cashMovements.ts` (record + listForShift); `CashMovementDialog` launched from the sale screen; close-out breakdown with live variance preview and stored expected/variance + `closeoutSummary` (`/shift/close`).
- `orders.search` query (date range + cashier/method/status filters, pagination) and the `/reports/orders` browse page with badges and receipt reprint.
- `cashierSessions` table (`by_shift`; login/switch/logout) + `convex/cashierSessions.ts` (record + listForShift); cashier-switch button, logout recorded on close/sign-out, `/pin` records a session and routes to `/sale` when a shift is open, and a cashier timeline in the shift-history detail.

### Docs
- Design specs + plans under `docs/superpowers/` for shift-history (2026-06-10), shift-closeout, order-history, and cashier-handoff (2026-06-11).

---

## Phase 2 · Payments — QRIS (static, dynamic, Xendit BYO, reconciliation) · 2026-06-09 → 2026-06-10

QRIS lands in four slices. **Static** (#32): owners upload a fixed QRIS image in settings, the cashier shows it in a `QrisStaticPaymentDialog`, and `createQrisStaticSale` settles through the shared sale core; method-aware pay buttons disable unconfigured/unsupported methods server- and client-side. **Dynamic** (#33): a `PaymentProvider` interface with a `MockProvider`, a `qrisDynamic` action that creates a per-order charge, a `/webhooks/qris` HTTP route that confirms payment, a reactive dialog that auto-advances on confirm, and a sweep cron — the sale core is refactored into `buildOrder` + `settleSale` and pay buttons are driven from a method registry. **Xendit BYO** (#34): owners connect their own Xendit account (Secret API Key + Callback Token, masked), `XenditProvider` issues real QR Codes and verifies the callback token, and `/webhooks/qris/xendit` is multi-tenant (lookup-then-verify). **Reconciliation** (#35): a `reconcilePending` cron polling Xendit (`PaymentProvider.fetchStatus`) replaces the blind sweep, treating the provider as the authority.

### Added
- Static QRIS: `createQrisStaticSale` (`convex/orders.ts`), `qrisImageUrl` resolution in `settings.get`, image upload in settings tax/profile, `QrisStaticPaymentDialog` + `use-payment-totals.ts` + `src/lib/upload.ts` / `uuid.ts`, a `qris_static` receipt line, and live quick-cash buttons.
- Dynamic QRIS: `PaymentProvider` interface + `MockProvider` + `resolveProvider` (`convex/payments/providers/`), `convex/payments/qrisDynamic.ts` action (create charge, confirm, cancel, sweep), `/webhooks/qris` route (`convex/http.ts`) + sweep cron, `payments.expiresAt` + `by_provider_ref` index, `QrisDynamicPaymentDialog` with reactive auto-advance, and a `payment-methods.tsx` method registry.
- Xendit BYO: `XenditProvider` (QR Codes API + callback-token verify, `convex/payments/providers/xendit.ts`), `connectQrisProvider` with masked-secret reads (`convex/settings.ts`), a Xendit connect form (`/settings/integrations`), multi-tenant `/webhooks/qris/xendit`, and a scannable QR render in the dynamic dialog.
- Reconciliation: `PaymentProvider.fetchStatus` (Xendit poll + mock no-op) and a `reconcilePending` cron replacing the sweep.

### Changed
- `convex/orders.ts` split into `buildOrder` + `settleSale` in the shared sale core (`convex/lib/sale.ts`); `SaleArgs` derived from the validator; pay buttons + dialogs driven from a method registry; charges created after the order with `patchCharge` setting the provider ref.
- History filtered to paid orders; a dynamic-QRIS order supersedes a pending static one; provider interface uses `referenceId` + headers.

### Fixed
- Guard disabled/unconfigured methods server-side; prevent checkout lockout when no method is usable; `simulateWebhook` made internal (dev-only); QRIS disconnect blocked while a dynamic order is pending; finite `expiresAt` fallback + shared `timingSafeEqual`; pending orders excluded from sales aggregations.

### Docs
- Design specs + plans under `docs/superpowers/` for qris-static (2026-06-08), qris-dynamic (2026-06-09), qris-xendit-byo, and qris-reconciliation (2026-06-10).

---

## Phase 2 · Loyalty & Customers · 2026-06-07

A cafe-scoped customer directory plus a points-based loyalty program. Customers carry a points balance, visit count, and total spend; cash sales earn points and track visit/spend, and points can be redeemed at checkout (stacking on a promo). A `loyaltyTransactions` ledger records earn/redeem/adjust, the owner configures earn rate + redemption value on `/loyalty` with a stats view, and the checkout path reads `cafeSettings` once.

### Added
- `customers` table (`by_cafe_phone` / `by_cafe_active`; `pointsBalance`, `visitCount`, `totalSpentIDR`, `lastVisitAt`) and `loyaltyTransactions` ledger (`by_customer_at`; earn/redeem/adjust); loyalty config on `cafeSettings` (`earnRatePerIDR`, redemption block value). Pure points math in `convex/lib/loyalty.ts`.
- `convex/customers.ts` directory CRUD + phone lookup + manual point adjust; `convex/loyalty.ts` program config get/update + stats.
- `/customers` directory page with create/edit dialog and a detail sheet (history + manual point adjust); `/loyalty` program config + stats page; a customer section + redeem flow in the sale screen and on the receipt.

### Changed
- `createCashSale` earns points + tracks visit/spend and redeems points (stacking on promo) with a single `cafeSettings` read on the checkout path.

### Fixed
- Reject point redemption without an attached customer; guard `redemptionIDR` against a non-positive block value; CI runs `convex deploy` only on production builds; top-customers shows a loading state instead of an empty table.

### Docs
- `docs/superpowers/specs/2026-06-03-loyalty-customers-design.md`, `docs/superpowers/plans/2026-06-03-loyalty-customers.md`

---

## Phase 1 · Predictions — Forecast + Weather · 2026-06-01 → 2026-06-03

Demand forecasting ships as a transparent, rule-based engine: a pure stats layer (`convex/lib/forecast.ts`) computes per-item tomorrow + 7-day demand from trailing sales — trimmed exponential-decay `baseEstimate`, clamped `dayOfWeekMultiplier`, a data-driven `holidayMultiplier` (Lebaran + fixed national days), and a `confidence` label — exposed via the owner `/forecast` page (nav "Prediksi"). Cafes with `<14` active days get a `learning` cold-start state with an ETA instead of numbers. A nightly Convex cron (`nightly forecast`, `0 15 * * *` = 22:00 WIB) then persists a `forecasts` snapshot plus a draft `restockSuggestions` per cafe; the pages read the latest snapshot with a live fallback before the first run. Weather lands in two slices: C2a geocodes each café's city to coordinates via Open-Meteo and stores a structured per-day `weatherSignal` (condition/temp/precip) on the forecast — restructuring the cron into an action with graceful per-cafe degradation — while keeping numbers byte-identical; C2b then bakes a global rain-dampening multiplier (`rainy → ×0.85`, all other conditions `×1.0`) into the persisted lines and surfaces a "Hujan" driver, with a "Data cuaca tidak tersedia." note when a ready forecast has no signal. Per-category hot/cool sensitivity (C2c), restock history/dismiss, and ML are deferred.

### Added
- Pure forecast engine `convex/lib/forecast.ts`: `baseEstimate` (trimmed exp-decay weighted mean), `dayOfWeekMultiplier`, `holidayMultiplier` (data-driven `HOLIDAY_TABLE` — Lebaran 3-day + fixed `08-17`/`12-25`/`01-01` + weekend-near-holiday), `confidence`, `predictedQty`, `driversFor` (structured `Driver` codes `dow_busy`/`dow_quiet`/`holiday`, ≤2), plus `dowOfKey`/`addDaysToKey` time helpers.
- `forecast.demand` query (`convex/forecast.ts`) — owner-scoped, returns `learning` (`daysCollected`/`daysNeeded`/`etaDateKey`) or `ready` (per-item `tomorrowQty`/`sevenDayQty`/`confidence`/`drivers`).
- `/forecast` owner page (`src/routes/_pos/forecast.tsx`) with a `Besok | 7 hari` toggle, confidence `StatusBadge`s, and client-side i18n driver rendering (`src/components/forecast/render-driver.tsx`); "Prediksi" added to the owner nav.
- `forecasts` + `restockSuggestions` tables (`convex/schema.ts`, `by_cafe_generated` index); shared `computeRestock` (`convex/lib/restock-compute.ts`) and extracted `computeDemand` (`convex/lib/demand.ts`).
- Nightly cron `convex/crons.ts` (`nightly forecast`, `0 15 * * *`) plus `generateNightly`, `persistForecast` (internalMutation), `listCafesForCron` (internalQuery); `restock.markSent` mutation (draft → sent with retained `sentLines`, "Terkirim" badge).
- Open-Meteo weather: pure parsers `convex/lib/weather.ts` (`conditionOf`, `parseGeocode`, `parseForecast`, `weatherSignalV` validators); café `latitude`/`longitude` schema fields; `cafes.geocodeFromCity` action (+ `myCafeForGeocode` query, `setLocation` mutation) with a "Perbarui lokasi cuaca" button on `/settings/profile`.
- Weather-aware predictions: `WEATHER_MULT` + `weatherMultiplier(condition?)` (rain `×0.85`), a `weather` `Driver` variant ("Hujan — perkiraan turun 15%"), and `weatherAvailable` on the `demand` ready result driving the "Data cuaca tidak tersedia." note.

### Changed
- `generateNightly` restructured from `internalMutation` → `internalAction` (HTTP `fetch` for Open-Meteo); fetch-then-persist single pass so `lines` and `weatherSignal` never drift. `computeDemand`/`persistForecast` accept an optional `weatherSignal` applied per-day in the forecast loop.
- `forecast.demand` / `restock.suggestion` read the latest persisted snapshot (live `computeDemand`/`computeRestock` fallback); restock panel reads `suggestionId`/`suggestionStatus` and marks-sent on WhatsApp export.
- `forecasts.weatherSignal` widened from reserved `v.string()` to a structured `WeatherDay[]` array (backward-compatible optional).
- Renamed `restock-compute` module → `restockCompute` for Convex module naming.

### Fixed
- Geocode error handling distinguishes "city not found" from fetch failures, clears stale coords, and guards the weather button (C2a review).
- Weather fetch window aligned to the demand model; learning cafes skipped; cron iteration paginated (C2a review).
- Weekend-near-holiday detection corrected near the next-year New Year boundary; void/non-paid orders excluded from active days and forecasts.
- Each café's weather fetch wrapped in its own try/catch so one failure (or an Open-Meteo outage) degrades that café to `×1.0` without aborting the nightly run.

### Docs
- `docs/superpowers/specs/2026-06-01-forecast-engine-design.md`, `docs/superpowers/plans/2026-06-01-forecast-engine.md`
- `docs/superpowers/specs/2026-06-02-forecast-cron-design.md`, `docs/superpowers/plans/2026-06-02-forecast-cron.md`
- `docs/superpowers/specs/2026-06-02-weather-fetch-design.md`, `docs/superpowers/plans/2026-06-02-weather-fetch.md`
- `docs/superpowers/specs/2026-06-03-weather-aware-predictions-design.md`, `docs/superpowers/plans/2026-06-03-weather-aware-predictions.md`

---

## Phase 1 · Restock & Suppliers · 2026-06-02

Owners now manage a cafe-scoped `suppliers` table and turn the 7-day demand forecast into action on `/forecast`: a live **Daftar Belanja** derives required quantities (forecast × recipe lines × wastage − current stock + safety stock), lets the owner tweak quantities inline, pick one supplier, and open a pre-filled WhatsApp order in a new tab. Slice A's forecast computation is extracted into a shared `computeDemand` helper reused by both `forecast.demand` and the new `restock.suggestion` query, and the restock list is computed live (no persistence). PDF purchase orders, nightly persistence of suggestions with draft/sent status, and per-ingredient default suppliers are deferred to later slices.

### Added
- `suppliers` table in `convex/schema.ts` (`cafeId`, `name`, `phone`, `archived`, `createdAt`; `by_cafe_active` index).
- `convex/suppliers.ts` CRUD — `list` (cafe-scoped, id-ID sorted, `includeArchived?`), `create`, `update`, `archive`, with shared `assertSupplier` (name 1–60 chars, phone valid after normalization), ownership via `requireOwnerCafe` + `requireOwned`.
- `convex/lib/phone.ts` pure `normalizePhone` (Indonesian numbers: leading `0`→`62`, existing `62` kept, strips non-digits), shared by server validation and the client WhatsApp helper.
- `convex/lib/restock.ts` pure `suggestRestock(required, currentStock, reorderThreshold)` — `safetyStock = max(reorderThreshold, required/7)`, clamped ≥0, rounded up.
- `convex/restock.ts` → `suggestion` query — maps demand lines through `recipes` (`by_cafe_item`) into per-ingredient requirements, applies `suggestRestock` against `currentStockQty`, omits fully-stocked/archived ingredients, passes through `learning` status.
- `src/lib/whatsapp.ts` — `waUrl` (normalized phone + url-encoded text) and `formatRestockText` (plain-text shopping list).
- `/suppliers` admin page (`src/routes/_pos/suppliers.tsx`) with Aktif/Arsip toolbar, DataTable, RowActions (Ubah/Arsipkan→ConfirmDialog), shadcn `Empty`; `SupplierFormDialog` (`src/components/supplier/supplier-form-dialog.tsx`); "Pemasok" nav entry under Inventaris.
- `RestockPanel` on `src/routes/_pos/forecast.tsx` — editable suggested-qty inputs (ephemeral client state), supplier `Select`, and a "Kirim ke WhatsApp" button.
- Tests: `tests/convex/phone.test.ts`, `tests/convex/restock-math.test.ts`, `tests/convex/suppliers.test.ts`, `tests/convex/restock.test.ts`, `src/lib/whatsapp.test.ts`; Playwright supplier-create smoke in `tests/e2e/sale.spec.ts`.

### Changed
- `convex/forecast.ts` refactored: per-item 7-day forecast extracted to `convex/lib/demand.ts` (`computeDemand`), with `forecast.demand` now a thin wrapper; forecast tests stay green.
- i18n catalogs extracted and English-filled for all new supplier + restock strings (`formatRestockText` content kept out of the catalog as message data).

### Fixed
- Restored the 8-digit phone floor in `assertSupplier` and used realistic test phone numbers (`8509601`).
- Hardened the WhatsApp launch: `window.open(..., '_blank', 'noopener,noreferrer')`.

### Docs
- `docs/superpowers/specs/2026-06-01-restock-suppliers-design.md`, `docs/superpowers/plans/2026-06-01-restock-suppliers.md`

---

## Phase 1 · Reports · 2026-06-01

A historical, date-range reporting layer complements the live Dashboard: owners pick a range (today/yesterday/last 7/last 30 or a custom from–to) on the `/reports` layout, which drives five reactive cafe-scoped Convex queries over the existing `by_cafe_created` orders index, all paid-only with revenue = `totalIDR`. Range state lives in URL search params (shared across tabs, refresh-safe) and all timezone math is resolved server-side. Ships an overview plus sales, products, payments, and cashiers views, each with a client-side CSV export and a shadcn `Empty` state for ranges with no sales. PDF export, voids/refunds, cohort/CLV, hourly heatmaps, and an inventory-snapshot report are out of scope.

### Added
- `convex/lib/time.ts` — shared tz/day helpers extracted from `dashboard.ts` plus `resolveRange` (preset/custom → tz-correct inclusive UTC-ms boundaries, validating `from <= to`, well-formed keys, and span ≤ 366 days) and `eachDayKey`; tested in `tests/convex/time.test.ts`.
- `convex/reports.ts` — five reactive queries `overview` (revenue/orders/AOV/itemsSold), `salesDaily` (zero-filled per-local-day buckets), `products` (qty + revenue per `nameSnapshot`, sorted revenue desc), `payments` (per-method count/amount + total), `cashiers` (per-cashier totals with `cafeStaff.name` resolution); all gated by `requireOwnerCafe`. Tested in `tests/convex/reports.test.ts` (aggregations, paid-only/out-of-range exclusion, zero-fill, tenant isolation).
- `src/lib/csv.ts` — RFC 4180 `toCSV` + `downloadCSV` helpers; tested in `src/lib/csv.test.ts`.
- `src/components/reports/use-report-range.ts` and `range-picker.tsx` — URL-search range hook + preset buttons and a custom date-range picker.
- Reports layout (`src/routes/_pos/reports/route.tsx`) with `PageHeader` "Laporan", the range picker, and a Ringkasan/Penjualan/Produk/Pembayaran/Kasir sub-nav that preserves the active range.
- Report pages: `index.tsx` (KPI cards), `sales.tsx` (daily-revenue bar chart via `~/components/ui/chart` + Recharts `BarChart`, plus `DataTable`), `products.tsx`, `payments.tsx`, `cashiers.tsx` — each with an "Unduh CSV" download and a shadcn `Empty` no-sales state.
- shadcn `calendar` + `popover` (`src/components/ui/calendar.tsx`, `popover.tsx`; react-day-picker 9) backing the custom range picker.
- Playwright coverage of the reports range view and a CSV download (`tests/e2e/sale.spec.ts`).
- Indonesian source strings + filled `en` translations for the reports module.

### Changed
- `convex/dashboard.ts` now imports the tz/day helpers from `convex/lib/time.ts` (no behavior change; existing dashboard tests stay green).
- Custom-range picker upgraded from native date inputs to the shadcn date-range picker (`range-picker.tsx`).
- `useReportRange` retyped via `getRouteApi('/_pos/reports')` to drop `useSearch`/`navigate` casts without import cycles.

### Fixed
- CSV fields containing a carriage return are now quoted, and the object URL is revoked after the download fires (`src/lib/csv.ts`).
- Range picker resets its custom inputs when a preset is chosen and rejects inverted (`from > to`) ranges (`range-picker.tsx`, `use-report-range.ts`, `route.tsx`).

### Docs
- `docs/superpowers/specs/2026-06-01-reports-design.md`, `docs/superpowers/plans/2026-06-01-reports.md`

---

## Phase 1 · Promotions · 2026-06-01

Owners manage order-level promotions in a `Promo & Diskon` admin page and cashiers apply one per cash sale. A new `promotions` table (`percent` / `fixed`, `value`, `archived`, cafe-scoped via `by_cafe_active`) backs `convex/promotions.ts` CRUD with shared `assertPromo` validation and tenant isolation. The pure `promoDiscountIDR` helper (`convex/lib/pricing.ts`) computes the discount — `round(subtotal × value / 100)` for percent, `min(value, subtotal)` for fixed (clamped to `[0, subtotal]`) — and runs identically client-side for live preview and server-side as the authority. `createCashSale` re-fetches the promo, rejects archived ones, recomputes `discountIDR`, and freezes an `appliedPromo` snapshot on the order so history and receipts stay accurate after later edits. One promo per order, no max-discount cap; item/category-scoped promos, codes, min-spend, time windows, stacking, the QRIS path, and dedicated discount metrics are deferred.

### Added
- `promotions` table in `convex/schema.ts` with `by_cafe_active` index; `convex/promotions.ts` `list` / `create` / `update` / `archive` plus shared `assertPromo` (name 1–60, percent integer 1–100, fixed integer ≥1) and `requireOwnerCafe` / `requireOwned` ownership.
- `formatPromoValue` in `src/lib/promo.ts` (display-only: `"20%"` / `formatIDR`); `promoDiscountIDR` in `convex/lib/pricing.ts` (server-authoritative math).
- `orders.appliedPromo` optional snapshot field (`promoId`, `name`, `type`, `value`); `createCashSale` gains optional `promoId` arg.
- `/promos` page (`src/routes/_pos/promos.tsx`, replacing the `ComingSoon` stub) with PageHeader, Aktif/Arsip toolbar chips, DataTable, and `PromoFormDialog` (`src/components/promo/promo-form-dialog.tsx`) for create/edit.
- Checkout wiring: `PromoPickerDialog` (`src/components/sale/promo-picker-dialog.tsx`), `promo` state + `setPromo` in `cart-reducer.ts`, discount row + `+ Tambah promo` control in `cart-pane.tsx`, preview discount in `sale-screen.tsx`, `promoId` forwarding in `cash-payment-dialog.tsx`, and a discount row on `receipt-preview.tsx`.
- Tests: `tests/convex/promotions.test.ts`, `promoDiscountIDR` cases in `pricing.test.ts`, promo cases in `orders.test.ts`, `cart-reducer.test.ts` promo actions, `promo.test.ts`, and Playwright e2e for admin CRUD and applying a percent promo at checkout.

### Changed
- `createCashSale` idempotency short-circuit documented as not re-evaluating `promoId` — the original sale's discount and `appliedPromo` win on replay; a different promo requires a new `clientId`.
- `CashPaymentDialog` `onPaid` narrowed to `(orderId)` only (totals/change no longer passed back; the stored order drives the receipt).
- `promotions.list` uses the `by_cafe_active` index's `archived` column for the non-archived path instead of collect-then-filter in JS.
- `PromoFormDialog` parses the value with `Number` (not `parseInt`) so non-integers like `"10.5"` reach server validation and are rejected rather than silently truncated.
- `openEdit` wrapped in `useCallback` on the promos page to complete the columns memo dependency.

### Fixed
- Hide the discount / `+ Tambah promo` row in `cart-pane.tsx` when the cart is empty.

### Docs
- `docs/superpowers/specs/2026-05-31-promotions-admin-design.md`, `docs/superpowers/plans/2026-05-31-promotions-admin.md`
- `docs/superpowers/specs/2026-06-01-promo-checkout-design.md`, `docs/superpowers/plans/2026-06-01-promo-checkout.md`

---

## Phase 1 · Catalog UI Kit, Menu Polish & Service Charge · 2026-05-30 → 2026-05-31

Establishes a shared Catalog UI kit (`@tanstack/react-table` + `sonner`), proves it by rebuilding Inventory › Stock and all three Menu pages onto it, surfaces recipe/low-stock status on the Items list with drag-to-reorder categories, and wires the previously inert service-charge settings into order pricing end-to-end via one pure `computeOrderTotals` shared by server and client (PB1 tax applied after service charge).

### Added
- Catalog UI kit in `src/components/ui/`: `PageHeader`, `Toolbar`, generic `DataTable` (headless `@tanstack/react-table` with sortable headers, skeleton loading, empty state, `getRowClassName` row tinting), `StatusBadge` (success/warn/danger/muted), `RowActions` (`⋯` overflow menu, tinted/separated destructive items), `ConfirmDialog`, themed `sonner` `Toaster`, plus `src/lib/toast.ts` re-export.
- `ReorderableTable` (`src/components/ui/reorderable-table.tsx`) — dnd-kit drag-to-reorder table with a `GripVertical` handle column, used by Categories.
- `CategoryFormDialog` (`src/components/menu/category-form-dialog.tsx`) — single-name dialog for category create + rename.
- Pure `computeOrderTotals` in `convex/lib/pricing.ts` (+ `DEFAULT_SERVICE_CHARGE_NAME = 'Biaya Layanan'`), imported by both `createCashSale` and the sale screen so totals never drift.
- `orders` table + `orderSummary`/`orderDetail` validators gain optional `serviceChargeIDR`, `serviceChargePct`, `serviceChargeName` (snapshotted for receipts).
- `convex/menu/itemStock.ts` `itemRecipeStatus(ctx, cafeId, menuItemId)` shared low-stock/recipe helper; `menu.categories.setOrder({ orderedIds })` full-reorder mutation for drag.
- Tests: `tests/convex/pricing.test.ts`, service-charge cases in `tests/convex/orders.test.ts`, `itemStock`/`items.list` enrichment + `categories.setOrder` Convex tests, and Playwright kit smokes on the Stock and Menu pages.

### Changed
- `createCashSale` loads `cafeSettings.payment.serviceCharge*` and computes totals via `computeOrderTotals`; the `tendered < totalIDR` guard now uses the service-charge-inclusive total.
- Sale screen + `cart-pane.tsx` render a "Biaya Layanan {pct}%" line between Subtotal and PB1/PPN and validate cash against the shared total; `receipt-preview.tsx` prints the same line only when `serviceChargeIDR > 0`.
- `menu.items.list` enriched with per-row `hasRecipe` + `lowStockIngredientNames` (validator → `menuItemWithStatus`); `listForSale` refactored onto the shared `itemRecipeStatus` helper.
- Inventory › Stock (`src/routes/_pos/inventory/index.tsx`) and Menu Items/Categories/Modifiers rebuilt onto the kit (PageHeader + Toolbar + DataTable/ReorderableTable + StatusBadge + RowActions + ConfirmDialog + toasts), dropping bespoke `FilterChip`/sidebar/▲▼-arrow markup; Items gains a Resep column and low-stock row tint, Categories gains drag-reorder + read-only archived view.
- `Toolbar` omits its search input when no `onSearch` is passed (Categories uses none).
- Refactored `DEFAULT_SERVICE_CHARGE_NAME` out of 4 hardcoded sites; client `taxRatePct` read now gated on `taxEnabled` to mirror the server.

### Fixed
- Removed the dead, unlabeled search box on the Categories page.

### Docs
- `docs/superpowers/specs/2026-05-31-catalog-ui-kit-foundation-design.md`, `docs/superpowers/plans/2026-05-31-catalog-ui-kit-foundation.md`
- `docs/superpowers/specs/2026-05-30-service-charge-design.md`, `docs/superpowers/plans/2026-05-30-service-charge.md`
- `docs/superpowers/specs/2026-05-31-menu-polish-design.md`, `docs/superpowers/plans/2026-05-31-menu-polish.md`

---

## Phase 1 · Settings, Navigation, Dashboard & i18n · 2026-05-29 → 2026-05-30

Builds out the application shell and makes the whole UI multi-language. A collapsible POS sidebar (`app-sidebar`, `app-header`, `nav-group`, `nav-user`, `app-breadcrumbs`) replaces the old top navbar with SPA `Link` navigation and motion-driven animation; the dashboard is wired from sample blocks to real Convex queries in `convex/dashboard.ts`; five server-persisted settings pages land on top of a new `cafeSettings` table and `convex/settings.ts`; and the entire app is retrofitted with Lingui v6 macros so it switches live between **Indonesian (`id`, source)** and **English (`en`)**, persisted to `localStorage` (`kodapos.locale`). Currency stays IDR (`Rp`) in both locales, and the printed receipt is intentionally always-English regardless of UI language.

### Added
- Collapsible sidebar shell: `src/components/app-sidebar.tsx`, `app-header.tsx`, `app-breadcrumbs.tsx`, `nav-group.tsx`, `custom-sidebar-trigger.tsx`, with nav data in `app-shared.tsx`; shadcn `Sidebar`/`Tooltip` primitives and `motion` for animation.
- Dashboard backend `convex/dashboard.ts` with `kpis`, `revenueDaily`, `paymentMethods`, `recentOrders`, `lowStock`, and `recentActivity` queries, feeding `stats.tsx`, `net-revenue-chart.tsx`, `channel-sales-chart.tsx`, `dashboard-invoices.tsx`, `dashboard-activity.tsx`, and `billing-health.tsx`.
- `cafeSettings` table (one doc per cafe, grouped `payment`/`receipt`/`integrations` + tax extras) and `convex/settings.ts` with `get` (defaults-merged), `updatePayment`, `updateReceipt`, `updateTaxPayment`, `connectIntegration`/`disconnectIntegration`, and `generateUploadUrl`, all gated by `requireOwnerCafe`.
- Five settings pages under `src/routes/_pos/settings/`: `profile.tsx` (identity/contact/address/operating hours + logo upload), `staff.tsx` (phone/email + permissions editor, search, show-archived), `tax.tsx` (tax/service charge/payment methods/cash rounding/QRIS), `receipt.tsx` (content toggles, paper/font, printer, live preview), and `integrations.tsx` (catalog of QRIS/GoFood/GrabFood/ShopeeFood/WhatsApp/accounting cards). Shared primitives in `src/components/settings/` plus `useEditableState` draft/dirty hook and `SaveBar` sticky footer.
- i18n runtime: `src/lib/locale.ts` (`Locale` type, `LOCALES` [Indonesia, English], `normalizeLocale`, localStorage helpers) with `src/lib/locale.test.ts`, `LocaleProvider`/`useLocale` (`src/components/locale-provider.tsx`), startup activation of the persisted locale, and the switcher at `src/routes/_pos/settings/language.tsx`.
- Full English catalog (`src/locales/en/messages.po`, 342 messages) with `<Trans>`/`t`/`msg` macros across public + POS pages, shell/nav, dashboard widgets, and `ComingSoon` stubs; `eslint-plugin-lingui` guard wired as a `lint:i18n` script.
- TDD coverage: `tests/convex/settings.test.ts` (defaults-merge + auth guard) and locale-normalization unit tests.

### Changed
- Locale-aware date/number formatting in `src/lib/formater.ts` via `Intl`, replacing the hardcoded Indonesian month array; currency remains IDR.
- Receipt/payment sections moved off the General page (`general.tsx`) into the dedicated Tax & Payment and Receipt & Printer pages; General switched from a side-rail to stacked sections. Square (`rounded-none`) design language applied across the shell.

### Fixed
- SSR hydration mismatch from locale activation resolved via a mount-gated activation (server defaults to `id`).
- `SaveBar` now catches `onSave` rejections; `settings.get` passes through an empty `npwp` string; integrations get busy spinners and an API-key label; cart is gated on settings load with a receipt-pct fallback; void order-status badge disambiguated from the shared "Batal" label via a Lingui context tag (renders "Void" in English).
- Sidebar polish: widened to 18rem, hidden during onboarding, corrected Tailwind v4 width/border tokens; nav footer points at real routes.

### Docs
- `docs/superpowers/specs/2026-05-29-settings-pages-design.md`, `docs/superpowers/plans/2026-05-29-settings-slice-0-foundation.md`, `docs/superpowers/plans/2026-05-29-settings-slice-1-profile.md`
- `docs/superpowers/specs/2026-05-29-i18n-multi-language-design.md`, `docs/superpowers/plans/2026-05-29-i18n-multi-language.md`

---

## Phase 1 · Theme & Auth Polish · 2026-05-25, 2026-06-03

The app drops its bespoke `brand-*`/`fg`/`surface`/amber palette for the tweakcn "Minimal Neutral" theme — a monochrome, near-black `primary`, `--radius: 1rem`, DM Sans + Geist Mono fonts, and the canonical shadcn v5+ token vocabulary swept across all 46 components/routes — while `/signin` and `/signup` gain a "mature SaaS auth" treatment: icon-prefixed inputs, show/hide password toggle, real-time validation, a signup T&C gate, and a single-color password strength meter. A later follow-up on 2026-06-03 fixes both auth forms so a failed login/registration shows a friendly message instead of Convex's masked raw "Server Error".

### Added
- Show/hide password toggle (`Eye`/`EyeOff`) and icon-prefixed inputs (`Mail`, `Lock` on signin; `User`, `Coffee`, `Mail`, `Lock` on signup) in `src/routes/_public/signin.tsx` and `signup.tsx`.
- Real-time field validation via `src/lib/auth-validation.ts` (`validateEmail`, `validatePasswordRequired`, `validatePasswordSignup`, `validateName`, `validateCafeName`) with 18 unit specs in `auth-validation.test.ts`.
- Signup password strength meter (`passwordStrength` → Lemah/Sedang/Kuat, single-color `bg-foreground` fill) and a Terms & Conditions `Checkbox` that gates submit.
- `src/components/ui/checkbox.tsx` (shadcn, Radix-backed) and stub `src/routes/_public/terms.tsx` + `privacy.tsx` pages for the T&C links.
- DM Sans + Geist Mono Google Fonts `<link>` in `src/routes/__root.tsx`.

### Changed
- `src/styles/globals.css` rewritten to the tweakcn token set: `:root` light vars + `@media (prefers-color-scheme: dark) :root` (no `.dark` class), an `@theme inline` mapping block, `--radius: 1rem`, `--font-sans: "DM Sans"`, `--font-mono: "Geist Mono"`. Removed the `--color-brand-*`, `--color-bg/-surface/-fg/-fg-muted`, `--color-success/-warning/-danger/-info` vars, the `--radius-sm/md/lg` scale, and Plus Jakarta Sans; print + density blocks preserved.
- Mechanical token sweep across `src/components/{ui,sale,menu,inventory,staff,shift}/*`, `pos-nav.tsx`, and all `src/routes/_pos/**` + `_public/**`: `text-fg`→`text-foreground`, `bg-surface`→`bg-muted`, `bg-brand-*`→`bg-primary`/`bg-accent`, slice-4 amber low-stock UI→`bg-destructive/10`/`text-destructive`/`border-destructive`.
- Dark-mode readability fix: hard-coded `text-white` on buttons → `text-primary-foreground`, and `text-danger`/`bg-danger` → `destructive` across 10 files.
- E2E `tests/e2e/inventory.spec.ts` updated to tick the new T&C checkbox before submitting signup.

### Fixed
- Signin/signup failures no longer surface Convex's masked raw "Server Error" — `@convex-dev/auth` throws `InvalidAccountId` and similar as uncaught errors whose `err.message` is always "Server Error", so the `instanceof Error` branch always won. Both `catch` blocks now drop `err.message` and always render the friendly catalog message (`Email atau password salah.` / `Gagal mendaftar.`); the `createCafeWhenAuthReady` auth-race retry is unchanged (#29).

### Docs
- `docs/superpowers/specs/2026-05-25-tweakcn-minimal-neutral-theme-design.md`, `docs/superpowers/plans/2026-05-25-tweakcn-minimal-neutral-theme.md`
- `docs/superpowers/specs/2026-05-25-enhance-auth-cards-design.md`, `docs/superpowers/plans/2026-05-25-enhance-auth-cards.md`

---

## Phase 1 · CI, Empty States & Cloudflare Deploy · 2026-05-29 → 2026-06-03

CI lands first as a `pnpm`-based GitHub Actions workflow that typechecks, runs unit tests, and compiles the i18n catalog on every push to `main` and PR; the `convex/_generated` types are committed so CI can typecheck without a deploy key, and the runner is pinned to Node 22 because `@lingui/cli` needs `fs.globSync`. The shadcn `<Empty>` component then rolls out across the app's data lists for consistent no-data states. Finally the app gains a Cloudflare Workers build target (`@cloudflare/vite-plugin` + `wrangler.jsonc`) and a `cf:deploy` script; a GitHub Actions CD workflow is added, then dropped in favor of Cloudflare Workers Builds (dashboard git integration) as the single deploy-on-push-to-`main` path, currently pointed at the DEV Convex deployment.

### Added
- CI workflow `.github/workflows/ci.yml` — `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile` on push to `main` and PRs.
- Cloudflare Workers build target: `@cloudflare/vite-plugin` (SSR → `workerd`, output `.output/` → `dist/`) in `vite.config.ts` and `wrangler.jsonc` (`name kodapos`, `nodejs_compat`, `main @tanstack/react-start/server-entry`, observability on).
- `package.json` deploy scripts: `cf:deploy` (`convex deploy --cmd 'pnpm build' --cmd-url-env-var-name VITE_CONVEX_URL`), plus `deploy`, `preview`, `cf-typegen`.
- shadcn `<Empty>` no-data states: waste log (`src/routes/_pos/inventory/waste.tsx`), reports overview when range has no sales (`src/routes/_pos/reports/index.tsx`), movement-history sheet (`src/components/inventory/movement-history-sheet.tsx`), shift order history (`src/routes/_pos/history.tsx`), staff table (`src/routes/_pos/settings/staff.tsx`).

### Changed
- CD model switched from GitHub Actions (`.github/workflows/deploy.yml`, removed) to Cloudflare Workers Builds (dashboard git integration) as the single deploy-on-push-to-`main` path; `VITE_CONVEX_URL` / `VITE_CONVEX_SITE_URL` are set as build variables in the CF dashboard, not GitHub secrets.
- Empty data-list states replaced bare text with the `<Empty>` component; form sub-lists and picker dropdowns intentionally kept as inline hints.
- Repointed the stale `start` script to `wrangler dev`.

### Fixed
- CI Node version bumped `20` → `22` so `@lingui/cli` (loaded by `vitest.config.ts`) has `fs.globSync`.

---

## Phase 1 · Slice 4 — Inventory + Recipes · 2026-05-24 → 2026-05-31

Turns kodapos from order-taking into ingredient-tracking: the owner builds per-item recipes, cash sales auto-write event-sourced stock movements (stock is derived `Σ delta`, never a stored counter), and the Inventaris section gains full audit + entry flows — Stock, movement history, Adjustments, Waste, Purchases — plus a standalone Recipes/profitability overview. Suppliers entity, modifier `recipeAdjustments`, predictive demand, and inventory snapshot reports are deferred to later slices/V1.1.

### Added
- `ingredients`, `recipes`, `inventoryMovements` tables; `recipeSnapshot` (optional) added to `orders.lines[]` so retroactive recipe edits never rewrite history (`convex/schema.ts`).
- `purchases` table (`supplierName?`, multi-line `{ingredientId, qty, unitCostIDR}`, `totalIDR`, `by_cafe_at`).
- `inventoryMovements.reason` literals grew `sale | adjustment | waste | purchase`; added `wasteReason` enum (`rusak/basi/tumpah/salah_masak/lainnya`) + `costPerUnitIDR` COGS snapshot, `reasonLabel`, and indexes `by_cafe_ingredient_at` / `by_cafe_reason_at`.
- Convex functions: `ingredients.list/get/upsert/archive/adjustStock` (9 specs), `ingredients.listMovements` (running balance, 100-row cap, `truncated` flag), `ingredients.recentAdjustments`; `recipes.getForItem/upsert` (delete-on-empty, 6 specs) + `recipes.listForCatalog`; `waste.record` (cost-snapshot + validation) + `waste.recent` (period total); `purchases.record` (stock-in + overwrites `lastCostPerUnitIDR`) + `purchases.get`.
- `orders.createCashSale` extended to write `recipeSnapshot` + one `reason:'sale'` movement per recipe line in the same mutation (atomic, idempotent via `clientId`); `menu.items.listForSale` gains `lowStockIngredientNames[]`.
- Pure helpers: `currentStockQty` + `costPerCupIDR` (`convex/lib/inventory.ts`, `src/lib/inventory.ts`), `movementTypeVariant`, `recipeMarginPct` (`src/lib/recipe.ts`), `purchaseTotalIDR` (`src/lib/purchase.ts`) — all with unit tests.
- Routes under `/_pos/inventory`: `index` (Stock), `adjustments`, `waste`, `purchases`, plus `/recipes`; "Inventaris" link added to `<PosNav>`.
- Components: `<IngredientForm>`, `<IngredientPicker>` (combobox + create-new), `<StockAdjustDialog>` (Catat Stok), `<RecipeEditor>` (inline + Sheet, live cost-per-cup pill), `<WasteDialog>`, `<WasteReason>`, `<MovementHistorySheet>`, `<PurchaseForm>` (multi-line); `<ItemCard>` low-stock warning border + tooltip on `/sale`.
- E2E `tests/e2e/inventory.spec.ts`: happy path (ingredient → recipe → sale → deduction), movement-history sheet, add-recipe-from-Recipes-page, multi-line purchase verifying stock + log.

### Changed
- `adjustStock` now stores the reason in `reasonLabel` and free-text in `note` separately (was a combined `note` string), enabling distinct Alasan/Catatan columns and the reason filter on the Adjustments page.
- Waste moved off `StockAdjustDialog`'s "Limbah" reason into a first-class `reason:'waste'` flow; the "Limbah" option was dropped from stock-adjust.
- Inventory/Stock and Waste pages migrated onto the Catalog UI kit (PageHeader, DataTable, StatusBadge, Empty, toast); toasts on ingredient save/archive/adjust and waste record.

### Docs
- `docs/superpowers/specs/2026-05-23-phase-1-slice-4-inventory-recipes-design.md`, `docs/superpowers/plans/2026-05-23-phase-1-slice-4-inventory-recipes.md`
- `docs/superpowers/specs/2026-05-31-inventory-history-design.md`, `docs/superpowers/plans/2026-05-31-inventory-history.md`
- `docs/superpowers/specs/2026-05-31-inventory-adjustments-design.md`, `docs/superpowers/plans/2026-05-31-inventory-adjustments.md`
- `docs/superpowers/specs/2026-05-31-recipes-page-design.md`, `docs/superpowers/plans/2026-05-31-recipes-page.md`
- `docs/superpowers/specs/2026-05-31-purchases-design.md`, `docs/superpowers/plans/2026-05-31-purchases.md`
- `docs/superpowers/specs/2026-05-29-waste-tracking-design.md`, `docs/superpowers/plans/2026-05-29-waste-tracking.md`

---

## Phase 1 · Slice 3 — POS Core (cash-only) · 2026-05-22 → 2026-05-23

The first revenue-generating screen. Cashier taps items into a cart, optionally picks modifiers, accepts cash, and the order persists with a printable receipt. QRIS, voids, discounts, and inventory deduction are deferred to later slices.

### Added
- `orders` table — one row per sale with embedded `lines[]` array. Snapshots: `nameSnapshot`, `unitPriceIDR`, `modifiersSnapshot`, `taxRatePct` so receipts stay correct after menu or PPN edits.
- `payments` table — one row per payment event. Cash always inserts `paymentStatus: 'paid'` + `confirmedAt: now`. Optional fields reserved for Slice 5 QRIS pending state.
- `orders.createCashSale` mutation — six layers of server-side defense: tenant ownership of shift + cashier, per-item active/archived check, modifier-option attachment verification, modifier-group min/max count enforcement, integer Rupiah validation, open-shift assertion. Idempotent via client-generated `clientId` (`by_cafe_clientId` index).
- `orders.listForShift` + `orders.getById` read queries — history page + receipt drawer.
- `menu.items.listForSale` — single round-trip read returning every active item plus its attached modifier groups + options.
- Pure cart reducer (`useReducer`-friendly, 9 unit specs) — de-dupes no-modifier additions, never de-dupes modified additions, caps qty at 99, decrement past 1 removes the line.
- `<ShiftGate>` — reactive `useQuery(api.shifts.current)` redirector. Closing the shift in another tab routes `/sale/*` and `/history` to `/shift/open` automatically.
- `/sale` UI — 70/30 menu/cart split, category tabs, `<ItemCard>` with "Pilihan" badge for items that have modifier groups, `<CartPane>` with qty stepper + Remove + Kosongkan confirm.
- `<ModifierPickerDialog>` — toggle chips per group, required-group gating, live total preview, qty stepper, "Tambah ke pesanan" button.
- `<CashPaymentDialog>` — compact stacked layout, smart denomination chips (`Pas`, next 5k, next 100k, next 200k), 3×4 numpad, idempotent `clientId` generated once per open.
- `<ReceiptPreview>` + `@media print` rule in `globals.css` — print hides everything except `[data-print-receipt]`.
- `/history` route — today's orders for the active shift, click to view receipt drawer.
- Auth-gated Playwright happy path (`tests/e2e/sale.spec.ts`): signup → onboarding → PIN → shift open → cash sale → receipt → /history.
- 23 Convex specs on `orders` mutation/queries; 2 specs on `listForSale`; 9 cart-reducer unit specs.

### Changed
- `convex/menu/items.ts`: extracted shared `resolveAttachedGroups(ctx, menuItemId)` helper used by `getById` and `listForSale`.
- Switched a `.filter()` call on `menuItemModifierGroups` to `.collect()` + JS `find` to comply with Convex query guidelines.

### Fixed
- `<ScrollRestoration />` deprecation warning — removed the component; `createRouter`'s `scrollRestoration: true` option in `src/router.tsx` covers the same behavior.
- Missing 404 — root route now declares `notFoundComponent` with a Bahasa "Halaman tidak ditemukan" page instead of the framework's generic text.

### Docs
- `docs/superpowers/specs/2026-05-22-phase-1-slice-3-pos-core-design.md`
- `docs/superpowers/plans/2026-05-22-phase-1-slice-3-pos-core.md`

---

## Phase 1 · Slice 2 — Shifts + PIN Auth · 2026-05-21 → 2026-05-22

Cashier identity + shift lifecycle on top of the device-owner Convex Auth session. Unblocks Slice 3's `cashierId` / `shiftId` requirement on every order.

### Added
- `cafeStaff` table — owner auto-inserted at signup via extended `cafes.createForOwner`; cashiers added via Settings → Staff.
- `shifts` table — `status: 'open' | 'closed'`, opening float, counted cash. One-open-per-cafe invariant enforced server-side.
- PBKDF2-SHA256 PIN hashing (100k iterations, 16-byte salt, 32-byte key, `salt:hash` hex format) via Web Crypto in `convex/lib/pin.ts`.
- `requireActiveCashier(ctx, cafeId, cashierId)` helper — tenant + archived check in one step.
- `staff.list / create / updateName / archive / verifyPin / resetPin` Convex functions.
- `shifts.current / open / close` Convex functions.
- `useActiveCashier()` hook — `localStorage.activeCashierId` with cross-tab sync via the `storage` event.
- `<PinGate>` — redirects to `/pin` when no active cashier.
- `<PinEntry>` 4-cell numeric input + `<StaffPickerCard>` + `<ShiftSummaryPanel>`.
- `/pin` PIN-picker route.
- `/shift/open` and `/shift/close` routes (wrapped by `<PinGate>`).
- Settings → Staff page (add, rename, set/reset PIN, archive).
- Onboarding step 4 — pemilik (owner) sets their own PIN + optional cashier rows.
- Auth-gated E2E (`tests/e2e/shifts.spec.ts`): signup → set PIN → pick cashier → open shift → close shift.
- ~25 Convex specs covering staff CRUD, PIN hash/verify, shift lifecycle, tenant isolation, race conditions.

### Fixed
- `Uint8Array<ArrayBufferLike>` not assignable to `BufferSource` in TS 5.7+ — narrowed `convex/lib/pin.ts` helper signatures to `Uint8Array<ArrayBuffer>`.

### Docs
- `docs/superpowers/specs/2026-05-21-phase-1-slice-2-shifts-design.md`
- `docs/superpowers/plans/2026-05-21-phase-1-slice-2-shifts.md`

---

## Phase 1 · Slice 1 — Onboarding + Menu · 2026-05-21

Real signup wired to Convex Auth + four-step onboarding wizard + menu management (categories, items, modifier groups). First slice to leave the placeholder stage.

### Added
- `cafes.createForOwner` + `cafes.updateProfile` mutations; `cafes.myCafe` + `cafes.mine` queries; `cafes.markSetupComplete` mutation.
- `categories`, `menuItems`, `modifierGroups`, `modifierOptions`, `menuItemModifierGroups` tables.
- `menu.categories` (CRUD + reorder + archive) + `menu.items` (CRUD + reorder + archive + setActive) + `menu.modifierGroups` (upsert + archive) + `menu.itemGroups` (attach + detach + reorder).
- `requireOwned<T extends TenantTable>(ctx, cafeId, id, label)` helper — centralizes the tenant ownership check.
- Onboarding wizard — `/onboarding/profile`, `/onboarding/menu`, `/onboarding/cashier` (cashier step extended in Slice 2). Wizard stepper component.
- `<OnboardingGate>` — redirects to `/onboarding/profile` if `!cafe.setupCompletedAt`.
- Menu management UI: category table (reorder + archive confirm), item edit form (price + category + modifier-group attachment), modifier-group form.
- `<ConfirmArchive>` AlertDialog wrapper (replaces `confirm()` for archive flows).
- Brand-token UI via shadcn/ui + Tailwind v4 design tokens (`bg-bg`, `bg-surface`, `text-fg`, `text-fg-muted`, `bg-brand-600`, etc.).
- shadcn primitives: Field, FieldGroup, FieldError, Spinner, Input, Label, AlertDialog, Dialog, Sheet, Select, Switch, Separator, Empty, Skeleton.
- Lingui 6 + Vite 8 macro pipeline via `@rolldown/plugin-babel` + `linguiTransformerBabelPreset` (Addendum §A.13).
- Auth-gated Playwright suite (`tests/e2e/menu.spec.ts`): signup → onboarding → category → item.
- `gotoHydrated` / `waitForUrlHydrated` Playwright helpers — avoid native-form-submit races caused by pre-hydration clicks.

### Fixed
- Convex Auth dropped `user.name` — added `profile` callback to the Password provider so `params.name` lands in `users.name`.
- Onboarding never created a cafe — added `createCafeWhenAuthReady` retry helper (20 attempts × 150ms) to handle the auth-token-propagation race at signup.

### Known issues
- Menu CRUD E2E test occasionally flakes at the final `waitForUrlHydrated` when run back-to-back with other auth-gated tests. Per-test timeout bumped to 180s; documented as deferred.

### Docs
- `docs/superpowers/specs/2026-05-20-phase-1-slice-1-onboarding-menu-design.md`
- `docs/superpowers/plans/2026-05-20-phase-1-slice-1-onboarding-menu.md`

---

## Phase 0 — Foundations · 2026-05-14 → 2026-05-20

Project scaffolding, design docs, and the toolchain choices everything else builds on.

### Added
- V1 design document for kodapos.
- Phase 0 (foundations week) implementation plan + Addendum A translating outdated TanStack Start API references in the plan to the current API.
- Repo skeleton (`d8660b7`).
- TanStack Start application bootstrap (`6c3cc10`).
- Tailwind v4 + design tokens (`dde0d83`).
- shadcn/ui initialization with Button + Lucide icons (`1f05f81`).
- `(public)` and `(pos)` route groups (later renamed to `_public` / `_pos` per Addendum §A.9 — underscore convention).
- Convex backend with Phase 0 schema (`56c797a`).
- Convex React client wired into the root layout (`1c3ac63`).
- Convex Auth configured with Password provider (`14b4638`).
- `users.hello` query + first Convex tests (`9515885`).
- Biome lint + format configuration (`71ed9cc`).

### Deferred (still pending)
- Cloudflare deploy (Tasks 18–20)
- Sentry observability (16)
- PostHog analytics (17)
- CI pipeline (21)

### Docs
- `docs/superpowers/specs/2026-05-14-kodapos-v1-design.md`
- `docs/superpowers/plans/phase-0-foundations.md`

[Unreleased]: https://github.com/dededemahendra/kodapos/compare/main...HEAD
