/**
 * Centralized SEO metadata for public pages. `seo()` returns the `meta` + `links`
 * a route's `head()` merges in: title, description, canonical URL, Open Graph,
 * and Twitter Card. Absolute URLs are built from SITE_URL.
 *
 * NOTE: SITE_URL must match the production domain for canonical/og:url to be
 * correct. Update it here (and public/robots.txt + public/sitemap.xml) if the
 * domain changes.
 */
export const SITE_URL = 'https://kodapos.app';
export const SITE_NAME = 'kodapos';
export const DEFAULT_DESCRIPTION =
  'Satu aplikasi untuk kasir, stok, dan laporan. Jual lebih cepat, jaga margin, dan ambil keputusan dengan bantuan AI.';

/**
 * Separator between a page name and the brand. An en dash rather than a comma:
 * a comma reads as a list fragment, and a tab truncated mid-title ("Dasbor, k…")
 * looks like a typo instead of a shortened title.
 */
export const TITLE_SEPARATOR = ' – ';

/**
 * The one place a browser-tab title is composed: `Page – kodapos`. Both entry
 * points route through it — `seo()`/`privatePage()` for titles that ship in the
 * SSR head, and `useAppDocumentTitle` for the authenticated pages that set
 * `document.title` client-side — so the two cannot drift apart. Callers pass the
 * page name alone and never repeat the brand.
 */
export function pageTitle(page: string): string {
  return `${page}${TITLE_SEPARATOR}${SITE_NAME}`;
}

const OG_IMAGE = `${SITE_URL}/og-image.png`;

export interface SeoOptions {
  /** The page name ALONE. `seo()` appends the brand; do not repeat it here. */
  title: string;
  description?: string;
  /** Path including the leading slash, e.g. '/terms'. Defaults to '/'. */
  path?: string;
  /** Keep the page out of search results (e.g. auth pages). */
  noindex?: boolean;
}

export function seo({ title, description = DEFAULT_DESCRIPTION, path = '/', noindex }: SeoOptions) {
  const url = `${SITE_URL}${path}`;
  const fullTitle = pageTitle(title);
  return {
    meta: [
      { title: fullTitle },
      { name: 'description', content: description },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: SITE_NAME },
      { property: 'og:locale', content: 'id_ID' },
      { property: 'og:title', content: fullTitle },
      { property: 'og:description', content: description },
      { property: 'og:url', content: url },
      { property: 'og:image', content: OG_IMAGE },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: fullTitle },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: OG_IMAGE },
      ...(noindex ? [{ name: 'robots', content: 'noindex, nofollow' }] : []),
    ],
    links: [{ rel: 'canonical', href: url }],
  };
}

/**
 * Head for a page that is not a search destination: the customer order page, the
 * secondary screens, the admin app. Title + `noindex` only — no canonical or
 * Open Graph, because there is no public URL worth pointing them at (the order
 * page's URL carries a per-order token, and the screens are cafe hardware).
 */
export function privatePage(title: string) {
  return {
    meta: [{ title: pageTitle(title) }, { name: 'robots', content: 'noindex, nofollow' }],
  };
}

/** One crumb in a breadcrumb trail: display name and path (leading slash). */
export interface BreadcrumbItem {
  name: string;
  path: string;
}

/** Structured data for a breadcrumb trail. Positions are 1-indexed per the
 * schema.org convention; `item` URLs are built absolute from SITE_URL. */
export function breadcrumbJsonLd(trail: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: `${SITE_URL}${crumb.path}`,
    })),
  };
}

/** One question/answer pair for FAQ structured data. */
export interface FaqItem {
  q: string;
  a: string;
}

export interface FaqJsonLd {
  '@context': 'https://schema.org';
  '@type': 'FAQPage';
  mainEntity: {
    '@type': 'Question';
    name: string;
    acceptedAnswer: { '@type': 'Answer'; text: string };
  }[];
}

/**
 * Structured data for an FAQPage. Returns null for an empty list so callers
 * render no script tag rather than an empty FAQPage (search engines treat
 * FAQ markup that doesn't match visible page text as a policy violation, so
 * callers must build `items` from the same content the page renders).
 *
 * Overloaded so a statically non-empty array (the common case — items built
 * from a page's own content block) narrows to a non-null return, while a
 * plain `FaqItem[]` (length unknown until runtime) keeps the `| null`.
 */
export function faqJsonLd(items: [FaqItem, ...FaqItem[]]): FaqJsonLd;
export function faqJsonLd(items: FaqItem[]): FaqJsonLd | null;
export function faqJsonLd(items: FaqItem[]): FaqJsonLd | null {
  if (items.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}

/** Structured data for the homepage (Organization + WebSite + the product). */
export const HOMEPAGE_JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/logo.svg`,
      email: 'contact@kodapos.app',
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      inLanguage: 'id-ID',
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
    {
      '@type': 'SoftwareApplication',
      name: SITE_NAME,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: SITE_URL,
      description: DEFAULT_DESCRIPTION,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'IDR' },
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
  ],
};
