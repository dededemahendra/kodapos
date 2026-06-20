# Global Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a ⌘K / Ctrl+K command palette to the POS app that lets users jump to any page, trigger quick actions, and live-search menu items and customers.

**Architecture:** A single `CommandPalette` component (shadcn `CommandDialog`) is mounted in the `_pos.tsx` layout, making it available on every authenticated POS page. A new Convex query `api.search.global` handles live data search for menu items and customers; navigation and quick-action results are filtered client-side from the existing `navLinks` array.

**Tech Stack:** shadcn Command (`cmdk`), Convex `query`, TanStack Router `useNavigate`, Lingui i18n, `usePermissions` for nav filtering.

## Global Constraints

- All user-facing strings use `<Trans>` or `t\`...\`` from `@lingui/react/macro` — never raw strings in JSX
- Price display: `formatIDR(n)` from `~/lib/money`
- Auth in Convex queries: `requireOwnerCafe(ctx)` from `./lib/auth` — never accept userId as arg
- Convex codegen: `./node_modules/.bin/convex codegen` (not `npx`) — commit the generated files
- After any new Lingui string: `pnpm lingui:extract` → fill en translations → `pnpm lingui:compile`
- i18n compile output (`.js` files) is gitignored; only `.po` files are committed
- No em-dash (—) in user-facing copy; use commas, periods, or parentheses
- Commit message style: `feat(scope): description` / `fix(scope): description`

---

## File Map

| Path | Action | Responsibility |
|---|---|---|
| `src/components/ui/command.tsx` | **Create** (via shadcn CLI) | shadcn Command primitive |
| `convex/search.ts` | **Create** | `api.search.global` query |
| `tests/convex/search.test.ts` | **Create** | Tests for `api.search.global` |
| `src/components/command-palette.tsx` | **Create** | CommandDialog component |
| `src/routes/_pos.tsx` | **Modify** | Mount `<CommandPalette />` |
| `src/components/app-header.tsx` | **Modify** | Add search trigger button |
| `src/locales/en/messages.po` | **Modify** (via extract) | English translations |
| `src/locales/id/messages.po` | **Modify** (via extract) | Indonesian source strings |

---

## Task 1: Install shadcn Command + Convex search query + tests

**Files:**
- Create: `src/components/ui/command.tsx` (via CLI)
- Create: `convex/search.ts`
- Create: `tests/convex/search.test.ts`

**Interfaces:**
- Produces: `api.search.global({ term: string }) → { menuItems: MenuItemResult[], customers: CustomerResult[] }`
  - `MenuItemResult = { _id: Id<'menuItems'>, name: string, priceIDR: number, categoryName: string }`
  - `CustomerResult = { _id: Id<'customers'>, name: string, phone: string }`

---

- [ ] **Step 1: Install shadcn Command component**

Run in the project root:
```bash
npx shadcn@latest add command
```

Accept all prompts. This creates `src/components/ui/command.tsx` and installs `cmdk` as a dependency.

Verify `src/components/ui/command.tsx` now exists and `package.json` contains `"cmdk"`.

---

- [ ] **Step 2: Write failing tests for `api.search.global`**

Create `tests/convex/search.test.ts`:

