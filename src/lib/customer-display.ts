// Cross-window sync channel for the customer-facing display. The register
// publishes a snapshot of the live cart to localStorage; a second `/display`
// window (dragged to a 2nd monitor of the same till) reads the retained
// snapshot on open and listens for the cross-window `storage` event to mirror
// every cart change live. Mirrors the active-cashier localStorage pattern.

export type DisplayLine = {
  name: string;
  variantName?: string;
  qty: number;
  lineTotalIDR: number;
};

// null = idle/cleared (no active cart). The display falls back to its welcome
// state when the payload is null or has no lines.
export type DisplayPayload = {
  lines: DisplayLine[];
  subtotalIDR: number;
  discountIDR: number;
  serviceChargeIDR: number;
  taxIDR: number;
  totalIDR: number;
  promoName?: string;
} | null;

const KEY = 'kodapos.customerDisplay';

export function publishDisplay(payload: DisplayPayload): void {
  if (typeof window === 'undefined') return;
  // The `storage` event fires only in the OTHER window, which is exactly the
  // display window we want to update. Same-window updates are not needed.
  window.localStorage.setItem(KEY, JSON.stringify(payload));
}

export function readDisplay(): DisplayPayload {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DisplayPayload;
  } catch {
    return null;
  }
}

export function subscribeDisplay(cb: (p: DisplayPayload) => void): () => void {
  function onStorage(e: StorageEvent): void {
    if (e.key === KEY) cb(readDisplay());
  }
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}
