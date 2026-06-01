import { describe, expect, it } from 'vitest';
import { toCSV } from './csv';

const cols = [
  { key: 'name', header: 'Nama' },
  { key: 'qty', header: 'Jumlah' },
];

describe('toCSV', () => {
  it('emits a header row then data rows', () => {
    expect(toCSV([{ name: 'Espresso', qty: 3 }], cols)).toBe('Nama,Jumlah\nEspresso,3');
  });
  it('escapes fields containing comma, quote, or newline', () => {
    expect(toCSV([{ name: 'A,"B"\nC', qty: 1 }], cols)).toBe('Nama,Jumlah\n"A,""B""\nC",1');
  });
  it('header-only when there are no rows', () => {
    expect(toCSV([], cols)).toBe('Nama,Jumlah');
  });
  it('renders nullish as empty', () => {
    expect(toCSV([{ name: undefined as unknown as string, qty: 0 }], cols)).toBe('Nama,Jumlah\n,0');
  });
});
