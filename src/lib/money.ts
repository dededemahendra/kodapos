const FORMATTER = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

export function formatIDR(amount: number): string {
  if (!Number.isInteger(amount)) {
    throw new Error(`formatIDR requires an integer, got ${amount}`);
  }
  return FORMATTER.format(amount).replace(/^Rp\s?/, 'Rp ');
}

export function parseIDR(input: string): number {
  const cleaned = input.replace(/[Rp\s.]/g, '');
  if (!/^\d+$/.test(cleaned)) {
    throw new Error(`parseIDR could not parse: ${JSON.stringify(input)}`);
  }
  return Number.parseInt(cleaned, 10);
}

export function computeChange(params: { totalIDR: number; tenderedIDR: number }): number {
  const { totalIDR, tenderedIDR } = params;
  if (!Number.isInteger(totalIDR) || !Number.isInteger(tenderedIDR)) {
    throw new Error('computeChange requires integer IDR amounts');
  }
  if (tenderedIDR < totalIDR) {
    throw new Error('insufficient tender');
  }
  return tenderedIDR - totalIDR;
}
