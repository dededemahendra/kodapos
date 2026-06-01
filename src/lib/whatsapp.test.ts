import { describe, expect, it } from 'vitest';
import { formatRestockText, waUrl } from './whatsapp';

describe('formatRestockText', () => {
  it('formats a Bahasa shopping list', () => {
    const text = formatRestockText('Kopi Senja', [
      { name: 'Susu', qty: 4, unit: 'ml' },
      { name: 'Biji kopi', qty: 3, unit: 'g' },
    ]);
    expect(text).toBe('Daftar Belanja — Kopi Senja\n- Susu: 4 ml\n- Biji kopi: 3 g');
  });
  it('header only when no lines', () => {
    expect(formatRestockText('Kopi Senja', [])).toBe('Daftar Belanja — Kopi Senja');
  });
});

describe('waUrl', () => {
  it('normalizes the phone and encodes the text', () => {
    expect(waUrl('0812-345', 'Halo dunia')).toBe('https://wa.me/62812345?text=Halo%20dunia');
  });
});
