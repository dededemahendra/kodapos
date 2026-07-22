# Menu Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a full-screen, auto-rotating, display-only menu board at `/menu-board` that shows the active cafe's sellable menu as photo cards and updates live.

**Architecture:** A new authenticated Convex query `api.menu.board.get` assembles sellable-only menu data (cafe name/logo + categories with items) scoped to the active outlet via `requireActiveOutlet`. A pure `buildBoardPages()` helper chunks those categories into single-category pages; a `useRotation` timer hook advances the page index on a loop. The page lives at the top-level route `src/routes/menu-board.tsx` (outside `_pos`, like `src/routes/display.tsx`) so it renders bare with no sidebar, and Convex reactivity makes it live for free. No schema changes, no new dependencies.

**Tech Stack:** Convex (queries, `ctx.storage.getUrl`), TanStack Start file-based routing, React 19, Tailwind v4, shadcn/ui (`StatusBadge`, `Button`, `PageHeader`), lingui i18n, vitest + convex-test.

## Global Constraints

- Source locale is **Indonesian** (`id`). Author every user-facing string in Indonesian inside `<Trans>`, then run extract and fill the `en` translation.
- **No em-dash (—) and no `--` in user-facing copy** (id, en, or receipts). Use commas, periods, or parentheses.
- The board query must expose **only** `name`, `priceIDR`, `imageUrl`, `soldOut` per item, plus cafe `name` and `logoUrl`. Never cost, stock, recipe, ids, or barcodes.
- **No schema changes. No new npm dependencies.**
- Vitest runs in the `edge-runtime` environment with `include: ['tests/**/*.test.ts', 'src/**/*.test.ts']`. There is **no DOM and no React testing library** available. Do not write component/render tests; test pure functions and Convex functions only.
- Convex codegen: run `./node_modules/.bin/convex codegen` (NOT `npx convex`, which is broken by a shell hook) after adding a new Convex module, and commit the regenerated `convex/_generated/*` files.
- `src/routeTree.gen.ts` is generated but **tracked**. It must be regenerated and committed when a route is added, or CI typecheck fails.
- Rotation interval constant: `12000` ms. Cards per page: `6` below the `xl` breakpoint (1280px), `8` at or above it.
- Verification gates before the branch is done: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`.
- Work happens on the existing branch `feat/persistent-session`. Commit with conventional-commit messages, one commit per task.

---

### Task 1: Convex query `api.menu.board.get`

**Files:**
- Create: `convex/menu/board.ts`
- Test: `tests/convex/menu-board.test.ts`
- Regenerate: `convex/_generated/api.d.ts` (+ siblings) via `./node_modules/.bin/convex codegen`

**Interfaces:**
- Consumes: `requireActiveOutlet(ctx)` from `convex/lib/auth.ts`, which returns `{ cafeId, role, ... }` and throws for an unauthenticated or outlet-less caller.
- Produces: `api.menu.board.get`, a query taking `{}` and returning:
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
  Task 3 consumes this shape as `BoardCategory[]` / `BoardItem`.

- [ ] **Step 1: Write the failing test**

Create `tests/convex/menu-board.test.ts`:

```ts
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setupOwner(t: ReturnType<typeof convexTest>, email = 'o@x.com') {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email });
  });
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  return { asOwner };
}

