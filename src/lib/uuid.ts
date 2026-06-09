/** Client-side UUID for order idempotency; falls back when crypto.randomUUID is absent. */
export function genUUID(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
