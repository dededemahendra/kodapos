/** Normalize an Indonesian phone to a wa.me-friendly digit string.
 *  Leading 0 → 62; an existing 62 prefix is kept; otherwise digits as-is. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  return digits;
}
