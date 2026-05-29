# Settings Pages — Profile, Staff, Tax & Payment, Receipt & Printer, Integrations

**Date:** 2026-05-29
**Status:** Approved (design)
**Branch:** `feat/dashboard-real-data` (user opted to build here)

## Goal

Build out the five settings pages below the Settings menu (everything except
General) into **heavy, professional, multi-option** settings — the depth you'd
expect from a polished SaaS POS product. Two of the pages (Profile, Staff)
already have basic implementations and will be expanded; three (Tax & Payment,
Receipt & Printer, Integrations) are currently `ComingSoon` stubs.

## Decisions (locked during brainstorming)

1. **Persistence:** Server (Convex). Store-wide settings are shared across every
   device and cashier — not per-device `localStorage` like the General page.
2. **Depth:** Build comprehensive, polished UIs that **save/load real values
   now**; wiring each setting into runtime behavior (printing, tax at checkout,
   live integrations) comes later. Settings are stored and presented
   professionally today.
3. **Scope:** All 5 pages, including expanding the existing Profile and Staff
   pages.
4. **General overlap:** The new Tax & Payment and Receipt & Printer pages become
   the source of truth. The overlapping `localStorage` "Receipt" and "Payment"
   sections are removed from the General page (final cleanup slice).
5. **Data model:** Approach A — a single `cafeSettings` table, one document per
   cafe, with grouped nested objects, lazily created with defaults.

## Existing context

- **Routing:** TanStack file-based routes under
  `src/routes/_pos/settings/` — `general.tsx`, `profile.tsx`, `staff.tsx`,
  `tax.tsx`, `receipt.tsx`, `integrations.tsx`, plus `route.tsx` layout.
- **Menu:** `src/components/app-shared.tsx` (the "Akun" group) already links all
  six pages.
- **Auth / multi-tenancy:** `requireOwnerCafe(ctx)` in `convex/lib/auth.ts`;
  frontend reads `api.cafes.myCafe`. Every tenant row carries `cafeId`.
- **UI:** shadcn/ui + the `Field` system (`src/components/ui/field.tsx`), Tailwind
  v4. i18n via `@lingui/react/macro` (`<Trans>`, `t\`\``), Indonesian source text.
- **Current stubs:** `tax.tsx`, `receipt.tsx`, `integrations.tsx` render
  `<ComingSoon title={...} />`.
- **Profile today:** `profile.tsx` uses `CafeProfileForm`
  (`src/components/menu/cafe-profile-form.tsx`) editing name/phone/address/
  timezone/tax via `cafes.updateProfile`.
- **Staff today:** `staff.tsx` — add cashier (name + PIN), rename, reset PIN,
  archive; backed by `convex/staff.ts` + `cafeStaff` table.

## Data model

### New table: `cafeSettings`

One document per cafe, keyed by `cafeId`. All groups optional so a cafe with no
row still resolves to a full default shape via `settings.get`.

