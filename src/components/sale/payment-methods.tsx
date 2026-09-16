import { Trans } from '@lingui/react/macro';
import type { ReactNode } from 'react';

export type PaymentMethod = 'cash' | 'qris_static' | 'qris_dynamic';

type SettingsShape = {
  payment: { methods: { cash: boolean; qrisStatic: boolean } };
  qrisImageUrl?: string;
  integrations: Array<{ key: string; connected: boolean }>;
};

export type PaymentMethodEntry = {
  method: PaymentMethod;
  label: ReactNode;
  isReady: (s: SettingsShape) => boolean;
};

export const PAYMENT_METHODS: PaymentMethodEntry[] = [
  { method: 'cash', label: <Trans>Tunai</Trans>, isReady: (s) => s.payment.methods.cash },
  {
    method: 'qris_static',
    label: <Trans>QRIS</Trans>,
    isReady: (s) => s.payment.methods.qrisStatic && Boolean(s.qrisImageUrl),
  },
  {
    method: 'qris_dynamic',
    label: <Trans>QRIS</Trans>,
    isReady: (s) => s.integrations.some((i) => i.key === 'qris' && i.connected),
  },
];

export function methodLabel(method: PaymentMethod): ReactNode {
  return PAYMENT_METHODS.find((m) => m.method === method)?.label ?? method;
}

/**
 * Whether a method can be completed with no network at all.
 *
 * Only cash can: the customer hands over money and the till owes them a
 * receipt, nothing has to be confirmed anywhere else. Dynamic QRIS needs the
 * provider to issue and settle the code. STATIC QRIS is excluded too even
 * though its QR is just a printed image — the payment cannot be CONFIRMED
 * offline, so the till would be recording money it has no way of knowing
 * arrived. Gift cards need their balance read and debited server-side.
 */
export function isOfflineCapable(method: PaymentMethod): boolean {
  return method === 'cash';
}

/**
 * The methods to actually show. Offline-incapable methods are REMOVED, never
 * merely disabled: a greyed-out button in the middle of a rush invites a
 * cashier to keep tapping it, and every tap is a second the customer is
 * waiting on a payment that can never complete.
 */
export function methodsForConnection(
  methods: PaymentMethod[],
  connection: 'online' | 'offline'
): PaymentMethod[] {
  return connection === 'offline' ? methods.filter(isOfflineCapable) : methods;
}
