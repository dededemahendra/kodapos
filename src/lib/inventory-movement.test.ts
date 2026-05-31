import { describe, expect, it } from 'vitest';
import { movementTypeVariant } from './inventory-movement';

describe('movementTypeVariant', () => {
  it('maps each movement reason to a StatusBadge variant', () => {
    expect(movementTypeVariant('sale')).toBe('muted');
    expect(movementTypeVariant('adjustment')).toBe('success');
    expect(movementTypeVariant('waste')).toBe('danger');
    expect(movementTypeVariant('purchase')).toBe('success');
  });
});
