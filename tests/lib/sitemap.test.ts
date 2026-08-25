// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SITE_URL } from '../../src/lib/seo';

const ROOT = resolve(__dirname, '../..');

// Public marketing routes that must be discoverable. Auth pages and token
// surfaces are deliberately absent — robots.txt disallows those.
const REQUIRED = ['/', '/terms', '/privacy', '/changelog'];

// Built, reachable by direct URL, but deliberately undiscoverable: the feature
// pages embed screenshots that have not been captured yet (public/shots/ is
// empty), so listing them would publish broken images. Move these back into
// REQUIRED once the shots exist — and drop the matching noindex in the route
// heads and the Disallow in public/robots.txt at the same time.
const UNPUBLISHED = ['/fitur', '/fitur/pesanan'];

describe('sitemap.xml', () => {
  const xml = readFileSync(resolve(ROOT, 'public/sitemap.xml'), 'utf-8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  for (const path of REQUIRED) {
    it(`lists ${path}`, () => {
      expect(locs).toContain(`${SITE_URL}${path === '/' ? '/' : path}`);
    });
  }

  for (const path of UNPUBLISHED) {
    it(`does not list ${path} while its screenshots are missing`, () => {
      expect(locs).not.toContain(`${SITE_URL}${path}`);
    });
  }

  it('lists no duplicates', () => {
    expect(new Set(locs).size).toBe(locs.length);
  });
});