```ts
cafeSettings: defineTable({
  cafeId: v.id('cafes'),

  payment: v.optional(v.object({
    methods: v.object({
      cash: v.boolean(),
      qrisStatic: v.boolean(),
      qrisDynamic: v.boolean(),
      card: v.boolean(),
      ewallet: v.boolean(),
      transfer: v.boolean(),
    }),
    defaultMethod: v.union(
      v.literal('cash'), v.literal('qris_static'), v.literal('qris_dynamic'),
      v.literal('card'), v.literal('ewallet'), v.literal('transfer'),
    ),
    cashRounding: v.union(
      v.literal('none'), v.literal('nearest_100'),
      v.literal('nearest_500'), v.literal('nearest_1000'),
    ),
    quickCashButtons: v.array(v.number()),
    serviceChargeEnabled: v.boolean(),
    serviceChargePct: v.number(),
    serviceChargeName: v.string(),
    qrisMerchantName: v.optional(v.string()),
    qrisNmid: v.optional(v.string()),
    qrisImageStorageId: v.optional(v.id('_storage')),
  })),

  receipt: v.optional(v.object({
    headerText: v.optional(v.string()),
    footerText: v.optional(v.string()),
    orderNumberPrefix: v.optional(v.string()),
    showLogo: v.boolean(),
    showAddress: v.boolean(),
    showPhone: v.boolean(),
    showCashier: v.boolean(),
    showOrderNumber: v.boolean(),
    showItemModifiers: v.boolean(),
    showTaxBreakdown: v.boolean(),
    paperSize: v.union(v.literal('58mm'), v.literal('80mm')),
    fontSize: v.union(v.literal('small'), v.literal('normal'), v.literal('large')),
    autoPrint: v.boolean(),
    printCopies: v.number(),
    printerType: v.union(
      v.literal('bluetooth'), v.literal('usb'), v.literal('network'),
    ),
    openDrawer: v.boolean(),
  })),

  integrations: v.optional(v.array(v.object({
    key: v.string(),
    connected: v.boolean(),
    connectedAt: v.optional(v.number()),
    config: v.optional(v.any()), // stored opaque config; wire later
  }))),

  // Tax extras (core rate/enabled stay on `cafes`)
  taxName: v.optional(v.string()),       // 'PB1' | 'PPN' | custom
  taxInclusive: v.optional(v.boolean()), // harga sudah termasuk pajak?
  npwp: v.optional(v.string()),

  updatedAt: v.number(),
}).index('by_cafe', ['cafeId'])
```

### Extend `cafes` (Profile slice)

Add optional fields used by the expanded Profile page:

```ts
businessType: v.optional(v.string()),   // 'cafe' | 'restoran' | 'kedai' | ...
whatsapp: v.optional(v.string()),
email: v.optional(v.string()),
instagram: v.optional(v.string()),
city: v.optional(v.string()),
postalCode: v.optional(v.string()),
logoStorageId: v.optional(v.id('_storage')),
operatingHours: v.optional(v.array(v.object({  // 7 entries, Mon..Sun
  day: v.number(),        // 0..6
  open: v.boolean(),
  openTime: v.string(),   // 'HH:MM'
  closeTime: v.string(),
}))),
```

Core `taxRatePct` / `taxEnabled` remain on `cafes` (orders + onboarding depend on
them). They are **edited** from the Tax & Payment page, not Profile.

### Extend `cafeStaff` (Staff slice)

```ts
phone: v.optional(v.string()),
email: v.optional(v.string()),
permissions: v.optional(v.object({
  canVoid: v.boolean(),
  canDiscount: v.boolean(),
  canManageShift: v.boolean(),
  canViewReports: v.boolean(),
  canEditMenu: v.boolean(),
})),
```

## Backend API (`convex/settings.ts`)

- `get` (query) — load the cafe's settings doc and merge it over a hardcoded
  `DEFAULT_SETTINGS` object so the client always receives a complete shape.
  Resolves logo / QRIS image storage IDs to URLs.
- `updatePayment` (mutation) — patch the `payment` group.
- `updateReceipt` (mutation) — patch the `receipt` group.
- `updateTaxPayment` (mutation) — patch `cafes.taxRatePct` / `cafes.taxEnabled`
  (core) **and** `cafeSettings` tax extras (`taxName`, `taxInclusive`, `npwp`)
  in one call. Validates rate 0–100.
- `connectIntegration` / `disconnectIntegration` (mutations) — upsert/clear an
  entry in the `integrations` array by `key`.
- `generateUploadUrl` (mutation) — for logo / QRIS image upload (Convex file
  storage); the upload result `storageId` is stored via the relevant update.

A small `getOrCreate`/defaults helper backs every mutation: read-or-default,
patch, set `updatedAt`. All gated by `requireOwnerCafe(ctx)`.

Profile mutation: extend `cafes.updateProfile` (or add `cafes.updateProfileExtended`)
to accept the new `cafes` fields above.

## Shared settings UI (`src/components/settings/`)

Extract and standardize the look currently inlined in `general.tsx`:

