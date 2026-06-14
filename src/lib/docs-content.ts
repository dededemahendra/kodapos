import type { Localized } from './localized';
import { DOCS_PART_1 } from './docs-content-1';
import { DOCS_PART_2 } from './docs-content-2';
import { DOCS_PART_3 } from './docs-content-3';

export type DocBlock =
  | { type: 'p'; text: Localized }
  | { type: 'ul'; items: Localized[] }
  | { type: 'steps'; items: Localized[] }
  | { type: 'note'; text: Localized };

export interface DocSection {
  heading: Localized;
  blocks: DocBlock[];
}

export type DocIcon =
  | 'start' | 'register' | 'payments' | 'void' | 'menu' | 'inventory'
  | 'customers' | 'promos' | 'tables' | 'staff' | 'reports' | 'settings';

export interface DocTopic {
  slug: string;
  icon: DocIcon;
  title: Localized;
  summary: Localized;     // one line
  sections: DocSection[];
}

/** Sidebar grouping for the docs nav (defines order + section labels). */
export interface DocGroup {
  label: Localized;
  slugs: string[];
}

export const DOC_GROUPS: DocGroup[] = [
  { label: { id: 'Mulai', en: 'Getting started' }, slugs: ['getting-started'] },
  {
    label: { id: 'Penjualan', en: 'Selling' },
    slugs: ['register', 'payments', 'void-refund'],
  },
  {
    label: { id: 'Katalog & stok', en: 'Catalog & inventory' },
    slugs: ['menu-recipes', 'inventory'],
  },
  {
    label: { id: 'Pelanggan', en: 'Customers' },
    slugs: ['customers-loyalty', 'promotions'],
  },
  {
    label: { id: 'Operasional', en: 'Operations' },
    slugs: ['tables-kitchen', 'staff-shifts'],
  },
  {
    label: { id: 'Analitik & pengaturan', en: 'Analytics & settings' },
    slugs: ['reports', 'settings'],
  },
];

/** Section anchor id, stable across locale (derived from the English heading). */
export function sectionId(slug: string, heading: Localized, index: number): string {
  const base = heading.en
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `${slug}-${base || index}`;
}

// Content is split across part files (authored separately) and assembled here in
// sidebar order. Part files import the DocTopic type from this module type-only,
// so there is no runtime import cycle.
export const DOCS: DocTopic[] = [...DOCS_PART_1, ...DOCS_PART_2, ...DOCS_PART_3];

/** Topic slugs in sidebar order, for prev/next paging. */
export const DOC_ORDER: string[] = DOC_GROUPS.flatMap((g) => g.slugs);
