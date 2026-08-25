import { useLingui } from '@lingui/react';
import { useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import { navLinks } from '~/components/app-shared';
import { buildEntries, pickTitle, TITLE_SUFFIX } from './document-title';

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
  useEffect(() => {
    const title = pickTitle(ENTRIES, pathname);
    document.title = title ? `${i18n._(title)}, ${TITLE_SUFFIX}` : TITLE_SUFFIX;
  }, [pathname, i18n, i18n.locale]);
}