- `SettingsPageHeader` — title + description.
- `SettingsSection` — Card wrapper with title/description and a rows slot.
- `SettingRow` — horizontal label/description (left) + control (right); vertical
  fallback for wide controls.
- `RowSep` — separator between rows.
- `SaveBar` — sticky footer shown when the form is dirty: **Batal** /
  **Simpan perubahan**, with saving spinner and a transient "Tersimpan ✓"
  confirmation. No new toast dependency — inline confirmation.

**Form pattern (server-persisted):** each page loads `settings.get` values into
local React state, tracks a `dirty` flag (local vs. loaded), and Save calls the
domain mutation. Standard loading skeleton + `cafe === null` empty state.

## Page contents

### Profil kafe (expand)
- **Identitas:** name, business type (Kafe/Restoran/Kedai/Bar/Lainnya), logo upload.
- **Kontak:** phone, WhatsApp, email, Instagram.
- **Alamat:** street (`addressLine`), city, postal code.
- **Wilayah:** timezone.
- **Jam operasional:** open/close per day (7 rows, each toggleable).
- Tax is **removed** from this page (moves to Tax & Payment).

### Staf (expand)
- Add cashier (name + PIN) — existing.
- Per-staff: rename, reset/set PIN, archive — existing.
- New: optional phone/email; a **permissions** editor (canVoid, canDiscount,
  canManageShift, canViewReports, canEditMenu).
- New: search box + "show archived" toggle.

### Pajak & Pembayaran
- **Pajak:** enable, tax name (PB1/PPN/custom), rate %, inclusive-vs-exclusive
  pricing, NPWP.
- **Biaya layanan:** enable, %, name.
- **Metode pembayaran:** toggles (cash, QRIS static, QRIS dynamic, card,
  e-wallet, transfer) + default method.
- **Tunai:** rounding rule, editable quick-cash chips (add/remove), open-drawer.
- **QRIS:** merchant name, NMID, static-QR image upload (stored).

### Struk & Printer
- **Konten struk:** header text, footer text, order-number prefix, toggles for
  logo / address / phone / cashier / order# / item modifiers / tax breakdown.
- **Tampilan:** paper size (58/80mm), font size.
- **Printer:** auto-print, copies, printer type, open drawer, **Test print** (stub).
- **Live receipt preview:** a pane rendering a sample receipt from the current
  settings — the visual centerpiece.

### Integrasi
- Catalog grid of integration cards (logo placeholder, name, description, status
  badge "Terhubung"/"Belum terhubung", Connect/Disconnect).
- Indonesia-relevant set: QRIS provider (Midtrans/Xendit), GoFood, GrabFood,
  ShopeeFood, WhatsApp Business, accounting (Accurate/Mekari).
- Connect opens a dialog storing API key/config (stored; wire later).

## Build sequence (per-page slices, each its own PR)

Following the trunk-based workflow: small conventional commits, local CI
(`pnpm typecheck` + `pnpm test` + `pnpm lingui:compile`), PR, review, merge.

0. **Foundation** — `cafeSettings` table, `convex/settings.ts`
   (`get` + mutations), shared `src/components/settings/` primitives.
1. **Profile** expand (+ logo upload, extended `cafes` fields).
2. **Staff** expand (+ `cafeStaff` fields + permissions UI).
3. **Tax & Payment**.
4. **Receipt & Printer** (+ live preview).
5. **Integrations** catalog.
6. **Cleanup** — remove overlapping Receipt/Payment sections from `general.tsx`.

## Testing & i18n

- Convex tests for `settings.get` defaults-merge and mutation validation (e.g.
  tax rate 0–100, service charge ≥ 0). Confirm existing test harness during
  planning.
- All UI strings via `<Trans>` / `t\`\`` in Indonesian, matching the current
  convention. Run `lingui:compile` + typecheck locally before each push.

## Out of scope (wire later)

- Real printer hardware / driver integration; Test print is a stub.
- Live integration API calls; Connect only stores config.
- Applying tax-inclusive pricing, service charge, rounding, or payment-method
  gating at checkout.
- Receipt settings driving an actual print job.
