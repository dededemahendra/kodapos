import { describe, expect, it } from 'vitest';
import { defaultAvatarUrl } from './avatar';

describe('defaultAvatarUrl', () => {
  it('builds a notionists URL from the seed', () => {
    expect(defaultAvatarUrl('abc')).toBe(
      'https://api.dicebear.com/9.x/notionists/svg?seed=abc'
    );
  });

  it('url-encodes the seed', () => {
    expect(defaultAvatarUrl('a b/c')).toContain('seed=a%20b%2Fc');
  });

  it('is deterministic and distinct per seed', () => {
    expect(defaultAvatarUrl('x')).toBe(defaultAvatarUrl('x'));
    expect(defaultAvatarUrl('x')).not.toBe(defaultAvatarUrl('y'));
  });
});
