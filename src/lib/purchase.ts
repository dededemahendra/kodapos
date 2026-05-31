// Purchase grand total: Σ qty × unitCostIDR. qty and unitCostIDR are integers
// (validated at entry + in the mutation), so the result is integer rupiah.
// Reused for the form's live total and matches the backend's stored totalIDR.
export function purchaseTotalIDR(
  lines: { qty: number; unitCostIDR: number }[]
): number {
  return lines.reduce((sum, l) => sum + l.qty * l.unitCostIDR, 0);
}