```typescript
/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setup(t: ReturnType<typeof convexTest>) {
  const userId = await t.run((ctx) =>
    ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' })
  );
  const asOwner = t.withIdentity({ subject: `${userId}|test` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  const cafe = await asOwner.query(api.cafes.myCafe, {});
  if (!cafe) throw new Error('cafe not created');
  const catId = await t.run((ctx) =>
    ctx.db.insert('categories', {
      cafeId: cafe._id,
      name: 'Minuman',
      position: 0,
      archived: false,
      createdAt: Date.now(),
    })
  );
  return { asOwner, cafeId: cafe._id, catId };
}

describe('search.global', () => {
  it('returns empty arrays when term is shorter than 2 chars', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    const r1 = await asOwner.query(api.search.global, { term: '' });
    expect(r1).toEqual({ menuItems: [], customers: [] });
    const r2 = await asOwner.query(api.search.global, { term: 'a' });
    expect(r2).toEqual({ menuItems: [], customers: [] });
  });

  it('finds menu items by name (case-insensitive)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId, catId } = await setup(t);
    await t.run((ctx) =>
      ctx.db.insert('menuItems', {
        cafeId,
        categoryId: catId,
        name: 'Es Kopi Susu',
        priceIDR: 18000,
        isActive: true,
        archived: false,
        soldOut: false,
        position: 0,
        createdAt: Date.now(),
      })
    );
    const result = await asOwner.query(api.search.global, { term: 'kopi' });
    expect(result.menuItems).toHaveLength(1);
    expect(result.menuItems[0]?.name).toBe('Es Kopi Susu');
    expect(result.menuItems[0]?.priceIDR).toBe(18000);
    expect(result.menuItems[0]?.categoryName).toBe('Minuman');
    expect(result.customers).toHaveLength(0);
  });

  it('does not return archived or inactive menu items', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId, catId } = await setup(t);
    await t.run((ctx) =>
      ctx.db.insert('menuItems', {
        cafeId,
        categoryId: catId,
        name: 'Archived Kopi',
        priceIDR: 10000,
        isActive: true,
        archived: true,
        position: 0,
        createdAt: Date.now(),
      })
    );
    await t.run((ctx) =>
      ctx.db.insert('menuItems', {
        cafeId,
        categoryId: catId,
        name: 'Inactive Kopi',
        priceIDR: 10000,
        isActive: false,
        archived: false,
        position: 1,
        createdAt: Date.now(),
      })
    );
    const result = await asOwner.query(api.search.global, { term: 'kopi' });
    expect(result.menuItems).toHaveLength(0);
  });

  it('caps menu item results at 5', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId, catId } = await setup(t);
    await t.run(async (ctx) => {
      for (let i = 0; i < 8; i++) {
        await ctx.db.insert('menuItems', {
          cafeId,
          categoryId: catId,
          name: `Kopi ${i}`,
          priceIDR: 10000,
          isActive: true,
          archived: false,
          position: i,
          createdAt: Date.now() + i,
        });
      }
    });
    const result = await asOwner.query(api.search.global, { term: 'kopi' });
    expect(result.menuItems.length).toBeLessThanOrEqual(5);
  });

  it('finds customers by name (case-insensitive)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId } = await setup(t);
    await t.run((ctx) =>
      ctx.db.insert('customers', {
        cafeId,
        name: 'Budi Santoso',
        phone: '081234567890',
        pointsBalance: 0,
        visitCount: 0,
        totalSpentIDR: 0,
        archived: false,
        createdAt: Date.now(),
      })
    );
    const result = await asOwner.query(api.search.global, { term: 'budi' });
    expect(result.customers).toHaveLength(1);
    expect(result.customers[0]?.name).toBe('Budi Santoso');
    expect(result.customers[0]?.phone).toBe('081234567890');
  });

  it('finds customers by phone', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId } = await setup(t);
    await t.run((ctx) =>
      ctx.db.insert('customers', {
        cafeId,
        name: 'Ani Wijaya',
        phone: '082211223344',
        pointsBalance: 0,
        visitCount: 0,
        totalSpentIDR: 0,
        archived: false,
        createdAt: Date.now(),
      })
    );
    const result = await asOwner.query(api.search.global, { term: '0822' });
    expect(result.customers).toHaveLength(1);
    expect(result.customers[0]?.name).toBe('Ani Wijaya');
  });

  it('does not return archived customers', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId } = await setup(t);
    await t.run((ctx) =>
      ctx.db.insert('customers', {
        cafeId,
        name: 'Archived Budi',
        phone: '081199998888',
        pointsBalance: 0,
        visitCount: 0,
        totalSpentIDR: 0,
        archived: true,
        createdAt: Date.now(),
      })
    );
    const result = await asOwner.query(api.search.global, { term: 'budi' });
    expect(result.customers).toHaveLength(0);
  });

  it('caps customer results at 5', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId } = await setup(t);
    await t.run(async (ctx) => {
      for (let i = 0; i < 8; i++) {
        await ctx.db.insert('customers', {
          cafeId,
          name: `Budi ${i}`,
          phone: `0812000000${i}`,
          pointsBalance: 0,
          visitCount: 0,
          totalSpentIDR: 0,
          archived: false,
          createdAt: Date.now() + i,
        });
      }
    });
    const result = await asOwner.query(api.search.global, { term: 'budi' });
    expect(result.customers.length).toBeLessThanOrEqual(5);
  });

  it('does not return data from another cafe', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId } = await setup(t);

    // Create a second owner + cafe
    const userId2 = await t.run((ctx) =>
      ctx.db.insert('users', { name: 'Other', email: 'other@x.com' })
    );
    const asOwner2 = t.withIdentity({ subject: `${userId2}|test` });
    await asOwner2.mutation(api.cafes.createForOwner, { name: 'Warung Lain' });
    const cafe2 = await asOwner2.query(api.cafes.myCafe, {});
    if (!cafe2) throw new Error('cafe2 not created');
    const catId2 = await t.run((ctx) =>
      ctx.db.insert('categories', {
        cafeId: cafe2._id,
        name: 'Makanan',
        position: 0,
        archived: false,
        createdAt: Date.now(),
      })
    );
    await t.run((ctx) =>
      ctx.db.insert('menuItems', {
        cafeId: cafe2._id,
        categoryId: catId2,
        name: 'Kopi Rival',
        priceIDR: 20000,
        isActive: true,
        archived: false,
        position: 0,
        createdAt: Date.now(),
      })
    );

    // Owner 1 searches — must not see other cafe's item
    const result = await asOwner.query(api.search.global, { term: 'kopi' });
    expect(result.menuItems).toHaveLength(0);
  });
});
```

