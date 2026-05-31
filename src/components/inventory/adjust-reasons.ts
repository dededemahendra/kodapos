// The fixed set of stock-adjustment reasons (raw DB values; translated for
// display at the call site). Shared by the adjust dialog and the adjustments
// log filter so they never drift.
export const ADJUST_REASONS = ['Pengiriman masuk', 'Stok opname', 'Koreksi'] as const;

export type AdjustReason = (typeof ADJUST_REASONS)[number];
