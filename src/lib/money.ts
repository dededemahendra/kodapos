const FORMATTER = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

export function formatIDR(amount: number): string {
  // Display formatter: round to whole rupiah. Fractional inputs are legitimate
  // for aggregates (COGS, stock value = qty * unit cost, recipe cost), so we
  // round rather than throw. The integer invariant for order money is enforced
  // server-side (computeOrderTotals) and covered by tests.
  return FORMATTER.format(Math.round(amount)).replace(/^Rp\s?/, 'Rp ');
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
