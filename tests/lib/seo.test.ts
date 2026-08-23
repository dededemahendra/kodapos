import { describe, expect, it } from 'vitest';
import { SITE_URL, breadcrumbJsonLd, faqJsonLd } from '../../src/lib/seo';

describe('breadcrumbJsonLd', () => {
  it('numbers positions from 1 and builds absolute urls', () => {
    const ld = breadcrumbJsonLd([
      { name: 'Fitur', path: '/fitur' },
      { name: 'Pesanan', path: '/fitur/pesanan' },
    ]);
    expect(ld['@type']).toBe('BreadcrumbList');
    expect(ld.itemListElement).toHaveLength(2);
    expect(ld.itemListElement[0]).toMatchObject({ position: 1, item: `${SITE_URL}/fitur` });
    expect(ld.itemListElement[1]).toMatchObject({ position: 2, item: `${SITE_URL}/fitur/pesanan` });
  });
});

describe('faqJsonLd', () => {
  it('emits one Question per item with its answer text', () => {
    const ld = faqJsonLd([{ q: 'Perlu alat khusus?', a: 'Tidak.' }]);
    expect(ld['@type']).toBe('FAQPage');
    expect(ld.mainEntity[0]).toMatchObject({
      '@type': 'Question',
      name: 'Perlu alat khusus?',
      acceptedAnswer: { '@type': 'Answer', text: 'Tidak.' },
    });
  });

  it('returns null for an empty list so callers render no script tag', () => {
    expect(faqJsonLd([])).toBeNull();
  });
});