describe('menu.board.get', () => {
  it('groups sellable items under their category, in position order', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const kopi = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
    const teh = await asOwner.mutation(api.menu.categories.create, { name: 'Teh' });
    await asOwner.mutation(api.menu.items.create, {
      categoryId: kopi, name: 'Espresso', priceIDR: 18000,
    });
    await asOwner.mutation(api.menu.items.create, {
      categoryId: kopi, name: 'Latte', priceIDR: 25000,
    });
    await asOwner.mutation(api.menu.items.create, {
      categoryId: teh, name: 'Teh Tarik', priceIDR: 15000,
    });

    const board = await asOwner.query(api.menu.board.get, {});
    expect(board.cafe.name).toBe('Kopi Senja');
    expect(board.cafe.logoUrl).toBeNull();
    expect(board.categories.map((c) => c.name)).toEqual(['Kopi', 'Teh']);
    expect(board.categories[0]?.items.map((i) => i.name)).toEqual(['Espresso', 'Latte']);
    expect(board.categories[0]?.items[0]).toEqual({
      name: 'Espresso',
      priceIDR: 18000,
      imageUrl: null,
      soldOut: false,
    });
    expect(board.categories[1]?.items.map((i) => i.name)).toEqual(['Teh Tarik']);
  });

  it('exposes only the four board fields per item (no cost, stock, ids)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const kopi = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
    await asOwner.mutation(api.menu.items.create, {
      categoryId: kopi, name: 'Espresso', priceIDR: 18000, barcode: '8991234567890',
    });

    const board = await asOwner.query(api.menu.board.get, {});
    const item = board.categories[0]?.items[0];
    expect(Object.keys(item ?? {}).sort()).toEqual(
      ['imageUrl', 'name', 'priceIDR', 'soldOut']
    );
  });

  it('omits inactive items, archived items, and archived categories', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const kopi = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
    const teh = await asOwner.mutation(api.menu.categories.create, { name: 'Teh' });
    const keep = await asOwner.mutation(api.menu.items.create, {
      categoryId: kopi, name: 'Espresso', priceIDR: 18000,
    });
    const off = await asOwner.mutation(api.menu.items.create, {
      categoryId: kopi, name: 'Nonaktif', priceIDR: 1000,
    });
    const gone = await asOwner.mutation(api.menu.items.create, {
      categoryId: kopi, name: 'Diarsip', priceIDR: 2000,
    });
    await asOwner.mutation(api.menu.items.create, {
      categoryId: teh, name: 'Teh Tarik', priceIDR: 15000,
    });
    await asOwner.mutation(api.menu.items.setActive, { id: off, isActive: false });
    await asOwner.mutation(api.menu.items.archive, { id: gone });
    await asOwner.mutation(api.menu.categories.archive, { id: teh });

    const board = await asOwner.query(api.menu.board.get, {});
    expect(board.categories.map((c) => c.name)).toEqual(['Kopi']);
    expect(board.categories[0]?.items.map((i) => i.name)).toEqual(['Espresso']);
    expect(keep).toBeTruthy();
  });

  it('omits categories with no sellable items', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const kopi = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
    await asOwner.mutation(api.menu.categories.create, { name: 'Kosong' });
    await asOwner.mutation(api.menu.items.create, {
      categoryId: kopi, name: 'Espresso', priceIDR: 18000,
    });

    const board = await asOwner.query(api.menu.board.get, {});
    expect(board.categories.map((c) => c.name)).toEqual(['Kopi']);
  });

  it('reports soldOut items (kept, not hidden)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const kopi = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
    const id = await asOwner.mutation(api.menu.items.create, {
      categoryId: kopi, name: 'Espresso', priceIDR: 18000,
    });
    await asOwner.mutation(api.menu.items.setSoldOut, { id, soldOut: true });

    const board = await asOwner.query(api.menu.board.get, {});
    expect(board.categories[0]?.items[0]?.soldOut).toBe(true);
  });

  it('is scoped to the active outlet', async () => {
    const t = convexTest(schema, modules);
    const { asOwner: ownerA } = await setupOwner(t, 'a@x.com');
    const { asOwner: ownerB } = await setupOwner(t, 'b@x.com');
    const catA = await ownerA.mutation(api.menu.categories.create, { name: 'Kopi A' });
    await ownerA.mutation(api.menu.items.create, {
      categoryId: catA, name: 'Espresso A', priceIDR: 18000,
    });

    const boardB = await ownerB.query(api.menu.board.get, {});
    expect(boardB.categories).toEqual([]);
  });

  it('rejects an unauthenticated caller', async () => {
    const t = convexTest(schema, modules);
    await setupOwner(t);
    await expect(t.query(api.menu.board.get, {})).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/convex/menu-board.test.ts`
Expected: FAIL. The module `convex/menu/board.ts` does not exist yet, so `api.menu.board` is undefined (a TypeScript error plus a runtime "Cannot read properties of undefined" / "Could not find public function" failure).

- [ ] **Step 3: Write the implementation**

Create `convex/menu/board.ts`:

```ts
import { v } from 'convex/values';
import { query } from '../_generated/server';
import { requireActiveOutlet } from '../lib/auth';

/**
 * Data for the wall-mounted menu board (`/menu-board`).
 *
 * Display-only and deliberately narrow: name, price, photo, sold-out. It must
 * never leak cost, stock, recipe, or id data, because this render ends up on a
 * screen pointed at customers. It mirrors the sellable-only assembly in
 * convex/public.ts -> menuForTable, but is scoped to the ACTIVE OUTLET (staff
 * auth) instead of a table's qrToken, and is trimmed to the four board fields.
 */
const boardResult = v.object({
  cafe: v.object({ name: v.string(), logoUrl: v.union(v.string(), v.null()) }),
  categories: v.array(
    v.object({
      name: v.string(),
      items: v.array(
        v.object({
          name: v.string(),
          priceIDR: v.number(),
          imageUrl: v.union(v.string(), v.null()),
          soldOut: v.boolean(),
        })
      ),
    })
  ),
});

export const get = query({
  args: {},
  returns: boardResult,
  handler: async (ctx) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const cafe = await ctx.db.get(cafeId);
    if (!cafe) throw new Error('Kafe tidak ditemukan.');

    // Sellable only: non-archived + active, in menu order.
    const itemRows = await ctx.db
      .query('menuItems')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId).eq('archived', false))
      .collect();
    const activeItems = itemRows
      .filter((i) => i.isActive)
      .sort((a, b) => a.position - b.position);

    const categoryRows = (
      await ctx.db
        .query('categories')
        .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId).eq('archived', false))
        .collect()
    ).sort((a, b) => a.position - b.position);

    const categories = [];
    for (const category of categoryRows) {
      const rows = activeItems.filter((i) => i.categoryId === category._id);
      if (rows.length === 0) continue; // empty categories never get a page
      const items = [];
      for (const item of rows) {
        items.push({
          name: item.name,
          priceIDR: item.priceIDR,
          imageUrl: item.imageStorageId
            ? await ctx.storage.getUrl(item.imageStorageId)
            : null,
          soldOut: item.soldOut ?? false,
        });
      }
      categories.push({ name: category.name, items });
    }

    return {
      cafe: {
        name: cafe.name,
        logoUrl: cafe.logoStorageId ? await ctx.storage.getUrl(cafe.logoStorageId) : null,
      },
      categories,
    };
  },
});
```

- [ ] **Step 4: Regenerate the Convex API types**

Run: `./node_modules/.bin/convex codegen`
Expected: exits 0 and `convex/_generated/api.d.ts` now includes `menu/board`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run tests/convex/menu-board.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: exits 0 with no output.

- [ ] **Step 7: Commit**

```bash
git add convex/menu/board.ts tests/convex/menu-board.test.ts convex/_generated
git commit -m "feat(menu): board query for the customer menu display"
```

---

### Task 2: Pure paging helper `buildBoardPages`

> **Amended after the final review (2026-07-23):** plain sequential chunking
> leaves a sparse final page (9 items at 8 per page gives a page of 8 then a
> page of 1), which CSS grid stretches across a quarter of the screen for a
> full 12 second rotation and reads as a rendering bug on the wall. Approved
> change: the last two pages of each category are balanced (9 becomes 5 + 4,
> 17 becomes 8 + 5 + 4). The steps below describe the original sequential
> version; the balancing landed as a follow-up commit with its own tests.

**Files:**
- Create: `src/components/menu-board/build-board-pages.ts`
- Test: `src/components/menu-board/build-board-pages.test.ts`

**Interfaces:**
- Consumes: the `categories` shape returned by `api.menu.board.get` (Task 1).
- Produces:
  ```ts
  export type BoardItem = {
    name: string;
    priceIDR: number;
    imageUrl: string | null;
    soldOut: boolean;
  };
  export type BoardCategory = { name: string; items: BoardItem[] };
  export type BoardPage = { categoryName: string; items: BoardItem[] };
  export function buildBoardPages(
    categories: BoardCategory[],
    cardsPerPage: number
  ): BoardPage[];
  ```
  Task 3 imports all four.

- [ ] **Step 1: Write the failing test**

Create `src/components/menu-board/build-board-pages.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildBoardPages,
  type BoardCategory,
  type BoardItem,
} from './build-board-pages';

