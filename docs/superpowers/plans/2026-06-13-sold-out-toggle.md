# Sold-Out / 86 Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). Order-gating boolean → TDD the server guards.

**Goal:** A per-item `soldOut` flag a staffer can toggle in seconds. Sold-out items stay visible (catalog + both menus) with a "Habis" badge but cannot be ordered on the register **or** the public QR self-order. Closes the hole self-order (#68) opened.

**Copy rules (project):** every empty state uses shadcn `Empty` with icon + heading + description; **no em-dash `—` or `--` in any user-facing copy** (BI + en) — use commas/periods/parentheses.

---

## File Structure
- **Modify:** `convex/schema.ts`, `convex/menu/items.ts`, `convex/lib/sale.ts`, `convex/public.ts`, `tests/convex/menu-items.test.ts` (+ a self-order test), `src/components/sale/item-card.tsx`, `src/components/sale/menu-pane.tsx`, `src/components/sale/sale-screen.tsx`, `src/components/public/public-menu.tsx`, `src/routes/_pos/menu/index.tsx`.
- **i18n:** `src/locales/{id,en}/messages.po`.

---

### Task 1: Backend — soldOut field + setSoldOut + order guards (both surfaces) (TDD)
**Files:** modify `convex/schema.ts`, `convex/menu/items.ts`, `convex/lib/sale.ts`, `convex/public.ts`, `tests/convex/menu-items.test.ts`, `tests/convex/self-order-public.test.ts`.

READ: the Explore report's exact line refs — `menuItems` schema (~line 55), `menuItemDoc` (~7), `itemForSale` (~401), `listForSale` (~409), `setActive` (~284), `buildOrder` per-line guard (`item.archived || !item.isActive`, ~line 114), `convex/public.ts` `menuForTable` item assembly (~92, ~143) + its `menuForTableResult` items validator (~36-62) + `buildSelfOrderLine` guard (~234). The existing barcode/soldOut-style boolean tests in `tests/convex/menu-items.test.ts`.

- [ ] **Step 1: schema** — add `soldOut: v.optional(v.boolean())` to `menuItems` (after `archived`). No new index.
- [ ] **Step 2: FAILING tests** (`tests/convex/menu-items.test.ts` + a case in `tests/convex/self-order-public.test.ts`):
  - `setSoldOut({ id, soldOut: true })` → `getById`/`listForSale` item carries `soldOut: true`; `setSoldOut({..., false})` clears it; owner-scope (foreign item throws).
  - `listForSale` STILL returns a sold-out item (not filtered) with `soldOut: true`.
  - ordering a sold-out item via the cash-sale path (`buildOrder`) → rejects (`/tidak tersedia/i`); nothing inserted.
  - `submitSelfOrder` (public) with a sold-out `menuItemId` → rejects (`/tidak tersedia/i`); `menuForTable` returns the item with `soldOut: true` (not excluded).
  Run → confirm FAIL.
- [ ] **Step 3: implement**
  - `convex/menu/items.ts`: add `soldOut: v.optional(v.boolean())` to `menuItemDoc` (flows into `itemForSale`/`getById`); add `setSoldOut` mutation (mirror `setActive`: `requireOwnerCafe` + `requireOwned(... 'Item')` + `patch({ soldOut })`; returns null). `listForSale` unchanged (keeps sold-out items).
  - `convex/lib/sale.ts`: in the per-line guard add `|| item.soldOut` → the existing `Item ... tidak tersedia.` throw.
  - `convex/public.ts`: add `soldOut: v.boolean()` to the `menuForTableResult` items validator; push `soldOut: item.soldOut ?? false` in the item assembly (keep sold-out items in the response); in `buildSelfOrderLine` add `|| item.soldOut` to the guard.
- [ ] **Step 4: register-free + tests + commit** — `setSoldOut` is an addition to the registered `menu/items` module (no api.d.ts change); `soldOut` on `public`/schema needs no codegen. `pnpm test` + `pnpm typecheck` PASS. Commit:
  `git add convex/schema.ts convex/menu/items.ts convex/lib/sale.ts convex/public.ts tests/convex/menu-items.test.ts tests/convex/self-order-public.test.ts && git commit -m "feat(menu): sold-out flag + setSoldOut + block ordering on register and self-order"`
  > Do NOT run codegen.

---

### Task 2: Frontend — Habis badge (both menus) + tap guard + admin toggle
**Files:** modify `src/components/sale/item-card.tsx`, `src/components/sale/menu-pane.tsx`, `src/components/sale/sale-screen.tsx`, `src/components/public/public-menu.tsx`, `src/routes/_pos/menu/index.tsx`.

READ: `item-card.tsx` (the tile + the low-stock badge pattern), `menu-pane.tsx` (the `ItemForSale` type + the `<ItemCard>` call), `sale-screen.tsx` (`onItemTap`), `public-menu.tsx` (the item button), `menu/index.tsx` (the DataTable columns + RowActions + how mutations/toasts are wired, `StatusBadge`).

- [ ] **Step 1: staff tile** — `item-card.tsx`: add a `soldOut?: boolean` prop; when true render a `StatusBadge variant="danger"` "Habis" (next to the existing badges) and dim the tile (`opacity-60`); `menu-pane.tsx` pass `soldOut={row.item.soldOut}`.
- [ ] **Step 2: staff tap guard** — `sale-screen.tsx`: at the top of `onItemTap`, `if (row.item.soldOut) { toast.error(t\`Item sedang habis.\`); return; }`.
- [ ] **Step 3: public menu** — `public-menu.tsx`: when `item.soldOut`, disable the item button (`disabled` + `opacity-60 pointer-events-none`) and show a "Habis" badge/label. (The public page already has `soldOut` from `menuForTable`.)
- [ ] **Step 4: admin list** — `menu/index.tsx`: `const setSoldOut = useMutation(api.menu.items.setSoldOut)`. Add an "Ketersediaan" column: archived → "Arsip" (muted), soldOut → "Habis" (danger), isActive → "Tersedia" (success), else "Nonaktif" (muted) `StatusBadge`. Add a RowAction "Tandai habis" / "Tandai tersedia" (toggle `setSoldOut`, toast success/error). Reuse `canEditMenu` gating (no new perm).
- [ ] **Step 5:** `pnpm typecheck` + `pnpm test` PASS. Commit:
  `git add src/components/sale/item-card.tsx src/components/sale/menu-pane.tsx src/components/sale/sale-screen.tsx src/components/public/public-menu.tsx src/routes/_pos/menu/index.tsx && git commit -m "feat(menu): Habis badge on both menus + tap guard + admin sold-out toggle"`

All copy Bahasa Indonesia via `<Trans>`/`t\`...\``; NO em-dash/`--`.

---

### Task 3: i18n
New: `Habis`, `Tersedia`, `Nonaktif`, `Tandai habis`, `Tandai tersedia`, `Item sedang habis.`, `Ketersediaan`, `Item ditandai habis.`, `Item ditandai tersedia.` (reuse `Arsip`/`Gagal memperbarui item.` if present).
- [ ] `pnpm lingui:extract`; fill `en` (`Sold out`, `Available`, `Inactive`, `Mark sold out`, `Mark available`, `This item is sold out.`, `Availability`, `Item marked sold out.`, `Item marked available.`) for every new empty; **watch collisions** (`Habis`/`Tersedia` — distinct source or `context=` if existing en differs); NO em-dash in the en copy; `pnpm lingui:compile` → en 0 missing. Commit `src/locales`.

---

### Task 4: Final verification
- [ ] `pnpm typecheck` PASS; `pnpm test` PASS; `pnpm lingui:compile` en 0 missing; `git status` clean (no route change → no routeTree).
- [ ] **Manual sanity:** toggle an item "Habis" in `/menu` → it shows a Habis badge + dimmed on `/sale` and can't be added (toast); on the public `/order/<token>` menu it's disabled with "Habis"; the server rejects a crafted order of it on both paths; toggle back to "Tersedia" restores it.

---

## Self-Review
**Spec coverage:** soldOut field + setSoldOut + listForSale carry (T1); buildOrder + submitSelfOrder guards + menuForTable carry (T1); staff badge+tap-guard + public badge/disable + admin column+toggle (T2); tests flag/persist/scope + order-block both paths (T1); i18n (T3). ✓
**Placeholder scan:** "mirror setActive / low-stock badge / barcode tests". Else spec code.
**Type consistency:** `setSoldOut({id,soldOut})`; `soldOut` on `menuItemDoc` → `itemForSale.item`/`getById`/`Doc<'menuItems'>` (staff) and on `menuForTable` items (public); guards in both `buildOrder` and `buildSelfOrderLine`. ✓
