# Customer-Facing Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). No backend, no money path.

**Goal:** A full-screen `/display` customer view that mirrors the cashier's live cart (items + totals) on a second monitor of the same till. Synced via localStorage (retained snapshot + cross-window `storage` event) so the display can open mid-sale. Same-browser/same-device (a dual-monitor register); a cross-device tablet is a future Convex-backed follow-up.

**Copy rules (project):** customer-facing UI is Bahasa via the catalog; **no em-dash `—`/`--`**; empty/idle state uses shadcn `Empty` (icon + heading + description) or a clean welcome panel.

---

## File Structure
- **Create:** `src/lib/customer-display.ts` (the sync channel + payload type), `src/routes/display.tsx` (the full-screen view).
- **Modify:** `src/components/sale/sale-screen.tsx` (publish on cart change), `src/components/sale/register-top-bar.tsx` (an "open display" button), `src/routeTree.gen.ts`.
- **i18n:** `src/locales/{id,en}/messages.po`.

---

### Task 1: Sync lib + display route + publish + open button
**Files:** create `src/lib/customer-display.ts`, `src/routes/display.tsx`; modify `src/components/sale/sale-screen.tsx`, `src/components/sale/register-top-bar.tsx`; commit `src/routeTree.gen.ts`.

READ: `src/lib/active-cashier.ts` (the localStorage + `storage`-event cross-window pattern to mirror), `src/components/sale/sale-screen.tsx` (the computed `subtotal`, `discount` (= promoDisc+manualDisc), `serviceChargeIDR`, `tax`, `total`, `cart.lines` (each `{ nameSnapshot, qty, unitPriceIDR, variantName?, ... }` — confirm field names), `cart.promo`), `src/components/sale/register-top-bar.tsx` (the button row), `src/routes/_public.tsx`/`__root.tsx` (a top-level route shape; `/display` is a standalone route, NOT under `_pos`, so it renders bare full-screen — it still has Convex/auth context from `__root`), `~/lib/money` `formatIDR`, `api.cafes.myCafe` (for the idle header cafe name).

- [ ] **Step 1: `src/lib/customer-display.ts`**:
  - `export type DisplayLine = { name: string; variantName?: string; qty: number; lineTotalIDR: number };`
  - `export type DisplayPayload = { lines: DisplayLine[]; subtotalIDR: number; discountIDR: number; serviceChargeIDR: number; taxIDR: number; totalIDR: number; promoName?: string } | null;` (null = idle/cleared)
  - `const KEY = 'kodapos.customerDisplay';`
  - `export function publishDisplay(payload: DisplayPayload): void` — guard `typeof window === 'undefined'`; `window.localStorage.setItem(KEY, JSON.stringify(payload))` (the `storage` event fires in the OTHER window). For same-window not needed.
  - `export function readDisplay(): DisplayPayload` — parse the key (try/catch → null).
  - `export function subscribeDisplay(cb: (p: DisplayPayload) => void): () => void` — add a `storage` listener filtered to `KEY` that calls `cb(readDisplay())`; return the cleanup.
- [ ] **Step 2: `src/routes/display.tsx`** — `createFileRoute('/display')`. A full-screen (`min-h-screen`), high-contrast, large-type customer view. `const [data, setData] = useState(readDisplay); useEffect(() => subscribeDisplay(setData), [])`. `const cafe = useQuery(api.cafes.myCafe, {})` for the header name. Render:
  - header: cafe name (or "kodapos") + logo if present.
  - when `data` is null or `data.lines.length === 0`: an idle welcome panel ("Selamat datang" + a short line), shadcn `Empty` (icon + heading + description) or a centered welcome.
  - else: a large scrollable list of lines (`{qty}x {name}{ (variant)}` ... `formatIDR(lineTotalIDR)`), and a totals panel: Subtotal, Diskon (if >0, with promoName), Layanan (if >0), Pajak (if >0), and a BIG Total. Use `formatIDR`. Mobile/portrait friendly.
- [ ] **Step 3: publish from the sale screen** — `sale-screen.tsx`: a `useEffect` (deps on the computed totals + lines) that calls `publishDisplay({ lines: cart.lines.map(l => ({ name: l.nameSnapshot, ...(l.variantName ? { variantName: l.variantName } : {}), qty: l.qty, lineTotalIDR: l.qty * l.unitPriceIDR })), subtotalIDR: subtotal, discountIDR: discount, serviceChargeIDR, taxIDR: tax, totalIDR: total, ...(cart.promo ? { promoName: cart.promo.name } : {}) })` whenever the cart/totals change; when `cart.lines.length === 0`, publish `null` (idle). On unmount, `publishDisplay(null)`.
- [ ] **Step 4: open button** — `register-top-bar.tsx`: a "Layar pelanggan" `Button` (icon `Monitor`/`MonitorSmartphone`) → `onClick={() => window.open('/display', 'kodaposCustomerDisplay')}` (opens/reuses a named window the cashier drags to the 2nd monitor).
- [ ] **Step 5: routeTree** — `pnpm build`; confirm `grep -c "/display\|display" src/routeTree.gen.ts` includes the new route; stage it.
- [ ] **Step 6:** `pnpm typecheck` + `pnpm test` PASS. Commit:
  `git add src/lib/customer-display.ts src/routes/display.tsx src/components/sale/sale-screen.tsx src/components/sale/register-top-bar.tsx src/routeTree.gen.ts && git commit -m "feat(display): customer-facing display synced from the register cart"`

UI Bahasa via `<Trans>`/`t\`...\``, no em-dash/`--`.

---

### Task 2: i18n
New BI: `Layar pelanggan`, `Selamat datang`, `Subtotal`, `Diskon`, `Layanan`, `Pajak`, `Total`, an idle subtitle ("Pesanan Anda akan tampil di sini."). Reuse existing where present (Subtotal/Total/Pajak likely exist).
- [ ] `pnpm lingui:extract`; fill `en` (`Customer display`, `Welcome`, `Your order will appear here.`, …) for every new empty (no em-dash); watch collisions; `pnpm lingui:compile` → en 0 missing. Commit `src/locales`.

---

### Task 3: Final verification
- [ ] `pnpm typecheck` PASS; `pnpm test` PASS; `pnpm lingui:compile` en 0 missing; clean tree (routeTree committed).
- [ ] **Manual sanity:** open `/sale`, click "Layar pelanggan" (a 2nd window opens at `/display`); add items on the register → the display mirrors lines + totals live; clearing the cart shows the idle welcome; the display opened mid-sale reads the current snapshot.

---

## Self-Review
**Spec coverage:** sync lib (publish/read/subscribe via localStorage) (T1); `/display` full-screen view + idle (T1); sale-screen publish on change + idle on empty (T1); open-display button (T1); i18n (T2). ✓
**Placeholder scan:** "mirror active-cashier storage pattern / sale-screen totals". Else spec code.
**Type consistency:** `DisplayPayload` published by sale-screen ↔ consumed by `/display`; `publishDisplay`/`readDisplay`/`subscribeDisplay` on `KEY`; `formatIDR` for money. Customer UI Bahasa, no em-dash. ✓
