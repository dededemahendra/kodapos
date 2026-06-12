# Full-Screen Register + Role-Based Landing Design Spec

**Date:** 2026-06-11
**Branch:** `feat/register-shell` (off `main`)

## Context

The cashier POS (`/sale`) currently renders inside the admin shell (sidebar + header),
same as the dashboard and every admin page. The register is the highest-frequency,
focus-critical screen; the full admin nav is clutter there and invites mis-taps. The
dashboard is the opposite — an owner analytics home that belongs in the admin shell.

This slice **separates the cashier page from the dashboard**: make `/sale` a focused
full-screen register, and land cashiers on `/sale` / owners on `/dashboard`.

The layout already supports this: `src/routes/_pos.tsx` hides the sidebar for full-screen
flows via `NAV_HIDDEN_PREFIXES = ['/onboarding', '/pin', '/shift']`. We add `/sale`.

## Part 1 — Full-screen register

- `_pos.tsx`: add `'/sale'` to `NAV_HIDDEN_PREFIXES` (sidebar + `AppHeader` hidden on the
  register; `_pos.tsx` already renders a bare `<Outlet/>` when `showNav` is false).
- New **`src/components/sale/register-top-bar.tsx`** — a slim bar (`h-12`, sticky) that
  replaces the lost nav with only the register-adjacent essentials:
  - **Left:** cafe name (from `api.cafes.myCafe`) + quick links — **Meja** (`/tables`),
    **Dapur** (`/kitchen`), **Riwayat** (`/history`). (All operational/cashier-accessible.)
  - **Right:** **Shift** (`/shift/close`), an **Admin** link (`/dashboard`, shown only when
    `usePermissions().isOwner` — returns the owner to the admin shell), and the existing
    `NavUser` (sign out / account). Active link gets a subtle highlight.
  - The cart pane keeps its existing actions (Kas, Ganti kasir, Tahan, Ditahan, pay) — no
    duplication in the top bar.
- **`src/routes/_pos/sale/index.tsx`**: wrap the screen so the grid fills the space under
  the bar:
  ```tsx
  <div className="flex h-screen flex-col">
    <RegisterTopBar />
    <div className="min-h-0 flex-1 overflow-hidden">
      <SaleScreen recall={recall} table={table} />
    </div>
  </div>
  ```
- **`sale-screen.tsx`**: change the grid wrapper `h-[calc(100vh-3rem)]` → `h-full` (it now
  fills the flex child, no magic header offset).

> Cashiers never see admin nav (it's also permission-gated); the Admin button is owner-only.
> Tables/Kitchen/History/Shift remain reachable, so nothing accessible today is lost.

## Part 2 — Role-based landing

- **`src/routes/_public/signin.tsx`**: change the post-auth redirect from `/menu` →
  `/dashboard` (the owner's analytics home).
- Cashiers already land on `/sale` via the PIN flow (`pin.tsx` navigates to `/sale` when a
  shift is open). No change needed there.
- Net effect: **owner sign-in → `/dashboard`; cashier PIN → `/sale`.**

## Testing
Presentational/routing change — covered by `pnpm typecheck` + the existing e2e sale/shift
smoke. Manually: signing in lands on the dashboard; opening `/sale` shows a chrome-free
register with the top bar; the Admin button (owner) returns to the dashboard; a cashier on
the register can reach tables/kitchen/history/shift and has no Admin button; tables/kitchen
links still work; nothing in the cart pane changed.

## i18n
New BI strings: `Admin` (or `Kembali ke admin`), `Shift` (label) — reuse `Meja`, `Dapur`/
`Kitchen`(existing), `Riwayat`. Run `pnpm lingui:extract`, fill `en`, compile.

## Conventions
- Run CI locally: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`; clean tree.
- No new route → no `routeTree.gen.ts` change (we only add a prefix to an array + a
  component + a redirect target).
- Small conventional commits; PR → review → merge commit.

## Out of scope
- A separate cashier "app"/sub-domain; a register lock screen; customizable top-bar
  shortcuts; a dashboard redesign; changing the admin sidebar contents.
