// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SITE_URL } from '../../src/lib/seo';

const ROOT = resolve(__dirname, '../..');

// Public marketing routes that must be discoverable. Auth pages and token
// surfaces are deliberately absent — robots.txt disallows those.
const REQUIRED = ['/', '/terms', '/privacy', '/changelog', '/fitur', '/fitur/pesanan'];

describe('sitemap.xml', () => {
  const xml = readFileSync(resolve(ROOT, 'public/sitemap.xml'), 'utf-8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  for (const path of REQUIRED) {
    it(`lists ${path}`, () => {
      expect(locs).toContain(`${SITE_URL}${path === '/' ? '/' : path}`);
    });
  }

  it('lists no duplicates', () => {
    expect(new Set(locs).size).toBe(locs.length);
  });
});
