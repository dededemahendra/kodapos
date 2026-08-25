import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';

export const TITLE_SUFFIX = 'kodapos';

export type TitleEntry = { path: string; title: MessageDescriptor };

/**
 * Titles for app routes with no sidebar entry: wizard steps, the report tabs
 * that live in `reports/route.tsx` rather than the sidebar, and the menu
 * sub-editors. Every other route resolves from `navLinks`, so a page's tab
 * title and its sidebar label cannot drift apart.
 */
export const EXTRA_TITLES: Record<string, MessageDescriptor> = {
  '/all-outlets': msg`Semua outlet`,
  '/schedule': msg`Jadwal`,
  '/pin': msg`Pilih kasir`,
  '/shift/open': msg`Buka shift`,
  '/shift/close': msg`Tutup shift`,
  '/onboarding': msg`Pengaturan awal`,
  '/menu/labels': msg`Label Barcode`,
  '/menu/price-categories': msg`Kategori harga`,
  '/reports/margin': msg`Margin`,
  '/reports/profit-loss': msg`Laba/Rugi`,
  '/reports/orders': msg`Pesanan`,
  '/reports/expenses': msg`Pengeluaran`,
  '/reports/other-income': msg`Pendapatan Lain`,
  '/reports/export': msg`Ekspor Akuntansi`,
};

/**
 * Longest path first. The sidebar lists a parent before its children, so a
 * naive first-match resolves /menu/categories to "Item Menu" (path '/menu');
 * sorting by specificity makes the child win instead.
 *
 * Kept free of the nav import on purpose: `app-shared.tsx` carries JSX icons,
 * and the edge-runtime test environment cannot parse `.tsx`. The caller passes
 * the nav entries in, which keeps this resolvable logic under test.
 */
export function buildEntries(navEntries: TitleEntry[]): TitleEntry[] {
  return [
    ...navEntries,
    ...Object.entries(EXTRA_TITLES).map(([path, title]) => ({ path, title })),
  ].sort((a, b) => b.path.length - a.path.length);
}

/** The entry owning `pathname`, or null when no route matches. Pure. */
export function pickTitle(entries: TitleEntry[], pathname: string): MessageDescriptor | null {
  const hit = entries.find((e) => pathname === e.path || pathname.startsWith(`${e.path}/`));
  return hit ? hit.title : null;
}
