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

const OG_IMAGE = `${SITE_URL}/og-image.png`;

export interface SeoOptions {
  title: string;
  description?: string;
  /** Path including the leading slash, e.g. '/terms'. Defaults to '/'. */
  path?: string;
  /** Keep the page out of search results (e.g. auth pages). */
  noindex?: boolean;
}

export function seo({
  title,
  description = DEFAULT_DESCRIPTION,
  path = '/',
  noindex,
}: SeoOptions) {
  const url = `${SITE_URL}${path}`;
  return {
    meta: [
      { title },
      { name: 'description', content: description },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: SITE_NAME },
      { property: 'og:locale', content: 'id_ID' },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: url },
      { property: 'og:image', content: OG_IMAGE },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: OG_IMAGE },
      ...(noindex ? [{ name: 'robots', content: 'noindex, nofollow' }] : []),
    ],
    links: [{ rel: 'canonical', href: url }],
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
