# kodapos V1 — Design Document

**Date:** 2026-05-14
**Status:** Design (pre-implementation)
**Owner:** Warren

---

## Executive Summary

kodapos V1 is a SaaS, multi-tenant, web-based point-of-sale for counter-only Indonesian cafes and QSRs. It pairs a complete operational POS (orders, cash and QRIS payments, ingredient-level inventory, shifts, basic reports) with a flagship AI module — the **Predictive Demand Engine** — that produces a daily, transparent restock suggestion an owner can edit and send to suppliers via WhatsApp or PDF in one click.

The product is built on **TanStack Start + Convex**, deployed to **Cloudflare Pages**, with **shadcn/ui** as the component primitives. It is **offline-first** so cafes never lose sales when internet drops. Money is integer IDR throughout. Inventory is event-sourced via append-only movements. The forecast in V1 is **rule-based** (not ML) so the owner can read and trust every prediction; the ML-trained model is a V2 backend swap behind the same UX.

V1 explicitly omits dine-in/table management, EDC card payments, supplier API integrations, voice ordering, computer vision, Loyalty 2.0, sustainability tracking, multi-outlet, and native mobile apps. These are documented in the V2+ roadmap.

Estimated timeline: **12–16 weeks** to V1 GA, gated on a foundations week (week 1) that validates the TanStack Start + Cloudflare + Convex deployment shape before feature work begins.

---

## Table of Contents

