import { describe, expect, it } from 'vitest';
import { tableViewState } from './data-table-state';

describe('tableViewState', () => {
  it('is "loading" when data is undefined', () => {
    expect(tableViewState(undefined)).toBe('loading');
  });

  it('is "empty" when data is an empty array', () => {
    expect(tableViewState([])).toBe('empty');
  });

  it('is "data" when data has rows', () => {
    expect(tableViewState([{ id: 1 }])).toBe('data');
  });
});
