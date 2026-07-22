# Menu Board — customer-facing single-page menu display

**Date:** 2026-07-22
**Status:** Approved (design)
**Branch:** `feat/persistent-session`

## Context

Today the only customer-facing menu in kodapos is the per-**table** QR self-order
page (`src/routes/_public/order.$token.tsx`), keyed by a table's `qrToken`. It
both shows the menu and takes orders, and it is locked to one specific table.
There is no whole-cafe menu view and no per-cafe public link (cafes have no
public slug/token — only per-table `qrToken` exists).

Owners want a **wall-mounted TV menu board**: a single screen a cafe puts on a
monitor behind the counter so customers can read the menu. It is display-only —
no table, no cart, no ordering. This spec covers that feature.

## Goals

- A full-screen, non-interactive menu board showing the active cafe's menu as
  **photo cards** (photo + name + price), grouped by category.
- Because a TV can't be scrolled by hand, the board **auto-rotates** through
  pages of items, looping.
- The board **updates live** when the menu changes (price edit, sold-out,
  new item) — for free, via Convex reactivity.

## Non-goals (YAGNI)

- No public/shareable link, no per-cafe slug, no QR generation. (A phone-shareable
  public menu is a possible *future* feature; it would need cafe-level public
  identity + a public query and is explicitly out of scope here.)
- No ordering, cart, checkout, or payment.
- No per-device configuration UI (rotation speed etc. are constants for v1).
- No changes to the existing table self-order flow.

## Access model — authenticated route

The board is an **authenticated** top-level route, `src/routes/menu-board.tsx`,
mirroring the existing `src/routes/display.tsx` pattern: it lives outside the
`_pos` group so it renders bare (no sidebar/header), but still inherits Convex +
auth from `__root`. Staff open it on the device driving the TV, put the browser
in fullscreen, and leave it (the session now persists across restarts).

Rationale for auth over a public link: cafes have no public identifier today, so
a public menu would require adding cafe-level public identity and a public query.
Since this is the cafe's *own* screen, an authenticated route is simpler, needs
**no schema change**, and matches the `/display` precedent.

Auth handling follows `display.tsx`: the page reads cafe/menu data through
authenticated queries; an unauthenticated visitor is bounced to `/signin` using
the same `<Unauthenticated>` → redirect approach used elsewhere.

## Data — new Convex query `api.menu.board.get`

New file `convex/menu/board.ts`, exporting `get` (`api.menu.board.get`).

- **Auth/scope:** resolves the cafe via `requireActiveOutlet(ctx)` (same helper
  the other authenticated menu/settings functions use). No table token.
- **Returns:**
  ```ts
  {
    cafe: { name: string; logoUrl: string | null };
    categories: Array<{
      name: string;
      items: Array<{
        name: string;
        priceIDR: number;
        imageUrl: string | null;
        soldOut: boolean;
      }>;
    }>;
  }
  ```
- **Assembly:** mirror the sellable-only assembly already in
  `convex/public.ts` → `menuForTable` (active items, non-archived categories,
  sorted by `position`, `soldOut` derived the same way, images resolved
  server-side via `ctx.storage.getUrl`), but scoped to the active cafe and
  trimmed to the four board fields above. It must **not** expose cost, stock, or
  recipe data. Empty categories (no sellable items) are omitted.

Reusing `menuForTable` directly is rejected: it is keyed by a table `qrToken` and
returns table-scoped, ordering-oriented data.

## Presentation — new `MenuBoard` component

New component under `src/components/menu-board/`.

### Paging model (pure, testable)

A pure function `buildBoardPages(categories, cardsPerPage)` turns the categories
into an ordered list of **pages**, where each page belongs to exactly one
category (categories are never mixed on a page):

- For each category in order, chunk its items into groups of `cardsPerPage`.
- Each chunk becomes a page `{ categoryName, items }`.
- A category with more than `cardsPerPage` items spans multiple consecutive pages.

`cardsPerPage` is chosen by viewport breakpoint (e.g. ~6 on smaller screens, ~8
on a typical 16:9 TV) — a small constant map, not measured layout. This function
is unit-tested.

### Rotation

A `useRotation(pageCount, intervalMs)` hook advances the current page index every
`intervalMs` (constant, ~12000ms), looping to 0. Guards: does nothing when
`pageCount <= 1`. Transitions between pages are a soft CSS fade/slide (Tailwind),
keyed on the page index.

### Layout

- **Header:** cafe logo + name (left), current category name (prominent),
  small page-dots indicator (right) showing position within the loop.
- **Grid:** responsive CSS grid of photo cards filling the screen.
- **Card:** photo (object-cover), item name, price (`formatIDR`).
  - **Sold-out:** card dimmed + a "Habis" badge. (Shown, not hidden.)
  - **No photo:** branded placeholder card — item name centered on a muted/brand
    background — so the grid stays uniform.
- **Empty state:** if there are no sellable items at all, show the cafe logo +
  a centered "Menu segera hadir" message (not the shadcn `Empty` table component —
  this is a full-screen display).

## Entry point

Add a **"Buka layar menu"** button to the Menu page header
(`src/routes/_pos/menu/index.tsx`) that opens `/menu-board` in a new browser tab
(`<a href="/menu-board" target="_blank">` / `window.open`), so staff can throw it
onto the TV.

## Internationalization

Cafe/menu content (category and item names) is the cafe's own data — not
translated. Only the board **chrome** goes through lingui: the "Habis" badge
(reuse the existing sold-out string if one exists, otherwise add), the
"Buka layar menu" button, and the "Menu segera hadir" empty message. Run
`pnpm lingui:extract` + fill `en` + `pnpm lingui:compile`.

## Files touched

- **New:** `convex/menu/board.ts` — `get` query.
- **New:** `src/routes/menu-board.tsx` — bare, auth-gated full-screen route.
- **New:** `src/components/menu-board/menu-board.tsx` — board UI.
- **New:** `src/components/menu-board/build-board-pages.ts` — pure paging helper
  (+ its test).
- **Edit:** `src/routes/_pos/menu/index.tsx` — add the "Buka layar menu" button.
- **Edit:** `src/routeTree.gen.ts` — regenerated for the new route (committed).
- **Edit:** locale catalogs — new chrome strings.

No schema changes. No new dependencies.

## Testing

- **Convex query test** (`convex-test`) for `api.menu.board.get`: returns
  sellable-only data scoped to the active outlet; omits archived categories and
  inactive items; resolves image URLs; never includes cost/stock fields; omits
  empty categories.
- **Unit test** for `buildBoardPages`: correct chunking, one category per page,
  multi-page categories, empty input.
- **Rotation:** covered indirectly via the pure paging test + manual check;
  `useRotation` is a thin timer and not separately unit-tested for v1.
- **Manual:** open `/menu-board` on a logged-in device, confirm cards render,
  categories rotate (~12s), sold-out shows "Habis", price edits reflect live,
  and an unauthenticated visit redirects to `/signin`.

## Verification (CI gates)

`pnpm typecheck`, `pnpm test`, `pnpm lingui:compile` — plus the regenerated
`src/routeTree.gen.ts` committed.

## Future (not now)

- Public phone-shareable per-cafe menu (needs cafe public slug/token + public
  query).
- Owner-configurable rotation speed / board theme.