function item(name: string): BoardItem {
  return { name, priceIDR: 10000, imageUrl: null, soldOut: false };
}

function category(name: string, count: number): BoardCategory {
  return {
    name,
    items: Array.from({ length: count }, (_, i) => item(`${name}-${i + 1}`)),
  };
}

describe('buildBoardPages', () => {
  it('returns no pages for no categories', () => {
    expect(buildBoardPages([], 6)).toEqual([]);
  });

  it('puts a small category on a single page', () => {
    const pages = buildBoardPages([category('Kopi', 3)], 6);
    expect(pages).toHaveLength(1);
    expect(pages[0]?.categoryName).toBe('Kopi');
    expect(pages[0]?.items.map((i) => i.name)).toEqual(['Kopi-1', 'Kopi-2', 'Kopi-3']);
  });

  it('never mixes two categories on one page', () => {
    const pages = buildBoardPages([category('Kopi', 2), category('Teh', 1)], 6);
    expect(pages.map((p) => p.categoryName)).toEqual(['Kopi', 'Teh']);
    expect(pages[0]?.items).toHaveLength(2);
    expect(pages[1]?.items).toHaveLength(1);
  });

  it('spans a large category across consecutive pages', () => {
    const pages = buildBoardPages([category('Kopi', 7), category('Teh', 1)], 3);
    expect(pages.map((p) => p.categoryName)).toEqual(['Kopi', 'Kopi', 'Kopi', 'Teh']);
    expect(pages.map((p) => p.items.length)).toEqual([3, 3, 1, 1]);
    expect(pages[2]?.items.map((i) => i.name)).toEqual(['Kopi-7']);
  });

  it('skips categories with no items', () => {
    const pages = buildBoardPages([category('Kosong', 0), category('Kopi', 1)], 6);
    expect(pages.map((p) => p.categoryName)).toEqual(['Kopi']);
  });

  it('treats a cardsPerPage below 1 as 1 rather than looping forever', () => {
    const pages = buildBoardPages([category('Kopi', 2)], 0);
    expect(pages).toHaveLength(2);
    expect(pages[0]?.items).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/components/menu-board/build-board-pages.test.ts`
Expected: FAIL, "Failed to resolve import ./build-board-pages".

- [ ] **Step 3: Write the implementation**

Create `src/components/menu-board/build-board-pages.ts`:

```ts
/** One sellable item as shown on the board. Mirrors api.menu.board.get. */
export type BoardItem = {
  name: string;
  priceIDR: number;
  imageUrl: string | null;
  soldOut: boolean;
};

export type BoardCategory = { name: string; items: BoardItem[] };

/** One screenful. A page always belongs to exactly one category. */
export type BoardPage = { categoryName: string; items: BoardItem[] };

/**
 * Chunk categories into board pages. Categories are never mixed on a page, so a
 * customer always reads one heading at a time; a category with more items than
 * fit simply spans consecutive pages. Pure and deterministic, which is why the
 * rotation itself can stay a dumb index over the result.
 */
export function buildBoardPages(
  categories: BoardCategory[],
  cardsPerPage: number
): BoardPage[] {
  const size = Math.max(1, Math.floor(cardsPerPage));
  const pages: BoardPage[] = [];
  for (const category of categories) {
    for (let start = 0; start < category.items.length; start += size) {
      pages.push({
        categoryName: category.name,
        items: category.items.slice(start, start + size),
      });
    }
  }
  return pages;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/components/menu-board/build-board-pages.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/menu-board/build-board-pages.ts src/components/menu-board/build-board-pages.test.ts
git commit -m "feat(menu): pure paging helper for the menu board"
```

---

### Task 3: Rotation + cards-per-page hooks and the `MenuBoard` component

**Files:**
- Create: `src/components/menu-board/use-rotation.ts`
- Create: `src/components/menu-board/use-cards-per-page.ts`
- Create: `src/components/menu-board/menu-board.tsx`

**Interfaces:**
- Consumes: `buildBoardPages`, `BoardCategory`, `BoardItem`, `BoardPage` from `./build-board-pages` (Task 2); `formatIDR` from `~/lib/money`; `StatusBadge` from `~/components/ui/status-badge`.
- Produces:
  ```ts
  export function useRotation(pageCount: number, intervalMs: number): number;
  export function useCardsPerPage(): number;
  export function MenuBoard(props: {
    cafe: { name: string; logoUrl: string | null };
    categories: BoardCategory[];
  }): React.JSX.Element;
  ```
  Task 4 renders `<MenuBoard cafe={...} categories={...} />`.

No unit tests: vitest runs in `edge-runtime` with no DOM, so these are verified by `pnpm typecheck` and the manual check in Task 5.

- [ ] **Step 1: Write the rotation hook**

Create `src/components/menu-board/use-rotation.ts`:

```ts
import { useEffect, useState } from 'react';

/**
 * Current page index for the board, advancing every intervalMs and looping.
 * A TV cannot be scrolled by hand, so rotation is the only way through the menu.
 * Resets to 0 whenever the page count changes (menu edit, viewport resize) so a
 * stale index can never point past the end of the list.
 */
export function useRotation(pageCount: number, intervalMs: number): number {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
    if (pageCount <= 1) return;
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % pageCount);
    }, intervalMs);
    return () => clearInterval(id);
  }, [pageCount, intervalMs]);

  return Math.min(index, Math.max(0, pageCount - 1));
}
```

- [ ] **Step 2: Write the cards-per-page hook**

Create `src/components/menu-board/use-cards-per-page.ts`:

```ts
import { useEffect, useState } from 'react';

