import { describe, expect, it } from 'vitest';
import { moveId } from './reorder';

describe('moveId', () => {
  it('moves an id to the position of another id', () => {
    expect(moveId(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
    expect(moveId(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a']);
  });

  it('returns the same array reference when active === over', () => {
    const ids = ['a', 'b', 'c'];
    expect(moveId(ids, 'b', 'b')).toBe(ids);
  });

  it('returns the same array reference when an id is missing', () => {
    const ids = ['a', 'b', 'c'];
    expect(moveId(ids, 'x', 'a')).toBe(ids);
  });
});
