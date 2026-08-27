import { describe, expect, it } from 'vitest';
import { toConvexSiteUrl } from './convex-site';

describe('toConvexSiteUrl', () => {
  it('maps a cloud deployment URL to its site URL', () => {
    expect(toConvexSiteUrl('https://happy-otter-123.convex.cloud')).toBe(
      'https://happy-otter-123.convex.site'
    );
  });

  it('strips a trailing slash', () => {
    expect(toConvexSiteUrl('https://happy-otter-123.convex.cloud/')).toBe(
      'https://happy-otter-123.convex.site'
    );
  });

  it('leaves an unrecognized host alone', () => {
    expect(toConvexSiteUrl('http://127.0.0.1:3210')).toBe('http://127.0.0.1:3210');
  });
});