/** Cards on a 16:9 TV (xl and up) versus a smaller monitor. */
const CARDS_LARGE = 8;
const CARDS_SMALL = 6;
/** Tailwind's xl breakpoint. */
const XL_PX = 1280;

function cardsForWidth(width: number): number {
  return width >= XL_PX ? CARDS_LARGE : CARDS_SMALL;
}

/**
 * Cards per board page, by viewport breakpoint. Deliberately a constant map
 * rather than measured layout: the board is a fixed wall display, and measuring
 * would add a reflow loop for no visible gain. Starts at the large value so the
 * server-rendered markup and the first client render agree (no hydration
 * mismatch), then corrects on mount.
 */
export function useCardsPerPage(): number {
  const [cards, setCards] = useState(CARDS_LARGE);

  useEffect(() => {
    const update = () => setCards(cardsForWidth(window.innerWidth));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return cards;
}
```

- [ ] **Step 3: Write the board component**

Create `src/components/menu-board/menu-board.tsx`:

```tsx
import { Trans } from '@lingui/react/macro';
import { useMemo } from 'react';
import { StatusBadge } from '~/components/ui/status-badge';
import { formatIDR } from '~/lib/money';
import { buildBoardPages, type BoardCategory, type BoardItem } from './build-board-pages';
import { useCardsPerPage } from './use-cards-per-page';
import { useRotation } from './use-rotation';

/** How long each page stays on screen. Long enough to read a full grid. */
const ROTATION_MS = 12000;

/**
 * Customer-facing menu board: photo cards grouped by category, auto rotating.
 * Display only, no interaction. Cafe content (category and item names) is the
 * cafe's own data and is never translated; only the chrome goes through lingui.
 */
export function MenuBoard({
  cafe,
  categories,
}: {
  cafe: { name: string; logoUrl: string | null };
  categories: BoardCategory[];
}) {
  const cardsPerPage = useCardsPerPage();
  const pages = useMemo(
    () => buildBoardPages(categories, cardsPerPage),
    [categories, cardsPerPage]
  );
  const index = useRotation(pages.length, ROTATION_MS);
  const page = pages[index];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="flex items-center gap-4 border-b px-8 py-5">
        {cafe.logoUrl ? (
          <img src={cafe.logoUrl} alt="" className="h-12 w-12 rounded-md object-cover" />
        ) : null}
        <span className="text-2xl font-bold tracking-tight">{cafe.name}</span>
        {page ? (
          <span className="ml-6 truncate text-3xl font-extrabold tracking-tight">
            {page.categoryName}
          </span>
        ) : null}
        {pages.length > 1 ? (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {pages.map((p, i) => (
              <span
                key={`${p.categoryName}-${i}`}
                className={`size-2.5 rounded-full ${
                  i === index ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              />
            ))}
          </div>
        ) : null}
      </header>

      {page ? (
        <div
          key={index}
          className="grid min-h-0 flex-1 animate-in fade-in duration-700 grid-cols-2 gap-6 p-8 xl:grid-cols-4"
        >
          {page.items.map((item, i) => (
            <BoardCard key={`${item.name}-${i}`} item={item} />
          ))}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
          {cafe.logoUrl ? (
            <img src={cafe.logoUrl} alt="" className="h-24 w-24 rounded-xl object-cover" />
          ) : null}
          <p className="text-3xl font-semibold text-muted-foreground">
            <Trans>Menu segera hadir</Trans>
          </p>
        </div>
      )}
    </div>
  );
}

function BoardCard({ item }: { item: BoardItem }) {
  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card ${
        item.soldOut ? 'opacity-50' : ''
      }`}
    >
      {item.imageUrl ? (
        <img src={item.imageUrl} alt="" className="min-h-0 flex-1 w-full object-cover" />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-muted p-4 text-center">
          <span className="text-2xl font-semibold text-muted-foreground">{item.name}</span>
        </div>
      )}
      <div className="flex items-baseline justify-between gap-3 border-t px-4 py-3">
        <span className="truncate text-xl font-semibold">{item.name}</span>
        <div className="flex shrink-0 items-center gap-2">
          {item.soldOut ? (
            <StatusBadge variant="danger">
              <Trans>Habis</Trans>
            </StatusBadge>
          ) : null}
          <span className="text-xl font-bold tabular-nums">{formatIDR(item.priceIDR)}</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: both exit 0. If biome reports formatting, run `pnpm lint:fix` and re-run.

- [ ] **Step 5: Commit**

```bash
git add src/components/menu-board/
git commit -m "feat(menu): rotating menu board component"
```

---

### Task 4: The `/menu-board` route

**Files:**
- Create: `src/routes/menu-board.tsx`
- Modify: `src/routeTree.gen.ts` (regenerated, committed)

**Interfaces:**
- Consumes: `MenuBoard` from `~/components/menu-board/menu-board` (Task 3), `api.menu.board.get` (Task 1).
- Produces: the route `/menu-board`, which Task 5 links to.

- [ ] **Step 1: Write the route**

Create `src/routes/menu-board.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from 'convex/react';
import { MenuBoard } from '~/components/menu-board/menu-board';
import { Skeleton } from '~/components/ui/skeleton';

// Standalone full-screen customer-facing menu board. Lives at the top level
// (NOT under _pos) so it renders bare, with no app sidebar/chrome, while still
// inheriting Convex/auth context from __root. Staff open it on the device
// driving the TV, go fullscreen, and leave it; the session persists across
// restarts. Convex reactivity keeps it live when the menu changes.
export const Route = createFileRoute('/menu-board')({
  component: MenuBoardPage,
});

function MenuBoardPage() {
  return (
    <>
      <AuthLoading>
        <BoardSkeleton />
      </AuthLoading>
      <Unauthenticated>
        <SignedOutRedirect />
      </Unauthenticated>
      <Authenticated>
        <BoardData />
      </Authenticated>
    </>
  );
}

function BoardData() {
  const board = useQuery(api.menu.board.get, {});
  if (board === undefined) return <BoardSkeleton />;
  return <MenuBoard cafe={board.cafe} categories={board.categories} />;
}

function BoardSkeleton() {
  return (
    <div className="flex h-screen flex-col bg-background">
      <div className="flex items-center gap-4 border-b px-8 py-5">
        <Skeleton className="h-12 w-12 rounded-md" />
        <Skeleton className="h-8 w-48" />
      </div>
      <div className="grid flex-1 grid-cols-2 gap-6 p-8 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-full w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function SignedOutRedirect() {
  if (typeof window !== 'undefined') {
    window.location.replace('/signin');
  }
  return null;
}
```

- [ ] **Step 2: Regenerate the route tree**

`src/routeTree.gen.ts` is produced by the TanStack router vite plugin; there is no standalone `tsr` binary in this repo.

Run: `pnpm build`
Expected: the build completes and `git status` shows `src/routeTree.gen.ts` modified, now containing a `/menu-board` route entry.

If `pnpm build` fails for reasons unrelated to this route (for example a Cloudflare/wrangler environment issue), run `pnpm dev` instead, wait until Vite prints its local URL, confirm `src/routeTree.gen.ts` changed, then stop it with Ctrl-C.

- [ ] **Step 3: Verify the route tree really changed**

Run: `git diff --stat src/routeTree.gen.ts && grep -c "menu-board" src/routeTree.gen.ts`
Expected: a non-empty diffstat and a count of at least 1. If the count is 0, the generation step did not run. Do not hand-edit the file; re-run step 2.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/routes/menu-board.tsx src/routeTree.gen.ts
git commit -m "feat(menu): full-screen /menu-board route"
```

---

### Task 5: Entry point on the Menu page, translations, and full verification

**Files:**
- Modify: `src/routes/_pos/menu/index.tsx` (the `PageHeader` `actions` block, around lines 302-325)
- Modify: `src/locales/id/messages.po`, `src/locales/en/messages.po` (via lingui extract)
- Modify: `src/locales/*/messages.ts` (via lingui compile, if tracked)

**Interfaces:**
- Consumes: the `/menu-board` route from Task 4.
- Produces: nothing other tasks depend on. This is the last task.

- [ ] **Step 1: Add the button to the Menu page header**

In `src/routes/_pos/menu/index.tsx`, the header currently renders:

```tsx
        actions={
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setImportOpen(true)}>
              <Upload />
              <Trans>Impor CSV</Trans>
            </Button>
```

Add a new outline button before the CSV import button, so the actions block reads:

```tsx
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              {/* Opens in a new tab so staff can drag it onto the TV and leave
                  the POS session on this tab untouched. */}
              <a href="/menu-board" target="_blank" rel="noreferrer">
                <Monitor />
                <Trans>Buka layar menu</Trans>
              </a>
            </Button>
            <Button type="button" variant="outline" onClick={() => setImportOpen(true)}>
              <Upload />
              <Trans>Impor CSV</Trans>
            </Button>
```

Add `Monitor` to the existing lucide-react import at the top of the file, keeping the names alphabetical:

```tsx
import { Archive, Ban, CircleCheck, Monitor, Plus, Power, Upload, UtensilsCrossed } from 'lucide-react';
```

- [ ] **Step 2: Extract the new strings**

Run: `pnpm lingui:extract`
Expected: reports new messages. The two new ones are `Buka layar menu` and `Menu segera hadir`. `Habis` already exists and is reused, so it should not appear as new.

- [ ] **Step 3: Fill the English translations**

In `src/locales/en/messages.po`, set the `msgstr` for the two new entries (leave `src/locales/id/messages.po` alone; `id` is the source locale):

```po
msgid "Buka layar menu"
msgstr "Open menu display"

msgid "Menu segera hadir"
msgstr "Menu coming soon"
```

Check that no other `en` entry was blanked by the extract. `git diff src/locales/en/messages.po` should show only additions plus these two filled strings.

- [ ] **Step 4: Compile the catalogs**

Run: `pnpm lingui:compile`
Expected: exits 0, reporting both locales compiled.

- [ ] **Step 5: Run the full CI gates locally**

Run: `pnpm typecheck && pnpm test && pnpm lingui:compile`
Expected: all three exit 0. The vitest suite can time out spuriously under load; if a test fails, re-run `pnpm test` on its own before treating the failure as real.

- [ ] **Step 6: Manual check in the running app**

Run: `pnpm dev:all`, then in the browser:
1. Sign in, go to Menu. Confirm the "Buka layar menu" button is in the header and opens `/menu-board` in a new tab.
2. On the board: photo cards render in a grid, the category name shows in the header, page dots reflect the page count.
3. Wait ~12s and confirm the board advances to the next page and eventually loops back.
4. Mark an item sold out from the Menu page and confirm the board card dims and shows "Habis" without a reload.
5. Edit an item price and confirm the board updates live.
6. Open `/menu-board` in a private window (signed out) and confirm it redirects to `/signin`.
7. On a cafe with no sellable items, confirm the "Menu segera hadir" empty screen.

- [ ] **Step 7: Commit**

```bash
git add src/routes/_pos/menu/index.tsx src/locales
git commit -m "feat(menu): open the menu board from the menu page"
```

---

## Done criteria

- `/menu-board` renders a rotating, live, display-only menu board for the active outlet.
- `api.menu.board.get` returns sellable-only data and leaks no cost, stock, recipe, or id fields (covered by tests).
- `buildBoardPages` is unit tested for chunking, one-category-per-page, multi-page categories, empty input, and a degenerate page size.
- `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile` all pass, and `src/routeTree.gen.ts` plus `convex/_generated` are committed.
