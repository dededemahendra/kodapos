# Catalog UI Kit — Promotions admin (Sub-project 5a)

**Date:** 2026-05-31
**Status:** Approved design, ready for implementation plan
**Branch (suggested):** `feat/promotions-admin` (off `main`)
**Depends on:** Catalog UI kit (PageHeader, Toolbar, DataTable, StatusBadge, RowActions, ConfirmDialog, Dialog, Empty, toast — merged).

## Context

The Promotions roadmap item (sub-project 5) is decomposed into **5a — promo-rules admin** (this spec) and **5b — cashier application** (next slice). `/promos` is a `ComingSoon` stub. There is no promotion concept yet, but the pricing path is ready: `computeOrderTotals` (`convex/lib/pricing.ts`) already takes a `discountIDR` and applies service charge + tax on the discounted base, and `createCashSale` / the `orders` table already carry `discountIDR` (currently always 0). 5b will compute that discount from a selected promo; 5a only defines and manages promos.

Decisions from brainstorming: **order-level, manually applied** promos; types **percent** and **fixed**; **no max-discount cap**.

## Goal

Let an owner create, edit, and archive simple order-level promotions (a percent or fixed-rupiah discount), shown in a kit admin page. Provide the pure value/discount helpers now so 5b reuses them without drift. No checkout changes in this slice.

## Schema + backend

1. **New `promotions` table** in `convex/schema.ts`:
```
promotions: defineTable({
  cafeId: v.id('cafes'),
  name: v.string(),
  type: v.union(v.literal('percent'), v.literal('fixed')),
  value: v.number(),       // percent: whole percent 1–100; fixed: IDR amount ≥ 1
  archived: v.boolean(),
  createdAt: v.number(),
}).index('by_cafe_active', ['cafeId', 'archived']),
```

2. **`convex/promotions.ts`** (mirrors `menu/categories.ts` / `ingredients.ts` CRUD):
   - `list({ includeArchived? })` — cafe-scoped; non-archived unless `includeArchived`; sorted by name (id-ID). Returns the promotion docs.
   - `create({ name, type, value })` → `Id<'promotions'>`.
   - `update({ id, name, type, value })` → null.
   - `archive({ id })` → null (sets `archived: true`).
   - **Validation** (shared `assertPromo(name, type, value)`): trimmed name length 1–60 ("Nama promo wajib diisi." / "…maksimal 60 karakter."); if `type==='percent'`, `Number.isInteger(value) && value >= 1 && value <= 100` ("Persentase promo harus 1–100."); if `type==='fixed'`, `Number.isInteger(value) && value >= 1` ("Nominal promo harus bilangan bulat ≥ 1."). Ownership via `requireOwnerCafe` + `requireOwned`.

No `_generated` source change beyond the new module/table; run `./node_modules/.bin/convex codegen` and commit any drift.

## Pure helper — `src/lib/promo.ts`

- `formatPromoValue(type: 'percent' | 'fixed', value: number): string` → `"20%"` for percent, `formatIDR(value)` for fixed (imports `formatIDR` from `~/lib/money`). Pure; unit-tested. Used by the page's Nilai column.

> The discount-amount math (`promoDiscountIDR`) belongs to **5b** (cashier application) — it has no consumer in 5a, so YAGNI: defer it. 5b adds it to this same `promo.ts` with its own test.

## Components

| Unit | File | Responsibility |
|---|---|---|
| `promotions` table | `convex/schema.ts` | Persist promos. |
| CRUD | `convex/promotions.ts` | list/create/update/archive + `assertPromo`. |
| `formatPromoValue` | `src/lib/promo.ts` + `.test.ts` | Pure Nilai display (percent/fixed). |
| Promos page | `src/routes/_pos/promos.tsx` (replace stub) | PageHeader + Toolbar + DataTable + dialogs. |
| `PromoFormDialog` | `src/components/promo/promo-form-dialog.tsx` | Create/edit promo (name + type Select + value). |

### Promos page details (`/promos`)

- **PageHeader:** title "Promo & Diskon"; meta "{n} promo aktif"; action "+ Tambah Promo" → `PromoFormDialog` create.
- **Toolbar:** Aktif / Arsip chips with counts (fetch `list({ includeArchived: true })`, filter client-side — the section's standard pattern). No search (promos are few).
- **DataTable** (`Promo = Doc<'promotions'>`):
  - **Nama** — a button that opens `PromoFormDialog` edit (active view) / plain text (archived view).
  - **Tipe** — `StatusBadge`: `Persen` (success) / `Nominal` (muted).
  - **Nilai** — `formatPromoValue(type, value)`.
  - **Status** — `StatusBadge`: Aktif (success) / Arsip (muted).
  - **actions** (active view only) — `RowActions ⋯`: Ubah (opens edit) · — · Arsipkan (destructive → `ConfirmDialog` → `promotions.archive`).
  - `initialSort` by Nama; `Empty` empty state (icon e.g. `BadgePercent`).
  - Archived view: read-only (no `⋯`), consistent with other pages.
- **`PromoFormDialog`** (`src/components/promo/promo-form-dialog.tsx`): controlled `{ open, promo: Doc<'promotions'> | null, onOpenChange }`. Fields: Nama `Input`; **Tipe** `Select` (Persen/Nominal); **Nilai** `Input type=number` whose label shows the unit (`%` for percent, `Rp` for fixed) and `min` adjusts (1–100 vs ≥1). Submits `create`/`update`; success/error toasts + inline `FieldError`. Mirrors `CategoryFormDialog`.

## i18n

New strings via Lingui. After implementation: `pnpm lingui:extract`, fill `en`, `pnpm lingui:compile`. New strings: "Promo & Diskon", "{n} promo aktif", "Tambah Promo", "Nama promo", "Tipe", "Nilai", "Persen", "Nominal", "Ubah promo", "Tambah promo", "Promo ditambahkan.", "Promo diperbarui.", "Promo diarsipkan.", "Gagal menyimpan promo.", "Arsipkan promo?", the archive description, "Belum ada promo.", reused Aktif/Arsip/Arsipkan/Ubah/Status/Nama/Batal/Simpan. Receipt content unaffected.

## Testing

- **Convex** (`tests/convex/promotions.test.ts`): create + list (non-archived default; includeArchived); update changes fields; archive hides from default list; validation rejects blank/long name, percent out of 1–100, fixed < 1 / non-integer; tenant isolation (cafe B can't list/edit cafe A's promos).
- **Pure** (`src/lib/promo.test.ts`): `formatPromoValue` (percent "20%", fixed "Rp 10.000").
- **Playwright** (new or extend an admin spec, auth-gated): create a percent promo and a fixed promo → both appear with correct Nilai → edit one (rename) → archive one and see it under Arsip.
- Gate: `pnpm typecheck && pnpm test && pnpm lingui:compile`; `convex codegen` → commit drift.

## Affected / new files (anticipated)

**Modified**
- `convex/schema.ts` (promotions table), `convex/_generated/*`.
- `src/routes/_pos/promos.tsx` (replace stub).
- `tests/convex/*`, an e2e spec, Lingui catalogs.

**New**
- `convex/promotions.ts`; `src/lib/promo.ts` + `.test.ts`; `src/components/promo/promo-form-dialog.tsx`.

## Out of scope

- **Applying promos at checkout** (cart discount line, `discountIDR` on the order, promo snapshot) and the `promoDiscountIDR` math — slice **5b**.
- Category/item-scoped promos; min-spend; date/time windows; auto-apply; promo codes; stacking; max-discount cap.
- Editing/deleting past orders.
