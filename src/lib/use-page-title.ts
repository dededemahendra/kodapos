import type { MessageDescriptor } from '@lingui/core';
import { useLingui } from '@lingui/react';
import { useEffect } from 'react';
import { i18n } from './i18n';
import { type Locale, normalizeLocale } from './locale';
import { pageTitle } from './seo';

/**
 * Resolves a title for `head()`, which runs outside React and so cannot use
 * `useLingui`.
 *
 * The module-level `i18n` is the correct source: it is activated to
 * DEFAULT_LOCALE at import, and nothing on the server ever switches it
 * (LocaleProvider's switch is a client-only effect). So this returns the very
 * locale the server renders the body in — resolving against the raw source text
 * instead would ship, say, an Indonesian <title> above an English <h1>. On the
 * client `head()` re-runs on navigation and picks up the reader's own locale.
 */
export function headTitle(title: MessageDescriptor): string {
  return i18n._(title);
}

/** The locale `head()` resolves against, for copy that lives as data rather
 * than in the message catalog. Same reasoning as {@link headTitle}. */
export function headLocale(): Locale {
  return normalizeLocale(i18n.locale);
}

/**
 * Titles the tab for a page that also ships a title from `head()`.
 *
 * `headTitle` covers the server render and client navigations, but `head()` does
 * not re-run when a reader flips the language toggle while staying on the page —
 * the tab would keep the old language while the body switched. This hook
 * re-resolves the title whenever the active locale changes.
 *
 * Takes a catalog message, or a plain string for copy that lives as data (the
 * feature pages, whose titles come from `src/content/marketing`) rather than in
 * the message catalog.
 *
 * Deliberately free of any nav import: the marketing routes call this, and
 * pulling `navLinks` in would drag the whole sidebar — icons included — into the
 * public bundle. `useAppDocumentTitle` is the nav-aware wrapper for app routes.
 */
export function usePageTitle(title: MessageDescriptor | string): void {
  const { i18n } = useLingui();
  // lingui's `i18n` is a stable object that `activate()` mutates in place, so
  // `i18n.locale` is the only dependency that actually changes when the reader
  // flips the language toggle. Biome cannot see that and calls it redundant.
  // biome-ignore lint/correctness/useExhaustiveDependencies: i18n.locale is the value that changes
  useEffect(() => {
    document.title = pageTitle(typeof title === 'string' ? title : i18n._(title));
  }, [title, i18n, i18n.locale]);
}