---

- [ ] **Step 3: Run tests to confirm they fail**

```bash
pnpm test tests/convex/search.test.ts
```

Expected: all tests fail with "Could not find public function for 'search:global'" or similar — the query does not exist yet.

---

- [ ] **Step 4: Create `convex/search.ts`**

```typescript
import { v } from 'convex/values';
import { query } from './_generated/server';
import { requireOwnerCafe } from './lib/auth';

export const global = query({
  args: { term: v.string() },
  returns: v.object({
    menuItems: v.array(
      v.object({
        _id: v.id('menuItems'),
        name: v.string(),
        priceIDR: v.number(),
        categoryName: v.string(),
      })
    ),
    customers: v.array(
      v.object({
        _id: v.id('customers'),
        name: v.string(),
        phone: v.string(),
      })
    ),
  }),
  handler: async (ctx, { term }) => {
    if (term.trim().length < 2) {
      return { menuItems: [], customers: [] };
    }
    const { cafeId } = await requireOwnerCafe(ctx);
    const q = term.trim().toLowerCase();

    // Menu items: scope to cafe's active (non-archived, isActive) items, filter by name
    const allItems = await ctx.db
      .query('menuItems')
      .withIndex('by_cafe_active', (idx) =>
        idx.eq('cafeId', cafeId).eq('archived', false).eq('isActive', true)
      )
      .collect();
    const matchingItems = allItems.filter((item) =>
      item.name.toLowerCase().includes(q)
    );
    const menuItems = await Promise.all(
      matchingItems.slice(0, 5).map(async (item) => {
        const cat = await ctx.db.get(item.categoryId);
        return {
          _id: item._id,
          name: item.name,
          priceIDR: item.priceIDR,
          categoryName: cat?.name ?? '',
        };
      })
    );

    // Customers: scope to cafe's active customers, filter by name or phone
    const allCustomers = await ctx.db
      .query('customers')
      .withIndex('by_cafe_active', (idx) =>
        idx.eq('cafeId', cafeId).eq('archived', false)
      )
      .collect();
    const customers = allCustomers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q)
      )
      .slice(0, 5)
      .map((c) => ({ _id: c._id, name: c.name, phone: c.phone }));

    return { menuItems, customers };
  },
});
```

---

- [ ] **Step 5: Run codegen**

```bash
./node_modules/.bin/convex codegen
```

---

- [ ] **Step 6: Run tests to confirm they pass**