1. [Goals, Non-Goals, Personas, Primary Flows](#1-goals-non-goals-personas-primary-flows)
2. [Domain Model](#2-domain-model)
3. [System Architecture](#3-system-architecture)
4. [Module Specs](#4-module-specs)
5. [Cross-cutting Concerns](#5-cross-cutting-concerns)
6. [Error Handling, Edge Cases, Failure Modes](#6-error-handling-edge-cases-failure-modes)
7. [Testing Strategy, Rollout, V2+ Roadmap](#7-testing-strategy-rollout-v2-roadmap)
8. [Open Questions](#8-open-questions)

---

## 1. Goals, Non-Goals, Personas, Primary Flows

### 1.1 Goals (V1)

1. A counter-only Indonesian cafe can run an entire day of operations on kodapos — taking orders, accepting cash + QRIS, tracking ingredient inventory, closing the shift — without leaving the app and without losing sales when internet drops.
2. Owners get a daily "draft restock list" derived from sales history, day-of-week patterns, and a basic weather signal, that they can edit and send to suppliers via WhatsApp/PDF in one click.
3. SaaS onboarding lets a new cafe owner self-serve from signup to "first sale" in under 30 minutes.

### 1.2 Non-Goals (explicitly out of V1)

- Dine-in / table management, server-side ordering, split bills.
- EDC card payment integration (deferred to V1.1 / V2).
- True ML-trained demand model — V1 ships rule-based forecast; ML in V2.
- Supplier API integrations (V1 = WhatsApp/PDF draft order; no auto-submit).
- Voice ordering, computer vision, Loyalty 2.0, sustainability ledger — later phases.
- Native mobile apps (V1 is responsive web only).
- Multi-outlet / franchise consolidation (single outlet per tenant in V1).
- Custom hardware integrations beyond browser-supported peripherals.

### 1.3 Personas

1. **Cashier (primary user, ~90% of usage).** Stands at the counter. Takes orders, runs payments, prints receipts. Needs speed and zero training. Reads Bahasa Indonesia.
2. **Owner / Manager (secondary, daily check-in).** Reviews sales reports, edits menu/recipes, handles the predictive restock workflow, manages staff. May not be on-site full-time.
3. **Kitchen/Barista (passive, V1).** Reads order tickets. V1 ships a "kitchen view" page on a second laptop or printed receipts — no interactive KDS app.

### 1.4 Primary user flows (the 5 critical paths V1 must nail)

1. **Take an order → cash payment → receipt.** Cashier scrolls/searches menu, builds cart, takes cash, system calculates change, receipt prints or shows on-screen.
2. **Take an order → QRIS payment.** Static-QR mode = cashier sights bank app, marks paid. Dynamic-QR mode = generate QR via Midtrans/Xendit, poll for confirmation, auto-close order.
3. **Open shift → cash float → close shift with reconciliation.** Cashier opens shift with starting cash, system tracks expected drawer, end-of-shift count vs expected with variance flagged.
4. **Owner reviews tomorrow's restock.** Opens dashboard, sees "Predicted demand tomorrow: 80 lattes, 45 espressos…" → "Restock suggestion: 2.5 kg beans, 18 L milk, 3 bottles vanilla syrup" → edits if needed → exports as WhatsApp message or PDF.
5. **Cafe goes offline mid-shift.** Banner appears, sales continue, payments fall back to cash/static-QRIS only (dynamic QRIS disabled), local mutation queue accrues; when online, sync resumes with conflict resolution.

---

## 2. Domain Model

### 2.1 Tenancy & access

- **`cafes`** — the tenant unit. Fields: `name`, `address`, `currency: "IDR"`, `taxMode: "exclusive" | "inclusive" | "none"` (default `"exclusive"` — PPN added on top of subtotal, the standard Indonesian pattern), `taxRatePct` (default 11%), `timezone` ("Asia/Jakarta"), `qrisStaticImageUrl?`, `paymentProvider?: "midtrans" | "xendit"`, `createdAt`.
- **`users`** — `cafeId`, `email`, `name`, `role: "owner" | "manager" | "cashier"`, `pin` (hashed Argon2id, 4–6 digit for fast cashier login), `active`.
- **Auth model:** owners sign in with email/password (Convex Auth). Cashiers sign in with a 4-digit PIN tied to the device's already-authenticated cafe session — keeps counter login under 2 seconds.

### 2.2 Menu & recipes

- **`menuCategories`** — `cafeId`, `name`, `displayOrder`, `archived`.
- **`menuItems`** — `cafeId`, `categoryId`, `name`, `priceIDR` (integer rupiah; IDR has no cents), `sku`, `imageUrl?`, `archived`, `defaultModifiers: ModifierRef[]`.
- **`modifiers`** — `cafeId`, `name` ("size", "milk type"), `options: [{ label, priceDeltaIDR, recipeAdjustments? }]`.
- **`ingredients`** — `cafeId`, `name`, `canonicalUnit: "g" | "ml" | "piece"`, `currentStockQty` (derived, see §2.5), `reorderThreshold`, `defaultSupplierId?`, `lastCostPerUnitIDR`.
- **`recipes`** — `menuItemId`, `lines: [{ ingredientId, quantity (in canonical unit), wastageFactor (default 1.0) }]`. One recipe per menu item. Modifier options can adjust recipe lines (e.g., "oat milk" swaps `dairyMilkId` → `oatMilkId`).
- **`suppliers`** — `cafeId`, `name`, `whatsappPhone`, `email?`, `notes?`.

### 2.3 Sales & shifts

- **`orders`** — `cafeId`, `shiftId`, `clientId` (UUID from device for idempotency), `lines: OrderLine[]`, `subtotalIDR`, `taxIDR`, `discountIDR`, `totalIDR`, `paymentMethod`, `paymentStatus: "pending" | "paid" | "void"`, `cashierId`, `createdAtClient`, `syncedAt?`.
- **`orderLines`** (embedded in `orders`): `menuItemId`, `nameSnapshot`, `qty`, `unitPriceSnapshot`, `modifiersSnapshot`, `recipeSnapshot` — recipe is frozen at sale time so retroactive recipe edits don't rewrite history.
- **`payments`** — `orderId`, `method: "cash" | "qris_static" | "qris_dynamic"`, `amountIDR`, `cashTendered?`, `changeIDR?`, `providerRef?` (Midtrans/Xendit txn id), `providerStatus?`, `confirmedAt?`.
- **`shifts`** — `cafeId`, `cashierId`, `openedAt`, `closedAt?`, `openingFloatIDR`, `expectedCashIDR` (computed at close), `countedCashIDR?`, `varianceIDR?`, `status: "open" | "closed"`.

### 2.4 Predictive demand

- **`forecasts`** — `cafeId`, `forDate` (the day being predicted, cafe-local), `generatedAt`, `method: "rule_v1"`, `lines: [{ menuItemId, predictedQty, confidence: "low" | "med" | "high", drivers: string[] }]`, `weatherSignal?`.
- **`restockSuggestions`** — `cafeId`, `forecastId`, `lines: [{ ingredientId, suggestedQty, currentStockQty, reasonText }]`, `status: "draft" | "sent" | "dismissed"`, `exportFormat?: "whatsapp" | "pdf"`, `exportedAt?`.

### 2.5 Inventory (event-sourced)

- **`inventoryMovements`** — `cafeId`, `ingredientId`, `delta` (negative for sales, positive for restock), `reason: "sale" | "restock" | "adjustment" | "waste"`, `refType?`, `refId?`, `at`.
- **Stock is derived from movements, not stored as mutable counters.** This is conflict-free for offline syncs and gives a full audit trail.

### 2.6 Audit & sync metadata

- **`auditEvents`** — `cafeId`, `actorUserId`, `action`, `targetType`, `targetId`, `metadata`, `at`. Append-only; no edit or delete API.
- **`replayConflicts`** — surfaces only when a mutation replay throws an unresolvable conflict. Owner manually resolves.
- Each mutating document carries `clientId`, `createdAtClient`, and Convex's built-in `_id` / `_creationTime`. Mutations from offline devices are replayed in `createdAtClient` order on reconnect; idempotency via `clientId`.

### 2.7 Notable choices

- **Money is integer IDR.** No floats, no cents.
- **Inventory is event-sourced** (movements, not mutable counters).
- **Order lines snapshot menu state at sale time.**
- **One outlet per cafe in V1.** Multi-outlet support is a V2 schema addition (`outletId` on transactional tables), not a V1 concern.

---

## 3. System Architecture

### 3.1 High-level shape

```
┌──────────────────────────────────────────────────────────────┐
│  Browser (counter laptop / owner laptop)                     │
│  TanStack Start app (Vite + TanStack Router + Query)         │
│  Convex React client (offline mutation queue + reactive q.)  │
│  IndexedDB cache via Convex local store                      │
│  Service Worker (Workbox) for app shell + asset caching      │
└──────┬─────────────────────────────────────┬─────────────────┘
       │ SSR / server fns                    │ WebSocket / HTTPS
┌──────▼─────────────────────────┐    ┌──────▼────────────────┐
│  Cloudflare Pages + Workers    │    │  Convex Cloud         │
│  • SSR for marketing, signup,  │    │  • Schema + indexed   │
│    public pages                │    │    queries/mutations  │
│  • TanStack Start server fns   │    │  • Convex Auth + PIN  │
│    (edge): PDF gen, WhatsApp   │    │  • Scheduled crons    │
│    deep-link, webhook proxy    │    │  • HTTP actions for   │
│  • R2 (optional, V2): static   │    │    PG webhooks        │
│    receipt archive             │    │  • File storage:      │
│  • Workers KV: feature flags,  │    │    menu images, PDFs  │
│    rate-limit counters         │    └──────┬────────────────┘
└────────────────────────────────┘           │
                                             │ outbound HTTPS
                                      ┌──────▼────────────────┐
                                      │  External services    │
                                      │  • Midtrans / Xendit  │
                                      │  • Open-Meteo (wx)    │
                                      │  • ID holiday JSON    │
                                      └───────────────────────┘
```

### 3.2 Frontend architecture

- **TanStack Start** as the full-stack shell. One framework, one router, no Next.js. Vite dev server. Deployed via the official Cloudflare deployment target.
- **Route groups:**
  - `(public)/*` — marketing, signup, billing, password reset, public docs. SSR'd at the Cloudflare edge for fast TTFB.
  - `(pos)/*` — the POS app proper. Thin SSR shell, then SPA hydration. Once loaded, no server roundtrips for navigation — critical for counter responsiveness.
- **TanStack Router** for type-safe routes, search-param state, and route-level loaders (menu prefetch on POS open).
- **TanStack Query** for non-Convex external fetches only (weather preview during onboarding, holiday calendar refresh). Convex's reactive `useQuery` covers all internal data.
- **Server functions** (`createServerFn`) for things that must run server-side but don't need Convex: PDF generation for restock export, WhatsApp `wa.me` deep-link builder, webhook proxying if Convex HTTP actions are blocked on a customer's network.
- **shadcn/ui** as component primitives. Components copied into `src/components/ui/*` and customized freely. Cafe-specific compositions built on top: `<MenuItemCard>`, `<CartLine>`, `<PaymentMethodPicker>`, `<NumberPad>`, `<ForecastDriverChip>`.
- **Tailwind v4** with a centralized tokens file (brand colors, semantic colors, font scale, spacing). No arbitrary values in components.
- **PWA shell**: `manifest.json` + Workbox service worker for installability and offline *asset* caching. The Convex client handles offline *data*.
- **Cart state**: local Zustand store, persisted to IndexedDB so a tab refresh doesn't lose an in-progress order.

### 3.3 Backend architecture (Convex)

> Convex is **not** hosted on Cloudflare — it is a managed service on its own infrastructure. Frontend lives on Cloudflare; backend lives on Convex Cloud. This is the standard pattern.

- **Schema-first.** Every entity from §2 declared in `convex/schema.ts` with indexes by `cafeId` + the natural query key (e.g., `orders` on `cafeId, shiftId` and `cafeId, createdAtClient`).
- **Tenant isolation enforced in every query/mutation** via a shared `requireCafeContext(ctx)` helper — the only path to authenticated data.
- **Mutations idempotent by `clientId`**: first check existence by `(cafeId, clientId)`; if exists, return existing. Safe under offline replay and duplicate-tab scenarios.
- **Scheduled functions** run nightly at 22:00 WIB per cafe: pull next-day weather, compute forecast, generate `restockSuggestion` rows so owners see them at morning open.
- **HTTP actions** handle inbound webhooks (Midtrans/Xendit): validate signature → find payment by `providerRef` → transition `paymentStatus`.

### 3.4 Cloudflare-specific choices

- **Hosting target**: Cloudflare Pages (Workers under the hood). TanStack Start has first-class Cloudflare support.
- **Edge runtime caveats**: server functions run on Workers — no Node-only APIs, watch bundle size. PDF generation uses `@react-pdf/renderer` or `pdf-lib` (both Workers-compatible).
- **DNS layout**: `app.kodapos.id` → Pages app; `*.kodapos.id` for marketing; Convex consumed via its native domain over WebSocket.
- **Workers KV** for feature flags and rate-limit counters on public endpoints (signup, password reset). Not used for app data — that lives in Convex.
- **R2 deferred to V2** unless long-term receipt archival is needed. V1 uses Convex's built-in file storage for menu images and exported PDFs.
- **Indonesia latency**: Cloudflare has POPs in Jakarta. Convex's nearest region is US/EU — tolerable for V1 (WebSocket reuse hides latency), monitor under load. A Cloudflare-edge mutation proxy is a V2 lever if counter UX feels sluggish.

### 3.5 Offline-first sync model

- **Reads:** Convex client maintains an IndexedDB-cached store of query results. Queries serve from cache when offline; UI shows offline banner.
- **Writes:** Mutations submitted while offline are queued by the Convex client. Each carries `clientId` for idempotency. On reconnect, the client replays them in `createdAtClient` order. Server-side mutation logic must tolerate ordering quirks (e.g., a `closeShift` arriving with a `createdAtClient` earlier than some `createOrder` mutations — close-shift logic recomputes `expectedCashIDR` from the actual order set, not from a snapshot at close time).
- **Payment ↔ offline constraint:** Cash and static-QRIS work fully offline (payment confirmation is the cashier marking it paid). Dynamic QRIS is **explicitly disabled** when offline — the UI hides that payment option. This is a hard product rule, not graceful degradation.
- **Inventory deduction:** Each order creates `inventoryMovements` rows server-side (in the same mutation that creates the order). Stock is always derived from the current set of movements, so two offline devices replaying simultaneously can't double-deduct.

### 3.6 Cross-cutting basics

- **Money:** integer IDR everywhere, formatted at the edge with `Intl.NumberFormat('id-ID')`.
- **Time:** UTC at rest; `Asia/Jakarta` at the edge. `forecast.forDate` is a date string in cafe-local time, not a UTC instant.
- **i18n:** Bahasa Indonesia primary, English fallback. Framework-agnostic library (Lingui, Paraglide, or `i18next` + `react-i18next`) — **not** `next-intl`, which is Next-coupled.
- **Observability:** Convex's built-in logs + Sentry for client errors. PostHog for product analytics.
- **Receipts:** browser print (CSS `@media print`) for V1. Thermal-printer integration deferred to V1.1.

### 3.7 Risk flag — TanStack Start maturity

TanStack Start went GA in late 2025. By V1 launch (late 2026) it will have 12+ months of GA maturity, but Stack Overflow / community knowledge will still be thinner than Next.js. **Validate the deployment shape in week 1** — a "hello world" with auth + one Convex query on Cloudflare Pages — before committing feature work on the assumption it all works.

---

## 4. Module Specs

### 4.1 POS Core (the counter app)

**Routes**: `(pos)/sale`, `(pos)/sale/:orderId`, `(pos)/history`.

**Sale screen layout**: 70/30 split — left = category tabs + menu grid (large touch targets even on a trackpad), right = cart + payment panel. Header shows current shift status + online/offline indicator.

**Cart behaviors**:

- Tap menu item → adds qty 1 to cart. Tap again → qty 2. Long-press / right-click → opens modifiers modal.
- Items with required modifiers (e.g., size on an espresso drink) auto-open the modifier modal on first tap.
- Cart line: name, modifiers, qty, line total. Tap line → edit qty / modifiers / remove.
- "Clear cart" requires a confirm (shadcn `AlertDialog`) — cashier muscle memory accidents are real.

**Checkout**:

- Big "Bayar" (Pay) button shows total. Tap → payment method picker (Cash | QRIS Statis | QRIS Dinamis [hidden if offline] | EDC [disabled "segera hadir" in V1]).
- Cash flow: numpad for amount tendered, system shows change. Quick buttons for common denominations (Rp 50.000, Rp 100.000, exact).
- QRIS static flow: shows the cafe's QR image fullscreen, cashier taps "Sudah Dibayar" after sighting confirmation, optionally enters customer phone for receipt.
- QRIS dynamic flow: shows the generated QR + countdown timer (default 15 min); auto-closes on webhook confirmation; polls every 3s as fallback.
- After payment: receipt preview → "Cetak" (browser print) or "Selesai" (close, return to fresh cart).

**Voids/refunds (V1 = basic)**: a closed paid order can be voided within the same shift by an Owner/Manager PIN. Void creates a reverse `inventoryMovement` set and a negative `payments` row. No partial refunds in V1 — full void only.

**Discounts**: a single "Diskon" line on the cart, owner-PIN to apply, with optional reason text. Percentage OR flat amount, applied to subtotal pre-tax. No promo codes, no time-based promos in V1.

**Zero-price items** (sample, on-the-house): allowed. Pay flow short-circuits to "Selesai" — no payment row; recipe still deducts inventory. Owner-only PIN to apply. Audit-logged.

**Tip handling**: no explicit tip line in V1. Cash overage on a cash transaction can be recorded as `change refused = tip` (optional toggle in settings).

**Edge cases that must work**:

- Two tabs open in the same browser on the same shift — last-writer-wins on shift state, but `clientId` on orders prevents duplicate orders.
- Network drops mid-checkout on a dynamic QRIS payment — the payment row stays `pending`; reconnection re-subscribes to the Convex query and webhook arrival flips it to `paid` automatically.
- Cashier closes the laptop lid mid-order — cart is persisted to IndexedDB; reopening restores exactly where they were.

### 4.2 Inventory & Recipes

**Routes**: `(pos)/inventory`, `(pos)/inventory/ingredients/:id`, `(pos)/menu/items/:id` (recipe lives on the menu item).

**Ingredient list**: searchable table — name, current stock (derived from movements), unit, reorder threshold, last cost, supplier. Color highlight when `currentStockQty < reorderThreshold`.

**Recipe editor** (on menu item edit screen): line-by-line — ingredient picker (autocomplete), qty in canonical unit, optional wastage factor (default 1.0). Live cost-per-cup calculation shown as you build (`Σ qty × lastCostPerUnit × wastage`). Owner can save without a recipe — items without recipes don't deduct inventory and don't get restock predictions (flagged with a yellow icon).

**Modifier ↔ recipe interaction**: a modifier option (e.g., "Oat milk +Rp 5.000") can declare `recipeAdjustments` — a delta to the recipe ("swap `dairy_milk` 200ml → `oat_milk` 200ml"). Computed at sale time, snapshotted into the order line.

**Manual stock adjustments**: a "Catat Stok" (Record Stock) action — owner picks ingredient, enters new qty + reason ("delivered", "wastage", "spilled", "count correction"). Creates an `inventoryMovement` row with `reason = "adjustment"`. Never edits a movement; always append.

**Edge cases**:

- An item sold offline whose recipe was edited online by the owner during the offline window: the order line snapshotted the old recipe; inventory deducts from the old recipe. New recipe applies to subsequent orders.
- An ingredient soft-deleted while it's in unsynced offline orders: ingredients use soft-delete (`archived = true`). Unit math still works at replay.

### 4.3 Shifts & Staff

**Routes**: `(pos)/shift/open`, `(pos)/shift/close`, `(pos)/staff` (owner-only).

**PIN login flow**: Cafe device authenticates once via owner email/password and is "registered" to that cafe via an encrypted long-lived token (sliding 90-day expiry). Subsequent sessions = a 4-digit PIN picker showing avatars/names of active cashiers. PIN validates against `users.pin` (Argon2id hash). Wrong PIN 5x in 1 min → device requires owner re-auth.

**Open shift**: pick cashier (or auto-detect from PIN session), enter `openingFloatIDR`, confirm. System creates a `shifts` row with `status = "open"`. Only one open shift per cafe at a time in V1 (multi-register is V2).

**Close shift**: cashier (or owner) initiates close → system computes `expectedCashIDR` = `openingFloat + Σ(cash payments) − Σ(cash voids)`. Cashier enters `countedCashIDR`. System computes `variance`. If `|variance| > Rp 10.000`, owner PIN required to confirm close. Generates a printable shift summary.

**Staff management (owner)**: add/remove cashiers, reset PIN, deactivate. Roles: `owner` / `manager` (full app access) / `cashier` (POS only, no settings, no reports beyond own shift summary).

**Edge cases**:

- Shift left open overnight: a scheduled function flags shifts open >12h and notifies the owner. Owner can force-close from the dashboard.
- Device unregistered by owner: existing PIN sessions on that device invalidate on next mutation.

### 4.4 Reports

**Routes**: `(pos)/reports/today`, `(pos)/reports/range`.

**Three reports cover 95% of V1 owner needs**:

1. **Today's sales** (live): gross revenue, transaction count, AOV, breakdown by payment method, top 10 items by qty, current shift status. Updates in real-time via Convex reactive queries.
2. **Date-range sales**: pick range (today / yesterday / last 7d / last 30d / custom). Daily totals chart, payment-method split, top items, top-items vs. same-prior-period delta.
3. **Inventory snapshot**: current stock per ingredient, days-of-cover estimate (based on trailing 14-day avg consumption), items below reorder threshold.

**Exports**: each report has "Unduh PDF" and "Unduh CSV". PDFs generated via a TanStack Start server function on Cloudflare. CSVs generated client-side.

**Explicitly NOT in V1 reports**: cohort analysis, customer lifetime value, hourly heatmaps, weather-correlated trends, supplier spend reports, P&L. All V2+.

### 4.5 Predictive Demand v1 (flagship AI)

**Routes**: `(pos)/forecast` (owner/manager only).

**Algorithm — deliberately rule-based, not ML**:

```
predictedQty(item, forDate) =
    base_estimate
  × day_of_week_multiplier
  × weather_multiplier
  × holiday_multiplier
```

Where:

- `base_estimate` = trimmed mean of qty sold for this item over the trailing 28 days, weighted toward recent days (exponential decay, λ=0.05). If fewer than 28 days of data exist (but ≥14, since <14 is suppressed), use all available days with the same decay.
- `day_of_week_multiplier` = ratio of (avg qty on `forDate.dayOfWeek` over trailing 8 weeks) to (overall avg). With <2 weeks of data, this multiplier is 1.0.
- `weather_multiplier` = lookup table by item category (cold drinks +15% on hot/clear days; hot drinks +10% on rainy/cool days; pastries no adjustment). Per-item override is a V2 feature.
- `holiday_multiplier` = hardcoded for known Indonesian holidays (Lebaran: -50% the day before, -80% on the day, +20% the day after; weekends near major holidays +10%).

**Cold-start handling**: <14 days of cafe data → forecast is suppressed, owner sees a *"Memerlukan minimal 14 hari data — kami sedang belajar"* message with an ETA based on signup date.

**Confidence labeling**: each forecast line gets `low | med | high` based on sample size and variance. UI shows the label, not the math.

**Drivers shown to owner**: each predicted line shows 1–2 plain-language reasons in Bahasa: *"+20% — biasanya ramai di hari Sabtu"*, *"Cuaca akan panas, minuman dingin diperkirakan naik 15%"*. This transparent forecast is the trust mechanism. Owners distrust black boxes.

**Restock suggestion derivation**:

For each ingredient: `requiredQty = Σ(predictedQty[item] × recipeLine.qty × wastageFactor) for the next 7 days`. Then `suggestedRestock = max(0, requiredQty − currentStockQty + safetyStock(item))` where `safetyStock = max(reorderThreshold, 1 day's worth of demand)`.

**Owner workflow on the forecast page**:

1. Lands on `/forecast` → sees tomorrow's predicted-demand cards (top items with qty + reason) + a "Daftar Belanja" (restock list) panel showing suggested ingredients.
2. Edits suggested quantities inline if they disagree (the edit + reason gets logged — feeds into V2's ML training set).
3. Picks a supplier per ingredient (defaults from `defaultSupplierId`).
4. Clicks "Kirim ke WhatsApp" → server function builds a formatted message and opens `wa.me/<supplierPhone>?text=<encoded>` in a new tab. OR "Unduh PDF" generates a formatted purchase order.
5. Marks the suggestion "Sent" — moves to history.

**What we explicitly do NOT do in V1**:

- No auto-send to suppliers (owner is always in the loop).
- No price negotiation, no supplier comparison, no bulk-discount logic.
- No live re-forecasting during the day (forecast is once daily at 22:00).
- No multi-day visibility beyond "tomorrow" and "next 7 days summed" — no calendar heat map (V2).

### 4.6 Onboarding & Settings

**Routes**: `(public)/signup`, `(pos)/onboarding/*`, `(pos)/settings/*`.

**Signup flow** (the "30 minutes to first sale" promise):

1. Sign up with email + password + cafe name + phone → creates `cafes` row + owner `users` row.
2. **Setup wizard** (4 steps, can skip any and return later):
   - **Cafe profile**: address (Google Places autocomplete for weather geocoding), timezone (default Asia/Jakarta), tax rate (default 11% PPN, toggleable off for businesses below the PPN threshold).
   - **Menu**: upload a CSV template OR add items manually. Built-in starter menus for "Coffee Shop" / "Bubble Tea" / "Bakery" to clone-and-edit. Recipe entry can be deferred.
   - **Payment methods**: enable Cash (default on), upload static QRIS image, optionally connect Midtrans or Xendit (V1 = paste API keys + verify with a test charge).
   - **First cashier**: add a cashier user + PIN. (Owner can also be cashier.)
3. Land on the POS screen ready for first sale. Bottom banner: "Belum semua siap? Lanjut setup."

**Settings sections** (owner-only):

- **Cafe profile** (editable post-signup).
- **Menu & recipes** (deep-link from setup).
- **Payments** (re-connect PG, update QRIS image).
- **Staff** (§4.3).
- **Subscription & billing** — V1 stub: free during pilot, paid plan flag for later. Full billing module is V2.
- **Audit log** — show recent voids, manual stock adjustments, large shift variances. Read-only.

---

## 5. Cross-cutting Concerns

### 5.1 Design system & UI

- **shadcn/ui** primitives in `src/components/ui/*`. Cafe-specific components composed on top.
- **Tailwind v4** with centralized tokens. Avoid arbitrary values in components.
- **Two density modes**: `comfortable` (owner dashboard) and `compact` (counter POS — denser menu grid, taller targets, larger numeric labels). A single CSS variable flip on the root.
- **Font**: Plus Jakarta Sans (full Indonesian glyph coverage, locally-flavored read). Cloudflare-hosted woff2, not Google Fonts.
- **Iconography**: Lucide only. No mixing icon families in a single view.
- **Counter UX specifics**:
  - Default button height **48px** on POS, 40px elsewhere.
  - All destructive actions use shadcn `AlertDialog`, never just `Dialog`.
  - Numeric input on cash-tendered uses a custom on-screen numpad, not `<input type="number">`. Physical keyboard input also works.
  - "Bayar" is the only filled-primary button on the cart screen — the visual anchor. Everything else is ghost/outline.
- **Dark mode**: shipped. Toggle in settings, persisted per-device.
- **Theming**: V1 = single brand theme. Per-cafe branding (logo on receipts, accent color) is V2.

### 5.2 Payments — integration depth

**Cash**: pure local logic. No external integration. Reconciliation lives in shift close.

**Static QRIS**: an image stored in `cafes.qrisStaticImageUrl`. Owner uploads in settings. No payment provider. Reconciliation is on the cafe.

**Dynamic QRIS — provider choice**:

- **Recommended: Xendit.** Better-documented webhooks, more idiomatic REST API, native QRIS dynamic endpoint, dashboard easier for non-technical owners.
- A thin `paymentProvider` abstraction in Convex (`createDynamicQrisCharge`, `verifyWebhook`, `getChargeStatus`) so the same Convex code path works for either provider. Concrete adapters: `xendit.ts` (V1) and `midtrans.ts` (added when first customer asks). Provider per-cafe.
- **Webhook security**: signature validation against per-cafe webhook secret. Reject webhooks whose `orderId` doesn't match a cafe's pending charge.
- **Reconciliation**: daily Convex cron pulls settlement reports and reconciles against `payments` rows. Orphans surface in owner's audit log.
- **PCI scope**: zero — QRIS doesn't touch card data; provider hosts the QR.

**EDC cards (V1.1+)**: UI shows "EDC (segera hadir)" disabled chip in V1. Spec'd but not built.

### 5.3 Auth & security

- **Convex Auth** for email/password. Magic-link as "forgot password" fallback.
- **Device registration → PIN**: once owner authenticates on a counter laptop, that browser is bound to the cafe via a long-lived encrypted token (sliding 90-day expiry). Cashier PIN is then sufficient for daily operation. PIN stored Argon2id-hashed.
- **RBAC**: `owner` > `manager` > `cashier`. Enforced server-side in every Convex function via `requireRole(ctx, "manager")` helpers. Client-side route guards are UX only, never trusted.
- **Audit log**: every privileged action (void, manual inventory adjustment, large variance close, staff add/remove, payment-provider re-keying) writes an immutable `auditEvents` row. Append-only.
- **Rate limiting**: PIN attempts (5/min/device → owner re-auth). Signup endpoint (1/email/hour via Workers KV counter). Webhook endpoints (signature is primary defense; KV-based IP rate limit secondary).
- **Secrets**: Convex env vars for shared secrets. Per-cafe webhook secrets stored encrypted in Convex with a master key from env. Never in the client bundle; never in Workers KV in plaintext.
- **2FA**: not in V1. Known gap. V2.
- **Indonesian data residency**: not legally required for small-cafe SaaS in 2026; documented transparently in privacy policy. Enterprise residency conversation is V2+.

### 5.4 Offline-first — conflict resolution playbook

| Scenario | Resolution |
|---|---|
| Two offline tabs on the same device create orders | Each tab generates a unique `clientId`; both replay as distinct orders. |
| Same shift closed offline on device A while device B keeps selling | Close-shift mutation re-aggregates the actual order set at server-time. Device B's orders sync, shift recomputes `expectedCashIDR` and updates variance. |
| Owner edits a recipe online while a cashier's offline order references the old recipe | Order line carries `recipeSnapshot`. Inventory deducts old recipe. New recipe applies forward. |
| Owner deletes a menu item while offline orders reference it | Menu items soft-deleted. Order line carries `nameSnapshot` and `unitPriceSnapshot`. |
| Inventory adjustment by owner during a cashier's offline session | Both are append-only `inventoryMovements`. Replay order doesn't matter. |
| Dynamic QRIS charge created online, network drops before webhook | `payments.status = pending`. On reconnect, client re-subscribes and webhook arrival flips status. If 30 min pass with no webhook, a Convex cron queries provider status and reconciles. |
| Webhook arrives but the local order was deleted | Webhook handler logs a `paymentOrphan` audit event for owner review; never silently drops. |
| Clock skew on cashier device | `createdAtClient` is for ordering only, never billing. Server's `_creationTime` is authoritative for reports. |

### 5.5 Internationalization

- **Bahasa Indonesia primary**, English fallback. All UI strings via a framework-agnostic library (Lingui / Paraglide / `i18next` + `react-i18next`). Pick one in Phase 0 — do not start feature work with strings hard-coded.
- **Currency formatting**: `Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })`. Centralized in a `<Money>` component.
- **Date formatting**: `id-ID` locale, `Asia/Jakarta` for display. UTC for storage. `date-fns-tz` for conversions.
- **Number input**: respect `id-ID` formatting where typed (period for thousands).
- **No auto-translation.** Every Bahasa string hand-written. Auto-translated UIs read foreign in this market.

### 5.6 Observability & performance

- **Frontend errors**: Sentry. Source maps uploaded on each Cloudflare Pages deploy. Tag with `cafeId`, `userId`, `route`, `online: bool`.
- **Backend errors**: Convex's native logs piped to Sentry via their integration.
- **Product analytics**: PostHog. Track ~20 events: `signup_completed`, `first_sale_completed`, `shift_opened`, `shift_closed_with_variance`, `forecast_viewed`, `restock_sent_to_supplier`, `payment_failed`, `offline_session_started`, etc.
- **Performance budgets** (counter UX is latency-critical):
  - Time to interactive on counter laptop: **< 2s** on a 3-year-old Acer (target hardware).
  - Menu item tap → cart update: **< 50ms** local.
  - Payment confirmation → fresh cart: **< 500ms**.
  - JS bundle (counter route): **< 250 KB gzipped**. Lazy-load dashboard/reports/settings routes off the hot path.

---

## 6. Error Handling, Edge Cases, Failure Modes

### 6.1 User-facing error states

| Failure | Cashier sees | Owner sees | Recovery |
|---|---|---|---|
| Internet drops mid-shift | Persistent yellow banner: *"Mode Offline — penjualan tetap jalan"*. Dynamic QRIS hidden. | Same banner. | Auto-restores on reconnect. |
| Convex backend unreachable, internet OK | Red banner: *"Server tidak terjangkau — pesanan disimpan lokal"*. Same as offline. | Same + Sentry-driven incident notification (V2). | Convex retry. Sustained → support contact. |
| Dynamic QRIS times out (15 min, no webhook) | Auto-shows: *"Pembayaran QRIS tidak terkonfirmasi. Coba lagi atau ganti metode."* Order stays open. | Audit log entry. | Cashier retries or switches method. |
| Webhook arrives 20 min after timeout | Order surfaces in *Riwayat* with status flipped to paid. Toast: *"Pembayaran lambat untuk Order #1234 sudah terkonfirmasi."* | Audit event. | Cashier verifies. |
| Receipt printer not available | Modal: *"Cetak gagal. Pilih: Coba lagi / Kirim ke WhatsApp / Lewati."* | n/a | WhatsApp receipt = server-function-generated PDF link. |
| QRIS image fails to load | Static QRIS panel shows "Reload" button + printable backup PDF link. | Settings page flags broken upload. | Owner re-uploads. |
| PIN forgotten | Cashier picker only. | Owner resets from `Settings → Staff` (SMS temp PIN or types a new one). | Trivial. |
| Owner email locked out | Magic-link fallback; ultimate fallback = support contact. | n/a | Support email reachable from public site day one. |
| Sync replay throws an unresolvable conflict | Non-blocking toast + `replayConflicts` row. Mutation **not** retried automatically. | Audit log shows it with "Resolve" button. | Owner decides. Designed to be rare. |

### 6.2 Failure modes

**Catastrophic device loss (stolen laptop)**: Owner-only action *"Hapus Perangkat"* invalidates the device token. Data lives in Convex, not the device — no sales records lost.

**Account takeover**: Mitigations — rate-limit auth (Workers KV, 10/hr/IP), Argon2id hashing, new-device login alerts (V2), audit log for post-incident forensics. **No 2FA in V1; known gap.**

**Payment provider outage (Xendit down 2h)**: Dynamic QRIS attempts fail fast (5s timeout). UI: *"Pembayaran QRIS sedang gangguan — gunakan QRIS Statis atau Tunai"*. Static QRIS and cash still work. Convex cron monitors provider status; auto-re-enables on recovery.

**Convex region outage**: Out of our hands; POS keeps selling offline. Reports/forecasts unavailable. Document in customer-facing SLA terms (V2).

**Weather API outage**: Forecast generation continues with `weather_multiplier = 1.0` and a note: *"Data cuaca tidak tersedia."* Forecast quality degrades; doesn't disappear.

**Forecast generation crashes for one cafe**: Per-cafe `try/catch`; failures log to Sentry and surface in owner's settings as *"Prediksi gagal dibuat semalam — hubungi support"*. Other cafes unaffected.

**Inventory data corruption**: Daily *Inventory Integrity Check* cron sums movements per ingredient and flags negative current stock (impossible barring bugs) or wildly improbable totals.

**Time skew (cashier device clock wrong)**: All ordering/reporting uses server `_creationTime`. `createdAtClient` is for replay order only. Skew >2h triggers a soft warning, doesn't block sales.

### 6.3 Edge cases that look small but bite

- **Refund of dynamic QRIS payment**: V1 = manual only. Order voided locally; owner refunds out-of-band. True API refund is V2.
- **Menu item rename mid-day**: doesn't affect open orders (snapshot). Future orders use new name. History reports show historical name on each line.

---

## 7. Testing Strategy, Rollout, V2+ Roadmap

### 7.1 Testing pyramid

**Unit (Vitest) — pure logic**:

- `forecast/` modules: day-of-week multiplier math, weather multiplier lookup, holiday calendar matching, restock quantity derivation. Most thoroughly tested code in the repo.
- `money/` helpers: IDR formatting, change calculation, variance computation.
- `inventory/` derivation: stock-from-movements, days-of-cover estimation.
- `recipe/` with modifier adjustments — given an order line with modifiers, produce the correct ingredient deduction set.

**Convex function tests (`convex-test`)**:

- Every mutation: success path, idempotency under duplicate `clientId`, tenant isolation, primary error path.
- Every query: correct tenant scoping, correct index hit (assert no full scans on hot paths).
- Schedulers: forecast cron with seeded data → expected output.
- Webhook handlers: signed payloads accepted; unsigned/wrong-cafe rejected.

**Integration (Playwright + Convex local dev)**:

The 5 critical paths from §1.4, each as one end-to-end test:

1. Cash sale → receipt.
2. Static QRIS sale → mark paid.
3. Dynamic QRIS sale → simulated webhook → auto-close.
4. Open shift → 5 sales → close shift with variance.
5. Owner views forecast → edits restock → exports to WhatsApp.

Plus one offline scenario: take device offline mid-shift, complete 3 sales, reconnect, verify all synced and reports tally.

**Manual / exploratory**:

- Counter UX feel on a real 3-year-old laptop. 30-minute simulated rush at the kodapos team's own desk. Anything that takes >2 taps to do is a defect.
- Forecast accuracy story. Generate forecasts against pilot-cafe historical data; review with owner. If they say *"this doesn't feel right"*, debug the driver chain.

**Skipped in V1**:

- Visual regression testing.
- Load testing.
- Cross-browser matrix beyond Chrome + Safari + Firefox on macOS/Windows.

### 7.2 Rollout plan

**Phase 0 — Foundations week (week 1)**: Deploy a "hello world" TanStack Start app to Cloudflare Pages with Convex Auth + one Convex query. Validate the deployment story. Cut bait on the stack now if Cloudflare/TanStack Start has a showstopper.

**Phase 1 — Internal alpha (weeks 2–6)**: POS Core + Shifts + minimum Inventory + minimum Reports. No AI yet. Internal team runs the app as if it were a cafe, on a fake menu, for one full simulated week. Aggressive bug bash.

**Phase 2 — Pilot cafe (weeks 7–10)**: One cafe switches to kodapos as its only POS. Free during pilot. Direct WhatsApp to the kodapos team. The deal: free for 6 months in exchange for patience and feedback.

**Phase 3 — Forecast launch (weeks 11–13)**: Ship Predictive Demand v1. First 2 weeks = cold-start messaging; week 3 = first forecasts live. Pilot owner is forecast reviewer.

**Phase 4 — Second cohort + paid (weeks 14–16)**: Open to 5–10 hand-picked cafes. Move from free pilot to paid plan. **Recommended pricing: Rp 199.000–299.000/mo flat, no transaction fees** — keeps Indonesian SMB accounting simple. Self-serve signup unlocked. **V1 GA.**

**Monitoring during rollout**:

- Daily Sentry triage. Paying-customer-blocking issues fixed same day.
- Weekly forecast-accuracy review per pilot cafe: how many ingredients did the owner override? Trend over time.
- Weekly "Did kodapos lose any sales this week?" call with each pilot cafe. The answer must be no.

### 7.3 V2+ roadmap

**V1.1 (months 5–6) — high-confidence fast follows**:

- EDC card payments via Indonesian acquirers (BCA, BRI EDC).
- Thermal printer support via a small companion app (Tauri or Electron) that bridges browser → ESC/POS over USB.
- True multi-outlet support: schema migration adds `outletId` to transactional tables.

**V2 (months 7–10) — AI maturity**:

- **ML-trained forecasting model**: with 6+ months of multi-cafe data, train XGBoost/LightGBM in a Python service called from a Convex action. V1 rule-based output becomes a feature in training. Owner UI unchanged.
- **Supplier integrations**: 1–2 Indonesian supplier networks (Sirclo, Ula, TaniHub-style) via API for true one-click restock. WhatsApp/PDF fallback persists.
- **Loyalty 2.0 lite**: customer identification (phone or QR), visit history, owner-defined upsell rules.
- **Promos & discounts engine**: time-based promos, item-bundle promos, customer-segment promos.

**V3 (year 2) — agentic vision**:

- **Agentic Operations Hub**: chat with your POS data via an LLM with tool access to the Convex schema.
- **Voice-Native Ordering**: hardest of the original five. Probably requires a partnership for ID/Javanese/dialect speech recognition.
- **Computer Vision Visual Audit**: separate hardware story for cafes that want it.
- **Sustainability ledger**: low-priority until customer signal demands it.

**Permanently out of scope (until evidence demands otherwise)**:

- Native mobile apps for cashiers (PWA does the job).
- F&B verticals other than counter QSR — would be separate products.
- Non-Indonesian markets — defer until Indonesia is a meaningful business.

---

## 8. Open Questions

These remain unresolved at design close. Each should be answered before or during early implementation.

1. **Payment provider primary**: spec recommends Xendit. Final pick pending owner research / commercial conversation.
2. **Pricing**: Rp 199.000–299.000/mo flat is a recommendation, not a commitment. Validate with pilot cafes.
3. **Forecast page exact information density**: spec describes the components but not the final layout. Falls out of implementation; iterate with pilot owner.
4. **Convex region acceptable latency**: spec assumes US/EU region is tolerable for Indonesian cafes. Validate empirically in Phase 0. If counter UX feels sluggish, the V2 lever is a Cloudflare-edge mutation proxy.
5. **Holiday calendar source**: spec assumes a hardcoded JSON for V1. Confirm whether to source from a maintained library or hand-curate.
6. **CSV menu import format**: spec mentions a "CSV template" but doesn't define columns. Define before menu module implementation.

---

*End of design document.*
