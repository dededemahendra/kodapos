import { describe, expect, it } from 'vitest';
import { aiErrorMessage } from './ai-error';

describe('aiErrorMessage', () => {
  it('returns a distinct message per code', () => {
    const codes = [
      'unauthorized',
      'bad_request',
      'not_configured',
      'rate_limited',
      'provider',
      'network',
      'empty',
    ] as const;
    const ids = codes.map((c) => aiErrorMessage(c).id);
    expect(new Set(ids).size).toBeGreaterThan(1);
    for (const id of ids) expect(typeof id).toBe('string');
  });

  it('points an unconfigured owner at Integrations', () => {
    // Assert on `message`, not `i18n._(...)`: the macro generates hash ids, so
    // resolving through an empty catalog depends on Lingui's fallback rather
    // than on anything this function decides.
    expect(aiErrorMessage('not_configured').message).toMatch(/Integrasi/);
  });

  it('falls back to the generic message for null', () => {
    expect(aiErrorMessage(null).id).toBe(aiErrorMessage('provider').id);
  });
});
