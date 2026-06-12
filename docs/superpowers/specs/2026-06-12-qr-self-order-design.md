# QR Self-Order Design Spec

**Date:** 2026-06-12
**Branch:** `feat/qr-self-order` (off `main`)

## Context

A customer scans a QR on their table → opens a public, no-login page → browses the menu →
builds a cart → submits. The order lands in a **staff queue**; a cashier taps **Accept**, which
loads it into the register (`/sale`) like recalling a held order, then confirms/charges through
the existing flow (**pay at counter**) — firing to the kitchen as today. Nothing on the public
surface touches payment, stock, or the shift/cashier model.

This is kodapos's **first unauthenticated surface**, so the security posture is the spec's spine:
the public functions resolve the cafe/table **only** from an unguessable per-table token, expose
**only** sellable menu data (no costs, stock, or sales), and **recompute every price
server-side** (the client sends item ids + quantities, never amounts).

## Decisions (locked)
- **Pay at counter** — the public page is order-only; staff charge via the register on Accept.
- **Accept into register** — a submitted self-order is a *request*; staff Accept loads it into
  `/sale` (mirroring held-order recall) and ring it normally. All money/stock/kitchen stay on the
  authenticated path.

## Model

### New `selfOrders` table
```ts
selfOrders: defineTable({
  cafeId: v.id('cafes'),
  tableId: v.optional(v.id('tables')),
  tableName: v.optional(v.string()),            // snapshot for the queue
  status: v.union(v.literal('new'), v.literal('accepted'), v.literal('rejected')),
  clientId: v.string(),                          // idempotency (browser UUID)
  customerNote: v.optional(v.string()),
  lines: v.array(v.object({                      // denormalized, server-computed (mirror heldLine)
    menuItemId: v.id('menuItems'),
    nameSnapshot: v.string(),
    qty: v.number(),
    unitPriceIDR: v.number(),                    // base + modifier adjustments, SERVER-computed
    variantId: v.optional(v.id('menuItemVariants')),
    variantName: v.optional(v.string()),
    modifierOptionIds: v.array(v.id('modifierOptions')),
    modifierLabels: v.array(v.string()),
  })),
  subtotalIDR: v.number(),                        // server-computed snapshot
  createdAt: v.number(),
  acceptedAt: v.optional(v.number()),
})
  .index('by_cafe_clientId', ['cafeId', 'clientId'])
  .index('by_cafe_status', ['cafeId', 'status'])
  .index('by_cafe_created', ['cafeId', 'createdAt']),
```

### `tables` gains a QR token
`qrToken: v.optional(v.string())` + index `by_qr_token` (`['qrToken']`). A random 128-bit hex
string, assigned lazily (on first QR view). The public URL is `/order/{qrToken}`; the token is the
only thing tying a scan to a cafe/table, so it must be unguessable and is treated as a capability.

## Backend

### Public (NO auth) — `convex/public.ts` (new)
These functions **never** call `requireOwnerCafe`; they resolve the cafe/table from `qrToken`.

- **`menuForTable({ qrToken })`** query → `{ cafe: { name, logoUrl? }, table: { id, name },
  categories: [{ id, name }], items: [{ id, categoryId, name, priceIDR, imageUrl?,
  variants: [{ id, name, priceIDR }], modifierGroups: [{ id, name, required, minSelect, maxSelect,
  options: [{ id, name, priceAdjustmentIDR }] }] }], pricing: { taxEnabled, taxRatePct,
  serviceChargeEnabled, serviceChargePct, serviceChargeName } }`. Resolve the table via
  `by_qr_token`; if missing/invalid → `null` (the page shows an invalid-QR state). Return **only
  sellable** items (active, not archived) — **omit** `lowStockIngredientNames`, costs, recipes, any
  owner data. (Reuse the `listForSale` assembly minus the owner bits.)
