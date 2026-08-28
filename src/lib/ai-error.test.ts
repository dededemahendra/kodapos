import { describe, expect, it } from 'vitest';
import { aiErrorMessage } from './ai-error';

describe('aiErrorMessage', () => {
  it('maps each code to its intended message', () => {
    const generic = aiErrorMessage('provider').id;
    // Codes that give the owner something specific to do.
    const actionable = [
      'not_configured',
      'rate_limited',
      'network',
      'unauthorized',
      'empty',
    ] as const;
    const ids = actionable.map((c) => aiErrorMessage(c).id);
    expect(new Set(ids).size).toBe(actionable.length);
    expect(ids).not.toContain(generic);
    // `bad_request` means the client sent something malformed — nothing the
    // owner can act on, so it deliberately shares the generic message.
    expect(aiErrorMessage('bad_request').id).toBe(generic);
    expect(aiErrorMessage(null).id).toBe(generic);
  });

  it('points an unconfigured owner at Integrations', () => {
    // Assert on `message`, not `i18n._(...)`: the macro generates hash ids, so
    // resolving through an empty catalog depends on Lingui's fallback rather
    // than on anything this function decides.
    expect(aiErrorMessage('not_configured').message).toMatch(/Integrasi/);
  });
});