```bash
pnpm test tests/convex/search.test.ts
```

Expected: all 9 tests pass.

---

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/command.tsx package.json pnpm-lock.yaml convex/search.ts tests/convex/search.test.ts convex/_generated/
git commit -m "feat(search): shadcn Command component + Convex global search query"
```

---

## Task 2: `CommandPalette` component + header trigger + layout wire-up + i18n

**Files:**
- Create: `src/components/command-palette.tsx`
- Modify: `src/routes/_pos.tsx`
- Modify: `src/components/app-header.tsx`
- Modify: `src/locales/en/messages.po` (via extract)
- Modify: `src/locales/id/messages.po` (via extract)

**Interfaces:**
- Consumes: `api.search.global` from Task 1
- Consumes: `navLinks`, `SidebarNavItem` from `~/components/app-shared`
- Consumes: `formatIDR` from `~/lib/money`
- Consumes: `usePermissions` from `~/lib/permissions`
- Produces: `<CommandPalette />` — zero props, self-contained

---

- [ ] **Step 1: Create `src/components/command-palette.tsx`**

```tsx
import { Trans, useLingui } from '@lingui/react/macro';
import { useNavigate } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import {
  Calculator,
  Clock,
  Plus,
  Search,
  UtensilsCrossed,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { navLinks, type SidebarNavItem } from '~/components/app-shared';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '~/components/ui/command';
import { Skeleton } from '~/components/ui/skeleton';
import { formatIDR } from '~/lib/money';
import { usePermissions } from '~/lib/permissions';

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const { t, i18n } = useLingui();
  const { can, isOwner, isLoading: permLoading } = usePermissions();

  const trimmed = query.trim();
  const isLive = open && trimmed.length >= 2;
  const liveResults = useQuery(
    api.search.global,
    isLive ? { term: trimmed } : 'skip'
  );

  // ⌘K / Ctrl+K to toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Clear query when dialog closes
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  function select(fn: () => void) {
    setOpen(false);
    fn();
  }

  // Permission-filtered nav items (mirrors app-sidebar logic)
  const allowed = (req?: SidebarNavItem['requires']) =>
    !req || permLoading || (req === 'owner' ? isOwner : can(req));
  const permittedNav = navLinks.filter(
    (item) => item.path && allowed(item.requires)
  );

  const queryLower = trimmed.toLowerCase();
  const matchingNav = queryLower
    ? permittedNav.filter(
        (item) =>
          i18n._(item.title).toLowerCase().includes(queryLower) ||
          (item.path ?? '').toLowerCase().includes(queryLower)
      )
    : permittedNav;

  const QUICK_ACTIONS = [
    { key: 'sale', label: t`Kasir baru`, icon: <Calculator className="size-4" />, path: '/sale' },
    { key: 'menu', label: t`Tambah item menu`, icon: <Plus className="size-4" />, path: '/menu' },
    { key: 'shift', label: t`Buka shift`, icon: <Clock className="size-4" />, path: '/shift' },
    { key: 'customers', label: t`Tambah pelanggan`, icon: <Users className="size-4" />, path: '/customers' },
  ] as const;

  const matchingActions = queryLower
    ? QUICK_ACTIONS.filter((a) => a.label.toLowerCase().includes(queryLower))
    : QUICK_ACTIONS;

  const hasLiveResults =
    (liveResults?.menuItems.length ?? 0) > 0 ||
    (liveResults?.customers.length ?? 0) > 0;
  const isLoading = isLive && liveResults === undefined;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder={t`Cari...`}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {!isLoading && !hasLiveResults && matchingActions.length === 0 && matchingNav.length === 0 && (
          <CommandEmpty>
            <Trans>Tidak ada hasil untuk &laquo;{query}&raquo;</Trans>
          </CommandEmpty>
        )}

        {matchingActions.length > 0 && (
          <CommandGroup heading={t`Tindakan Cepat`}>
            {matchingActions.map((action) => (
              <CommandItem
                key={action.key}
                value={`action-${action.key}`}
                onSelect={() =>
                  select(() => void navigate({ to: action.path }))
                }
              >
                {action.icon}
                {action.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {matchingNav.length > 0 && (
          <CommandGroup heading={t`Halaman`}>
            {matchingNav.slice(0, 12).map((item) => (
              <CommandItem
                key={item.path}
                value={`nav-${item.path}`}
                onSelect={() =>
                  select(() => void navigate({ to: item.path! as '/' }))
                }
              >
                {item.icon}
                <span>{i18n._(item.title)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {isLoading && (
          <CommandGroup heading={t`Item Menu`}>
            <CommandItem disabled value="loading-menu">
              <Skeleton className="h-4 w-40" />
            </CommandItem>
          </CommandGroup>
        )}

        {!isLoading && (liveResults?.menuItems.length ?? 0) > 0 && (
          <CommandGroup heading={t`Item Menu`}>
            {liveResults!.menuItems.map((item) => (
              <CommandItem
                key={item._id}
                value={`menu-${item._id}`}
                onSelect={() =>
                  select(() => void navigate({ to: '/menu' }))
                }
              >
                <UtensilsCrossed className="size-4" />
                <span>{item.name}</span>
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  {formatIDR(item.priceIDR)}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {isLoading && (
          <CommandGroup heading={t`Pelanggan`}>
            <CommandItem disabled value="loading-customers">
              <Skeleton className="h-4 w-36" />
            </CommandItem>
          </CommandGroup>
        )}

        {!isLoading && (liveResults?.customers.length ?? 0) > 0 && (
          <CommandGroup heading={t`Pelanggan`}>
            {liveResults!.customers.map((customer) => (
              <CommandItem
                key={customer._id}
                value={`customer-${customer._id}`}
                onSelect={() =>
                  select(() => void navigate({ to: '/customers' }))
                }
              >
                <Users className="size-4" />
                <span>{customer.name}</span>
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  {customer.phone}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
```

---

- [ ] **Step 2: Mount `<CommandPalette />` in `src/routes/_pos.tsx`**

In `_pos.tsx`, add the import at the top and render inside `<Authenticated>`, after the `<AutoLock />` component:

```tsx
// Add to imports:
import { CommandPalette } from '~/components/command-palette';

// Inside <Authenticated>, after <AutoLock />:
<AutoLock />
<CommandPalette />
<OnboardingGate>
  ...
</OnboardingGate>
```

The full `<Authenticated>` block should look like:

```tsx
<Authenticated>
  <AutoLock />
  <CommandPalette />
  <OnboardingGate>
    {showNav ? (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <AppHeader />
          <Outlet />
        </SidebarInset>
      </SidebarProvider>
    ) : isOperational ? (
      <div className="flex h-screen flex-col">
        <RegisterTopBar />
        <div className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </div>
      </div>
    ) : (
      <Outlet />
    )}
  </OnboardingGate>
  <Toaster />
</Authenticated>
```

---

- [ ] **Step 3: Add search trigger button to `src/components/app-header.tsx`**

Add import for `CommandPaletteTrigger` — but since the trigger is just a button that sets state in `CommandPalette`, the cleanest approach is a simple button that fires a synthetic `⌘K` event, or we use a shared atom. The simplest approach: the trigger dispatches a `CustomEvent` that `CommandPalette` listens to, but that's overengineered.

Simpler: expose a module-level open-signal using a tiny event emitter pattern. Instead, use the built-in DOM approach: dispatch a keyboard event:

Actually the cleanest approach for this architecture is to have the trigger dispatch a `keydown` event, which `CommandPalette`'s existing listener will catch. Replace the trigger button in `app-header.tsx` with this:

```tsx
// Add to imports in app-header.tsx:
import { Search } from 'lucide-react';
import { Kbd } from '~/components/ui/kbd';

// Add this function inside AppHeader:
function openCommandPalette() {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })
  );
}

// Add this button to the right-side cluster, before the theme toggle:
<Button
  aria-label={t`Cari`}
  size="sm"
  variant="ghost"
  className="hidden md:flex items-center gap-2 text-muted-foreground hover:text-foreground"
  onClick={openCommandPalette}
>
  <Search className="size-4" />
  <span className="text-sm"><Trans>Cari</Trans></span>
  <Kbd>⌘K</Kbd>
</Button>
<Button
  aria-label={t`Cari`}
  size="icon-sm"
  variant="ghost"
  className="flex md:hidden"
  onClick={openCommandPalette}
>
  <Search />
</Button>
```

The updated right-side div in `AppHeader` should be:

```tsx
<div className="flex items-center gap-3">
  <Button
    aria-label={t`Cari`}
    size="sm"
    variant="ghost"
    className="hidden md:flex items-center gap-2 text-muted-foreground hover:text-foreground"
    onClick={openCommandPalette}
  >
    <Search className="size-4" />
    <span className="text-sm"><Trans>Cari</Trans></span>
    <Kbd>⌘K</Kbd>
  </Button>
  <Button
    aria-label={t`Cari`}
    size="icon-sm"
    variant="ghost"
    className="flex md:hidden"
    onClick={openCommandPalette}
  >
    <Search />
  </Button>
  <Button
    aria-label={t`Ganti tema`}
    size="icon-sm"
    variant="ghost"
    onClick={toggleTheme}
  >
    {isDark ? <SunIcon /> : <MoonIcon />}
  </Button>
  <NotificationsMenu />
  <Separator
    className="h-4 data-[orientation=vertical]:self-center"
    orientation="vertical"
  />
  <NavUser />
</div>
```

---

- [ ] **Step 4: Extract and fill i18n strings**

```bash
pnpm lingui:extract
```

Open `src/locales/en/messages.po` and fill the English translations for every new string. New strings to translate:

| Indonesian (msgid) | English (msgstr) |
|---|---|
| `Cari...` | `Search...` |
| `Tindakan Cepat` | `Quick Actions` |
| `Halaman` | `Pages` |
| `Item Menu` | `Menu Items` |
| `Pelanggan` | `Customers` |
| `Kasir baru` | `New cashier session` |
| `Tambah item menu` | `Add menu item` |
| `Buka shift` | `Open shift` |
| `Tambah pelanggan` | `Add customer` |
| `Cari` | `Search` |
| `Tidak ada hasil untuk «{query}»` | `No results for "{query}"` |

Note: some of these strings (e.g. `Pelanggan`, `Item Menu`) may already exist in the catalog — `lingui:extract` will add a new source reference but won't create a duplicate entry. Check before adding.

---

- [ ] **Step 5: Compile i18n**

```bash
pnpm lingui:compile
```

Expected: "Done in Xs" with no missing translations.

---

- [ ] **Step 6: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors. Fix any type errors before continuing.

---

- [ ] **Step 7: Run all tests**

```bash
pnpm test
```

Expected: all tests pass including the new `search.test.ts`.

---

- [ ] **Step 8: Commit**

```bash
git add src/components/command-palette.tsx src/routes/_pos.tsx src/components/app-header.tsx src/locales/en/messages.po src/locales/id/messages.po
git commit -m "feat(search): global command palette with nav, quick actions, and live search"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All spec sections covered — Command dialog UI, Quick Actions (4 items), Nav results (permission-filtered, client-side), Menu items (live, capped at 5), Customers (live, capped at 5), ⌘K keyboard shortcut, header button (desktop + mobile), i18n, cross-cafe isolation test
- [x] **No placeholders:** All steps contain exact code, no TBD/TODO
- [x] **Type consistency:** `SidebarNavItem` imported from `~/components/app-shared` in both the component (used) and the plan (referenced). `api.search.global` return shape matches between query implementation (Task 1 Step 4) and component consumption (Task 2 Step 1). `formatIDR` import path `~/lib/money` matches existing usage in the codebase.
- [x] **Convex auth pattern:** `requireOwnerCafe(ctx)` used correctly — no userId arg
- [x] **Index usage:** `by_cafe_active` index used for both `menuItems` and `customers` scoping — matches schema definitions
- [x] **i18n:** All JSX strings use `<Trans>` or `t\`...\``, no raw strings
- [x] **No em-dash:** Checked — no em-dash in copy
- [x] **Codegen:** Included in Task 1 Step 5