- **`submitSelfOrder({ qrToken, clientId, lines: [{ menuItemId, qty, variantId?,
  modifierOptionIds }], customerNote? })`** mutation → `{ selfOrderId }`. Steps:
  1. Resolve table+cafe from `qrToken` (reject invalid: `'QR tidak valid.'`).
  2. **Idempotency:** if a `selfOrders` row exists for `(cafeId, clientId)`, return it.
  3. **Abuse guard:** count `status:'new'` self-orders for the cafe (or table); if ≥ a cap
     (`MAX_PENDING_SELF_ORDERS = 8` per table) → `'Terlalu banyak pesanan menunggu. Hubungi staf.'`.
  4. **Server-side line validation + pricing** (reuse `buildOrder`'s per-line logic): each item
     active+in-cafe; variant valid; modifier options belong to the item's groups and satisfy
     min/max; compute `unitPriceIDR = (variant?.priceIDR ?? item.priceIDR) + Σ optionAdjustments`,
     `nameSnapshot`, `variantName`, `modifierLabels`; `qty` integer 1..99. **Never trust client
     prices.** `subtotalIDR = Σ qty×unitPriceIDR`. Reject empty lines.
  5. Insert `status:'new'`, snapshot `tableName`.
- **`selfOrderStatus({ selfOrderId })`** query → `{ status }` (so the customer page can show
  "menunggu / diterima / ditolak"). Only the `status` — no other data leaks (the id is known only
  to the submitter).

### Staff (owner-gated) — `convex/selfOrders.ts` (new)
- **`queue({})`** → pending `status:'new'` self-orders (`by_cafe_status`), newest-first, each
  `{ id, tableName?, lineCount, subtotalIDR, customerNote?, createdAt, lines: [{ nameSnapshot, qty,
  variantName?, modifierLabels }] }` (enough to preview in the queue).
- **`getForCart({ id })`** → the self-order's lines in the exact shape the sale-screen's cart
  `load` action consumes (mirror the held-order recall payload: `menuItemId, nameSnapshot, qty,
  unitPriceIDR, variantId?, variantName?, modifierOptionIds, modifierLabels`), + `tableId?`. For
  the `/sale?selfOrder=<id>` load.
- **`accept({ id })`** → mark `status:'accepted'`, `acceptedAt` (the sale-screen calls this after
  loading the lines, mirroring how recall removes the held order).
- **`reject({ id })`** → mark `status:'rejected'`.

### Table QR — `convex/tables.ts`
- **`ensureQrToken({ id })`** mutation (owner-gated) → returns the table's `qrToken`, generating a
  random 128-bit hex (`globalThis.crypto.getRandomValues`) + patching it if absent (idempotent).

## Frontend

### Public order page — `src/routes/_public/order.$token.tsx` (new, NO auth)
Under the bare `_public` layout (no auth gate). `useQuery(api.public.menuForTable, { qrToken: token })`:
- Header: cafe name/logo + "Meja {table.name}".
- A category-grouped menu list; tap an item → if it has variants/modifiers, open a **sheet** to
  pick (variant radio + modifier groups respecting min/max), else add directly. A cart bar
  (item count + running subtotal via the public pricing) with a **"Kirim pesanan"** button → a
  cart review sheet (qty steppers, optional note) → `submitSelfOrder` with a generated `clientId`.
- On success: a confirmation state ("Pesanan terkirim — silakan ke kasir / staf akan
  mengonfirmasi") that polls `selfOrderStatus` to reflect accepted/rejected. Invalid token / null
  menu → a friendly "QR tidak valid" state. Lean, mobile-first, shadcn.

### Staff queue — `src/routes/_pos/self-orders.tsx` (new, operational)
`createFileRoute('/_pos/self-orders')`. `api.selfOrders.queue` → a reactive list of pending
orders (table, items, note, time) with **Terima** (→ `navigate('/sale?selfOrder={id}')`) and
**Tolak** (→ `reject`, confirm). `Empty` ("Belum ada pesanan masuk.") + `Spinner`. Add `/self-orders`
to the `OPERATIONAL_PREFIXES` in `_pos.tsx` (full-screen register chrome) and a nav entry
("Pesanan Masuk") with a count badge of pending orders.

### Sale-screen load — `src/components/sale/sale-screen.tsx`
Add a `selfOrder` search param (like `recall`): when present, `getForCart({ id })` → dispatch the
cart `load` action with the lines, call `selfOrders.accept({ id })`, set the table, then strip the
param (mirror the existing held-order recall path exactly).

### Table QR print — `src/routes/_pos/tables.tsx` (or the manage dialog)
A per-table **"QR"** action → `ensureQrToken` → a dialog showing the printable QR (the public
URL `{origin}/order/{token}`) rendered with **`qrcode.react`** (`<QRCodeSVG>`) + the table name,
and a "Cetak" button (reuse the print-isolation pattern). New dependency: `qrcode.react` (SSR-safe
SVG, React 19 compatible) — QR is 2D (Reed-Solomon/masking), impractical to hand-roll, unlike the
owned 1D Code128.

## Security (the spine — verified in review)
- Public functions resolve cafe/table **only** from `qrToken`; never `requireOwnerCafe`; expose
  **only** sellable menu + display prices (no cost/stock/recipe/sales).
- `submitSelfOrder` **recomputes all prices server-side**; the client sends only ids+qty.
- `qrToken` is unguessable (128-bit). `selfOrderStatus` returns only `status`, keyed by the
  submitter-only `selfOrderId`.
- Abuse: per-table pending cap + `clientId` idempotency. `qty` 1..99, lines bounded.
- Accept/reject/getForCart/queue are owner-gated; a self-order can only become a real order through
  the authenticated register.

## Testing
**`tests/convex/self-order-public.test.ts`** (new): `submitSelfOrder` with valid token →
`status:'new'`, server-computed `unitPriceIDR`/`subtotalIDR` (assert prices come from the menu, NOT
client input — pass a wrong price-shaped field and confirm it's ignored); rejects invalid token,
empty lines, bad qty, a modifier/variant not on the item, an item from another cafe; idempotent on
`clientId`; pending cap throws past the limit; `menuForTable` returns sellable items only (an
archived/inactive item excluded) and **no** owner fields; `selfOrderStatus` reflects accept/reject.
**`tests/convex/self-order-staff.test.ts`** (new): `queue` lists pending (owner-scoped; another
cafe's hidden); `accept`/`reject` transition status; `getForCart` returns the cart-load shape;
`tables.ensureQrToken` generates a stable 32-hex token (idempotent).

Frontend (public menu/cart/submit, staff queue, sale-screen load, QR print) by typecheck + smoke.

## i18n
The public page is Bahasa Indonesia (the app's language) via the catalog. New BI across both
surfaces: `Meja {0}`, `Kirim pesanan`, `Keranjang`, `Pesanan terkirim`, `Menunggu konfirmasi`,
`Pesanan diterima`, `Pesanan ditolak`, `QR tidak valid`, `Pesanan Masuk`, `Terima`, `Tolak`,
`Belum ada pesanan masuk.`, `Cetak QR`, `Catatan (opsional)`, server-thrown `'QR tidak valid.'`/
`'Terlalu banyak pesanan menunggu. Hubungi staf.'` (off-catalog). Extract + fill `en`, **watching
for collisions** (e.g. `Terima`/`Tolak`/`Meja` — use distinct source or `context=` if the existing
en differs), compile.

## Conventions
- Run CI locally: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`; clean tree.
- Do NOT run codegen — `public`/`selfOrders` are NEW modules (register in `api.d.ts`; dev watcher
  does it — commit). **New routes** (`/order/$token`, `/self-orders`) → commit `routeTree.gen.ts`.
- New dependency `qrcode.react` (QR rendering only). Public-surface intake is order-adjacent →
  **adversarial review** of `convex/public.ts` (price re-validation, auth leakage, abuse guards).
- Small conventional commits; PR → review → merge commit.

## Out of scope
- Pay-now on the public page (QRIS/webhook) — pay at counter only.
- Auto-fire to kitchen / a kiosk sentinel shift — staff Accept into the register only.
- Customer accounts/loyalty/PII, order-status push notifications, editing a submitted order
  (resubmit), a cafe-level "order from anywhere" QR (per-table only this slice), promos/discounts on
  the public side, IP rate-limiting at the edge (the per-table pending cap + idempotency is the MVP
  guard), real-time sold-out suppression beyond active/archived.
