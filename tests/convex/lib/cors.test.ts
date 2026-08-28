import { describe, expect, it } from 'vitest';
import { isAllowedOrigin } from '../../../convex/lib/cors';

describe('isAllowedOrigin', () => {
  it('allows the configured site origin', () => {
    expect(isAllowedOrigin('https://kodapos.app', 'https://kodapos.app')).toBe(true);
  });

  it('ignores a trailing slash on the configured value', () => {
    expect(isAllowedOrigin('https://kodapos.app', 'https://kodapos.app/')).toBe(true);
  });

  it('allows localhost on any port for local development', () => {
    expect(isAllowedOrigin('http://localhost:3000', 'https://kodapos.app')).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:5173', 'https://kodapos.app')).toBe(true);
  });

  it('rejects a different origin', () => {
    expect(isAllowedOrigin('https://evil.example', 'https://kodapos.app')).toBe(false);
  });

  it('rejects an origin that merely starts with the site origin', () => {
    expect(isAllowedOrigin('https://kodapos.app.evil.example', 'https://kodapos.app')).toBe(false);
  });

  it('rejects a null origin', () => {
    expect(isAllowedOrigin(null, 'https://kodapos.app')).toBe(false);
  });

  it('still allows localhost when SITE_URL is unset', () => {
    expect(isAllowedOrigin('http://localhost:3000', undefined)).toBe(true);
    expect(isAllowedOrigin('https://kodapos.app', undefined)).toBe(false);
  });
});
