// tests/scripts/shots-env.test.ts
import { describe, expect, it } from 'vitest';
import { assertShotsDeployment } from '../../scripts/lib/shots-env.mjs';

describe('assertShotsDeployment', () => {
  it('throws when no screenshot deployment is allowlisted', () => {
    expect(() =>
      assertShotsDeployment({ configured: 'dev:kodapos-123', allowed: undefined })
    ).toThrow(/SHOTS_CONVEX_DEPLOYMENT/);
  });

  it('throws when the allowlist is an empty string', () => {
    expect(() => assertShotsDeployment({ configured: 'dev:kodapos-123', allowed: '   ' })).toThrow(
      /SHOTS_CONVEX_DEPLOYMENT/
    );
  });

  it('throws when the configured deployment differs from the allowlisted one', () => {
    expect(() =>
      assertShotsDeployment({ configured: 'dev:kodapos-123', allowed: 'dev:kodapos-shots-999' })
    ).toThrow(/refusing to seed/i);
  });

  it('names both deployments in the mismatch error so the operator can see what went wrong', () => {
    expect(() =>
      assertShotsDeployment({ configured: 'dev:kodapos-123', allowed: 'dev:kodapos-shots-999' })
    ).toThrow(/dev:kodapos-123[\s\S]*dev:kodapos-shots-999/);
  });

  it('throws when CONVEX_DEPLOYMENT is unset, rather than silently passing', () => {
    expect(() =>
      assertShotsDeployment({ configured: undefined, allowed: 'dev:kodapos-shots-999' })
    ).toThrow(/CONVEX_DEPLOYMENT/);
  });

  it('passes when the configured deployment matches the allowlist exactly', () => {
    expect(() =>
      assertShotsDeployment({
        configured: 'dev:kodapos-shots-999',
        allowed: 'dev:kodapos-shots-999',
      })
    ).not.toThrow();
  });
});
