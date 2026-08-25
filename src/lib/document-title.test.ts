import { msg } from '@lingui/core/macro';
import { describe, expect, it } from 'vitest';
import { buildEntries, EXTRA_TITLES, pickTitle } from './document-title';

// Mirrors the real sidebar shape: a parent path listed BEFORE its children,
// which is what makes naive first-match resolution wrong.
const DASHBOARD = { path: '/dashboard', title: msg`Dasbor` };
const MENU = { path: '/menu', title: msg`Item Menu` };
const CATEGORIES = { path: '/menu/categories', title: msg`Kategori` };
const REPORTS = { path: '/reports', title: msg`Ringkasan` };
const SALES = { path: '/reports/sales', title: msg`Penjualan` };

const NAV = [DASHBOARD, MENU, CATEGORIES, REPORTS, SALES];

const entries = buildEntries(NAV);

describe('pickTitle', () => {
  it('resolves a top-level route', () => {
    expect(pickTitle(entries, '/dashboard')).toBe(DASHBOARD.title);
  });

  it('prefers the most specific route over its parent prefix', () => {
    // First-match would return "Item Menu" here, mislabelling the categories tab.
    expect(pickTitle(entries, '/menu/categories')).toBe(CATEGORIES.title);
    expect(pickTitle(entries, '/menu')).toBe(MENU.title);
  });

  it('matches nested paths under a nav entry', () => {
    expect(pickTitle(entries, '/menu/items/abc123')).toBe(MENU.title);
  });

  it('does not let a sidebar parent swallow a route from EXTRA_TITLES', () => {
    // /reports is in the sidebar; /reports/margin is only a tab. The tab must win.
    expect(pickTitle(entries, '/reports/margin')).toBe(EXTRA_TITLES['/reports/margin']);
    expect(pickTitle(entries, '/reports')).toBe(REPORTS.title);
  });

  it('returns null for an unknown route so the caller falls back to the bare brand', () => {
    expect(pickTitle(entries, '/nope')).toBeNull();
  });
});

describe('EXTRA_TITLES', () => {
  it('covers every app route that has no sidebar entry', () => {
    for (const p of [
      '/all-outlets',
      '/schedule',
      '/pin',
      '/shift/open',
      '/shift/close',
      '/onboarding',
      '/menu/labels',
      '/reports/margin',
      '/reports/profit-loss',
      '/reports/orders',
      '/reports/expenses',
      '/reports/other-income',
      '/reports/export',
    ]) {
      expect(pickTitle(entries, p), p).not.toBeNull();
    }
  });

  it('resolves wizard sub-steps through their prefix', () => {
    expect(pickTitle(entries, '/onboarding/profile')).toBe(EXTRA_TITLES['/onboarding']);
  });
});
