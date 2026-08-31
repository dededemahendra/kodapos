import { useLingui } from '@lingui/react';
import { useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import { navLinks } from '~/components/app-shared';
import { buildEntries, pickTitle } from './document-title';
import { pageTitle, SITE_NAME } from './seo';

const ENTRIES = buildEntries(
  navLinks.flatMap((item) => (item.path ? [{ path: item.path, title: item.title }] : []))
);

/**
 * Keeps `document.title` in step with the active route. Set here rather than in
 * each route's `head()` because these are authenticated, noindex pages: there is
 * no SEO reason for the title to sit in the SSR payload, and routing it through
 * the i18n catalog means the tab follows the language toggle, which a static
 * `head()` string cannot do.
 */
export function useAppDocumentTitle(): void {
  const { i18n } = useLingui();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // lingui's `i18n` is a stable object that `activate()` mutates in place, so
  // `i18n.locale` is the only dependency that actually changes when the reader
  // flips the language toggle. Biome cannot see that and calls it redundant.
  // biome-ignore lint/correctness/useExhaustiveDependencies: i18n.locale is the value that changes
  useEffect(() => {
    const title = pickTitle(ENTRIES, pathname);
    document.title = title ? pageTitle(i18n._(title)) : SITE_NAME;
  }, [pathname, i18n, i18n.locale]);
}
