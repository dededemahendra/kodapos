# Global Search — Design Spec

**Date:** 2026-06-20  
**Branch:** feat/global-search (to be cut from main)  
**UI primitive:** shadcn Command (`cmdk`)

---

## Overview

A `⌘K` / `Ctrl+K` command palette that lets users jump to any page, trigger quick actions, and search live menu items and customers — all from a single keyboard shortcut or header button.

---

## Architecture

### New files

| File | Purpose |
|---|---|
| `src/components/command-palette.tsx` | `CommandDialog` component — all four result groups, keyboard listener, open state |
| `src/components/ui/command.tsx` | shadcn Command primitive (installed via `npx shadcn@latest add command`) |
| `convex/search.ts` | `api.search.global` query — menu items + customers by search term |

### Modified files

| File | Change |
|---|---|
| `src/routes/_pos.tsx` | Mount `<CommandPalette />` inside `<Authenticated>` so it is available on every POS page |
| `src/components/app-header.tsx` | Add search trigger button (icon + `⌘K` badge on desktop, icon-only on mobile) |
| `src/locales/en/messages.po` | New i18n strings |
| `src/locales/id/messages.po` | New i18n strings |

### Dependencies

- `cmdk` — installed transitively by `shadcn add command`

---

## UI Design

```
AppHeader (right side):
┌────────────────────────────────────┐
│  🔍  Cari...                  ⌘K  │
└────────────────────────────────────┘

CommandDialog (modal, centered):
┌─────────────────────────────────────────────┐
│  🔍  Cari...                                │  ← CommandInput
├─────────────────────────────────────────────┤
│  TINDAKAN CEPAT                             │
│  ⚡ Kasir baru                              │
│  ⚡ Tambah item menu                        │
│  ⚡ Buka shift                              │
│  ⚡ Tambah pelanggan                        │
├─────────────────────────────────────────────┤
│  HALAMAN                                    │
│  📊 Dasbor                                 │
│  🧾 Riwayat                                │
│  … (filtered from navLinks)                 │
├─────────────────────────────────────────────┤
│  ITEM MENU            (live, ≥ 2 chars)     │
│  🍔 Nasi Goreng — Rp 25.000                │
│  ☕ Es Kopi Susu — Rp 18.000               │
├─────────────────────────────────────────────┤
│  PELANGGAN            (live, ≥ 2 chars)     │
│  👤 Budi Santoso — 0812-3456-7890          │
└─────────────────────────────────────────────┘
```

### Display states

| State | Behaviour |
|---|---|
| Dialog closed | Nothing rendered |
| Open, no query | Quick Actions + all permitted nav pages; live groups hidden |
| Open, query < 2 chars | Same as no query — avoids single-letter Convex calls |
| Open, query ≥ 2 chars | All four groups visible; live groups show a skeleton row while the query is in-flight |
| No results | `CommandEmpty`: "Tidak ada hasil untuk «{query}»" |

### Header button

- Desktop: icon + label "Cari" + `⌘K` badge (using existing `Kbd` component)
- Mobile (`< md`): icon only, no badge
- Renders inside the existing right-side action cluster in `AppHeader`, left of the theme toggle

---

## Keyboard Behaviour

| Key | Effect |
|---|---|
| `⌘K` / `Ctrl+K` | Toggle open |
| `Esc` | Close |
| `↑` / `↓` | Navigate items (native cmdk) |
| `Enter` | Select — closes dialog, then navigates or triggers action |

---

## Quick Actions (static)

| Label (id) | Action |
|---|---|
| Kasir baru | `navigate('/sale')` |
| Tambah item menu | `navigate('/menu')` |
| Buka shift | `navigate('/shift')` |
| Tambah pelanggan | `navigate('/customers')` |

Quick actions are always shown regardless of query. They are not permission-filtered (navigation will enforce access on arrival). During implementation, verify whether any route supports a `?new=1` query param to auto-open a creation dialog; if so, update the navigate call accordingly.

---

## Navigation Results

- Source: `navLinks` flat array from `app-shared.tsx` (already includes all pages + sub-pages + footer links)
- Permission filtering: `usePermissions()` hook — same logic as the sidebar; staff cannot see owner-only pages
- Client-side filtering: case-insensitive match on the Indonesian label (`i18n._(item.title)`) and the path string
- Shown only when query matches at least one character or the dialog is freshly opened (show all when empty)

---

## Convex Backend — `convex/search.ts`

### Query: `api.search.global`

```ts
args: { term: v.string() }
returns: v.object({
  menuItems: v.array(v.object({
    _id: v.id('menuItems'),
    name: v.string(),
    price: v.number(),
    categoryName: v.string(),
  })),
  customers: v.array(v.object({
    _id: v.id('customers'),
    name: v.string(),
    phone: v.optional(v.string()),
  })),
})
```

- `term` must be ≥ 2 characters (validated in the query; returns empty arrays if shorter)
- Menu items: scan `menuItems` table, filter where `name` contains `term` (case-insensitive), join `categories` for name, cap at 5
- Customers: scan `customers` table, filter where `name` or `phone` contains `term` (case-insensitive), cap at 5
- No new search indexes required — table scans are fine for small-cafe catalogs (<500 items, <2 k customers). Can add `searchIndex` later if needed.
- The query is called with Convex's `"skip"` pattern when the dialog is closed or `term.length < 2`, so no unnecessary round-trips

---

## i18n

All user-facing strings go through Lingui:

- `t\`Cari menu, pelanggan, halaman…\`` — input placeholder
- `t\`Cari...\`` — dialog input placeholder (short)
- `<Trans>Tindakan Cepat</Trans>` — group heading
- `<Trans>Halaman</Trans>` — group heading
- `<Trans>Item Menu</Trans>` — group heading
- `<Trans>Pelanggan</Trans>` — group heading
- `t\`Tidak ada hasil untuk «{query}»\`` — empty state
- All quick action labels

Run `pnpm lingui:extract` and fill `en` translations after implementation.

---

## Testing

- Unit test `convex/search.ts`: empty term returns empty arrays; term < 2 chars returns empty arrays; matching name returns correct records; cap at 5 respected; no cross-cafe data leakage (uses existing `cafeId` guard from Convex auth context)
- No UI tests (component is thin wrapper over cmdk which is already tested upstream)

---

## Out of scope

- Order history search (can be added as a fifth group later)
- Adaptive result scoring / recency boosting
- Convex search indexes (premature for small catalogs)
- Mobile-specific bottom-sheet variant
