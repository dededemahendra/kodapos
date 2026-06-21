import type { Locale } from '~/lib/locale';

/** A block of legal prose: a paragraph or a bulleted list. Plain data (no JSX)
 *  so each language's full document stays readable and reviewable in one file. */
export type LegalBlock = { type: 'p'; text: string } | { type: 'list'; items: string[] };

export interface LegalSection {
  /** Stable anchor id (locale-independent), used by the table of contents. */
  id: string;
  heading: string;
  body: LegalBlock[];
}

export interface LegalDoc {
  title: string;
  /** Human-readable "last updated" date for the active locale. */
  effectiveDate: string;
  /** Short lead paragraph shown under the title. */
  intro: string;
  sections: LegalSection[];
}

export type LegalContent = Record<Locale, LegalDoc>;
