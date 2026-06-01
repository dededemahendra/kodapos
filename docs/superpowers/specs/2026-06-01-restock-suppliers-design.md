# Predictive Demand — Slice B: restock suggestions + suppliers + WhatsApp (V1 4.5b)

**Date:** 2026-06-01
**Status:** Approved design, ready for implementation plan
**Branch:** `feat/restock-suppliers` (off `main`)
**Depends on:** Slice A — the forecast engine + `forecast.demand` (merged, PR #23); recipes (`recipes.by_cafe_item`), ingredients (`reorderThreshold`, `canonicalUnit`, `lastCostPerUnitIDR`), the `currentStockQty(ctx, cafeId, ingredientId)` helper, the catalog UI kit (PageHeader, DataTable, StatusBadge, RowActions, ConfirmDialog, Dialog, Empty, Toolbar, toast).

## Context

Predictive Demand (V1 §4.5) decomposes into A — forecast engine (done) → **B — restock suggestions + suppliers + WhatsApp (this)** → C — weather + nightly cron. Slice A produces a live per-item forecast (tomorrow + 7-day total). Slice B turns that into action: an owner manages **suppliers**, sees a **Daftar Belanja** (restock list) derived from the 7-day forecast × recipes − stock, adjusts quantities, picks a supplier, and **sends the list to WhatsApp**.

Decisions from brainstorming: a real **suppliers table + admin** (`{ name, phone }`); **one supplier per send** (the whole list goes to one picked supplier — no per-ingredient supplier defaults); **WhatsApp send** now, **PDF deferred** to a B-PDF follow-up; the restock list is **computed live** (no persisted `restockSuggestions`/status/history — that pairs with Slice C's cron); qty edits are **client-side/ephemeral**.

## Goal

Let an owner (1) manage suppliers, and (2) on `/forecast`, see a restock shopping list derived from the forecast, tweak quantities inline, pick a supplier, and open WhatsApp pre-filled with the formatted list addressed to that supplier.

## Suppliers — table + admin

1. **`suppliers` table** in `convex/schema.ts`:
```
suppliers: defineTable({
  cafeId: v.id('cafes'),
  name: v.string(),
  phone: v.string(),     // stored as entered; normalized for wa.me at send time
  archived: v.boolean(),
  createdAt: v.number(),
}).index('by_cafe_active', ['cafeId', 'archived']),
```
Run `./node_modules/.bin/convex codegen`; commit drift.

2. **`convex/suppliers.ts`** (mirrors `convex/promotions.ts` exactly):
   - `list({ includeArchived? })` — cafe-scoped, non-archived unless `includeArchived`, sorted by name (id-ID). Returns the supplier docs.
   - `create({ name, phone })` → `Id<'suppliers'>`; `update({ id, name, phone })` → null; `archive({ id })` → null.
   - Shared `assertSupplier(name, phone)`: trimmed name length 1–60 (`Nama pemasok wajib diisi.` / `…maksimal 60 karakter.`); phone — after `normalizePhone` (§ WhatsApp) the result must be ≥ 8 digits (`Nomor telepon tidak valid.`). Ownership via `requireOwnerCafe` + `requireOwned`.

3. **`/suppliers` admin page** (`src/routes/_pos/suppliers.tsx`, replace the stub if one exists, else add the route) — mirrors the Promos admin page:
   - PageHeader: title "Pemasok"; meta "{n} pemasok aktif"; action "+ Tambah Pemasok".
   - Toolbar Aktif/Arsip chips; DataTable (`Supplier = Doc<'suppliers'>`): **Nama** (button→edit, active view) / **Telepon** / **Status** StatusBadge; row `⋯` (Ubah · Arsipkan→ConfirmDialog) active-only; archived read-only; shadcn `Empty`.
   - **`SupplierFormDialog`** (`src/components/supplier/supplier-form-dialog.tsx`): Nama `Input` + Telepon `Input` (type=tel); create/update; success/error toasts + inline `FieldError`. Mirrors `PromoFormDialog`.
   - **Nav**: add `{ title: msg\`Pemasok\`, path: "/suppliers" }` to the **Inventaris** group's sub-nav (next to Pembelian).

## Restock derivation

1. **Shared compute extraction (refactor):** the per-item 7-day forecast currently lives inline in `forecast.demand`'s handler. Extract it into a server helper `computeDemand(ctx, cafeId): Promise<DemandResult>` in `convex/lib/demand.ts` (takes a query ctx; not pure — reads orders). `DemandResult` is the existing union (`{ status: 'learning', daysCollected, daysNeeded, etaDateKey } | { status: 'ready', forDateKey, lines }`). `forecast.demand` becomes a thin wrapper that calls `computeDemand(ctx, cafeId)`; the new restock query reuses it — so the 56-day scan + engine wiring isn't duplicated. The forecast tests must stay green (behavior unchanged).

2. **`convex/restock.ts` → `suggestion` query** (owner-scoped, `args: {}`):
   - `const { cafeId } = await requireOwnerCafe(ctx)`; `const demand = await computeDemand(ctx, cafeId)`.
   - If `demand.status === 'learning'` → return `{ status: 'learning', daysCollected, daysNeeded, etaDateKey }` (pass through).
   - Else: build `requiredByIngredient: Map<ingredientId, number>`. For each demand line, look up the item's recipe (`recipes` `by_cafe_item` for `(cafeId, menuItemId)`); for each recipe line add `line.sevenDayQty × recipeLine.qty × recipeLine.wastageFactor` to `requiredByIngredient[recipeLine.ingredientId]`.
   - For each ingredient with required > 0: fetch the ingredient doc (name, canonicalUnit, reorderThreshold; skip archived) and `currentStockQty(ctx, cafeId, ingredientId)`. Compute via a **pure** helper (testable, in `convex/lib/restock.ts`):
     ```
     suggestRestock(required, currentStock, reorderThreshold):
       safetyStock = max(reorderThreshold, required / 7)
       return Math.ceil(Math.max(0, required - currentStock + safetyStock))
     ```
   - Return `{ status: 'ready', lines: Array<{ ingredientId, name, unit, suggestedQty, currentStockQty }> }` for lines where `suggestedQty > 0`, sorted by name (id-ID). Reactive query; bounded at single-cafe scale (same note as Slice A — Slice C persists nightly).

## Daftar Belanja panel (on `/forecast`)

Add a "Daftar Belanja" section below the demand cards on `src/routes/_pos/forecast.tsx`:
- Query `api.restock.suggestion`.
- **loading** → Spinner; **learning** → the same "sedang belajar" Empty (the restock can't predict either); **ready, empty lines** → shadcn `Empty` ("Stok cukup untuk minggu ini." — nothing to buy); **ready with lines** → a table: Bahan / Saran (an inline editable `Input type=number`, client-side state seeded from `suggestedQty`) / Stok kini / unit.
- A **supplier picker** (`Select` over `api.suppliers.list({})` active suppliers) + a **"Kirim ke WhatsApp"** `Button` (disabled until a supplier is selected and there's ≥1 line). On click → open `waUrl(supplier.phone, formatRestockText(cafeName, editedLines))` in a new tab.
- Edits live in component state (a `Map<ingredientId, number>` overriding the suggested qty); cleared on data change. No persistence.

## WhatsApp helpers (`src/lib/whatsapp.ts`, pure)

- `normalizePhone(raw: string): string` — strip everything but digits; if it starts with `0`, replace the leading `0` with `62`; if it starts with `62`, keep; otherwise return the digits as-is. (Indonesian numbers; `+62…`/`0812…`/`62812…` all → `62812…`.)
- `waUrl(phone: string, text: string): string` → `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(text)}`.
- `formatRestockText(cafeName: string, lines: Array<{ name: string; qty: number; unit: string }>): string` → e.g. `Daftar Belanja — {cafeName}\n- {name}: {qty} {unit}\n…`. Plain text (this is message content, like the receipt — kept simple, not i18n-routed; the surrounding UI is i18n'd).

`normalizePhone` is also imported by `assertSupplier` (server) for validation — so it lives in a place importable by both. Put it in `convex/lib/phone.ts` (pure) and re-export/import from the client `whatsapp.ts`, OR keep the normalizer in `convex/lib/phone.ts` and have `whatsapp.ts` import it (client can import `convex/lib/*`, as it already does for `pricing`/`time`). Use the latter: `normalizePhone` in `convex/lib/phone.ts`; `waUrl`/`formatRestockText` in `src/lib/whatsapp.ts` importing it.

## i18n

New Indonesian source strings: supplier page (Pemasok, Tambah Pemasok, Nama pemasok, Telepon, {n} pemasok aktif, dialog titles, toasts), restock panel (Daftar Belanja, Bahan, Saran, Stok kini, Pemasok, Kirim ke WhatsApp, "Stok cukup untuk minggu ini."), reused Aktif/Arsip/etc. Server throw strings (`Nama pemasok wajib diisi.`, `Nomor telepon tidak valid.`, etc.) stay raw Indonesian (not i18n'd). `formatRestockText` content is message data (not routed through the catalog). After implementation: extract → fill `en` → compile.

## Testing

- **Pure** — note the vitest config covers `tests/` and `src/`, NOT `convex/lib/`, so pure convex-helper tests go under `tests/convex/` (like `forecast-engine.test.ts`): `tests/convex/phone.test.ts`, `tests/convex/restock-math.test.ts` (importing from `../../convex/lib/…`), and `src/lib/whatsapp.test.ts` (src/ is covered). `normalizePhone` (`0812…`→`62812…`, `+62 812-…`→`62812…`, `62812…` kept, short→still normalized for the validator to reject); `suggestRestock` (safety-stock = max(reorder, req/7); ceil; clamp ≥0; fully-stocked → 0); `waUrl` (encoding) + `formatRestockText` (formatting).
- **Convex** (`tests/convex/suppliers.test.ts`, `tests/convex/restock.test.ts`): suppliers CRUD + validation (blank/long name, invalid phone) + tenant isolation (mirror `promotions.test.ts`); `restock.suggestion` — seed ≥14 active days of orders + a recipe (item→ingredient) + stock movements → assert suggested quantities, safety-stock flooring, a fully-stocked ingredient omitted, cold-start `learning`, tenant isolation. Confirm the extracted `computeDemand` leaves the forecast tests green.
- **Playwright** (auth-gated, extend `tests/e2e/sale.spec.ts`): create a supplier on `/suppliers` and see it listed. (The `/forecast` restock cold-start path is covered by the existing fresh-cafe forecast e2e.)
- Gate: `pnpm typecheck && pnpm test && pnpm lingui:compile`; `convex codegen` → commit drift.

## Affected / new files (anticipated)

**Modified:** `convex/schema.ts` (suppliers table), `convex/_generated/*`, `convex/forecast.ts` (use `computeDemand`), `src/routes/_pos/forecast.tsx` (restock panel), `src/components/app-shared.tsx` (suppliers nav), Lingui catalogs, `tests/e2e/sale.spec.ts`.
**New:** `convex/suppliers.ts` (+ `tests/convex/suppliers.test.ts`); `convex/restock.ts` (+ `tests/convex/restock.test.ts` — the query test); `convex/lib/demand.ts` (extracted shared compute); `convex/lib/restock.ts` (+ `tests/convex/restock-math.test.ts` — the pure `suggestRestock`); `convex/lib/phone.ts` (+ `tests/convex/phone.test.ts`); `src/lib/whatsapp.ts` (+ `src/lib/whatsapp.test.ts`); `src/routes/_pos/suppliers.tsx`; `src/components/supplier/supplier-form-dialog.tsx`; `src/components/forecast/restock-panel.tsx` (if the panel grows large enough to extract from the page).

## Out of scope (later)

- **PDF purchase order** ("Unduh PDF") → the B-PDF follow-up slice (TanStack server function + pdf lib on Cloudflare).
- **Persistence** — the `restockSuggestions` table, draft/sent/dismissed status, "mark sent" → history, and edit-logging ("feeds V2 training") → **Slice C** (with the nightly 22:00 WIB cron that persists forecasts + restock suggestions).
- Per-ingredient default suppliers, grouped multi-supplier sends, supplier price/spend tracking — V2.
